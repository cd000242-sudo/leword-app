// v2.43.34 (Phase 1): 시즌 캘린더 — 월별 시즌 시드 강제 주입
// 사용자 비판: "이런 키워드 훨씬 많을 텐데 못 찾는다" + "regex 자전거"
// 해결: 매월 정적 시즌 시드를 발굴 풀에 강제 주입 → regex 추가 없이 시즌 키워드 자동 발굴

/**
 * 한국 시장 월별 시즌 시드 (12 × ~30개)
 * 각 시드는 자동완성 확장의 base 가 됨 (depth 2)
 */
export const SEASONAL_SEEDS_BY_MONTH: Record<number, string[]> = {
  1: [
    '연말정산', '연말정산 환급', '연말정산 간소화', '연말정산 신청',
    '새해 운동', '새해 다이어트', '신년 운세 무료', '신년 토정비결',
    '신정', '설날 준비', '설날 음식', '설날 음식 만드는법',
    '구정 음식', '겨울 보양식', '한파 대비', '동파 방지',
    '1월 한정', '신년 모임', '새해 인사말', '청년도약계좌 신청',
    '청년희망적금', '국민연금 추납', '실업급여 신청 방법',
    '소득공제 항목', '의료비 공제', '교육비 공제',
    '기부금 영수증', '보장성 보험료 공제',
  ],
  2: [
    '발렌타인데이 선물', '발렌타인 초콜릿 만드는법', '발렌타인데이 데이트',
    '졸업식', '졸업 선물', '졸업식 꽃다발',
    '입학 준비물', '초등학교 입학 준비', '입학 가방',
    '설날 음식 만드는법', '떡국 끓이는법', '명절 음식',
    '겨울방학 여행지', '2월 행사', '2월 시즌',
    '봄옷 추천', '얇은 패딩 추천', '봄 코트 추천',
    '3.1절 의미', '독립운동 역사',
    '꽃샘추위 옷차림', '환절기 건강',
    '청약 가점 계산', '주택청약 1순위',
    '대학 새내기 준비물', '기숙사 준비물',
  ],
  3: [
    '화이트데이 선물', '화이트데이 초콜릿', '화이트데이 데이트',
    '입학식', '입학 선물', '초등학교 새 학기 준비물',
    '새 학기 운동화', '학용품 추천', '신학기 가방',
    '봄맞이 청소', '봄 대청소', '봄 인테리어',
    '3월 행사', '꽃샘추위', '환절기 비염',
    '봄나들이 명소', '벚꽃 명소', '벚꽃 개화 시기',
    '봄 옷차림', '봄 코디', '봄 화장법',
    '신학기 인사말', '학부모 인사말',
    '봄 알레르기', '환절기 면역력',
    '3.1절', '독립운동가',
  ],
  4: [
    '벚꽃 명소', '벚꽃 축제', '벚꽃 개화 시기',
    '식목일 의미', '식목일 행사',
    '부활절 선물', '부활절 의미',
    '4월 한정', '봄 캠핑', '봄 소풍 음식',
    '만우절 장난', '만우절 메시지',
    '봄 운동회', '봄 등산 코스',
    '봄 알레르기 대처법', '미세먼지 마스크',
    '4월 가볼만한 곳', '봄 데이트',
    '봄 운동복', '러닝 시작하는법',
    '봄 다이어트', '봄 화분 관리',
    '봄 영양제 추천', '비타민 D 영양제',
    '청년월세지원금 신청',
  ],
  5: [
    '종합소득세 환급', '종소세 환급', '종소세 신고',
    '환급금 조회 홈택스', '환급금 조회 토스', '환급금 조회 삼쩜삼',
    '병원비 환급금 조회', '연말정산 환급금 조회',
    '어린이날 선물', '어린이날 행사', '어린이날 데이트',
    '어버이날 선물', '어버이날 카네이션', '어버이날 편지',
    '가정의 달 행사', '가정의 달 선물',
    '스승의날 선물', '스승의날 카드',
    '5월 가볼만한 곳', '5월 한정 이벤트',
    '근로장려금 신청', '자녀장려금 신청',
    '석가탄신일', '부처님오신날',
    '5월 결혼식 하객룩', '5월 야외 결혼식',
    '봄 여행 추천', '국내 여행지',
    '4대보험 환급', '건강보험 환급금 조회',
  ],
  6: [
    '현충일 의미', '호국보훈의 달',
    '단오 음식', '단오 풍습',
    '장마 대비', '장마철 옷 관리', '장마철 인테리어',
    '여름 준비물', '여름 보양식', '여름 옷 정리',
    '에어컨 청소법', '에어컨 추천', '에어컨 전기세',
    '제습기 추천', '선풍기 추천', '서큘레이터 추천',
    '6월 행사', '6월 가볼만한 곳',
    '여름 다이어트', '여름 화장법',
    '여름 운동복', '여름 운동화',
    '여름 캠핑 준비물', '여름 캠핑장 추천',
    '여름 음식 레시피', '냉면 만드는법',
    '대학 종강', '여름방학 알바',
    '월드컵 일정',
  ],
  7: [
    '여름휴가 추천', '여름휴가 국내', '여름휴가 해외',
    '워터파크 추천', '계곡 추천', '바다 추천',
    '제주도 여행 코스', '동해 여행', '남해 여행',
    '에어컨 전기세', '여름 전기세 절약',
    '장마철 빨래', '장마철 곰팡이 제거',
    '더위 먹었을 때', '일사병 증상', '여름 보양식',
    '여름 다이어트', '여름 운동',
    '7월 한정 이벤트', '7월 가볼만한 곳',
    '여름 캠핑', '여름 등산 코스',
    '여름 옷차림', '여름 패션',
    '여름 화장법', '땀 안 나는 화장',
    '아이스크림 만드는법', '여름 음료 레시피',
    '에어컨 청소', '에어컨 곰팡이 제거',
  ],
  8: [
    '광복절 의미', '광복절 행사',
    '늦여름 옷차림', '여름 휴가 막바지',
    '여름 다이어트 막판', '여름 마무리',
    '8월 가볼만한 곳', '8월 한정 이벤트',
    '추석 선물 추천', '추석 선물 세트',
    '캠핑 초보 준비물', '8월 캠핑장',
    '에어컨 청소', '여름 전기세',
    '늦여름 일사병', '말복 보양식',
    '여름 영양제', '비타민B 영양제',
    '여름 끝물 세일', '8월 백화점 세일',
    '가을 옷 미리 준비', '가을 코디',
    '개강 준비', '대학 개강',
    '환절기 옷차림', '간절기 코디',
  ],
  9: [
    '추석 선물', '추석 음식', '추석 차례상',
    '추석 인사말', '추석 안부 인사',
    '명절 음식 만드는법', '송편 만드는법',
    '추석 연휴 여행', '추석 가볼만한 곳',
    '가을 캠핑장', '가을 단풍 명소',
    '환절기 비염', '환절기 감기', '환절기 영양제',
    '개강', '대학 개강 준비', '신입생 인사말',
    '가을맞이 청소', '가을 옷 정리',
    '가을 옷차림', '가을 코디', '가을 패션',
    '9월 가볼만한 곳', '9월 한정 이벤트',
    '가을 운동회', '가을 등산',
    '연말정산 미리보기',
  ],
  10: [
    '핼러윈 의상', '핼러윈 분장', '핼러윈 파티',
    '단풍 명소', '단풍 시기', '단풍 절정 시기',
    '가을 여행 추천', '가을 캠핑장',
    '한글날 의미', '한글날 행사',
    '10월 가볼만한 곳', '10월 한정 이벤트',
    '가을 운동회 음식', '운동회 도시락',
    '가을 결혼식 하객룩', '가을 야외 결혼식',
    '가을 화장법', '가을 옷차림',
    '가을 등산 코스', '가을 트레킹',
    '환절기 면역력', '가을 보양식',
    '10월 백화점 세일',
    '늦가을 옷차림', '간절기 코디',
    '신입사원 면접', '취업 자소서',
  ],
  11: [
    '김장 시기', '김장 김치 양념', '김장 배추 절이기',
    '김장 김치 보관법', '김장 양념 레시피',
    '수능 D-30', '수능 D-100', '수능 도시락',
    '수능 응원 메시지', '수능 컨디션 관리',
    '빼빼로데이 선물', '빼빼로 만드는법',
    '광군절 직구', '광군절 쇼핑',
    '블랙프라이데이 쇼핑', '블랙프라이데이 직구',
    '11월 한정 이벤트', '11월 가볼만한 곳',
    '겨울 옷 미리 준비', '겨울 코트 추천',
    '롱패딩 추천', '겨울 부츠 추천',
    '겨울 화장법', '겨울 보습',
    '환절기 감기 예방', '독감 예방접종',
    '연말 행사', '송년회 의상',
    '11월 백화점 세일',
  ],
  12: [
    '크리스마스 선물', '크리스마스 데이트', '크리스마스 장식',
    '크리스마스 트리 꾸미기', '크리스마스 카드 문구',
    '연말 모임', '송년회 장소', '송년회 의상',
    '신년 계획', '새해 다짐', '새해 목표',
    '연말정산 준비', '연말정산 미리보기',
    '12월 가볼만한 곳', '12월 한정 이벤트',
    '겨울 캠핑', '겨울 캠핑장',
    '겨울 보양식', '겨울 영양제',
    '눈 오는 날 옷차림', '눈길 운전법',
    '동지 음식', '팥죽 만드는법',
    '12월 백화점 세일', '연말 세일',
    '신년 인사말', '새해 인사 문구',
    '제야의 종 일정', '카운트다운 행사',
    '겨울 여행지 추천', '스키장 추천',
  ],
};

