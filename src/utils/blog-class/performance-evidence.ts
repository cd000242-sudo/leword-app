import { coreWords } from './my-blog-lane';
import { blogKey } from './profile-store';
export interface PerformanceEvidence { articles: number; withHomefeed: number; homefeedVisits: number; keyword: string }
interface DayRecord { channelId: string; day: string; posts: Array<{ contentId: string; title: string; homefeed: { count: number } | null }> }
/** Observed visits, not impressions, CTR or a causal success probability. */
export function keywordPerformance(keyword: string, blogId: string, records: readonly DayRecord[], now = Date.now()): PerformanceEvidence | null {
  const words = coreWords(keyword).map((w) => w.replace(/\s+/g, '').toLowerCase());
  if (!words.length) return null;
  const seenDays = new Set<string>();
  const posts = new Map<string, number>();
  for (const record of records) {
    const at = Date.parse(record.day + 'T00:00:00+09:00');
    if (blogKey(record.channelId) !== blogKey(blogId) || !Number.isFinite(at) || at > now || now - at > 14 * 86400000) continue;
    for (const p of record.posts || []) {
      if (!p.contentId || p.homefeed === null || !Number.isFinite(p.homefeed?.count) || p.homefeed!.count < 0) continue;
      if (!words.some((w) => p.title.replace(/\s+/g, '').toLowerCase().includes(w))) continue;
      const key = record.day + ':' + p.contentId;
      if (seenDays.has(key)) continue;
      seenDays.add(key);
      posts.set(p.contentId, (posts.get(p.contentId) || 0) + p.homefeed!.count);
    }
  }
  if (!posts.size) return null;
  const visits = [...posts.values()];
  return { keyword, articles: visits.length, withHomefeed: visits.filter((n) => n > 0).length, homefeedVisits: visits.reduce((a, b) => a + b, 0) };
}
export function performanceSupported(evidence: PerformanceEvidence | null): boolean {
  return !!evidence && evidence.articles >= 3 && evidence.withHomefeed * 2 >= evidence.articles;
}
