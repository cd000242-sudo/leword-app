/**
 * 황금 키워드 분석기
 * 독자 행동을 유발하는 키워드를 우선순위로 추출
 */

export interface GoldenKeyword {
  keyword: string;
  goldenScore: number; // 0-100 (높을수록 좋음)
  actionTriggerScore: number; // 행동 유발 점수 (0-100)
  searchVolume: number; // 검색량 (모바일+PC 합산)
  documentCount: number; // 문서량 (검색 결과 수)
  volumeToDocRatio: number; // 검색량/문서량 비율 (낮을수록 황금 키워드)
  competition: '낮음' | '중' | '높음';
  difficulty: number; // 0-100 (높을수록 경쟁이 치열)
  category: string;
  relatedKeywords?: string[]; // 관련 키워드
  trends?: {
    changeRate: number; // 변화율
    trend: 'up' | 'down' | 'stable';
  };
}

/**
 * 행동 유발 키워드 패턴 (확장 버전)
 */
const ACTION_TRIGGER_PATTERNS = {
  // 방법/가이드 유형 (높은 전환률)
  high: [
    '방법', '하는법', '가이드', '팁', '꿀팁', '완전정복', '총정리', '핵심', '비법', '노하우', '실전',
    '신청방법', '신청', '등록방법', '등록', '가입방법', '가입', '설치방법', '설치', '다운로드방법',
    '사용방법', '사용법', '이용방법', '이용법', '활용방법', '활용법', '적용방법',
    '처음', '초보', '입문', '기초', '기본', '완벽', '완성', '성공', '실패없는'
  ],
  
  // 비교/추천 유형 (중간 전환률)
  medium: [
    '추천', '비교', '후기', '리뷰', '솔직', '가격', '비용', '무료', '할인', '최신', '신제품', '2025',
    '베스트', 'best', 'top', '인기', '순위', '랭킹', '추천순', '인기순', '판매순',
    '어떤', '무엇', '어디서', '어느', '선택', '고르기', '결정'
  ],
  
  // 정보/질문 유형 (낮은 전환률이지만 검색량 높음)
  low: [
    '이유', '원인', '장점', '단점', '장단점', '효과', '결과', '해결', '왜', '어떻게',
    '알아보기', '정리', '소개', '개요', '개념', '의미', '정의'
  ],
  
  // 시청/다시보기 유형 (높은 전환률)
  watch: [
    '다시보기', '재방송', '재생', '시청', '보기', '온라인', '스트리밍', '라이브', '생방송',
    'vod', 'video', '영상', '동영상', '클립', '하이라이트', '모음', '모아보기',
    '무료보기', '무료시청', '다운로드', '저장', '다운'
  ],
  
  // 금액/숫자 (높은 클릭률)
  numbers: [
    '3가지', '5가지', '7가지', '10가지', '만원', '원', '억', '조', '퍼센트', '%',
    '1위', '1등', '최고', '최대', '최소', '평균', '비율', '증가', '감소'
  ],
  
  // 긴급성/최신성 (높은 클릭률)
  urgency: [
    '지금', '바로', '즉시', '당장', '오늘', '내일', '주간', '월간', '최신', 'NEW',
    '한정', '특가', '할인', '이벤트', '공짜', '무료', '프로모션', '선착순',
    '마감임박', '종료', '마지막', '기회', '지금만', '오늘만'
  ],
  
  // 구매/구매행동 (높은 전환률)
  purchase: [
    '구매', '구매하기', '주문', '주문하기', '결제', '결제하기', '장바구니', '담기',
    '쿠폰', '할인코드', '적용', '혜택', '프리미엄', '무료체험', '체험하기',
    '예매', '예매하기', '예약', '예약하기', '티켓', '티켓구매', '티켓예매',
    '신청', '신청하기', '등록', '등록하기', '가입', '가입하기', '참여', '참여하기',
    '찜하기', '즐겨찾기', '저장하기', '공유하기', '알림설정', '알림받기'
  ]
};

/**
 * 행동 유발 점수 계산 (확장 버전)
 */
