/**
 * 🆕 제목 분석기 - 상위노출 제목 분석 및 추천
 * 
 * 기능:
 * 1. 상위노출 글 제목에서 핵심키워드/서브키워드 추출
 * 2. 가나다순 노출 로직 분석
 * 3. 상위노출 가능한 제목 추천
 */

import { TitleAnalysis, RecommendedTitle, TitleStrategyAnalysis } from './types';
import { classifyKeyword } from '../categories';

// 한글 초성 순서 (가나다순)
const KOREAN_CHOSUNG = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const KOREAN_SYLLABLE_START = 0xAC00; // '가'
const KOREAN_SYLLABLE_END = 0xD7A3;   // '힣'

/**
 * 한글 초성 추출
 */
function getChosung(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= KOREAN_SYLLABLE_START && code <= KOREAN_SYLLABLE_END) {
    const chosungIndex = Math.floor((code - KOREAN_SYLLABLE_START) / 588);
    return KOREAN_CHOSUNG[chosungIndex];
  }
  return char;
}

/**
 * 가나다순 순서 계산 (낮을수록 앞)
 */
function getCharOrder(char: string): number {
  const firstChar = char.charAt(0);
  
  // 숫자 (가장 앞)
  if (/[0-9]/.test(firstChar)) {
    return parseInt(firstChar);
  }
  
  // 한글
  const code = firstChar.charCodeAt(0);
  if (code >= KOREAN_SYLLABLE_START && code <= KOREAN_SYLLABLE_END) {
    return 10 + (code - KOREAN_SYLLABLE_START);
  }
  
  // 영어 (한글 뒤)
  if (/[a-zA-Z]/.test(firstChar)) {
    return 100000 + firstChar.toLowerCase().charCodeAt(0);
  }
  
  // 특수문자 (맨 뒤)
  return 200000 + code;
}

/**
 * 제목에서 키워드 추출
 * 
 * 🔥 개선: 검색 키워드가 제목에 포함된 경우에만 서브키워드 추출
 */
function extractKeywordsFromTitle(title: string, searchKeyword: string): { core: string; subs: string[]; isRelevant: boolean } {
  const cleanTitle = title.replace(/[^\w\s가-힣]/g, ' ').trim();
  const lowerTitle = cleanTitle.toLowerCase();
  const lowerKeyword = searchKeyword.toLowerCase().replace(/\s+/g, '');
  
  // 🔥 검색 키워드가 제목에 포함되어 있는지 확인
  const searchWords = searchKeyword.split(/\s+/);
  const hasKeyword = searchWords.every(sw => 
    lowerTitle.includes(sw.toLowerCase())
  ) || lowerTitle.replace(/\s+/g, '').includes(lowerKeyword);
  
  // 검색 키워드가 없으면 관련 없는 제목
  if (!hasKeyword) {
    return { core: searchKeyword, subs: [], isRelevant: false };
  }
  
  const words = cleanTitle.split(/\s+/).filter(w => w.length >= 2);
  
  // 핵심 키워드: 검색 키워드와 일치하는 부분
  let coreKeyword = searchKeyword;
  
  // 서브 키워드: 검색 키워드 외의 의미있는 단어들
  const subKeywords: string[] = [];
  
  // 🔥 제외할 단어들 (의미없는 단어 + 일반적인 블로그/카페 관련 단어)
  const excludeWords = [
    // 조사/접속사/대명사
    '의', '를', '을', '이', '가', '에', '는', '은', '로', '으로', '와', '과', '및', '등', '더', '한', '된', '하는', '있는',
    '이게', '저게', '그게', '이거', '저거', '그거', '이건', '저건', '그건', '뭐가', '어디', '언제', '어떻게', '왜',
    '진짜', '정말', '완전', '너무', '매우', '아주', '엄청', '대박', '최고', '최악',
    // 형용사/부사/일반 명사
    '좁은', '넓은', '작은', '큰', '좋은', '나쁜', '새로운', '오래된', '예쁜', '멋진', '싼', '비싼',
    '블랙', '화이트', '그레이', '베이지', '브라운', '레드', '블루', '그린', '핑크',
    '분위기', '바꾼', '살려줄', '폭신한', '구경', '추천템', '가지', '가구',
    // 블로그/카페 관련
    '카페', '블로그', '공식', '동호회', '클럽', '네이버', '쇼핑', '라이브', '인포머셜', '홈쇼핑', '해결사',
    '플리마켓', '수입', '키즈', '패션', '맘스', '홀릭', '육아', '생활정보', '체험단', '이벤트', '중고거래',
    '매일이', '여행', '로그', '일상', '기록', '리뷰', '후기', '추천', '정리', '비교', '분석',
    // 일반적인 수식어
    'NO', 'NEW', 'PRO', 'MAX', 'TOP', 'BEST'
  ];
  
  for (let word of words) {
    // 끝에 붙은 조사 제거
    word = word.replace(/(에|를|을|이|가|는|은|로|의|와|과)$/, '');
    if (word.length < 2) continue;
    
    // 검색 키워드에 포함되지 않은 단어
    const isSearchWord = searchWords.some(sw => 
      word.toLowerCase().includes(sw.toLowerCase()) || 
      sw.toLowerCase().includes(word.toLowerCase())
    );
    
    if (!isSearchWord) {
      // 제외 단어가 아니고, 2글자 이상인 경우만
      if (!excludeWords.includes(word) && !excludeWords.includes(word.toUpperCase()) && word.length >= 2) {
        subKeywords.push(word);
      }
    }
  }
  
  return { core: coreKeyword, subs: [...new Set(subKeywords)].slice(0, 5), isRelevant: true };
}

