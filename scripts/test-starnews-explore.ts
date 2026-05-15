// starnewskorea 사이트 탐색 — RSS / 실시간 인기 섹션 식별
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const tryUrls = [
  'https://www.starnewskorea.com/',
  'https://www.starnewskorea.com/rss',
  'https://www.starnewskorea.com/rss/index.xml',
  'https://www.starnewskorea.com/rss/news.xml',
  'https://www.starnewskorea.com/rss/all.xml',
  'https://www.starnewskorea.com/feed',
  'https://www.starnewskorea.com/sitemap.xml',
  'https://www.starnewskorea.com/?sec=ranking',
  'https://stoo.asiae.co.kr/rss/index.xml', // 스타뉴스 자매지 (스투)
];

(async () => {
  for (const url of tryUrls) {
    try {
      const r = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept': '*/*' },
        timeout: 8000,
        validateStatus: () => true,
      });
      const ct = r.headers['content-type'] || '';
      const len = (r.data && r.data.length) || 0;
      console.log(`\n[${r.status}] ${url}\n  content-type: ${ct} bytes: ${len}`);
      if (r.status === 200 && len > 0) {
        const s = String(r.data).slice(0, 500);
        console.log(`  head 500: ${s.replace(/\s+/g, ' ').slice(0, 400)}`);
      }
    } catch (e: any) {
      console.log(`[ERR] ${url}: ${e.message}`);
    }
  }

  // 메인 페이지에서 ranking/popular 류 셀렉터 후보 식별
  console.log('\n\n=== 메인 페이지 구조 분석 ===');
  try {
    const r = await axios.get('https://www.starnewskorea.com/', {
      headers: { 'User-Agent': UA },
      timeout: 10000,
    });
    const $ = cheerio.load(r.data);

    // 후보 셀렉터들로 인기/랭킹 찾기
    const candidates = [
      '[class*="rank"]', '[class*="popular"]', '[class*="hot"]',
      '[class*="best"]', '[class*="top"]', '[id*="rank"]',
      '[class*="trend"]', 'ol.list', '.realtime',
    ];
    for (const sel of candidates) {
      const els = $(sel);
      if (els.length > 0 && els.length < 20) {
        console.log(`\n셀렉터 "${sel}" → ${els.length}개`);
        els.slice(0, 3).each((i, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 100);
          if (text) console.log(`   [${i}] ${text}`);
        });
      }
    }

    // 기사 제목 추출 시도 (h2, h3, .title 등)
    console.log('\n=== 일반 기사 제목 (참고) ===');
    const titles: string[] = [];
    $('a').each((_i, el) => {
      const t = $(el).text().trim();
      if (t.length >= 10 && t.length <= 60 && !titles.includes(t)) {
        titles.push(t);
      }
    });
    titles.slice(0, 15).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  } catch (e: any) {
    console.error('main fetch err:', e.message);
  }
  process.exit(0);
})();
