import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { NAVER_BLOG_TOPIC_LABELS } from '../naver-blog-topics';
import {
  GOLDEN_LOCAL_STAGE_LABEL,
  LOCAL_TARGET_PER_TOPIC,
  PICKED_TOPIC_MAX,
  SEED_DB_MIN_SEEDS,
  SEED_DB_REFRESH_MS,
  SEED_DB_URL,
  SITE_WORKFLOW_ARGS,
  blogTopicsForCategory,
  buildGoldenLocalStages,
  isSecretLine,
  judgeSeedDbPayload,
  judgeStageExit,
  nightlyTopics,
  pickLocalTopics,
  readStageLine,
  seedDbNeedsRefresh,
  workFiles,
} from '../golden-local-plan';

/**
 * 황금키워드를 이 PC 에서 사이트와 같은 네 단계로 찾는 계획표(2026-09-15, 상위호환 2단계).
 *
 * 사장님 결정 "사이트 스크립트를 그대로 앱에서" — 인자가 사이트 워크플로와 어긋나면 여기서 잡는다.
 * 줄 읽기는 실주행 로그(2026-09-15 4주제 71분)의 줄과 스크립트 원문으로 맞춘다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** 워크플로에서 스크립트 호출 한 덩어리(줄 끝 \ 로 이어진 줄)의 --인자 */
function workflowArgs(scriptName: string): Map<string, string> {
  const lines = read('.github/workflows/preemption-board.yml').split(/\r?\n/);
  const at = lines.findIndex((line) => line.includes(`node scripts/${scriptName}`));
  expect(at, `워크플로에 ${scriptName} 호출이 없다`).toBeGreaterThan(-1);
  const block = [lines[at]];
  for (let i = at; lines[i].trimEnd().endsWith('\\') && i + 1 < lines.length; i += 1) block.push(lines[i + 1]);
  const args = new Map<string, string>();
  for (const match of block.join(' ').matchAll(/--([A-Za-z]+)(?:=([^\s\\]+))?/g)) args.set(match[1], match[2] ?? '');
  return args;
}

describe('사이트 워크플로와 같은 인자', () => {
  it('후보 찾기 인자는 워크플로 값 그대로다', () => {
    const args = workflowArgs('preemption-candidates.js');
    for (const [key, value] of Object.entries(SITE_WORKFLOW_ARGS.candidates)) {
      expect(args.get(key), key).toBe(String(value));
    }
    const topics = String(args.get('topics')).split(',');
    expect(topics).toHaveLength(NAVER_BLOG_TOPIC_LABELS.length);
    expect(Number(args.get('targetTotal'))).toBe(SITE_WORKFLOW_ARGS.targetTotalPerTopic * topics.length);
  });

  it('후보 다듬기 · 자리 재기 인자도 워크플로 값 그대로다', () => {
    const trim = workflowArgs('trim-candidates.js');
    expect(trim.get('keep')).toBe(String(SITE_WORKFLOW_ARGS.trim.keep));
    expect(trim.get('boostKeep')).toBe(String(SITE_WORKFLOW_ARGS.trim.boostKeep));
    const batch = workflowArgs('preemption-board-batch.js');
    expect(batch.get('maxPerRun')).toBe(String(SITE_WORKFLOW_ARGS.batch.maxPerRun));
    expect(batch.has('withStructure')).toBe(true);
  });

  it('자리 재기 주제당 목표는 스크립트 기본값이다 — 사이트 회차 기본 4보다 많이 남긴다', () => {
    const matched = read('scripts/preemption-board-batch.js').match(/const DEFAULT_TARGET_PER_TOPIC = (\d+);/);
    expect(Number(matched?.[1])).toBe(LOCAL_TARGET_PER_TOPIC);
  });
});

