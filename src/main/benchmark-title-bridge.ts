/**
 * 홈판 벤치마크 소재 하나의 홈판 제목을 사이트가 앱(사용자 본인 구독)에 바로 짓게 하는 브리지(2026-10-07).
 *
 * 회차(CI)는 시간당 수십 장밖에 못 지어 1,000장 판에서 제목이 붙은 카드는 25장뿐이었다(실측).
 * 제목이 비어 있는 카드는 사이트의 [지금 제목 만들기]가 이 경로로 같은 엔진 · 같은 검사(benchmark-title-engine)를 돌린다.
 * 엔진 오류 문구에는 명령 경로 · 프롬프트 · 인증 정보가 섞일 수 있어 화면으로 보내지 않는다.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { BenchmarkTitleCard } from '../utils/benchmark-title-engine';

export const BENCHMARK_TITLE_ROUTE = '/v1/bridge/benchmark-titles';

/** 'homefeed' = 홈판 후킹형(benchmark-title-engine) · 'adsense' = 구글 · 다음 검색용(adsense-title-engine, 대표 검색어 필수). */
export type BridgeTitleCard = BenchmarkTitleCard & { kind: 'homefeed' | 'adsense'; query: string };

export interface BenchmarkTitleBridgeDeps {
  allowed: () => Promise<boolean>;
  generate: (card: BridgeTitleCard) => Promise<{ provider: string; titles: string[] }>;
}

interface RouteIo {
  readBody: (req: IncomingMessage) => Promise<string>;
  json: (res: ServerResponse, code: number, value: unknown) => void;
  siteOriginAllowed: (origin: string) => boolean;
}

const CONTROL = /[\r\n\x00-\x1f]/;
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** 사이트가 보낸 카드 — 엔진이 읽는 칸만, 길이를 잘라서. 필수 칸이 비었거나 줄바꿈 · 제어문자가 있으면 null. */
export function parseBenchmarkCard(input: unknown): BridgeTitleCard | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const id = text(raw.id, 64);
  const keyword = typeof raw.keyword === 'string' ? raw.keyword.trim() : '';
  if (!id || keyword.length < 2 || keyword.length > 100 || CONTROL.test(keyword) || CONTROL.test(id)) return null;
  const title = text(raw.title, 200);
  const kind = raw.kind === 'adsense' ? 'adsense' : 'homefeed';
  const query = text(raw.query, 40);
  // 애드센스 검색용 제목은 2단계 실측 대표 검색어가 있어야 짓는다 — 검색어 없는 검색용 제목은 없다.
  if (kind === 'adsense' && (!query || CONTROL.test(query))) return null;
  const list = (value: unknown, max: number, each: number) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map((v) => text(v, each)).filter(Boolean).slice(0, max) : []);
  return {
    id,
    keyword,
    category: text(raw.category, 30),
    title,
    summary: text(raw.summary, 600),
    sourceTitles: [title, ...list(raw.sourceTitles, 6, 200)].filter(Boolean),
    relatedKeywords: list(raw.relatedKeywords, 8, 40),
    kind,
    query,
  };
}

export async function handleBenchmarkTitleRoute(req: IncomingMessage, res: ServerResponse, deps: BenchmarkTitleBridgeDeps, io: RouteIo): Promise<boolean> {
  if (String(req.url || '') !== BENCHMARK_TITLE_ROUTE) return false;
  res.setHeader('Cache-Control', 'no-store');
  const origin = String(req.headers.origin || '');
  if (req.method !== 'POST') { io.json(res, 404, { ok: false, error: '지원하지 않는 경로입니다.' }); return true; }
  if (!origin || !io.siteOriginAllowed(origin)) { io.json(res, 403, { ok: false, error: '사이트에서만 쓸 수 있습니다.' }); return true; }
  if (!await deps.allowed()) { io.json(res, 403, { ok: false, error: '앱의 유효한 라이선스를 확인해 주세요.' }); return true; }
  let card: BridgeTitleCard | null = null;
  try {
    const body = JSON.parse(await io.readBody(req));
    card = parseBenchmarkCard(body && body.card);
  } catch { card = null; }
  if (!card) { io.json(res, 400, { ok: false, error: '소재 정보가 올바르지 않습니다.' }); return true; }
  try {
    const made = await deps.generate(card);
    io.json(res, 200, { ok: true, result: { id: card.id, provider: made.provider, titles: made.titles } });
  } catch {
    io.json(res, 503, { ok: false, error: '앱에서 제목을 만들지 못했습니다 — 잠시 뒤 다시 눌러 주세요.' });
  }
  return true;
}

/** 실제 앱 연결 — 회차(CI)와 같은 엔진 · 같은 검사. 통과 제목이 0이면 빈 목록. */
export function createBenchmarkTitleBridgeDeps(): BenchmarkTitleBridgeDeps {
  return {
    allowed: async () => {
      const { loadLicense, isLicenseExpired } = await import('../utils/licenseManager');
      const license = await loadLicense();
      return Boolean(license?.isValid && !isLicenseExpired(license));
    },
    generate: async (card) => {
      if (card.kind === 'adsense') {
        const { titlesForAdsenseCards } = await import('../utils/adsense-title-engine');
        const result = await titlesForAdsenseCards([{ id: card.id, query: card.query, keyword: card.keyword, category: card.category, sourceTitles: card.sourceTitles }]);
        const row = result.results.find((r) => r.id === card.id);
        return { provider: result.provider, titles: row ? row.titles : [] };
      }
      const { titlesForCards } = await import('../utils/benchmark-title-engine');
      const result = await titlesForCards([card]);
      const row = result.results.find((r) => r.id === card.id);
      return { provider: result.provider, titles: row ? row.titles : [] };
    },
  };
}
