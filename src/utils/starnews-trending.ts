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
  [/^\/broadcast-drama\//, '드라마'],
  [/^\/broadcast-show\//, '예능'],
  [/^\/broadcast-/, '방송'],
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

// v2.42.74: "갓 떴는데 아직 HOT 아닌" 선점 가능 기사 발굴
export interface FreshArticle {
  title: string;
  url: string;
  category: string;
  publishedAt: string; // ISO
  ago: string;         // "15분 전"
  minutesAgo: number;
  competing: boolean;  // HOT 섹션 인물/주제와 겹쳐 이미 늦은 경우
}

// 제목에서 "지역명=기자명 · NN분 전" 같은 꼬리 제거
function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  // "···지역명=기자명 ・ NN분 전" (예: "수원=김동윤 기자 ・ 19분 전")
  t = t.replace(/\s*[가-힣]{1,4}\s*=\s*[가-힣]{2,5}\s*기자\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  // "···기자 ・ NN분 전"
  t = t.replace(/\s*[가-힣]{2,5}\s*기자\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  // 단독 "NN분 전" 꼬리
  t = t.replace(/\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  // "···지역명=" 단독 꼬리 (위 정규식에서 못 잡은 경우)
  t = t.replace(/\s*[가-힣]{1,4}\s*=\s*$/u, '');
  return t.trim();
}

function parseAgoToMinutes(ago: string, datetime?: string): number {
  const m = ago.match(/(\d+)\s*(분|시간|일)/u);
  if (m) {
    const n = parseInt(m[1], 10);
    if (m[2] === '분') return n;
    if (m[2] === '시간') return n * 60;
    if (m[2] === '일') return n * 60 * 24;
  }
  if (datetime) {
    // "2026.05.16 ・ 06:33" → Date
    const dm = datetime.match(/(\d{4})\.(\d{2})\.(\d{2})\s*[・·]\s*(\d{2}):(\d{2})/);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(dm[4]), Number(dm[5]));
      return Math.floor((Date.now() - d.getTime()) / 60000);
    }
  }
  return 9999;
}

// HOT 섹션에서 인물/주제 토큰 추출 (제목 단어 단위, 2자+)
function extractHotTokens(hotTitles: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const t of hotTitles) {
    // 한글 명사 + 영문 단어 + '인용/한자 묶음' 추출
    const words = t.match(/[가-힣A-Za-z]{2,}/gu) || [];
    for (const w of words) {
      if (w.length >= 2 && w.length <= 10) tokens.add(w);
    }
  }
  // 너무 일반적인 토큰 제외
  const STOP = new Set(['단독', '종합', 'OFFICIAL', '인터뷰', '화보', '단숨', '美친', '진짜', '근황', '포착', '공개', '소속', '예고', '연예', '스포츠', '컬처']);
  for (const s of STOP) tokens.delete(s);
  return tokens;
}

export async function fetchStarNewsFresh(opts: { maxMinutesAgo?: number; limit?: number } = {}): Promise<FreshArticle[]> {
  const maxMin = opts.maxMinutesAgo ?? 180; // 기본 3시간
  const limit = opts.limit ?? 12;
  try {
    const [latestResp, mainResp] = await Promise.all([
      axios.get(`${BASE}/latest-news/all`, { headers: { 'User-Agent': UA }, timeout: 12000 }),
      axios.get(`${BASE}/`, { headers: { 'User-Agent': UA }, timeout: 12000 }).catch(() => null),
    ]);
    const $ = cheerio.load(latestResp.data);

    // HOT 섹션 토큰 (메인 페이지에서) — 이미 뜬 인물/주제 식별
    let hotTokens = new Set<string>();
    if (mainResp) {
      const $main = cheerio.load(mainResp.data);
      const hotTitles: string[] = [];
      $main('[class^="photos_section"] a').each((_i, a) => {
        const t = $main(a).text().replace(/\s+/g, ' ').trim();
        if (t.length >= 5) hotTitles.push(t);
      });
      hotTokens = extractHotTokens(hotTitles);
    }

    const items: FreshArticle[] = [];
    const seen = new Set<string>();

    $('time').each((_i, el) => {
      if (items.length >= limit * 2) return false; // 여유분 확보 (필터 후 limit 맞춤)
      const $t = $(el);
      const dt = $t.attr('datetime') || '';
      const ago = $t.text().trim();

      // 부모 조상 탐색하여 a 태그 찾기 (최대 depth 5)
      let $container = $t.parent();
      let depth = 0;
      while (depth < 5 && $container.length > 0) {
        const $a = $container.find('a').first();
        const href = $a.attr('href') || '';
        const rawTitle = $a.text().replace(/\s+/g, ' ').trim();
        if (href && /^\/[a-z-]+\/\d{4}/.test(href) && rawTitle.length >= 5) {
          const title = cleanTitle(rawTitle);
          if (seen.has(href)) return;
          seen.add(href);
          const minutesAgo = parseAgoToMinutes(ago, dt);
          // HOT 토큰과 겹치는지 검사
          let competing = false;
          for (const tok of hotTokens) {
            if (title.includes(tok)) { competing = true; break; }
          }
          items.push({
            title,
            url: BASE + href,
            category: classifyCategory(href),
            publishedAt: dt,
            ago,
            minutesAgo,
            competing,
          });
          break;
        }
        $container = $container.parent();
        depth++;
      }
    });

    // 필터 + 정렬: 최근 N분 이내 + 비경쟁 우선, 시간순
    const fresh = items
      .filter(i => i.minutesAgo <= maxMin)
      .sort((a, b) => {
        // 비경쟁 우선
        if (a.competing !== b.competing) return a.competing ? 1 : -1;
        // 최근 우선
        return a.minutesAgo - b.minutesAgo;
      })
      .slice(0, limit);

    return fresh;
  } catch (err: any) {
    console.warn('[STARNEWS-FRESH] fetch 실패:', err?.message);
    return [];
  }
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
