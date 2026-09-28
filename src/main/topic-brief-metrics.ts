import type { TopicBrief } from '../utils/topic-briefs';
import { getNaverBlogDocumentCount, peekCachedNaverBlogDocumentCountMeasurement } from '../utils/naver-blog-api';
import { getNaverSearchAdKeywordVolume, SEARCHAD_VOLUME_CHUNK_SIZE, type NaverSearchAdConfig, type KeywordSearchVolume } from '../utils/naver-searchad-api';
import { normalizeSearchAdResultKeyword } from '../utils/searchad-result-alignment';
import { applyBriefSearchVolumeEvidence, readBriefSearchVolumeEvidence, type BriefSearchVolumeEvidence } from '../utils/topic-brief-volume';

/** Same-query split counts, source time and disclosure bounds travel together. */
export async function measureBriefSearchVolumes<T extends TopicBrief>(
  briefs: readonly T[], config: NaverSearchAdConfig,
  options: { cancelled?: () => boolean; onProgress?: (done: number, total: number) => void; forceFresh?: boolean; now?: number } = {},
): Promise<{ briefs: Array<T & { searchVolumeEvidence?: BriefSearchVolumeEvidence }>; volumes: Map<string, number | null>; evidenceByKeyword: Map<string, BriefSearchVolumeEvidence> }> {
  const evidenceByKeyword = new Map<string, BriefSearchVolumeEvidence>();
  const volumes = new Map<string, number | null>();
  const keywords = [...new Map(briefs.map(brief => [normalizeSearchAdResultKeyword(brief.coreKeyword), brief.coreKeyword])).values()];
  const assertActive = () => { if (options.cancelled?.()) throw new Error('검색량 측정을 취소했습니다.'); };
  for (let offset = 0; offset < keywords.length; offset += SEARCHAD_VOLUME_CHUNK_SIZE) {
    assertActive();
    const chunk = keywords.slice(offset, offset + SEARCHAD_VOLUME_CHUNK_SIZE);
    let rows: KeywordSearchVolume[] = [];
    try { rows = await getNaverSearchAdKeywordVolume(config, chunk, {forceFresh: options.forceFresh ?? true}); }
    catch { /* Unavailable API results are unknown, never under-ten measurements. */ }
    assertActive();
    for (const keyword of chunk) {
      const key = normalizeSearchAdResultKeyword(keyword);
      const matches = rows.filter(row => normalizeSearchAdResultKeyword(row.keyword) === key);
      const evidence = matches.length === 1 ? readBriefSearchVolumeEvidence(keyword, matches[0], {now:options.now}) : null;
      if (evidence) evidenceByKeyword.set(key, evidence);
      const exact = evidence?.status === 'exact' ? evidence.totalMin : null;
      // Existing related-keyword helpers use whitespace-stripped keys.
      volumes.set(keyword.replace(/\s+/g, ''), exact);
    }
    options.onProgress?.(Math.min(offset + chunk.length, keywords.length), keywords.length);
  }
  return {
    briefs: briefs.map(brief => applyBriefSearchVolumeEvidence(brief, evidenceByKeyword.get(normalizeSearchAdResultKeyword(brief.coreKeyword)))),
    volumes,
    evidenceByKeyword,
  };
}

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
