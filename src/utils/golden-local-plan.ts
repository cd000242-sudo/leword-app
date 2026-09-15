/**
 * 황금키워드를 이 PC 에서 사이트와 같은 네 단계로 찾는 계획표 (2026-09-15, 상위호환 2단계).
 *
 * 사장님 "앱에 있는 황금키워드 발굴도 4개밖에 안 나와 사이트랑 많이 다른데 상위호환으로 발굴해줘야지".
 * 결정: "사이트 발굴 코드를 앱에서 직접" · "사이트 스크립트를 그대로 앱에서" · "사이트 창고 파일 받아 쓰기"
 *       · "고른 주제는 바로, 전체 주제는 새벽".
 *
 * 네 스크립트(후보 찾기 → 후보 다듬기 → 자리 재기 → 이 PC 판에 싣기)를 사이트 워크플로와 같은 인자로 부른다.
 * 앱에서 다른 것은 이것뿐이다.
 *   · 샤드가 없다 — 한 PC 가 고른 주제만 맡는다(한 번에 최대 3주제).
 *   · 자리 재기는 --fetcher=local — 이 PC 크로미엄으로 잰다. Bright Data 0.
 *   · 최초 관측 장부(--state)와 발행 파일(--dest)은 앱 데이터 폴더. 실시간 신호(--signals)는 넘기지 않는다
 *     — 없으면 스크립트가 그 조건을 근거로 쓰지 않는다.
 *   · 자리 재기의 주제당 목표는 스크립트 기본값 8 — 사이트 회차 기본 4보다 많이 남긴다. 관문 숫자는 그대로다.
 * 판정은 스크립트가 한다. 이 파일은 인자를 짜고, 끝난 이유를 읽고, 진행 줄을 알아보기만 한다.
 */
import * as path from 'path';
import { siteTopicInCategory } from './golden-site-merge';
import { NAVER_BLOG_TOPIC_LABELS } from './naver-blog-topics';

export const GOLDEN_LOCAL_PROGRESS_CHANNEL = 'golden-local-progress';
/** 앱이 이미 읽는 사이트 발행본(선점 보드 화면과 같은 주소). 굶은 주제 판정·승격에 쓴다 — 워크플로도 발행본을 넘긴다. */
export const SITE_BOARD_URL = 'https://leaderspro.kr/data/preemption-board.json';
/** 사이트 CI 가 만드는 씨앗 창고. 레포가 공개라 키 없이 받는다(사장님 "사이트 창고 파일 받아 쓰기"). */
export const SEED_DB_URL = 'https://raw.githubusercontent.com/cd000242-sudo/leword-app/main/data/seed-db.json';
export const SEED_DB_MIN_SEEDS = 1000;
export const SEED_DB_REFRESH_MS = 24 * 60 * 60 * 1000;

/** 사이트 워크플로(.github/workflows/preemption-board.yml)가 넘기는 값 그대로. 워크플로가 바뀌면 테스트가 잡는다. */
export const SITE_WORKFLOW_ARGS = Object.freeze({
  candidates: Object.freeze({
    perTopic: 80,
    perSeed: 10,
    sampleCap: 4000,
    scanWidth: 100,
    secondarySeeds: 20,
    deadlineMinutes: 120,
    hardStopMinutes: 195,
    promotedPerTopic: 30,
    starvedFloor: 15,
    starvedFacing: 6,
  }),
  /** 워크플로는 32주제에 --targetTotal=2560, 주제당 80행이다. 앱은 고른 주제 수에 곱한다. */
  targetTotalPerTopic: 80,
  trim: Object.freeze({ keep: 80, boostKeep: 100 }),
  batch: Object.freeze({ maxPerRun: 1200 }),
});

export const LOCAL_TARGET_PER_TOPIC = 8;
/**
 * 한 번에 도는 주제 상한. 실측(2026-09-15): 4주제를 한 번에 돌리면 후보 찾기만 71분(주제당 3,763~4,259초)이었다.
 * 그 뒤 자리 재기가 주제당 후보 80~100건을 이 PC 브라우저로 잰다. 나머지 주제는 새벽 차례로 돈다.
 */
export const PICKED_TOPIC_MAX = 3;

export type GoldenLocalStageKey = 'candidates' | 'trim' | 'batch' | 'publish';

export const GOLDEN_LOCAL_STAGE_LABEL: Readonly<Record<GoldenLocalStageKey, string>> = Object.freeze({
  candidates: '후보 찾기',
  trim: '후보 다듬기',
  batch: '자리 재기',
  publish: '이 PC 판에 싣기',
});

