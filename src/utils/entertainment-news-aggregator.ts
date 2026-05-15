// v2.42.75: 연예 매체 통합 "갓 떴음" 모듈
// 4매체 병렬 크롤 — starnews(/latest-news/all + 연예 필터) + sportschosun + dispatch + 마이데일리
// AI API 미사용. 모두 HTTP fetch + cheerio.
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface EntertainmentArticle {
  source: 'starnews' | 'sportschosun' | 'dispatch' | 'mydaily';
  sourceLabel: string;
  title: string;
  url: string;
  category: string;
  publishedAt: string | null; // ISO 또는 null (시간 정보 없는 매체)
  ago: string;                // "15분 전" 또는 날짜 또는 "최근"
  minutesAgo: number | null;  // null = 시간 정보 없음 (마이데일리/디스패치)
}

const SOURCE_LABEL: Record<EntertainmentArticle['source'], string> = {
  starnews: '스타뉴스',
  sportschosun: '스포츠조선',
  dispatch: '디스패치',
  mydaily: '마이데일리',
};

function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[가-힣]{1,4}\s*=\s*[가-힣]{2,5}\s*기자\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  t = t.replace(/\s*[가-힣]{2,5}\s*기자\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  t = t.replace(/\s*[·・]\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  t = t.replace(/\s*\d+\s*(분|시간|일)\s*전\s*$/u, '');
  t = t.replace(/^[\d.]+\s*/, ''); // 앞에 붙는 순위 번호 ("01", "02" 등)
  t = t.replace(/\s*[가-힣]{1,4}\s*=\s*$/u, '');
  // 앞의 카테고리 라벨 (예: "방송 박정수", "예능 김영철") 제거
  t = t.replace(/^(방송|영화|K-POP|대중문화|연예|예능|드라마|스타)\s+/, '');
  return t.trim();
}

function parseAgoToMinutes(ago: string, datetime?: string): number | null {
  const m = ago.match(/(\d+)\s*(분|시간|일)/u);
  if (m) {
    const n = parseInt(m[1], 10);
    if (m[2] === '분') return n;
    if (m[2] === '시간') return n * 60;
    if (m[2] === '일') return n * 60 * 24;
  }
  if (datetime) {
    const dm = datetime.match(/(\d{4})\.(\d{2})\.(\d{2})\s*[・·]\s*(\d{2}):(\d{2})/);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(dm[4]), Number(dm[5]));
      return Math.floor((Date.now() - d.getTime()) / 60000);
    }
  }
  return null;
}

