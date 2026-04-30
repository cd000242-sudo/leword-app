// PRO Hunter v12 — 백그라운드 프리크롤
// 작성: 2026-04-15 (Tier 2)
// 사용자 카테고리의 핫 키워드를 백그라운드에서 미리 수집해 청사진 캐시 워밍
// → 사용자가 클릭하면 "로딩 0초" 경험

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { loadProfile } from './user-profile';

interface PreCrawlQueueItem {
  keyword: string;
  category?: string;
  priority: number;         // 높을수록 먼저
  addedAt: number;
  processedAt?: number;
  error?: string;
}

interface PreCrawlStore {
  version: 1;
  queue: PreCrawlQueueItem[];
  processed: string[];      // 최근 100개 처리된 키워드 (dedupe)
}

const FILE_NAME = 'precrawl-queue.json';
const INTERVAL_MS = 30 * 60 * 1000;   // 30분 간격
const MAX_PER_RUN = 3;                // 한 번에 최대 3개 (부하 제한)

let timer: NodeJS.Timeout | null = null;

function getStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function loadStore(): PreCrawlStore {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return { version: 1, queue: [], processed: [] };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
  } catch {}
  return { version: 1, queue: [], processed: [] };
}

function saveStore(store: PreCrawlStore): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

export function enqueue(keyword: string, category?: string, priority: number = 5): void {
  const store = loadStore();
  // dedupe
  if (store.processed.includes(keyword)) return;
  if (store.queue.some((q) => q.keyword === keyword)) return;

  store.queue.push({ keyword, category, priority, addedAt: Date.now() });
  store.queue.sort((a, b) => b.priority - a.priority);
  // 큐 100개 제한
  if (store.queue.length > 100) store.queue = store.queue.slice(0, 100);
  saveStore(store);
}

export function enqueueBatch(keywords: string[], category?: string, priority: number = 5): void {
  for (const k of keywords) enqueue(k, category, priority);
}

/**
 * 사용자 카테고리 기반 자동 핫 키워드 수집
 * 카테고리별 시드 목록에서 자동완성/연관어 확장
 */
async function autoEnqueueFromProfile(): Promise<void> {
  const profile = loadProfile();
  if (!profile || !profile.category) return;

  // 카테고리별 기본 시드 키워드 (간단 매핑)
  const categorySeeds: Record<string, string[]> = {
    요리: ['레시피', '만들기', '맛집', '집밥', '간편'],
    육아: ['아기', '돌아기', '이유식', '유아용품'],
    it: ['아이폰', '맥북', '안드로이드', 'ChatGPT'],
    여행: ['국내여행', '해외여행', '호텔', '맛집'],
    인테리어: ['셀프', '원룸', '수납', '정리'],
    건강: ['운동', '다이어트', '비타민', '홈트'],
    패션: ['코디', '스타일', '신발', '가방'],
  };

  const cat = profile.category.toLowerCase();
  for (const [key, seeds] of Object.entries(categorySeeds)) {
    if (cat.includes(key)) {
      enqueueBatch(seeds, key, 7);
      break;
    }
  }
}

async function runOnce(): Promise<void> {
  const store = loadStore();
  if (store.queue.length === 0) {
    // 큐 비어있으면 프로파일 기반 자동 수집
    await autoEnqueueFromProfile();
    return;
  }

  const batch = store.queue.splice(0, MAX_PER_RUN);
  console.log(`[PRECRAWL] ${batch.length}개 프리크롤 시작`);

  // 동적 import로 순환 의존 회피
  const { generateKeywordBlueprint } = await import('./index');

  let success = 0;
  for (const item of batch) {
    try {
      await generateKeywordBlueprint(item.keyword, { force: false });
      item.processedAt = Date.now();
      store.processed.push(item.keyword);
      success++;
      // 부하 회피
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      item.error = (err as Error).message;
      console.warn(`[PRECRAWL] ${item.keyword} 실패:`, item.error);
    }
  }

  // processed는 최근 100개만
  if (store.processed.length > 100) store.processed = store.processed.slice(-100);
  saveStore(store);

  console.log(`[PRECRAWL] ✅ ${success}/${batch.length} 완료 (남은 큐 ${store.queue.length})`);
}

export function startPrecrawler(): void {
  if (timer) return;
  const { markWorkerStarted, markWorkerTick } = require('./worker-status');
  markWorkerStarted('precrawler');
  setTimeout(() => {
    Promise.resolve(runOnce()).then(() => markWorkerTick('precrawler')).catch((e: any) => markWorkerTick('precrawler', e?.message));
    timer = setInterval(() => {
      Promise.resolve(runOnce()).then(() => markWorkerTick('precrawler')).catch((e: any) => markWorkerTick('precrawler', e?.message));
    }, INTERVAL_MS);
  }, 10 * 60 * 1000);
  console.log('[PRECRAWL] ✅ 백그라운드 프리크롤 시작 (30분 주기)');
}

export function stopPrecrawler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runPrecrawlNow(): Promise<{ processed: number; queueLength: number }> {
  const before = loadStore().queue.length;
  await runOnce();
  const after = loadStore().queue.length;
  return { processed: before - after, queueLength: after };
}

export function getPrecrawlStatus(): { queueLength: number; processed: number; queue: PreCrawlQueueItem[] } {
  const s = loadStore();
  return { queueLength: s.queue.length, processed: s.processed.length, queue: s.queue.slice(0, 20) };
}
