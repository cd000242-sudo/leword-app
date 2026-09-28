import type { TopicBrief } from '../utils/topic-briefs';
import { getNaverBlogDocumentCount, peekCachedNaverBlogDocumentCountMeasurement } from '../utils/naver-blog-api';

/** Blog OpenAPI totals are independent of the sampled top-ten competition count. */
export async function measureBriefDocumentCounts<T extends TopicBrief>(
  briefs: readonly T[], config: { clientId?: string; clientSecret?: string },
  options: { cancelled?: () => boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<T[]> {
  const output: T[] = [];
  for (const brief of briefs) {
    if (options.cancelled?.()) throw new Error('문서량 측정을 취소했습니다.');
    let total: number | null = null;
    let measuredAt: string | undefined;
    try {
      total = await getNaverBlogDocumentCount(brief.coreKeyword, { config, timeoutMs: 8_000 });
      const evidence = peekCachedNaverBlogDocumentCountMeasurement(brief.coreKeyword);
      if (total !== null && evidence?.total === total) measuredAt = evidence.measuredAt;
    } catch { /* Keep a failed measurement unknown. */ }
    output.push({ ...brief, documentCount: measuredAt ? total : null, documentCountMeasuredAt: measuredAt });
    options.onProgress?.(output.length, briefs.length);
  }
  return output;
}
