/**
 * 🌊 키워드 흐름 분석기 v2.0 (100% 실제 데이터)
 * 
 * 키워드 = 상품 = 흐름
 * 
 * ⚠️ 더미 데이터 없음! 네이버 자동완성 + 연관검색어 기반
 */

import axios from 'axios';

// ============================================================
// 📋 인터페이스
// ============================================================

export interface KeywordFlow {
  keyword: string;
  products: FlowItem[];      // 상품 (구매 의도)
  flows: FlowItem[];         // 흐름 (정보 니즈)
  tips: string[];            // 블로그 작성 팁
  analyzedAt: string;
  isRealData: boolean;       // 실제 데이터 여부
}

export interface FlowItem {
  keyword: string;
  type: 'product' | 'info' | 'action';
  intent: string;            // 검색 의도 설명
  monetization: string;      // 수익화 방법
  priority: 'high' | 'medium' | 'low';
}

// ============================================================
// 🔧 의도 분류 패턴
// ============================================================

// 상품/구매 의도 패턴
const PRODUCT_INTENT_PATTERNS = [
  { pattern: '구매', intent: '구매 의도', monetization: '쿠팡 파트너스, 제휴 마케팅' },
  { pattern: '구입', intent: '구매 의도', monetization: '쿠팡 파트너스, 제휴 마케팅' },
  { pattern: '가격', intent: '가격 비교', monetization: '가격비교 사이트 제휴' },
  { pattern: '최저가', intent: '최저가 탐색', monetization: '쿠팡 파트너스' },
  { pattern: '할인', intent: '할인 정보', monetization: '쿠폰 제휴' },
  { pattern: '쿠폰', intent: '쿠폰 탐색', monetization: '쿠폰 제휴' },
  { pattern: '추천', intent: '추천 탐색', monetization: '제품 리뷰, 협찬' },
  { pattern: '순위', intent: '순위 비교', monetization: '비교 콘텐츠' },
  { pattern: '베스트', intent: '베스트 탐색', monetization: '추천 리스트' },
  { pattern: '신청', intent: '신청/가입', monetization: '서비스 제휴' },
  { pattern: '가입', intent: '가입 의도', monetization: '서비스 제휴' },
  { pattern: '예약', intent: '예약 의도', monetization: '예약 플랫폼 제휴' },
  { pattern: '보험', intent: '보험 탐색', monetization: '보험 비교 제휴' },
  { pattern: '대출', intent: '대출 탐색', monetization: '대출 비교 제휴' },
  { pattern: '적금', intent: '적금 탐색', monetization: '금융 제휴' },
  { pattern: '카드', intent: '카드 탐색', monetization: '카드 발급 제휴' },
  { pattern: '티켓', intent: '티켓 구매', monetization: '티켓 예매 제휴' },
];

// 정보/흐름 의도 패턴
const INFO_INTENT_PATTERNS = [
  { pattern: '방법', intent: '방법 탐색', monetization: '애드센스, 정보 콘텐츠' },
  { pattern: '하는법', intent: '방법 탐색', monetization: '애드센스, 정보 콘텐츠' },
  { pattern: '하는 법', intent: '방법 탐색', monetization: '애드센스, 정보 콘텐츠' },
  { pattern: '어떻게', intent: '방법 탐색', monetization: '애드센스, 정보 콘텐츠' },
  { pattern: '뜻', intent: '의미 탐색', monetization: '애드센스' },
  { pattern: '의미', intent: '의미 탐색', monetization: '애드센스' },
  { pattern: '이유', intent: '이유 탐색', monetization: '애드센스' },
  { pattern: '왜', intent: '이유 탐색', monetization: '애드센스' },
  { pattern: '원인', intent: '원인 탐색', monetization: '애드센스' },
  { pattern: '증상', intent: '증상 탐색', monetization: '건강 콘텐츠' },
  { pattern: '효과', intent: '효과 탐색', monetization: '제품 리뷰' },
  { pattern: '장단점', intent: '비교 탐색', monetization: '비교 콘텐츠' },
  { pattern: '차이', intent: '비교 탐색', monetization: '비교 콘텐츠' },
  { pattern: '후기', intent: '후기 탐색', monetization: '체험단, 협찬' },
  { pattern: '리뷰', intent: '리뷰 탐색', monetization: '체험단, 협찬' },
  { pattern: '전화번호', intent: '연락처 탐색', monetization: '애드센스, 지역광고' },
  { pattern: '연락처', intent: '연락처 탐색', monetization: '애드센스' },
  { pattern: '위치', intent: '위치 탐색', monetization: '지역 광고' },
  { pattern: '주소', intent: '주소 탐색', monetization: '지역 광고' },
  { pattern: '시간', intent: '시간 정보', monetization: '애드센스' },
  { pattern: '일정', intent: '일정 정보', monetization: '애드센스' },
  { pattern: '날짜', intent: '날짜 정보', monetization: '애드센스' },
  { pattern: '언제', intent: '시기 정보', monetization: '애드센스' },
  { pattern: '찬반', intent: '의견 탐색', monetization: '애드센스' },
  { pattern: '논란', intent: '이슈 탐색', monetization: '애드센스' },
  { pattern: '반응', intent: '반응 탐색', monetization: '애드센스' },
  { pattern: '영향', intent: '영향 분석', monetization: '애드센스' },
  { pattern: '전망', intent: '전망 탐색', monetization: '애드센스' },
  { pattern: '예상', intent: '예상 정보', monetization: '애드센스' },
];

