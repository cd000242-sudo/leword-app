import type {
  MobileKeywordAiJudge,
  MobileKeywordMeasurementStatus,
  MobileKeywordMetric,
  MobileKeywordResult,
  MobileResultGrade,
} from './contracts';
import {
  NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS,
  naverBlogDocumentCountQueryKey,
} from '../utils/naver-blog-api';

const ARTICLE_TITLE_KEYWORD_RE = /(보도참고자료|보도자료|브리핑|해명자료|설명자료|첨부파일|공고문|입장문|마감\s*결과|결과\s*\d{1,2}\.\d{1,2}|고유가\s*피해지원금\s*신청.*지급\s*마감)/u;

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hasTrustedDocumentCountMeasurement(metric: MobileKeywordMetric): boolean {
  const source = normalizeText(metric.documentCountSource).toLowerCase();
  const confidence = normalizeText(metric.documentCountConfidence).toLowerCase();
  const queryMode = normalizeText(metric.documentCountQueryMode).toLowerCase();
  const documentCount = finiteNumber(metric.documentCount);
  const expectedQueryKey = naverBlogDocumentCountQueryKey(metric.keyword);
  const measuredQueryKey = normalizeText(metric.documentCountQueryKey).toLowerCase();
  if (metric.isDocumentCountEstimated === true || (metric as any).dcEstimated === true) return false;
  return documentCount !== null
    && documentCount >= 0
    && expectedQueryKey.length > 0
    && measuredQueryKey === expectedQueryKey
    && source === 'naver-api'
    && confidence === 'high'
    && (queryMode === 'broad' || queryMode === 'exact-phrase');
}

export function hasCanonicalDocumentCountMeasurement(metric: MobileKeywordMetric): boolean {
  if (!hasTrustedDocumentCountMeasurement(metric) || metric.documentCountQueryMode !== 'broad') return false;
  const measuredAtMs = Date.parse(String(metric.documentCountMeasuredAt || ''));
  return Number.isFinite(measuredAtMs);
}

export function hasFreshCanonicalDocumentCountMeasurement(
  metric: MobileKeywordMetric,
  now: Date = new Date(),
  // 기본값은 재측정 캐시 TTL(15분). 표시/공급 자격 판정처럼 "값이 아직 유효한가"만
  // 물으면 되는 곳은 더 긴 창을 넘겨 쓴다 — 블로그 문서수는 분 단위로 변하지 않는다.
  maxAgeMs: number = NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS,
): boolean {
  if (!hasCanonicalDocumentCountMeasurement(metric)) return false;
  const measuredAtMs = Date.parse(String(metric.documentCountMeasuredAt || ''));
  const nowMs = now.getTime();
  return Number.isFinite(measuredAtMs)
    && measuredAtMs <= nowMs + 5 * 60 * 1000
    && nowMs - measuredAtMs <= maxAgeMs;
}

export function hasTrustedSearchVolumeMeasurement(metric: MobileKeywordMetric): boolean {
  const source = normalizeText(metric.searchVolumeSource).toLowerCase();
  const confidence = normalizeText(metric.searchVolumeConfidence).toLowerCase();
  if (metric.isSearchVolumeEstimated === true || (metric as any).svEstimated === true) return false;
  if (source === 'fallback') return false;
  if (confidence === 'low') return false;
  return true;
}

export function hasExplicitTrustedDocumentCountMeasurement(metric: MobileKeywordMetric): boolean {
  const source = normalizeText(metric.documentCountSource).toLowerCase();
  const confidence = normalizeText(metric.documentCountConfidence).toLowerCase();
  return !!source
    && source !== 'unknown'
    && source !== 'none'
    && !!confidence
    && hasTrustedDocumentCountMeasurement(metric);
}

export function hasExplicitTrustedSearchVolumeMeasurement(metric: MobileKeywordMetric): boolean {
  const source = normalizeText(metric.searchVolumeSource).toLowerCase();
  const confidence = normalizeText(metric.searchVolumeConfidence).toLowerCase();
  return !!source
    && source !== 'unknown'
    && source !== 'none'
    && !!confidence
    && hasTrustedSearchVolumeMeasurement(metric);
}

