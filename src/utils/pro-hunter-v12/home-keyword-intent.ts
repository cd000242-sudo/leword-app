export interface HomeNeedKeyword {
  keyword: string;
  category?: string;
  score: number;
  grade: HomeNeedGrade;
}

export type HomeNeedGrade = 'S+' | 'S' | 'A' | 'B' | 'C';

export const HOME_NEED_SPLUS_SCORE = 80;
export const HOME_HUNTER_MIN_SPLUS_RESULTS = 30;

const GENERIC_HEADS = [
  '추천', '순위', '가격', '후기', '뜻', '날씨', '뉴스', '이슈', '바로가기', '링크',
];

const PERSONA_TOKENS = [
  '직장인', '주부', '초보', '입문', '부모님', '아이', '가족', '1인 가구', '신혼',
  '30대', '40대', '50대', '60대', '소상공인', '자영업자', '청년', '학생', '시니어',
];

const ACTION_TOKENS = [
  '신청', '대상', '조건', '서류', '지급일', '사용처', '변경', '바뀐', '마감',
  '체크리스트', '준비물', '비교', '정리', '방법', '주의사항', '실수', '후기',
  '코스', '일정', '비용', '할인', '환급', '계산', '조회', '핵심', '포인트',
  '가이드', '업데이트', '선택', '관리', '확인', '작품', '정보',
];

const JUNE_TOKENS = [
  '6월', '초여름', '여름', '장마', '장마철', '제습', '냉방', '에어컨', '선풍기',
  '모기', '휴가', '여름휴가', '여름방학', '상반기', '호국보훈', '현충일', '복날',
];

const CATEGORY_SUFFIXES: Record<string, string[]> = {
  policy: ['2026 6월 신청 조건', '지급일과 준비서류', '대상 조회 방법', '놓치기 쉬운 변경사항', '마감 전 체크리스트', '공식 확인 경로', '온라인 신청 방법', '소득 기준과 제외 대상'],
  finance: ['상반기 점검 체크리스트', '6월 바뀐 조건', '환급·공제 확인할 것', '초보가 놓치는 주의사항', '직장인 기준 정리', '부모님이 궁금한 핵심', '수수료와 비용 비교', '오늘 확인할 변경사항'],
  health: ['초여름 관리 방법', '장마철 주의사항', '직장인 체크리스트', '증상별 비교 정리', '부모님 건강 확인 포인트', '오늘 시작할 관리법', '주의할 생활 습관', '초보 운동 루틴'],
  living: ['장마철 체크리스트', '제습·냄새 해결 방법', '다이소 활용 정리', '초여름 준비물', '원룸 관리 방법', '오늘 확인할 집안 점검', '가족 생활비 절약 팁', '냄새·습기 비교 정리'],
  interior: ['장마철 관리 방법', '원룸 체크리스트', '셀프 비용 정리', '초여름 바뀌는 관리법', '전세집 가능한 정리', '초보 셀프 가이드', '공간별 준비물', '예산별 선택 기준'],
  travel: ['6월 주말 코스', '장마철 대체 일정', '여름휴가 준비물', '비 오면 갈만한 곳', '가족 여행 체크리스트', '비용과 예약 방법', '오늘 확인할 운영 정보', '초보 여행 동선'],
  parenting: ['여름방학 준비 체크리스트', '장마철 실내놀이', '아이 건강 주의사항', '준비물 비용 정리', '부모님이 놓치는 포인트', '오늘 확인할 일정', '초등 저학년 기준 정리', '가족별 선택 기준'],
  food: ['초여름 메뉴 5가지', '장마철 집밥 정리', '직장인 도시락 체크리스트', '제철 재료 활용법', '오늘 저녁 메뉴 정리', '비 오는 날 메뉴', '초보 요리 준비물', '비용 아끼는 장보기'],
  beauty: ['초여름 지속력 비교', '장마철 무너짐 방지', '민감성 체크리스트', '2026 여름 바뀐 트렌드', '직장인 아침 루틴', '오늘 수정화장 방법', '초보가 놓치는 포인트', '피부타입별 선택 기준'],
  fashion: ['장마철 코디 방법', '초여름 출근룩 정리', '비 오는 날 신발 비교', '6월 하객룩 체크', '직장인 코디 체크리스트', '체형별 선택 기준', '오늘 입기 좋은 조합', '가격대별 비교'],
  it: ['2026 설정 체크리스트', '장마철 기기 관리', '가성비 비교 정리', '업데이트 후 바뀐 점', '초보 설정 방법', '오늘 확인할 보안 설정', '직장인 활용 팁', '구매 전 체크리스트'],
  celebrity: ['이번 주 이슈 정리', '방송 전 알아둘 포인트', '팬들이 찾는 일정 정리', '관련 상품 체크리스트', '오늘 공개 정보 정리', '다시보기와 회차 정리', '출연진과 관전 포인트', '팬들이 놓친 장면'],
  issue: ['이번 주 확인할 것', '6월 바뀐 점 정리', '생활에 영향 있는 포인트', '오늘 글감 체크리스트', '지금 검색 많은 이유', '초보도 이해되는 정리', '오늘 기준 핵심 정보', '주말 전 확인할 것'],
  general: ['6월 지금 확인할 것', '초여름 체크리스트', '놓치기 쉬운 변경사항', '오늘 쓰기 좋은 정리', '이번 주 핵심 포인트', '초보 기준 가이드', '가족이 확인할 정보', '지금 바뀐 점'],
};

