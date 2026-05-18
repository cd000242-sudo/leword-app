// v2.43.36 (Phase 3-A): 외부 trending → tracking-store 직접 부트스트랩
// 1팀 비평: "v2.43.35 폐쇄 루프가 자기참조 — 실제로는 발굴 결과만 tracking에 들어감"
// 해결: rich-feed-builder 거치지 않고 외부 raw trending 키워드를 직접 tracking-store에 cron 주입

import { pullAllSeedKeywords } from './signal-aggregator';
import { bulkRegisterTrending, BulkRegisterResult } from '../pro-hunter-v12/tracking-store';

const PUMP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6시간
const MAX_KEYWORDS_PER_PUMP = 300; // 한 번에 등록할 최대 키워드 수
let timer: NodeJS.Timeout | null = null;
let lastRunAt = 0;
let lastResult: BulkRegisterResult | null = null;
let isRunning = false;

/**
 * 외부 trending source 30+ 개에서 raw 키워드 수집 → tracking-store 직접 주입
 * - YouTube/wikipedia/뽐뿌/올영/무신사/디시/펨코/네이버쇼핑 등 모든 소스 통합
 * - rich-feed-builder의 게이트/필터 거치지 않은 raw 키워드
 * - surge-detector autoScan 입력 풀을 동적으로 풍부하게 함
 */
export async function runExternalTrendingPump(): Promise<BulkRegisterResult | null> {
  if (isRunning) {
    console.log('[TRENDING-PUMP] 이미 실행 중 — skip');
    return null;
  }
  isRunning = true;
  try {
    const start = Date.now();
    console.log('[TRENDING-PUMP] 외부 trending source 30+ 수집 시작...');
    const { seeds } = await pullAllSeedKeywords({ lite: false });
    const items: Array<{ keyword: string; docCount?: number; searchVolume?: number | null }> = [];

    // 소스 다양성 우선 — 등장 소스 수가 많은 키워드 우선
    const sorted = Array.from(seeds.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_KEYWORDS_PER_PUMP);

    for (const [kw] of sorted) {
      items.push({ keyword: kw });
    }

    const result = bulkRegisterTrending(items);
    lastRunAt = Date.now();
    lastResult = result;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[TRENDING-PUMP] 완료 (${elapsed}s): ${items.length}개 수집, +${result.added}건 추가, ${result.evicted}건 evicted, 풀 ${result.totalSize}건`,
    );
    return result;
  } catch (e: any) {
    console.error('[TRENDING-PUMP] 실패:', e?.message);
    return null;
  } finally {
    isRunning = false;
  }
}

/**
 * cron 시작 (앱 부팅 시 호출)
 * - 부팅 5분 후 1차 실행 (앱 안정화 대기)
 * - 이후 6시간마다 반복
 */
export function startExternalTrendingPump(): void {
  if (timer) return;
  console.log('[TRENDING-PUMP] cron 시작 — 5분 후 1차, 이후 6시간 주기');
  setTimeout(() => {
    void runExternalTrendingPump();
    timer = setInterval(() => void runExternalTrendingPump(), PUMP_INTERVAL_MS);
    timer.unref?.();
  }, 5 * 60 * 1000);
}

export function stopExternalTrendingPump(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getPumpStatus(): { lastRunAt: number; lastResult: BulkRegisterResult | null; isRunning: boolean } {
  return { lastRunAt, lastResult, isRunning };
}
