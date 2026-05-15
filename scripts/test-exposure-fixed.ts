// v2.42.80 수정 후 실제 노출 추적 풀 사이클 — m.blog.naver.com 매칭 포함
import axios from 'axios';
import * as cheerio from 'cheerio';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function extractBlogIdPostNo(url: string): { blogId: string; postNo: string } {
  const m1 = url.match(/PostView\.naver\?blogId=([^&]+)&logNo=(\d+)/i);
  if (m1) return { blogId: m1[1], postNo: m1[2] };
  const m2 = url.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
  if (m2) return { blogId: m2[1], postNo: m2[2] };
  return { blogId: '', postNo: '' };
}

async function checkSerpRank(keyword: string, blogId: string, postNo: string): Promise<{ rank: number | null; found: any[] }> {
  const url = `https://m.search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
  const r = await axios.get(url, {
    headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    timeout: 12000, responseType: 'text',
  });
  const $ = cheerio.load(r.data);
  const links: { href: string; isAd: boolean }[] = [];
  $('a').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (!/(?:m\.)?blog\.naver\.com/.test(href)) return;
    const $parent = $(el).closest('.type_ad,.ad_section,.lst_ad');
    links.push({ href, isAd: $parent.length > 0 });
  });

  let rank = 0;
  const seen = new Set<string>();
  const found: any[] = [];
  let foundRank: number | null = null;
  for (const { href, isAd } of links) {
    if (isAd) continue;
    const { blogId: hBlogId, postNo: hPostNo } = extractBlogIdPostNo(href);
    const key = `${hBlogId}/${hPostNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank++;
    if (rank > 30) break;
    if (hBlogId === blogId) {
      if (foundRank === null && (!postNo || hPostNo === postNo)) foundRank = rank;
      found.push({ rank, blogId: hBlogId, postNo: hPostNo });
    }
  }
  return { rank: foundRank, found };
}

(async () => {
  const rssUrl = 'https://rss.blog.naver.com/rimi_77-.xml';
  const r = await axios.get(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000, responseType: 'text' });
  const $ = cheerio.load(r.data, { xmlMode: true });
  const posts: { title: string; url: string }[] = [];
  $('item').each((_i, el) => {
    const title = $(el).find('title').first().text().trim();
    const url = $(el).find('link').first().text().trim().split('?')[0];
    posts.push({ title, url });
  });
  console.log(`[STEP 1] RSS 글 ${posts.length}개 수집`);

  console.log(`\n[STEP 2] SERP 노출 추적 (m.blog.naver.com 매칭 포함)`);
  for (const post of posts.slice(0, 3)) {
    const { blogId, postNo } = extractBlogIdPostNo(post.url);
    console.log(`\n📝 ${post.title.slice(0, 50)}`);
    console.log(`   blogId=${blogId} postNo=${postNo}`);

    const kws = [
      '고유가 피해지원금',
      '고유가 지원금 2차',
      '건강보험료 기준',
      '부모급여 신청',
    ];

    for (const kw of kws.slice(0, 2)) {
      try {
        const res = await checkSerpRank(kw, blogId, postNo);
        const flag = res.rank !== null ? `✅ #${res.rank}` : '❌ 미노출';
        console.log(`   "${kw}" → ${flag}, 같은 블로그 다른 글 ${res.found.length}건`);
        if (res.found.length > 0) {
          console.log(`     예시: ${JSON.stringify(res.found.slice(0, 2))}`);
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        console.log(`   "${kw}" → 에러: ${e.message}`);
      }
    }
  }
  process.exit(0);
})();