const COMMON_SPLUS_ANGLES = [
  '2026 6월 최신 정리',
  '2026 6월 핵심 체크리스트',
  '2026 6월 바뀐 점 정리',
  '이번 주 확인할 핵심 5가지',
  '오늘 바로 확인할 체크리스트',
  '지금 놓치기 쉬운 변경사항',
  '마감 전 확인할 포인트 5가지',
  '상반기 마지막 체크리스트',
  '초여름 준비물과 비용 정리',
  '6월 실수하기 쉬운 부분 5가지',
  '오늘 기준 비교 정리',
  '이번 주 자주 묻는 질문 정리',
  '2026년 현재 확인 방법',
  '지금 알아둘 주의사항',
  '6월 초보 기준 정리',
  '오늘 가족이 확인할 포인트',
  '이번 주 직장인 체크리스트',
  '지금 부모님이 궁금해하는 핵심',
  '6월 최신 일정과 방법',
  '오늘 확인할 대상별 차이',
  '이번 주 변화와 준비물',
  '2026 6월 비용과 선택 기준',
  '지금 검색 많은 이유 정리',
  '초여름 관리 방법 체크',
  '오늘 놓치면 아쉬운 팁 5가지',
  '이번 주 업데이트 정리',
  '6월 한눈에 보는 핵심',
  '지금 필요한 준비물 정리',
  '오늘 기준 장단점 비교',
  '2026 6월 실전 가이드',
  '이번 주 발행하기 좋은 질문',
  '오늘 검색자가 궁금한 핵심',
];

