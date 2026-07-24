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

const SUPPORT_RE = /(지원금|보조금|수당|급여|바우처|쿠폰|할인권|환급|장려금|소비쿠폰|펀드|대출|융자|감면|공제|신청|지급|대상|자격|조건|조회|접수|기간|마감|서류|모집|채용|공고|청년|소상공인|자영업|저소득|취약계층|고용|일자리|복지|주거|육아|출산|의료|교육|창업|민생)/;
const EXCLUDE_RE = /^(더보기|전체보기|검색|로그인|회원가입|메뉴|홈|정책브리핑|대한민국|정부|뉴스|공지|바로가기|prev|next|이전|다음|\d+)$/i;
const INTENT_RE = /(지원금|보조금|수당|급여|바우처|쿠폰|할인권|환급|장려금|소비쿠폰|펀드|대출|융자|감면|공제|신청|지급|대상|자격|조건|조회|기간|마감|서류|모집|채용|공고|혜택|접수|시행|확대|신설|개편)/;
const AUDIENCE_RE = /(청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)/;
const DISPLAY_TITLE_MAX = 96;
const POLICY_FRESHNESS_MS = {
  sixHours: 6 * 60 * 60_000,
  oneDay: 24 * 60 * 60_000,
  threeDays: 3 * 24 * 60 * 60_000,
};

const POLICY_FALLBACK_KEYWORDS = [
  '청년 월세 지원금 신청', '소상공인 정책자금 신청', '근로장려금 신청 대상', '자녀장려금 지급일',
  '에너지바우처 신청', '긴급복지 생계지원 신청', '전기차 보조금 신청', '출산지원금 신청',
  '부모급여 신청', '아동수당 지급일', '주거급여 신청 자격', '교육급여 바우처 신청',
  '국민취업지원제도 신청', '청년내일저축계좌 조건', '청년도약계좌 신청 기간', '평생교육바우처 신청',
  '농식품바우처 지급', '문화누리카드 신청', '기초연금 수급자격', '실업급여 신청 방법',
  '청년 창업지원금 신청', '소상공인 전기요금 지원', '폐업지원금 신청', '자영업자 고용보험 지원',
  '한부모가정 지원금', '다자녀 혜택 신청', '임산부 교통비 지원', '육아휴직 급여 신청',
  '국가장학금 신청 기간', '장애인 활동지원 신청', '노인 일자리 신청', '청년 주거급여 분리지급',
  '전세보증금 반환보증 지원', '저소득층 냉방비 지원', '민생회복 소비쿠폰 사용', '정부24 보조금 조회',
  '보조금24 숨은 지원금', '청년 구직활동지원금', '취업성공수당 신청', '중소기업 청년 지원금',
];

const POLICY_DISCOVERY_INTENTS = [
  '신청',
  '대상',
  '자격',
  '조건',
  '기간',
  '준비서류',
  '조회',
  '지급일',
  '금액',
  '마감',
  '온라인 신청',
  '신청 방법',
  '변경사항',
  '사용처',
];

const POLICY_GENERIC_SINGLE_TOKEN_RE = /^(지원금|보조금|수당|급여|바우처|쿠폰|환급|장려금|대출|융자|감면|공제|신청|지급|대상|자격|조건|조회|기간|마감|서류|청년|소상공인|복지|주거|육아|출산|의료|교육|창업|민생)$/;
const POLICY_ACTIONABLE_INTENT_RE = /(신청|대상|자격|조건|기간|준비서류|서류|조회|지급일|금액|마감|온라인|방법|변경사항|사용처|사용|접수|모집|수급자격)/;
// v2.49.72: 기사 문장 조각 차단 강화 — 동사 연결형(~ㄴ다든지/~지 않고/~되는), 의료 통계 용어.
//   예: "취약계층에게 일자리를 제공한다든지", "암이 악화되지 않고 유지되는 기간", "무진행 생존기간"
const POLICY_LOW_VALUE_SENTENCE_RE = /(어디에|무엇|누가|누구나|왜|어떻게|계신가요|인가요|할까요|했나요|하세요|알려주세요|드립니다|앞당기고|다든지|든지\b|지 않고|되지 않|하지 않|유지되는|생존기간|악화되)/;
const POLICY_LOW_VALUE_NEWS_RE = /(이란|호르무즈|전쟁|공습|봉쇄|재봉쇄|위기|핵|미사일|사망|별세|투병|혐의|조사|구속|체포|파업)/;
const POLICY_LOW_VALUE_FRAGMENT_RE = /(원가정\s*복귀|일시보호기간|인구감소지역\s*소상공인|소상공인과\s*인구감소지역|사랑을\s*처방해|광복절\s*대체공휴일\s*신청)/;

