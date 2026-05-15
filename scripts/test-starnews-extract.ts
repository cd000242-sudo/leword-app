// starnews HOT 섹션 정확한 추출
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const r = await axios.get('https://www.starnewskorea.com/', {
    headers: { 'User-Agent': UA },
    timeout: 10000,
  });
  const $ = cheerio.load(r.data);

  // HOT 섹션 내부 자식 요소 분석
  console.log('=== HOT 섹션 내부 구조 ===');
  $('[class*="hot"]').each((idx, el) => {
    const $el = $(el);
    console.log(`\n--- HOT[${idx}] class="${$el.attr('class')}" ---`);
    // 직접 자식 분석
    $el.find('a').slice(0, 10).each((i, a) => {
      const $a = $(a);
      const title = $a.text().replace(/\s+/g, ' ').trim();
      const href = $a.attr('href') || '';
      if (title.length >= 5) console.log(`  ${i + 1}. [${href.slice(0, 60)}] ${title.slice(0, 80)}`);
    });
  });

  // 메인 페이지의 모든 기사 링크 패턴 식별
  console.log('\n\n=== 기사 링크 패턴 ===');
  const articleHrefs = new Set<string>();
  $('a').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (/^\/article|^\/news|^\/m\/article|\/[0-9]{4}/.test(href)) {
      articleHrefs.add(href);
    }
  });
  console.log(`기사 패턴 링크 개수: ${articleHrefs.size}`);
  Array.from(articleHrefs).slice(0, 8).forEach(h => console.log(`  ${h}`));

  // 카테고리 메뉴 찾기
  console.log('\n=== 카테고리 / 섹션 메뉴 ===');
  $('nav a, .menu a, [class*="cate"] a, header a').slice(0, 30).each((_i, el) => {
    const $a = $(el);
    const t = $a.text().trim();
    const h = $a.attr('href') || '';
    if (t.length >= 2 && t.length <= 10 && h) {
      console.log(`  ${t} → ${h}`);
    }
  });

  process.exit(0);
})();