function calculateActionTriggerScore(keyword: string): number {
  let score = 0;
  const lowerKeyword = keyword.toLowerCase();
  
  // 높은 전환 패턴
  ACTION_TRIGGER_PATTERNS.high.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 30;
    }
  });
  
  // 시청/다시보기 패턴 (높은 전환률)
  ACTION_TRIGGER_PATTERNS.watch.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 25;
    }
  });
  
  // 구매/구매행동 패턴 (높은 전환률)
  ACTION_TRIGGER_PATTERNS.purchase.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 25;
    }
  });
  
  // 중간 전환 패턴
  ACTION_TRIGGER_PATTERNS.medium.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 15;
    }
  });
  
  // 긴급성/최신성 패턴
  ACTION_TRIGGER_PATTERNS.urgency.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 12;
    }
  });
  
  // 낮은 전환 패턴
  ACTION_TRIGGER_PATTERNS.low.forEach(pattern => {
    if (lowerKeyword.includes(pattern)) {
      score += 5;
    }
  });
  
  // 숫자 포함
  if (/\d/.test(keyword)) {
    score += 10;
  }
  
  // 긴 키워드 (꼬리 키워드) - 더 구체적일수록 높은 전환률
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 4) {
    score += 20; // 4단어 이상
  } else if (wordCount >= 3) {
    score += 15; // 3단어
  } else if (wordCount >= 2) {
    score += 8; // 2단어
  }
  
  // 최대 100점으로 제한
  return Math.min(score, 100);
}

/**
 * 경쟁도 분석 (검색량/문서량 비율 반영)
 */
function analyzeCompetition(keyword: string, searchVolume: number, documentCount: number): {
  competition: '낮음' | '중' | '높음';
  difficulty: number;
} {
  let difficulty = 50; // 기본값
  
  // 검색량 기준
  if (searchVolume > 100000) {
    difficulty += 30; // 검색량 높으면 경쟁 치열
  } else if (searchVolume > 10000) {
    difficulty += 15;
  } else if (searchVolume > 1000) {
    difficulty += 5;
  }
  
  // 검색량/문서량 비율 기준 (낮을수록 경쟁 낮음)
  const ratio = calculateVolumeToDocRatio(searchVolume, documentCount);
  if (ratio < 10) {
    difficulty -= 30; // 비율이 매우 낮으면 경쟁 매우 낮음
  } else if (ratio < 50) {
    difficulty -= 15; // 비율이 낮으면 경쟁 낮음
  } else if (ratio < 100) {
    difficulty -= 5; // 비율이 중간이면 약간 경쟁 낮음
  } else if (ratio > 500) {
    difficulty += 20; // 비율이 매우 높으면 경쟁 매우 치열
  } else if (ratio > 200) {
    difficulty += 10; // 비율이 높으면 경쟁 치열
  }
  
  // 키워드 길이 기준 (긴 키워드는 경쟁 낮음)
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 4) {
    difficulty -= 20;
  } else if (wordCount >= 3) {
    difficulty -= 10;
  } else if (wordCount >= 2) {
    difficulty -= 5;
  }
  
  // 행동 유발 키워드 포함 시 경쟁 증가
  const hasActionTrigger = ACTION_TRIGGER_PATTERNS.high.some(p => keyword.includes(p));
  if (hasActionTrigger) {
    difficulty += 5; // 인기 패턴이면 약간 경쟁 치열
  }
  
  // 범위 제한
  difficulty = Math.max(0, Math.min(100, difficulty));
  
  let competition: '낮음' | '중' | '높음';
  if (difficulty < 30) {
    competition = '낮음';
  } else if (difficulty < 60) {
    competition = '중';
  } else {
    competition = '높음';
  }
  
  return { competition, difficulty };
}

/**
 * 검색량/문서량 비율 계산
 * 낮을수록 황금 키워드 (검색량은 많지만 문서는 적음 = 경쟁 낮음)
 */
function calculateVolumeToDocRatio(searchVolume: number, documentCount: number): number {
  if (documentCount === 0 || searchVolume === 0) {
    return 999999; // 비율 계산 불가 (높은 값으로 처리하여 순위 하락)
  }
  
  // 비율 = 검색량 / 문서량 * 1000 (소수점 방지)
  // 예: 검색량 1000, 문서량 10000 → 비율 0.1 → 100
  // 낮을수록 좋음 (검색량 대비 문서가 적음 = 경쟁 낮음)
  const ratio = (searchVolume / documentCount) * 1000;
  
  return Math.round(ratio * 100) / 100; // 소수점 2자리
}