export interface GoldenLocalStage {
  key: GoldenLocalStageKey;
  label: string;
  /** 스크립트 절대 경로 */
  script: string;
  args: string[];
}

export interface GoldenLocalPlanInput {
  scriptsDir: string;
  /** 이번 회차 작업 파일(후보 · 다듬은 후보 · 판)을 두는 폴더 */
  workDir: string;
  /** 최초 관측 장부 — 회차가 바뀌어도 남는다 */
  stateFile: string;
  /** 이 PC 판 — 발행 스크립트가 이전 판을 읽어 90일 이월한다 */
  destFile: string;
  topics: readonly string[];
  boardUrl?: string;
}

export interface LocalTopicPick {
  topics: string[];
  /** 상한을 넘어 이번에 못 도는 주제 — 화면이 알린다(말없이 자르지 않는다) */
  more: string[];
  error: string | null;
}

export function workFiles(workDir: string): { candidates: string; trimmed: string; board: string } {
  return {
    candidates: path.join(workDir, 'candidates.json'),
    trimmed: path.join(workDir, 'candidates-trimmed.json'),
    board: path.join(workDir, 'board.json'),
  };
}

/** 발굴 화면 카테고리에 맞는 네이버 블로그 주제. 카테고리가 비면 빈 목록 — 전체 주제는 새벽 몫이다. */
export function blogTopicsForCategory(category: string | null | undefined): string[] {
  const wanted = String(category || '').trim();
  if (!wanted) return [];
  return NAVER_BLOG_TOPIC_LABELS.filter((label) => siteTopicInCategory(label, wanted));
}

/** 화면이 보낸 주제(또는 카테고리)를 검사하고 상한만큼 고른다. */
export function pickLocalTopics(input: { category?: unknown; topics?: unknown } | null | undefined): LocalTopicPick {
  const asked: unknown[] = input && Array.isArray(input.topics) ? input.topics : [];
  let pool: string[];
  if (asked.length > 0) {
    const known = new Set(NAVER_BLOG_TOPIC_LABELS);
    pool = [...new Set(asked.map((topic) => String(topic || '').trim()).filter((topic) => known.has(topic)))];
    if (pool.length === 0) return { topics: [], more: [], error: '네이버 블로그 주제 이름이 아닙니다.' };
  } else {
    const category = String((input && input.category) || '').trim();
    if (!category) return { topics: [], more: [], error: '카테고리를 먼저 골라 주세요. 전체 주제는 새벽에 차례로 찾습니다.' };
    pool = blogTopicsForCategory(category);
    if (pool.length === 0) return { topics: [], more: [], error: `'${category}' 와 맞는 네이버 블로그 주제가 없습니다.` };
  }
  return { topics: pool.slice(0, PICKED_TOPIC_MAX), more: pool.slice(PICKED_TOPIC_MAX), error: null };
}

/** 새벽 차례 — 32주제를 한 번에 PICKED_TOPIC_MAX 개씩 돈다. cursor 는 다음에 시작할 주제 번호다. */
export function nightlyTopics(cursor: number, count: number = PICKED_TOPIC_MAX): { topics: string[]; nextCursor: number } {
  const labels = NAVER_BLOG_TOPIC_LABELS;
  const total = labels.length;
  const start = ((Math.floor(Number(cursor) || 0) % total) + total) % total;
  const size = Math.max(1, Math.min(Math.floor(count) || 1, total));
  const topics = Array.from({ length: size }, (_, offset) => labels[(start + offset) % total]);
  return { topics, nextCursor: (start + size) % total };
}

