import axios from 'axios';
import * as cheerio from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

(async () => {
  // mydaily 실제 a 패턴 분석
  console.log('=== MYDAILY 실제 a 패턴 ===');
  const r = await axios.get('https://www.mydaily.co.kr/', { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(r.data);
  const hrefSamples = new Set<string>();
  $('a').each((_i, el) => {
    const h = $(el).attr('href') || '';
    const t = $(el).text().trim();
    if (h && t.length >= 10 && t.length <= 80) {
      hrefSamples.add(h.split('?')[0].split('#')[0]);
    }
  });
  console.log(`고유 href: ${hrefSamples.size}`);
  Array.from(hrefSamples).slice(0, 15).forEach(h => console.log(`  ${h}`));

  // starnews /latest-news/all 의 a + time 매칭 다시
  console.log('\n=== STARNEWS 카테고리 필터 매칭 디버그 ===');
  const sr = await axios.get('https://www.starnewskorea.com/latest-news/all', { headers: { 'User-Agent': UA } });
  const $s = cheerio.load(sr.data);
  let count = 0;
  $s('time').slice(0, 10).each((_i, el) => {
    const $t = $s(el);
    const ago = $t.text().trim();
    let $cur = $t.parent();
    for (let d = 0; d < 5; d++) {
      // 모든 a를 검사
      const allAs = $cur.find('a');
      let found = false;
      allAs.each((_j, a) => {
        const href = $s(a).attr('href') || '';
        if (/^\/(star|entertainment|broadcast-)/.test(href)) {
          const title = $s(a).text().trim().slice(0, 50);
          console.log(`  ${ago} | href="${href.slice(0, 60)}" | title="${title}"`);
          found = true;
          count++;
          return false;
        }
      });
      if (found) break;
      $cur = $cur.parent();
      if ($cur.length === 0) break;
    }
  });
  console.log(`총 매칭: ${count}`);
  process.exit(0);
})();
