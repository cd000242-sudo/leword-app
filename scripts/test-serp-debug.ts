// 네이버 모바일 SERP 페이지 직접 분석 — blog.naver.com 링크 패턴 식별
import axios from 'axios';
import * as cheerio from 'cheerio';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

(async () => {
  const keyword = '고유가 피해지원금';
  const urls = [
    `https://m.search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`,
    `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(keyword)}`,
    `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(keyword)}`,
    `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`,
  ];

  for (const url of urls) {
    console.log(`\n████ ${url.slice(0, 100)} ████`);
    try {
      const ua = url.includes('m.search') ? MOBILE_UA : DESKTOP_UA;
      const r = await axios.get(url, {
        headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        timeout: 12000, responseType: 'text',
      });
      const $ = cheerio.load(r.data);
      const bytes = r.data.length;

      // blog.naver.com 링크 카운트
      const allBlogLinks: string[] = [];
      $('a[href*="blog.naver.com"]').each((_i, a) => {
        const href = $(a).attr('href') || '';
        allBlogLinks.push(href);
      });
      console.log(`bytes=${bytes}, blog.naver.com 링크: ${allBlogLinks.length}개`);
      allBlogLinks.slice(0, 6).forEach(h => console.log(`  ${h.slice(0, 120)}`));

      // crossstream / cafe / view 류 모든 a 패턴
      const allHrefs = new Set<string>();
      $('a').each((_i, a) => {
        const h = $(a).attr('href') || '';
        if (h && (h.includes('blog') || h.includes('cafe') || h.includes('post'))) allHrefs.add(h);
      });
      if (allBlogLinks.length === 0 && allHrefs.size > 0) {
        console.log('\n  blog 외 후보 (blog/cafe/post 포함):');
        Array.from(allHrefs).slice(0, 5).forEach(h => console.log(`    ${h.slice(0, 120)}`));
      }
    } catch (e: any) {
      console.error(`err: ${e.message}`);
    }
  }
  process.exit(0);
})();
