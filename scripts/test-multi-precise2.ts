// 매체별 시간 + 기사 매칭 정밀 분석 v2
import axios from 'axios';
import * as cheerio from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function inspect(label: string, url: string, ua = UA) {
  console.log(`\n\n████ ${label} ████`);
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html', 'Accept-Language': 'ko-KR' }, timeout: 12000, validateStatus: () => true });
    console.log(`status=${r.status} bytes=${r.data?.length || 0}`);
    if (r.status !== 200) return;
    const $ = cheerio.load(r.data);

    // 1. "NN분 전" 텍스트 발견 시 → 가장 가까운 ancestor a 태그
    console.log('\n--- 시간 표시 정밀 매칭 ---');
    let count = 0;
    $('*').each((_i, el) => {
      if (count >= 8) return false;
      const $el = $(el);
      const txt = $el.clone().children().remove().end().text().trim();
      if (!/\d+\s*(분|시간)\s*전$/.test(txt)) return;
      if (txt.length >= 20) return;
      // 조상 5단계까지 a 찾기
      let $cur = $el.parent();
      for (let d = 0; d < 6 && $cur.length > 0; d++) {
        const $a = $cur.find('a').first();
        const href = $a.attr('href') || '';
        const title = $a.text().replace(/\s+/g, ' ').trim();
        if (href && title.length >= 8) {
          console.log(`  ago="${txt}" depth=${d} href="${href.slice(0, 60)}" title="${title.slice(0, 60)}"`);
          count++;
          break;
        }
        $cur = $cur.parent();
      }
    });

    // 2. 기사 URL 패턴
    console.log('\n--- 기사 링크 패턴 ---');
    const hrefSet = new Set<string>();
    $('a').each((_i, el) => {
      const href = ($(el).attr('href') || '').split('?')[0].split('#')[0];
      if (/news\/htm|article|view\.html|\/\d{7,}/.test(href)) hrefSet.add(href);
    });
    console.log(`총 ${hrefSet.size}개`);
    Array.from(hrefSet).slice(0, 8).forEach(h => console.log(`  ${h.slice(0, 80)}`));
  } catch (e: any) {
    console.error(e.message);
  }
}

(async () => {
  await inspect('sportschosun /entertainment', 'https://sports.chosun.com/entertainment/');
  await inspect('dispatch main', 'https://www.dispatch.co.kr/');
  await inspect('tenasia mobile', 'https://m.tenasia.co.kr/', MOBILE_UA);
  await inspect('tenasia desktop alt', 'https://www.tenasia.co.kr/news.php');
  process.exit(0);
})();