/**
 * 현재 월(KST) 기준 시즌 시드 가져오기
 * 다음 월 시드도 함께 (5월 말이면 6월 시드 일부도 미리 발굴)
 */
export function getCurrentSeasonalSeeds(): string[] {
  const now = new Date();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();

  const current = SEASONAL_SEEDS_BY_MONTH[month] || [];

  // 월 25일+ 면 다음 달 시드 30% 미리 주입 (시즌 선점)
  if (dayOfMonth >= 25) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextSeeds = SEASONAL_SEEDS_BY_MONTH[nextMonth] || [];
    const preview = nextSeeds.slice(0, Math.ceil(nextSeeds.length * 0.3));
    return [...current, ...preview];
  }

  return current;
}

/**
 * 모든 월의 시즌 시드 (evergreen 발굴용)
 */
export function getAllSeasonalSeeds(): string[] {
  const all: string[] = [];
  for (const m of Object.values(SEASONAL_SEEDS_BY_MONTH)) all.push(...m);
  return Array.from(new Set(all));
}

// v2.43.39 (Phase 3-B Step 1): 도메인별 suffix 풀 분리 — 의미 충돌 차단
//   1팀 비평: "독립운동가 수수료, 한글날 의미 안 됨 같은 무의미 조합 1/3"
//   해결: 시드별 도메인 자동 분류 + 도메인 호환 suffix만 선택
type SeedDomain = 'admin' | 'commerce' | 'food' | 'event' | 'person' | 'howto-life' | 'shopping-event' | 'travel' | 'general';

