/**
 * 숏텐츠 토픽 블로그 문서수 측정(2026-10-29).
 *
 * new · rising 토픽만, 회차당 최대 20개, 같은 검색어는 6시간 캐시. 실패 · 0 은 null — 지어내지 않고 캐시도 하지 않는다.
 * 측정 함수는 주입받는다(기본 배선은 collector 가 API HUB 우선 getNaverBlogDocumentCount 로 한다).
 */
import type { RisingTopic } from './rising';

export const DOC_CACHE_MS = 6 * 60 * 60 * 1000;
export const DOC_MAX_PER_ROUND = 20;

export interface DocCacheEntry { docs: number; at: string }
export type DocCache = Record<string, DocCacheEntry>;
export interface MeasuredTopic extends RisingTopic { docs: number | null; docsMeasuredAt: string | null }

const cacheKey = (keyword: string): string => keyword.replace(/\s+/g, '');

export async function measureTopicDocs(
  topics: readonly RisingTopic[],
  cache: DocCache,
  nowMs: number,
  count: (keyword: string) => Promise<number | null>,
  max: number = DOC_MAX_PER_ROUND,
): Promise<{ topics: MeasuredTopic[]; cache: DocCache }> {
  const fresh = (entry: DocCacheEntry | undefined): entry is DocCacheEntry =>
    !!entry && Number.isFinite(Date.parse(entry.at)) && nowMs - Date.parse(entry.at) < DOC_CACHE_MS;
  const next: DocCache = {};
  for (const [k, entry] of Object.entries(cache)) if (fresh(entry)) next[k] = entry;

  let measuredCount = 0;
  const out: MeasuredTopic[] = [];
  for (const topic of topics) {
    const k = cacheKey(topic.keyword);
    let entry = next[k];
    if (!entry && (topic.status === 'new' || topic.status === 'rising') && measuredCount < max) {
      measuredCount++;
      try {
        const docs = await count(topic.keyword);
        if (typeof docs === 'number' && Number.isFinite(docs) && docs > 0) {
          entry = { docs, at: new Date(nowMs).toISOString() };
          next[k] = entry;
        }
      } catch { /* 실패는 null */ }
    }
    out.push({ ...topic, docs: entry ? entry.docs : null, docsMeasuredAt: entry ? entry.at : null });
  }
  return { topics: out, cache: next };
}