export function buildGoldenLocalStages(input: GoldenLocalPlanInput): GoldenLocalStage[] {
  const topics = [...new Set(input.topics.map((topic) => String(topic || '').trim()).filter(Boolean))];
  if (topics.length === 0) throw new Error('찾을 주제가 없다');
  if (topics.some((topic) => topic.includes(','))) throw new Error('주제 이름에 쉼표가 있다 — --topics 가 쪼개진다');
  const c = SITE_WORKFLOW_ARGS.candidates;
  const files = workFiles(input.workDir);
  const script = (name: string) => path.join(input.scriptsDir, name);
  return [
    {
      key: 'candidates',
      label: GOLDEN_LOCAL_STAGE_LABEL.candidates,
      script: script('preemption-candidates.js'),
      args: [
        `--topics=${topics.join(',')}`,
        `--out=${files.candidates}`,
        `--perTopic=${c.perTopic}`,
        `--perSeed=${c.perSeed}`,
        `--sampleCap=${c.sampleCap}`,
        `--scanWidth=${c.scanWidth}`,
        `--secondarySeeds=${c.secondarySeeds}`,
        `--deadlineMinutes=${c.deadlineMinutes}`,
        `--hardStopMinutes=${c.hardStopMinutes}`,
        `--targetTotal=${SITE_WORKFLOW_ARGS.targetTotalPerTopic * topics.length}`,
        `--promotedPerTopic=${c.promotedPerTopic}`,
        `--starvedFloor=${c.starvedFloor}`,
        `--starvedFacing=${c.starvedFacing}`,
        `--board=${input.boardUrl || SITE_BOARD_URL}`,
      ],
    },
    {
      key: 'trim',
      label: GOLDEN_LOCAL_STAGE_LABEL.trim,
      script: script('trim-candidates.js'),
      args: [
        `--in=${files.candidates}`,
        `--out=${files.trimmed}`,
        `--keep=${SITE_WORKFLOW_ARGS.trim.keep}`,
        `--boostKeep=${SITE_WORKFLOW_ARGS.trim.boostKeep}`,
      ],
    },
    {
      key: 'batch',
      label: GOLDEN_LOCAL_STAGE_LABEL.batch,
      script: script('preemption-board-batch.js'),
      args: [
        `--in=${files.trimmed}`,
        `--out=${files.board}`,
        `--targetPerTopic=${LOCAL_TARGET_PER_TOPIC}`,
        `--maxPerRun=${SITE_WORKFLOW_ARGS.batch.maxPerRun}`,
        '--withStructure',
        '--fetcher=local',
        `--state=${input.stateFile}`,
      ],
    },
    {
      key: 'publish',
      label: GOLDEN_LOCAL_STAGE_LABEL.publish,
      script: script('publish-preemption-board.js'),
      args: [`--in=${files.board}`, `--dest=${input.destFile}`],
    },
  ];
}

export interface StageExitVerdict {
  next: 'continue' | 'stop-ok' | 'stop-fail';
  message: string;
}

/**
 * 단계가 끝난 코드를 읽는다. 스크립트가 "할 것이 없다"로 끝낸 코드는 실패가 아니다.
 *   자리 재기 3 — 검색량 조건만으로 후보 전량이 탈락(브라우저를 띄우지 않고 멈춘다)
 *   발행 4 — 발행할 행이 없다(기존 판을 그대로 둔다)
 */
export function judgeStageExit(key: GoldenLocalStageKey, code: number | null, lastError = ''): StageExitVerdict {
  if (code === 0) return { next: 'continue', message: '' };
  const label = GOLDEN_LOCAL_STAGE_LABEL[key];
  if (key === 'batch' && code === 3) {
    return { next: 'stop-ok', message: '자리를 잴 후보가 없었습니다 — 검색량 조건을 넘은 후보가 0건이라 이 PC 판은 그대로 둡니다.' };
  }
  if (key === 'publish' && code === 4) {
    return { next: 'stop-ok', message: '이번에 관문을 통과한 말이 없어 이 PC 판은 그대로 둡니다.' };
  }
  if (key === 'candidates' && /자격증명이 필요/.test(lastError)) {
    return {
      next: 'stop-fail',
      message: '네이버 검색광고 키와 오픈 API(Client ID) 키가 있어야 이 PC 에서 찾을 수 있습니다 — 환경설정에서 넣어 주세요.',
    };
  }
  if (code === null) return { next: 'stop-fail', message: `${label} 단계가 끝나지 못하고 멈췄습니다.${lastError ? ` ${lastError}` : ''}` };
  return { next: 'stop-fail', message: `${label} 단계가 실패했습니다(종료 코드 ${code}).${lastError ? ` ${lastError}` : ''}` };
}

export type GoldenLocalLineKind = 'topic' | 'summary' | 'note' | 'warn' | 'saved';

export interface GoldenLocalLine {
  stage: GoldenLocalStageKey;
  kind: GoldenLocalLineKind;
  text: string;
  topic?: string;
  count?: number;
  target?: number;
}

/** 설정 관리자는 키 길이·고객 번호를 찍는다. 이런 줄은 화면에도 기록에도 넘기지 않는다. */
const SECRET_HINT = /(customer\s*id|license|secret|api[\s_-]?key|token|password|비밀번호|키 길이)/i;

export function isSecretLine(line: string): boolean {
  return SECRET_HINT.test(String(line || ''));
}

