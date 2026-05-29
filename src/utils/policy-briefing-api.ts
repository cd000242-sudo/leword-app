import axios from 'axios';
import * as cheerio from 'cheerio';

export interface PolicyBriefingKeyword {
  rank: number;
  keyword: string;
  title?: string;
  source: string;
  timestamp: string;
  category?: string;
  publishedAt?: string;
  url?: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const RSS_URLS = [
  'https://www.korea.kr/rss/policy.xml',
  'https://www.korea.kr/rss/pressrelease.xml',
  'https://www.korea.kr/rss/ebriefing.xml',
  'https://www.korea.kr/rss/expdoc.xml',
  'https://www.korea.kr/rss/dept_mw.xml',
  'https://www.korea.kr/rss/dept_moel.xml',
  'https://www.korea.kr/rss/dept_molit.xml',
  'https://www.korea.kr/rss/dept_mss.xml',
  'https://www.korea.kr/rss/dept_moef.xml',
  'https://www.korea.kr/rss/dept_mogef.xml',
  'https://www.korea.kr/rss/dept_mois.xml',
];

const HTML_URLS = [
  'https://www.korea.kr/',
  'https://m.korea.kr/index.do',
  'https://www.korea.kr/news/policyNewsList.do',
  'https://www.korea.kr/briefing/pressReleaseList.do',
];

const SUPPORT_RE = /(지원금|보조금|수당|급여|바우처|쿠폰|할인권|환급|장려금|소비쿠폰|펀드|대출|융자|감면|공제|신청|지급|대상|자격|모집|채용|공고|청년|소상공인|자영업|저소득|취약계층|고용|일자리|복지|주거|육아|출산|의료|교육|창업|민생)/;
const EXCLUDE_RE = /^(더보기|전체보기|검색|로그인|회원가입|메뉴|홈|정책브리핑|대한민국|정부|뉴스|공지|바로가기|prev|next|이전|다음|\d+)$/i;
const INTENT_RE = /(지원금|보조금|수당|급여|바우처|쿠폰|할인권|환급|장려금|소비쿠폰|펀드|대출|융자|감면|공제|신청|지급|대상|자격|모집|채용|공고|혜택|접수|시행|확대|신설|개편)/;
const AUDIENCE_RE = /(청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)/;
const DISPLAY_TITLE_MAX = 96;

function decodeHtmlEntities(text: string): string {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#034;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/\[[^\]]{1,16}\]/g, ' ')
    .replace(/「|」|『|』|“|”/g, '"')
    .replace(/^\d{1,2}(?:\.\s*|\s+)/, '')
    .replace(/^(NEW|▶|▲|▼)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, max: number = DISPLAY_TITLE_MAX): string {
  const clean = cleanText(text);
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max + 1);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(max * 0.55) ? head.slice(0, lastSpace) : head.slice(0, max);
  return `${cut.trim()}...`;
}

export function compactPolicyDisplayTitle(title: string, fallbackKeyword: string = ''): string {
  let clean = cleanText(title || fallbackKeyword)
    .replace(/\s*(바로가기|본문 바로가기|전체보기|더보기)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = cleanText(fallbackKeyword);
  if (!clean) return fallback;

  const dashHead = clean.split(/\s[-–—]\s/)[0]?.trim();
  if (dashHead && dashHead.length >= 8 && dashHead.length <= 120) {
    clean = dashHead;
  } else {
    const sentence =
      clean.match(/^(.{10,120}?(?:습니다|합니다|됩니다|했습니다|밝혔습니다|한다|된다|했다|이다)\.)\s/) ||
      clean.match(/^(.{20,120}?[.!?])\s/);
    if (sentence?.[1]) clean = sentence[1].trim();
  }

  if (clean.length > 140 && fallback) {
    return fallback;
  }
  return truncateText(clean, DISPLAY_TITLE_MAX);
}

function normalizeKeywordPhrase(text: string): string {
  return cleanText(text)
    .replace(/^(차관동정|장관동정|보도자료|설명자료|참고자료)\s*/g, '')
    .replace(/\b\d{1,2}일부터\s*/g, '')
    .replace(/\b\d{1,2}월\s*\d{1,2}일부터\s*/g, '')
    .replace(/\b\d{4}년\s*/g, '')
    .replace(/\s*(하세요|한다|합니다|된다|됩니다|나선다|밝혔다|개최|마련한다|선보이다)\.?$/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKeywordPhrase(text: string): string {
  let clean = normalizeKeywordPhrase(text)
    .replace(/^(과|와|및|또는)\s+/, '')
    .replace(/([가-힣])을\s+(신청|접수|모집|대상|자격|지급)/g, '$1 $2')
    .replace(/([가-힣])를\s+(신청|접수|모집|대상|자격|지급)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const badSentence = /(이유로|포괄임금|미지급|포함된|까지|넘어|방문해|참여할|부담을|덜어|머리를 맞대고|시각으로|선보이다|정액수당|휴일근로수당|연차유급휴가|고액 급여|채용비리|산재간호대상|국가기술자격)/;
  if (badSentence.test(clean)) return '';

  if (/농산물 구매권/.test(clean)) return '농식품 바우처 지급';

  const namedPrograms = [
    '고유가 피해지원금',
    '민생회복 소비쿠폰',
    'AX원스톱 바우처',
    '농식품 바우처',
    '여성 청소년 생리용품 바우처',
    '업무분담지원금',
    '유가연동보조금',
    '생계급여',
    '기초연금',
  ];
  for (const program of namedPrograms) {
    if (clean.includes(program)) {
      const intent = clean.match(/이의신청|신청|지급|대상|자격|접수|사용|방법/);
      if (intent?.[0] && !program.includes(intent[0])) return `${program} ${intent[0]}`;
      return program;
    }
  }

  const supportMatch = clean.match(/(?:[가-힣A-Za-z0-9·-]+\s*){1,4}(지원금|보조금|수당|급여|바우처|소비쿠폰|할인권|환급|장려금|펀드|대출|융자|감면|공제)/);
  if (supportMatch?.[0]) {
    const base = supportMatch[0].trim();
    const intent = clean.match(/이의신청|신청|지급|대상|자격|접수|사용|방법/);
    if (intent?.[0] && !base.includes(intent[0])) return `${base} ${intent[0]}`;
    return base;
  }

  const audienceMatch = clean.match(/(?:청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)(?:\s*[가-힣A-Za-z0-9·-]+){0,3}\s*(신청|모집|대상|자격|혜택|지원)/);
  if (audienceMatch?.[0]) {
    const audience = audienceMatch[0].trim();
    if (/^(근로자|중소기업|학생)\s*대상$/.test(audience)) return '';
    return audience;
  }

  const actionMatch = clean.match(/(?:[가-힣A-Za-z0-9·-]+\s*){1,4}(신청|접수|모집|채용|공고|시행|확대|신설|개편)/);
  if (actionMatch?.[0]) return actionMatch[0].trim();

  return clean;
}

function isSeedLike(keyword: string): boolean {
  const clean = normalizeKeywordPhrase(keyword);
  if (!clean || clean.length < 3 || clean.length > 28) return false;
  if (EXCLUDE_RE.test(clean)) return false;
  if (/^\d+(월|일|년|차|명|개)?$/.test(clean)) return false;
  if (/\d+만\s*명|\d+년 이상/.test(clean)) return false;
  if (/^(신청 접수|입주기업 모집|주민 제안서 접수)$/.test(clean)) return false;
  if (/^(관련|대한|우리|이번|오늘|내일|위한|통해|부터|까지)/.test(clean)) return false;
  if (/(이유로|포괄임금|미지급|포함된|까지|넘어|방문해|참여할|부담을|덜어|머리를 맞대고|시각으로|선보이다)/.test(clean)) return false;
  return INTENT_RE.test(clean) || AUDIENCE_RE.test(clean);
}

function addCandidate(
  out: PolicyBriefingKeyword[],
  seen: Set<string>,
  keyword: string,
  category: string,
  url?: string,
  publishedAt?: string,
  title?: string,
): void {
  const clean = compactKeywordPhrase(keyword);
  if (!isSeedLike(clean)) return;
  if (EXCLUDE_RE.test(clean)) return;

  const key = clean.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    rank: out.length + 1,
    keyword: clean,
    title: compactPolicyDisplayTitle(title || keyword, clean),
    source: 'policy-briefing',
    timestamp: new Date().toISOString(),
    category,
    url,
    publishedAt,
  });
}

function extractPolicyPhrases(title: string): string[] {
  const clean = cleanText(title);
  const phrases = new Set<string>();
  if (!clean) return [];

  if (SUPPORT_RE.test(clean) && isSeedLike(clean)) phrases.add(normalizeKeywordPhrase(clean));

  const quoted = clean.matchAll(/[“"「『']([^“"」』']{2,35})[”"」』']/g);
  for (const m of quoted) {
    if (m[1] && SUPPORT_RE.test(m[1])) phrases.add(normalizeKeywordPhrase(m[1]));
  }

  const patterns = [
    /[가-힣A-Za-z0-9·\-\s]{2,24}(지원금|보조금|수당|급여|바우처|소비쿠폰|할인권|환급|장려금|펀드|대출|융자|감면|공제)/g,
    /(청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)[가-힣A-Za-z0-9·\-\s]{0,18}(지원|신청|모집|혜택|대상|자격|수당|급여|바우처|융자|대출)/g,
    /[가-힣A-Za-z0-9·\-\s]{2,28}(신청|접수|지급|모집|채용|공고|시행|확대|신설|개편)/g,
  ];
  for (const pattern of patterns) {
    for (const m of clean.matchAll(pattern)) {
      if (m[0]) phrases.add(normalizeKeywordPhrase(m[0]));
    }
  }

  for (const clause of clean.split(/[,.!?;:()]/g)) {
    const phrase = normalizeKeywordPhrase(clause);
    if (isSeedLike(phrase)) phrases.add(phrase);
  }

  return Array.from(phrases).filter(isSeedLike);
}

function scorePolicyKeyword(keyword: string): number {
  let score = 0;
  if (/(지원금|보조금|수당|급여|바우처|환급|장려금|소비쿠폰)/.test(keyword)) score += 40;
  if (/(신청|대상|자격|지급|접수|모집)/.test(keyword)) score += 25;
  if (AUDIENCE_RE.test(keyword)) score += 18;
  if (keyword.length >= 5 && keyword.length <= 22) score += 12;
  if (keyword.length > 30) score -= 20;
  return score;
}

async function fetchRssItems(): Promise<PolicyBriefingKeyword[]> {
  const out: PolicyBriefingKeyword[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(RSS_URLS.map(async url => {
    const res = await axios.get(url, {
      timeout: 9000,
      responseType: 'text',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.korea.kr/etc/rss.do',
      },
      validateStatus: s => s < 500,
    });
    const $ = cheerio.load(String(res.data || ''), { xmlMode: true });
    $('item').each((_idx, el) => {
      const title = cleanText($(el).find('title').first().text());
      const link = cleanText($(el).find('link').first().text());
      const pubDate = cleanText($(el).find('pubDate').first().text());
      for (const phrase of extractPolicyPhrases(title)) {
        addCandidate(out, seen, phrase, '정책브리핑 RSS', link, pubDate, title);
      }
    });
  }));

  return out;
}

async function fetchHtmlItems(): Promise<PolicyBriefingKeyword[]> {
  const out: PolicyBriefingKeyword[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(HTML_URLS.map(async url => {
    const res = await axios.get(url, {
      timeout: 9000,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      validateStatus: s => s < 500,
    });
    const $ = cheerio.load(String(res.data || ''));

    const hashText = $('body').text();
    for (const m of hashText.matchAll(/#[가-힣A-Za-z0-9·\-\s]{2,24}/g)) {
      const keyword = m[0].replace(/^#/, '');
      addCandidate(out, seen, keyword, '정책브리핑 인기검색어', url, undefined, keyword);
    }

    const selectors = [
      'a[href*="/news/"]',
      'a[href*="/briefing/"]',
      '.rank_news a',
      '.popular a',
      '.latest a',
      '.list_type1 a',
      '.news_list a',
      'h2 a',
      'h3 a',
      'h4 a',
    ];
    for (const selector of selectors) {
      $(selector).each((_idx, el) => {
        const title = cleanText($(el).text() || $(el).attr('title') || '');
        const href = $(el).attr('href') || '';
        const fullUrl = href.startsWith('http') ? href : href ? new URL(href, url).toString() : url;
        for (const phrase of extractPolicyPhrases(title)) {
          addCandidate(out, seen, phrase, '정책브리핑 최신/인기', fullUrl, undefined, title);
        }
      });
    }
  }));

  return out;
}

export async function getPolicyBriefingKeywords(limit: number = 30): Promise<PolicyBriefingKeyword[]> {
  console.log('[POLICY-BRIEFING] collecting korea.kr policy/support signals');
  const merged: PolicyBriefingKeyword[] = [];
  const seen = new Set<string>();

  const [rss, html] = await Promise.allSettled([fetchRssItems(), fetchHtmlItems()]);
  for (const list of [rss, html]) {
    if (list.status !== 'fulfilled') continue;
    for (const item of list.value) {
      addCandidate(merged, seen, item.keyword, item.category || '정책브리핑', item.url, item.publishedAt, item.title || item.keyword);
    }
  }

  const supportFirst = merged.sort((a, b) => {
    const aw = scorePolicyKeyword(a.keyword);
    const bw = scorePolicyKeyword(b.keyword);
    if (aw !== bw) return bw - aw;
    return a.rank - b.rank;
  });

  if (supportFirst.length > 0) {
    return supportFirst.slice(0, limit).map((item, idx) => ({ ...item, rank: idx + 1 }));
  }

  const defaults = ['고유가 피해지원금', '민생회복 소비쿠폰', '청년 지원금', '소상공인 지원금', '주거 지원금', '육아휴직 급여', '실업급여 신청'];
  return defaults.slice(0, limit).map((keyword, idx) => ({
    rank: idx + 1,
    keyword,
    source: 'policy-briefing',
    timestamp: new Date().toISOString(),
    category: '정책브리핑 기본',
    title: keyword,
  }));
}

export async function getGovernmentTrendKeywords(limit: number = 30): Promise<PolicyBriefingKeyword[]> {
  return getPolicyBriefingKeywords(limit);
}
