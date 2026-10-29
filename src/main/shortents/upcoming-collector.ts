/**
 * 곧 뜰 숏텐츠 후보 수집기(앱 전용, 2026-10-30) — 사장님 "곧 뜰 숏텐츠를 우리 숏텐츠에 접목".
 *
 * 10분마다 실시간 급상승어(Signal.bz · 네이트 · 구글 · 다음)에서 아직 숏텐츠에 없는 말을 골라 네이버 뉴스 최신순으로 재고,
 * 적중 장부와 함께 사이트 공개 파일로 올린다(주인 PC 에서만). 원천은 홈판 신호 수집기의 것을 그대로 쓴다 — 새 크롤러 없음.
 * 뉴스 검색은 본인 네이버 키(API HUB 폴백) — 키가 없으면 회차를 건너뛴다. 실패해도 앱을 멈추지 않는다.
 * 기록: userData/shortents/upcoming.json
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { emptyUpcomingState, runUpcomingCycle, type UpcomingState } from '../../utils/shortents/upcoming-cycle';
import { NEWS_DISPLAY } from '../../utils/shortents/upcoming';
import { createHomefeedStore } from '../homefeed/store';
import { createHomefeedSourceDeps } from '../homefeed/sources';
import { readShortentsState } from './collector';
import { publishShortentsUpcoming } from './upcoming-publisher';

const FIRST_CHECK_MS = 2 * 60 * 1000;
const CYCLE_MS = 10 * 60 * 1000;
const SIGNAL_LIMIT = 20;
const LANE_LIMIT = 10;
const MAX_CANDIDATES = 30;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = true;

const stateFile = () => path.join(app.getPath('userData'), 'shortents', 'upcoming.json');

function readUpcomingState(): UpcomingState {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return { ledger: Array.isArray(raw?.ledger) ? raw.ledger : [] };
  } catch {
    return emptyUpcomingState();
  }
}

function writeUpcomingState(state: UpcomingState): void {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, file);
}

function sources() {
  return createHomefeedSourceDeps(createHomefeedStore(path.join(app.getPath('userData'), 'homefeed')));
}

/** 급상승 목록 넷을 합친다 — 같은 말(공백 무시)은 한 후보로, 어느 목록에 있었는지는 sources 에 남긴다. */
async function fetchCandidates(src: ReturnType<typeof sources>) {
  const [signal, lanes] = await Promise.allSettled([src.fetchSignalBz(SIGNAL_LIMIT), src.fetchHotLanes()]);
  const lists: Array<[string, Array<{ keyword: string }>]> = [];
  if (signal.status === 'fulfilled') lists.push(['signal.bz', signal.value]);
  if (lanes.status === 'fulfilled') {
    for (const [name, rows] of Object.entries(lanes.value)) lists.push([name, (rows || []).slice(0, LANE_LIMIT)]);
  }
  if (!lists.length) throw new Error('no_realtime_lists');
  const merged = new Map<string, { keyword: string; sources: string[] }>();
  for (const [name, rows] of lists) {
    for (const row of rows) {
      const key = row.keyword.replace(/\s+/g, '').toLowerCase();
      const prev = merged.get(key);
      merged.set(key, prev ? { ...prev, sources: [...prev.sources, name] } : { keyword: row.keyword, sources: [name] });
    }
  }
  return [...merged.values()].slice(0, MAX_CANDIDATES);
}

export async function runUpcomingOnce() {
  if (running) return { status: 'skipped' as const, reason: 'already_running' };
  running = true;
  try {
    const src = sources();
    if (!src.hasNaverKeys()) return { status: 'skipped' as const, reason: 'no_naver_keys' };
    return await runUpcomingCycle({
      fetchCandidates: () => fetchCandidates(src),
      fetchNews: async (keyword) => (await src.fetchNews(keyword, NEWS_DISPLAY)).items
        .map((n) => ({ title: n.title, press: n.press, publishedAt: n.publishedAt, link: n.url })),
      latestWindow: () => {
        const windows = readShortentsState().windows;
        return windows.length ? windows[windows.length - 1] : null;
      },
      readState: readUpcomingState,
      writeState: writeUpcomingState,
      publish: (payload) => publishShortentsUpcoming(payload),
    });
  } finally {
    running = false;
  }
}

function schedule(delayMs: number): void {
  if (stopped) return;
  timer = setTimeout(async () => {
    try {
      const result = await runUpcomingOnce();
      if (result.status === 'failed') console.warn('[곧 뜰 숏텐츠] 회차 실패:', result.reason);
      else if (result.status === 'collected') {
        console.log(`[곧 뜰 숏텐츠] 재 본 후보 ${result.measured} · 통과 ${result.candidates} · 발행 ${result.publication?.status}/${result.publication?.reason}`);
      }
    } catch (error: any) {
      console.warn('[곧 뜰 숏텐츠] 회차 예외:', error?.message);
    }
    schedule(CYCLE_MS);
  }, delayMs);
  timer.unref?.();
}

export function startShortentsUpcomingCollector(): void {
  if (!stopped) return;
  stopped = false;
  schedule(FIRST_CHECK_MS);
}

export function stopShortentsUpcomingCollector(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
