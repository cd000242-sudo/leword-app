import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 검색광고 일일 쿼터(계정당 25,000)를 CI 러너들이 나눠 쓴다 (2026-09-15).
 *
 * 거버너(searchad-quota-governor)의 장부는 러너의 os.tmpdir 에 있다. 러너마다 새 장부라 기본 상한
 * 22,000 을 **각자** 가진 셈이었다 — 황금 회차 하나가 샤드 4개 + 씨앗 + 발행 잡이고, 같은 날 글감 3회차·
 * 실검 3회차가 같은 계정을 두드린다. 아무도 합을 세지 않았다(적대 검증 2026-09-15). 사장님 PC 의 앱도
 * 같은 계정이라 CI 가 하루 쿼터를 다 쓰면 앱이 오후에 굶는다.
 *
 * 그래서 검색광고 키를 받는 잡마다 LEWORD_SEARCHAD_SOFT_CEILING 을 **잡 단위**로 준다(같은 잡의 스텝들은
 * 같은 러너·같은 장부를 쓴다). 여기서 잠그는 것:
 *   ① 키를 넘기는 잡은 빠짐없이 잡 env 에 상한을 갖는다 — 하나라도 빠지면 그 잡이 22,000 을 혼자 쓴다
 *   ② 키를 넘기는 워크플로가 새로 생기면 여기 표에 올라와야 한다 — 조용히 합에서 빠지지 않게
 *   ③ 최악의 하루(황금 회차가 있는 월·금) 합이 계정 한도에서 앱 몫을 뺀 값 안이다
 *   ④ 황금 발굴 샤드의 상한이 하드 스톱이 허용하는 요청 수와 맞물린다
 *
 * YAML 은 글자로 읽는다 — js-yaml 은 선언된 의존성이 아니다(electron-builder 를 타고 우연히 있을 뿐).
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const readWorkflow = (name: string) => fs.readFileSync(path.join(WORKFLOWS, name), 'utf8').replace(/\r\n/g, '\n');

const ACCOUNT_DAILY_LIMIT = 25_000;
/** 사장님 PC 의 앱(과 서버 워커가 같은 계정을 쓴다면 그것까지)이 CI 밖에서 쓰는 몫. */
const OUTSIDE_CI_RESERVE = 3_500;

/** 하루에 도는 회차 수 — 예약 틱은 회차마다 여러 개지만 먼저 도는 하나만 일한다(문지기). */
const ROUNDS_PER_DAY: Record<string, number> = {
  'preemption-board.yml': 1,   // 월·금 — 최악의 날 기준 1
  'topic-briefs.yml': 3,
  'issue-niche-board.yml': 3,
  'today-picks.yml': 1,
  'agent-worker.yml': 1,       // 수동 재보강 — 하루 한 번으로 본다
};

/** 키를 받지만 날마다 계정을 두드리지 않는 워크플로(이유를 적는다). */
const EXEMPT: Record<string, string> = {
  'mobile-release.yml': '수동 모바일 릴리즈 — 워크플로 env 로 빌드 게이트에 넘길 뿐, 날마다 도는 회차가 아니다',
};

interface Job { name: string; text: string }