// ============================================================
// 🔍 네이버 자동완성 API (실제 데이터)
// ============================================================

async function getNaverAutocomplete(keyword: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 5000
    });
    
    if (response.data && response.data.items && Array.isArray(response.data.items[0])) {
      response.data.items[0].forEach((item: any) => {
        if (Array.isArray(item) && item[0]) {
          const kw = item[0].trim();
          // 원본 키워드와 다른 경우만 추가
          if (kw && kw !== keyword && kw.length > keyword.length) {
            results.push(kw);
          }
        }
      });
    }
    
    console.log(`[FLOW] 자동완성 ${results.length}개: ${results.slice(0, 5).join(', ')}`);
    
  } catch (error: any) {
    console.error('[FLOW] 자동완성 에러:', error.message);
  }
  
  return results;
}

// ============================================================
// 🔍 네이버 연관검색어 크롤링 (실제 데이터)
// ============================================================

async function getNaverRelatedSearches(keyword: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000
    });
    
    const html = response.data;
    
    // 연관검색어 추출 (여러 패턴)
    const patterns = [
      /class="keyword"[^>]*>([^<]+)</g,
      /class="tit"[^>]*>([^<]+)</g,
      /<a[^>]*class="[^"]*related[^"]*"[^>]*>([^<]+)</gi,
      /data-tiara-action-name="[^"]*"[^>]*>([^<]+)</g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const kw = match[1].trim();
        if (kw && kw.length >= 2 && kw !== keyword && !kw.includes('<')) {
          results.push(kw);
        }
      }
    }
    
    console.log(`[FLOW] 연관검색어 ${results.length}개: ${results.slice(0, 5).join(', ')}`);
    
  } catch (error: any) {
    console.error('[FLOW] 연관검색어 에러:', error.message);
  }
  
  return [...new Set(results)];
}

// ============================================================
// 🧠 키워드 의도 분류 (실제 패턴 매칭)
// ============================================================

function classifyKeyword(keyword: string, originalKeyword: string): FlowItem | null {
  const lowerKeyword = keyword.toLowerCase();
  
  // 1. 상품/구매 의도 체크
  for (const item of PRODUCT_INTENT_PATTERNS) {
    if (lowerKeyword.includes(item.pattern)) {
      return {
        keyword,
        type: 'product',
        intent: item.intent,
        monetization: item.monetization,
        priority: ['구매', '가격', '추천', '예약', '신청'].some(p => lowerKeyword.includes(p)) ? 'high' : 'medium'
      };
    }
  }
  
  // 2. 정보/흐름 의도 체크
  for (const item of INFO_INTENT_PATTERNS) {
    if (lowerKeyword.includes(item.pattern)) {
      return {
        keyword,
        type: 'info',
        intent: item.intent,
        monetization: item.monetization,
        priority: ['방법', '후기', '전화번호'].some(p => lowerKeyword.includes(p)) ? 'high' : 'medium'
      };
    }
  }
  
  // 3. 분류 안 되면 일반 정보로 처리 (원본과 다른 경우만)
  if (keyword !== originalKeyword && keyword.length > originalKeyword.length + 1) {
    // 어떤 새로운 단어가 추가되었는지 확인
    const addedPart = keyword.replace(originalKeyword, '').trim();
    if (addedPart.length >= 2) {
      return {
        keyword,
        type: 'info',
        intent: `"${addedPart}" 관련 정보 탐색`,
        monetization: '애드센스, 정보 콘텐츠',
        priority: 'low'
      };
    }
  }
  
  return null;
}

// ============================================================
// 💡 블로그 팁 생성 (키워드 맞춤)
// ============================================================

