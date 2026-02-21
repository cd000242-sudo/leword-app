export const ENHANCED_CATEGORY_GOLDEN_KEYWORDS: Record<string, {
  seeds: string[];
  profitPatterns: string[];
  minCPC: number;
}> = {
  finance: {
    seeds: [
      '연금저축 IRP 비교',
      'ISA 계좌 장단점',
      '청년도약계좌 조건',
      '적금 금리 비교',
      '신용점수 올리는법',
      'ETF 배당금',
      '주식 용어 정리',
      '재테크 초보',
      '부업 추천'
    ],
    profitPatterns: ['비교', '조건', '금리', '한도', '계산', '방법'],
    minCPC: 1000
  },
  health: {
    seeds: [
      '루테인 지아잔틴 차이',
      '밀크씨슬 실리마린 효능',
      '프로바이오틱스 CFU 뜻',
      '마그네슘 종류 차이',
      '오메가3 rTG 차이',
      '콜라겐 분자량 흡수율',
      '비타민D3 K2 함께',
      '코엔자임Q10 유비퀴놀'
    ],
    profitPatterns: ['효능', '부작용', '복용법', '차이', '비교', '추천'],
    minCPC: 500
  },
  it: {
    seeds: [
      '노트북 추천 가성비',
      '사무용 노트북 비교',
      '모니터 추천 용도별',
      '기계식 키보드 축',
      '무선 이어폰 비교',
      '외장 SSD 추천'
    ],
    profitPatterns: ['추천', '비교', '가성비', '순위', '리뷰', '차이'],
    minCPC: 300
  },
  beauty: {
    seeds: [
      '레티놀 농도 초보자',
      '비타민C 세럼 순서',
      '나이아신아마이드 효과',
      '세라마이드 크림 건성',
      'AHA BHA 차이 피부타입',
      '선크림 무기자차 유기자차'
    ],
    profitPatterns: ['추천', '순서', '성분', '효과', '비교', '피부타입'],
    minCPC: 250
  },
  travel: {
    seeds: [
      '제주도 숙소 추천 가성비',
      '오사카 맛집 로컬',
      '도쿄 교통패스 비교',
      '베트남 여행 코스',
      '국내여행 당일치기 추천',
      '혼자 여행 좋은곳'
    ],
    profitPatterns: ['추천', '가성비', '코스', '일정', '비용', '맛집'],
    minCPC: 250
  },
  parenting: {
    seeds: [
      '유모차 추천 가성비',
      '분유 비교 성분',
      '기저귀 추천 피부',
      '아기띠 종류 차이',
      '이유식 시작 시기',
      '육아용품 필수'
    ],
    profitPatterns: ['추천', '비교', '시기', '방법', '가격', '후기'],
    minCPC: 250
  },
  interior: {
    seeds: [
      '수납장 추천 좁은방',
      '시스템행거 설치',
      '원룸 인테리어 꿀팁',
      '가구 배치 좁은집',
      '조명 종류 분위기',
      '정리수납 방법'
    ],
    profitPatterns: ['추천', '설치', '꿀팁', '방법', 'DIY', '가성비'],
    minCPC: 300
  },
  review: {
    seeds: [
      '가전 추천',
      '가성비 추천',
      '비교 추천',
      '실사용 후기',
      '장단점 정리',
      '언박싱 후기'
    ],
    profitPatterns: ['추천', '비교', '후기', '리뷰', '장단점', '가격'],
    minCPC: 200
  },
  recipe: {
    seeds: [
      '에어프라이어 레시피',
      '다이어트 레시피',
      '자취 요리 레시피',
      '간단 요리 만들기',
      '밀키트 추천',
      '간식 만들기'
    ],
    profitPatterns: ['레시피', '만들기', '방법', '추천', '비교', '재료'],
    minCPC: 120
  },
  business: {
    seeds: [
      '연말정산 환급금 조회',
      '연말정산 간소화',
      '청약 가점 계산',
      '사업자등록 방법',
      '부가세 신고 방법',
      '소상공인 지원금 신청',
      '사업자등록 비용',
      '부가세 신고 대행 비용',
      '세무사 비용',
      '세무사 추천',
      '법인설립 비용',
      '상표등록 비용',
      '상표등록 대행',
      '상표등록 대행 비용',
      '상표등록 대행 추천',
      '상표등록 수수료',
      '법인설립 대행 비용',
      '법인설립 대행 추천',
      '부가세 신고 프로그램 가격',
      '부가세 신고 프로그램 추천',
      '전자세금계산서 발행 방법',
      '전자세금계산서 발행 비용',
      '세무기장 비용',
      '세무기장 대행 추천',
      '소상공인 정책자금 신청',
      '정책자금 신청 조건',
      '스마트스토어 창업 비용',
      '쿠팡 판매자 등록 방법'
    ],
    profitPatterns: ['신청', '조건', '방법', '계산', '서류', '기간', '비용', '가격', '대행', '추천', '후기'],
    minCPC: 350
  },
  self_development: {
    seeds: [
      '자기계발 강의 추천',
      '온라인 강의 추천',
      '국비지원 교육 신청',
      '부트캠프 추천',
      '부트캠프 후기',
      '코딩 부트캠프 비용',
      '자격증 인강 추천',
      '자격증 인강 가격',
      '노션 강의 추천',
      '노션 강의 가격',
      '독서모임 신청',
      '퍼스널 코칭 가격',
      '커리어 코칭 비용',
      '면접 코칭 가격',
      '자기소개서 첨삭 비용',
      '토익 인강 할인',
      '토익 인강 할인코드',
      '컴활 1급 인강 할인',
      '컴활 인강 할인쿠폰',
      'ADSP 인강 추천',
      'ADSP 인강 가격',
      'SQLD 인강 추천',
      'SQLD 인강 가격',
      '정보처리기사 인강 추천',
      '정보처리기사 인강 할인',
      '국비지원 부트캠프 신청',
      '내일배움카드 신청 방법',
      '내일배움카드 온라인 신청',
      '내일배움카드 자부담 비용',
      '패스트캠퍼스 할인',
      '패스트캠퍼스 쿠폰',
      '인프런 할인코드',
      '인프런 쿠폰',
      '클래스101 할인',
      '클래스101 쿠폰',
      '노션 템플릿 판매',
      '노션 템플릿 가격',
      '생산성 앱 추천',
      '생산성 앱 가격',
      '영어회화 수강권 가격',
      '영어회화 수강권 추천'
    ],
    profitPatterns: ['추천', '후기', '비교', '가격', '비용', '할인', '쿠폰', '신청', '수강'],
    minCPC: 300
  },
  sports: {
    seeds: [
      '운동화 추천',
      '러닝화 추천',
      '홈트 기구 추천',
      '요가매트 추천',
      '헬스 장갑 추천',
      '스트레칭 방법'
    ],
    profitPatterns: ['추천', '비교', '가성비', '순위', '후기', '방법'],
    minCPC: 120
  },
  education: {
    seeds: [
      '토익 공부법 독학',
      '컴활 1급 기출',
      '정보처리기사 합격률',
      '공인중개사 난이도',
      '자격증 추천 취업',
      '인강 추천 분야별'
    ],
    profitPatterns: ['공부법', '합격', '독학', '추천', '비교', '후기'],
    minCPC: 400
  },
  pet: {
    seeds: [
      '강아지 사료 추천 나이별',
      '고양이 간식 성분',
      '펫 보험 비교',
      '강아지 영양제 효과',
      '고양이 화장실 종류',
      '반려동물 등록 방법'
    ],
    profitPatterns: ['추천', '비교', '효과', '방법', '가격', '성분'],
    minCPC: 200
  },
  life: {
    seeds: [
      '전기세 아끼는법',
      '가스비 절약 꿀팁',
      '통신비 절약 방법',
      '보험료 줄이는법',
      '생활비 절약 가계부',
      '청소 꿀팁 빠르게'
    ],
    profitPatterns: ['방법', '꿀팁', '절약', '아끼는법', '줄이는법'],
    minCPC: 150
  },
  life_tips: {
    seeds: [
      '전기세 아끼는법',
      '가스비 절약 꿀팁',
      '통신비 절약 방법',
      '냉장고 정리 꿀팁',
      '옷장 정리 방법',
      '욕실 청소 꿀팁'
    ],
    profitPatterns: ['방법', '꿀팁', '절약', '정리', '청소'],
    minCPC: 150
  },
  celeb: {
    seeds: [
      '아이돌 컴백 일정',
      '콘서트 티켓 예매',
      '팬미팅 신청 방법',
      '굿즈 구매처',
      '콘서트 티켓팅 연습',
      '콘서트 티켓팅 꿀팁',
      '팬클럽 가입 방법',
      '팬클럽 가입비',
      '팬미팅 예매',
      '공연 예매처',
      '공연 취소표',
      '굿즈 예약 구매'
    ],
    profitPatterns: ['예매', '티켓팅', '신청', '방법', '구매', '구매처', '가격', '후기'],
    minCPC: 50
  },
  fashion: {
    seeds: [
      '퍼스널컬러 진단',
      '퍼스널컬러 진단 가격',
      '퍼스널컬러 진단 비용',
      '퍼스널컬러 진단 후기',
      '스타일링 컨설팅 가격',
      '스타일링 컨설팅 후기',
      '코디 추천',
      '옷 쇼핑몰 추천',
      '남성전문미용실',
      '미용실 추천',
      '미용실 예약',
      '염색 가격',
      '펌 가격',
      '네일아트 가격',
      '왁싱 가격'
    ],
    profitPatterns: ['예약', '가격', '비용', '추천', '후기', '비교', '할인', '쿠폰'],
    minCPC: 200
  },
  all: {
    seeds: ['추천', '비교', '순위', '후기', '가격', '방법', '하는법', '가성비', '장단점', '차이', '효과', '부작용'],
    profitPatterns: ['추천', '비교', '방법', '후기', '가격'],
    minCPC: 150
  }
};