/**
 * 제목 구조 분석
 */
function analyzeStructure(title: string, searchKeyword: string): string {
  const keywordPos = title.indexOf(searchKeyword);
  const titleLength = title.length;
  
  if (keywordPos === -1) {
    // 키워드가 분리되어 있을 수 있음
    const searchWords = searchKeyword.split(/\s+/);
    const hasAllWords = searchWords.every(w => title.includes(w));
    if (hasAllWords) {
      return '키워드 분산형';
    }
    return '키워드 미포함';
  }
  
  const relativePos = keywordPos / titleLength;
  
  if (relativePos < 0.2) {
    return '키워드 선두형 (SEO 최적)';
  } else if (relativePos < 0.5) {
    return '키워드 중앙형';
  } else {
    return '키워드 후미형';
  }
}

/**
 * 제목 강도 점수 계산
 */
function calculateTitleStrength(title: string, searchKeyword: string): { score: number; strong: string[]; weak: string[] } {
  let score = 50;
  const strongPoints: string[] = [];
  const weakPoints: string[] = [];
  
  // 1. 키워드 위치 (앞에 있을수록 좋음)
  const keywordPos = title.indexOf(searchKeyword);
  if (keywordPos === 0) {
    score += 20;
    strongPoints.push('키워드가 제목 맨 앞에 위치');
  } else if (keywordPos > 0 && keywordPos < title.length * 0.3) {
    score += 10;
    strongPoints.push('키워드가 제목 앞부분에 위치');
  } else if (keywordPos === -1) {
    score -= 15;
    weakPoints.push('키워드가 제목에 정확히 포함되지 않음');
  } else {
    weakPoints.push('키워드가 제목 뒷부분에 위치');
  }
  
  // 2. 제목 길이 (30~50자가 최적)
  if (title.length >= 30 && title.length <= 50) {
    score += 10;
    strongPoints.push(`적절한 제목 길이 (${title.length}자)`);
  } else if (title.length < 20) {
    score -= 10;
    weakPoints.push(`제목이 너무 짧음 (${title.length}자)`);
  } else if (title.length > 60) {
    weakPoints.push(`제목이 너무 김 (${title.length}자)`);
  }
  
  // 3. 숫자 포함 (클릭률 향상)
  if (/\d+/.test(title)) {
    score += 5;
    strongPoints.push('숫자 포함 (클릭률 향상)');
  }
  
  // 4. 특수문자/이모지 (눈에 띔)
  if (/[!?★☆♥♡✓✔]/.test(title)) {
    score += 3;
    strongPoints.push('특수문자로 시선 집중');
  }
  
  // 5. 연도 포함 (최신성)
  const currentYear = new Date().getFullYear();
  if (title.includes(String(currentYear)) || title.includes(String(currentYear + 1))) {
    score += 8;
    strongPoints.push('최신 연도 포함');
  }
  
  // 6. 후기/추천/비교 등 구매의도 키워드
  const buyIntentWords = ['추천', '후기', '비교', '순위', '베스트', 'TOP', '가성비', '꿀팁', '방법', '하는법'];
  const hasBuyIntent = buyIntentWords.some(w => title.includes(w));
  if (hasBuyIntent) {
    score += 7;
    strongPoints.push('구매의도 키워드 포함');
  }
  
  return { score: Math.min(100, Math.max(0, score)), strong: strongPoints, weak: weakPoints };
}

