import {
  type MobileKeywordMetric,
  type MobilePublishDecision,
} from './contracts';

function normalizeKeyword(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactKeyword(value: unknown): string {
  return normalizeKeyword(value).toLowerCase().replace(/\s+/g, '');
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const STRONG_NEED_RE = /(신청|대상|자격|조건|지급일|조회|예약|예매|가격|비교|추천|후기|방법|(?:하는|쓰는|먹는|고르는|차리는|만드는|찾는|받는)법|준비물|체크리스트|서류|마감|설정|사용법|주차|입장료|비용|견적|숙소|교체주기|교체시기|주기|시기|시간표|환급|지원금|혜택|청약|쿠폰|할인|구매처|최저가|가성비|사전예약|출시일|발매일|공휴일|일정|중계|계산기|정리|순위)/;
const COMMERCE_RE = /(가격|비교|추천|후기|구매|구매처|최저가|할인|쿠폰|가성비|입문|대체품|선물|렌탈|숙소|예약|예매|보험|카드|대출|연금|ETF|펀드|청약)/;
const EVERGREEN_RE = /(방법|(?:하는|쓰는|먹는|고르는|차리는|만드는|찾는|받는)법|사용법|조건|자격|서류|체크리스트|계산기|비교|추천|후기|가격|숙소|교체주기|교체시기|주기|시기|지급일|조회|신청|대상|혜택|환급|주차|입장료)/;
const SHORT_LIVED_RE = /(속보|논란|공식입장|기자회견|발언|근황|구속|수사|사망|별세|안타|홈런|MVP|하이라이트|결말|다시보기|출연진|몇부작|방송시간|당첨번호|로또|복권)/;
const SAFETY_RE = /(정치|대통령|의혹|범죄|사고|사망|별세|구속|수사|고소|폭행|마약|도박|스캔들|루머|불륜|이혼|전쟁|테러)/;
const EVENT_RE = /(올스타전|월드컵|콘서트|공연|예매|일정|중계|축제|행사|팝업|선착순|오픈런)/;

function categoryBoost(category: string): number {
  const clean = compactKeyword(category);
  if (/policy|finance|shopping|travel|car|it|education|food|living|health/.test(clean)) return 8;
  if (/sports|music|movie|drama|entertainment/.test(clean)) return -2;
  return 0;
}

function volumeScore(volume: number | null): number {
  if (volume === null || volume <= 0) return -18;
  if (volume >= 10000) return 18;
  if (volume >= 1000) return 14;
  if (volume >= 300) return 8;
  if (volume >= 100) return 2;
  return -10;
}

function ratioScore(ratio: number | null): number {
  if (ratio === null || ratio <= 0) return -12;
  if (ratio >= 20) return 18;
  if (ratio >= 8) return 14;
  if (ratio >= 3) return 8;
  if (ratio >= 1) return 2;
  return -8;
}

function documentScore(documentCount: number | null): number {
  if (documentCount === null || documentCount <= 0) return -16;
  if (documentCount <= 300) return 14;
  if (documentCount <= 1000) return 10;
  if (documentCount <= 5000) return 5;
  if (documentCount <= 15000) return -4;
  return -12;
}

function buildTitleAngles(keyword: string, verdict: MobilePublishDecision['verdict']): string[] {
  if (verdict === 'exclude') return [];
  const base = normalizeKeyword(keyword);
  const angles = [
    `${base} 한눈에 정리`,
    `${base} 조건과 주의사항`,
    `${base} 실제로 확인할 것`,
  ];
  if (COMMERCE_RE.test(base)) angles.unshift(`${base} 가격 비교와 선택 기준`);
  if (/신청|지급일|지원금|혜택|환급/.test(base)) angles.unshift(`${base} 신청 대상과 지급일`);
  if (/사용법|설정|방법/.test(base)) angles.unshift(`${base} 따라하기 가이드`);
  return [...new Set(angles)].slice(0, 3);
}

function buildClusterKeywords(keyword: string): string[] {
  const base = normalizeKeyword(keyword);
  const intents = STRONG_NEED_RE.test(base)
    ? ['조건', '방법', '주의사항', '비교', '후기']
    : ['정리', '방법', '비교', '후기', 'FAQ'];
  const seen = new Set<string>();
  return intents
    .map((intent) => `${base} ${intent}`)
    .filter((value) => {
      const key = compactKeyword(value);
      if (!key || seen.has(key) || key === compactKeyword(base)) return false;
      seen.add(key);
      return value.length <= 42;
    })
    .slice(0, 5);
}

export function evaluatePublishDecision(metric: MobileKeywordMetric): MobilePublishDecision {
  const keyword = normalizeKeyword(metric.keyword);
  const category = normalizeKeyword(metric.category);
  const volume = finiteNumber(metric.totalSearchVolume);
  const documentCount = finiteNumber(metric.documentCount);
  const pcSearchVolume = finiteNumber(metric.pcSearchVolume);
  const mobileSearchVolume = finiteNumber(metric.mobileSearchVolume);
  const hasSplit = pcSearchVolume !== null
    && pcSearchVolume >= 0
    && mobileSearchVolume !== null
    && mobileSearchVolume >= 0
    && pcSearchVolume + mobileSearchVolume > 0
    && pcSearchVolume + mobileSearchVolume === volume;
  const hasCanonicalSearchVolume = hasSplit
    && metric.searchVolumeSource === 'searchad'
    && metric.searchVolumeConfidence === 'high'
    && metric.searchVolumeBindingVersion === 'keyword-keyed-v2'
    && typeof metric.searchVolumeMeasuredAt === 'string'
    && Number.isFinite(Date.parse(metric.searchVolumeMeasuredAt))
    && metric.isSearchVolumeEstimated === false;
  const hasCanonicalDocumentCount = documentCount !== null
    && documentCount > 0
    && metric.documentCountSource === 'naver-api'
    && metric.documentCountConfidence === 'high'
    && metric.documentCountQueryMode === 'broad'
    && metric.isDocumentCountEstimated === false;
  const hasCanonicalMeasurement = metric.isMeasured === true
    && hasCanonicalSearchVolume
    && hasCanonicalDocumentCount;
  const ratio = hasCanonicalMeasurement && volume !== null && documentCount !== null
    ? volume / documentCount
    : null;
  const hasNeed = STRONG_NEED_RE.test(keyword);
  const hasCommerce = COMMERCE_RE.test(keyword);
  const evergreen = EVERGREEN_RE.test(keyword);
  const shortLived = SHORT_LIVED_RE.test(keyword);
  const unsafe = SAFETY_RE.test(keyword);
  const event = EVENT_RE.test(keyword);

  let score = 42;
  const reasons: string[] = [];
  const cautions: string[] = [];

  score += volumeScore(hasCanonicalSearchVolume ? volume : null);
  score += documentScore(hasCanonicalDocumentCount ? documentCount : null);
  score += ratioScore(ratio);
  score += categoryBoost(category);

  if (hasCanonicalMeasurement) {
    score += 8;
    reasons.push('실측 검색량과 문서수가 있습니다.');
  } else {
    score -= 18;
    cautions.push('실측값이 부족합니다.');
  }
  if (hasCanonicalSearchVolume) {
    score += 6;
    reasons.push('PC/모바일 분리 수요가 확인됐습니다.');
  } else {
    cautions.push('PC/모바일 분리값 확인이 필요합니다.');
  }
  if (hasNeed) {
    score += 20;
    reasons.push('검색자의 해결 니즈가 명확합니다.');
  } else {
    score -= 12;
    cautions.push('검색 의도가 약해 단독 발행 전 검토가 필요합니다.');
  }
  if (hasCommerce) {
    score += 10;
    reasons.push('수익형/구매형 전환 포인트가 있습니다.');
  }
  if (evergreen) {
    score += 8;
    reasons.push('며칠 이상 유지될 정보성 글감입니다.');
  }
  if (event) {
    score -= 6;
    cautions.push('이벤트성 키워드라 발행 타이밍이 짧습니다.');
  }
  if (shortLived) {
    score -= 28;
    cautions.push('단발 조회형 키워드 성격이 강합니다.');
  }
  if (unsafe) {
    score -= 32;
    cautions.push('애드센스 안전성 검토가 필요합니다.');
  }
  if (volume !== null && volume < 30) {
    score -= 12;
    cautions.push('검색량이 너무 낮아 묶음 글 재료에 가깝습니다.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let verdict: MobilePublishDecision['verdict'] = 'conditional';
  if (unsafe || shortLived) verdict = 'exclude';
  else if (!hasCanonicalMeasurement) verdict = 'conditional';
  else if (score < 45) verdict = 'exclude';
  else if (score >= 72 && hasNeed) verdict = 'publish';

  const label = verdict === 'publish'
    ? '발행 추천'
    : verdict === 'conditional'
      ? '조건부'
      : '제외';
  const nextAction = verdict === 'publish'
    ? '오늘 바로 목차와 제목을 잡아 발행하세요.'
    : verdict === 'conditional'
      ? 'SERP 상위 10개와 최신성을 확인한 뒤 발행하세요.'
      : '단독 발행하지 말고 다른 글의 보조 소재로만 쓰세요.';

  return {
    verdict,
    label,
    score,
    reasons: reasons.slice(0, 5),
    cautions: cautions.slice(0, 5),
    nextAction,
    titleAngles: buildTitleAngles(keyword, verdict),
    clusterKeywords: buildClusterKeywords(keyword),
  };
}

export function attachPublishDecisions<T extends MobileKeywordMetric>(metrics: T[]): T[] {
  return metrics.map((metric) => ({
    ...metric,
    publishDecision: evaluatePublishDecision(metric),
  }));
}
