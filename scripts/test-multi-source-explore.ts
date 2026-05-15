// 4개 연예 매체 구조 탐색 — starnews(/entertainment/tv), sportschosun, dispatch, tenasia
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const targets = [
  { name: 'starnews-entertainment', url: 'https://www.starnewskorea.com/entertainment/tv' },
  { name: 'sportschosun-main', url: 'https://sports.chosun.com/' },
  { name: 'sportschosun-ent', url: 'https://sports.chosun.com/entertainment/' },
  { name: 'dispatch-main', url: 'https://www.dispatch.co.kr/' },
  { name: 'tenasia-com', url: 'https://www.tenasia.co.kr/' },
  { name: 'tenasia-hk', url: 'https://www.tenasia.hankyung.com/' },
];

(async () => {
  for (const t of targets) {
    console.log(`\n\n=== ${t.name}: ${t.url} ===`);
    try {
      const r = await axios.get(t.url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
        timeout: 12000,
        validateStatus: () => true,
        maxRedirects: 5,
      });
      console.log(`status=${r.status} bytes=${r.data?.length || 0}`);
      if (r.status !== 200) continue;

      const $ = cheerio.load(r.data);

      // 1) <time> 태그
      const timeEls = $('time');
      console.log(`<time> 태그: ${timeEls.length}개`);
      timeEls.slice(0, 5).each((i, el) => {
        const $el = $(el);
        console.log(`  [${i}] text="${$el.text().trim().slice(0, 40)}" datetime="${$el.attr('datetime') || '-'}"`);
      });

      // 2) 시간 표시 텍스트 패턴 (NN분 전 / 시간 / 일자)
      const fullText = $.text();
      const minMatches = fullText.match(/\d+\s*분\s*전/g) || [];
      const hourMatches = fullText.match(/\d+\s*시간\s*전/g) || [];
      const dateMatches = fullText.match(/\d{4}[-./]\d{2}[-./]\d{2}/g) || [];
      console.log(`텍스트 "분 전" 등장: ${minMatches.length}개 (예: ${minMatches.slice(0, 3).join(', ')})`);
      console.log(`텍스트 "시간 전" 등장: ${hourMatches.length}개`);
      console.log(`날짜 패턴 등장: ${dateMatches.length}개 (예: ${dateMatches.slice(0, 3).join(', ')})`);

      // 3) 기사 링크 패턴 추출
      const articleHrefs = new Set<string>();
      $('a').each((_i, el) => {
        const href = $(el).attr('href') || '';
        // 통상 기사: 숫자 ID 또는 yyyy/mm/dd 패턴
        if (/^\/[a-z-/_]*\d{6,}/.test(href) || /\/news\/\d/.test(href) || /article(View)?/.test(href)) {
          articleHrefs.add(href.split('?')[0].split('#')[0]);
        }
      });
      console.log(`기사 URL 패턴 개수: ${articleHrefs.size}`);
      Array.from(articleHrefs).slice(0, 5).forEach(h => console.log(`  ${h.slice(0, 80)}`));

      // 4) 메인 카테고리 메뉴
      const cats: string[] = [];
      $('nav a, header a, .menu a').slice(0, 12).each((_i, el) => {
        const t = $(el).text().trim();
        if (t.length >= 2 && t.length <= 8 && !cats.includes(t)) cats.push(t);
      });
      console.log(`카테고리 메뉴 (top): ${cats.slice(0, 10).join(' | ')}`);

    } catch (e: any) {
      console.error(`fetch err: ${e.message}`);
    }
  }
  process.exit(0);
})();
