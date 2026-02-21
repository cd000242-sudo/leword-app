/**
 * 🔥 Traffic Keyword Hunter Patterns & Weights Data
 */

export const REALTIME_SOURCE_WEIGHT: Record<string, number> = {
    'google': 1.2,    // 구글트렌드 (글로벌/IT 강세)
    'nate': 1.1,      // 네이트 (실시간 이슈 강세)
    'zum': 1.05,     // 줌 (생활/정치 이슈)
    'daum': 1.1,      // 다음 (뉴스/중장년층)
    'naver': 1.0      // 네이버 (기준점)
};

export const MONETIZATION_PATTERNS = {
    purchase: ['가격', '비용', '얼마', '최저가', '할인', '쿠폰', '세일', '구매', '구입', '주문'],
    comparison: ['비교', 'vs', '차이', '뭐가', '어떤게', '추천', '순위', '랭킹', 'TOP', '베스트'],
    review: ['후기', '리뷰', '사용기', '체험', '솔직', '장단점', '단점', '장점'],
    info: ['방법', '하는법', '뜻', '의미', '종류', '기간', '조건', '자격', '서류', '절차'],
    problem: ['해결', '안될때', '오류', '에러', '실패', '안되면', '못할때'],
    location: ['근처', '주변', '동네', '지역', '어디', '위치'],
};

export const CPC_DATA: Record<string, { min: number; max: number; avg: number }> = {
    '보험': { min: 800, max: 3000, avg: 1500 },
    '대출': { min: 700, max: 2500, avg: 1200 },
    '카드': { min: 600, max: 2000, avg: 1000 },
    '금융': { min: 500, max: 1800, avg: 900 },
    '투자': { min: 500, max: 1500, avg: 800 },
    '주식': { min: 400, max: 1200, avg: 700 },
    '부동산': { min: 500, max: 1500, avg: 850 },
    '법률': { min: 600, max: 2000, avg: 1100 },
    '변호사': { min: 700, max: 2500, avg: 1300 },
    '세무': { min: 500, max: 1500, avg: 800 },
    '회계': { min: 400, max: 1200, avg: 700 },
    '성형': { min: 500, max: 2000, avg: 1000 },
    '치과': { min: 400, max: 1500, avg: 800 },
    '피부과': { min: 400, max: 1200, avg: 700 },
    '병원': { min: 300, max: 1000, avg: 550 },
    '자동차': { min: 300, max: 800, avg: 500 },
    '중고차': { min: 350, max: 900, avg: 550 },
    '전기차': { min: 300, max: 700, avg: 450 },
    '교육': { min: 250, max: 700, avg: 400 },
    '학원': { min: 300, max: 800, avg: 450 },
    '영어': { min: 300, max: 700, avg: 450 },
    '토익': { min: 300, max: 800, avg: 500 },
    '자격증': { min: 250, max: 600, avg: 380 },
    '취업': { min: 300, max: 700, avg: 450 },
    '이직': { min: 350, max: 800, avg: 500 },
    '면접': { min: 300, max: 700, avg: 450 },
    '결혼': { min: 300, max: 800, avg: 480 },
    '웨딩': { min: 350, max: 900, avg: 550 },
    '인테리어': { min: 300, max: 700, avg: 450 },
    '이사': { min: 250, max: 600, avg: 380 },
    '가전': { min: 200, max: 500, avg: 320 },
    '노트북': { min: 250, max: 600, avg: 380 },
    '스마트폰': { min: 200, max: 500, avg: 320 },
    '여행': { min: 150, max: 400, avg: 250 },
    '호텔': { min: 200, max: 500, avg: 300 },
    '항공': { min: 200, max: 450, avg: 280 },
    '맛집': { min: 100, max: 300, avg: 180 },
    '카페': { min: 80, max: 250, avg: 150 },
    '다이어트': { min: 200, max: 500, avg: 300 },
    '운동': { min: 150, max: 400, avg: 250 },
    '헬스': { min: 150, max: 400, avg: 250 },
    '화장품': { min: 150, max: 400, avg: 250 },
    '패션': { min: 100, max: 300, avg: 180 },
    '쇼핑': { min: 100, max: 300, avg: 180 },
    '육아': { min: 150, max: 400, avg: 250 },
    '임신': { min: 200, max: 500, avg: 300 },
    '반려동물': { min: 150, max: 350, avg: 220 },
    '강아지': { min: 120, max: 300, avg: 200 },
    '고양이': { min: 120, max: 300, avg: 200 },
    '게임': { min: 50, max: 200, avg: 100 },
    '영화': { min: 50, max: 150, avg: 90 },
    '드라마': { min: 50, max: 150, avg: 90 },
    '음악': { min: 40, max: 120, avg: 70 },
    '요리': { min: 60, max: 180, avg: 100 },
    '레시피': { min: 60, max: 180, avg: 100 },
};