const CATEGORY_SPLUS_ANGLES: Record<string, string[]> = {
  policy: [
    '2026 6월 신청 대상 정리',
    '이번 주 신청 기간과 마감일',
    '오늘 확인할 준비서류 체크리스트',
    '지금 바뀐 소득 기준 정리',
    '6월 온라인 신청 방법',
    '마감 전 결과 조회 방법',
    '오늘 확인할 제외 대상',
    '2026 6월 공식 공고 핵심',
  ],
  finance: [
    '2026 6월 환급 조건 정리',
    '이번 주 직장인 체크리스트',
    '오늘 확인할 공제 변경사항',
    '6월 초보가 놓치는 실수',
    '지금 비교할 수수료와 혜택',
  ],
  health: [
    '2026 6월 증상별 관리법',
    '이번 주 장마철 주의사항',
    '오늘 시작할 직장인 루틴',
    '초여름 부모님 건강 체크',
    '지금 피해야 할 생활 습관',
  ],
  living: [
    '2026 6월 장마철 관리법',
    '이번 주 집안 점검 체크리스트',
    '오늘 해결할 냄새와 습기',
    '초여름 준비물 비용 정리',
    '지금 바꿔야 할 생활 팁',
  ],
  travel: [
    '2026 6월 주말 코스 정리',
    '이번 주 비 오는 날 대체 일정',
    '오늘 확인할 예약과 비용',
    '여름휴가 준비물 체크리스트',
    '지금 가족 여행 동선 비교',
  ],
  parenting: [
    '2026 6월 아이 준비물 정리',
    '이번 주 여름방학 체크리스트',
    '오늘 확인할 부모님 질문',
    '장마철 실내놀이 5가지',
    '지금 놓치기 쉬운 비용 정리',
  ],
  beauty: [
    '2026 6월 여름 지속력 비교',
    '이번 주 장마철 무너짐 방지',
    '오늘 피부타입별 선택 기준',
    '초여름 직장인 루틴 정리',
    '지금 바뀐 트렌드 체크',
  ],
  fashion: [
    '2026 6월 출근룩 정리',
    '이번 주 장마철 코디 방법',
    '오늘 입기 좋은 조합 5가지',
    '비 오는 날 신발 비교',
    '지금 가격대별 선택 기준',
  ],
  it: [
    '2026 6월 업데이트 후 설정',
    '이번 주 보안 설정 체크리스트',
    '오늘 확인할 가성비 비교',
    '초보 설정 방법 정리',
    '지금 구매 전 체크할 것',
  ],
  celebrity: [
    '이번 주 방송 일정 정리',
    '오늘 공개된 최신 정보',
    '지금 팬들이 찾는 포인트',
    '2026 6월 다시보기와 회차',
    '이번 주 출연진 관전 포인트',
    '오늘 반응 좋은 장면 정리',
  ],
  issue: [
    '오늘 검색 많은 이유 정리',
    '이번 주 생활 영향 체크',
    '2026 6월 바뀐 점 정리',
    '지금 알아둘 핵심 정보',
    '오늘 발행하기 좋은 질문',
  ],
};

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeHomeNeedCategory(category?: string): string {
  const raw = String(category || '').trim();
  const c = raw.toLowerCase().replace(/\s+/g, '');
  if (!c) return 'general';

  const aliases: Record<string, string> = {
    home: 'living',
    home_life: 'living',
    living: 'living',
    interior: 'living',
    '인테리어/생활': 'living',
    '육아(영유아)': 'parenting',
    '육아(초중고)': 'parenting',
    parenting_kids: 'parenting',
    pregnancy: 'parenting',
    '임신/출산': 'parenting',
    recipe: 'food',
    '맛집/요리': 'food',
    travel_domestic: 'travel',
    travel_overseas: 'travel',
    camping: 'travel',
    '여행/숙박': 'travel',
    business: 'finance',
    career: 'finance',
    sidejob: 'finance',
    realestate: 'finance',
    '재테크/투자': 'finance',
    '부업/n잡': 'finance',
    policy: 'policy',
    subsidy: 'policy',
    support: 'policy',
    '지원금/정책/복지': 'policy',
    '지원금': 'policy',
    '정책': 'policy',
    '복지': 'policy',
    health: 'health',
    senior: 'health',
    '건강/운동': 'health',
    '시니어/노후': 'health',
    beauty: 'beauty',
    '뷰티/화장품': 'beauty',
    fashion: 'fashion',
    '패션/스타일': 'fashion',
    it: 'it',
    smartphone: 'it',
    laptop: 'it',
    ai_tool: 'it',
    'it/디지털': 'it',
    education: 'issue',
    '교육/자격증': 'issue',
    car: 'issue',
    auto: 'issue',
    '자동차': 'issue',
    wedding: 'issue',
    '결혼/예식': 'issue',
    celeb: 'celebrity',
    celebrity: 'celebrity',
    star: 'celebrity',
    entertainment: 'celebrity',
    culture: 'celebrity',
    movie: 'celebrity',
    drama: 'celebrity',
    broadcast: 'celebrity',
    music: 'celebrity',
    book: 'celebrity',
    game: 'celebrity',
    '스타/연예이슈': 'celebrity',
    '연예': 'celebrity',
    '연예인': 'celebrity',
    '문화/엔터': 'celebrity',
  };

  return aliases[c] || c || 'general';
}

function normalizedCategory(category?: string): string {
  return normalizeHomeNeedCategory(category);
}

