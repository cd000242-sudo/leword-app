// 매체별 기사 리스트 정밀 셀렉터 분석
import axios from 'axios';
import * as cheerio from 'cheerio';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function inspect(label: string, url: string, selectors: string[]) {
  console.log(`\n\n████ ${label}: ${url} ████`);
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 12000 });
    const $ = cheerio.load(r.data);

    // 시간 표시 정규식 직접 검색 (DOM 탐색)
    console.log('\n--- "NN분 전" 패턴 검색 ---');
    $('*').each((_i, el) => {
      const txt = $(el).clone().children().remove().end().text().trim();
      if (/\d+\s*분\s*전$/.test(txt) && txt.length < 15) {
        const $el = $(el);
        const parent = $el.parent();
        const closeA = parent.find('a').first();
        const href = closeA.attr('href') || '';
        const title = closeA.text().replace(/\s+/g, ' ').trim().slice(0, 70);
        console.log(`  ago="${txt}" parent=${parent.prop('tagName')}.${(parent.attr('class') || '').slice(0, 50)} title="${title}" href="${href.slice(0, 60)}"`);
      }
    });

    // 사용자 지정 셀렉터들 시도
    for (const sel of selectors) {
      const els = $(sel);
      if (els.length > 0 && els.length < 60) {
        console.log(`\n--- "${sel}" → ${els.length}개 (샘플 3개) ---`);
        els.slice(0, 3).each((i, el) => {
          const $el = $(el);
          const innerText = $el.text().replace(/\s+/g, ' ').trim().slice(0, 180);
          const a = $el.find('a').first();
          const href = a.attr('href') || '';
          console.log(`  [${i}] href=${href.slice(0, 60)}`);
          console.log(`      text=${innerText}`);
        });
      }
    }
  } catch (e: any) {
    console.error(e.message);
  }
}

(async () => {
  await inspect('starnews/entertainment/tv', 'https://www.starnewskorea.com/entertainment/tv', ['li', 'article', '[class*="list"]', '[class*="item"]', '[class*="news"]']);
  await inspect('sportschosun/ent', 'https://sports.chosun.com/entertainment/', ['.list_news li', '.news_list li', 'li', 'article', '.tit']);
  await inspect('dispatch', 'https://www.dispatch.co.kr/', ['.news_list li', '.gird_list_box', 'li', 'article']);
  await inspect('tenasia', 'https://www.tenasia.co.kr/', ['li.list', 'article', '.article_list li']);
  process.exit(0);
})();
