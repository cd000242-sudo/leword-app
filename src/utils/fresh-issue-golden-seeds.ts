import { ExternalSignals } from './mdp-engine';
import { rankKeywordExpansionStrings } from './keyword-expansion-ranker';

export interface FreshIssueGoldenSeed {
  keyword: string;
  baseKeyword: string;
  score: number;
  sources: string[];
  issueType: 'policy' | 'incident' | 'entertainment' | 'fresh';
  reason: string;
}

export interface FreshIssueGoldenSeedOptions {
  maxBaseSeeds?: number;
  intentsPerSeed?: number;
  categoryIds?: string[];
}

const POLICY_RE = /(지원금|보조금|장려금|바우처|급여|수당|환급|감면|면제|정책|복지|대출|청년|소상공인|육아|출산|근로|고용|정부24|보조금24|정책브리핑)/;
const INCIDENT_RE = /(정보\s*유출|개인정보|유출|해킹|보안\s*사고|침해|피싱|스미싱|랜섬웨어|도용|사칭|2차\s*피해|피해\s*확인|보상|환불|장애|먹통|오류|중단)/;
const ENTERTAINMENT_RE = /(아이돌|배우|가수|연예인|스타|걸그룹|보이그룹|컴백|신곡|앨범|티저|쇼케이스|공식입장|팬미팅|콘서트|시상식|드라마|예능|출연|공항패션|열애|결혼|논란|해명)/;
const FRESH_RE = /(오늘|방금|속보|단독|발표|공개|확정|변경|개편|출시|오픈|접수|마감|신규|최신|논란|사고|피해|보상|202[0-9]|[0-9]+차)/;
const BROAD_NOISE_RE = /^(뉴스|실시간|속보|오늘|연예|스포츠|정치|경제|사회|날씨|환율|주식|코인|로또|운세|유튜브|네이버)$/;
const COMMERCE_NOISE_TAIL_RE = /(가격|추천|후기|리뷰|비교|순위|최저가|할인|구매)$/;

const POLICY_DISCOVERY_INTENTS = [
  '신청방법', '대상', '자격', '혜택', '지원내용', '지원금액', '신청기간', '지급일',
  '서류', '필요서류', '조회', '마감', '온라인 신청', '문의처', '변경사항', '소득기준',
];

const INCIDENT_DISCOVERY_INTENTS = [
  '피해 확인', '피해 조회', '공식 공지', '보상 기준', '보상 신청', '고객센터',
  '대응 방법', '원인', '2차 피해', '환불', '신고', '비밀번호 변경',
];

const ENTERTAINMENT_DISCOVERY_INTENTS = [
  '공식입장', '일정', '방송시간', '출연', '라인업', '예매', '반응', '근황',
  '인스타', '프로필', '다시보기', '해명', '컴백 날짜',
];

const ENTERTAINMENT_COMEBACK_INTENTS = [
  '컴백 날짜', '공식입장', '신곡', '앨범', '티저', '쇼케이스', '활동 일정', '반응',
];

const ENTERTAINMENT_CONCERT_INTENTS = [
  '예매 방법', '티켓팅', '일정', '장소', '좌석', '취소표', '선예매', '공지',
];

const ENTERTAINMENT_BROADCAST_INTENTS = [
  '방송시간', '출연진', '다시보기', '몇부작', 'OTT', '공개일', '줄거리', '반응',
];

const ENTERTAINMENT_ISSUE_INTENTS = [
  '공식입장', '해명', '반응', '타임라인', '이유', '근황', '인스타', '프로필',
];

const FRESH_DISCOVERY_INTENTS = [
  '발표 내용', '변경사항', '확인 방법', '일정', '신청방법', '주의사항', '대상', '마감',
];

const GENERIC_ENTERTAINMENT_TERMS = [
  '아이돌', '배우', '가수', '연예인', '스타', '걸그룹', '보이그룹', '드라마', '예능',
  '컴백', '공식입장', '팬미팅', '콘서트', '시상식', '출연', '공항패션', '열애', '결혼',
  '논란', '해명', '일정', '방송시간', '예매', '라인업', '반응', '근황', '인스타',
  '프로필', '다시보기', '컴백날짜', '날짜', '출연진', '주연', '신곡', '앨범', '티저',
  '공개일', '공개', '방송', '시즌',
];

