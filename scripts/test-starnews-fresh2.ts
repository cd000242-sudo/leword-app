// time 태그 주변 a 태그 매칭 정밀 분석
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const r = await axios.get('https://www.starnewskorea.com/latest-news/all', {
    headers: { 'User-Agent': UA }, timeout: 10000,
  });
  const $ = cheerio.load(r.data);

  // time 태그 → 가장 가까운 a 태그 (조상 또는 형제 트리)
  $('time').slice(0, 8).each((i, el) => {
    const $t = $(el);
    const dt = $t.attr('datetime') || '';
    const ago = $t.text().trim();

    // 부모/조상 컨테이너 탐색
    let $container = $t.parent();
    let depth = 0;
    while (depth < 5 && $container.length > 0) {
      const $a = $container.find('a').first();
      const href = $a.attr('href') || '';
      const title = $a.text().replace(/\s+/g, ' ').trim();
      if (href && /^\/[a-z-]+\/\d{4}/.test(href) && title.length >= 5) {
        console.log(`[${i}] depth=${depth} ago="${ago}" dt="${dt}"`);
        console.log(`     href=${href.slice(0, 70)}`);
        console.log(`     title=${title.slice(0, 80)}`);
        break;
      }
      $container = $container.parent();
      depth++;
    }
  });
  process.exit(0);
})();
