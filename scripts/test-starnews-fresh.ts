// starnews의 "최신 기사" 페이지에서 발행시간 + 카테고리별 fresh 기사 찾기
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://www.starnewskorea.com';

const targets = [
  `${BASE}/latest-news/all`,
  `${BASE}/entertainment/tv`,
  `${BASE}/special/hot-issue?type=enter`,
];

(async () => {
  for (const url of targets) {
    console.log(`\n\n=== ${url} ===`);
    try {
      const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
      const $ = cheerio.load(r.data);
      console.log(`status=${r.status} bytes=${r.data.length}`);

      // 발행 시간 표시 후보 셀렉터
      const timePatterns = [
        '[class*="date"]', '[class*="time"]', '[class*="ago"]',
        'time', '[datetime]',
      ];
      for (const sel of timePatterns) {
        const els = $(sel);
        if (els.length > 0 && els.length < 50) {
          console.log(`\n  셀렉터 "${sel}" → ${els.length}개`);
          els.slice(0, 5).each((i, el) => {
            const t = $(el).text().trim();
            const dt = $(el).attr('datetime');
            if (t) console.log(`    [${i}] text="${t.slice(0, 60)}" datetime="${dt || '-'}"`);
          });
        }
      }

      // 기사 list item 셀렉터 후보 (제목+시간 묶음)
      console.log('\n  === 기사 리스트 셀렉터 후보 ===');
      const listCandidates = ['li', 'article', '[class*="item"]', '[class*="card"]'];
      for (const sel of listCandidates) {
        const els = $(sel);
        if (els.length >= 5 && els.length <= 50) {
          console.log(`\n  "${sel}" → ${els.length}개 (샘플 3개):`);
          els.slice(0, 3).each((i, el) => {
            const $el = $(el);
            const linkA = $el.find('a').first();
            const href = linkA.attr('href') || '';
            const title = linkA.text().replace(/\s+/g, ' ').trim().slice(0, 60);
            const innerText = $el.text().replace(/\s+/g, ' ').trim().slice(0, 200);
            if (href && /^\/[a-z-]+\/\d{4}/.test(href)) {
              console.log(`    [${i}] href=${href.slice(0, 50)}`);
              console.log(`        title=${title}`);
              console.log(`        full text=${innerText}`);
            }
          });
        }
      }
    } catch (e: any) {
      console.error(`fetch err: ${e.message}`);
    }
  }
  process.exit(0);
})();
