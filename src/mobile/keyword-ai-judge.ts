import type {
  MobileKeywordAiJudge,
  MobileKeywordMeasurementStatus,
  MobileKeywordMetric,
  MobileKeywordResult,
  MobileResultGrade,
} from './contracts';

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const ACTIONABLE_NEED_RE = /(신청|대상|자격|조건|방법|조회|일정|마감|서류|준비물|예매|예약|가격|비교|추천|후기|할인|쿠폰|구매|사용법|설정|해결|발급|지급일|지원금|환급|청약|등급컷|라인업|중계|주차|입장료|위치|검사|비용)/u;
const COMMERCE_RE = /(가격|비교|추천|후기|할인|쿠폰|구매|최저가|가성비|제품|상품|쇼핑|렌탈|보험|카드|대출|청약|예매|예약)/u;
const EVERGREEN_RE = /(방법|조건|자격|서류|준비물|사용법|설정|해결|비교|추천|후기|조회|신청|발급|지급일|환급|주차|입장료|비용|검사|FAQ|체크리스트)/iu;
const THIN_LOOKUP_RE = /(프로필|나이|키|고향|학력|인스타|출연진|몇부작|방송시간|다시보기|공식영상|하이라이트|인물관계도|결말|쿠키영상|재방송|등장인물|줄거리만|근황)/u;
const NEWS_ONLY_RE = /(사과|논란|해명|구속|체포|압수수색|사망|별세|결별|열애|폭로|혐의|고소|기자회견|입장문|불륜|도박|마약|음주운전)/u;
const UNSAFE_RE = /(성인|불법|해킹|도박|마약|폭행|성범죄|자살|살인|테러|혐오|개인정보유출)/u;
const GENERIC_SINGLE_RE = /^(맛집|여행|패션|프로필|뉴스|이슈|추천|후기|가격|정보|일정|예매)$/u;
const SYNTHETIC_MARKER_RE = /\b(dummy|mock|fake|sample|demo|placeholder|synthetic|estimated|estimate)\b|추정|더미|샘플|server-intent-template|server-zero-live-fallback|intent-fallback|pc-intent-expansion/i;

const GRADE_ORDER: MobileResultGrade[] = ['C', 'B', 'A', 'S', 'SS', 'SSS'];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gradeAtMost(grade: MobileResultGrade, ceiling: MobileResultGrade): MobileResultGrade {
  const currentIndex = GRADE_ORDER.indexOf(grade);
  const ceilingIndex = GRADE_ORDER.indexOf(ceiling);
  if (currentIndex < 0) return ceiling;
  if (ceilingIndex < 0) return grade;
  return GRADE_ORDER[Math.min(currentIndex, ceilingIndex)] || ceiling;
}

