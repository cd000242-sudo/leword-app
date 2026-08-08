/**
 * 🛡️ YouTube Data API v3 일일 쿼터 거버너
 *
 * YouTube Data API 무료 쿼터는 프로젝트당 하루 10,000 "유닛"이고, 엔드포인트마다 단가가 다르다.
 * 특히 search.list 는 호출당 100유닛이라 videos.list(1유닛)보다 100배 비싸다.
 *
 * 실측된 위험: searchYouTubeVideos() 는 maxResults 500 까지 페이지네이션(50개씩 최대 10페이지)하며
 * 매 페이지가 search.list 1회다 → 한 번 실행에 최대 1,000유닛. 즉 이 함수 10번이면 하루치가 전부 사라진다.
 * 쿼터가 소진되면 YouTube 는 403 quotaExceeded 를 돌려주고, 그 시점부터 유튜브 기능 전체가 죽는다.
 *
 * 이 거버너는 `searchad-quota-governor`/`brightdata-quota-governor` 패턴을 미러링한다:
 *  - 엔드포인트별 유닛 단가로 소비량을 집계 (호출 수가 아니라 "유닛"이 진짜 예산이다)
 *  - 일일 소프트 상한(기본 9,000 = 1,000 여유)에 닿으면 호출 차단 → 403 을 맞기 전에 멈춘다
 *  - KST 가 아니라 태평양시(PT) 자정 기준 리셋 — YouTube 쿼터는 PT 자정에 리셋된다
 *  - over-count 는 안전(더 일찍 멈춤), under-count 는 위험(403) → 레이스 시 디스크값과 max 머지
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ABSOLUTE_DAILY_UNITS = 10_000;
const DEFAULT_SOFT_CEILING = 9_000;
const SCHEMA = 'youtube-quota-v1';
const STATE_MAX_BYTES = 512 * 1024;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const DAILY_UNITS = Math.min(
  positiveInt(process.env['LEWORD_YOUTUBE_DAILY_UNITS'], ABSOLUTE_DAILY_UNITS),
  ABSOLUTE_DAILY_UNITS,
);
const SOFT_CEILING = Math.min(
  positiveInt(process.env['LEWORD_YOUTUBE_SOFT_CEILING'], DEFAULT_SOFT_CEILING),
  DAILY_UNITS,
);

/**
 * 엔드포인트별 유닛 단가 (공식 표 기준).
 * search 가 100인 것이 핵심 — 나머지 read 계열은 대부분 1이다.
 */
const UNIT_COST: Record<string, number> = {
  search: 100,
  videos: 1,
  channels: 1,
  playlistItems: 1,
  playlists: 1,
  commentThreads: 1,
  captions: 50,
};

/** URL 에서 엔드포인트 이름을 뽑아 유닛 단가를 판정한다. 모르는 엔드포인트는 비싸게(100) 가정 — 과소계상보다 안전. */
export function youtubeUnitCost(url: string): number {
  const m = /youtube\/v3\/([a-zA-Z]+)/.exec(String(url || ''));
  const endpoint = m ? m[1] : '';
  if (endpoint && Object.prototype.hasOwnProperty.call(UNIT_COST, endpoint)) {
    return UNIT_COST[endpoint];
  }
  return 100;
}

interface DayState {
  schema: string;
  day: string; // PT YYYY-MM-DD
  units: number;
  byEndpoint: Record<string, number>;
}

/** YouTube 쿼터는 태평양시 자정에 리셋된다. UTC-8(PST) 기준으로 날짜를 끊는다(서머타임 1시간 오차는 안전측). */
function ptDay(nowMs: number): string {
  const pt = new Date(nowMs - 8 * 60 * 60 * 1000);
  const y = pt.getUTCFullYear();
  const m = String(pt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function stateFile(): string {
  const explicit = process.env['LEWORD_YOUTUBE_QUOTA_STATE_FILE'];
  if (explicit) return explicit;
  const dataDir =
    process.env['LEWORD_SERVER_USER_DATA'] ||
    process.env['LEWORD_MOBILE_DATA_DIR'] ||
    path.join(os.tmpdir(), 'leword-youtube-quota');
  return path.join(dataDir, 'youtube-quota-state.json');
}

function emptyState(day: string): DayState {
  return { schema: SCHEMA, day, units: 0, byEndpoint: {} };
}

function readState(nowMs: number): DayState {
  const day = ptDay(nowMs);
  const file = stateFile();
  try {
    const stat = fs.statSync(file);
    if (stat.size > STATE_MAX_BYTES) return emptyState(day);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DayState;
    if (!parsed || parsed.schema !== SCHEMA || parsed.day !== day) return emptyState(day);
    if (!Number.isSafeInteger(parsed.units) || parsed.units < 0) return emptyState(day);
    if (!parsed.byEndpoint || typeof parsed.byEndpoint !== 'object') parsed.byEndpoint = {};
    return parsed;
  } catch {
    return emptyState(day);
  }
}

function writeState(state: DayState): void {
  const file = stateFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[YOUTUBE-QUOTA] state write failed:', (err as Error).message || String(err));
  }
}

export interface YoutubeQuotaDecision {
  allowed: boolean;
  cost: number;
  used: number;
  remaining: number;
  reason?: string;
}

/**
 * 호출 전 승인. 이 호출이 소프트 상한을 넘기면 거부한다(403 을 맞기 전에 스스로 멈춤).
 * 승인되면 호출 후 recordYoutubeUnits() 로 확정할 것.
 */
export function reserveYoutubeUnits(url: string, nowMs = Date.now()): YoutubeQuotaDecision {
  const cost = youtubeUnitCost(url);
  const state = readState(nowMs);
  const remaining = Math.max(0, SOFT_CEILING - state.units);
  if (cost > remaining) {
    return {
      allowed: false,
      cost,
      used: state.units,
      remaining,
      reason: `일일 유닛 소프트 상한(${SOFT_CEILING}) 도달 — 이 호출 ${cost}유닛 거부 (사용 ${state.units})`,
    };
  }
  return { allowed: true, cost, used: state.units, remaining };
}

/** 호출 성공 후 소비 확정. */
export function recordYoutubeUnits(url: string, nowMs = Date.now()): void {
  const cost = youtubeUnitCost(url);
  const m = /youtube\/v3\/([a-zA-Z]+)/.exec(String(url || ''));
  const endpoint = m ? m[1] : 'unknown';
  const state = readState(nowMs);
  state.units += cost;
  state.byEndpoint[endpoint] = (state.byEndpoint[endpoint] || 0) + cost;
  writeState(state);
}

/** 현재 사용 현황(대시보드/로그용). */
export function youtubeQuotaSnapshot(nowMs = Date.now()): {
  day: string;
  used: number;
  softCeiling: number;
  dailyUnits: number;
  remaining: number;
  byEndpoint: Record<string, number>;
} {
  const state = readState(nowMs);
  return {
    day: state.day,
    used: state.units,
    softCeiling: SOFT_CEILING,
    dailyUnits: DAILY_UNITS,
    remaining: Math.max(0, SOFT_CEILING - state.units),
    byEndpoint: { ...state.byEndpoint },
  };
}

/** 쿼터 소진으로 차단됐을 때 던지는 에러 — 호출부가 일반 네트워크 오류와 구분할 수 있게 한다. */
export class YoutubeQuotaExhaustedError extends Error {
  readonly code = 'YOUTUBE_QUOTA_EXHAUSTED';
  constructor(message: string) {
    super(message);
    this.name = 'YoutubeQuotaExhaustedError';
  }
}