describe('네 단계 계획', () => {
  const input = {
    scriptsDir: path.join('C:', 'app', 'scripts'),
    workDir: path.join('C:', 'user data', 'golden-local', 'work'),
    stateFile: path.join('C:', 'user data', 'golden-local', 'first-seen.json'),
    destFile: path.join('C:', 'user data', 'golden-local', 'published.json'),
    topics: ['인테리어·DIY', '건강·의학'],
  };

  it('후보 찾기 → 다듬기 → 자리 재기 → 싣기 순서로, 앞 단계 출력이 뒤 단계 입력이다', () => {
    const stages = buildGoldenLocalStages(input);
    const files = workFiles(input.workDir);
    expect(stages.map((stage) => stage.key)).toEqual(['candidates', 'trim', 'batch', 'publish']);
    expect(stages[0].args).toContain(`--out=${files.candidates}`);
    expect(stages[1].args).toEqual(expect.arrayContaining([`--in=${files.candidates}`, `--out=${files.trimmed}`]));
    expect(stages[2].args).toEqual(expect.arrayContaining([`--in=${files.trimmed}`, `--out=${files.board}`]));
    expect(stages[3].args).toEqual([`--in=${files.board}`, `--dest=${input.destFile}`]);
    for (const stage of stages) {
      expect(path.dirname(stage.script)).toBe(input.scriptsDir);
      expect(stage.label).toBe(GOLDEN_LOCAL_STAGE_LABEL[stage.key]);
      expect(fs.existsSync(path.join(root, 'scripts', path.basename(stage.script))), stage.script).toBe(true);
    }
  });

  it('자리 재기는 이 PC 크로미엄으로만 — 장부는 앱 폴더, 실시간 신호 · 샤드 · 시험 실행은 없다', () => {
    const stages = buildGoldenLocalStages(input);
    expect(stages[2].args).toEqual(expect.arrayContaining([
      '--fetcher=local', '--withStructure', `--state=${input.stateFile}`, `--targetPerTopic=${LOCAL_TARGET_PER_TOPIC}`,
    ]));
    const all = stages.flatMap((stage) => stage.args).join(' ');
    expect(all).not.toMatch(/--signals|--shard|--dryRun|brightdata/i);
    expect(stages[0].args).toContain('--topics=인테리어·DIY,건강·의학');
    expect(stages[0].args).toContain('--targetTotal=160');
  });

  it('주제가 없거나 쉼표가 들어 있으면 만들지 않는다', () => {
    expect(() => buildGoldenLocalStages({ ...input, topics: [] })).toThrow();
    expect(() => buildGoldenLocalStages({ ...input, topics: ['영화,드라마'] })).toThrow();
  });
});

describe('고른 주제', () => {
  it('카테고리에 맞는 블로그 주제를 고른다 — 카테고리가 비면 새벽 몫이다', () => {
    expect(blogTopicsForCategory('인테리어')).toContain('인테리어·DIY');
    expect(blogTopicsForCategory('')).toEqual([]);
    expect(pickLocalTopics({ category: '' }).error).toMatch(/카테고리/);
    expect(pickLocalTopics(null).error).toMatch(/카테고리/);
  });

  it('한 번에 최대 3주제 — 넘친 주제는 버리지 않고 알린다', () => {
    const five = NAVER_BLOG_TOPIC_LABELS.slice(0, 5);
    const pick = pickLocalTopics({ topics: [...five, five[0], '없는 주제'] });
    expect(pick.error).toBeNull();
    expect(pick.topics).toEqual(five.slice(0, PICKED_TOPIC_MAX));
    expect(pick.more).toEqual(five.slice(PICKED_TOPIC_MAX));
  });

  it('네이버 블로그 주제 이름이 아니면 거절한다', () => {
    expect(pickLocalTopics({ topics: ['없는 주제'] }).error).toMatch(/주제 이름/);
  });
});

describe('새벽 차례', () => {
  const labels = NAVER_BLOG_TOPIC_LABELS;

  it('3주제씩 돌고 끝에서 처음으로 이어진다', () => {
    expect(nightlyTopics(0)).toEqual({ topics: labels.slice(0, 3), nextCursor: 3 });
    expect(nightlyTopics(labels.length - 1)).toEqual({
      topics: [labels[labels.length - 1], labels[0], labels[1]],
      nextCursor: 2,
    });
  });

  it('차례를 이어 가면 모든 주제를 돈다', () => {
    const seen = new Set<string>();
    let cursor = 0;
    for (let i = 0; i < Math.ceil(labels.length / PICKED_TOPIC_MAX); i += 1) {
      const pick = nightlyTopics(cursor);
      pick.topics.forEach((topic) => seen.add(topic));
      cursor = pick.nextCursor;
    }
    expect(seen.size).toBe(labels.length);
  });

  it('망가진 차례 값도 범위 안으로 돌린다', () => {
    expect(nightlyTopics(-1).topics[0]).toBe(labels[labels.length - 1]);
    expect(nightlyTopics(Number.NaN).topics[0]).toBe(labels[0]);
  });
});