const ACTIONABLE_NEED_RE = /(신청|대상|자격|조건|방법|조회|일정|마감|서류|준비물|예매|예약|가격|비교|추천|후기|할인|쿠폰|구매|사용법|설정|해결|발급|지급일|지원금|환급|청약|등급컷|라인업|중계|주차|입장료|위치|검사|비용)/u;
const SSS_READY_NEED_INTENT_RE = /(?:\uACC4\uC0B0\uAE30|\uACF5\uD734\uC77C|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC608\uC57D|\uC608\uB9E4|\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uB300\uC0C1|\uC790\uACA9|\uC870\uAC74|\uC870\uD68C|\uC0AC\uC6A9\uCC98|\uAC00\uACA9\uBE44\uAD50|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uAD6C\uB9E4\uCC98|\uCD94\uCC9C|\uD6C4\uAE30|\uBE44\uC6A9|\uBCF4\uD5D8|\uC900\uBE44\uBB3C|\uC6B4\uC601\uC2DC\uAC04|\uC77C\uC815|\uB9C8\uAC10\uC77C|\uC11C\uB958|\uC2E4\uC218\uB839\uC561|\uC138\uAE08|\uD658\uAE09\uC77C|\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uC77C\uC6A9\uC9C1|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uC790\uB3D9\uACC4\uC0B0|\uACF5\uC81C\uD56D\uBAA9|\uD2F0\uCF13\uD305|\uC88C\uC11D\uBC30\uCE58\uB3C4|\uC694\uC728\uD45C)/u;
const COMMERCE_RE = /(가격|비교|추천|후기|할인|쿠폰|구매|최저가|가성비|제품|상품|쇼핑|렌탈|보험|카드|대출|청약|예매|예약)/u;
const EVERGREEN_RE = /(방법|조건|자격|서류|준비물|사용법|설정|해결|비교|추천|후기|조회|신청|발급|지급일|환급|주차|입장료|비용|검사|FAQ|체크리스트)/iu;
const THIN_LOOKUP_RE = /(프로필|나이|키|고향|학력|인스타|출연진|몇부작|방송시간|다시보기|공식영상|하이라이트|인물관계도|결말|쿠키영상|재방송|등장인물|줄거리만|근황)/u;
// 정보성 호기심 의도 — 설명형 글감(뜻/유래/가사/사주/프롬프트). 뉴스 이벤트와 구분한다.
const CURIOSITY_INTENT_RE = /(?:뜻|의미|유래|어원|가사|발음|실화|정체|프롬프트|나무위키|사주|관상|궁합|해몽|신조어|유행어|밈)/u;
const NEWS_ONLY_RE = /(사과|논란|해명|구속|체포|압수수색|사망|별세|결별|열애|폭로|혐의|고소|기자회견|입장문|불륜|도박|마약|음주운전)/u;
const UNSAFE_RE = /(성인|불법|해킹|도박|마약|폭행|성범죄|자살|살인|테러|혐오|개인정보유출)/u;
const GENERIC_SINGLE_RE = /^(맛집|여행|패션|프로필|뉴스|이슈|추천|후기|가격|정보|일정|예매)$/u;
const SYNTHETIC_MARKER_RE = /\b(dummy|mock|fake|sample|demo|placeholder|synthetic|estimated|estimate)\b|추정|더미|샘플|server-intent-template|server-zero-live-fallback|intent-fallback|pc-intent-expansion/i;
const LOW_DIFFERENTIATION_EVENT_RE = /(?:KBO|프로야구|올스타전|월드컵|FIFA|흠뻑쇼|신입사원\s*강회장|참교육\s*몇부작|드라마\s*참교육|로또|당첨번호|\d{3,5}\s*회|등급컷|광복절|제헌절|개천절|한글날)/iu;
const OVER_EXPANDED_INTENT_CHAIN_RE = /(?:^\d{1,2}월\s*\d{1,2}일\s+|([가-힣A-Za-z0-9]{2,})\s*신청\s*\1\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)?|^신청\s+[가-힣A-Za-z0-9]{2,}\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)|신청\s*(?:국가)?[가-힣A-Za-z0-9]{2,}\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)?|가입신청\s*(?:신청|금액)|신청\s*신청|구매처\s*(?:구매처|재고)|최저가\s*구매처\s*재고|할인\s*정보\s*(?:추천|할인|구매처|최저가|실사용)|일정\s*콘서트\s*일정|티켓팅\s*방법\s*굿즈|굿즈\s*구매\s*(?:조회|준비물|주의사항|발표|정리)|준비서류\s*(?:신청|대상|자격|조건|지급일|환급|지원|금액|조회|마감)|정리\s*운영시간|현재\s*상황\s*운영시간|정부24\s*(?:지급일|신청|조회|마감)|공식\s*확인(?:\s*경로)?|놓치기\s*쉬운\s*변경사항|변경사항|6월\s*온라인|금액\s*조회\s*(?:신청|대상|자격|지급일|환급)|마감일\s*지급일|신청기간\s*(?:대상|자격|지급일|환급|금액|지원)|정례대화\s*(?:지급일|금액|대상|신청|수당)|(?:지급일|금액|대상|신청|수당)\s*정례대화|오늘\s*확인할\s*제외|확인할\s*제외|소득\s*기준과(?:\s*제외)?|내역\s*한눈에|현재\s*상황\s*(?:정리|이유)|총정리)/u;
const BARE_OPAQUE_EVENT_BOOKING_RE = /^[\uAC00-\uD7A3A-Za-z0-9]{2,16}(?:\uC608\uB9E4|\uD2F0\uCF13\uD305)$/u;
const EVENT_BOOKING_UTILITY_EXEMPT_RE = /(?:\uD56D\uACF5\uAD8C|\uC219\uC18C|\uD638\uD154|\uB80C\uD130\uCE74|\uB80C\uD2B8\uCE74|\uAE30\uCC28|KTX|SRT|\uBC84\uC2A4|\uC720\uB78C\uC120|\uD06C\uB8E8\uC988|\uC785\uC7A5\uAD8C|\uCCB4\uD5D8|\uBC15\uB78C\uD68C|\uC804\uC2DC|\uC218\uBAA9\uC6D0|\uD734\uC591\uB9BC)/iu;
const GENERIC_BENEFIT_INTENT_RE = /^(?:지원금|보조금|환급금|장려금|바우처|수당|급여)\s*(?:신청|대상|자격|조건|지급일|조회|마감|환급|서류|사용처|지원)/u;
const BARE_INTENT_ONLY_RE = /^(?:신청|신청방법|대상|자격|조건|지급일|조회|서류|마감|마감일|환급|방법|사용처|금액|준비서류|지원|혜택|가격|비교|추천|후기|할인|쿠폰|구매처|재고|최저가)(?:\s+(?:신청|신청방법|대상|자격|조건|지급일|조회|서류|마감|마감일|환급|방법|사용처|금액|준비서류|지원|혜택|가격|비교|추천|후기|할인|쿠폰|구매처|재고|최저가)){0,2}$/u;
const TRAFFIC_CAPTURE_NEED_RE = /(신청|대상|자격|조건|지급일|입금일|조회|계산기|서류|마감|환급|사용처|예약\s*방법|예약\s*시기|취소|보험|완전자차|비교|후기|주의사항|예매|라인업|중계|일정|후보|전망|전말|이유|논란|반응|정리|방법|가격비교|실수령액|위반|신고|공식\s*확인|변경사항)/u;
const BEGINNER_MONETIZABLE_NEED_RE = /(신청|대상|자격|조건|지급일|입금일|금액|실수령액|조회|계산기|서류|마감|환급|사용처|잔액|가맹점|온라인|오프라인|지역별|예약|예매|가격|가격비교|비교|추천|후기|할인|쿠폰|구매처|최저가|보험|완전자차|취소|수수료|픽업|오류|안됨|해결|가능|주의사항|체크리스트|차이|제외|누락|이의신청|변경사항|후보|전망|전말|선임|교체|경우의\s*수|인정\s*횟수|라인업|중계)/u;
const HIDDEN_LONGTAIL_SIGNAL_RE = /(잔액조회|온라인\s*사용처|오프라인\s*사용처|지역별\s*사용처|가맹점|본인충전금|제외대상|누락|이의신청|입금일|환급일|지급일|마감일|신청기간|대상자\s*확인|서류|준비물|오류|안됨|가능\s*여부|취소\s*수수료|완전자차|자차보험|보험\s*비교|공항\s*픽업|가격비교|최저가|주의사항|실수|체크리스트|차이|비교|후기|사용처\s*조회|구직외활동|인정\s*횟수|다음\s*감독|감독\s*후보|선임\s*과정|협회\s*비리|전말|변수|경우의\s*수|반응\s*정리|후속\s*일정)/u;
const BEGINNER_MONETIZATION_TOPIC_RE = /(문화누리카드|근로장려금|자녀장려금|주휴수당|최저임금|청년|지원금|환급|세금|정책|복지|보험|카드|대출|청약|렌터카|렌트카|숙소|호텔|항공권|여행|제주|가전|청소기|에어컨|제습기|노트북|유튜브|쇼츠|지식인|네이버|가맹점|사용처|감독|축구협회|대표팀|월드컵|KBO|야구)/u;
const YEARLY_GENERIC_BENEFIT_TEMPLATE_RE = /^20\d{2}\s*(?:년\s*)?(?:(?:[가-힣0-9]{1,12})\s*)?(?:지원금|보조금|환급금|장려금|바우처|수당|급여)\s*(?:신청|신청\s*방법|대상|자격|조건|지급일|조회|마감|서류)?$/u;
const HIDDEN_DISCOVERY_PROVENANCE_RE = /(?:naver[-_ ]?autocomplete|autocomplete-(?:second-hop|exact-measured)|related-keyword-exact|real-demand-(?:echo|extension|verified)|follow-up-intent|home-(?:keyword-)?briefing-reviewed)/i;
const HIDDEN_STRONG_DISCOVERY_PROVENANCE_RE = /(?:autocomplete-second-hop|related-keyword-exact|real-demand-(?:echo|extension|verified)|follow-up-intent)/i;
const HIDDEN_COMMUNITY_SOURCE_RE = /(?:theqoo|bobaedream|ppomppu|dcinside|fmkorea|clien|ruliweb|mlbpark|inven|natepann|todayhumor|mom-cafe)/ig;
const HIDDEN_MULTI_COMMUNITY_PROVENANCE_RE = /(?:community(?:-source)?-count\s*[:=]\s*[2-9]|community-[2-9]-source|multi-source-community|cross-source-community)/i;
const HIDDEN_TEMPLATE_PROVENANCE_RE = /(?:browser-fallback|server-intent-template|server-zero-live-fallback|intent-fallback|pc-intent-expansion|template-only)/i;
const STRICT_HUNTER_CONTEXT_RE = /(golden|live-golden|pro-traffic|naver-mate|shopping-connect|kin-hidden|youtube-golden|server-measured|prewarm|persistent-measured)/i;
const SYNTHETIC_PRODUCT_BASE_RE = /(?:차량용\s*청소기|무선\s*청소기|핸디\s*청소기|로봇\s*청소기|청소기|가방|신발|운동화|레인부츠|선크림|화장품|세럼|크림|샴푸|노트북|태블릿|키보드|마우스|이어폰|헤드폰|충전기|보조배터리|텐트|텀블러)/u;
const SYNTHETIC_PRODUCT_POLICY_TAIL_RE = /(?:신청|대상|자격|지급일|서류|지원금|사용처|잔액조회|환급|실수령액|소득기준)/u;