export function getEnhancedCategoryGoldenKeywords(category: string): string[] {
  const config = ENHANCED_CATEGORY_GOLDEN_KEYWORDS[category] || ENHANCED_CATEGORY_GOLDEN_KEYWORDS.all;

  const combined: string[] = [];

  for (const seed of config.seeds) {
    combined.push(seed);
  }

  for (const seed of config.seeds) {
    for (const pattern of config.profitPatterns) {
      if (!seed.includes(pattern)) {
        combined.push(`${seed} ${pattern}`);
      }
    }
  }

  const year = new Date().getFullYear();
  for (const seed of config.seeds.slice(0, 5)) {
    combined.push(`${year} ${seed}`);
    combined.push(`${seed} ${year}`);
  }

  const targets = ['초보자', '입문자', '직장인', '학생'];
  for (const seed of config.seeds.slice(0, 3)) {
    for (const target of targets) {
      combined.push(`${target} ${seed}`);
    }
  }

  return Array.from(new Set(combined));
}

export function isRealBlueOcean(
  searchVolume: number,
  documentCount: number,
  goldenRatio: number,
  estimatedCPC: number
): boolean {
  if (searchVolume < 300) return false;
  if (documentCount > 2000) return false;
  if (goldenRatio < 1.0) return false;
  if (estimatedCPC < 150) return false;
  return true;
}