function isLowValuePolicySeed(text: string): boolean {
  const clean = normalizeKeywordPhrase(text);
  return POLICY_LOW_VALUE_SENTENCE_RE.test(clean)
    || POLICY_LOW_VALUE_NEWS_RE.test(clean)
    || POLICY_LOW_VALUE_FRAGMENT_RE.test(clean);
}

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
    // v2.49.72: 기사 제목 스크래핑 잔재 정리 —
    //   앞머리 연결어("○○ 등 피해에…"의 '등')와 "○○에 대한/따른/관한" 수식절을 제거해
    //   "등 피해에 대한 재난지원금 지급" → "재난지원금 지급" 처럼 실검색 가능한 키워드로 만든다.
    .replace(/^(등|및|과|와|또는|그리고|등의|또한|이런|해당)\s+/, '')
    .replace(/^[가-힣]{1,12}에\s*(대한|따른|관한)\s+/, '')
    .replace(/\b\d{1,2}일부터\s*/g, '')
    .replace(/\b\d{1,2}월\s*\d{1,2}일부터\s*/g, '')
    .replace(/\b\d{4}년\s*/g, '')
    .replace(/\s*(하세요|한다|합니다|된다|됩니다|나선다|밝혔다|개최|마련한다|선보이다)\.?$/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactPolicyKeywordPhrase(text: string): string {
  let clean = normalizeKeywordPhrase(text)
    .replace(/^(과|와|및|또는)\s+/, '')
    .replace(/([가-힣])을\s+(신청|접수|모집|대상|자격|지급)/g, '$1 $2')
    .replace(/([가-힣])를\s+(신청|접수|모집|대상|자격|지급)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const badSentence = /(이유로|포괄임금|미지급|포함된|까지|넘어|방문해|참여할|부담을|덜어|머리를 맞대고|시각으로|선보이다|정액수당|휴일근로수당|연차유급휴가|고액 급여|채용비리|산재간호대상|국가기술자격)/;
  if (badSentence.test(clean)) return '';
  if (isLowValuePolicySeed(clean)) return '';

  if (/농산물 구매권/.test(clean)) return '농식품 바우처 지급';

  const namedPrograms = [
    '고유가 피해지원금',
    '민생회복 소비쿠폰',
    'AX원스톱 바우처',
    '농식품 바우처',
    '농식품바우처',
    '여성 청소년 생리용품 바우처',
    '업무분담지원금',
    '유가연동보조금',
    '청년 월세 지원금',
    '청년월세지원금',
    '청년월세 특별지원',
    '소상공인 정책자금',
    '소상공인 전기요금 지원',
    '소상공인 지원금',
    '전기차 보조금',
    '근로장려금',
    '자녀장려금',
    '에너지바우처',
    '문화누리카드',
    '평생교육바우처',
    '국민취업지원제도',
    '청년내일저축계좌',
    '청년도약계좌',
    '긴급복지 생계지원',
    '출산지원금',
    '부모급여',
    '아동수당',
    '주거급여',
    '교육급여',
    '기초생활보장',
    '생계급여',
    '기초연금',
  ];
  for (const program of namedPrograms) {
    if (clean.includes(program)) {
      const intent = clean.match(/이의신청|신청|지급|대상|자격|조건|조회|접수|사용|방법|기간|마감|서류/);
      if (intent?.[0] && !program.includes(intent[0])) return `${program} ${intent[0]}`;
      return program;
    }
  }

  const supportMatch = clean.match(/(?:[가-힣A-Za-z0-9·-]+\s*){1,4}(지원금|보조금|수당|급여|바우처|소비쿠폰|할인권|환급|장려금|펀드|대출|융자|감면|공제)/);
  if (supportMatch?.[0]) {
    const base = supportMatch[0].trim();
    const intent = clean.match(/이의신청|신청|지급|대상|자격|조건|조회|접수|사용|방법|기간|마감|서류/);
    if (intent?.[0] && !base.includes(intent[0])) return `${base} ${intent[0]}`;
    return base;
  }

  const audienceMatch = clean.match(/(?:청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)(?:\s*[가-힣A-Za-z0-9·-]+){0,3}\s*(신청|모집|대상|자격|조건|혜택|지원|조회|서류|기간)/);
  if (audienceMatch?.[0]) {
    const audience = audienceMatch[0].trim();
    if (/^(근로자|중소기업|학생)\s*대상$/.test(audience)) return '';
    return audience;
  }

  const actionMatch = clean.match(/(?:[가-힣A-Za-z0-9·-]+\s*){1,4}(신청|접수|모집|채용|공고|시행|확대|신설|개편|조회|마감)/);
  if (actionMatch?.[0]) return actionMatch[0].trim();

  return clean;
}

function isSeedLike(keyword: string): boolean {
  const clean = normalizeKeywordPhrase(keyword);
  if (!clean || clean.length < 3 || clean.length > 28) return false;
  if (isLowValuePolicySeed(clean)) return false;
  if (EXCLUDE_RE.test(clean)) return false;
  if (/^\d+(월|일|년|차|명|개)?$/.test(clean)) return false;
  if (/\d+만\s*명|\d+년 이상/.test(clean)) return false;
  if (/^(신청 접수|입주기업 모집|주민 제안서 접수)$/.test(clean)) return false;
  if (/^(관련|대한|우리|이번|오늘|내일|위한|통해|부터|까지)/.test(clean)) return false;
  if (/(이유로|포괄임금|미지급|포함된|까지|넘어|방문해|참여할|부담을|덜어|머리를 맞대고|시각으로|선보이다)/.test(clean)) return false;
  return INTENT_RE.test(clean) || AUDIENCE_RE.test(clean);
}

function isPolicyDiscoverySeedLike(keyword: string): boolean {
  const clean = normalizeKeywordPhrase(keyword);
  if (!clean || clean.length < 3 || clean.length > 42) return false;
  if (isLowValuePolicySeed(clean)) return false;
  if (EXCLUDE_RE.test(clean) || POLICY_GENERIC_SINGLE_TOKEN_RE.test(clean)) return false;
  if (/^\d+$/.test(clean)) return false;
  return SUPPORT_RE.test(clean) || INTENT_RE.test(clean) || AUDIENCE_RE.test(clean);
}

function pushUniquePolicyDiscoverySeed(out: string[], seen: Set<string>, raw: string): void {
  const clean = normalizeKeywordPhrase(raw).replace(/\s+/g, ' ').trim();
  if (!isPolicyDiscoverySeedLike(clean)) return;
  const key = clean.toLowerCase().replace(/\s+/g, '');
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(clean);
}

export function expandPolicyDiscoverySeeds(keyword: string, limit: number = 12): string[] {
  const base = compactPolicyKeywordPhrase(keyword);
  if (!base || !isPolicyDiscoverySeedLike(base)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  if (POLICY_ACTIONABLE_INTENT_RE.test(base)) {
    pushUniquePolicyDiscoverySeed(out, seen, base);
  }

  for (const intent of POLICY_DISCOVERY_INTENTS) {
    if (out.length >= limit) break;
    if (base.includes(intent)) continue;
    pushUniquePolicyDiscoverySeed(out, seen, `${base} ${intent}`);
  }

  return out.slice(0, Math.max(1, limit));
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
  const clean = compactPolicyKeywordPhrase(keyword);
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
    /(청년|소상공인|자영업|저소득층|취약계층|신혼부부|노인|장애인|아동|농어민|구직자|근로자|중소기업|임산부|부모|학생|어르신)[가-힣A-Za-z0-9·\-\s]{0,18}(지원|신청|모집|혜택|대상|자격|조건|조회|서류|기간|수당|급여|바우처|융자|대출)/g,
    /[가-힣A-Za-z0-9·\-\s]{2,28}(신청|접수|지급|모집|채용|공고|시행|확대|신설|개편|조회|마감)/g,
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
  if (/(신청|대상|자격|조건|조회|지급|접수|기간|마감|서류|모집)/.test(keyword)) score += 25;
  if (AUDIENCE_RE.test(keyword)) score += 18;
  if (/(청년|소상공인|자영업|저소득|취약|주거|출산|육아|고용|창업)/.test(keyword)) score += 8;
  if (/(정부|대한민국|정책|브리핑|국무|부처)$/.test(keyword)) score -= 20;
  if (keyword.length >= 5 && keyword.length <= 22) score += 12;
  if (keyword.length > 30) score -= 20;
  return score;
}

function parsePolicyDate(value?: string): number {
  const raw = cleanText(value || '');
  if (!raw) return 0;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const korean = raw.match(/(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})/);
  if (korean) {
    const [, y, m, d] = korean;
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  }
  return 0;
}

function scorePolicyItem(item: PolicyBriefingKeyword): number {
  let score = scorePolicyKeyword(item.keyword);
  const published = parsePolicyDate(item.publishedAt);
  if (published > 0) {
    const age = Date.now() - published;
    if (age >= 0 && age <= POLICY_FRESHNESS_MS.sixHours) score += 22;
    else if (age <= POLICY_FRESHNESS_MS.oneDay) score += 16;
    else if (age <= POLICY_FRESHNESS_MS.threeDays) score += 8;
  }
  if (/RSS|최신|인기/.test(item.category || '')) score += 4;
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
    const aw = scorePolicyItem(a);
    const bw = scorePolicyItem(b);
    if (aw !== bw) return bw - aw;
    const at = parsePolicyDate(a.publishedAt);
    const bt = parsePolicyDate(b.publishedAt);
    if (at !== bt) return bt - at;
    return a.rank - b.rank;
  });

  if (supportFirst.length > 0) {
    return supportFirst.slice(0, limit).map((item, idx) => ({ ...item, rank: idx + 1 }));
  }

  return getPolicyFallbackKeywords(limit).map((keyword, idx) => ({
    rank: idx + 1,
    keyword,
    source: 'policy-briefing',
    timestamp: new Date().toISOString(),
    category: '정책브리핑 기본',
    title: keyword,
  }));
}

export function getPolicyFallbackKeywords(limit: number = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const keyword of POLICY_FALLBACK_KEYWORDS) {
    for (const expanded of expandPolicyDiscoverySeeds(keyword, 8)) {
      pushUniquePolicyDiscoverySeed(out, seen, expanded);
    }
  }
  return out.slice(0, Math.min(Math.max(limit, 1), out.length));
}

export async function getGovernmentTrendKeywords(limit: number = 30): Promise<PolicyBriefingKeyword[]> {
  return getPolicyBriefingKeywords(limit);
}