function isSyntheticNoEffectKeywordForJudge(keyword: string): boolean {
  const compact = compactText(keyword);
  if (!compact || !SYNTHETIC_PRODUCT_BASE_RE.test(compact)) return false;
  if (/^(?:이번주|이번달|오늘|요즘|실시간)/u.test(compact)) return true;
  if (/(?:추천|후기|비교|가격)?조회(?:원룸|자취방|후기|추천)?$/u.test(compact)) return true;
  if (SYNTHETIC_PRODUCT_POLICY_TAIL_RE.test(compact)) return true;
  if (/(?:차량용\s*청소기|무선\s*청소기|핸디\s*청소기|청소기).*(?:전기요금|전기세|설치비)/u.test(compact)) return true;
  return false;
}

function keywordDomainSignalsForJudge(value: unknown) {
  const text = normalizeText(value);
  return {
    policy: /(지원금|장려금|급여|수당|정책|복지|신청|대상|지급일|정부|채용|인턴|연금|세금|환급|최저임금|주휴수당|근로장려금|자녀장려금|문화누리카드|청년도약계좌|내일배움카드)/u.test(text),
    sports: /(월드컵|축구|야구|KBO|kbo|감독|감독후보|선수|경기|하이라이트|축구협회|대표팀|이강인|김민재|이재성|손흥민|홍명보)/u.test(text),
    shopping: /(구매|가격|최저가|할인|추천|순위|후기|비교|리뷰|쿠폰|배송|스펙|브랜드|제품|상품|가전|전자|청소기|로봇청소기|공기청정기|제습기|에어컨|냉장고|세탁기|노트북|태블릿|이어폰|마사지기|영양제|유산균|화장품|선크림|샴푸|운동화|가방|매트리스|캠핑|기저귀|카시트)/u.test(text),
    local: /(제주|서울|부산|대구|인천|광주|대전|울산|강릉|속초|여행|숙소|맛집|렌터|렌트|항공권|호텔|펜션|축제|문화누리카드\s*사용처)/u.test(text),
  };
}

function isCrossDomainNonsenseKeywordForJudge(keyword: string, context = ''): boolean {
  const combined = normalizeText(`${keyword} ${context}`);
  if (!combined) return false;
  const compact = compactText(combined);
  if (/(최저임금|주휴수당|근로장려금|자녀장려금|지원금|수당|급여|정책|복지).*(감독|감독후보|축구|월드컵|kbo|야구|선수)|(?:감독|축구|월드컵|kbo|야구|선수).*(최저임금|주휴수당|근로장려금|지원금|수당|급여|정책)/u.test(compact)) {
    return true;
  }
  const signals = keywordDomainSignalsForJudge(combined);
  const culturalLocal = /문화누리카드/u.test(combined) && signals.local;
  const travelPurchase = signals.local && /(렌터|렌트|숙소|호텔|펜션|항공권|예약|가격|비교|후기|취소|보험)/u.test(combined);
  if (signals.policy && signals.sports) return true;
  if (signals.policy && signals.shopping && !culturalLocal) return true;
  if (signals.local && signals.sports) return true;
  if (signals.shopping && signals.sports) return true;
  if (signals.local && signals.shopping && !travelPurchase) return true;
  return false;
}

const ULTIMATE_LOW_VALUE_LOOKUP_RE = new RegExp([
  '\uD504\uB85C\uD544',
  '\uC778\uC2A4\uD0C0',
  '\uB098\uC774',
  '\uD559\uB825',
  '\uACE0\uD5A5',
  '\uD608\uC561\uD615',
  '\uACB0\uD63C',
  '\uB0A8\uD3B8',
  '\uC544\uB0B4',
  '\uBD80\uC778',
  '\uC5EC\uCE5C',
  '\uB0A8\uCE5C',
  '\uC5F4\uC560',
  '\uACB0\uBCC4',
  '\uBA87\uBD80\uC791',
  '\uCD9C\uC5F0\uC9C4',
  '\uBC29\uC1A1\uC2DC\uAC04',
  '\uC7AC\uBC29\uC1A1',
  '\uB2E4\uC2DC\uBCF4\uAE30',
  '\uACB0\uB9D0',
  '\uCFE0\uD0A4\uC601\uC0C1',
  '\uC6D0\uC791',
  '\uB4F1\uC7A5\uC778\uBB3C',
  '\uC778\uBB3C\uAD00\uACC4\uB3C4',
  '\uACF5\uC2DD\uC601\uC0C1',
  '\uD558\uC774\uB77C\uC774\uD2B8',
  '\uC2DC\uCCAD\uB960',
  '\uB77C\uC778\uC5C5',
  '\uC608\uACE0\uD3B8',
  '\uC904\uAC70\uB9AC',
  '\uB85C\uB610',
  '\uBCF5\uAD8C',
  '\uB2F9\uCCA8\uBC88\uD638',
  '\uB2F9\uCCA8\uC9C0\uC5ED',
  '\uD310\uB9E4\uC810',
  '\uC2E4\uC218\uB839\uC561',
  '\uB4F1\uAE09\uCEF7',
  '\uACF5\uC2DD\uC785\uC7A5',
  '\uD574\uBA85',
  '\uB17C\uB780',
  '\uAE30\uC790\uD68C\uACAC',
  '\uD68C\uB3D9',
  '\uBC1C\uC5B8',
  '\uADFC\uD669',
  '\uACF5\uAC1C',
  '\uC18C\uC2DD',
  '\uBC29\uD55C',
  '\uBC29\uBB38',
  '\uD569\uC758',
  '\uC545\uC218',
  '\uCCB4\uACB0',
  '\uD30C\uC5C5',
  '\uC218\uC0AC',
  '\uAD6C\uC18D',
  '\uBCC4\uC138',
  '\uC0AC\uB9DD',
  '\uC911\uB2E8',
  '\uB4DC\uB77C\uB9C8',
  '\uD504\uB85C\uC57C\uAD6C',
  '\uC62C\uC2A4\uD0C0\uC804',
  '\uC6D4\uB4DC\uCEF5',
  '\uD751\uBED1\uC1FC',
  'MVP',
  'KBO',
  '\uC548\uD0C0',
].join('|'), 'iu');