// ===== 1. STARNEWS (연예 카테고리만) =====
async function fetchStarnewsEnt(maxMinutesAgo: number, limit: number): Promise<EntertainmentArticle[]> {
  const BASE = 'https://www.starnewskorea.com';
  const ENT_CATEGORIES = /^\/(star|entertainment|broadcast-drama|broadcast-show|broadcast-|music)\//;
  const CAT_NAME: Array<[RegExp, string]> = [
    [/^\/star\//, '스타'],
    [/^\/broadcast-drama\//, '드라마'],
    [/^\/broadcast-show\//, '예능'],
    [/^\/broadcast-/, '방송'],
    [/^\/entertainment\//, '연예'],
    [/^\/music\//, '음악'],
  ];

  try {
    const r = await axios.get(`${BASE}/latest-news/all`, { headers: { 'User-Agent': UA }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const out: EntertainmentArticle[] = [];
    const seen = new Set<string>();

    $('time').each((_i, el) => {
      if (out.length >= limit * 2) return false;
      const $t = $(el);
      const ago = $t.text().trim();
      const dt = $t.attr('datetime') || '';
      let $cur = $t.parent();
      let found = false;
      for (let d = 0; d < 5 && !found; d++) {
        if ($cur.length === 0) break;
        // 조상 컨테이너 내 모든 a 순회 — ENT 카테고리 매칭하는 첫 번째
        $cur.find('a').each((_j, a) => {
          const href = $(a).attr('href') || '';
          if (!ENT_CATEGORIES.test(href)) return;
          if (seen.has(href)) return;
          const title = cleanTitle($(a).text());
          if (!title) return;
          const min = parseAgoToMinutes(ago, dt);
          if (min !== null && min > maxMinutesAgo) { found = true; return false; }
          seen.add(href);
          let cat = '연예';
          for (const [re, name] of CAT_NAME) if (re.test(href)) { cat = name; break; }
          out.push({
            source: 'starnews',
            sourceLabel: SOURCE_LABEL.starnews,
            title,
            url: BASE + href,
            category: cat,
            publishedAt: dt || null,
            ago,
            minutesAgo: min,
          });
          found = true;
          return false;
        });
        $cur = $cur.parent();
      }
    });

    return out.slice(0, limit);
  } catch { return []; }
}

// ===== 2. SPORTSCHOSUN /entertainment/ =====
async function fetchSportschosunEnt(maxMinutesAgo: number, limit: number): Promise<EntertainmentArticle[]> {
  try {
    const r = await axios.get('https://sports.chosun.com/entertainment/', { headers: { 'User-Agent': UA }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const out: EntertainmentArticle[] = [];
    const seen = new Set<string>();

    // "NN분전/시간전" 텍스트 → 부모 가까운 a 매칭
    $('*').each((_i, el) => {
      if (out.length >= limit * 2) return false;
      const $el = $(el);
      const txt = $el.clone().children().remove().end().text().trim();
      if (!/^\d+\s*(분|시간)\s*전$/.test(txt)) return;
      let $cur = $el.parent();
      for (let d = 0; d < 6 && $cur.length > 0; d++) {
        const $a = $cur.find('a[href*="/entertainment/"], a[href*="sportschosun.com"]').first();
        const href = $a.attr('href') || '';
        const raw = $a.text();
        const title = cleanTitle(raw);
        if (href && title.length >= 8 && !seen.has(href)) {
          seen.add(href);
          const min = parseAgoToMinutes(txt);
          if (min !== null && min <= maxMinutesAgo) {
            // 카테고리는 URL path 기반: /entertainment/, /baseball/, /soccer/ 등
            let cat = '연예';
            if (/\/baseball\//.test(href)) cat = '야구';
            else if (/\/soccer\//.test(href)) cat = '축구';
            else if (/\/basket\//.test(href)) cat = '농구';
            else if (/\/golf\//.test(href)) cat = '골프';
            // 연예 카테고리만 통과 (스포츠 제외)
            if (cat === '연예') {
              const url = href.startsWith('http') ? href : `https://sports.chosun.com${href}`;
              out.push({
                source: 'sportschosun',
                sourceLabel: SOURCE_LABEL.sportschosun,
                title,
                url,
                category: cat,
                publishedAt: null,
                ago: txt,
                minutesAgo: min,
              });
            }
          }
          break;
        }
        $cur = $cur.parent();
      }
    });

    return out.slice(0, limit);
  } catch { return []; }
}

// ===== 3. DISPATCH (시간 정보 없음, 최근 N건) =====
async function fetchDispatchLatest(limit: number): Promise<EntertainmentArticle[]> {
  try {
    const r = await axios.get('https://www.dispatch.co.kr/', { headers: { 'User-Agent': UA }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const out: EntertainmentArticle[] = [];
    const seen = new Set<string>();

    // 디스패치는 /숫자 형태의 기사 URL
    $('a').each((_i, el) => {
      if (out.length >= limit) return false;
      const $a = $(el);
      const href = ($a.attr('href') || '').split('?')[0].split('#')[0];
      if (!/^\/\d{6,}$/.test(href)) return;
      if (seen.has(href)) return;
      const title = cleanTitle($a.text());
      if (title.length < 8) return;
      seen.add(href);
      out.push({
        source: 'dispatch',
        sourceLabel: SOURCE_LABEL.dispatch,
        title,
        url: 'https://www.dispatch.co.kr' + href,
        category: '연예',
        publishedAt: null,
        ago: '최신',
        minutesAgo: null,
      });
    });

    return out;
  } catch { return []; }
}

// ===== 4. MYDAILY (시간 정보 없음) =====
async function fetchMydailyLatest(limit: number): Promise<EntertainmentArticle[]> {
  try {
    const r = await axios.get('https://www.mydaily.co.kr/', { headers: { 'User-Agent': UA }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const out: EntertainmentArticle[] = [];
    const seen = new Set<string>();

    // 마이데일리 기사 URL: /page/view/숫자
    $('a').each((_i, el) => {
      if (out.length >= limit) return false;
      const $a = $(el);
      const href = ($a.attr('href') || '').split('?')[0].split('#')[0];
      if (!/^\/page\/view\/\d{6,}$/.test(href)) return;
      const title = cleanTitle($a.text());
      if (title.length < 8 || seen.has(href)) return;
      seen.add(href);
      out.push({
        source: 'mydaily',
        sourceLabel: SOURCE_LABEL.mydaily,
        title,
        url: `https://www.mydaily.co.kr${href}`,
        category: '연예',
        publishedAt: null,
        ago: '최신',
        minutesAgo: null,
      });
    });

    return out;
  } catch { return []; }
}

// ===== 통합 =====
export async function fetchEntertainmentAggregate(opts: { maxMinutesAgo?: number; limitPerSource?: number } = {}): Promise<EntertainmentArticle[]> {
  const maxMin = opts.maxMinutesAgo ?? 180;
  const limitPer = opts.limitPerSource ?? 8;

  const [s1, s2, s3, s4] = await Promise.all([
    fetchStarnewsEnt(maxMin, limitPer).catch(() => []),
    fetchSportschosunEnt(maxMin, limitPer).catch(() => []),
    fetchDispatchLatest(limitPer).catch(() => []),
    fetchMydailyLatest(limitPer).catch(() => []),
  ]);

  const all = [...s1, ...s2, ...s3, ...s4];
  // 정렬: 시간 정보 있는 게 먼저, 그 내에서 신선 순
  all.sort((a, b) => {
    const aHasTime = a.minutesAgo !== null;
    const bHasTime = b.minutesAgo !== null;
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    if (aHasTime && bHasTime) return (a.minutesAgo as number) - (b.minutesAgo as number);
    return 0;
  });

  // 매체별 통계
  return all;
}