/**
 * 황금 점수 계산 (검색량/문서량 비율 반영)
 */
function calculateGoldenScore(
  actionTriggerScore: number,
  searchVolume: number,
  documentCount: number,
  _competition: '낮음' | '중' | '높음', // 언더스코어로 미사용 표시
  difficulty: number
): number {
  // 행동 유발 점수 35%
  let score = actionTriggerScore * 0.35;
  
  // 검색량 25% (로그 스케일)
  const volumeScore = Math.min(100, Math.log10(Math.max(1, searchVolume)) * 20);
  score += volumeScore * 0.25;
  
  // 검색량/문서량 비율 25% (낮을수록 좋음)
  const volumeToDocRatio = calculateVolumeToDocRatio(searchVolume, documentCount);
  // 비율이 낮을수록 높은 점수 (최대 1000 기준으로 역산)
  const ratioScore = Math.max(0, 100 - (volumeToDocRatio / 10)); // 비율 100 이하면 90점 이상
  score += ratioScore * 0.25;
  
  // 경쟁도 15% (낮을수록 좋음)
  const competitionScore = (100 - difficulty);
  score += competitionScore * 0.15;
  
  return Math.round(Math.min(100, score));
}

/**
 * 문서량 추정 (검색 결과 수)
 * 실제 검색 결과 페이지에서 나오는 문서 수를 추정
 */
function estimateDocumentCount(
  searchVolume: number,
  keyword: string,
  actionTriggerScore: number
): number {
  // 기본 문서량 추정 (검색량 기반)
  let docCount = searchVolume;
  
  // 검색량이 없으면 키워드 특성 기반 추정
  if (!searchVolume || searchVolume === 0) {
    // 단어 수에 따라 추정
    const wordCount = keyword.split(/\s+/).length;
    if (wordCount === 1) {
      docCount = 10000000; // 1단어는 많은 문서
    } else if (wordCount === 2) {
      docCount = 500000; // 2단어
    } else if (wordCount === 3) {
      docCount = 50000; // 3단어
    } else {
      docCount = 5000; // 4단어 이상
    }
    
    // 행동 유발 키워드 포함 시 문서량 증가
    if (actionTriggerScore > 50) {
      docCount *= 2; // 행동 유발 키워드는 검색 결과 많음
    }
  }
  
  // 검색량을 문서량으로 변환 (검색량의 10배 가정)
  // 실제로는 검색량과 문서량은 다르지만, 대략적인 추정
  if (searchVolume > 0) {
    docCount = Math.floor(searchVolume * 10);
  }
  
  // 행동 유발 점수가 높을수록 문서량도 많음 (인기 키워드)
  const multiplier = 1 + (actionTriggerScore / 200); // 최대 1.5배
  docCount = Math.floor(docCount * multiplier);
  
  return docCount;
}

/**
 * 황금 키워드 분석 및 우선순위 추출
 */
