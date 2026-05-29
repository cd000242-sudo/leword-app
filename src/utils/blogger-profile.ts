// v2.43.25 (사이클#2): 블로거 프로필 — 사용자 컨텍스트 부재 문제 해결
// 사이클 #2 진단: "현재 LEWORD는 발굴기지 추천기가 아니다"
// 카테고리 + 연차 + 일평균 방문자를 1회 입력받아 모든 발굴에 영구 적용
// → bloggerWritability 가 "일반 블로거 평균" → "내 블로그 기준" 상대 게이트로 전환

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// 블로거 카테고리 (한국 블로그 주요 도메인)
export type BloggerCategoryId =
  | 'parenting'        // 육아/아기
  | 'beauty'           // 뷰티/화장품
  | 'fashion'          // 패션
  | 'food'             // 맛집/레시피
  | 'travel'           // 여행
  | 'health'           // 건강/운동
  | 'it'               // IT/디지털
  | 'home'             // 인테리어/생활
  | 'pet'              // 반려동물
  | 'finance'          // 재테크/투자
  | 'education'        // 교육/입시/자격증
  | 'auto'             // 자동차
  | 'culture'          // 영화/도서/문화
  | 'parenting_kids'   // 초중고 자녀
  | 'wedding'          // 결혼/예식
  | 'realestate'       // 부동산
  | 'pregnancy'        // 임신/태교
  | 'senior'           // 시니어/노후
  | 'sidejob'          // 부업/N잡
  | 'self';            // 자기계발

export interface BloggerCategoryInfo {
  id: BloggerCategoryId;
  label: string;
  icon: string;
  // 이 카테고리를 "내 카테고리" 로 선택했을 때 친화도 가산되는 키워드 패턴
  affinityPattern: RegExp;
  // v2.43.44: 의미 임베딩용 자연어 description (cosine 매칭의 라벨)
  description: string;
}

