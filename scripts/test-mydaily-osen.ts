// tenasia 대체 후보 — 마이데일리/OSEN 탐색
import axios from 'axios';
import * as cheerio from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function inspect(label: string, url: string) {
  console.log(`\n████ ${label} ${url} ████`);
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }, timeout: 12000, validateStatus: () => true });
    console.log(`status=${r.status} bytes=${r.data?.length || 0}`);
    if (r.status !== 200) return;
    const $ = cheerio.load(r.data);
    const fullText = $.text();
    const min = (fullText.match(/\d+\s*분\s*전/g) || []).slice(0, 5);
    const hr = (fullText.match(/\d+\s*시간\s*전/g) || []).slice(0, 5);
    console.log(`"분 전" ${min.length}개 (${min.join(',')}) / "시간 전" ${hr.length}개`);

    // 시간 + 인접 a 매칭
    let cnt = 0;
    $('*').each((_i, el) => {
      if (cnt >= 5) return false;
      const $el = $(el);
      const txt = $el.clone().children().remove().end().text().trim();
      if (!/\d+\s*(분|시간)\s*전$/.test(txt) || txt.length >= 15) return;
      let $cur = $el.parent();
      for (let d = 0; d < 6 && $cur.length > 0; d++) {
        const $a = $cur.find('a').first();
        const href = $a.attr('href') || '';
        const title = $a.text().replace(/\s+/g, ' ').trim();
        if (href && title.length >= 8) {
          console.log(`  ${txt} → ${href.slice(0, 70)} | ${title.slice(0, 60)}`);
          cnt++;
          break;
        }
        $cur = $cur.parent();
      }
    });
  } catch (e: any) { console.error(e.message); }
}

(async () => {
  await inspect('mydaily', 'https://www.mydaily.co.kr/');
  await inspect('mydaily entertainment', 'https://www.mydaily.co.kr/page/news_list.php?cate=ent');
  await inspect('osen', 'https://osen.mt.co.kr/');
  await inspect('osen entertainment', 'https://osen.mt.co.kr/category/entertainment');
  process.exit(0);
})();