/**
 * 시드 키워드의 도메인 자동 분류 (룰 베이스)
 */
// v2.49.9: classifySeedDomain Phase B 발견 통합 보강
//   1. person 도메인 — 한국 인명 풀 추가 (baseline person miss 100% → 0%)
//   2. travel 룰 우선 (commerce 의 '추천' 키워드가 워터파크/계곡 가로채는 문제)
//   3. howto-life 룰 우선 (commerce 의 '에어컨' 이 '에어컨 청소법' 가로채는 문제)
//   4. commerce 토큰 확장 (마우스/키보드/이어폰 등 단일 명사)
function classifySeedDomain(seed: string): SeedDomain {
  const s = seed.toLowerCase();
  // admin: 행정/세무/공공서비스 (가장 specific 한 dest 라 우선)
  if (/환급|신청|조회|민원|등본|초본|인감|공증|연말정산|소득세|법인세|국민연금|건강보험|고용보험|취득세|등록세|재산세|공제|면세|장려금|지원금|계좌|적금/.test(s)) return 'admin';
  // person: 한국/외국 인명 + 인물 메타 토큰 (v2.49.9 보강 — Phase B miss 100%)
  if (/유관순|안중근|안창호|윤봉길|김구|이순신|세종대왕|장영실|신사임당|황진이|박정희|이승만|문익점|독립운동가|위인|영웅|애국지사|선조|역사 인물|지도자|위대한 인물|패리스|잭슨|아인슈타인|뉴턴|간디/.test(s)) return 'person';
  // food: 음식/요리 (단어 경계로 false positive 차단)
  if (/만드는법|만드는|레시피|끓이는|굽는|볶는|튀기는|만들기|음식|반찬|찌개|찜|구이|볶음|샐러드|간식|디저트|음료|커피차|밀키트|보양식|만두|김치|장아찌|국밥|냉면|비빔밥|불고기|삼겹살|치킨|떡볶이|순대|족발|보쌈|아이스크림|빵|쿠키|케이크|송편|떡국|팥죽|발렌타인 초콜릿/.test(s)) return 'food';
  // howto-life: 생활 노하우 (commerce 보다 우선 — "에어컨 청소법" 같은 케이스)
  if (/청소법|관리법|보관법|손질법|대비|관리|보관|손질|청소|정리|수납|살림|꿀팁|요령|준비물|예방|방지|운동|다이어트|건강검진/.test(s)) return 'howto-life';
  // travel: 여행 (commerce '추천' 보다 우선 — "워터파크/계곡 추천" 같은 케이스)
  if (/여행|호텔|항공|패키지|투어|렌트카|숙박|에어비앤비|일정|코스|가볼만한|관광지|명소|벚꽃 명소|단풍 명소|워터파크|계곡|해수욕장|캠핑장|글램핑/.test(s)) return 'travel';
  // event: 행사/기념일
  if (/의미|기념일|축제|3\.1절|광복절|한글날|개천절|제헌절|식목일|단오|동지|어버이날|어린이날|스승의날|현충일|단군신화|호국보훈/.test(s)) return 'event';
  // shopping-event: 쇼핑 이벤트
  if (/세일|할인|특가|광군절|블랙프라이데이|빅스마일|쇼핑|핫딜|직구|11번가|쿠팡|마켓컬리/.test(s)) return 'shopping-event';
  // commerce: 일반 쇼핑/추천 (v2.49.9 보강 — 디지털/주변기기 추가)
  if (/선물|추천|코디|패션|옷|화장품|뷰티|구두|가방|운동화|향수|화장|아이폰|갤럭시|노트북|에어컨|냉장고|세탁기|마우스|키보드|모니터|이어폰|에어팟|패딩|롱패딩|다이슨/.test(s)) return 'commerce';
  return 'general';
}