export const BLOGGER_CATEGORIES: BloggerCategoryInfo[] = [
  { id: 'parenting',       label: '육아 (영유아)',    icon: '👶', affinityPattern: /(신생아|아기|영아|유아|돌|이유식|분유|기저귀|육아|어린이집|돌잔치|태교|태열|모유|수유|배앓이|황달|예방접종|발달|아토피|짜증|훈육|쪽쪽이)/,
    description: '신생아 영아 유아 아기 돌잔치 이유식 분유 기저귀 육아 어린이집 태교 모유수유 예방접종 발달 아토피' },
  { id: 'parenting_kids',  label: '육아 (초중고)',     icon: '🧒', affinityPattern: /(초등|중학생|고등학생|학원|학습지|과학|수학|영어|국어|논술|독서|체험학습|학교생활|학부모|시험|입시|진로)/,
    description: '초등학생 중학생 고등학생 학원 학습지 과학 수학 영어 국어 입시 학부모 시험 진로' },
  { id: 'beauty',          label: '뷰티/화장품',       icon: '💄', affinityPattern: /(화장품|선크림|클렌징|스킨|메이크업|쿠션|파운데이션|에센스|세럼|마스카라|아이라이너|립스틱|올영|올리브영|시카|미백|주름|모공|피부타입|색조|기초)/,
    description: '화장품 메이크업 스킨케어 클렌징 선크림 쿠션 파운데이션 에센스 세럼 립스틱 색조 기초 미백 주름 모공' },
  { id: 'fashion',         label: '패션/스타일',       icon: '👗', affinityPattern: /(코디|패션|운동화|스니커즈|가방|의류|옷|신발|매장|악세사리|쥬얼리|시계|모자|벨트|지갑|아우터|니트|원피스|블라우스)/,
    description: '패션 코디 옷 신발 가방 운동화 스니커즈 시계 액세서리 데일리룩 하객룩 아우터 니트 원피스' },
  { id: 'food',            label: '맛집/요리',         icon: '🍽️', affinityPattern: /(레시피|맛집|요리|음식|식당|배달|메뉴|간식|디저트|카페|브런치|와인|소주|맥주|커피|차|밀키트|반찬|국|찌개|구이|볶음|만들기|만드는법|조리법)/,
    description: '레시피 요리 음식 맛집 식당 배달 메뉴 간식 디저트 카페 브런치 만드는법 조리법 반찬 도시락' },
  { id: 'travel',          label: '여행/숙박',         icon: '✈️', affinityPattern: /(여행|호텔|항공|패키지|투어|렌트카|숙박|에어비앤비|일정|코스|당일치기|1박2일|2박3일|관광지|명소|입장료|예약|할인|에어텔|풀빌라|펜션|리조트)/,
    description: '여행 호텔 항공 패키지 숙박 에어비앤비 일정 코스 당일치기 관광지 명소 펜션 리조트 풀빌라 자유여행' },
  { id: 'health',          label: '건강/운동',         icon: '💪', affinityPattern: /(영양제|비타민|건강|운동|헬스|다이어트|요가|필라테스|스트레칭|러닝|마라톤|단백질|체중|체지방|근육|관절|허리|어깨|목)/,
    description: '건강 운동 헬스 다이어트 영양제 비타민 단백질 요가 필라테스 러닝 체중 근육 관절 통증' },
  { id: 'it',              label: 'IT/디지털',          icon: '💻', affinityPattern: /(노트북|스마트폰|아이폰|갤럭시|이어폰|키보드|마우스|어플|앱|소프트웨어|업데이트|설정|단축키|사용법|튜토리얼|입문|초보|시작하기|꿀팁|모니터|태블릿)/,
    description: 'IT 디지털 노트북 스마트폰 아이폰 갤럭시 태블릿 키보드 마우스 모니터 앱 단축키 사용법 설정' },
  { id: 'home',            label: '인테리어/생활',     icon: '🏠', affinityPattern: /(인테리어|가구|침대|소파|책상|식탁|조명|커튼|벽지|페인트|정리|수납|청소|세탁|살림|살림팁|주방|욕실|거실|침실|발코니)/,
    description: '인테리어 가구 침대 소파 책상 청소 정리 수납 세탁 살림 주방 욕실 거실 침실 인테리어 가전' },
  { id: 'pet',             label: '반려동물',          icon: '🐶', affinityPattern: /(강아지|고양이|반려견|반려묘|사료|간식|훈련|미용|건강|예방접종|중성화|입양|분양|동물병원|장난감|배변|털|목줄|하네스)/,
    description: '반려동물 강아지 고양이 사료 간식 훈련 미용 동물병원 분양 입양 배변 산책 장난감' },
  { id: 'finance',         label: '재테크/투자',       icon: '💰', affinityPattern: /(투자|주식|펀드|적금|예금|연금|ETF|배당|증권|환율|금리|이율|재테크|부수입|적립|배당주|성장주|가치투자|코인)/,
    description: '재테크 투자 주식 펀드 적금 예금 연금 ETF 배당 증권 금리 이율 신용카드 청약 청년도약계좌' },
  { id: 'education',       label: '교육/자격증',       icon: '📚', affinityPattern: /(자격증|시험|독학|기출|공무원|토익|토플|오픽|한국사|컴활|정보처리|기사|산업기사|간호조무사|요양보호사|사회복지사|공인중개사)/,
    description: '자격증 시험 공무원 토익 토플 오픽 컴퓨터활용능력 정보처리기사 한국사 간호조무사 공인중개사' },
  { id: 'auto',            label: '자동차',            icon: '🚗', affinityPattern: /(자동차|차량|운전|면허|정비|튜닝|타이어|엔진오일|배터리|점검|보험|중고차|신차|시승기|연비|주차|세차)/,
    description: '자동차 차량 운전 면허 정비 타이어 엔진오일 보험 중고차 신차 연비 주차 세차 전기차' },
  { id: 'culture',         label: '문화/엔터',         icon: '🎬', affinityPattern: /(영화|드라마|예능|연예인|배우|아이돌|콘서트|뮤지컬|연극|전시|공연|소설|에세이|만화|웹툰|애니|게임리뷰)/,
    description: '영화 드라마 예능 연예인 배우 아이돌 콘서트 뮤지컬 전시 공연 소설 에세이 웹툰 애니 넷플릭스' },
  { id: 'wedding',         label: '결혼/예식',         icon: '💒', affinityPattern: /(결혼|예식|웨딩|드레스|예물|예단|혼수|신혼여행|청첩장|상견례|허니문|웨딩홀|스튜디오|메이크업|한복)/,
    description: '결혼 예식 웨딩 드레스 예물 혼수 신혼여행 청첩장 상견례 웨딩홀 한복 신부 메이크업' },
  { id: 'realestate',      label: '부동산',            icon: '🏢', affinityPattern: /(아파트|빌라|오피스텔|청약|월세|전세|매매|시세|호가|등기|재건축|재개발|분양|분양권|입주|투자|시세|매물)/,
    description: '부동산 아파트 빌라 오피스텔 청약 월세 전세 매매 시세 재건축 재개발 분양 입주 등기 부동산투자' },
  { id: 'pregnancy',       label: '임신/출산',         icon: '🤰', affinityPattern: /(임신|태교|입덧|임신부|산모|출산|진통|제왕절개|자연분만|산후조리|모유수유|초기증상|중기|후기|태동|초음파)/,
    description: '임신 태교 입덧 임산부 산모 출산 진통 제왕절개 자연분만 산후조리 모유수유 임신초기 중기 후기' },
  { id: 'senior',          label: '시니어/노후',       icon: '👴', affinityPattern: /(노후|은퇴|연금|시니어|중장년|건강검진|치매|관절|당뇨|고혈압|콜레스테롤|혈압|혈당|보양식|건강식품)/,
    description: '노후 은퇴 연금 시니어 중장년 건강검진 치매 관절 당뇨 고혈압 혈압 혈당 보양식' },
  { id: 'sidejob',         label: '부업/N잡',          icon: '💼', affinityPattern: /(부업|N잡|투잡|재택|재택근무|블로그|애드센스|쿠팡파트너스|스마트스토어|중고거래|당근|크몽|아이디어스|에어비앤비호스트)/,
    description: '부업 N잡 투잡 재택근무 블로그 애드센스 쿠팡파트너스 스마트스토어 당근마켓 크몽 아이디어스' },
  { id: 'self',            label: '자기계발',          icon: '🎯', affinityPattern: /(독서|책|읽기|습관|루틴|시간관리|생산성|동기부여|마인드셋|글쓰기|회고|일기|목표|계획|성장)/,
    description: '자기계발 독서 책 습관 루틴 시간관리 생산성 동기부여 글쓰기 일기 목표 미라클모닝' },
];