function compact(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function normalizeKeyword(raw: string): string {
  let value = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[“”"'「」『』]/g, ' ')
    .replace(/\[[^\]]{1,18}\]/g, ' ')
    .replace(/\([^)]{1,24}\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length > 34) {
    const clipped = value.slice(0, 34);
    value = clipped.replace(/\s+\S*$/, '').trim() || clipped.trim();
  }
  return value;
}

function classifyIssueType(keyword: string): FreshIssueGoldenSeed['issueType'] | null {
  if (POLICY_RE.test(keyword)) return 'policy';
  if (INCIDENT_RE.test(keyword)) return 'incident';
  if (ENTERTAINMENT_RE.test(keyword)) return 'entertainment';
  if (FRESH_RE.test(keyword)) return 'fresh';
  return null;
}

function categoryAllowsIssue(type: FreshIssueGoldenSeed['issueType'], categoryIds: string[]): boolean {
  if (categoryIds.length === 0) return true;
  if (type === 'policy') return categoryIds.includes('policy');
  if (type === 'entertainment') return categoryIds.some(id => ['celeb', 'broadcast', 'music', 'movie', 'drama'].includes(id));
  if (type === 'incident') return categoryIds.some(id => ['it', 'smartphone', 'laptop', 'broadcast', 'celeb', 'life_tips'].includes(id));
  return true;
}

function scoreFreshSeed(keyword: string, signal: ExternalSignals, issueType: FreshIssueGoldenSeed['issueType']): number {
  const sources = Array.isArray(signal.sources) ? signal.sources : [];
  const sourceScore = Math.min(42, sources.length * 14);
  const community = Math.min(26, Math.max(0, signal.communityBuzzScore || 0) * 0.26);
  const sns = Math.min(22, Math.max(0, signal.snsLeadingScore || 0) * 0.22);
  const fresh = FRESH_RE.test(keyword) ? 18 : 0;
  const concrete = keyword.split(/\s+/).length >= 2 || compact(keyword).length >= 5 ? 10 : 0;
  const typeBonus = issueType === 'incident' ? 14 : issueType === 'policy' ? 12 : issueType === 'entertainment' ? 10 : 6;
  const noisePenalty = BROAD_NOISE_RE.test(compact(keyword)) ? 35 : 0;
  return Math.max(0, Math.round(sourceScore + community + sns + fresh + concrete + typeBonus - noisePenalty));
}

function isUsableFreshBase(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || clean.length < 3 || clean.length > 34) return false;
  if (!/[가-힣a-zA-Z]/.test(clean)) return false;
  if (/^[\d\s.,_-]+$/.test(clean)) return false;
  if (BROAD_NOISE_RE.test(compact(clean))) return false;
  if (COMMERCE_NOISE_TAIL_RE.test(clean) && !POLICY_RE.test(clean) && !INCIDENT_RE.test(clean)) return false;
  return true;
}

function hasConcreteEntertainmentSubject(keyword: string): boolean {
  let compacted = compact(keyword);
  for (const term of GENERIC_ENTERTAINMENT_TERMS) {
    compacted = compacted.replace(new RegExp(term, 'g'), '');
  }
  compacted = compacted.replace(/202[0-9]|[0-9]+월|[0-9]+일|[0-9]+차/g, '');
  return /[가-힣]{2,}|[a-z0-9]{2,}/i.test(compacted);
}

