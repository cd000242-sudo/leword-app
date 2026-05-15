// rimi_77- 블로그 → RSS 수집 → 핵심 키워드 매칭 → SERP 노출 추적 풀 사이클 테스트
// 실측: 실제 검색해서 사용자 글이 top 30 내에 있는지 확인
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (compatible; LEWORD-tracker/1.0)';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function fetchBlogPosts(rssUrl: string) {
  const r = await axios.get(rssUrl, { headers: { 'User-Agent': UA }, timeout: 10000, responseType: 'text' });
  const $ = cheerio.load(r.data, { xmlMode: true });
  const posts: any[] = [];
  $('item').each((_i, el) => {
    const $el = $(el);
    posts.push({
      title: $el.find('title').first().text().trim(),
      url: $el.find('link').first().text().trim().split('?')[0],
      pubDate: $el.find('pubDate').first().text().trim(),
    });
  });
  return posts;
}

function extractBlogIdPostNo(url: string): { blogId: string; postNo: string } {
  const m = url.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (m) return { blogId: m[1], postNo: m[2] };
  const m2 = url.match(/PostView\.naver\?blogId=([^&]+)&logNo=(\d+)/);
  if (m2) return { blogId: m2[1], postNo: m2[2] };
  return { blogId: '', postNo: '' };
}

async function checkSerpRank(keyword: string, blogId: string, postNo: string): Promise<{ rank: number | null; found: { rank: number; href: string }[] }> {
  const url = `https://m.search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
  const r = await axios.get(url, {
    headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    timeout: 12000, responseType: 'text',
  });
  const $ = cheerio.load(r.data);
  const links: { href: string; isAd: boolean }[] = [];
  $('a').each((_i, el) => {
    const href = String($(el).attr('href') || '');
    if (!href.includes('blog.naver.com')) return;
    const $parent = $(el).closest('.type_ad,.ad_section,.lst_ad');
    links.push({ href, isAd: $parent.length > 0 });
  });

  let rank = 0;
  const seen = new Set<string>();
  const found: { rank: number; href: string }[] = [];
  let foundRank: number | null = null;
  for (const { href, isAd } of links) {
    if (isAd) continue;
    const m = href.match(/blog\.naver\.com\/(?:PostView\.naver\?blogId=([^&]+)&logNo=(\d+)|([^/?#]+)\/(\d+))/i);
    const hBlogId = m?.[1] || m?.[3] || '';
    const hPostNo = m?.[2] || m?.[4] || '';
    const key = `${hBlogId}/${hPostNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rank++;
    if (rank > 30) break;
    if (hBlogId === blogId) {
      const matchPost = postNo ? hPostNo === postNo : true;
      if (matchPost && foundRank === null) foundRank = rank;
      found.push({ rank, href: href.slice(0, 80) });
    }
  }
  return { rank: foundRank, found };
}

(async () => {
  console.log('=== STEP 1: RSS 글 수집 ===');
  const posts = await fetchBlogPosts('https://rss.blog.naver.com/rimi_77-.xml');
  console.log(`총 ${posts.length}개 글 수집`);

  // 최근 글 3개의 핵심 키워드 추출 (제목에서 첫 명사 그룹)
  console.log('\n=== STEP 2: 핵심 키워드 + 실제 SERP 노출 추적 ===');
  for (const post of posts.slice(0, 5)) {
    const { blogId, postNo } = extractBlogIdPostNo(post.url);
    console.log(`\n글: ${post.title.slice(0, 60)}`);
    console.log(`URL: ${post.url}`);
    console.log(`blogId=${blogId} postNo=${postNo}`);

    // 제목에서 후보 키워드 추출 (대표 명사)
    const candidates = [
      '고유가 피해지원금',
      '고유가 피해지원금 2차',
      '고유가 지원금',
      '부모급여',
      '건강보험료 기준',
    ].filter(kw => post.title.includes(kw.split(' ')[0]));

    for (const kw of candidates.slice(0, 2)) {
      try {
        const result = await checkSerpRank(kw, blogId, postNo);
        const flag = result.rank !== null ? `✅ #${result.rank}` : '❌ 미노출';
        console.log(`  "${kw}" → ${flag} (블로그 다른 글 ${result.found.length}건 발견)`);
        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        console.log(`  "${kw}" → 에러: ${e.message}`);
      }
    }
  }

  process.exit(0);
})();