export interface BloggerProfile {
  selectedCategories: BloggerCategoryId[]; // 최대 6개 (v2.49.30)
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'; // 연차 / 글 수 기반
  dailyVisitors: number;       // 일평균 방문자 (자기 신고)
  setupAt: number;             // 설정 timestamp
  blogUrl?: string;            // 선택사항
}

const FILE_NAME = 'blogger-profile.json';

function resolveUserDataPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Non-Electron verification runs fall through to APPDATA.
  }

  const appData = process.env['APPDATA'];
  if (appData) return path.join(appData, 'blogger-admin-panel');
  return path.join(process.cwd(), '.leword-user-data');
}

function getProfilePath(): string {
  const dir = path.join(resolveUserDataPath(), 'leword');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

export function loadBloggerProfile(): BloggerProfile | null {
  try {
    const p = getProfilePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as BloggerProfile;
  } catch (err) {
    console.error('[BLOGGER-PROFILE] 로드 실패:', err);
    return null;
  }
}

export function saveBloggerProfile(profile: BloggerProfile): void {
  try {
    fs.writeFileSync(getProfilePath(), JSON.stringify(profile, null, 2), 'utf8');
    console.log('[BLOGGER-PROFILE] ✅ 저장:', profile.selectedCategories.join(','));
  } catch (err) {
    console.error('[BLOGGER-PROFILE] 저장 실패:', err);
    throw err;
  }
}

export function deleteBloggerProfile(): void {
  const p = getProfilePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/**
 * 키워드가 사용자 카테고리에 속하는지 점수 산출 (regex 기반, sync)
 * +30: 강한 매칭
 * -15: 다른 전문 영역 매칭
 *  0: 중립
 */
export function calculateProfileAffinity(keyword: string, profile: BloggerProfile | null): number {
  if (!profile || profile.selectedCategories.length === 0) return 0;
  const clean = keyword.trim();

  for (const catId of profile.selectedCategories) {
    const cat = BLOGGER_CATEGORIES.find(c => c.id === catId);
    if (cat && cat.affinityPattern.test(clean)) {
      return 30;
    }
  }

  // v2.49.28: 전문 카테고리 페널티 -15 제거 (사용자 요구 "전체 다 나오게")
  //   기존: finance/realestate/health/it/auto/education 6개 중 선택 안 한 것 → -15
  //   문제: 사용자 카테고리 3개 제한 + 전문 6개 → 최소 3 카테고리 영구 페널티
  //   결과 부족 호소 → 페널티 0 (사용자 선택 카테고리만 +30 가산)
  //   품질 가드: 빅워드 / redOcean / dcEstimated 등 다른 게이트가 가짜 SSS 차단

  return 0;
}

/**
 * v2.43.44: 의미 임베딩 기반 친화도 (async, 모델 활성 시)
 * regex 매칭 실패한 키워드도 의미 매칭으로 보강
 * - 사용자 카테고리 description 과 cosine > 0.55 → +30
 * - ban 카테고리 description 과 cosine > 0.55 → -15
 * - regex 우선 (캐시 효과), 임베딩은 보완
 */
export async function calculateProfileAffinityAsync(
  keyword: string,
  profile: BloggerProfile | null,
): Promise<number> {
  // 1차: regex (빠른 경로)
  const regexScore = calculateProfileAffinity(keyword, profile);
  if (regexScore !== 0) return regexScore;
  if (!profile || profile.selectedCategories.length === 0) return 0;

  // 2차: 임베딩 (모델 활성 시만)
  try {
    const semantic = await import('./semantic-embedding');
    const status = semantic.getSemanticStatus();
    if (!status.ready) return 0;

    const myLabels = profile.selectedCategories
      .map(id => BLOGGER_CATEGORIES.find(c => c.id === id))
      .filter((c): c is BloggerCategoryInfo => !!c)
      .map(c => ({ id: c.id, description: c.description }));
    if (myLabels.length === 0) return 0;

    const best = await semantic.classifyByLabels(keyword, myLabels);
    if (best && best.similarity >= 0.55) {
      return 30;
    }

    // ban 카테고리 임베딩 검사
    const myCats = new Set(profile.selectedCategories);
    const expertIds: BloggerCategoryId[] = ['finance', 'realestate', 'health', 'it', 'auto', 'education'];
    const banLabels = expertIds
      .filter(id => !myCats.has(id))
      .map(id => BLOGGER_CATEGORIES.find(c => c.id === id))
      .filter((c): c is BloggerCategoryInfo => !!c)
      .map(c => ({ id: c.id, description: c.description }));
    if (banLabels.length > 0) {
      const banBest = await semantic.classifyByLabels(keyword, banLabels);
      if (banBest && banBest.similarity >= 0.6) {
        return -15;
      }
    }
  } catch (e: any) {
    // 임베딩 실패 시 regex 결과 (0) 그대로 반환
  }
  return 0;
}

/**
 * 사용자 경험 수준에 따른 키워드 난이도 페널티
 * 초보 블로거 (beginner): dc > 3000 → -10, dc > 8000 → -25
 * 중급 (intermediate): dc > 10000 → -10
 * 고급 (advanced): 페널티 없음
 */
export function experienceAdjustment(docCount: number, profile: BloggerProfile | null): number {
  if (!profile) return 0;
  if (profile.experienceLevel === 'beginner') {
    if (docCount > 8000) return -25;
    if (docCount > 3000) return -10;
  } else if (profile.experienceLevel === 'intermediate') {
    if (docCount > 10000) return -10;
  }
  return 0;
}
