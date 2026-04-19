/**
 * 검색 의도 분류 — 키워드가 어떤 의도로 검색되는지 자동 판정
 *
 * 4가지 의도:
 *   - buy:      구매/상품 선택 (추천·최저가·후기)
 *   - compare:  비교/검토 (vs·차이·뭐가·어떤게)
 *   - info:     정보 탐색 (효능·뜻·방법·원리)
 *   - brand:    브랜드·제품명 직접 탐색 (고유명 포함)
 *
 * 쇼핑 커넥트 활용:
 *   - buy/compare: 전환 스코어 +5 가점, 추천 적극
 *   - info: 추천 약화 (정보성은 상품 판매 전환 낮음)
 *   - brand: 해당 브랜드 상품 가중치
 */

export type SearchIntent = 'buy' | 'compare' | 'info' | 'brand';

export interface IntentAnalysis {
  primary: SearchIntent;
  scores: Record<SearchIntent, number>;
  signals: string[];  // 매칭된 패턴
  label: string;       // UI 표시용 라벨
  icon: string;
}

const BUY_PATTERNS = [
  '추천', '최저가', '가격', '할인', '쿠폰', '특가', '세일',
  '구매', '구입', '주문', '결제', '사는법', '사는곳',
  '판매처', '어디서', '파는곳',
  '베스트', '인기', '순위', '랭킹', 'top', 'TOP', '1위',
  '정품', '진품',
];

const COMPARE_PATTERNS = [
  'vs', 'VS', '차이', '뭐가', '어떤게', '어느게',
  '비교', '어느쪽', '다른점', '장단점',
  '대체', '대신',
];

const INFO_PATTERNS = [
  '효능', '효과', '부작용', '성분', '원료', '재료',
  '뜻', '의미', '정의', '개념', '원리', '이유',
  '종류', '유형', '분류',
  '방법', '하는법', '하는방법', '사용법', '이용법', '활용법',
  '기간', '언제', '며칠', '얼마나',
  '만드는법', '만들기',
];

const REVIEW_PATTERNS = [
  '후기', '리뷰', '사용기', '체험기', '솔직후기',
];

// "브랜드·제품명" 신호: 영문 대문자/숫자 조합이 있거나 2+글자 고유명사 패턴
function hasBrandSignal(keyword: string): boolean {
  // 영문+숫자 모델명 ("Galaxy S24", "iPhone 15" 등)
  if (/\b[A-Za-z]+\s*\d+\b/.test(keyword)) return true;
  // 영문 2글자 이상 대문자 시작 ("Nike Air", "QCY")
  if (/\b[A-Z][A-Za-z]{1,}\b/.test(keyword)) return true;
  return false;
}

function countMatches(kw: string, patterns: string[]): { count: number; matched: string[] } {
  const low = kw.toLowerCase();
  const matched: string[] = [];
  for (const p of patterns) {
    if (low.includes(p.toLowerCase())) matched.push(p);
  }
  return { count: matched.length, matched };
}

export function classifySearchIntent(keyword: string): IntentAnalysis {
  const kw = String(keyword || '').trim();

  const buy = countMatches(kw, BUY_PATTERNS);
  const compare = countMatches(kw, COMPARE_PATTERNS);
  const info = countMatches(kw, INFO_PATTERNS);
  const review = countMatches(kw, REVIEW_PATTERNS);
  const hasBrand = hasBrandSignal(kw);

  // 가중 스코어 (패턴별 가중치)
  const scores: Record<SearchIntent, number> = {
    buy: buy.count * 3 + review.count * 2,
    compare: compare.count * 3,
    info: info.count * 2,
    brand: hasBrand ? 5 : 0,
  };

  // 최고점 의도 (동점이면 buy > compare > brand > info)
  const priority: SearchIntent[] = ['buy', 'compare', 'brand', 'info'];
  let primary: SearchIntent = 'info'; // 기본값
  let maxScore = 0;
  for (const intent of priority) {
    if (scores[intent] > maxScore) {
      maxScore = scores[intent];
      primary = intent;
    }
  }

  // 모든 점수 0이면 구매도 정보도 아닌 일반 키워드 → 약한 buy로 판정 (쇼핑 검색 맥락)
  if (maxScore === 0) {
    primary = 'buy';
    scores.buy = 1;
  }

  const signals = [...buy.matched, ...compare.matched, ...info.matched, ...review.matched];
  if (hasBrand) signals.push('brand-signal');

  const labels: Record<SearchIntent, string> = {
    buy: '🛒 구매성',
    compare: '⚖️ 비교성',
    info: '📖 정보성',
    brand: '🏷️ 브랜드',
  };

  const icons: Record<SearchIntent, string> = {
    buy: '🛒',
    compare: '⚖️',
    info: '📖',
    brand: '🏷️',
  };

  return {
    primary,
    scores,
    signals,
    label: labels[primary],
    icon: icons[primary],
  };
}

/**
 * 의도별 쇼핑 커넥트 전환 보정치 (스코어링에 가산)
 *   구매성:   +5 (고전환, 추천 적극)
 *   비교성:   +3 (중전환, 비교표 가치)
 *   브랜드:   +4 (해당 브랜드 상품 우대)
 *   정보성:   -3 (저전환, 상품 판매보다 정보 제공)
 */
export function getIntentScoreAdjust(intent: SearchIntent): number {
  switch (intent) {
    case 'buy': return 5;
    case 'compare': return 3;
    case 'brand': return 4;
    case 'info': return -3;
    default: return 0;
  }
}