const ULTIMATE_HIGH_VALUE_NEED_RE = new RegExp([
  '\uC2E0\uCCAD\uBC29\uBC95',
  '\uC2E0\uCCAD',
  '\uB300\uC0C1',
  '\uC790\uACA9',
  '\uC870\uAC74',
  '\uC77C\uC815',
  '\uC9C0\uAE09\uC77C',
  '\uC870\uD68C',
  '\uC11C\uB958',
  '\uB9C8\uAC10',
  '\uD658\uAE09',
  '\uC9C0\uC6D0\uAE08',
  '\uD61C\uD0DD',
  '\uCCAD\uC57D',
  '\uBC14\uC6B0\uCC98',
  '\uC218\uB2F9',
  '\uAE09\uC5EC',
  '\uACC4\uC0B0\uAE30',
  '\uACC4\uC0B0',
  '\uC2E4\uC218\uB839\uC561',
  '\uBCF4\uC99D',
  '\uC138\uC561\uACF5\uC81C',
  '\uBCF4\uD5D8',
  '\uB300\uCD9C',
  '\uCE74\uB4DC',
  '\uACC4\uC88C',
  '\uBC1C\uAE09',
  '\uC624\uB958',
  '\uC124\uC815',
  '\uC0AC\uC6A9\uBC95',
  '\uD574\uACB0',
  '\uAC00\uACA9\uBE44\uAD50',
  '\uBE44\uAD50',
  '\uCD94\uCC9C',
  '\uD6C4\uAE30',
  '\uB9AC\uBDF0',
  '\uD560\uC778',
  '\uCFE0\uD3F0',
  '\uAD6C\uB9E4\uCC98',
  '\uCD5C\uC800\uAC00',
  '\uC7AC\uACE0',
  '\uBC30\uC1A1',
  '\uB9E4\uC7A5',
  '\uAC00\uACA9',
  '\uBE44\uC6A9',
  '\uACAC\uC801',
  '\uAD50\uCCB4',
  '\uC218\uB9AC',
  'AS',
  '\uC785\uC7A5\uB8CC',
  '\uC8FC\uCC28',
  '\uC601\uC5C5\uC2DC\uAC04',
  '\uC704\uCE58',
  '\uC608\uC57D\uBC29\uBC95',
  '\uC608\uB9E4',
  '\uD2F0\uCF13\uD305',
  '\uCDE8\uC18C\uD45C',
  '\uD658\uBD88',
  '\uC88C\uC11D',
  '\uC900\uBE44\uBB3C',
  '\uCCB4\uD06C\uB9AC\uC2A4\uD2B8',
].join('|'), 'iu');

const VIDEO_BRIDGE_NEED_RE = new RegExp([
  '\uC21C\uC704',
  '\uCD94\uCC9C',
  '\uD6C4\uAE30',
  '\uB9AC\uBDF0',
  '\uBE44\uAD50',
  '\uAC00\uACA9',
  '\uCD5C\uC800\uAC00',
  '\uAD6C\uB9E4\uCC98',
  '\uC0AC\uC6A9\uBC95',
  '\uC124\uCE58',
  '\uC815\uB9AC',
  '\uC815\uB9AC\uB300',
  '\uC815\uB9AC\uD568',
  '\uC218\uB0A9',
  '\uCCAD\uC18C',
  '\uAD00\uB9AC',
  '\uC608\uC57D',
  '\uC608\uB9E4',
  '\uC5B8\uBC15\uC2F1',
  '\uD558\uC6B8',
  '\uCF54\uC2A4',
].join('|'), 'iu');

const VIDEO_BRIDGE_TOPIC_RE = new RegExp([
  '\uC81C\uC2B5\uAE30',
  '\uC5D0\uC5B4\uCEE8',
  '\uCCAD\uC18C\uAE30',
  '\uC120\uD48D\uAE30',
  '\uB0C9\uC7A5\uACE0',
  '\uC138\uD0C1\uAE30',
  '\uAC74\uC870\uAE30',
  '\uB85C\uBD07\uCCAD\uC18C\uAE30',
  '\uC815\uB9AC\uB300',
  '\uC815\uB9AC\uD568',
  '\uC218\uB0A9',
  '\uB0C4\uBE44',
  '\uC811\uC2DC',
  '\uC218\uC800',
  '\uC2E0\uBC1C\uC7A5',
  '\uB9AC\uC870\uD2B8',
  '\uD39C\uC158',
  '\uCEA0\uD551\uC7A5',
  '\uACC4\uACE1',
  '\uC219\uC18C',
  '\uD638\uD154',
  '\uC6CC\uD130\uD30C\uD06C',
  '\uCD95\uC81C',
  '\uB9DB\uC9D1',
  '\uCE74\uD398',
  '\uC5EC\uD589',
].join('|'), 'iu');

const YOUTUBE_BRIDGE_CONTEXT_RE = /(youtube|shorts|video|server-measured-youtube|pc-youtube|youtube-golden)/i;
const SHOPPING_CONNECT_CONTEXT_RE = /(shopping-connect|server-measured-shopping|pc-shopping|commerce-entry|shopping|commerce)/i;