describe('단계가 끝난 이유', () => {
  it('0 이면 다음 단계로', () => {
    expect(judgeStageExit('candidates', 0)).toEqual({ next: 'continue', message: '' });
  });

  it('할 것이 없어 멈춘 코드는 실패가 아니다', () => {
    expect(judgeStageExit('batch', 3).next).toBe('stop-ok');
    expect(judgeStageExit('publish', 4).next).toBe('stop-ok');
  });

  it('키가 없으면 환경설정으로 안내한다', () => {
    const verdict = judgeStageExit('candidates', 2, '네이버 검색광고·오픈 API 자격증명이 필요합니다.');
    expect(verdict.next).toBe('stop-fail');
    expect(verdict.message).toMatch(/환경설정/);
  });

  it('그 밖의 코드는 실패 — 단계 이름과 코드와 마지막 오류 줄을 적는다', () => {
    expect(judgeStageExit('trim', 1, '실패: boom').message).toBe('후보 다듬기 단계가 실패했습니다(종료 코드 1). 실패: boom');
    expect(judgeStageExit('batch', null).next).toBe('stop-fail');
    expect(judgeStageExit('publish', 3).next).toBe('stop-fail');
  });

  it('스크립트의 종료 코드 · 문구와 맞다', () => {
    expect(read('scripts/preemption-candidates.js')).toContain("console.error('네이버 검색광고·오픈 API 자격증명이 필요합니다.');");
    expect(read('scripts/preemption-board-batch.js')).toMatch(/후보 전량이 탈락한다[\s\S]{0,400}process\.exit\(3\)/);
    expect(read('scripts/publish-preemption-board.js')).toMatch(/발행할 행이 없다[\s\S]{0,200}process\.exit\(4\)/);
  });
});

describe('진행 줄 읽기', () => {
  it('후보 찾기 주제 줄 — 실주행 로그 그대로', () => {
    const line = readStageLine('candidates', '  OK 인테리어·DIY        씨앗 396 → 완결 14262(조각 838·이탈 0 제외) → 수요통과 699(식음 30·부패 0·카드 7 제외) → 무료선별   2 제외 → 후보  80건  4235초');
    expect(line).toMatchObject({ stage: 'candidates', kind: 'topic', topic: '인테리어·DIY', count: 80 });
    expect(line?.text).toBe('인테리어·DIY — 씨앗 396개 · 문장 14262개에서 후보 80건 (71분)');
  });

  it('후보 · 다듬기 · 자리 · 싣기 요약 줄', () => {
    expect(readStageLine('candidates', '후보 342건 / 주제 15종 → C:/x/candidates.json')).toMatchObject({ kind: 'summary', count: 342, text: '후보 342건 · 주제 15종' });
    expect(readStageLine('trim', '후보 342 → 320건 (주제당 80)')).toMatchObject({ kind: 'summary', count: 320, text: '후보 342건을 320건으로 다듬었습니다' });
    expect(readStageLine('batch', '  [인테리어·DIY] 3/8건 — 황금비 2 · 확장 1  ← 목표 미달')).toMatchObject({
      kind: 'topic', topic: '인테리어·DIY', count: 3, target: 8, text: '인테리어·DIY — 3/8건 (황금비 2 · 확장 1 · 목표 미달)',
    });
    expect(readStageLine('batch', '검증 96건 → 통과 12 · 탈락 70 · 판정불가 10 · 수집실패 4 · 쇼핑 라우팅 0')).toMatchObject({ kind: 'summary', count: 12 });
    // 설치판 확인(2026-09-15) 실제 줄 — 세 말이 전부 쇼핑 쪽으로 넘어갔다. 넘긴 수가 빠지면 "통과 0 · 탈락 0" 만 남는다.
    expect(readStageLine('batch', '검증 3건 → 통과 0 · 탈락 0 · 판정불가 0 · 수집실패 0 · 쇼핑 라우팅 3')?.text)
      .toBe('자리 3건을 쟀습니다 — 통과 0 · 탈락 0 · 판정불가 0 · 못 읽음 0 · 쇼핑 쪽으로 넘김 3');
    expect(readStageLine('batch', '로컬 페치 — 페이지 190장 · 차단 0회 (브라이트데이터 0콜)')).toMatchObject({ kind: 'note' });
    expect(readStageLine('batch', '보드 저장: C:\\user data\\golden-local\\work\\board.json (12행 · 완주)')).toMatchObject({ kind: 'saved', count: 12 });
    expect(readStageLine('publish', '발행: C:\\user data\\golden-local\\published.json')).toMatchObject({ kind: 'saved', text: '이 PC 판에 실었습니다' });
  });

  it('모듈 로그 · 비밀값 줄 · 모르는 줄은 넘기지 않는다', () => {
    expect(readStageLine('candidates', '[NAVER-AUTOCOMPLETE] ✅ 최종 6개 반환')).toBeNull();
    expect(readStageLine('candidates', "  customerIdValue: '1234567'")).toBeNull();
    expect(readStageLine('batch', '  licenseLength: 40,')).toBeNull();
    expect(readStageLine('trim', 'BD 예상 소요 640건 (AI 브리핑 실측 포함 키워드당 2건)')).toBeNull();
    expect(isSecretLine('NAVER_SEARCH_AD_SECRET_KEY=abc')).toBe(true);
    expect(isSecretLine('후보 342건 / 주제 15종')).toBe(false);
  });

  it('개발자용 안내는 사용자 말로 바꾼다', () => {
    expect(readStageLine('candidates', '씨앗 창고: 50,687개 · 3.2일 전 (오래됨 — build-seed-db.js 로 갱신하세요) · 주제당 12개 사용')?.text)
      .toBe('씨앗 창고: 50,687개 · 3.2일 전 · 주제당 12개 사용');
    expect(readStageLine('candidates', '씨앗 창고 없음 — 기존 씨앗으로만 돕니다(node scripts/build-seed-db.js 로 만듭니다).')?.text)
      .toBe('씨앗 창고 없이 기본 씨앗으로 찾습니다');
    expect(readStageLine('candidates', '굶은 주제 4개 (보드 15행 미만) — 무료 선별 문턱을 정면 6건으로 올린다')?.text)
      .toBe('사이트 판에 15행이 안 되는 주제 4개 — 같은 제목 글 기준을 6개로 넓힙니다');
    expect(readStageLine('candidates', '승격 큐: 풀·서브 327 → 검색량 확보 105 → 승격 22건 (무료선별 0·식음 18·카드 6 제외, 주제당 ≤30)')?.text)
      .toBe('딸린 말에서 후보 22건을 더 올렸습니다');
  });

  it('줄 모양은 스크립트 원문과 같다', () => {
    const candidates = read('scripts/preemption-candidates.js');
    expect(candidates).toContain('console.log(`선점 후보 발굴 — ${topics.length}개 주제');
    expect(candidates).toContain("`  ${measured.length > 0 ? 'OK' : '00'} ${topic.padEnd(15)}`");
    expect(candidates).toContain('` 씨앗 ${String(expansionSeeds.size).padStart(3)} → 완결 ${String(phrases.size).padStart(4)}');
    expect(candidates).toContain('→ 후보 ${String(measured.length).padStart(3)}건  ${seconds}초`');
    expect(candidates).toContain('console.log(`후보 ${total}건 / 주제 ${Object.keys(byTopic).length}종 → ${outPath}`);');
    expect(candidates).toContain('console.log(`굶은 주제 ${starvedTopics.size}개 (보드 ${starvedFloor}행 미만) — 무료 선별 문턱을 정면 ${starvedFacing}건으로 올린다`);');
    expect(candidates).toContain("`${stale ? ' (오래됨 — build-seed-db.js 로 갱신하세요)' : ''}`");
    expect(read('scripts/trim-candidates.js')).toContain('console.log(`후보 ${before} → ${after}건');
    const batch = read('scripts/preemption-board-batch.js');
    expect(batch).toContain('console.log(`  [${topic}] ${outcome.rows.length}/${targetPerTopic}건 — ');
    expect(batch).toContain('console.log(`검증 ${stats.verified}건 → 통과 ${stats.passed} · 탈락 ${stats.rejected} · 판정불가 ${stats.undetermined} · 수집실패 ${stats.failed} · 쇼핑 라우팅 ${routed');
    expect(batch).toContain('console.log(`로컬 페치 — 페이지 ${st.calls}장 · 차단 ${st.blocked}회');
    expect(batch).toContain('console.log(`보드 저장: ${outPath} (${rows.length}행');
    expect(read('scripts/publish-preemption-board.js')).toContain('console.log(`\\n발행: ${dest}`);');
  });
});

