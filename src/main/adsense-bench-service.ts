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

/**
 * 회차마다 읽을 출처(2026-10-07 티스토리 차단). 엑셀 6,412곳 중 7일 안에 쓴 곳(913)은 매번, 쉬는 곳은 rotate 곳씩 돌아가며 —
 * 쉬다가 다시 쓰기 시작한 블로그도 몇 회차 안에 한 번은 읽는다. cursor 는 쉬는 곳 목록에서 다음에 읽을 자리.
 */
export function selectAppRound<T extends { weekPosts?: number }>(sources: T[], cursor: number, rotate = 300): { sources: T[]; nextCursor: number } {
  const active = sources.filter((s) => Number(s.weekPosts) > 0);
  const idle = sources.filter((s) => !(Number(s.weekPosts) > 0));
  if (!idle.length) return { sources: active, nextCursor: 0 };
  const start = Number.isInteger(cursor) && cursor >= 0 ? cursor % idle.length : 0;
  const count = Math.min(rotate, idle.length);
  const slice = Array.from({ length: count }, (_, i) => idle[(start + i) % idle.length]);
  return { sources: [...active, ...slice], nextCursor: (start + count) % idle.length };
}

/** edges — 제목과 같은 순서로 그 제목이 고수 제목보다 나은 점, masterBest — 같은 채점표의 가장 높은 고수 제목 점수(사이트 판과 같은 칸). */
export function withCardTitles<T extends { candidates: any[] }>(board: T, id: string, titles: string[], edges: string[] = [], masterBest?: number): T {
  return { ...board, candidates: board.candidates.map((c) => (c.id === id ? { ...c, titles: [...titles], titleEdges: [...edges], ...(Number.isFinite(masterBest) ? { masterBest } : {}), titlesAt: new Date().toISOString() } : c)) };
}

export function withCardMetrics<T extends { candidates: any[] }>(board: T, id: string, entry: { query: string; searchVolume: number | null; documentCount: number | null; bid: number | null; at: string }): T {
  return { ...board, candidates: board.candidates.map((c) => (c.id === id ? { ...c, metrics: { query: entry.query, searchVolume: entry.searchVolume, documentCount: entry.documentCount, bid: entry.bid, measuredAt: entry.at } } : c)) };
}

/** 재수집으로 실측을 잃지 않도록, 동일 소재만 이어 받는다. */
export function retainBenchMetrics(board: any, previous: any): any {
  const key = (c: any) => String(c.keyword || '').replace(/\s+/g, '').toLowerCase();
  const old = new Map<string, any>();
  for (const c of previous?.candidates || []) {
    if (!key(c) || !c.metrics?.query) continue;
    const prior = old.get(key(c));
    if (!prior || (Date.parse(c.metrics.measuredAt) || 0) > (Date.parse(prior.metrics.measuredAt) || 0)) old.set(key(c), c);
  }
  return { ...board, candidates: board.candidates.map((c: any) => {
    const prior = old.get(key(c));
    return prior ? { ...c, metrics: { ...prior.metrics }, context: prior.context || null } : c;
  }) };
}

/** 한 번에 최대 50개. 실패 카드도 넘겨 다음 소재를 분석하며, 카드마다 저장한다. */
export async function measureBenchBatch(cards: any[], deps: {
  now: number;
  measure: (card: any) => Promise<boolean | void>;
  progress?: (done: number, total: number) => void;
}): Promise<{ measured: number; partial: number; failed: number; remaining: number }> {
  const pending = cards.filter((c) => {
    const m = c.metrics || {};
    const age = deps.now - Date.parse(m.measuredAt);
    const complete = m.query && [m.searchVolume, m.documentCount, m.bid].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
    return !complete || !(age >= -300000 && age < 7 * 86400000);
  });
  // 실패한 첫 50개가 다음 실행도 독점하지 않도록, 아직 시도하지 않은 소재부터 진행한다.
  pending.sort((a, b) => (Date.parse(a.measurementAttemptAt || a.metrics?.measuredAt) || 0) - (Date.parse(b.measurementAttemptAt || b.metrics?.measuredAt) || 0));
  const targets = pending.slice(0, 50);
  let measured = 0; let partial = 0; let failed = 0;
  for (const c of targets) {
    try { if (await deps.measure(c) === false) partial += 1; else measured += 1; } catch { failed += 1; }
    deps.progress?.(measured + partial + failed, targets.length);
  }
  return { measured, partial, failed, remaining: pending.length - targets.length };
}