const SHOPPING_CONNECT_TOPIC_RE = new RegExp([
  '\uC81C\uC2B5\uAE30',
  '\uC5D0\uC5B4\uCEE8',
  '\uCCAD\uC18C\uAE30',
  '\uC120\uD48D\uAE30',
  '\uB0C9\uC7A5\uACE0',
  '\uC138\uD0C1\uAE30',
  '\uAC74\uC870\uAE30',
  '\uB85C\uBD07\uCCAD\uC18C\uAE30',
  '\uC815\uB9AC\uB300',
  '\uC815\uB9AC\uD568',
  '\uC218\uB0A9',
  '\uB0C4\uBE44',
  '\uC811\uC2DC',
  '\uC218\uC800',
  '\uC2E0\uBC1C\uC7A5',
  '\uB80C\uD0C8',
  '\uAD6C\uB3C5',
  '\uB9AC\uC870\uD2B8',
  '\uD39C\uC158',
  '\uCEA0\uD551\uC7A5',
  '\uACC4\uACE1',
  '\uC219\uC18C',
  '\uD638\uD154',
  '\uC6CC\uD130\uD30C\uD06C',
].join('|'), 'iu');

const ULTIMATE_ACTION_MODIFIER_RE = new RegExp([
  '\uC2E0\uCCAD\uBC29\uBC95',
  '\uC2E0\uCCAD',
  '\uB300\uC0C1',
  '\uC790\uACA9',
  '\uC870\uAC74',
  '\uC77C\uC815',
  '\uC9C0\uAE09\uC77C',
  '\uC870\uD68C',
  '\uC11C\uB958',
  '\uB9C8\uAC10',
  '\uD658\uAE09',
  '\uD61C\uD0DD',
  '\uCCAD\uC57D',
  '\uC0AC\uC6A9\uCC98',
  '\uC218\uB2F9',
  '\uAE09\uC5EC',
  '\uACC4\uC0B0\uAE30',
  '\uACC4\uC0B0',
  '\uC2E4\uC218\uB839\uC561',
  '\uBC1C\uAE09',
  '\uC624\uB958',
  '\uC124\uC815',
  '\uC0AC\uC6A9\uBC95',
  '\uD574\uACB0',
  '\uAC00\uACA9\uBE44\uAD50',
  '\uBE44\uAD50',
  '\uCD94\uCC9C',
  '\uD6C4\uAE30',
  '\uB9AC\uBDF0',
  '\uD560\uC778',
  '\uCFE0\uD3F0',
  '\uAD6C\uB9E4\uCC98',
  '\uCD5C\uC800\uAC00',
  '\uC7AC\uACE0',
  '\uBC30\uC1A1',
  '\uB9E4\uC7A5',
  '\uAC00\uACA9',
  '\uBE44\uC6A9',
  '\uACAC\uC801',
  '\uAD50\uCCB4',
  '\uC218\uB9AC',
  'AS',
  '\uC785\uC7A5\uB8CC',
  '\uC8FC\uCC28',
  '\uC601\uC5C5\uC2DC\uAC04',
  '\uC704\uCE58',
  '\uC608\uC57D\uBC29\uBC95',
  '\uC608\uB9E4',
  '\uD2F0\uCF13\uD305',
  '\uCDE8\uC18C\uD45C',
  '\uD658\uBD88',
  '\uC88C\uC11D',
  '\uC900\uBE44\uBB3C',
  '\uCCB4\uD06C\uB9AC\uC2A4\uD2B8',
].join('|'), 'iu');

const ULTIMATE_EVENT_UTILITY_RE = new RegExp([
  '\uC785\uC7A5\uB8CC',
  '\uC8FC\uCC28',
  '\uAC00\uACA9',
  '\uC88C\uC11D',
  '\uCDE8\uC18C',
  '\uD658\uBD88',
  '\uC219\uC18C',
  '\uAD50\uD1B5',
  '\uC608\uB9E4\uBC29\uBC95',
  '\uC608\uC57D\uBC29\uBC95',
  '\uC900\uBE44\uBB3C',
].join('|'), 'iu');

// 'issue' 제외: live_issue 는 주제가 아니라 '실시간 트렌드에서 발굴됨'이라는 경로 라벨이다.
// 이걸 저가치 주제로 취급하면 제품('더에셀 바디솔트')·정책·생활 키워드까지 연예 가십과
// 같이 배제된다. 실제 연예/스포츠 주제는 celeb·drama·movie·music·sports 로 계속 걸린다.
const ULTIMATE_LOW_VALUE_CATEGORY_RE = /(?:celeb|drama|broadcast|movie|music|sports|entertainment)/i;

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
    metric.searchVolumeSource,
    metric.searchVolumeConfidence,
    metric.isSearchVolumeEstimated ? 'search-volume-estimated' : '',
    metric.documentCountSource,
    metric.documentCountConfidence,
    metric.isDocumentCountEstimated ? 'document-count-estimated' : '',
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  if (SYNTHETIC_MARKER_RE.test(markerText)) return 'synthetic-blocked';
  if (!hasTrustedSearchVolumeMeasurement(metric) || !hasTrustedDocumentCountMeasurement(metric)) {
    return 'synthetic-blocked';
  }

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
  if (ratio >= 1.2) return 0;
  if (ratio >= 0.8) return -8;
  return -12;
}

function categorySignal(category: string): number {
  const clean = compactText(category);
  if (/policy|finance|shopping|commerce|it|education|health|travel|food|home|life/.test(clean)) return 6;
  if (/celeb|drama|broadcast|movie|sports|music|issue/.test(clean)) return -2;
  return 0;
}

function hasRegexIntent(pattern: RegExp, keyword: string): boolean {
  const clean = normalizeText(keyword);
  if (pattern.test(clean)) return true;
  const compacted = clean.replace(/\s+/g, '');
  return compacted !== clean && pattern.test(compacted);
}

function hasOverExpandedIntentChain(keyword: string): boolean {
  return hasRegexIntent(OVER_EXPANDED_INTENT_CHAIN_RE, keyword);
}

function hasMultiCommunityHiddenNeedEvidence(context: string): boolean {
  if (HIDDEN_MULTI_COMMUNITY_PROVENANCE_RE.test(context)) return true;
  const sourceIds = new Set((context.match(HIDDEN_COMMUNITY_SOURCE_RE) || []).map((value) => value.toLowerCase()));
  return sourceIds.size >= 2;
}

function hasCanonicalSearchAdHiddenNeedMeasurement(
  metric: MobileKeywordMetric,
  now: Date = new Date(),
): boolean {
  const pc = finiteNumber(metric.pcSearchVolume);
  const mobile = finiteNumber(metric.mobileSearchVolume);
  const total = finiteNumber(metric.totalSearchVolume);
  const measuredAtMs = Date.parse(String(metric.searchVolumeMeasuredAt || ''));
  const hasExactSearchAd = normalizeText(metric.searchVolumeSource).toLowerCase() === 'searchad'
    && normalizeText(metric.searchVolumeConfidence).toLowerCase() === 'high'
    && normalizeText(metric.searchVolumeBindingVersion).toLowerCase() === 'keyword-keyed-v2'
    && metric.isSearchVolumeEstimated !== true
    && (metric as any).svEstimated !== true
    && Number.isFinite(measuredAtMs)
    && pc !== null && pc >= 0
    && mobile !== null && mobile >= 0
    && total !== null && total > 0
    && Math.abs(pc + mobile - total) < 0.01;
  return hasExactSearchAd && hasFreshCanonicalDocumentCountMeasurement(metric, now);
}

