import { classifyKeywordIntent, getNaverKeywordSearchVolumeSeparate, NaverDatalabConfig } from './naver-datalab-api';
import { classifyKeyword } from './categories';
import { buildCategoryFirstGoldenSeedPlan } from './category-first-golden-discovery';
import { getCrossCategoryDiscoverySeeds, getDiscoveryCategorySeeds, matchesDiscoveryCategory, resolveDiscoveryCategoryIds } from './category-discovery-map';
import { rankGoldenDiscoveryResults, isActionableGoldenKeyword, compactGoldenKeyword, isQualityGoldenDiscoveryResult, countSss } from './golden-discovery-floor';
import { MDPResult, GoldenGrade } from './mdp-engine';
import { calculateCompetitionLevel, calculatePurchaseIntent, estimateCPC } from './profit-golden-keyword-engine';
import { generateQueryPatterns } from './pattern-generator';
import { splitKeywordSemantically } from './semantic-splitter';
import type { NaverSearchAdConfig } from './naver-searchad-api';

export interface DirectGoldenKeywordMinerOptions {
  category?: string;
  keyword?: string;
  limit?: number;
  maxSeeds?: number;
  maxCandidates?: number;
  liveSeeds?: string[];
  includeCrossCategory?: boolean;
  requireCategoryMatch?: boolean;
  includeSearchAdSuggestions?: boolean;
  includeProTrafficSupplement?: boolean;
  suggestionSeedLimit?: number;
  suggestionsPerSeed?: number;
  maxSimilarPerCluster?: number;
  onProgress?: (progress: DirectGoldenKeywordMinerProgress) => void;
}

export interface DirectGoldenKeywordMinerProgress {
  phase: 'candidate-plan' | 'searchad-suggestions' | 'measure' | 'rank' | 'supplement-suggestions' | 'supplement-measure' | 'supplement-rank' | 'pro-supplement';
  candidates?: number;
  anchorCandidates?: number;
  suggestionSeeds?: number;
  suggestionCandidates?: number;
  supplementCandidates?: number;
  proSupplementCandidates?: number;
  measured?: number;
  yielded?: number;
}

export interface DirectGoldenKeywordCandidatePlan {
  category: string;
  categoryIds: string[];
  seeds: string[];
  candidates: string[];
}

type MeasuredKeywordRow = Awaited<ReturnType<typeof getNaverKeywordSearchVolumeSeparate>>[number];

const DEFAULT_LIMIT = 30;
const MIN_VOLUME = 10;
const DIRECT_BULK_SSS_RATIO = 0.7;
const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const CURRENT_MONTH = new Date().getMonth() + 1;
const LOTTO_FIRST_DRAW_AT_KST_MS = Date.UTC(2002, 11, 7, 11, 35, 0);
const LOTTO_DRAW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const VOLATILE_EXAM_ANSWER_RE = /(?:\d{4}\s*)?(?:6모|9모|모의고사|모평|수능|기출).{0,10}(?:등급컷|답지|정답|해설)|(?:등급컷|답지|정답|해설).{0,10}(?:6모|9모|모의고사|모평|수능|기출)/;

function currentLottoRound(now: Date = new Date()): number {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || nowMs <= LOTTO_FIRST_DRAW_AT_KST_MS) return 1;
  return Math.floor((nowMs - LOTTO_FIRST_DRAW_AT_KST_MS) / LOTTO_DRAW_INTERVAL_MS) + 1;
}

const COMMON_DIRECT_INTENTS = [
  '일정',
  '발표',
  '신청방법',
  '대상',
  '자격',
  '조회',
  '마감',
  '주의사항',
  '총정리',
];

const CATEGORY_DIRECT_INTENTS: Record<string, string[]> = {
  policy: [
    '신청방법',
    '대상',
    '자격',
    '지급일',
    '신청기간',
    '필요서류',
    '조회',
    '사용처',
    '마감',
    '공식발표',
    '정책브리핑',
  ],
  sports: [
    '중계',
    '경기일정',
    '티켓팅 일정',
    '예매',
    '라인업',
    '순위',
    '선발',
    '하이라이트',
    '직관 준비물',
    '경기 시간',
    '결과',
    '부상 소식',
  ],
  movie: [
    '개봉일',
    '출연진',
    '결말 해석',
    '쿠키영상',
    'OTT 보는곳',
    '예매',
    '관람평',
    '상영관',
    '줄거리',
    '원작 차이',
  ],
  drama: [
    '방송시간',
    '출연진',
    '몇부작',
    '다시보기',
    '결말 해석',
    '인물관계도',
    '공식영상',
    '촬영지',
    'OST',
  ],
  broadcast: [
    '방송시간',
    '출연진',
    '게스트',
    '다시보기',
    '시청률',
    '공식영상',
    '방청 신청',
  ],
  celeb: [
    '프로필',
    '근황',
    '공식입장',
    '나이',
    '인스타',
    '출연작',
    '방송',
    '소속사 입장',
  ],
  music: [
    '컴백 일정',
    '공식입장',
    '콘서트 예매',
    '팬미팅 일정',
    '앨범 발매일',
    '티저',
    '차트 순위',
  ],
  anime: [
    '방영일',
    '몇부작',
    'OTT 보는곳',
    '극장판 개봉일',
    '성우',
    '굿즈 예약',
  ],
  game: [
    '출시일',
    '업데이트',
    '쿠폰',
    '티어표',
    '공략',
    '이벤트',
    '리세마라',
    '초보 가이드',
  ],
  education: [
    '시험일정',
    '접수',
    '준비물',
    '기출 범위',
    '합격자 발표',
    '신청방법',
  ],
  finance: [
    '주가',
    '실적 발표',
    '배당금',
    '배당 기준일',
    '공모주 일정',
    '청약',
    '전망',
  ],
  business: [
    '지원금',
    '신청방법',
    '사업자등록',
    '세금',
    '서류',
    '마감',
  ],
  travel_domestic: [
    '축제 일정',
    '입장료',
    '예약',
    '주차',
    '숙소',
    '코스',
    '교통',
  ],
  travel_overseas: [
    '항공권',
    '일정',
    '준비물',
    '비자',
    '환전',
    '숙소',
    '예약',
  ],
  food: [
    '맛집',
    '메뉴',
    '예약',
    '가격',
    '영업시간',
    '주차',
    '위치',
  ],
  recipe: [
    '재료',
    '만드는법',
    '보관법',
    '칼로리',
    '간단 레시피',
  ],
  health: [
    '증상',
    '검사',
    '비용',
    '부작용',
    '복용법',
    '병원 예약',
    '주의사항',
  ],
  hospital: [
    '검사',
    '진료',
    '예약',
    '비용',
    '준비사항',
    '결과 해석',
  ],
  it: [
    '출시일',
    '사전예약',
    '업데이트',
    '설정',
    '오류 해결',
    '비교',
    '사용법',
  ],
  ai_tool: [
    '사용법',
    '가격',
    '무료',
    '비교',
    '프롬프트',
    '업데이트',
  ],
  smartphone: [
    '출시일',
    '사전예약',
    '가격',
    '업데이트',
    '설정',
    '오류 해결',
    '비교',
  ],
  fashion: [
    '장마 코디',
    '하객룩',
    '사이즈',
    '세탁법',
    '건조',
    '브랜드',
  ],
  beauty: [
    '성분',
    '올리브영',
    '민감성',
    '발색',
    '사용법',
    '비교',
  ],
};