function getIssueIntentList(issueType: FreshIssueGoldenSeed['issueType'], baseKeyword = ''): string[] {
  if (issueType === 'policy') return POLICY_DISCOVERY_INTENTS;
  if (issueType === 'incident') return INCIDENT_DISCOVERY_INTENTS;
  if (issueType === 'entertainment') {
    const base = compact(baseKeyword);
    if (/콘서트|팬미팅|예매|티켓|티켓팅/.test(base)) return ENTERTAINMENT_CONCERT_INTENTS;
    if (/컴백|신곡|앨범|티저|쇼케이스/.test(base)) return ENTERTAINMENT_COMEBACK_INTENTS;
    if (/드라마|예능|방송|다시보기|ott|공개일|출연진/.test(base)) return ENTERTAINMENT_BROADCAST_INTENTS;
    if (/논란|해명|공식입장|열애|결혼/.test(base)) return ENTERTAINMENT_ISSUE_INTENTS;
    return ENTERTAINMENT_DISCOVERY_INTENTS;
  }
  return FRESH_DISCOVERY_INTENTS;
}

function buildIssueIntentKeywords(
  baseKeyword: string,
  issueType: FreshIssueGoldenSeed['issueType'],
  limit: number,
): string[] {
  if (limit <= 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const baseCompact = compact(baseKeyword);

  for (const intent of getIssueIntentList(issueType, baseKeyword)) {
    const intentCompact = compact(intent);
    if (!intentCompact) continue;
    if (baseCompact.endsWith(intentCompact)) continue;
    const keyword = `${baseKeyword} ${intent}`.trim();
    const key = compact(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= limit) break;
  }

  return out;
}

export function buildFreshIssueGoldenSeeds(
  signalMap: Map<string, ExternalSignals>,
  options: FreshIssueGoldenSeedOptions = {},
): FreshIssueGoldenSeed[] {
  const maxBaseSeeds = Math.max(1, Math.floor(options.maxBaseSeeds || 40));
  const intentsPerSeed = Math.max(0, Math.floor(options.intentsPerSeed || 8));
  const categoryIds = Array.from(new Set((options.categoryIds || []).map(id => String(id || '').trim()).filter(Boolean)));

  const baseCandidates: FreshIssueGoldenSeed[] = [];
  const baseSeen = new Set<string>();
  for (const [rawKeyword, signal] of signalMap.entries()) {
    const keyword = normalizeKeyword(rawKeyword);
    if (!isUsableFreshBase(keyword)) continue;
    const issueType = classifyIssueType(keyword);
    if (!issueType) continue;
    if (issueType === 'entertainment' && !hasConcreteEntertainmentSubject(keyword)) continue;
    if (!categoryAllowsIssue(issueType, categoryIds)) continue;
    const key = compact(keyword);
    if (!key || baseSeen.has(key)) continue;
    baseSeen.add(key);
    const score = scoreFreshSeed(keyword, signal, issueType);
    if (score < 34) continue;
    const sources = Array.isArray(signal.sources) ? signal.sources : [];
    baseCandidates.push({
      keyword,
      baseKeyword: keyword,
      score,
      sources,
      issueType,
      reason: `${issueType} 신호 · ${sources.length || 1}개 소스`,
    });
  }

  baseCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.sources.length - a.sources.length;
  });

  const out: FreshIssueGoldenSeed[] = [];
  const seen = new Set<string>();
  const push = (item: FreshIssueGoldenSeed) => {
    const key = compact(item.keyword);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (const base of baseCandidates.slice(0, maxBaseSeeds)) {
    push(base);
    const forcedIntentKeywords = buildIssueIntentKeywords(base.keyword, base.issueType, intentsPerSeed);
    const rankedIntentKeywords = intentsPerSeed > forcedIntentKeywords.length
      ? rankKeywordExpansionStrings(base.keyword, [], {
        source: 'fresh-issue-intent',
        limit: intentsPerSeed - forcedIntentKeywords.length,
        minScore: 30,
        fallbackMinScore: 22,
        minKeep: intentsPerSeed - forcedIntentKeywords.length,
        ensureIntentCoverage: true,
        intentCoverageMin: intentsPerSeed - forcedIntentKeywords.length,
        allowSyntheticFallback: false,
      })
      : [];
    const intentKeywords = Array.from(new Set([...forcedIntentKeywords, ...rankedIntentKeywords]));
    intentKeywords.forEach((keyword, index) => push({
      ...base,
      keyword,
      score: Math.max(1, base.score - index - 2),
      reason: `${base.reason} · 글감 intent`,
    }));
  }

  return out;
}
