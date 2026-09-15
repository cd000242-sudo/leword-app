/**
 * 홈판 신호 실제 원천 — 수집기(collector)에 넣는 deps. 새 크롤러는 없다, 있는 것을 부른다.
 *
 *   Signal.bz 실시간   getSignalBzKeywords(광고 필터 포함)
 *   인기 목록          워커 hot-keywords(네이트 · 구글 · 다음) — 읽을 때 갱신, 비AI 공개 액션
 *   뉴스 표본          네이버 뉴스 검색(최신순) · parseNewsHeadlines — 사용자 본인 키(API HUB 폴백은 naverApiFetch)
 *   블로그 문서수      getNaverBlogDocumentCount(forceFresh — 15분 캐시면 10분 증가량이 0 으로 잠긴다)
 *   사이트 이슈 보드   leaderspro.kr 발행본(issues[] 의 why · headlines)
 *   og:image           기사 페이지 대표이미지 — 주소마다 한 번(캐시)
 */
import { getSignalBzKeywords } from '../../utils/signal-bz-crawler';
import { parseNewsHeadlines } from '../../utils/issue-context';
import type { HomefeedCollectorDeps, HomefeedBoardIssue, RankedKeyword } from './collector';
import type { HomefeedStore } from './store';
import { createOgImageResolver } from './og-image';

const WORKER = 'https://leword-keyword-api.leword.workers.dev/';
const LANE_MAP = { popular: 'nate', google: 'google', daum: 'daum' } as const;

function rankedList(raw: unknown): RankedKeyword[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({ rank: Number((row as { rank?: unknown })?.rank), keyword: String((row as { keyword?: unknown })?.keyword || '').trim() }))
    .filter((row) => Number.isInteger(row.rank) && row.rank > 0 && row.keyword.length > 0 && row.keyword.length <= 80);
}

function naverCredentials(): { clientId: string; clientSecret: string; hub: boolean } {
  const { EnvironmentManager } = require('../../utils/environment-manager');
  const { isApiHubConfigured } = require('../../utils/naver-api-hub');
  const env = EnvironmentManager.getInstance().getConfig();
  return {
    clientId: String(env.naverClientId || process.env['NAVER_CLIENT_ID'] || ''),
    clientSecret: String(env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || ''),
    hub: Boolean(isApiHubConfigured()),
  };
}

export function createHomefeedSourceDeps(store: HomefeedStore, options: { fetchImpl?: typeof fetch; log?: (message: string) => void } = {}): HomefeedCollectorDeps {
  const fetchImpl = options.fetchImpl ?? fetch;
  const og = createOgImageResolver(store, { fetchImpl });

  return {
    fetchSignalBz: async (limit) => (await getSignalBzKeywords(limit)).map((row) => ({ rank: row.rank, keyword: row.keyword })),

    fetchHotLanes: async () => {
      const response = await fetchImpl(WORKER, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'hot-keywords' }),
        signal: AbortSignal.timeout(15_000),
      } as RequestInit);
      if (!response.ok) throw new Error(`인기 목록 응답 ${response.status}`);
      const body = await response.json() as { ok?: boolean; lanes?: Record<string, { items?: unknown }> | null; note?: string };
      if (!body?.ok || !body.lanes) throw new Error(body?.note || '인기 목록이 비었습니다');
      const out: Partial<Record<'nate' | 'google' | 'daum', RankedKeyword[]>> = {};
      for (const [laneId, name] of Object.entries(LANE_MAP)) {
        const list = rankedList(body.lanes[laneId]?.items);
        if (list.length > 0) out[name] = list;
      }
      return out;
    },

    hasNaverKeys: () => {
      try {
        const cred = naverCredentials();
        return Boolean((cred.clientId && cred.clientSecret) || cred.hub);
      } catch {
        return false;
      }
    },

    fetchNews: async (keyword, display) => {
      const { naverApiFetch } = require('../../utils/naver-api-hub');
      const cred = naverCredentials();
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=date`;
      const response: Response = await naverApiFetch(url, {
        headers: { 'X-Naver-Client-Id': cred.clientId, 'X-Naver-Client-Secret': cred.clientSecret },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`뉴스 검색 ${response.status}`);
      const json = await response.json() as { total?: unknown };
      const total = typeof json?.total === 'number' && Number.isFinite(json.total) ? json.total : null;
      return {
        total,
        items: parseNewsHeadlines(json, display).map((row) => ({ title: row.title, url: row.link, press: row.press, publishedAt: row.publishedAt })),
      };
    },

    fetchBlogDocCount: async (keyword) => {
      const { getNaverBlogDocumentCount } = require('../../utils/naver-blog-api');
      return getNaverBlogDocumentCount(keyword, { forceFresh: true, timeoutMs: 10_000 });
    },

    fetchIssueBoard: async () => {
      const { fetchSiteBoard } = require('../handlers/site-board');
      const received = await fetchSiteBoard('issueNiche', fetchImpl);
      if (!received.success) throw new Error(received.error);
      const board = received.board as { publishedAt?: unknown; issues?: unknown };
      const issues: HomefeedBoardIssue[] = (Array.isArray(board?.issues) ? board.issues : [])
        .map((raw: unknown) => {
          const row = (raw || {}) as Record<string, unknown>;
          const headlines = Array.isArray(row.headlines) ? row.headlines : [];
          return {
            issue: String(row.issue || '').trim(),
            why: typeof row.why === 'string' && row.why.trim() ? row.why.trim().slice(0, 400) : null,
            headlines: headlines.slice(0, 10).map((h: unknown) => {
              const item = (h || {}) as Record<string, unknown>;
              return {
                title: String(item.title || '').trim(),
                press: typeof item.press === 'string' ? item.press : null,
                publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
                link: String(item.link || '').trim(),
              };
            }),
          };
        })
        .filter((row: HomefeedBoardIssue) => row.issue);
      return { publishedAt: typeof board?.publishedAt === 'string' ? board.publishedAt : null, issues };
    },

    resolveOgImage: (url) => og.resolve(url),
    flushOgCache: () => og.flush(),
    now: () => Date.now(),
    log: options.log,
  };
}
