// v2.42.73: 스타뉴스코리아 실시간/인기 기사 크롤
// 메인 페이지의 HOT 섹션 + 일반 트렌딩 기사 추출
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://www.starnewskorea.com';

export interface StarNewsItem {
  rank: number;
  title: string;
  url: string;
  category: string;
  isHot: boolean; // HOT 섹션 출처 여부
}

const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/^\/star\//, '스타'],
  [/^\/entertainment\//, '연예'],
  [/^\/music\//, '음악'],
  [/^\/sports\//, '스포츠'],
  [/^\/culture-magazine\//, '컬처'],
  [/^\/business-life\//, '비즈'],
  [/^\/special\//, '이슈'],
  [/^\/media\//, '영상'],
  [/^\/latest-news\//, '최신'],
];

function classifyCategory(path: string): string {
  for (const [re, name] of CATEGORY_MAP) {
    if (re.test(path)) return name;
  }
  return '기타';
}

function isArticleHref(href: string): boolean {
  // 기사 URL 패턴: /{section}/YYYY/MM/DD/숫자
  return /^\/[a-z-]+\/\d{4}\/\d{2}\/\d{2}\/\d+/.test(href);
}

export async function fetchStarNewsTrending(limit = 10): Promise<StarNewsItem[]> {
  try {
    const r = await axios.get(`${BASE}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      timeout: 12000,
    });
    const $ = cheerio.load(r.data);

    const items: StarNewsItem[] = [];
    const seenTitles = new Set<string>();
    const seenUrls = new Set<string>();

    // 1) HOT 섹션 (photos_section 또는 class*="hot")
    const hotSelectors = ['[class^="photos_section"]', '[class*="HotSection"]', '[class*="hot_section"]'];
    for (const sel of hotSelectors) {
      $(sel).find('a').each((_i, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        if (!isArticleHref(href)) return;
        const title = $a.text().replace(/\s+/g, ' ').trim();
        if (!title || title.length < 5 || title.length > 100) return;
        if (seenTitles.has(title) || seenUrls.has(href)) return;
        seenTitles.add(title);
        seenUrls.add(href);
        items.push({
          rank: items.length + 1,
          title,
          url: BASE + href,
          category: classifyCategory(href),
          isHot: true,
        });
      });
      if (items.length >= 5) break;
    }

    // 2) 메인 페이지 일반 트렌딩 기사
    $('a').each((_i, a) => {
      if (items.length >= limit) return false;
      const $a = $(a);
      const href = $a.attr('href') || '';
      if (!isArticleHref(href)) return;
      const title = $a.text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 10 || title.length > 100) return;
      if (seenTitles.has(title) || seenUrls.has(href)) return;
      // 사진/광고 가능성 — 너무 짧거나 캡션 같은 경우 패스
      if (/^\[.*\]$/.test(title)) return;
      seenTitles.add(title);
      seenUrls.add(href);
      items.push({
        rank: items.length + 1,
        title,
        url: BASE + href,
        category: classifyCategory(href),
        isHot: false,
      });
    });

    return items.slice(0, limit);
  } catch (err: any) {
    console.warn('[STARNEWS] fetch 실패:', err?.message);
    return [];
  }
}