function readCandidatesLine(line: string, make: LineMaker): GoldenLocalLine | null {
  const start = line.match(/^선점 후보 발굴 — (\d+)개 주제/);
  if (start) return make('note', `${start[1]}개 주제에서 후보를 찾기 시작했습니다`);
  const done = line.match(/^(?:OK|00) (\S+)\s+씨앗\s+(\d+) → 완결\s+(\d+).*후보\s+(\d+)건\s+(\d+)초$/);
  if (done) {
    const minutes = Math.max(1, Math.round(Number(done[5]) / 60));
    return make('topic', `${done[1]} — 씨앗 ${done[2]}개 · 문장 ${done[3]}개에서 후보 ${done[4]}건 (${minutes}분)`, {
      topic: done[1],
      count: Number(done[4]),
    });
  }
  const summary = line.match(/^후보 (\d+)건 \/ 주제 (\d+)종/);
  if (summary) return make('summary', `후보 ${summary[1]}건 · 주제 ${summary[2]}종`, { count: Number(summary[1]) });
  const starved = line.match(/^굶은 주제 (\d+)개 \(보드 (\d+)행 미만\) — 무료 선별 문턱을 정면 (\d+)건으로/);
  if (starved) return make('note', `사이트 판에 ${starved[2]}행이 안 되는 주제 ${starved[1]}개 — 같은 제목 글 기준을 ${starved[3]}개로 넓힙니다`);
  if (/^씨앗 창고 없음/.test(line)) return make('note', '씨앗 창고 없이 기본 씨앗으로 찾습니다');
  if (/^씨앗 창고: /.test(line)) return make('note', line.replace(/\s*\(오래됨[^)]*\)/, ''));
  const promoted = line.match(/^승격 큐: .*승격 (\d+)건/);
  if (promoted) return make('note', `딸린 말에서 후보 ${promoted[1]}건을 더 올렸습니다`);
  if (/^(⏱|!!|후보 0건 주제)/.test(line)) return make('warn', line.replace(/^(⏱|!!)\s*/, ''));
  return null;
}