function generateTips(keyword: string, products: FlowItem[], flows: FlowItem[]): string[] {
  const tips: string[] = [];
  
  // 상품 키워드가 있는 경우
  if (products.length > 0) {
    const topProduct = products[0];
    tips.push(`💰 "${topProduct.keyword}" 키워드로 ${topProduct.monetization} 수익화 가능!`);
  }
  
  // 흐름 키워드가 있는 경우
  if (flows.length > 0) {
    const topFlow = flows[0];
    tips.push(`📝 "${topFlow.keyword}" 정보를 포함하면 검색 유입 증가!`);
  }
  
  // 기본 팁
  if (products.length === 0 && flows.length === 0) {
    tips.push(`💡 "${keyword}" 관련 자동완성 키워드가 적습니다. 구체적인 키워드로 분석해보세요.`);
  } else {
    tips.push(`🎯 연관 키워드를 활용해 "${keyword}" 관련 콘텐츠를 작성해보세요!`);
  }
  
  // 경쟁 우회 팁
  if (flows.length >= 2) {
    tips.push(`🚀 모두가 메인 키워드로 몰릴 때, 연관 키워드로 블루오션을 공략하세요!`);
  }
  
  return tips;
}

// ============================================================
// 🚀 메인 분석 함수
// ============================================================

export async function analyzeKeywordFlow(keyword: string): Promise<KeywordFlow> {
  console.log(`\n[FLOW] 🌊 키워드 흐름 분석 시작: "${keyword}"`);
  
  const startTime = Date.now();
  
  // 1. 네이버 자동완성 수집
  const autocompleteKeywords = await getNaverAutocomplete(keyword);
  
  // 2. 네이버 연관검색어 수집
  const relatedKeywords = await getNaverRelatedSearches(keyword);
  
  // 3. 모든 키워드 병합 (중복 제거)
  const allKeywords = [...new Set([...autocompleteKeywords, ...relatedKeywords])];
  
  console.log(`[FLOW] 총 ${allKeywords.length}개 연관 키워드 수집`);
  
  // 4. 각 키워드 분류
  const products: FlowItem[] = [];
  const flows: FlowItem[] = [];
  
  for (const kw of allKeywords) {
    const classified = classifyKeyword(kw, keyword);
    if (classified) {
      if (classified.type === 'product') {
        // 중복 체크
        if (!products.some(p => p.keyword === classified.keyword)) {
          products.push(classified);
        }
      } else {
        if (!flows.some(f => f.keyword === classified.keyword)) {
          flows.push(classified);
        }
      }
    }
  }
  
  // 5. 우선순위 정렬
  const sortByPriority = (a: FlowItem, b: FlowItem) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  };
  
  products.sort(sortByPriority);
  flows.sort(sortByPriority);
  
  // 6. 블로그 팁 생성
  const tips = generateTips(keyword, products, flows);
  
  const elapsed = Date.now() - startTime;
  console.log(`[FLOW] ✅ 분석 완료! 상품 ${products.length}개, 흐름 ${flows.length}개 (${elapsed}ms)\n`);
  
  return {
    keyword,
    products: products.slice(0, 5),
    flows: flows.slice(0, 5),
    tips,
    analyzedAt: new Date().toISOString(),
    isRealData: allKeywords.length > 0
  };
}

// ============================================================
// 🧪 테스트 함수
// ============================================================

export async function testKeywordFlow(): Promise<void> {
  const testKeywords = ['수능 폐지', '비트코인', '광주 도서관'];
  
  for (const kw of testKeywords) {
    console.log('\n' + '='.repeat(50));
    const result = await analyzeKeywordFlow(kw);
    
    console.log(`\n📌 키워드: ${result.keyword}`);
    console.log(`📊 실제 데이터: ${result.isRealData ? '예' : '아니오'}`);
    
    console.log('\n💰 상품 (구매 의도):');
    if (result.products.length > 0) {
      result.products.forEach((p, i) => {
        console.log(`  ${i+1}) ${p.keyword}`);
        console.log(`     → ${p.intent} | ${p.monetization}`);
      });
    } else {
      console.log('  (구매 의도 키워드 없음)');
    }
    
    console.log('\n📊 흐름 (정보 니즈):');
    if (result.flows.length > 0) {
      result.flows.forEach((f, i) => {
        console.log(`  ${i+1}) ${f.keyword}`);
        console.log(`     → ${f.intent}`);
      });
    } else {
      console.log('  (정보 키워드 없음)');
    }
    
    console.log('\n💡 팁:');
    result.tips.forEach(tip => console.log(`  ${tip}`));
  }
}