const ISSUE_BASES_BY_CATEGORY_ID: Record<string, string[]> = {
  policy: [
    `${CURRENT_YEAR} 근로장려금`,
    `${CURRENT_YEAR} 자녀장려금`,
    `${CURRENT_YEAR} 에너지바우처`,
    `${CURRENT_YEAR} 청년도약계좌`,
    `${CURRENT_YEAR} 소상공인 지원금`,
    `${CURRENT_YEAR} 민생회복지원금`,
    `${CURRENT_YEAR} 기초연금`,
    `${CURRENT_YEAR} 실업급여`,
  ],
  sports: [
    `${CURRENT_YEAR} KBO 올스타전`,
    `${CURRENT_YEAR} 프로야구 올스타전`,
    `${CURRENT_YEAR} KBO 개막전`,
    `${CURRENT_YEAR} 월드컵 예선`,
    `${CURRENT_YEAR} 한국 일본 축구`,
    `${CURRENT_YEAR} 손흥민 경기`,
    `${CURRENT_YEAR} 토트넘 내한`,
  ],
  movie: [
    '중간계 영화',
    `${CURRENT_YEAR} 칸 영화제`,
    `${CURRENT_YEAR} 부산국제영화제`,
    `${CURRENT_YEAR} 마블 영화`,
    `${CURRENT_YEAR} 디즈니 영화`,
  ],
  drama: [
    `${CURRENT_YEAR} 넷플릭스 드라마`,
    `${CURRENT_YEAR} 티빙 드라마`,
    `${CURRENT_YEAR} 웨이브 드라마`,
    `${CURRENT_YEAR} 주말드라마`,
  ],
  broadcast: [
    `${CURRENT_YEAR} 미스터트롯`,
    `${CURRENT_YEAR} 불후의 명곡`,
    `${CURRENT_YEAR} 나는솔로`,
    `${CURRENT_YEAR} 유퀴즈`,
  ],
  celeb: [
    '강훈식',
    '송지호',
    `${CURRENT_YEAR} 아이돌 컴백`,
    `${CURRENT_YEAR} 배우 프로필`,
  ],
  music: [
    `${CURRENT_YEAR} 워터밤`,
    `${CURRENT_YEAR} 흠뻑쇼`,
    `${CURRENT_YEAR} 아이돌 콘서트`,
    `${CURRENT_YEAR} 멜론뮤직어워드`,
  ],
  anime: [
    `${CURRENT_YEAR} 극장판 애니`,
    `${CURRENT_YEAR} 귀멸의 칼날`,
    `${CURRENT_YEAR} 명탐정 코난 극장판`,
  ],
  education: [
    `${CURRENT_YEAR} 수능`,
    `${CURRENT_YEAR} 수능특강`,
    `${CURRENT_YEAR} 공인중개사`,
    `${CURRENT_YEAR} 한국사능력검정시험`,
    `${CURRENT_YEAR} 토익 접수`,
    `${CURRENT_YEAR} 국가장학금`,
  ],
  finance: [
    '삼성전자',
    '엔비디아',
    '테슬라',
    `${CURRENT_YEAR} 종합소득세`,
    `${CURRENT_YEAR} 연말정산`,
    `${CURRENT_YEAR} 청년도약계좌`,
  ],
  travel_domestic: [
    '송지호 바다하늘길',
    `${CURRENT_YEAR} 여름 축제`,
    `${CURRENT_YEAR} 제주 장마`,
    `${CURRENT_YEAR} 부산 불꽃축제`,
    `${CURRENT_YEAR} 한강 수영장`,
  ],
  game: [
    `${CURRENT_YEAR} 롤드컵`,
    `${CURRENT_YEAR} 메이플 쇼케이스`,
    `${CURRENT_YEAR} 로스트아크`,
  ],
};

const BULK_CROSS_CATEGORY_ISSUE_IDS = [
  'policy',
  'sports',
  'movie',
  'drama',
  'broadcast',
  'celeb',
  'music',
  'anime',
  'education',
  'finance',
  'travel_domestic',
  'game',
];

const GLOBAL_ISSUE_BASES = [
  '신입사원 강회장',
  '멋진 신세계',
  '참교육',
  '취사병 전설이 되다',
  '하트시그널5',
  '2026 흠뻑쇼',
  '2026 KBO 올스타전',
  '2026 제헌절 공휴일',
  '송지호 바다하늘길',
  `${currentLottoRound()}회 로또`,
  '중간계 영화',
  `${CURRENT_YEAR} 제헌절`,
  `${CURRENT_YEAR} 제헌절 공휴일`,
  `${CURRENT_YEAR} 광복절`,
  `${CURRENT_YEAR} 추석`,
  `${CURRENT_YEAR} 장마`,
  `${CURRENT_YEAR} 에너지바우처`,
  `${CURRENT_YEAR} KBO 올스타전`,
  '중간계 영화',
  '송지호 바다하늘길',
  '강훈식',
  '강훈식 프로필',
];

const GLOBAL_USER_APPROVED_ANCHORS = [
  '2026 제헌절 공휴일',
  '2026 광복절 대체공휴일',
  `${currentLottoRound()}회 로또 당첨번호`,
  `${currentLottoRound()}회 로또 당첨지역`,
  '2026 흠뻑쇼 일정',
  '2026 KBO 올스타전',
  '2026 KBO 올스타전 예매',
  '2026 KBO 올스타전 티켓팅 일정',
  '2026 프로야구 올스타전',
  '송지호 바다하늘길 주차',
  '송지호 바다하늘길 입장료',
  '멋진 신세계 몇부작',
  '멋진 신세계 등장인물',
  '멋진 신세계 출연진',
  '멋진 신세계 방송시간',
  '멋진 신세계 공식영상',
  '신입사원 강회장 몇부작',
  '신입사원 강회장 등장인물',
  '신입사원 강회장 출연진',
  '신입사원 강회장 방송시간',
  '신입사원 강회장 공식영상',
  '하트시그널5 몇부작',
  '하트시그널5 출연진',
  '하트시그널5 공식영상',
  '강훈식 프로필',
  '임우재 프로필',
  '정규리 프로필',
  '박우열 프로필',
  '한성숙 프로필',
  '젠슨 황 프로필',
  '유상철 프로필',
  '넬리 코다 프로필',
  '원태인 프로필',
  '원태인 연봉',
  '원태인 성적',
  '파트릭 클라위버르트 프로필',
  '삼성전자 주가',
  '삼성전자 전망',
  '삼성전자 실적 발표',
  '엔비디아 주가',
  '엔비디아 전망',
  '테슬라 주가',
  '환율 전망',
  '원달러 환율 전망',
  '온누리상품권 신청방법',
  '삼성전자 온누리상품권',
];