function readBatchLine(line: string, make: LineMaker): GoldenLocalLine | null {
  const topic = line.match(/^\[(.+?)\] (\d+)\/(\d+)건 — (.*)$/);
  if (topic) {
    return make('topic', `${topic[1]} — ${topic[2]}/${topic[3]}건 (${topic[4].replace(/\s*←\s*/, ' · ')})`, {
      topic: topic[1],
      count: Number(topic[2]),
      target: Number(topic[3]),
    });
  }
  const verified = line.match(/^검증 (\d+)건 → 통과 (\d+) · 탈락 (\d+) · 판정불가 (\d+) · 수집실패 (\d+)(?: · 쇼핑 라우팅 (\d+))?/);
  if (verified) {
    // 쇼핑 결과가 자리를 차지한 말은 쇼핑 쪽으로 넘긴다(platform-lane). 이 수를 빼면 통과·탈락 합이 잰 수와 안 맞는다
    // — 설치판 확인(2026-09-15)에서 3건이 전부 넘어가 "통과 0 · 탈락 0" 만 보였다.
    const shopping = verified[6] ? ` · 쇼핑 쪽으로 넘김 ${verified[6]}` : '';
    return make('summary', `자리 ${verified[1]}건을 쟀습니다 — 통과 ${verified[2]} · 탈락 ${verified[3]} · 판정불가 ${verified[4]} · 못 읽음 ${verified[5]}${shopping}`, {
      count: Number(verified[2]),
    });
  }
  const pages = line.match(/^로컬 페치 — 페이지 (\d+)장 · 차단 (\d+)회/);
  if (pages) return make('note', `이 PC 브라우저로 검색 결과 ${pages[1]}장을 읽었습니다(막힘 ${pages[2]}회)`);
  const saved = line.match(/^보드 저장: .*\((\d+)행/);
  if (saved) return make('saved', `자리를 잰 판 ${saved[1]}행`, { count: Number(saved[1]) });
  if (/^후보 총\s+\d+건/.test(line)) return make('note', line.replace(/\s{2,}/g, ' '));
  if (/^\?\? \[/.test(line)) return make('warn', line.replace(/^\?\?\s*/, ''));
  if (/^⚠️ 통과 0건/.test(line)) return make('warn', '자리를 통과한 말이 0건입니다');
  return null;
}

type LineMaker = (kind: GoldenLocalLineKind, text: string, extra?: Partial<GoldenLocalLine>) => GoldenLocalLine;

/**
 * 스크립트 출력 한 줄을 화면에 보일 진행으로 읽는다. 모르는 줄은 null — 원문을 통째로 넘기지 않는다.
 * 줄 모양은 네 스크립트의 console.log 그대로다(테스트가 스크립트 원문과 맞춰 본다).
 */
export function readStageLine(stage: GoldenLocalStageKey, raw: string): GoldenLocalLine | null {
  const line = String(raw || '').trim();
  if (!line || isSecretLine(line) || /^\[[A-Za-z0-9_ -]+\]/.test(line)) return null;
  const make: LineMaker = (kind, text, extra = {}) => ({ ...extra, stage, kind, text });
  if (stage === 'candidates') return readCandidatesLine(line, make);
  if (stage === 'batch') return readBatchLine(line, make);
  if (stage === 'trim') {
    const trimmed = line.match(/^후보 (\d+) → (\d+)건/);
    return trimmed ? make('summary', `후보 ${trimmed[1]}건을 ${trimmed[2]}건으로 다듬었습니다`, { count: Number(trimmed[2]) }) : null;
  }
  if (/^발행: /.test(line)) return make('saved', '이 PC 판에 실었습니다');
  if (/^선점 적기\s+\d+행/.test(line)) return make('note', line.replace(/\s{2,}/g, ' '));
  const gate = line.match(/^게이트\s+(\d+) → (\d+)행 \((.*)\)$/);
  if (gate) return make('summary', `발행 규칙 ${gate[1]}행 → ${gate[2]}행${describeGateDrops(gate[3])}`, { count: Number(gate[2]) });
  return null;
}

/**
 * 발행 게이트 사유를 사용자 말로 옮긴다. 0 인 사유는 뺀다. 한 행이 여러 사유에 걸릴 수 있다(스크립트 원문 "겹칠 수 있음").
 * 연기 시험(2026-09-15): 인테리어·DIY 회차가 자리 통과 14행 → 발행 3행이었는데 화면에는 "끝"만 보였다.
 */
const GATE_DROP_LABEL: Readonly<Record<string, string>> = Object.freeze({
  자리없음: '빈자리 없음',
  폐지레인: '주제 없는 행',
  죽은검색어: '죽은 검색어',
  '1페이지 자리 없음': '1페이지 자리 없음',
});

function describeGateDrops(detail: string): string {
  const parts = String(detail || '').replace(/,\s*겹칠 수 있음\s*$/, '').split(' · ');
  const named = parts.flatMap((part) => {
    const matched = part.trim().match(/^(.+?)\s+(\d+)$/);
    if (!matched || Number(matched[2]) === 0) return [];
    const label = matched[1].startsWith('저볼륨<')
      ? `검색량 ${matched[1].slice('저볼륨<'.length)} 미만`
      : (GATE_DROP_LABEL[matched[1]] || matched[1]);
    return [`${label} ${matched[2]}`];
  });
  if (named.length === 0) return '';
  return ` (${named.join(' · ')}${named.length > 1 ? ' · 겹칠 수 있음' : ''})`;
}

export interface SeedDbCheck {
  ok: boolean;
  builtAt: string | null;
  seeds: number;
  reason: string;
}

/** 받은 씨앗 창고가 쓸 만한가. 반쯤 받은 파일이나 오류 페이지를 창고 자리에 덮지 않게. */
export function judgeSeedDbPayload(payload: unknown): SeedDbCheck {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, builtAt: null, seeds: 0, reason: '씨앗 창고 모양이 아닙니다' };
  }
  const data = payload as { builtAt?: unknown; seeds?: unknown };
  const seeds = Array.isArray(data.seeds) ? data.seeds.length : 0;
  const builtAt = typeof data.builtAt === 'string' && Number.isFinite(Date.parse(data.builtAt)) ? data.builtAt : null;
  if (seeds < SEED_DB_MIN_SEEDS) return { ok: false, builtAt, seeds, reason: `씨앗이 ${seeds}개뿐입니다` };
  if (!builtAt) return { ok: false, builtAt, seeds, reason: '만든 시각이 없습니다' };
  return { ok: true, builtAt, seeds, reason: '' };
}

/** 받아 둔 지 하루가 지났으면 다시 받는다. 받은 적이 없으면 받는다. */
export function seedDbNeedsRefresh(savedAtMs: number | null, nowMs: number): boolean {
  if (savedAtMs === null || !Number.isFinite(savedAtMs)) return true;
  return nowMs - savedAtMs >= SEED_DB_REFRESH_MS;
}
