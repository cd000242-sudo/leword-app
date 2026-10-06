/**
 * 앱 애드센스 고수 벤치마크 서비스(2026-10-07) — 사이트 판(786곳 · 1,000장)의 상위호환.
 * 엑셀 6,412곳 전부를 사장님 PC 에서 읽고 카드 상한 없이 판을 만든다. 수집 · 묶기 규칙은 사이트 판과 같은 코어
 * (scripts/adsense-benchmarks-core.cjs)를 그대로 쓴다 — 규칙이 두 곳에서 갈라지지 않게.
 * 이 파일은 부품을 주입받는 순수한 진행기다(electron 없음) — 실제 연결은 handlers/adsense-bench.ts.
 */

export interface AdsenseBenchDeps {
  loadSources: () => Array<Record<string, unknown>>;
  collectAll: (sources: any[], now: string, opts: { concurrency?: number; onProgress?: (done: number, total: number) => void }) => Promise<any[]>;
  buildBoard: (results: any[], sources: any[], now: string, opts: { maxCards?: number; windowDays?: number }) => any;
  save: (board: any) => void;
  now: () => string;
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
}

export async function collectAdsenseBench(deps: AdsenseBenchDeps): Promise<{ sourceCount: number; okCount: number; collectedPostCount: number; cards: number; recommended: number }> {
  const sources = deps.loadSources();
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('애드센스 고수 블로그 출처 목록이 비었습니다 — 앱을 다시 설치해 주세요.');
  const now = deps.now();
  const results = await deps.collectAll(sources, now, { concurrency: deps.concurrency ?? 24, onProgress: deps.onProgress });
  // 앱은 카드 상한이 없다 — 사이트 판만 1,000장(공개 파일 크기 · CI 시간 때문).
  const board = deps.buildBoard(results, sources, now, { maxCards: Number.POSITIVE_INFINITY });
  deps.save(board);
  const cards = Array.isArray(board?.candidates) ? board.candidates : [];
  return { sourceCount: board?.sourceCount ?? sources.length, okCount: board?.okCount ?? 0, collectedPostCount: board?.collectedPostCount ?? 0, cards: cards.length, recommended: cards.filter((c: any) => c?.recommended).length };
}

export function withCardTitles<T extends { candidates: any[] }>(board: T, id: string, titles: string[]): T {
  return { ...board, candidates: board.candidates.map((c) => (c.id === id ? { ...c, titles: [...titles], titlesAt: new Date().toISOString() } : c)) };
}

export function withCardMetrics<T extends { candidates: any[] }>(board: T, id: string, entry: { query: string; searchVolume: number | null; documentCount: number | null; bid: number | null; at: string }): T {
  return { ...board, candidates: board.candidates.map((c) => (c.id === id ? { ...c, metrics: { query: entry.query, searchVolume: entry.searchVolume, documentCount: entry.documentCount, bid: entry.bid, measuredAt: entry.at } } : c)) };
}