const BROAD_SHOPPING_COMPACT_RE = /^(봄|여름|가을|겨울|장마|최신|202\d)?(원피스|블라우스|티셔츠|샌들|가방|선크림|쿠션|립스틱|에어컨|제습기|청소기)(추천|코디|사이즈|사이즈비교|비교|후기|리뷰|가격|할인)$/;
const ENGLISH_ONLY_RE = /^[a-z0-9\s\-_.#/&+]+$/i;
const DIRECT_POLICY_SIGNAL_RE = /(?:\uC9C0\uC6D0\uAE08|\uBC14\uC6B0\uCC98|\uC7A5\uB824\uAE08|\uAE09\uC5EC|\uD658\uAE09|\uC138\uAE08|\uACF5\uC81C|\uCCAD\uB144|\uC18C\uC0C1\uACF5\uC778|\uB300\uCD9C|\uBCF5\uC9C0|\uC9C0\uC6D0|\uC815\uCC45)/u;
const DIRECT_FINANCE_SIGNAL_RE = /(?:\uC8FC\uC2DD|\uC8FC\uAC00|\uC2E4\uC801|\uBC30\uB2F9|\uCCAD\uC57D|\uAE08\uB9AC|\uB300\uCD9C|\uCF54\uC778|\uBE44\uD2B8\uCF54\uC778|\uD658\uC728)/u;
const DIRECT_EVENT_SIGNAL_RE = /(?:KBO|\uC62C\uC2A4\uD0C0|\uCD95\uC81C|\uACF5\uC5F0|\uCF58\uC11C\uD2B8|\uC804\uC2DC|\uD589\uC0AC|\uC5EC\uD589|\uAD00\uAD11|\uBC14\uB2E4|\uD558\uB298\uAE38|\uB80C\uD130\uCE74|\uC219\uC18C|\uD56D\uACF5|\uC5D1\uC2A4\uD3EC|\uD398\uC2A4\uD2F0\uBC8C)/iu;
const DIRECT_COMMERCE_SIGNAL_RE = /(?:\uCD94\uCC9C|\uAC00\uACA9|\uAD6C\uB9E4|\uC1FC\uD551|\uD560\uC778|\uCFE0\uD3F0|\uB9AC\uBDF0|\uD6C4\uAE30|\uBE44\uAD50|\uCD5C\uC800\uAC00|\uC81C\uD488|\uC0C1\uD488|\uAD6C\uB9E4\uCC98|\uC5D0\uC5B4\uCEE8|\uCCAD\uC18C\uAE30|\uB80C\uD0C8|\uBCF4\uD5D8|\uCE58\uB8CC|\uD544\uD130)/u;
const DIRECT_CONTENT_SIGNAL_RE = /(?:\uB4DC\uB77C\uB9C8|\uC601\uD654|\uBC29\uC1A1|\uC608\uB2A5|\uC624\uD2F0\uD2F0|OTT|\uC560\uB2C8|\uC6F9\uD230|\uC720\uD29C\uBE0C|\uC1FC\uCE20)/iu;
const DIRECT_CALCULATOR_SIGNAL_RE = /(?:\uACC4\uC0B0\uAE30|\uBCF4\uD5D8\uB8CC|\uC138\uAE08|\uAE09\uC5EC|\uD1F4\uC9C1\uAE08|\uC2DC\uAE09|\uC8FC\uD734\uC218\uB2F9|\uC5F0\uB9D0\uC815\uC0B0|\uBD80\uAC00\uC138|\uC2E4\uC218\uB839\uC561|\uD658\uAE09\uC77C|\uC18C\uB4DD\uC138)/u;
const DIRECT_POLICY_NEED_INTENTS = [
  '\uC2E0\uCCAD \uB300\uC0C1',
  '\uC2E0\uCCAD \uBC29\uBC95',
  '\uC790\uACA9 \uC870\uAC74',
  '\uC9C0\uAE09\uC77C \uC870\uD68C',
  '\uD544\uC694 \uC11C\uB958',
  '\uC0AC\uC6A9\uCC98',
  '\uB9C8\uAC10\uC77C',
  '\uACC4\uC0B0\uAE30',
];
const DIRECT_EVENT_NEED_INTENTS = [
  '\uC608\uB9E4 \uC77C\uC815',
  '\uC608\uB9E4 \uBC29\uBC95',
  '\uC8FC\uCC28 \uC785\uC7A5\uB8CC',
  '\uC6B4\uC601\uC2DC\uAC04',
  '\uC900\uBE44\uBB3C',
  '\uCF54\uC2A4',
  '\uC88C\uC11D\uBC30\uCE58\uB3C4',
  '\uD560\uC778',
];
const DIRECT_COMMERCE_NEED_INTENTS = [
  '\uAC00\uACA9\uBE44\uAD50',
  '\uCD5C\uC800\uAC00',
  '\uAD6C\uB9E4\uCC98',
  '\uD560\uC778 \uCFE0\uD3F0',
  '\uD6C4\uAE30',
  '\uCD94\uCC9C',
  '\uBE44\uC6A9',
  '\uBCF4\uD5D8 \uC801\uC6A9',
];
const DIRECT_FINANCE_NEED_INTENTS = [
  '\uC804\uB9DD',
  '\uBAA9\uD45C\uAC00',
  '\uC2E4\uC801 \uBC1C\uD45C',
  '\uBC30\uB2F9\uAE08',
  '\uCCAD\uC57D \uC77C\uC815',
  '\uC218\uC218\uB8CC',
];
const DIRECT_CONTENT_NEED_INTENTS = [
  '\uBC29\uC1A1\uC2DC\uAC04',
  '\uB2E4\uC2DC\uBCF4\uAE30',
  'OTT \uBCF4\uB294\uACF3',
  '\uACB0\uB9D0 \uD574\uC11D',
  '\uCFE0\uD0A4\uC601\uC0C1',
];
const DIRECT_CALCULATOR_NEED_INTENTS = [
  `${CURRENT_YEAR}`,
  '\uD504\uB9AC\uB79C\uC11C',
  '\uC54C\uBC14',
  '\uC77C\uC6A9\uC9C1',
  '\uAC1C\uC778\uC0AC\uC5C5\uC790',
  '\uC2E4\uC218\uB839\uC561',
  '\uC790\uB3D9\uACC4\uC0B0',
  '\uACC4\uC0B0\uBC29\uBC95',
  '\uC694\uC728',
  '\uACF5\uC81C\uD56D\uBAA9',
];
const DIRECT_POLICY_COMPOUND_NEED_INTENTS = [
  '\uC2E0\uCCAD \uB300\uC0C1',
  '\uC2E0\uCCAD \uBC29\uBC95',
  '\uC790\uACA9 \uC870\uAC74',
  '\uC9C0\uAE09\uC77C \uC870\uD68C',
  '\uD544\uC694 \uC11C\uB958',
  '\uC0AC\uC6A9\uCC98 \uCD94\uCC9C',
  '\uB9C8\uAC10\uC77C \uD655\uC778',
  '\uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
];
const DIRECT_CALCULATOR_COMPOUND_NEED_INTENTS = [
  '\uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
  '\uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0',
  '\uC77C\uC6A9\uC9C1 \uACC4\uC0B0\uBC29\uBC95',
  '\uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9',
  '\uC694\uC728\uD45C',
  '\uC138\uAE08 \uACF5\uC81C',
];
const DIRECT_EVENT_COMPOUND_NEED_INTENTS = [
  '\uC608\uB9E4 \uC77C\uC815',
  '\uD2F0\uCF13\uD305 \uBC29\uBC95',
  '\uC8FC\uCC28 \uC785\uC7A5\uB8CC',
  '\uC6B4\uC601\uC2DC\uAC04 \uC608\uC57D',
  '\uC88C\uC11D\uBC30\uCE58\uB3C4',
  '\uC900\uBE44\uBB3C',
  '\uD560\uC778 \uBC29\uBC95',
];
const DIRECT_COMMERCE_COMPOUND_NEED_INTENTS = [
  '\uCD5C\uC800\uAC00 \uAD6C\uB9E4\uCC98',
  '\uD560\uC778 \uCFE0\uD3F0',
  '\uAC00\uACA9\uBE44\uAD50 \uD6C4\uAE30',
  '\uCD94\uCC9C \uD6C4\uAE30',
  '\uBE44\uC6A9 \uBE44\uAD50',
  '\uB80C\uD0C8 \uAC00\uACA9\uBE44\uAD50',
  '\uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9',
];
const DIRECT_FINANCE_COMPOUND_NEED_INTENTS = [
  '\uCCAD\uC57D \uC77C\uC815',
  '\uC2E4\uC801 \uBC1C\uD45C\uC77C',
  '\uBC30\uB2F9\uAE08 \uAE30\uC900\uC77C',
  '\uC218\uC218\uB8CC \uBE44\uAD50',
  '\uC804\uB9DD \uB9AC\uC2A4\uD06C',
];
const DIRECT_CONTENT_COMPOUND_NEED_INTENTS = [
  'OTT \uBCF4\uB294\uACF3',
  '\uBC29\uC1A1\uC2DC\uAC04 \uB2E4\uC2DC\uBCF4\uAE30',
  '\uC778\uBB3C\uAD00\uACC4\uB3C4 \uC815\uB9AC',
  '\uACB0\uB9D0 \uD574\uC11D',
];
const LIVE_ENTITY_STOPWORDS = new Set([
  '실시간',
  '검색어',
  '뉴스',
  '속보',
  '단독',
  '오늘',
  '이번주',
  '다시',
  '만난다',
  '씁쓸한',
  '통쾌함',
  '참교육의',
  '당상',
  '탈출',
  '진상규명',
  '부정선거',
  '포르투갈',
]);
const NON_PERSON_ENTITY_RE = /(로또|복권|하트시그널|나는솔로|환승연애|솔로지옥|미스터트롯|KBO|프로야구|월드컵|축구|야구|올스타전|개막전)/i;

function unique(values: string[], max = Number.POSITIVE_INFINITY, preserveSpacingVariants = false): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeCandidate(raw);
    if (!value) continue;
    const key = preserveSpacingVariants
      ? value.toLowerCase().replace(/\s+/g, ' ')
      : compactGoldenKeyword(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function spreadCandidates(values: string[], max: number, headCount = 120): string[] {
  const clean = unique(values);
  const target = Math.max(1, Math.min(clean.length, Math.floor(max)));
  if (clean.length <= target) return clean;

  const head = clean.slice(0, Math.min(headCount, target));
  const out = [...head];
  const seen = new Set(out.map(compactGoldenKeyword));
  const remainingTarget = target - out.length;
  for (let i = 0; i < remainingTarget; i++) {
    const idx = Math.min(clean.length - 1, Math.floor((i + 1) * clean.length / (remainingTarget + 1)));
    const candidate = clean[idx];
    const key = compactGoldenKeyword(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  for (const candidate of clean) {
    if (out.length >= target) break;
    const key = compactGoldenKeyword(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

export function resolveDirectGoldenBulkSssTarget(limit: number): number {
  const requested = Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT));
  if (requested <= DEFAULT_LIMIT) return requested;
  return Math.min(requested, Math.max(DEFAULT_LIMIT, Math.ceil(requested * DIRECT_BULK_SSS_RATIO)));
}

export function shouldContinueDirectGoldenSssHunt(
  ranked: MDPResult[],
  limit: number,
  measuredCandidateCount: number,
  maxCandidateCount: number,
): boolean {
  const requested = Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT));
  if (requested <= DEFAULT_LIMIT) return false;
  if (measuredCandidateCount >= maxCandidateCount) return false;
  return countSss(ranked) < resolveDirectGoldenBulkSssTarget(requested);
}

function directNeedIntentsForSeed(seed: string, categoryIds: string[]): string[] {
  const clean = normalizeCandidate(seed);
  const categoryText = categoryIds.join(' ');
  const intents: string[] = [];
  intents.push(...getSeedSpecificIntents(clean).slice(0, 12));

  if (DIRECT_CALCULATOR_SIGNAL_RE.test(clean)) {
    intents.push(...DIRECT_CALCULATOR_NEED_INTENTS);
  }
  if (DIRECT_POLICY_SIGNAL_RE.test(clean) || /policy|education|life_tips/.test(categoryText)) {
    intents.push(...DIRECT_POLICY_NEED_INTENTS);
  }
  if (DIRECT_FINANCE_SIGNAL_RE.test(clean) || /finance/.test(categoryText)) {
    intents.push(...DIRECT_FINANCE_NEED_INTENTS);
  }
  if (DIRECT_EVENT_SIGNAL_RE.test(clean) || /sports|travel|event/.test(categoryText)) {
    intents.push(...DIRECT_EVENT_NEED_INTENTS);
  }
  if (DIRECT_COMMERCE_SIGNAL_RE.test(clean) || /shopping|commerce|beauty|fashion|food|health|home|it/.test(categoryText)) {
    intents.push(...DIRECT_COMMERCE_NEED_INTENTS);
  }
  if (DIRECT_CONTENT_SIGNAL_RE.test(clean) || /drama|movie|broadcast|music|youtube|anime/.test(categoryText)) {
    intents.push(...DIRECT_CONTENT_NEED_INTENTS);
  }

  return unique(intents, 24);
}

function buildWriterReadyNeedCandidates(seed: string, categoryIds: string[], limit = 24): string[] {
  const clean = normalizeCandidate(seed);
  if (!clean) return [];
  const out: string[] = [];
  for (const intent of directNeedIntentsForSeed(clean, categoryIds)) {
    const normalizedIntent = normalizeCandidate(intent);
    if (!normalizedIntent || clean.includes(normalizedIntent)) continue;
    const spacedCandidate = `${clean} ${normalizedIntent}`;
    out.push(spacedCandidate);
    const compactIntent = normalizedIntent.replace(/\s+/g, '');
    const compactCandidate = `${clean}${compactIntent}`;
    if (compactIntent && compactCandidate !== spacedCandidate && !clean.includes(compactIntent)) {
      out.push(compactCandidate);
    }
  }
  return unique(out.filter(isUsableCandidate), limit, true);
}

function compoundNeedIntentsForSeed(seed: string, categoryIds: string[]): string[] {
  const clean = normalizeCandidate(seed);
  if (!clean) return [];
  const categoryText = categoryIds.join(' ');
  const intents: string[] = [];
  if (DIRECT_CALCULATOR_SIGNAL_RE.test(clean)) {
    intents.push(...DIRECT_CALCULATOR_COMPOUND_NEED_INTENTS);
  }
  if (DIRECT_POLICY_SIGNAL_RE.test(clean) || /policy|education|life_tips/.test(categoryText)) {
    intents.push(...DIRECT_POLICY_COMPOUND_NEED_INTENTS);
  }
  if (DIRECT_FINANCE_SIGNAL_RE.test(clean) || /finance/.test(categoryText)) {
    intents.push(...DIRECT_FINANCE_COMPOUND_NEED_INTENTS);
  }
  if (DIRECT_EVENT_SIGNAL_RE.test(clean) || /sports|travel|event/.test(categoryText)) {
    intents.push(...DIRECT_EVENT_COMPOUND_NEED_INTENTS);
  }
  if (DIRECT_COMMERCE_SIGNAL_RE.test(clean) || /shopping|commerce|beauty|fashion|food|health|home|it/.test(categoryText)) {
    intents.push(...DIRECT_COMMERCE_COMPOUND_NEED_INTENTS);
  }
  if (DIRECT_CONTENT_SIGNAL_RE.test(clean) || /drama|movie|broadcast|music|youtube|anime/.test(categoryText)) {
    intents.push(...DIRECT_CONTENT_COMPOUND_NEED_INTENTS);
  }
  return unique(intents, 28);
}

function buildWriterReadyCompoundNeedCandidates(seed: string, categoryIds: string[], limit = 36): string[] {
  const clean = normalizeCandidate(seed);
  if (!clean) return [];
  const out: string[] = [];
  for (const intent of compoundNeedIntentsForSeed(clean, categoryIds)) {
    const normalizedIntent = normalizeCandidate(intent);
    if (!normalizedIntent) continue;
    const compactIntent = normalizedIntent.replace(/\s+/g, '');
    if (clean.includes(normalizedIntent) || (compactIntent && clean.includes(compactIntent))) continue;
    const spacedCandidate = `${clean} ${normalizedIntent}`;
    out.push(spacedCandidate);
    if (compactIntent) {
      const compactCandidate = `${clean}${compactIntent}`;
      if (compactCandidate !== spacedCandidate) out.push(compactCandidate);
    }
  }
  return unique(out.filter(isUsableCandidate), limit, true);
}

function normalizeCandidate(raw: unknown): string {
  let value = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[“”"「」『』]/g, ' ')
    .replace(/\[[^\]]{1,24}\]/g, ' ')
    .replace(/\([^)]{1,30}\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length > 42) {
    const clipped = value.slice(0, 42);
    value = clipped.replace(/\s+\S*$/, '').trim() || clipped.trim();
  }
  return value;
}

const NON_PRODUCT_COMMERCE_TAIL_RE = /(?:가격비교|최저가|구매처|할인\s*쿠폰|할인|쿠폰|렌탈|렌트|보험\s*적용\s*비용|비용\s*비교|추천\s*후기|실사용\s*후기)/u;
const NON_PRODUCT_COMMERCE_BASE_RE = /(?:로또|당첨번호|당첨지역|공휴일|대체공휴일|제헌절|광복절|개천절|한글날|추석|설날|근로자의날|지원금|장려금|수당|급여|환급일|정책|KBO|프로야구|올스타전|월드컵|FIFA|입장료|주차|운영시간|티켓팅|예매|좌석배치도|라인업|하이라이트|경기일정|몇부작|등장인물|줄거리|원작|OTT|나무위키|송지호|바다하늘길|축제|공연|콘서트|전시|행사|관광|여행|공원|수목원|박람회|엑스포|페스티벌)/iu;

function isInvalidNonProductCommerceCandidate(raw: string): boolean {
  const value = normalizeCandidate(raw);
  return Boolean(value)
    && NON_PRODUCT_COMMERCE_TAIL_RE.test(value)
    && NON_PRODUCT_COMMERCE_BASE_RE.test(value);
}

function isUsableCandidate(raw: string): boolean {
  const value = normalizeCandidate(raw);
  if (!value || value.length < 3 || value.length > 42) return false;
  if (isInvalidNonProductCommerceCandidate(value)) return false;
  if (!/[가-힣]/.test(value)) return false;
  if (ENGLISH_ONLY_RE.test(value)) return false;
  if (/https?:|www\.|\.com|\.net|\.co\.kr/i.test(value)) return false;
  if (/[!'""''“”‘’]/.test(value)) return false;
  if (/[,，:：;]/.test(value) && value.split(/\s+/).length >= 3) return false;
  if (/[·…・]|[,，]/.test(value) && value.length > 16) return false;
  if (value.split(/\s+/).length > 6 && !/(로또|복권|모의고사|올스타전|신입사원 강회장|멋진 신세계)/.test(value)) return false;
  if (/^[\d\s.,/_-]+$/.test(value)) return false;
  const compact = value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (BROAD_SHOPPING_COMPACT_RE.test(compact)) return false;
  if (VOLATILE_EXAM_ANSWER_RE.test(value)) return false;
  return true;
}

function getKoreanDateHints(): string[] {
  return unique([
    `${CURRENT_YEAR}`,
    `${NEXT_YEAR}`,
    `${CURRENT_MONTH}월`,
    `${CURRENT_YEAR} ${CURRENT_MONTH}월`,
  ]);
}

function getDirectIntents(categoryIds: string[]): string[] {
  const intents: string[] = [];
  for (const id of categoryIds) {
    intents.push(...(CATEGORY_DIRECT_INTENTS[id] || []));
  }
  return unique([...intents, ...COMMON_DIRECT_INTENTS], 24);
}

function getSeedSpecificIntents(seed: string): string[] {
  const compact = seed.replace(/\s+/g, '');
  const intents: string[] = [];

  if (/(월드컵|KBO|프로야구|올스타전|개막전|축구|야구|토트넘|손흥민)/.test(compact)) {
    intents.push('중계', '예매', '티켓팅 일정', '라인업', '경기일정', '하이라이트');
  }
  if (/(지원금|장려금|바우처|청년도약계좌|기초연금|실업급여|정책|공휴일|광복절|추석|제헌절|소상공인|민생회복)/.test(compact)) {
    intents.push('신청방법', '대상', '자격', '지급일', '신청기간', '조회', '필요서류');
  }
  if (/(삼성전자|삼성 전자|삼성|엔비디아|테슬라|환율|외환위기|원달러|온누리상품권|온누리|코스피|코스닥|비트코인|이더리움|주식|금리)/.test(seed)) {
    intents.push('주가', '전망', '실적 발표', '목표가', '배당금', '환율 전망', '신청방법');
  }
  if (/(드라마|영화|방송|예능|하트시그널|신입사원강회장|신입사원|멋진신세계|참교육|미스터트롯|나는솔로|유퀴즈)/.test(compact)) {
    intents.push('몇부작', '출연진', '공식영상', '원작', '인물관계도', '등장인물', '방송시간', '다시보기');
  }
  if (/(로또|복권)/.test(compact)) {
    intents.push('당첨번호', '당첨지역', '실수령액', '판매점', '추첨시간');
  }
  if (/(축제|여행|바다하늘길|수영장|해수욕장|공연|전시)/.test(compact)) {
    intents.push('주차', '입장료', '예약', '코스', '위치', '운영시간');
  }

  if (/(6모|9모|모의고사|수능|시험|고사|학력평가)/.test(compact)) {
    intents.push('발표 일정', '시험일정', '접수 일정', '준비물', '기출 범위');
  }
  if (/(제헌절|광복절|추석|설날|한글날|개천절|어린이날|현충일|성탄절|크리스마스|석가탄신일|부처님오신날)/.test(compact)) {
    intents.push('공휴일', '대체공휴일', '쉬는날', '연휴 일정');
  }
  if (/^[가-힣]{2,4}$/.test(compact)) {
    intents.push('프로필', '나이', '근황', '공식입장', '인스타');
  }
  if (/(영화|드라마|예능|방송|넷플릭스|티빙|웨이브|디즈니)/.test(compact)) {
    intents.push('출연진', '방송시간', '몇부작', '결말 해석', 'OTT 보는곳', '개봉일', '쿠키영상');
  }
  if (/(하트시그널|나는솔로|환승연애|솔로지옥|미스터트롯|신입사원|참교육|멋진신세계)/.test(compact)) {
    intents.push('몇부작', '출연진', '공식영상', '원작', '인물관계도', '등장인물', '방송시간', '다시보기');
  }
  if (/(바다하늘길|축제|여행|수영장|해수욕장|관광|전시|공연)/.test(compact)) {
    intents.push('주차', '입장료', '예약', '코스', '위치', '운영시간');
  }
  if (/(지원금|장려금|바우처|계좌|급여|연금|복지|정책)/.test(compact)) {
    intents.push('신청방법', '대상', '자격', '지급일', '신청기간', '조회', '필요서류');
  }
  if (/(KBO|프로야구|월드컵|축구|야구|올스타전|개막전|토트넘|손흥민)/i.test(compact)) {
    intents.push('중계', '예매', '티켓팅 일정', '라인업', '경기일정', '하이라이트');
  }
  if (/(로또|복권)/.test(compact)) {
    intents.push('당첨번호', '당첨지역', '실수령액', '판매점', '추첨시간');
  }

  return unique(intents, 18);
}

function getEntityIntentCandidates(entity: string): string[] {
  const specific = getSeedSpecificIntents(entity);
  if (specific.length > 0) return specific;
  if (/(삼성전자|삼성|엔비디아|테슬라|환율|원달러|온누리상품권|온누리|코스피|코스닥|비트코인|이더리움|주식|금리)/.test(entity)) {
    return ['주가', '전망', '실적 발표', '목표가', '배당금', '신청방법'];
  }
  const compact = entity.replace(/\s+/g, '');
  if (/^[가-힣]{2,6}$/.test(compact) && !NON_PERSON_ENTITY_RE.test(compact)) {
    return ['프로필', '나이', '근황', '공식입장', '인스타'];
  }
  return ['근황', '일정', '공식입장'];
}

function extractLiveEntitySeeds(seed: string): string[] {
  const normalized = normalizeCandidate(seed);
  if (!normalized) return [];
  const out: string[] = [];
  const tokenMatches = normalized.match(/[가-힣A-Za-z0-9]{2,12}/g) || [];
  for (const token of tokenMatches) {
    if (!/[가-힣]/.test(token)) continue;
    if (LIVE_ENTITY_STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (token.length < 2 || token.length > 8) continue;
    out.push(token);
  }

  const phraseMatches = normalized.match(/[가-힣A-Za-z0-9]{2,12}\s+[가-힣A-Za-z0-9]{2,12}/g) || [];
  for (const phrase of phraseMatches) {
    const compact = phrase.replace(/\s+/g, '');
    if (!/[가-힣]/.test(compact)) continue;
    if (compact.length < 4 || compact.length > 14) continue;
    out.push(phrase);
  }

  return unique(out, 8);
}

function getIssueBases(categoryIds: string[], includeCrossCategory: boolean): string[] {
  const bases: string[] = [];
  if (includeCrossCategory || categoryIds.length === 0) {
    bases.push(...GLOBAL_USER_APPROVED_ANCHORS);
    bases.push(...GLOBAL_ISSUE_BASES);
  }
  const sourceIds = categoryIds.length > 0
    ? categoryIds
    : includeCrossCategory
      ? BULK_CROSS_CATEGORY_ISSUE_IDS
      : [];
  for (const id of sourceIds) {
    bases.push(...(ISSUE_BASES_BY_CATEGORY_ID[id] || []));
  }
  return unique(bases, includeCrossCategory ? 360 : 80);
}

function readSearchAdConfigFromEnv(): NaverSearchAdConfig | null {
  try {
    const { EnvironmentManager } = require('./environment-manager');
    const env = EnvironmentManager.getInstance().getConfig();
    const accessLicense = env.naverSearchAdAccessLicense || process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] || '';
    const secretKey = env.naverSearchAdSecretKey || process.env['NAVER_SEARCHAD_SECRET_KEY'] || '';
    const customerId = env.naverSearchAdCustomerId || process.env['NAVER_SEARCHAD_CUSTOMER_ID'] || '';
    if (!accessLicense || !secretKey) return null;
    return {
      accessLicense,
      secretKey,
      customerId: customerId || undefined,
    };
  } catch {
    return null;
  }
}

function expandSeed(seed: string, intents: string[], dateHints: string[]): string[] {
  const out: string[] = [seed];
  const clean = normalizeCandidate(seed);
  if (!clean) return out;
  const combinedIntents = unique([...getSeedSpecificIntents(clean), ...intents], 30);
  const entitySeeds = extractLiveEntitySeeds(clean);

  for (const entity of entitySeeds) {
    out.push(entity);
    const entityIntents = unique(getEntityIntentCandidates(entity), 10);
    for (const intent of entityIntents.slice(0, 6)) {
      if (!entity.includes(intent)) out.push(`${entity} ${intent}`);
    }
  }

  for (const intent of combinedIntents.slice(0, 22)) {
    if (!clean.includes(intent)) out.push(`${clean} ${intent}`);
  }

  for (const hint of dateHints) {
    if (!clean.includes(hint)) {
      out.push(`${hint} ${clean}`);
      out.push(`${clean} ${hint}`);
    }
  }

  for (const pattern of generateQueryPatterns(splitKeywordSemantically(clean), combinedIntents.slice(0, 10)).slice(0, 48)) {
    out.push(pattern);
  }

  return out;
}

function buildBulkAnchorCandidates(plan: DirectGoldenKeywordCandidatePlan, options: DirectGoldenKeywordMinerOptions): string[] {
  const intents = getDirectIntents(plan.categoryIds);
  const dateHints = getKoreanDateHints();
  const sourceBases = unique([
    ...getIssueBases(plan.categoryIds, options.includeCrossCategory === true),
    ...(options.liveSeeds || []).slice(0, 24),
  ], 420);
  const out: string[] = [];

  for (const seed of sourceBases) {
    const clean = normalizeCandidate(seed);
    if (!clean) continue;
    out.push(clean);

    for (const intent of getSeedSpecificIntents(clean).slice(0, 12)) {
      if (!clean.includes(intent)) out.push(`${clean} ${intent}`);
    }
    out.push(...buildWriterReadyNeedCandidates(clean, plan.categoryIds, 20));
    out.push(...buildWriterReadyCompoundNeedCandidates(clean, plan.categoryIds, 28));

    for (const entity of extractLiveEntitySeeds(clean).slice(0, 4)) {
      out.push(entity);
      for (const intent of getEntityIntentCandidates(entity).slice(0, 8)) {
        if (!entity.includes(intent)) out.push(`${entity} ${intent}`);
      }
      out.push(...buildWriterReadyNeedCandidates(entity, plan.categoryIds, 10));
      out.push(...buildWriterReadyCompoundNeedCandidates(entity, plan.categoryIds, 16));
    }

    for (const expanded of expandSeed(clean, intents, dateHints).slice(0, 12)) {
      out.push(expanded);
    }
  }

  return unique(out.filter(isUsableCandidate), 1600);
}

function selectSuggestionSeeds(plan: DirectGoldenKeywordCandidatePlan, options: DirectGoldenKeywordMinerOptions): string[] {
  const bulkMode = (options.limit || DEFAULT_LIMIT) > 30;
  const defaultLimit = bulkMode ? 48 : 20;
  const limit = Math.max(0, Math.min(120, Math.floor(options.suggestionSeedLimit || defaultLimit)));
  const preferred = plan.seeds.filter(seed => {
    const compact = seed.replace(/\s+/g, '');
    return /6모|모의고사|제헌절|광복절|KBO|올스타전|프로야구|지원금|장려금|바우처|프로필|영화|드라마|방송|콘서트|축제|공휴일/i.test(compact)
      || getSeedSpecificIntents(seed).length > 0;
  });
  return unique([...preferred, ...plan.seeds], limit);
}

async function buildSearchAdSuggestionCandidates(
  plan: DirectGoldenKeywordCandidatePlan,
  options: DirectGoldenKeywordMinerOptions,
): Promise<string[]> {
  if (options.includeSearchAdSuggestions === false) return [];
  const searchAdConfig = readSearchAdConfigFromEnv();
  if (!searchAdConfig) return [];

  const { getNaverSearchAdKeywordSuggestions } = await import('./naver-searchad-api');
  const intents = getDirectIntents(plan.categoryIds);
  const dateHints = getKoreanDateHints();
  const seeds = selectSuggestionSeeds(plan, options);
  const bulkMode = (options.limit || DEFAULT_LIMIT) > 30;
  const perSeed = Math.max(5, Math.min(100, Math.floor(options.suggestionsPerSeed || (bulkMode ? 40 : 30))));
  const out: string[] = [];

  for (const seed of seeds) {
    try {
      const suggestions = await getNaverSearchAdKeywordSuggestions(searchAdConfig, seed, perSeed);
      for (const suggestion of suggestions) {
        const keyword = normalizeCandidate(suggestion.keyword);
        if (!isUsableCandidate(keyword)) continue;
        out.push(keyword);
        out.push(...buildWriterReadyNeedCandidates(keyword, plan.categoryIds, 12));
        out.push(...buildWriterReadyCompoundNeedCandidates(keyword, plan.categoryIds, 18));
        for (const expanded of expandSeed(keyword, intents, dateHints).slice(0, 18)) {
          out.push(expanded);
        }
      }
    } catch {
      // Suggestion expansion is a recall booster only.
    }
  }

  return unique(out, Math.max(120, seeds.length * perSeed * (bulkMode ? 8 : 6)));
}

async function buildRankedSupplementCandidates(
  ranked: MDPResult[],
  plan: DirectGoldenKeywordCandidatePlan,
  options: DirectGoldenKeywordMinerOptions,
  exclude: Set<string>,
  maxCandidates: number,
): Promise<string[]> {
  if (maxCandidates <= 0 || ranked.length === 0) return [];

  const intents = getDirectIntents(plan.categoryIds);
  const dateHints = getKoreanDateHints();
  const seeds = unique(ranked.map(item => item.keyword), 36);
  const out: string[] = [];

  for (const seed of seeds) {
    out.push(seed);
    out.push(...buildWriterReadyNeedCandidates(seed, plan.categoryIds, 18));
    out.push(...buildWriterReadyCompoundNeedCandidates(seed, plan.categoryIds, 24));
    for (const expanded of expandSeed(seed, intents, dateHints).slice(0, 18)) {
      out.push(expanded);
    }
    for (const intent of getSeedSpecificIntents(seed).slice(0, 12)) {
      if (!seed.includes(intent)) out.push(`${seed} ${intent}`);
    }
  }

  const searchAdConfig = readSearchAdConfigFromEnv();
  if (searchAdConfig) {
    const { getNaverSearchAdKeywordSuggestions } = await import('./naver-searchad-api');
    for (const seed of seeds.slice(0, 28)) {
      try {
        const suggestions = await getNaverSearchAdKeywordSuggestions(searchAdConfig, seed, 36);
        for (const suggestion of suggestions) {
          const keyword = normalizeCandidate(suggestion.keyword);
          if (!isUsableCandidate(keyword)) continue;
          out.push(keyword);
          out.push(...buildWriterReadyNeedCandidates(keyword, plan.categoryIds, 12));
          out.push(...buildWriterReadyCompoundNeedCandidates(keyword, plan.categoryIds, 16));
          for (const expanded of expandSeed(keyword, intents, dateHints).slice(0, 10)) {
            out.push(expanded);
          }
        }
      } catch {
        // Result-seeded suggestions are a supplement only.
      }
    }
  }

  return unique(
    out.filter(candidate => isUsableCandidate(candidate) && !exclude.has(compactGoldenKeyword(candidate))),
    maxCandidates,
  );
}

function calculateMetricScore(volume: number, docs: number, ratio: number, actionable: boolean): number {
  const ratioScore = Math.min(100, ratio >= 20 ? 100 :
    ratio >= 10 ? 90 + (ratio - 10) :
    ratio >= 5 ? 80 + (ratio - 5) * 2 :
    ratio >= 3 ? 68 + (ratio - 3) * 6 :
    ratio >= 2 ? 58 + (ratio - 2) * 10 :
    ratio * 28);
  const volumeScore = Math.min(100, volume >= 50000 ? 100 :
    volume >= 10000 ? 85 + (volume - 10000) * 0.000375 :
    volume >= 5000 ? 72 + (volume - 5000) * 0.0026 :
    volume >= 1000 ? 50 + (volume - 1000) * 0.0055 :
    volume >= 300 ? 26 + (volume - 300) * 0.034 :
    volume * 0.08);
  const docScore = docs <= 0 ? 0 :
    docs <= 100 ? 100 :
    docs <= 500 ? 96 :
    docs <= 1000 ? 92 :
    docs <= 3000 ? 88 :
    docs <= 5000 ? 85 :
    docs <= 10000 ? 76 :
    docs <= 30000 ? 55 :
    30;
  const intentScore = actionable ? 100 : 0;
  const score = Math.round(ratioScore * 0.45 + volumeScore * 0.2 + docScore * 0.2 + intentScore * 0.15);
  const measuredSssGate = volume >= 1000 && docs > 0 && docs <= 5000 && ratio >= 5;
  return measuredSssGate ? Math.max(85, score) : score;
}

function gradeFromMetrics(score: number, volume: number, docs: number, ratio: number): GoldenGrade {
  if (score >= 85 && volume >= 1000 && docs > 0 && docs <= 5000 && ratio >= 5) return 'SSS';
  if (score >= 75 && volume >= 500 && docs > 0 && docs <= 10000 && ratio >= 3) return 'SS';
  if (score >= 65 && volume >= 300 && docs > 0 && ratio >= 2) return 'S';
  if (score >= 55 && volume >= 100) return 'A';
  if (score >= 45) return 'B';
  if (score >= 30) return 'C';
  return 'D';
}

function mapMeasuredRowToMdpResult(row: MeasuredKeywordRow, category: string, categoryIds: string[]): MDPResult | null {
  const keyword = normalizeCandidate(row.keyword);
  if (!isUsableCandidate(keyword)) return null;
  const volume = (row.pcSearchVolume || 0) + (row.mobileSearchVolume || 0);
  const docs = row.documentCount || 0;
  if (volume < MIN_VOLUME || docs <= 0) return null;
  const ratio = volume / docs;
  const actionable = isActionableGoldenKeyword(keyword);
  const score = calculateMetricScore(volume, docs, ratio, actionable);
  const grade = gradeFromMetrics(score, volume, docs, ratio);
  const intentInfo = classifyKeywordIntent(keyword);
  const detectedCategory = classifyKeyword(keyword).primary || 'default';
  const cpc = row.monthlyAveCpc && row.monthlyAveCpc > 0
    ? Math.round(row.monthlyAveCpc)
    : estimateCPC(keyword, detectedCategory);
  const purchaseIntent = calculatePurchaseIntent(keyword, detectedCategory);
  const competitionLevel = calculateCompetitionLevel(docs, volume);
  const categoryMatched = categoryIds.length === 0 || !category || matchesDiscoveryCategory(keyword, category);
  const competitionScore = Math.max(0, Math.min(100, 100 - competitionLevel * 10));
  const ctr = Math.max(0.05, 0.3 - (competitionLevel * 0.025));
  const dailyVisitors = Math.round((volume / 30) * ctr);

  return {
    keyword,
    intent: intentInfo.intent,
    intentBadge: intentInfo.badge,
    searchVolume: volume,
    documentCount: docs,
    goldenRatio: Number(ratio.toFixed(2)),
    score,
    hasSmartBlock: false,
    hasViewSection: true,
    hasInfluencer: false,
    difficultyScore: competitionLevel,
    cvi: Number((((0.5 + (purchaseIntent / 100) * 1.5) * (cpc / 500))).toFixed(2)),
    cpc,
    grade,
    goldenReason: `직접 측정: 검색량 ${volume.toLocaleString()} / 문서수 ${docs.toLocaleString()} / 비율 ${ratio.toFixed(1)}`,
    estimatedMonthlyRevenue: Math.round(dailyVisitors * 0.03 * cpc * 30),
    purchaseIntentScore: purchaseIntent,
    competitionLevel,
    isBlueOcean: volume >= 300 && volume <= 10000 && docs <= 2000 && ratio >= 5 && cpc >= 150 && competitionLevel <= 4,
    communityBuzzScore: 0,
    snsLeadingScore: 0,
    externalSources: ['direct-measured-golden-miner'],
    measurementOnly: false,
    categoryMatched,
  };
}

function mapProTrafficKeywordToMdpResult(item: any): MDPResult | null {
  const keyword = normalizeCandidate(item?.keyword);
  if (!keyword || !isUsableCandidate(keyword)) return null;
  const volume = Number(item?.searchVolume || 0);
  const docs = Number(item?.documentCount || 0);
  const ratio = Number(item?.goldenRatio || (docs > 0 ? volume / docs : 0));
  if (!Number.isFinite(volume) || !Number.isFinite(docs) || !Number.isFinite(ratio)) return null;
  if (volume <= 0 || docs <= 0 || ratio <= 0) return null;
  const grade = String(item?.grade || '').toUpperCase() as GoldenGrade;
  const detectedCategory = classifyKeyword(keyword).primary || 'default';
  const cpc = Number(item?.profitAnalysis?.estimatedCPC || item?.revenueEstimate?.estimatedCPC || estimateCPC(keyword, detectedCategory));
  const purchaseIntent = Number(item?.profitAnalysis?.purchaseIntentScore || calculatePurchaseIntent(keyword, detectedCategory));
  const competitionLevel = Number(item?.profitAnalysis?.competitionLevel || calculateCompetitionLevel(docs, volume));
  const score = Number(item?.totalScore || calculateMetricScore(volume, docs, ratio, isActionableGoldenKeyword(keyword)));
  const result: MDPResult = {
    keyword,
    intent: classifyKeywordIntent(keyword).intent,
    intentBadge: classifyKeywordIntent(keyword).badge,
    searchVolume: volume,
    documentCount: docs,
    goldenRatio: Number(ratio.toFixed(2)),
    score,
    hasSmartBlock: item?.hasSmartBlock === true,
    hasViewSection: true,
    hasInfluencer: item?.hasInfluencer === true,
    difficultyScore: Number.isFinite(competitionLevel) ? competitionLevel : calculateCompetitionLevel(docs, volume),
    cvi: Number(item?.cvi || 0),
    cpc: Number.isFinite(cpc) ? Math.round(cpc) : estimateCPC(keyword, detectedCategory),
    grade: ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'].includes(grade) ? grade : gradeFromMetrics(score, volume, docs, ratio),
    goldenReason: `PRO 보강 검증: 검색량 ${volume.toLocaleString()} / 문서수 ${docs.toLocaleString()} / 비율 ${ratio.toFixed(1)}`,
    estimatedMonthlyRevenue: Number(item?.profitAnalysis?.estimatedMonthlyRevenue || 0),
    purchaseIntentScore: Number.isFinite(purchaseIntent) ? purchaseIntent : calculatePurchaseIntent(keyword, detectedCategory),
    competitionLevel: Number.isFinite(competitionLevel) ? competitionLevel : calculateCompetitionLevel(docs, volume),
    isBlueOcean: item?.blueOcean?.isNiche === true || item?.profitAnalysis?.isRealBlueOcean === true,
    communityBuzzScore: 0,
    snsLeadingScore: 0,
    externalSources: ['pro-traffic-supplement'],
    measurementOnly: false,
    categoryMatched: true,
  };
  return isQualityGoldenDiscoveryResult(result, { requireActionableIntent: true }) ? result : null;
}

export function buildDirectGoldenKeywordCandidatePlan(options: DirectGoldenKeywordMinerOptions = {}): DirectGoldenKeywordCandidatePlan {
  const category = String(options.category || '').trim();
  const keyword = String(options.keyword || '').replace(/\s+/g, ' ').trim();
  const maxSeeds = Math.max(40, Math.min(1600, Math.floor(options.maxSeeds || 520)));
  const maxCandidates = Math.max(80, Math.min(12000, Math.floor(options.maxCandidates || 6000)));
  const includeCrossCategory = options.includeCrossCategory === true;
  const categoryIds = resolveDiscoveryCategoryIds(category);
  const plan = buildCategoryFirstGoldenSeedPlan({
    category,
    keyword,
    maxSeeds,
    liveSeeds: options.liveSeeds || [],
  });
  const directCategoryIds = plan.categoryIds.length > 0 ? plan.categoryIds : categoryIds;
  const intents = getDirectIntents(directCategoryIds);
  const dateHints = getKoreanDateHints();
  const liveSeedValues = options.liveSeeds || [];
  const leadingLiveSeeds = liveSeedValues.slice(0, includeCrossCategory ? 24 : liveSeedValues.length);
  const trailingLiveSeeds = includeCrossCategory ? liveSeedValues.slice(24) : [];
  const baseSeeds = unique([
    keyword,
    ...leadingLiveSeeds,
    ...getIssueBases(directCategoryIds, includeCrossCategory),
    ...trailingLiveSeeds,
    ...plan.seeds,
    ...getDiscoveryCategorySeeds(category, Math.min(360, maxSeeds)),
    ...(includeCrossCategory ? getCrossCategoryDiscoverySeeds(directCategoryIds, Math.min(480, maxSeeds)) : []),
  ], maxSeeds);

  const candidates: string[] = [];
  for (const seed of baseSeeds) {
    const clean = normalizeCandidate(seed);
    if (!clean) continue;
    candidates.push(clean);
    for (const entity of extractLiveEntitySeeds(clean)) {
      candidates.push(entity);
      for (const intent of unique(getEntityIntentCandidates(entity), 8).slice(0, 5)) {
        if (!entity.includes(intent)) candidates.push(`${entity} ${intent}`);
      }
    }
    for (const intent of getSeedSpecificIntents(clean).slice(0, 6)) {
      if (!clean.includes(intent)) candidates.push(`${clean} ${intent}`);
    }
    candidates.push(...buildWriterReadyNeedCandidates(clean, directCategoryIds, 18));
    candidates.push(...buildWriterReadyCompoundNeedCandidates(clean, directCategoryIds, 24));
  }

  for (const seed of baseSeeds) {
    candidates.push(...expandSeed(seed, intents, dateHints));
    candidates.push(...buildWriterReadyNeedCandidates(seed, directCategoryIds, 16));
    candidates.push(...buildWriterReadyCompoundNeedCandidates(seed, directCategoryIds, 20));
    if (candidates.length >= maxCandidates * 1.25) break;
  }

  const usableCandidates = candidates.filter(isUsableCandidate);
  const finalCandidates = includeCrossCategory && !keyword
    ? spreadCandidates(usableCandidates, maxCandidates, 160)
    : unique(usableCandidates, maxCandidates, true);

  return {
    category,
    categoryIds: directCategoryIds,
    seeds: baseSeeds,
    candidates: finalCandidates,
  };
}

export async function discoverDirectGoldenKeywords(
  config: NaverDatalabConfig,
  options: DirectGoldenKeywordMinerOptions = {},
): Promise<MDPResult[]> {
  const limit = Math.max(1, Math.floor(options.limit || DEFAULT_LIMIT));
  const plan = buildDirectGoldenKeywordCandidatePlan(options);
  options.onProgress?.({
    phase: 'candidate-plan',
    candidates: plan.candidates.length,
  });
  if (plan.candidates.length === 0) return [];

  const maxCandidates = Math.max(80, Math.min(12000, Math.floor(options.maxCandidates || 7200)));
  const maxSimilarPerCluster = Math.max(
    1,
    Math.min(8, Math.floor(options.maxSimilarPerCluster || (limit > 30 ? 6 : 2))),
  );
  const bulkMode = limit > 30;
  const measurementCandidateCap = bulkMode
    ? Math.min(
      maxCandidates,
      Math.max(
        1800,
        Math.min(Math.floor(maxCandidates * 0.72), limit * 45),
      ),
    )
    : maxCandidates;
  const directPriorityCount = Math.min(
    plan.candidates.length,
    Math.max(bulkMode ? 240 : 180, Math.floor(measurementCandidateCap * (bulkMode ? 0.25 : 0.35))),
  );
  const suggestionCandidates = await buildSearchAdSuggestionCandidates(plan, options);
  const priorityCandidates = bulkMode
    ? spreadCandidates(plan.candidates, directPriorityCount, 160)
    : plan.candidates.slice(0, directPriorityCount);
  const anchorCandidates = bulkMode
    ? buildBulkAnchorCandidates(plan, options)
    : [];
  const candidates = unique([
    ...anchorCandidates,
    ...priorityCandidates,
    ...suggestionCandidates,
    ...plan.candidates,
  ], measurementCandidateCap, true);
  options.onProgress?.({
    phase: 'searchad-suggestions',
    candidates: candidates.length,
    anchorCandidates: anchorCandidates.length,
    suggestionSeeds: selectSuggestionSeeds(plan, options).length,
    suggestionCandidates: suggestionCandidates.length,
  });

  const rows = await getNaverKeywordSearchVolumeSeparate(config, candidates, {
    includeDocumentCount: true,
  });
  options.onProgress?.({
    phase: 'measure',
    candidates: candidates.length,
    measured: rows.length,
  });

  const requireCategoryMatch = options.requireCategoryMatch === true && plan.categoryIds.length > 0;
  const measured = rows
    .map(row => mapMeasuredRowToMdpResult(row, plan.category, plan.categoryIds))
    .filter((item): item is MDPResult => {
      if (!item) return false;
      if (requireCategoryMatch && item.categoryMatched !== true) return false;
      return true;
    });

  let allMeasured = measured;
  let ranked = rankGoldenDiscoveryResults(allMeasured, limit, false, {
    honorRequestedLimit: false,
    diversifySimilarIntents: true,
    maxSimilarPerCluster,
    strictVisibleSssOnly: true,
    requireActionableIntent: true,
    qualityBackfillToTarget: true,
  });

  const shouldRunSssSupplement = shouldContinueDirectGoldenSssHunt(
    ranked,
    limit,
    candidates.length,
    maxCandidates,
  );
  if (bulkMode && (ranked.length < limit || shouldRunSssSupplement) && candidates.length < maxCandidates) {
    const remainingCandidateSlots = maxCandidates - candidates.length;
    const sssGap = Math.max(0, resolveDirectGoldenBulkSssTarget(limit) - countSss(ranked));
    const visibleGap = Math.max(0, limit - ranked.length);
    const supplementLimit = Math.min(
      remainingCandidateSlots,
      Math.max(420, visibleGap * 60, sssGap * 90, limit * 4),
    );
    const exclude = new Set(candidates.map(candidate => compactGoldenKeyword(candidate)));
    const supplementCandidates = await buildRankedSupplementCandidates(
      ranked,
      plan,
      options,
      exclude,
      supplementLimit,
    );
    options.onProgress?.({
      phase: 'supplement-suggestions',
      supplementCandidates: supplementCandidates.length,
    });
    if (supplementCandidates.length > 0) {
      const supplementRows = await getNaverKeywordSearchVolumeSeparate(config, supplementCandidates, {
        includeDocumentCount: true,
      });
      options.onProgress?.({
        phase: 'supplement-measure',
        candidates: supplementCandidates.length,
        measured: supplementRows.length,
      });
      const supplementMeasured = supplementRows
        .map(row => mapMeasuredRowToMdpResult(row, plan.category, plan.categoryIds))
        .filter((item): item is MDPResult => {
          if (!item) return false;
          if (requireCategoryMatch && item.categoryMatched !== true) return false;
          return true;
        });
      allMeasured = [...allMeasured, ...supplementMeasured];
      ranked = rankGoldenDiscoveryResults(allMeasured, limit, false, {
        honorRequestedLimit: false,
        diversifySimilarIntents: true,
        maxSimilarPerCluster,
        strictVisibleSssOnly: true,
        requireActionableIntent: true,
        qualityBackfillToTarget: true,
      });
      options.onProgress?.({
        phase: 'supplement-rank',
        candidates: candidates.length + supplementCandidates.length,
        measured: rows.length + supplementRows.length,
        yielded: ranked.length,
      });
    }
  }

  if (
    bulkMode
    && options.includeProTrafficSupplement === true
    && (
      ranked.length < Math.min(limit, 50)
      || countSss(ranked) < Math.min(resolveDirectGoldenBulkSssTarget(limit), 50)
    )
  ) {
    try {
      const { huntProTrafficKeywords } = await import('./pro-traffic-keyword-hunter');
      const proResult = await huntProTrafficKeywords({
        mode: 'category',
        category: 'entertainment',
        count: Math.max(60, limit - ranked.length + 30),
        forceRefresh: false,
        includeSeasonKeywords: true,
        targetRookie: true,
        discoveryFirst: false,
        fastDiscovery: true,
      });
      const proSupplement = Array.isArray(proResult?.keywords)
        ? proResult.keywords
          .map(mapProTrafficKeywordToMdpResult)
          .filter((item): item is MDPResult => Boolean(item))
        : [];
      if (proSupplement.length > 0) {
        allMeasured = [...allMeasured, ...proSupplement];
        ranked = rankGoldenDiscoveryResults(allMeasured, limit, false, {
          honorRequestedLimit: false,
          diversifySimilarIntents: true,
          maxSimilarPerCluster,
          strictVisibleSssOnly: true,
          requireActionableIntent: true,
          qualityBackfillToTarget: true,
        });
      }
      options.onProgress?.({
        phase: 'pro-supplement',
        proSupplementCandidates: proSupplement.length,
        yielded: ranked.length,
      });
    } catch {
      options.onProgress?.({
        phase: 'pro-supplement',
        proSupplementCandidates: 0,
        yielded: ranked.length,
      });
    }
  }

  if (bulkMode && ranked.length < limit && allMeasured.length > ranked.length) {
    ranked = rankGoldenDiscoveryResults(allMeasured, limit, false, {
      honorRequestedLimit: false,
      diversifySimilarIntents: true,
      maxSimilarPerCluster: Math.min(10, maxSimilarPerCluster + 2),
      strictVisibleSssOnly: true,
      requireActionableIntent: true,
      qualityBackfillToTarget: true,
    });
  }

  options.onProgress?.({
    phase: 'rank',
    candidates: candidates.length,
    measured: allMeasured.length,
    yielded: ranked.length,
  });
  return ranked;
}