/**
 * 단일 제목 분석
 */
export function analyzeTitle(title: string, searchKeyword: string): TitleAnalysis {
  const { core, subs, isRelevant } = extractKeywordsFromTitle(title, searchKeyword);
  const structure = analyzeStructure(title, searchKeyword);
  const { score, strong, weak } = calculateTitleStrength(title, searchKeyword);
  const firstChar = title.charAt(0);
  
  // 🔥 관련 없는 제목이면 강도 점수 0
  const finalScore = isRelevant ? score : 0;
  const finalWeak = isRelevant ? weak : ['검색 키워드가 제목에 포함되지 않음 (관련 없는 글)'];
  
  return {
    originalTitle: title,
    coreKeyword: core,
    subKeywords: subs,
    titleStructure: isRelevant ? structure : '키워드 미포함 (관련 없음)',
    firstChar,
    charOrder: getCharOrder(firstChar),
    strengthScore: finalScore,
    weakPoints: finalWeak,
    strongPoints: isRelevant ? strong : []
  };
}

/**
 * classifyKeyword.primary → 제목 전략용 콘텐츠 카테고리 매핑
 */
type ContentCategory = 'entertainment' | 'living' | 'business' | 'product' | 'general';

const CONTENT_CATEGORY_MAP: Record<string, ContentCategory> = {
  movie: 'entertainment', music: 'entertainment', sports: 'entertainment',
  interior: 'living', home_life: 'living', kitchen: 'living', realestate: 'living',
  finance: 'business', sidejob: 'business', job: 'business', insurance_safe: 'business',
  electronics: 'product', smartphone: 'product', laptop: 'product', fashion: 'product', beauty: 'product',
  baby_products: 'product', app: 'product', ai_tool: 'product',
};

function mapToContentCategory(keyword: string): ContentCategory {
  const primary = classifyKeyword(keyword).primary;
  return CONTENT_CATEGORY_MAP[primary] || 'general';
}

/**
 * 가나다순 전략 분석
 */
function analyzeGanadaStrategy(titles: TitleAnalysis[]): TitleStrategyAnalysis['ganadaStrategy'] {
  const firstChars = titles.map(t => t.firstChar);
  const charOrders = titles.map(t => t.charOrder);
  
  // 가장 앞선 글자 찾기
  const minOrder = Math.min(...charOrders);
  
  // 추천 첫 글자 결정
  let recommendedFirstChar = '';
  let reason = '';
  
  // 숫자로 시작하는 글이 없으면 숫자 추천
  if (!firstChars.some(c => /[0-9]/.test(c))) {
    recommendedFirstChar = '1~9';
    reason = '상위 글 중 숫자로 시작하는 글이 없음 → 숫자로 시작하면 가나다순 최상위!';
  } 
  // 'ㄱ'으로 시작하는 글이 없으면 'ㄱ' 추천
  else if (!firstChars.some(c => getChosung(c) === 'ㄱ')) {
    recommendedFirstChar = '가~깋';
    reason = '상위 글 중 "ㄱ"으로 시작하는 글이 없음 → "가"로 시작하면 유리!';
  }
  // 현재 최상위보다 앞선 글자 추천
  else {
    const minChar = titles.find(t => t.charOrder === minOrder)?.firstChar || '';
    const minChosung = getChosung(minChar);
    const chosungIndex = KOREAN_CHOSUNG.indexOf(minChosung);
    
    if (chosungIndex > 0) {
      recommendedFirstChar = `${KOREAN_CHOSUNG[chosungIndex - 1]}으로 시작`;
      reason = `현재 1위가 "${minChar}"로 시작 → "${KOREAN_CHOSUNG[chosungIndex - 1]}"로 시작하면 앞설 수 있음`;
    } else {
      recommendedFirstChar = '숫자 또는 같은 글자';
      reason = `현재 1위가 "${minChar}"로 시작 → 같은 글자면 세부 순서로 경쟁`;
    }
  }
  
  return {
    currentFirstChars: firstChars,
    recommendedFirstChar,
    reason
  };
}

/**
 * 🔥 창의적 후킹 패턴 - 다양한 관점에서 클릭 유도
 */