// 도메인별 호환 suffix 풀 (의미 충돌 차단)
const DOMAIN_SUFFIXES: Record<SeedDomain, string[]> = {
  admin: ['방법', '하는법', '신청 방법', '조회 방법', '받는 법', '대상', '자격', '조건', '필요 서류', '기간', '마감일', '안 됨', '오류', '해결 방법'],
  commerce: ['추천', '순위', '후기', '리뷰', '가격', '비교', '차이', '브랜드', '솔직 후기', '인기'],
  food: ['만드는법', '레시피', '재료', '보관법', '간단', '쉬운', '맛있는'],
  event: ['의미', '유래', '역사', '일정', '시기', '행사', '풍습', '음식'],
  person: ['의미', '역사', '이야기', '생애', '명언', '업적'],
  'howto-life': ['방법', '하는법', '꿀팁', '요령', '추천', '준비물', '주의사항'],
  'shopping-event': ['할인', '직구', '쇼핑', '구매', '추천', '인기', '베스트'],
  travel: ['추천', '코스', '일정', '명소', '맛집', '가는법', '주차', '입장료'],
  general: ['방법', '추천', '후기', '비교', '의미'],
};

const INTENT_SUFFIXES_FALLBACK = DOMAIN_SUFFIXES.general;

/**
 * 시드 키워드 × 도메인 호환 suffix 자동 longtail 생성
 * v2.43.39: 도메인 매칭 (정적 룰)
 * v2.43.41: 옵션으로 의미 임베딩 재검증 (Step 3) — 모델 활성 시
 */
/**
 * v2.49.9: 결정론적 셔플 (Math.random 제거 — Phase B 100% 위반).
 *   seed 별로 고정된 hash 로 정렬 → 같은 seed 면 항상 같은 suffix 순서.
 *   장점: 회귀 테스트 안정 + 캐시 일관성 + Math.random 메모리 규칙 회색지대 제거.
 *   suffix 다양성은 perSeed 갯수로 보장 (8개 중 무작위 X, 상위 8개).
 */
function seedHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