export function analyzeGoldenKeywords(
  keywords: Array<{
    keyword: string;
    pcSearchVolume?: number;
    mobileSearchVolume?: number;
    searchVolume?: number;
    changeRate?: number;
    category?: string;
    rank?: number;
    documentCount?: number;
  }>
): Array<GoldenKeyword & { pcSearchVolume?: number; mobileSearchVolume?: number; documentCount?: number }> {
  const goldenKeywords: Array<GoldenKeyword & { pcSearchVolume?: number; mobileSearchVolume?: number; documentCount?: number }> = [];
  
  keywords.forEach(item => {
    const keyword = item.keyword.trim();
    if (!keyword || keyword.length < 2) return;
    
    // 행동 유발 점수 계산
    const actionTriggerScore = calculateActionTriggerScore(keyword);
    
    // 검색량 (PC/모바일 분리 또는 합산)
    const pcSearchVolume = item.pcSearchVolume || 0;
    const mobileSearchVolume = item.mobileSearchVolume || 0;
    const searchVolume = pcSearchVolume + mobileSearchVolume || item.searchVolume || estimateSearchVolume(keyword);
    
    // 문서량 (제공되면 사용, 없으면 추정)
    const documentCount = item.documentCount || estimateDocumentCount(searchVolume, keyword, actionTriggerScore);
    
    // 검색량/문서량 비율 계산
    const volumeToDocRatio = calculateVolumeToDocRatio(searchVolume, documentCount);
    
    // 경쟁도 분석 (문서량도 고려)
    const { competition, difficulty } = analyzeCompetition(keyword, searchVolume, documentCount);
    
    // 황금 점수 계산 (검색량/문서량 비율 반영)
    const goldenScore = calculateGoldenScore(actionTriggerScore, searchVolume, documentCount, competition, difficulty);
    
    // 트렌드 분석
    const trends = item.changeRate ? {
      changeRate: item.changeRate,
      trend: item.changeRate > 10 ? 'up' as const : 
             item.changeRate < -10 ? 'down' as const : 'stable' as const
    } : {
      changeRate: 0,
      trend: 'stable' as const
    };
    
    goldenKeywords.push({
      keyword,
      goldenScore,
      actionTriggerScore,
      searchVolume,
      pcSearchVolume,
      mobileSearchVolume,
      documentCount,
      volumeToDocRatio,
      competition,
      difficulty,
      category: item.category || '일반',
      trends
    } as any);
  });
  
  // 황금 점수 기준 내림차순 정렬
  return goldenKeywords.sort((a, b) => b.goldenScore - a.goldenScore) as Array<GoldenKeyword & { pcSearchVolume?: number; mobileSearchVolume?: number; documentCount?: number }>;
}

/**
 * 검색량 추정 (키워드 길이와 패턴 기반)
 */
function estimateSearchVolume(keyword: string): number {
  // 기본 검색량 추정
  let volume = 1000;
  
  // 단어 수에 따라 추정
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount === 1) {
    volume = 50000; // 1단어 키워드는 검색량 높음
  } else if (wordCount === 2) {
    volume = 10000; // 2단어
  } else if (wordCount === 3) {
    volume = 3000; // 3단어
  } else {
    volume = 500; // 4단어 이상
  }
  
  // 행동 유발 키워드 포함 시 검색량 증가
  const hasActionTrigger = ACTION_TRIGGER_PATTERNS.high.some(p => keyword.includes(p));
  if (hasActionTrigger) {
    volume *= 2;
  }
  
  // 중간 패턴 포함 시 약간 증가
  const hasMediumPattern = ACTION_TRIGGER_PATTERNS.medium.some(p => keyword.includes(p));
  if (hasMediumPattern) {
    volume *= 1.5;
  }
  
  return Math.floor(volume);
}

/**
 * 관련 키워드 생성 (행동 유발 키워드 추가)
 */
export function generateActionTriggerVariations(baseKeyword: string): string[] {
  const variations: string[] = [];
  
  // 높은 전환 패턴 추가
  ACTION_TRIGGER_PATTERNS.high.forEach(pattern => {
    variations.push(`${baseKeyword} ${pattern}`);
    variations.push(`${pattern} ${baseKeyword}`);
  });
  
  // 시청/다시보기 패턴 추가
  ACTION_TRIGGER_PATTERNS.watch.forEach(pattern => {
    variations.push(`${baseKeyword} ${pattern}`);
    variations.push(`${pattern} ${baseKeyword}`);
  });
  
  // 구매/구매행동 패턴 추가
  ACTION_TRIGGER_PATTERNS.purchase.forEach(pattern => {
    variations.push(`${baseKeyword} ${pattern}`);
  });
  
  // 중간 전환 패턴 추가
  ACTION_TRIGGER_PATTERNS.medium.forEach(pattern => {
    variations.push(`${baseKeyword} ${pattern}`);
  });
  
  // 긴급성/최신성 패턴 추가
  ACTION_TRIGGER_PATTERNS.urgency.forEach(pattern => {
    variations.push(`${baseKeyword} ${pattern}`);
  });
  
  // 중복 제거 후 반환
  const unique = [...new Set(variations)];
  return unique.slice(0, 20); // 최대 20개
}