function hiddenNeedProvenanceContext(
  metric: MobileKeywordMetric,
  runtimeContext: string,
  now: Date = new Date(),
): string {
  return normalizeText([
    runtimeContext,
    `search-volume-source:${normalizeText(metric.searchVolumeSource)}`,
    `search-volume-binding:${normalizeText(metric.searchVolumeBindingVersion)}`,
    `document-count-source:${normalizeText(metric.documentCountSource)}`,
    `document-count-mode:${normalizeText(metric.documentCountQueryMode)}`,
    `hidden-canonical-measurement:${hasCanonicalSearchAdHiddenNeedMeasurement(metric, now)}`,
  ].join(' '));
}

function hasBeginnerMonetizableHiddenNeedKeyword(keyword: string, category = '', context = ''): boolean {
  const clean = normalizeText(keyword);
  if (!clean) return false;
  if (GENERIC_SINGLE_RE.test(clean) || ARTICLE_TITLE_KEYWORD_RE.test(clean) || ARTICLE_TITLE_KEYWORD_RE.test(compactText(clean))) {
    return false;
  }
  if (hasOverExpandedIntentChain(clean) || isCrossDomainNonsenseKeywordForJudge(clean, `${category} ${context}`)) {
    return false;
  }
  if (THIN_LOOKUP_RE.test(clean) || UNSAFE_RE.test(clean)) return false;
  if (GENERIC_BENEFIT_INTENT_RE.test(clean) || YEARLY_GENERIC_BENEFIT_TEMPLATE_RE.test(clean)) return false;
  if (HIDDEN_TEMPLATE_PROVENANCE_RE.test(context)) return false;

  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  if (compactLength < 5 || compactLength > 30 || tokenCount > 6) return false;

  const corpus = normalizeText(`${clean} ${category} ${context}`);
  const domain = keywordDomainSignalsForJudge(corpus);
  const hasClearNeed = hasRegexIntent(BEGINNER_MONETIZABLE_NEED_RE, clean)
    || hasRegexIntent(TRAFFIC_CAPTURE_NEED_RE, clean)
    || hasRegexIntent(SSS_READY_NEED_INTENT_RE, clean);
  const hasExplicitHiddenSignal = hasRegexIntent(HIDDEN_LONGTAIL_SIGNAL_RE, clean);
  const hasDiscoveryProvenance = HIDDEN_DISCOVERY_PROVENANCE_RE.test(context);
  const hasStrongDiscoveryProvenance = HIDDEN_STRONG_DISCOVERY_PROVENANCE_RE.test(context)
    || hasMultiCommunityHiddenNeedEvidence(context);
  const hasMeasuredProvenance = /hidden-canonical-measurement:true/i.test(context);
  const hasHiddenLongtail = hasExplicitHiddenSignal
    || hasStrongDiscoveryProvenance;
  const hasTrustedHiddenProvenance = hasDiscoveryProvenance
    || hasStrongDiscoveryProvenance
    || hasMeasuredProvenance;
  const hasMonetizableTopic = BEGINNER_MONETIZATION_TOPIC_RE.test(corpus)
    || COMMERCE_RE.test(corpus)
    || domain.policy
    || domain.shopping
    || domain.local
    || (domain.sports && hasRegexIntent(TRAFFIC_CAPTURE_NEED_RE, clean));

  return hasClearNeed && hasHiddenLongtail && hasTrustedHiddenProvenance && hasMonetizableTopic;
}

export function isUltimateLowValueLookupKeyword(keyword: string): boolean {
  const clean = normalizeText(keyword);
  const nonLotterySettlementNeed = /\uC2E4\uC218\uB839\uC561/u.test(clean)
    && !/(?:\uB85C\uB610|\uBCF5\uAD8C|\uB2F9\uCCA8)/u.test(clean);
  return !!clean && (
    ARTICLE_TITLE_KEYWORD_RE.test(clean)
    || ARTICLE_TITLE_KEYWORD_RE.test(compactText(clean))
    || THIN_LOOKUP_RE.test(clean)
    || NEWS_ONLY_RE.test(clean)
    || LOW_DIFFERENTIATION_EVENT_RE.test(clean)
    || hasOverExpandedIntentChain(clean)
    || (BARE_OPAQUE_EVENT_BOOKING_RE.test(clean.replace(/\s+/g, '')) && !EVENT_BOOKING_UTILITY_EXEMPT_RE.test(clean))
    || GENERIC_BENEFIT_INTENT_RE.test(clean)
    || BARE_INTENT_ONLY_RE.test(clean)
    || (ULTIMATE_LOW_VALUE_LOOKUP_RE.test(clean) && !nonLotterySettlementNeed)
  );
}

export function hasUltimateHighValueNeedIntent(keyword: string): boolean {
  return hasRegexIntent(ULTIMATE_HIGH_VALUE_NEED_RE, keyword);
}

function hasUltimateEventUtility(keyword: string): boolean {
  return hasRegexIntent(ULTIMATE_EVENT_UTILITY_RE, keyword);
}

function hasUltimateActionModifier(keyword: string): boolean {
  return hasRegexIntent(ULTIMATE_ACTION_MODIFIER_RE, keyword);
}

function isUltimateLowValueCategory(category: string): boolean {
  return ULTIMATE_LOW_VALUE_CATEGORY_RE.test(compactText(category));
}