function uniqueKeywords(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const keyword = compact(raw);
    const key = keyword.toLowerCase().replace(/\s+/g, '');
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

export function gradeHomeNeedScore(score: number): HomeNeedGrade {
  const s = Number.isFinite(score) ? score : 0;
  if (s >= HOME_NEED_SPLUS_SCORE) return 'S+';
  if (s >= 70) return 'S';
  if (s >= 60) return 'A';
  if (s >= 45) return 'B';
  return 'C';
}

export function scoreHomeNeedKeyword(keyword: string, category = 'general', now = new Date()): number {
  const kw = compact(keyword);
  if (!kw) return 0;

  const tokens = kw.split(/\s+/).filter(Boolean);
  let score = 22;

  const month = now.getMonth() + 1;
  const currentMonthPattern = new RegExp(`${month}월|2026|최신|이번\\s*주|오늘|지금|마감|변경|바뀐`);
  if (currentMonthPattern.test(kw)) score += 18;
  if (month === 6 && JUNE_TOKENS.some(t => kw.includes(t))) score += 22;
  if (ACTION_TOKENS.some(t => kw.includes(t))) score += 22;
  if (PERSONA_TOKENS.some(t => kw.includes(t))) score += 14;
  if (/\d+\s*(개|가지|만원|원|일|주|월|박|시간|%)|TOP\s*\d+/i.test(kw)) score += 10;
  if (kw.length >= 10 && kw.length <= 34) score += 10;
  if (tokens.length >= 4) score += 10;

  const cat = normalizedCategory(category);
  if (cat !== 'general' && CATEGORY_SUFFIXES[cat]) score += 5;

  const hasOnlyGenericIntent = tokens.length <= 2 || (tokens.length <= 3 && GENERIC_HEADS.some(t => kw.endsWith(t)));
  if (hasOnlyGenericIntent && !ACTION_TOKENS.some(t => kw.includes(t)) && !JUNE_TOKENS.some(t => kw.includes(t))) score -= 35;
  if (/^(오늘\s*)?(이슈|뉴스|실시간|추천|가격|날씨)$/.test(kw)) score -= 50;
  if (/(주식\s*추천|코인|도박|성폭|살인|자살|화재|폭발)/.test(kw)) score -= 60;

  return Math.max(0, Math.min(100, score));
}

export function isWeakHomeNeedKeyword(keyword: string, category = 'general'): boolean {
  return scoreHomeNeedKeyword(keyword, category) < 45;
}

export function expandHomeNeedKeywords(seed: string, category = 'general', limit = 8): HomeNeedKeyword[] {
  const base = compact(seed);
  if (!base) return [];
  const cat = normalizedCategory(category);
  const safeLimit = Math.min(250, Math.max(1, Math.floor(limit || 8)));
  const suffixes = [
    ...(CATEGORY_SUFFIXES[cat] || CATEGORY_SUFFIXES.general),
    ...COMMON_SPLUS_ANGLES,
  ];
  const splusAngles = [
    ...(CATEGORY_SPLUS_ANGLES[cat] || []),
    ...COMMON_SPLUS_ANGLES,
  ];
  const candidates = new Set<string>();

  if (!isWeakHomeNeedKeyword(base, cat)) candidates.add(base);
  for (const suffix of suffixes) {
    if (base.includes(suffix)) candidates.add(base);
    else candidates.add(`${base} ${suffix}`);
  }
  candidates.add(`2026 6월 ${base} 체크리스트`);
  candidates.add(`${base} 지금 확인할 변경사항`);

  if (safeLimit >= HOME_HUNTER_MIN_SPLUS_RESULTS) {
    for (const angle of splusAngles) {
      if (base.includes(angle)) candidates.add(base);
      else candidates.add(`${base} ${angle}`);
    }
  }

  const ranked = uniqueKeywords(candidates)
    .map(keyword => {
      const score = scoreHomeNeedKeyword(keyword, cat);
      return { keyword, category: cat, score, grade: gradeHomeNeedScore(score) };
    })
    .filter(item => item.score >= 45)
    .sort((a, b) => b.score - a.score || a.keyword.length - b.keyword.length);

  const splusOnly = ranked.filter(item => item.grade === 'S+');
  const pool = safeLimit >= HOME_HUNTER_MIN_SPLUS_RESULTS && splusOnly.length >= HOME_HUNTER_MIN_SPLUS_RESULTS
    ? splusOnly
    : ranked;
  return pool.slice(0, safeLimit);
}

export function rankHomeNeedKeywords<T extends { keyword: string; category?: string }>(
  items: T[],
): Array<T & { homeNeedScore: number; homeNeedGrade: HomeNeedGrade }> {
  const seen = new Set<string>();
  const out: Array<T & { homeNeedScore: number; homeNeedGrade: HomeNeedGrade }> = [];
  for (const item of items || []) {
    const keyword = compact(item.keyword);
    const key = keyword.toLowerCase().replace(/\s+/g, '');
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    const homeNeedScore = scoreHomeNeedKeyword(keyword, item.category);
    out.push({ ...item, keyword, homeNeedScore, homeNeedGrade: gradeHomeNeedScore(homeNeedScore) });
  }
  return out.sort((a, b) => b.homeNeedScore - a.homeNeedScore || a.keyword.length - b.keyword.length);
}