export function keywordMeasurementStatus(metric: MobileKeywordMetric): MobileKeywordMeasurementStatus {
  const markerText = [
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  if (SYNTHETIC_MARKER_RE.test(markerText)) return 'synthetic-blocked';

  const total = finiteNumber(metric.totalSearchVolume);
  const documents = finiteNumber(metric.documentCount);
  const pc = finiteNumber(metric.pcSearchVolume);
  const mobile = finiteNumber(metric.mobileSearchVolume);

  if (metric.isMeasured === true && total !== null && total > 0 && documents !== null && documents > 0) {
    return 'measured';
  }
  if (
    metric.isMeasured === true
    || (total !== null && total > 0)
    || (documents !== null && documents > 0)
    || (pc !== null && pc > 0)
    || (mobile !== null && mobile > 0)
  ) {
    return 'partial';
  }
  return 'unmeasured';
}

function volumeSignal(total: number | null): number {
  if (total === null || total <= 0) return -22;
  if (total >= 20000) return 16;
  if (total >= 5000) return 18;
  if (total >= 1000) return 15;
  if (total >= 300) return 9;
  if (total >= 80) return 2;
  return -12;
}

function documentSignal(documents: number | null): number {
  if (documents === null || documents <= 0) return -22;
  if (documents <= 300) return 18;
  if (documents <= 1000) return 14;
  if (documents <= 5000) return 8;
  if (documents <= 15000) return 0;
  if (documents <= 50000) return -8;
  return -18;
}

function ratioSignal(ratio: number | null): number {
  if (ratio === null || ratio <= 0) return -18;
  if (ratio >= 50) return 14;
  if (ratio >= 15) return 18;
  if (ratio >= 5) return 14;
  if (ratio >= 2) return 6;
  if (ratio >= 0.8) return 0;
  return -12;
}

function categorySignal(category: string): number {
  const clean = compactText(category);
  if (/policy|finance|shopping|commerce|it|education|health|travel|food|home|life/.test(clean)) return 6;
  if (/celeb|drama|broadcast|movie|sports|music|issue/.test(clean)) return -2;
  return 0;
}

export function judgeKeywordMetric(metric: MobileKeywordMetric, now: Date = new Date()): MobileKeywordAiJudge {
  const keyword = normalizeText(metric.keyword);
  const category = normalizeText(metric.category);
  const status = keywordMeasurementStatus(metric);
  const total = finiteNumber(metric.totalSearchVolume);
  const documents = finiteNumber(metric.documentCount);
  const ratio = finiteNumber(metric.goldenRatio)
    ?? (total !== null && documents !== null && documents > 0 ? Number((total / documents).toFixed(2)) : null);
  const hasPcMobileSplit = finiteNumber(metric.pcSearchVolume) !== null && finiteNumber(metric.mobileSearchVolume) !== null;
  const actionable = ACTIONABLE_NEED_RE.test(keyword);
  const commerce = COMMERCE_RE.test(keyword);
  const evergreen = EVERGREEN_RE.test(keyword);
  const thin = THIN_LOOKUP_RE.test(keyword) || GENERIC_SINGLE_RE.test(keyword);
  const newsOnly = NEWS_ONLY_RE.test(keyword);
  const unsafe = UNSAFE_RE.test(keyword);

  let score = 46;
  const reasons: string[] = [];
  let rejectReason = '';

  if (status === 'measured') {
    score += 18;
    reasons.push('measured-search-volume-and-document-count');
  } else if (status === 'partial') {
    score -= 16;
    reasons.push('partial-measurement-only');
  } else if (status === 'synthetic-blocked') {
    score -= 42;
    rejectReason = 'synthetic-or-estimated-result-blocked';
  } else {
    score -= 28;
    rejectReason = 'measurement-missing';
  }

  score += volumeSignal(total);
  score += documentSignal(documents);
  score += ratioSignal(ratio);
  score += categorySignal(category);

  if (hasPcMobileSplit) {
    score += 6;
    reasons.push('pc-mobile-split-measured');
  }
  if (actionable) {
    score += 22;
    reasons.push('clear-searcher-action-intent');
  } else {
    score -= 10;
    reasons.push('weak-action-intent');
  }
  if (commerce) {
    score += 8;
    reasons.push('commerce-or-conversion-angle');
  }
  if (evergreen) {
    score += 7;
    reasons.push('evergreen-blog-angle');
  }
  if (thin) {
    score -= 30;
    rejectReason ||= 'thin-lookup-or-profile-intent';
  }
  if (newsOnly) {
    score -= 26;
    rejectReason ||= 'news-headline-only-risk';
  }
  if (unsafe) {
    score -= 44;
    rejectReason ||= 'unsafe-or-sensitive-topic';
  }
  if (keyword.length < 3 || keyword.length > 36) {
    score -= 10;
    reasons.push('keyword-length-risk');
  }

  const currentYear = now.getFullYear();
  const futureYearMatch = keyword.match(/\b(20\d{2})\b/);
  const futureYear = futureYearMatch ? Number(futureYearMatch[1]) : null;
  if (futureYear && futureYear > currentYear + 1) {
    score -= 16;
    reasons.push('future-date-risk');
  }

  score = clampScore(score);

  const needIntent: MobileKeywordAiJudge['needIntent'] = actionable
    ? 'strong'
    : commerce || evergreen
      ? 'medium'
      : 'weak';
  const blogAngle: MobileKeywordAiJudge['blogAngle'] = unsafe
    ? 'unsafe'
    : thin || newsOnly
      ? 'thin'
      : actionable || evergreen
        ? 'actionable'
        : 'informational';
  const shoppingIntent: MobileKeywordAiJudge['shoppingIntent'] = commerce
    ? 'high'
    : /shopping|commerce|fashion|beauty|electronics|travel|food/.test(compactText(category))
      ? 'medium'
      : 'low';
  const adsenseValue: MobileKeywordAiJudge['adsenseValue'] = score >= 78 && (actionable || commerce)
    ? 'high'
    : score >= 58
      ? 'medium'
      : 'low';
  const freshnessRisk: MobileKeywordAiJudge['freshnessRisk'] = newsOnly || thin
    ? 'high'
    : /schedule|event|sports|drama|broadcast|movie|music|issue/.test(compactText(category))
      ? 'medium'
      : 'low';
  const spamRisk: MobileKeywordAiJudge['spamRisk'] = unsafe || newsOnly
    ? 'high'
    : thin
      ? 'medium'
      : 'low';

  const verdict: MobileKeywordAiJudge['verdict'] = unsafe
    || status === 'synthetic-blocked'
    || score < 45
    || (thin && !actionable)
    ? 'exclude'
    : score >= 72 && status === 'measured' && needIntent !== 'weak'
      ? 'publish'
      : 'conditional';

  if (verdict === 'exclude' && !rejectReason) {
    rejectReason = 'quality-gate-score-too-low';
  }

  return {
    verdict,
    score,
    confidence: status === 'measured' && hasPcMobileSplit ? 0.9 : status === 'measured' ? 0.78 : 0.48,
    needIntent,
    blogAngle,
    shoppingIntent,
    adsenseValue,
    freshnessRisk,
    spamRisk,
    reasons: [...new Set(reasons)].slice(0, 8),
    rejectReason: rejectReason || undefined,
    model: 'rule-judge-v1',
    checkedAt: now.toISOString(),
  };
}

export interface ApplyKeywordAiJudgeOptions {
  now?: Date;
  downgradeExcluded?: boolean;
}

export function applyKeywordAiJudge<T extends MobileKeywordMetric>(
  metric: T,
  options: ApplyKeywordAiJudgeOptions = {},
): T {
  const measurementStatus = keywordMeasurementStatus(metric);
  const aiJudge = judgeKeywordMetric(metric, options.now);
  const rejectReason = aiJudge.rejectReason || metric.rejectReason;
  const grade = options.downgradeExcluded !== false && aiJudge.verdict === 'exclude'
    ? gradeAtMost(metric.grade, 'C')
    : aiJudge.verdict === 'conditional'
      ? gradeAtMost(metric.grade, 'S')
      : metric.grade;
  return {
    ...metric,
    grade,
    measurementStatus,
    aiJudge,
    rejectReason,
  };
}

export function attachKeywordAiJudges<T extends MobileKeywordMetric>(
  metrics: T[],
  options: ApplyKeywordAiJudgeOptions = {},
): T[] {
  return metrics.map((metric) => applyKeywordAiJudge(metric, options));
}

export function filterAiJudgeExcluded<T extends MobileKeywordMetric>(metrics: T[]): T[] {
  return metrics.filter((metric) => metric.aiJudge?.verdict !== 'exclude');
}

export function summarizeAiJudgedResult(result: MobileKeywordResult, keywords: MobileKeywordMetric[]): MobileKeywordResult['summary'] {
  return {
    ...result.summary,
    total: keywords.length,
    sss: keywords.filter((item) => item.grade === 'SSS').length,
    measured: keywords.filter((item) => item.isMeasured).length,
    aiJudged: keywords.filter((item) => item.aiJudge).length,
    excludedByAiJudge: (result.keywords || []).filter((item) => item.aiJudge?.verdict === 'exclude').length,
    publishReady: keywords.filter((item) => item.aiJudge?.verdict === 'publish').length,
  };
}
