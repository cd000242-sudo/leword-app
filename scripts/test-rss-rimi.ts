// 사용자 제공 RSS URL 직접 검증 + 실제 노출 추적 흐름 단위 테스트
import axios from 'axios';
import * as cheerio from 'cheerio';
const UA = 'Mozilla/5.0 (compatible; LEWORD-tracker/1.0)';

const candidates = [
  'https://blog.naver.com/rimi_77-.xml',
  'https://rss.blog.naver.com/rimi_77-.xml',
  'https://blog.naver.com/rimi_77.xml',
  'https://rss.blog.naver.com/rimi_77.xml',
];

(async () => {
  for (const url of candidates) {
    try {
      const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000, validateStatus: () => true, responseType: 'text' });
      const bytes = (r.data && r.data.length) || 0;
      console.log(`\n[${r.status}] ${url} bytes=${bytes}`);
      if (r.status !== 200 || bytes < 200) {
        console.log(`  head: ${String(r.data || '').slice(0, 200)}`);
        continue;
      }
      const $ = cheerio.load(r.data, { xmlMode: true });
      const items = $('item');
      console.log(`  RSS <item> 개수: ${items.length}`);
      items.slice(0, 5).each((i, el) => {
        const $el = $(el);
        const title = $el.find('title').first().text().trim();
        const link = $el.find('link').first().text().trim();
        const pubDate = $el.find('pubDate').first().text().trim();
        console.log(`  ${i + 1}. ${title.slice(0, 60)}`);
        console.log(`     ${link}`);
        console.log(`     ${pubDate}`);
      });
    } catch (e: any) {
      console.log(`[ERR] ${url}: ${e.message}`);
    }
  }
  process.exit(0);
})();
