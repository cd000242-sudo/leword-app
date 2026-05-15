// rimi_77- 블로그의 SERP 진입 가능성 — 더 긴 롱테일 키워드로 검증
import axios from 'axios';
import * as cheerio from 'cheerio';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

async function findInSerp(keyword: string, targetBlogId: string): Promise<{ rank: number | null; total: number; sampleBlogs: string[] }> {
  const url = `https://m.search.naver.com/search.naver?where=view&query=${encodeURIComponent(keyword)}`;
  const r = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 12000, responseType: 'text' });
  const $ = cheerio.load(r.data);
  const seen = new Set<string>();
  const sample: string[] = [];
  let rank = 0;
  let foundRank: number | null = null;
  $('a[href*="blog.naver.com"]').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    const m = href.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
    if (!m) return;
    const k = `${m[1]}/${m[2]}`;
    if (seen.has(k)) return;
    seen.add(k);
    rank++;
    if (rank <= 30 && sample.length < 8) sample.push(`#${rank} ${m[1]}`);
    if (m[1] === targetBlogId && foundRank === null) foundRank = rank;
  });
  return { rank: foundRank, total: rank, sampleBlogs: sample };
}

(async () => {
  const target = 'rimi_77-';
  const queries = [
    '고유가 피해지원금',
    '고유가 피해지원금 2차',
    '고유가 피해지원금 건강보험료',
    '고유가 피해지원금 건강보험료 기준',
    '고유가 피해지원금 자가진단',
    '부모급여',
    '부모급여 신청',
    '부모급여 신청 기한',
    '부모급여 어린이날',
  ];

  for (const q of queries) {
    try {
      const r = await findInSerp(q, target);
      const flag = r.rank !== null ? `✅ #${r.rank}` : '❌ 미노출';
      console.log(`[${q}] ${flag} (총 ${r.total}건 확인)`);
      if (r.rank === null) {
        console.log(`  TOP 5: ${r.sampleBlogs.slice(0, 5).join(' / ')}`);
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (e: any) {
      console.log(`[${q}] err: ${e.message}`);
    }
  }
  process.exit(0);
})();