export function expandWithIntentSuffixes(seeds: string[], perSeed = 8): string[] {
  const result: string[] = [];
  for (const seed of seeds) {
    const clean = seed.trim();
    if (!clean) continue;
    result.push(clean);
    const domain = classifySeedDomain(clean);
    const pool = DOMAIN_SUFFIXES[domain] || INTENT_SUFFIXES_FALLBACK;

    // v2.49.9: deterministic shuffle — seed hash + suffix index 로 정렬
    const seedH = seedHash(clean);
    const shuffled = pool
      .map((suf, idx) => ({ suf, key: seedHash(suf + clean) ^ (idx * seedH) }))
      .sort((a, b) => a.key - b.key)
      .map(x => x.suf);
    const picks = shuffled.slice(0, Math.min(perSeed, pool.length));

    for (const suf of picks) {
      // v2.49.9: 이중 접미사 차단 (Agent V 발견 — 모든 도메인 발생)
      //   "에어컨 청소법" + "방법" = "에어컨 청소법 방법" 99% FP
      //   "여행 코스 추천" + "코스" = "여행 코스 추천 코스" 중복
      if (clean.includes(suf)) continue;

      const combo = `${clean} ${suf}`;
      if (combo.length <= 40) result.push(combo);
    }
  }
  return Array.from(new Set(result));
}

/**
 * v2.43.41 (Phase 3-B Step 3): 의미 임베딩 재검증 — 모델 활성 시
 * 도메인 매칭 1차 필터 통과한 조합 중 의미 충돌 (cosine < threshold) 추가 차단
 */
export async function expandWithSemanticVerify(
  seeds: string[],
  perSeed = 8,
  threshold = 0.45,
): Promise<{ items: string[]; verified: boolean; blocked: number }> {
  const candidates = expandWithIntentSuffixes(seeds, perSeed);
  // 모델 활성 검사
  let semantic: any;
  try {
    semantic = await import('../semantic-embedding');
  } catch {
    return { items: candidates, verified: false, blocked: 0 };
  }
  const status = semantic.getSemanticStatus();
  if (!status.ready) return { items: candidates, verified: false, blocked: 0 };

  // 시드별 임베딩 사전 계산
  const seedSet = new Set(seeds.map(s => s.trim()));
  await semantic.precomputeEmbeddings(Array.from(seedSet));

  // 후보 검증
  const passed: string[] = [];
  let blocked = 0;
  for (const cand of candidates) {
    // 시드 자체는 검증 면제
    if (seedSet.has(cand)) {
      passed.push(cand);
      continue;
    }
    // 조합인 경우 — 가장 매칭되는 시드 찾고 cosine 검증
    let bestSim = 1.0;
    let usedSeed: string | null = null;
    for (const seed of seedSet) {
      if (cand.startsWith(seed + ' ')) {
        usedSeed = seed;
        break;
      }
    }
    if (!usedSeed) {
      passed.push(cand);
      continue;
    }
    const compatible = await semantic.semanticCompatible(usedSeed, cand, threshold);
    if (compatible) {
      passed.push(cand);
    } else {
      blocked++;
    }
  }
  return { items: passed, verified: true, blocked };
}

/** 테스트/디버깅용 — 시드 → 도메인 분류 결과 노출 */
export function getSeedDomainBreakdown(seeds: string[]): Record<SeedDomain, string[]> {
  const result: Record<SeedDomain, string[]> = {
    admin: [], commerce: [], food: [], event: [], person: [],
    'howto-life': [], 'shopping-event': [], travel: [], general: [],
  };
  for (const seed of seeds) {
    const d = classifySeedDomain(seed);
    result[d].push(seed);
  }
  return result;
}

// v2.43.46: 카테고리 × 시즌 매트릭스
// 사용자 카테고리에 매칭되는 시즌 시드 우선 — 같은 5월이라도 육아 블로거는 "어린이날 선물", 금융 블로거는 "종합소득세 환급" 우선
export interface SeasonalMatrixResult {
  matched: string[];    // 사용자 카테고리 매칭 시즌 시드 (우선)
  general: string[];    // 미매칭 시즌 시드 (보조)
  matchedRatio: number; // matched / total
}

export function getSeasonalForUserCategories(
  userCategoryAffinityPatterns: RegExp[],
): SeasonalMatrixResult {
  const all = getCurrentSeasonalSeeds();
  if (userCategoryAffinityPatterns.length === 0) {
    return { matched: [], general: all, matchedRatio: 0 };
  }
  const matched: string[] = [];
  const general: string[] = [];
  for (const seed of all) {
    const hit = userCategoryAffinityPatterns.some(pat => pat.test(seed));
    if (hit) matched.push(seed);
    else general.push(seed);
  }
  return {
    matched,
    general,
    matchedRatio: all.length > 0 ? matched.length / all.length : 0,
  };
}