function isTooBroadLowValueEventKeyword(keyword: string, category: string): boolean {
  if (!isUltimateLowValueCategory(category)) return false;
  const compact = compactText(keyword);
  if (!compact) return true;
  if (compact.length < 7) return true;
  return /^(?:콘서트|공연|뮤지컬|영화|드라마|예능|방송|티켓|티켓팅)(?:예매|일정|예약|가격|좌석)$/u.test(compact);
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
  const runtimeIntentText = [
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  const overExpandedIntentChain = hasOverExpandedIntentChain(keyword);
  const lowValueLookup = isUltimateLowValueLookupKeyword(keyword);
  const articleTitleLike = ARTICLE_TITLE_KEYWORD_RE.test(keyword) || ARTICLE_TITLE_KEYWORD_RE.test(compactText(keyword));
  const highValueNeed = hasUltimateHighValueNeedIntent(keyword);
  const actionModifier = hasUltimateActionModifier(keyword);
  const eventUtility = hasUltimateEventUtility(keyword);
  const lowValueCategory = isUltimateLowValueCategory(category);
  const broadLowValueEvent = isTooBroadLowValueEventKeyword(keyword, category);
  const sssReadyNeed = hasRegexIntent(SSS_READY_NEED_INTENT_RE, keyword);
  const trafficCaptureNeed = hasRegexIntent(TRAFFIC_CAPTURE_NEED_RE, keyword);
  const crossDomainNonsense = isCrossDomainNonsenseKeywordForJudge(keyword, runtimeIntentText);
  const syntheticNoEffect = isSyntheticNoEffectKeywordForJudge(keyword);
  const strictHunterContext = STRICT_HUNTER_CONTEXT_RE.test(runtimeIntentText);
  const beginnerHiddenNeed = hasBeginnerMonetizableHiddenNeedKeyword(
    keyword,
    category,
    hiddenNeedProvenanceContext(metric, runtimeIntentText, now),
  );
  const commerce = COMMERCE_RE.test(keyword);
  const shoppingConnectContext = SHOPPING_CONNECT_CONTEXT_RE.test(runtimeIntentText);
  const shoppingConnectNeed = shoppingConnectContext
    && !lowValueLookup
    && !broadLowValueEvent
    && (
      commerce
      || hasRegexIntent(VIDEO_BRIDGE_NEED_RE, keyword)
      || hasRegexIntent(SHOPPING_CONNECT_TOPIC_RE, keyword)
    );
  const ultimateCommerce = (commerce || shoppingConnectNeed)
    && (!lowValueCategory || highValueNeed || eventUtility || shoppingConnectNeed);
  const evergreen = EVERGREEN_RE.test(keyword);
  const youtubeBridgeContext = YOUTUBE_BRIDGE_CONTEXT_RE.test(runtimeIntentText);
  const videoBridgeNeed = youtubeBridgeContext
    && !lowValueLookup
    && !broadLowValueEvent
    && (
      hasRegexIntent(VIDEO_BRIDGE_NEED_RE, keyword)
      || (
        hasRegexIntent(VIDEO_BRIDGE_TOPIC_RE, keyword)
        && (commerce || /shopping|commerce|electronics|home|life|living|travel|food|youtube|shorts|video/i.test(runtimeIntentText))
      )
    );
  // 실측으로 증명된 황금 경제성 — 수요와 저경쟁이 모두 실측되면 키워드 "문구"가
  // 상용/정책 의도 정규식에 없어도(정보성·호기심·이슈형) 쓸 가치가 증명된 것으로 본다.
  // 포화 키워드(redOcean, 비율<1)는 이 조건을 절대 만족하지 못한다.
  // 정보성 호기심(뜻/유래/가사/사주…) — 설명형 글감. 뉴스 이벤트('…사퇴')와 달리
  // 상시 검색되는 저경쟁 롱테일이라 광의 이벤트 차단에서만 예외로 둔다.
  const curiosityIntent = CURIOSITY_INTENT_RE.test(keyword) || CURIOSITY_INTENT_RE.test(compactText(keyword));
  const provenGoldenEconomics = status === 'measured'
    // 판정 우회는 '정보성 호기심'(뜻/유래/가사/사주) 키워드에만 적용한다.
    // 뉴스·스포츠 이벤트 헤드('홍명보 감독 사퇴')는 문서수가 적어도 기존 로직 그대로 배제.
    // (카테고리 오분류로 막히는 제품 키워드는 분류기에서 고쳐야 할 별도 문제다.)
    && curiosityIntent
    // 구조적으로 깨진 키워드(합성 의도 체인·도메인 충돌·무효과 합성)는 문서수가
    // 적어도 "기회"가 아니라 아무도 쓰지 않는 조합일 뿐이다. 경제성 우회 금지.
    && !overExpandedIntentChain
    && !crossDomainNonsense
    && !syntheticNoEffect
    && !articleTitleLike
    && total !== null
    && total >= 1000
    && documents !== null
    && documents > 0
    && documents <= 3000
    && ratio !== null
    && ratio >= 10;
  const actionable = (!lowValueLookup || provenGoldenEconomics)
    && (!broadLowValueEvent || (provenGoldenEconomics && curiosityIntent))
    && !crossDomainNonsense
    && !syntheticNoEffect
    && (ACTIONABLE_NEED_RE.test(keyword) || trafficCaptureNeed || highValueNeed || sssReadyNeed || videoBridgeNeed || shoppingConnectNeed || beginnerHiddenNeed || provenGoldenEconomics)
    && (!lowValueCategory || highValueNeed || sssReadyNeed || ultimateCommerce || eventUtility || videoBridgeNeed || trafficCaptureNeed || beginnerHiddenNeed || provenGoldenEconomics);
  const thin = lowValueLookup || GENERIC_SINGLE_RE.test(keyword);
  const newsOnly = NEWS_ONLY_RE.test(keyword);
  const unsafe = UNSAFE_RE.test(keyword);
  const redOceanMeasured = status === 'measured'
    && total !== null
    && total >= 100
    && documents !== null
    && documents > 0
    && ratio !== null
    && ratio < 1;

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
  if (trafficCaptureNeed) {
    score += 8;
    reasons.push('traffic-capture-need-intent');
  }
  if (beginnerHiddenNeed) {
    score += 14;
    reasons.push('beginner-monetizable-hidden-need');
  } else if (strictHunterContext && !shoppingConnectNeed && !videoBridgeNeed && !eventUtility) {
    score -= 16;
    reasons.push('hunter-charter-missing-hidden-monetizable-need');
  }
  if (highValueNeed) {
    score += 8;
    reasons.push('ultimate-high-value-need-intent');
  }
  if (ultimateCommerce) {
    score += 8;
    reasons.push('commerce-or-conversion-angle');
  }
  if (shoppingConnectNeed) {
    score += 10;
    reasons.push('shopping-connect-buyer-or-booking-intent');
  }
  if (videoBridgeNeed) {
    score += 12;
    reasons.push('youtube-shorts-video-search-intent');
  }
  if (evergreen) {
    score += 7;
    reasons.push('evergreen-blog-angle');
  }
  if (articleTitleLike) {
    score -= 70;
    rejectReason ||= 'article-title-not-keyword';
    reasons.push('article-title-not-keyword');
  }
  if (thin && !provenGoldenEconomics) {
    score -= lowValueLookup ? 52 : 30;
    rejectReason ||= overExpandedIntentChain ? 'over-expanded-intent-chain' : lowValueLookup ? 'low-value-lookup-intent' : 'thin-lookup-or-profile-intent';
  }
  if (newsOnly) {
    score -= 26;
    rejectReason ||= 'news-headline-only-risk';
  }
  if (lowValueCategory && !highValueNeed && !ultimateCommerce && !eventUtility && !videoBridgeNeed && !trafficCaptureNeed && !beginnerHiddenNeed && !provenGoldenEconomics) {
    score -= 24;
    rejectReason ||= 'low-value-entertainment-or-sports-intent';
  }
  if (broadLowValueEvent && !(provenGoldenEconomics && curiosityIntent)) {
    score -= 34;
    rejectReason ||= 'too-broad-entertainment-event-intent';
  }
  if (unsafe) {
    score -= 44;
    rejectReason ||= 'unsafe-or-sensitive-topic';
  }
  if (crossDomainNonsense) {
    score -= 60;
    rejectReason ||= 'cross-domain-intent-collision';
    reasons.push('cross-domain-intent-collision');
  }
  if (syntheticNoEffect) {
    score -= 62;
    rejectReason ||= 'synthetic-no-effect-keyword-combo';
    reasons.push('synthetic-no-effect-keyword-combo');
  }
  if (redOceanMeasured) {
    score -= 30;
    reasons.push('document-count-exceeds-search-demand');
    rejectReason ||= 'document-count-exceeds-search-demand';
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

  // 메트릭 기반 니즈 fallback (Phase 2): 액션 토큰이 없어도, 실측된 저경쟁
  // (낮은 문서수 + 유효 비율) 키워드는 초보자가 실제로 1페이지에 걸 수 있는 실수요로 보고
  // 'weak' 대신 'medium' 으로 인정한다. 토큰 정규식만으로 진짜 니즈키워드를
  // 떨어뜨리던 문제를 보정한다. thin/lookup/unsafe/뉴스성은 fallback 대상에서 제외.
  const metricWinnableNeed = status === 'measured'
    && !thin
    && !lowValueLookup
    && !unsafe
    && !newsOnly
    && !crossDomainNonsense
    && !broadLowValueEvent
    && !(lowValueCategory && !highValueNeed && !ultimateCommerce && !eventUtility && !videoBridgeNeed && !trafficCaptureNeed && !beginnerHiddenNeed)
    && total !== null && total >= 100
    && documents !== null && documents > 0 && documents <= 2_000
    && ratio !== null && ratio >= 1.5;

  const needIntent: MobileKeywordAiJudge['needIntent'] = actionable
    ? 'strong'
    : ultimateCommerce || evergreen || videoBridgeNeed || metricWinnableNeed
      ? 'medium'
      : 'weak';
  const blogAngle: MobileKeywordAiJudge['blogAngle'] = unsafe
    ? 'unsafe'
    : thin || newsOnly
      ? 'thin'
      : actionable || evergreen || videoBridgeNeed
        ? 'actionable'
        : 'informational';
  const shoppingIntent: MobileKeywordAiJudge['shoppingIntent'] = commerce || shoppingConnectNeed
    ? 'high'
    : /shopping|commerce|fashion|beauty|electronics|travel|food/.test(compactText(category))
      ? 'medium'
      : 'low';
  const adsenseValue: MobileKeywordAiJudge['adsenseValue'] = score >= 78
    && !lowValueLookup
    && !newsOnly
    && (highValueNeed || ultimateCommerce || videoBridgeNeed || beginnerHiddenNeed)
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
    || (lowValueLookup && !provenGoldenEconomics)
    || (broadLowValueEvent && !(provenGoldenEconomics && curiosityIntent))
    || crossDomainNonsense
    || syntheticNoEffect
    || redOceanMeasured
    || status === 'synthetic-blocked'
    || score < 45
    || (thin && !actionable)
    || (newsOnly && !ultimateCommerce)
    || (lowValueCategory && !highValueNeed && !ultimateCommerce && !eventUtility && !videoBridgeNeed && !trafficCaptureNeed && !beginnerHiddenNeed && !provenGoldenEconomics)
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

export interface UltimateGoldenKeywordCandidateOptions {
  now?: Date;
  requirePcMobileSplit?: boolean;
  requireMeasurementProvenance?: boolean;
  minAiScore?: number;
  minTotalSearchVolume?: number;
  maxDocumentCount?: number;
  minGoldenRatio?: number;
}

export function isUltimateGoldenKeywordCandidate(
  metric: MobileKeywordMetric,
  options: UltimateGoldenKeywordCandidateOptions = {},
): boolean {
  const keyword = normalizeText(metric.keyword);
  if (!keyword) return false;

  const status = keywordMeasurementStatus(metric);
  if (status !== 'measured') return false;

  const pc = finiteNumber(metric.pcSearchVolume);
  const mobile = finiteNumber(metric.mobileSearchVolume);
  const hasPcMobileSplit = pc !== null
    && mobile !== null
    && pc >= 0
    && mobile >= 0
    && pc + mobile > 0;
  if (options.requirePcMobileSplit && !hasPcMobileSplit) return false;
  if (options.requireMeasurementProvenance) {
    if (!hasExplicitTrustedSearchVolumeMeasurement(metric)) return false;
    if (!hasExplicitTrustedDocumentCountMeasurement(metric)) return false;
  }

  const total = finiteNumber(metric.totalSearchVolume);
  const documents = finiteNumber(metric.documentCount);
  const ratio = finiteNumber(metric.goldenRatio)
    ?? (total !== null && documents !== null && documents > 0 ? total / documents : null);
  if (total === null || documents === null || ratio === null) return false;
  if (total < (options.minTotalSearchVolume ?? 120)) return false;
  if (documents <= 0 || documents > (options.maxDocumentCount ?? 15000)) return false;
  if (ratio < (options.minGoldenRatio ?? 3)) return false;

  if (isUltimateLowValueLookupKeyword(keyword)) return false;
  if (isSyntheticNoEffectKeywordForJudge(keyword)) return false;

  const category = normalizeText(metric.category);
  const runtimeIntentText = [
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  const now = options.now ?? new Date();
  const highValueNeed = hasUltimateHighValueNeedIntent(keyword);
  const actionModifier = hasUltimateActionModifier(keyword);
  const trafficCaptureNeed = hasRegexIntent(TRAFFIC_CAPTURE_NEED_RE, keyword);
  const beginnerHiddenNeed = hasBeginnerMonetizableHiddenNeedKeyword(
    keyword,
    category,
    hiddenNeedProvenanceContext(metric, runtimeIntentText, now),
  );
  const eventUtility = hasUltimateEventUtility(keyword);
  const lowValueCategory = isUltimateLowValueCategory(category);
  if (isTooBroadLowValueEventKeyword(keyword, category)) return false;
  const commerce = COMMERCE_RE.test(keyword) && (!lowValueCategory || highValueNeed || eventUtility);
  const scarceBareNeed = highValueNeed && documents <= 15000 && ratio >= 3;
  if (!beginnerHiddenNeed && !commerce && !scarceBareNeed) return false;
  if (!highValueNeed && !commerce && !(beginnerHiddenNeed && trafficCaptureNeed)) return false;
  if (!actionModifier && !commerce && !scarceBareNeed && !beginnerHiddenNeed) return false;
  if (lowValueCategory && !highValueNeed && !commerce && !eventUtility && !beginnerHiddenNeed && !trafficCaptureNeed) return false;

  const judge = metric.aiJudge ?? judgeKeywordMetric(metric, now);
  if (judge.verdict !== 'publish') return false;
  if (judge.score < (options.minAiScore ?? 78)) return false;
  if (judge.needIntent !== 'strong') return false;
  if (judge.blogAngle !== 'actionable') return false;
  if (judge.adsenseValue !== 'high') return false;
  if (judge.spamRisk === 'high' || judge.freshnessRisk === 'high') return false;
  return true;
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