describe('씨앗 창고 받기', () => {
  const seeds = Array.from({ length: SEED_DB_MIN_SEEDS }, (_, index) => ({ keyword: `씨앗${index}` }));

  it('씨앗 수와 만든 시각이 있어야 쓴다', () => {
    expect(judgeSeedDbPayload({ builtAt: '2026-09-12T00:00:00Z', seeds })).toMatchObject({ ok: true, seeds: SEED_DB_MIN_SEEDS });
    expect(judgeSeedDbPayload({ builtAt: '2026-09-12T00:00:00Z', seeds: seeds.slice(1) }).ok).toBe(false);
    expect(judgeSeedDbPayload({ seeds }).ok).toBe(false);
    expect(judgeSeedDbPayload('<html>').ok).toBe(false);
    expect(judgeSeedDbPayload([seeds]).ok).toBe(false);
  });

  it('하루에 한 번만 다시 받는다', () => {
    const now = Date.parse('2026-09-15T06:00:00Z');
    expect(seedDbNeedsRefresh(null, now)).toBe(true);
    expect(seedDbNeedsRefresh(now - SEED_DB_REFRESH_MS + 1000, now)).toBe(false);
    expect(seedDbNeedsRefresh(now - SEED_DB_REFRESH_MS, now)).toBe(true);
  });

  it('사이트 CI 가 만드는 그 파일을 받는다 — 레포의 data/seed-db.json', () => {
    expect(read('src/utils/seed-db.ts')).toContain("path.join(__dirname, '..', '..', 'data', 'seed-db.json')");
    expect(SEED_DB_URL).toBe('https://raw.githubusercontent.com/cd000242-sudo/leword-app/main/data/seed-db.json');
  });
});