const CREATIVE_HOOKS = {
  // 🎭 반전/의외성 (예상을 뒤집는)
  reversal: [
    '근데 이게 문제가 아니었다',
    '그런데 반전이...',
    '알고보니 완전 다른 이야기',
    '근데 진짜 문제는 따로 있었다',
  ],
  // 🤫 비밀/내부자 시점
  insider: [
    '아무도 안 알려주는 진짜 이유',
    '업계에서만 아는 비밀',
    '전문가도 말 안하는 것',
    '당사자만 아는 이야기',
  ],
  // ⚡ 긴급/시의성
  urgent: [
    '지금 안 보면 후회할 것',
    '오늘 터진 이야기',
    '방금 확인된 사실',
    '이거 모르면 손해',
  ],
  // 🎯 직접 경험/1인칭
  firstPerson: [
    '직접 겪어보니 이랬다',
    '3개월 써보고 느낀 점',
    '실제로 해보니까...',
    '내 돈 주고 산 솔직 후기',
  ],
  // 🔥 논쟁/양면성
  debate: [
    '찬반 완전히 갈리는 이유',
    '호불호 극명하게 나뉘는 것',
    '이래서 욕먹고 이래서 칭찬받는다',
    '사람들이 오해하는 것 vs 진실',
  ],
  // 💡 인사이트/깨달음
  insight: [
    '이걸 알고나니 다르게 보인다',
    '이 관점으로 보면 이해됨',
    '결국 핵심은 이거였다',
    '다들 놓치는 포인트',
  ],
  // 📊 비교/대조
  comparison: [
    '전 vs 후, 차이가 이 정도',
    '이거랑 저거, 뭐가 다른지',
    '가격 차이 나는 진짜 이유',
    'A급 B급 구분하는 법',
  ],
  // 🎬 스토리텔링
  story: [
    '이렇게 시작해서 이렇게 끝났다',
    '처음엔 몰랐는데...',
    '시간순으로 정리하면',
    '결말이 이렇게 될 줄은',
  ],
};

/**
 * 🔥 창의적 제목 생성 - 다양한 관점에서 클릭 유도
 * 
 * 핵심 원칙:
 * 1. [핵심키워드] + [서브키워드] 맨 앞 (SEO)
 * 2. 신선하고 다양한 관점의 후킹 (클릭률)
 * 3. 뻔하지 않은 창의적 표현
 */