/** 주석 줄을 버린다 — 주석에 키 이름이 적혀 있어도 오판하지 않게. */
function stripComments(workflow: string): string {
  return workflow.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

/** `jobs:` 아래 두 칸 들여쓴 잡 이름으로 자른다. */
function jobsOf(workflow: string): Job[] {
  const text = stripComments(workflow);
  const start = text.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const jobs: Job[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of text.slice(start).split('\n').slice(1)) {
    if (/^\S/.test(line)) break;   // 최상위 키 — jobs 블록 끝
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (current) jobs.push({ name: current.name, text: current.lines.join('\n') });
      current = { name: header[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) jobs.push({ name: current.name, text: current.lines.join('\n') });
  return jobs;
}

const passesSearchAdKey = (text: string) => /^\s+NAVER_SEARCH_AD_ACCESS_LICENSE:\s/m.test(text);

/** 잡 env(네 칸 `env:` 바로 아래 여섯 칸 키)의 상한. 스텝 env 에만 있으면 잡 전체를 못 덮으므로 0 으로 본다. */
function ceilingOf(job: Job): number {
  const block = /^ {4}env:\s*\n((?: {6}\S.*\n?)+)/m.exec(job.text);
  if (!block) return 0;
  const hit = /^ {6}LEWORD_SEARCHAD_SOFT_CEILING:\s*'?(\d+)'?\s*$/m.exec(block[1]);
  return hit ? Number(hit[1]) : 0;
}

/** matrix 조합 수 — 러너 수다. matrix 가 없으면 1. */
function runnersOf(job: Job): number {
  const matrix = /^ {6}matrix:\s*\n((?: {8}\S.*\n?)+)/m.exec(job.text);
  if (!matrix) return 1;
  return matrix[1].split('\n').reduce((n, line) => {
    const list = /^ {8}[A-Za-z0-9_-]+:\s*\[([^\]]*)\]/.exec(line);
    return list ? n * list[1].split(',').filter((x) => x.trim()).length : n;
  }, 1);
}

describe('검색광고 쿼터 — 잡마다 러너 상한이 있다', () => {
  it('키를 넘기는 워크플로는 전부 표에 있다 — 새 워크플로가 합에서 조용히 빠지지 않는다', () => {
    const passing = fs.readdirSync(WORKFLOWS)
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => passesSearchAdKey(stripComments(readWorkflow(f))));
    const unlisted = passing.filter((f) => !(f in ROUNDS_PER_DAY) && !(f in EXEMPT));
    expect(unlisted, '검색광고 키를 넘기는데 ROUNDS_PER_DAY·EXEMPT 어디에도 없다').toEqual([]);
    expect(passing.length).toBeGreaterThanOrEqual(Object.keys(ROUNDS_PER_DAY).length);
  });

  for (const name of Object.keys(ROUNDS_PER_DAY)) {
    it(`${name} — 키를 넘기는 잡은 모두 잡 env 에 LEWORD_SEARCHAD_SOFT_CEILING 이 있다`, () => {
      const jobs = jobsOf(readWorkflow(name)).filter((job) => passesSearchAdKey(job.text));
      expect(jobs.length, `${name} 에서 키를 넘기는 잡을 못 찾았다 — 파싱이 어긋났다`).toBeGreaterThan(0);
      const missing = jobs.filter((job) => ceilingOf(job) <= 0).map((job) => job.name);
      expect(missing, `${name} 의 이 잡들은 러너 하나가 22,000 을 혼자 쓴다`).toEqual([]);
    });
  }

  it('최악의 하루(황금 회차가 있는 월·금) 합이 계정 한도에서 CI 밖 몫을 뺀 값 안이다', () => {
    const perWorkflow: Record<string, number> = {};
    for (const [name, rounds] of Object.entries(ROUNDS_PER_DAY)) {
      const perRound = jobsOf(readWorkflow(name))
        .filter((job) => passesSearchAdKey(job.text))
        .reduce((sum, job) => sum + ceilingOf(job) * runnersOf(job), 0);
      perWorkflow[name] = perRound * rounds;
    }
    const total = Object.values(perWorkflow).reduce((a, b) => a + b, 0);
    expect(total, `하루 최악 합 ${total} — ${JSON.stringify(perWorkflow)}`).toBeLessThanOrEqual(ACCOUNT_DAILY_LIMIT - OUTSIDE_CI_RESERVE);
  });

  it('황금 발굴은 샤드 4개가 각자 상한을 갖는다 — matrix 를 러너 수로 센다', () => {
    const discover = jobsOf(readWorkflow('preemption-board.yml')).find((job) => job.name === 'discover')!;
    expect(runnersOf(discover)).toBe(4);
  });

  it('황금 발굴 샤드 상한은 하드 스톱이 허용하는 요청 수와 맞물린다 — 너무 낮으면 시간보다 먼저 막히고, 너무 높으면 있으나 마나', () => {
    const discover = jobsOf(readWorkflow('preemption-board.yml')).find((job) => job.name === 'discover')!;
    const hardStop = Number((/--hardStopMinutes=(\d+)/.exec(discover.text) || [])[1]);
    const intervalMs = Number((/LEWORD_SEARCHAD_MIN_INTERVAL_MS:\s*'?(\d+)'?/.exec(discover.text) || [])[1]);
    expect(hardStop).toBeGreaterThan(0);
    expect(intervalMs).toBeGreaterThan(0);
    const timeBound = Math.floor((hardStop * 60_000) / intervalMs);   // 대기열이 하드 스톱까지 내줄 수 있는 최대 요청 수
    const ceiling = ceilingOf(discover);
    expect(ceiling, `샤드 상한 ${ceiling} 이 시간 상한 ${timeBound} 의 60% 아래`).toBeGreaterThanOrEqual(Math.floor(timeBound * 0.6));
    expect(ceiling, `샤드 상한 ${ceiling} 이 시간 상한 ${timeBound} 보다 크다`).toBeLessThanOrEqual(timeBound);
  });
});
