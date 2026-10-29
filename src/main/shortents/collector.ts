/**
 * 숏텐츠 수집기(앱 전용, 2026-10-29) — 사장님 "숏텐츠 중에서 가장 빠르게 뜨는 키워드".
 *
 * 네이버 모바일 홈의 'NOW 숏텐츠'(30분 집계, :00/:30 발행)를 발행 뒤 3분쯤(:03, :33)에 받아 최근 48창을 쌓고,
 * 급상승을 계산해 사이트 공개 파일로 올린다(주인 PC 에서만 — publisher 참고). 실패해도 앱을 멈추지 않는다.
 * 기록: userData/shortents/history.json
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { emptyShortentsState, runShortentsCycle, type ShortentsState } from '../../utils/shortents/cycle';
import { nextCollectDelayMs } from '../../utils/shortents/schedule';
import { publishShortentsRising } from './publisher';

const FIRST_CHECK_MS = 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = true;

const historyFile = () => path.join(app.getPath('userData'), 'shortents', 'history.json');

export function readShortentsState(): ShortentsState {
  try {
    const raw = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
    return {
      windows: Array.isArray(raw?.windows) ? raw.windows : [],
      docCache: raw?.docCache && typeof raw.docCache === 'object' ? raw.docCache : {},
      publishedFor: typeof raw?.publishedFor === 'string' ? raw.publishedFor : null,
    };
  } catch {
    return emptyShortentsState();
  }
}

function writeShortentsState(state: ShortentsState): void {
  const file = historyFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, file);
}

async function fetchMobileHome(): Promise<string> {
  const response = await fetch('https://m.naver.com/', {
    headers: { 'User-Agent': IPHONE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`m.naver.com ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_HTML_BYTES) throw new Error('response_too_large');
  return text;
}

async function countBlogDocs(keyword: string): Promise<number | null> {
  const { getNaverBlogDocumentCount } = await import('../../utils/naver-blog-api');
  return getNaverBlogDocumentCount(keyword, { timeoutMs: 10_000 });
}

export async function runShortentsOnce() {
  if (running) return { status: 'skipped' as const, reason: 'already_running' };
  running = true;
  try {
    return await runShortentsCycle({
      fetchHtml: fetchMobileHome,
      readState: readShortentsState,
      writeState: writeShortentsState,
      count: countBlogDocs,
      publish: (payload) => publishShortentsRising(payload),
    });
  } finally {
    running = false;
  }
}

function schedule(delayMs: number): void {
  if (stopped) return;
  timer = setTimeout(async () => {
    let next = nextCollectDelayMs(Date.now());
    try {
      const result = await runShortentsOnce();
      if (result.status === 'failed') {
        console.warn('[숏텐츠] 회차 실패:', result.reason);
        next = Math.min(next, RETRY_MS);
      } else if (result.status === 'collected') {
        console.log(`[숏텐츠] ${result.publishTime} 창 수집 · 발행 ${result.publication?.status}/${result.publication?.reason}`);
      }
    } catch (error: any) {
      console.warn('[숏텐츠] 회차 예외:', error?.message);
    }
    schedule(next);
  }, delayMs);
  timer.unref?.();
}

export function startShortentsCollector(): void {
  if (!stopped) return;
  stopped = false;
  schedule(FIRST_CHECK_MS);
}

export function stopShortentsCollector(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
