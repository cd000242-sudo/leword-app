// PRO Hunter v12 — 상위 후보 실측 콘텐츠 브리핑 오케스트레이터 (C4 slice 3)
//
// serp-content-analyzer.analyzeSerp(순수) + serp-content-fetcher.fetchSerpTop10(puppeteer 본문크롤)로
// 최종 랭킹 상위 소수 후보의 '경쟁사 상위 10개 실측 콘텐츠 사실'(권장 글자수·필수 이미지·must-include
// 키워드·경쟁사 제목)을 뽑는다. 전부 실측 사실이라 '추정치 UI 금지' 규칙과 무관.
//
// [비용 주의] fetchSerpTop10 은 키워드당 SERP 1 + 본문 10 페이지 로드(가장 비싼 크롤). 그래서 topN 기본 3,
// 상한 10 으로 강하게 제한한다. opt-in(명시 호출)·graceful-degrade·fetcher/analyzer 주입(테스트).
// win-predictor(예상순위/트래픽 추정치)는 UI 금지 규칙상 여기서 승격하지 않는다.

import { fetchSerpTop10, type FetchedPost } from './serp-content-fetcher';
import { analyzeSerp, type SerpAnalysis } from './serp-content-analyzer';

export type SerpFetcher = (keyword: string) => Promise<FetchedPost[]>;
export type SerpContentAnalyzer = (posts: FetchedPost[]) => SerpAnalysis;

export interface ContentBriefOptions {
  /** 상위 몇 개만 브리핑할지 (기본 3, 상한 10 — 본문크롤 비용 보호). */
  topN?: number;
  /** 동시 크롤 수 (기본 1 — 본문크롤이 무거워 순차 기본). 상한 2. */
  concurrency?: number;
  /** 본문 fetcher 주입(테스트/대체). 기본 fetchSerpTop10(puppeteer). */
  fetcher?: SerpFetcher;
  /** 분석기 주입(테스트/대체). 기본 analyzeSerp(순수). */
  analyzer?: SerpContentAnalyzer;
  onProgress?: (done: number, total: number, keyword: string) => void;
}

/** 본문크롤 비용 상한 — 아무리 요청해도 이 이상은 브리핑하지 않는다. */
export const CONTENT_BRIEF_MAX_TOP_N = 10;

/** 브리핑이 신뢰 가능한 실측인가(경쟁사 본문 1개 이상 수집). */
export function isContentBriefReliable(b: SerpAnalysis | undefined): boolean {
  return !!b && typeof b.postCount === 'number' && b.postCount > 0;
}

/**
 * 상위 후보 키워드들에 실측 콘텐츠 브리핑을 주입한다.
 * 반환: keyword → SerpAnalysis (본문 0개/실패는 map 에 넣지 않음 = 미측정).
 */
export async function enrichKeywordsWithContentBrief(
  keywords: string[],
  options: ContentBriefOptions = {},
): Promise<Map<string, SerpAnalysis>> {
  const fetcher = options.fetcher ?? fetchSerpTop10;
  const analyzer = options.analyzer ?? analyzeSerp;
  const topN = Math.max(0, Math.min(CONTENT_BRIEF_MAX_TOP_N, Math.floor(options.topN ?? 3)));
  const concurrency = Math.max(1, Math.min(2, Math.floor(options.concurrency ?? 1)));

  const targets: string[] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const k = String(kw || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    targets.push(k);
    if (targets.length >= topN) break;
  }

  const out = new Map<string, SerpAnalysis>();
  if (targets.length === 0) return out;

  let cursor = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const kw = targets[cursor++];
      try {
        const posts = await fetcher(kw);
        if (posts && posts.length > 0) {
          out.set(kw, analyzer(posts));
        }
      } catch (err) {
        console.warn(`[CONTENT-BRIEF] "${kw}" 브리핑 실패 → 스킵:`, (err as Error)?.message || err);
      } finally {
        done++;
        options.onProgress?.(done, targets.length, kw);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );
  return out;
}