function generateRecommendedTitles(
  searchKeyword: string,
  topTitles: TitleAnalysis[],
  ganadaStrategy: TitleStrategyAnalysis['ganadaStrategy'],
  contentKeyPoints: string[] = []
): RecommendedTitle[] {
  const recommendations: RecommendedTitle[] = [];
  
  // 🔥 관련 있는 제목에서만 서브키워드 수집 (강도 점수 > 0)
  const relevantTitles = topTitles.filter(t => t.strengthScore > 0);
  const allSubKeywords = relevantTitles.flatMap(t => t.subKeywords);
  const subKeywordCounts = new Map<string, number>();
  allSubKeywords.forEach(kw => {
    subKeywordCounts.set(kw, (subKeywordCounts.get(kw) || 0) + 1);
  });
  
  // 빈도순으로 정렬된 서브키워드
  const sortedSubs = Array.from(subKeywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([kw, _]) => kw);
  
  // 상위 5개 서브키워드 (실제 상위 글에서 추출된 것)
  const topSubs = sortedSubs.slice(0, 5);
  const sub1 = topSubs[0] || '';
  const sub2 = topSubs[1] || '';
  
  // 핵심키워드 첫 글자
  const keywordFirstChar = searchKeyword.charAt(0);
  
  // 🔥 카테고리 자동 감지
  const allText = `${searchKeyword} ${topSubs.join(' ')}`.toLowerCase();
  const category = mapToContentCategory(searchKeyword);
  
  // 🎲 키워드 기반 시드 생성 (같은 키워드는 같은 결과, 다른 키워드는 다른 결과)
  const seed = searchKeyword.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const shuffle = <T>(arr: T[], s: number): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = (s * (i + 1) * 31) % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  
  // ========================================
  // 🔥 100점 후킹 풀 - 키워드마다 다른 조합
  // ========================================
  
  // 📦 범용 후킹 풀 (40개+)
  const universalHooks: Array<{
    template: (kw: string, s1: string, s2: string) => string;
    reason: string;
    needsSub2: boolean;
  }> = [
    // 반전/스토리 계열
    { template: (kw, s1) => `${kw} ${s1}, 알고보니 완전 다른 이야기였다`, reason: '💣 반전 - "알고보니"로 예상 뒤집기', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 처음엔 별로였는데 지금은...`, reason: '🎭 감정 변화 - 부정→긍정 반전', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 근데 진짜 문제는 따로 있었다`, reason: '💣 반전 - "진짜 문제는 따로"', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 예상과 완전 달랐던 점`, reason: '🎭 반전 - 예상 뒤집기', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이게 반전이라고?`, reason: '💣 반전 의문 - 호기심 자극', needsSub2: false },
    
    // 경험/후기 계열
    { template: (kw, s1) => `${kw} ${s1} 직접 해보니까 이랬다`, reason: '🎯 1인칭 경험 - 실제 경험담', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2} 1년 써본 솔직 후기`, reason: '📝 장기 후기 - 신뢰도 확보', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 3개월 지나니까 이렇게 됨`, reason: '⏰ 시간 경과 - 결과 궁금증', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1} 실제로 겪어본 사람 얘기`, reason: '👤 실경험자 - 신뢰도', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 써보고 나서 든 생각`, reason: '💭 사용 후기 - 솔직한 감상', needsSub2: true },
    
    // 비밀/내부자 계열
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 아무도 안 알려주는 핵심`, reason: '🕵️ 비밀 정보 - 독점 느낌', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이건 진짜 나만 알고 싶었다`, reason: '🤫 독점 정보 - 희소성', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 업계에서도 쉬쉬하는 이유`, reason: '🕵️ 내부자 - 숨겨진 정보', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 관계자만 아는 진실`, reason: '🔐 내부자 정보 - 권위', needsSub2: true },
    
    // 충격/궁금증 계열
    { template: (kw, s1) => `${kw} ${s1}, 이게 말이 돼?`, reason: '😱 충격 - 의문 유발', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 진짜 이러는 거 맞아?`, reason: '🤯 충격 의문 - 확인 욕구', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이건 좀 심하다 싶었다`, reason: '😤 감정 자극 - 공감 유발', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 솔직히 이건 예상 못 함`, reason: '😮 의외성 - 호기심', needsSub2: false },
    
    // 핵심 정리 계열
    { template: (kw, s1) => `${kw} ${s1}, 딱 이것만 알면 됨`, reason: '🎯 핵심 요약 - 시간 절약', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2} 핵심만 정리했다`, reason: '📋 핵심 정리 - 효율성', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이거 하나면 끝`, reason: '✅ 완결성 - 해결책 제시', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1} 결론부터 말하면`, reason: '⚡ 결론 선행 - 시간 절약', needsSub2: false },
    
    // 비교/선택 계열
    { template: (kw, s1, s2) => `${kw} ${s1} vs ${s2}, 결론은 이거다`, reason: '🆚 비교 분석 - 명확한 답', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1} 고민이라면 이 글 하나로 끝`, reason: '🤔 고민 해결 - 해결책', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2} 뭐가 더 나을까?`, reason: '⚖️ 비교 의문 - 선택 고민', needsSub2: true },
    
    // 경고/주의 계열
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이거 모르면 손해봄`, reason: '⚠️ 경고 - 손실 회피', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1} 하기 전에 꼭 봐야 할 것`, reason: '🚨 필수 체크 - 사전 정보', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 이건 알고 시작해야 함`, reason: '📌 필수 정보 - 준비', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 실수하면 이렇게 됨`, reason: '⚠️ 경고 - 실패 회피', needsSub2: true },
    
    // 인사이트/깨달음 계열
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이 관점으로 보니까 다 이해됨`, reason: '💡 관점 전환 - 새로운 시각', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이걸 알고 나니 다르게 보인다`, reason: '💡 인사이트 - 깨달음', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 왜 진작 몰랐을까`, reason: '🤦 후회 - 정보 가치', needsSub2: false },
    
    // 스토리/호기심 계열
    { template: (kw, s1) => `${kw} ${s1}, 그래서 어떻게 됐냐면...`, reason: '📖 스토리 - 결말 궁금증', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 결국 이렇게 끝났다`, reason: '🎬 결말 암시 - 궁금증', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 마지막에 반전 있음`, reason: '🎭 반전 예고 - 끝까지 읽게', needsSub2: false },
    
    // 공감/감정 계열
    { template: (kw, s1) => `${kw} ${s1}, 나만 이렇게 느끼나?`, reason: '🤝 공감 유도 - 동질감', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 다들 이러는 거 맞지?`, reason: '👥 공감 확인 - 동조', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이거 공감되면 손`, reason: '✋ 공감 호소 - 참여 유도', needsSub2: false },
  ];
  
  // 📦 연예/이슈 특화 후킹 풀
  const entertainmentHooks: Array<{
    template: (kw: string, s1: string, s2: string) => string;
    reason: string;
    needsSub2: boolean;
  }> = [
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이게 진짜 팩트라고?`, reason: '🎬 팩트 체크 - 진위 확인', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 지금 난리난 반응 정리`, reason: '🔥 실시간 반응 - 시의성', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 결국 터졌다`, reason: '💥 폭로 - 예고된 폭발', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 네티즌 반응이 심상치 않다`, reason: '🎭 반응 암시 - 뭔가 있음', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 실시간으로 터지는 중`, reason: '🔴 실시간 - 긴급성', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이게 사실이면 대박`, reason: '😱 조건부 충격 - 확인 욕구', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 댓글 반응 보니까 난리`, reason: '💬 댓글 반응 - 여론 궁금', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 이건 좀 선 넘었다는 반응`, reason: '😤 논란 - 여론 분위기', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 팬들 반응이 갈린다`, reason: '⚔️ 의견 대립 - 논쟁', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이 타이밍에 이게 나왔다`, reason: '⏰ 타이밍 - 의미심장', needsSub2: false },
  ];
  
  // 📦 리빙/제품 특화 후킹 풀
  const livingHooks: Array<{
    template: (kw: string, s1: string, s2: string) => string;
    reason: string;
    needsSub2: boolean;
  }> = [
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이거 하나로 분위기 확 바뀜`, reason: '🏠 공간 변화 - 효과 궁금', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1} 6개월 실사용 후기, 솔직히 말할게`, reason: '🛋️ 장기 후기 - 신뢰도', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 집 분위기 완전 달라짐`, reason: '🏡 변화 효과 - 결과 궁금', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이 조합이 진짜임`, reason: '💯 조합 추천 - 꿀팁', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 인테리어 고수들이 추천하는 이유`, reason: '👑 전문가 추천 - 권위', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 가성비 끝판왕 찾았다`, reason: '💰 가성비 - 경제성', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 이 가격에 이 퀄리티?`, reason: '😮 가성비 충격 - 의외성', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 사고 나서 후회한 점 딱 하나`, reason: '😅 솔직 후기 - 단점 공개', needsSub2: false },
  ];
  
  // 📦 비즈니스/경제 특화 후킹 풀
  const businessHooks: Array<{
    template: (kw: string, s1: string, s2: string) => string;
    reason: string;
    needsSub2: boolean;
  }> = [
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 전문가들이 주목하는 이유`, reason: '📈 전문가 시점 - 권위', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 이걸 몰랐으면 돈 날릴 뻔`, reason: '💰 손실 회피 - 경제적 공포', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 지금 안 하면 늦는다`, reason: '⏰ 긴급성 - 기회 손실', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 업계 관계자가 말하는 진짜`, reason: '🕵️ 내부자 - 신뢰', needsSub2: true },
    { template: (kw, s1) => `${kw} ${s1}, 수익률 보고 깜짝 놀람`, reason: '📊 수익 - 결과 궁금', needsSub2: false },
    { template: (kw, s1) => `${kw} ${s1}, 이 흐름 놓치면 후회함`, reason: '📉 트렌드 - 기회', needsSub2: false },
    { template: (kw, s1, s2) => `${kw} ${s1} ${s2}, 돈 되는 정보 정리`, reason: '💵 실용 정보 - 가치', needsSub2: true },
  ];
  
  // 🎲 카테고리별 후킹 풀 선택 및 셔플
  let categoryHooks = universalHooks;
  if (category === 'entertainment') {
    categoryHooks = [...entertainmentHooks, ...universalHooks.slice(0, 15)];
  } else if (category === 'living' || category === 'product') {
    categoryHooks = [...livingHooks, ...universalHooks.slice(0, 15)];
  } else if (category === 'business') {
    categoryHooks = [...businessHooks, ...universalHooks.slice(0, 15)];
  }
  
  // 키워드 기반 셔플로 다양한 조합 생성
  const shuffledHooks = shuffle(categoryHooks, seed);
  
  // 상위 8개 후킹만 선택 (너무 많으면 공장 느낌)
  let hookCount = 0;
  const maxHooks = 8;
  
  for (const hook of shuffledHooks) {
    if (hookCount >= maxHooks) break;
    
    // sub2가 필요한데 없으면 스킵
    if (hook.needsSub2 && !sub2) continue;
    if (!sub1) continue;
    
    const title = hook.template(searchKeyword, sub1, sub2);
    recommendations.push({
      title,
      reason: hook.reason,
      expectedRank: hookCount < 3 ? '1~3위' : '2~5위',
      keywordPlacement: `[핵심+서브] + [후킹]`,
      charAdvantage: `"${keywordFirstChar}"로 시작`,
      score: 99 - hookCount * 2
    });
    hookCount++;
  }
  
  
  // ========================================
  // 🆕 9. 본문 내용 기반 후킹 제목 (끝판왕!)
  if (contentKeyPoints.length > 0 && topSubs.length >= 1) {
    // 숫자 포함 핵심 포인트 찾기
    const numberPoint = contentKeyPoints.find(p => /\d+[,\d]*\s*(억|만|천|원|명|개|회|번|일|시간|분|년|개월|kg|cm|m|%)/.test(p));
    if (numberPoint) {
      // 숫자 추출
      const numMatch = numberPoint.match(/(\d+[,\d]*\s*(억|만|천|원|명|개|회|번|일|시간|분|년|개월|kg|cm|m|%))/);
      if (numMatch) {
        recommendations.push({
          title: `${searchKeyword} ${topSubs[0]}, "${numMatch[1]}" 충격 실체`,
          reason: `본문 핵심 수치 "${numMatch[1]}" 인용 → 구체적 숫자로 신뢰도+호기심 극대화`,
          expectedRank: '1~2위',
          keywordPlacement: `[핵심: ${searchKeyword}] + [서브: ${topSubs[0]}] + [본문 수치] + [후킹]`,
          charAdvantage: `"${keywordFirstChar}"로 시작 - 키워드 우선 노출`,
          score: 99
        });
      }
    }
    
    // 충격적인 문장 찾기
    const shockSentence = contentKeyPoints.find(p => 
      p.length > 15 && p.length < 50 && 
      (p.includes('충격') || p.includes('폭로') || p.includes('논란') || p.includes('피해') || p.includes('폭행'))
    );
    if (shockSentence) {
      // 문장 축약
      const shortSentence = shockSentence.substring(0, 25).trim();
      recommendations.push({
        title: `${searchKeyword} ${topSubs[0]}, "${shortSentence}..."`,
        reason: `본문 충격 문장 인용 → 실제 내용 기반 강력한 호기심 유발`,
        expectedRank: '1~2위',
        keywordPlacement: `[핵심: ${searchKeyword}] + [서브: ${topSubs[0]}] + [본문 인용]`,
        charAdvantage: `"${keywordFirstChar}"로 시작 - 키워드 우선 노출`,
        score: 98
      });
    }
    
    // 인용문 찾기
    const quote = contentKeyPoints.find(p => p.startsWith('"') || p.startsWith("'") || p.startsWith('"'));
    if (quote) {
      const cleanQuote = quote.replace(/["'"]/g, '').substring(0, 20).trim();
      recommendations.push({
        title: `${searchKeyword} ${topSubs[0]}, "${cleanQuote}..." 발언 논란`,
        reason: `본문 인용문 활용 → 실제 발언/내용으로 신뢰도+클릭률 극대화`,
        expectedRank: '1~3위',
        keywordPlacement: `[핵심: ${searchKeyword}] + [서브: ${topSubs[0]}] + [인용문] + [후킹]`,
        charAdvantage: `"${keywordFirstChar}"로 시작 - 키워드 우선 노출`,
        score: 97
      });
    }
    
    // 밝혀진 사실 찾기
    const factPoint = contentKeyPoints.find(p => 
      p.includes('밝혀졌') || p.includes('드러났') || p.includes('확인됐') || p.includes('알려졌')
    );
    if (factPoint) {
      const shortFact = factPoint.substring(0, 30).trim();
      recommendations.push({
        title: `${searchKeyword} ${topSubs[0]}, ${shortFact}...`,
        reason: `본문 핵심 사실 인용 → "~밝혀졌다" 패턴으로 정보성+호기심 동시 확보`,
        expectedRank: '1~3위',
        keywordPlacement: `[핵심: ${searchKeyword}] + [서브: ${topSubs[0]}] + [핵심 사실]`,
        charAdvantage: `"${keywordFirstChar}"로 시작 - 키워드 우선 노출`,
        score: 96
      });
    }
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * 🔥 메인 함수: 제목 전략 분석 (본문 내용 기반)
 */
export function analyzeTitleStrategy(
  searchKeyword: string,
  topPostTitles: string[],
  contentData?: Map<string, { content: string; keyPoints: string[] }>
): TitleStrategyAnalysis {
  // 1. 각 제목 분석
  const topTitles = topPostTitles.map(title => analyzeTitle(title, searchKeyword));
  
  // 2. 공통 패턴 찾기
  const commonPatterns: string[] = [];
  
  // 키워드 위치 패턴
  const frontKeywordCount = topTitles.filter(t => t.titleStructure.includes('선두')).length;
  if (frontKeywordCount >= topTitles.length * 0.5) {
    commonPatterns.push('상위 글 대부분이 키워드를 제목 앞에 배치');
  }
  
  // 연도 포함 패턴
  const yearCount = topTitles.filter(t => /202[4-6]/.test(t.originalTitle)).length;
  if (yearCount >= 2) {
    commonPatterns.push('상위 글에 연도(2024~2026) 포함 다수');
  }
  
  // 숫자 포함 패턴
  const numberCount = topTitles.filter(t => /\d+/.test(t.originalTitle)).length;
  if (numberCount >= topTitles.length * 0.5) {
    commonPatterns.push('상위 글 대부분이 숫자 포함');
  }
  
  // 3. 가나다순 전략
  const ganadaStrategy = analyzeGanadaStrategy(topTitles);
  
  // 4. 상위 글에 없는 키워드 (기회!)
  const allSubKeywords = new Set(topTitles.flatMap(t => t.subKeywords));
  const potentialKeywords = ['후기', '비교', '추천', '순위', '가격', '방법', '꿀팁', '장단점', '총정리', '완벽정리'];
  const missingKeywords = potentialKeywords.filter(kw => !allSubKeywords.has(kw));
  
  // 🆕 5. 본문 내용에서 핵심 포인트 수집
  const allKeyPoints: string[] = [];
  if (contentData) {
    for (const [_, data] of contentData) {
      allKeyPoints.push(...data.keyPoints);
    }
  }
  
  // 6. 추천 제목 생성 (본문 핵심 포인트 포함)
  const recommendedTitles = generateRecommendedTitles(searchKeyword, topTitles, ganadaStrategy, allKeyPoints);
  
  return {
    searchKeyword,
    topTitles,
    commonPatterns,
    missingKeywords,
    recommendedTitles,
    ganadaStrategy
  };
}

/**
 * 제목 전략 요약 텍스트 생성
 */
export function generateTitleStrategySummary(analysis: TitleStrategyAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`📊 "${analysis.searchKeyword}" 제목 전략 분석`);
  lines.push('');
  
  // 상위 글 분석
  lines.push('🏆 상위 노출 글 제목 분석:');
  analysis.topTitles.forEach((t, i) => {
    lines.push(`  ${i + 1}위: "${t.originalTitle.substring(0, 40)}..."`);
    lines.push(`      - 핵심: ${t.coreKeyword} | 서브: ${t.subKeywords.join(', ') || '없음'}`);
    lines.push(`      - 구조: ${t.titleStructure} | 강도: ${t.strengthScore}점`);
    lines.push(`      - 첫글자: "${t.firstChar}" (가나다순 ${t.charOrder})`);
  });
  
  lines.push('');
  lines.push('📌 공통 패턴:');
  analysis.commonPatterns.forEach(p => lines.push(`  - ${p}`));
  
  lines.push('');
  lines.push('💡 가나다순 전략:');
  lines.push(`  - 현재 상위 글 첫글자: ${analysis.ganadaStrategy.currentFirstChars.join(', ')}`);
  lines.push(`  - 추천: ${analysis.ganadaStrategy.recommendedFirstChar}`);
  lines.push(`  - 이유: ${analysis.ganadaStrategy.reason}`);
  
  lines.push('');
  lines.push('🎯 추천 제목:');
  analysis.recommendedTitles.slice(0, 3).forEach((r, i) => {
    lines.push(`  ${i + 1}. "${r.title}"`);
    lines.push(`     → ${r.reason}`);
    lines.push(`     → 예상 순위: ${r.expectedRank}`);
  });
  
  return lines.join('\n');
}
