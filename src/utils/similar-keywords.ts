// v2.43.43: 유사 키워드 추천
// 모델 활성 시: cosine similarity 상위 N
// 모델 비활성 시: 자동완성 + 시맨틱 sibling fallback

import { listTrackedKeywords } from './pro-hunter-v12/tracking-store';

export interface SimilarKeyword {
  keyword: string;
  similarity?: number; // 0~1 (cosine, 모델 활성 시)
  source: 'embedding' | 'autocomplete' | 'sibling';
}

/**
 * 키워드 N개 추천 (모델 활성 / 비활성 자동 분기)
 */
export async function findSimilarKeywords(
  keyword: string,
  options: { limit?: number; clientId?: string; clientSecret?: string } = {},
): Promise<SimilarKeyword[]> {
  const limit = options.limit || 10;
  const clean = keyword.trim();
  if (!clean) return [];

  // 1) 임베딩 모델 활성 시: tracking-store 풀에서 cosine 상위 N
  try {
    const semantic = await import('./semantic-embedding');
    const status = semantic.getSemanticStatus();
    if (status.ready) {
      const queryVec = await semantic.embed(clean);
      if (queryVec) {
        const pool = listTrackedKeywords()
          .map((t) => t.keyword)
          .filter((k) => k !== clean)
          .slice(0, 500); // 풀 상한
        const scored: SimilarKeyword[] = [];
        for (const kw of pool) {
          const v = await semantic.embed(kw);
          if (!v) continue;
          const sim = semantic.cosine(queryVec, v);
          if (sim > 0.5) {
            scored.push({ keyword: kw, similarity: sim, source: 'embedding' });
          }
        }
        scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
        if (scored.length >= limit / 2) {
          return scored.slice(0, limit);
        }
        // 부족하면 fallback 합류
      }
    }
  } catch (e: any) {
    console.warn('[similar] embedding 실패:', e?.message);
  }

  // 2) Fallback: 자동완성 + sibling
  const results: SimilarKeyword[] = [];
  const seen = new Set<string>([clean]);

  // 자동완성
  try {
    const { getNaverAutocompleteKeywords } = await import('./naver-autocomplete');
    const config = {
      clientId: options.clientId || '',
      clientSecret: options.clientSecret || '',
    };
    const auto = await getNaverAutocompleteKeywords(clean, config);
    for (const k of auto) {
      const t = k.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      results.push({ keyword: t, source: 'autocomplete' });
      if (results.length >= limit) break;
    }
  } catch (e: any) {
    console.warn('[similar] autocomplete 실패:', e?.message);
  }

  // 시맨틱 sibling (헤드 명사 공유)
  if (results.length < limit) {
    try {
      const { getSemanticSiblings } = await import('./keyword-mindmap');
      const siblings = await getSemanticSiblings(
        clean,
        options.clientId,
        options.clientSecret,
      );
      for (const s of siblings) {
        const t = s.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        results.push({ keyword: t, source: 'sibling' });
        if (results.length >= limit) break;
      }
    } catch (e: any) {
      console.warn('[similar] sibling 실패:', e?.message);
    }
  }

  return results;
}
