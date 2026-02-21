/**
 * 🔥 Signal.bz 실시간 검색어 크롤러
 * 
 * signal.bz는 네이버 실시간 검색어를 제공하는 사이트입니다.
 * API 엔드포인트: https://api.signal.bz/news/realtime
 */

import axios from 'axios';

export interface SignalKeyword {
  rank: number;
  keyword: string;
  status: 'up' | 'down' | 'new' | 'same';
  source: 'signal.bz';
}

// 🚫 광고성 키워드 필터 (금융, 보험, 렌탈, 의료 등)
const AD_KEYWORDS_FILTER = [
  // 금융기관
  '증권', '저축은행', '캐피탈', '상호저축', '새마을금고', '신협', '농협', '수협', '우리은행', '국민은행', 
  '신한은행', '하나은행', 'KB', 'IBK', 'NH', 'SC', 'BNK', 'DGB', '카카오뱅크', '토스뱅크', '케이뱅크',
  // 렌탈/리스
  '렌터카', '렌트카', '장기렌트', '자동차리스', '렌탈', '리스', '할부', '구독서비스',
  // 보험
  '보험', '실비', '실손', '암보험', '자동차보험', '운전자보험', '화재보험', '생명보험', '다이렉트보험',
  // 대출
  '대출', '신용대출', '주택담보', '전세자금', '사업자대출', '소액대출', '비상금대출',
  // 의료/성형
  '병원', '클리닉', '의원', '성형외과', '피부과', '치과', '라식', '라섹', '임플란트', '탈모', '비뇨기과',
  // 법률
  '변호사', '법무사', '법률사무소', '회생', '파산',
  // 부동산
  '부동산', '분양', '청약', '재개발', '재건축',
  // 기타 광고
  '카드사', '할인카드', '포인트적립', '쇼핑몰', '홈쇼핑', '면세점', '아울렛',
  // 도박/성인
  '토토', '배팅', '카지노',
];

/**
 * 광고성 키워드인지 확인
 */
function isAdKeyword(keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  return AD_KEYWORDS_FILTER.some(filter => lowerKeyword.includes(filter));
}

interface SignalApiResponse {
  now: number;
  top10: Array<{
    rank: number;
    keyword: string;
    state: string; // 's' = same, '+' = up/new
    summary: string;
  }>;
}

/**
 * Signal.bz API에서 네이버 실시간 검색어 가져오기
 */
export async function getSignalBzKeywords(limit: number = 20): Promise<SignalKeyword[]> {
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SIGNAL.BZ] ========== 실시간 검색어 수집 시작 (시도 ${attempt}/${MAX_RETRIES}) ==========`);
      
      const response = await axios.get<SignalApiResponse>('https://api.signal.bz/news/realtime', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://signal.bz/',
        },
        timeout: 10000,
      });
      
      const { top10 } = response.data;
      
      if (!top10 || !Array.isArray(top10) || top10.length === 0) {
        console.log('[SIGNAL.BZ] ⚠️ API 응답에 top10 데이터가 없습니다');
        continue;
      }
      
      // 🚫 광고성 키워드 필터링 적용
      const keywords: SignalKeyword[] = top10
        .filter(item => {
          if (isAdKeyword(item.keyword)) {
            console.log(`[SIGNAL.BZ] ⚠️ 광고 키워드 필터링: ${item.keyword}`);
            return false;
          }
          return true;
        })
        .map((item, index) => ({
          rank: index + 1, // 필터링 후 순위 재계산
          keyword: item.keyword,
          status: mapState(item.state),
          source: 'signal.bz' as const
        }));
      
      console.log(`[SIGNAL.BZ] ✅ ${keywords.length}개 키워드 수집 완료 (광고 필터링 적용됨)`);
      keywords.forEach(k => console.log(`  ${k.rank}. ${k.keyword} [${k.status}]`));
      
      return keywords.slice(0, limit);
      
    } catch (error: any) {
      console.error(`[SIGNAL.BZ] 에러 (시도 ${attempt}/${MAX_RETRIES}):`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  console.log('[SIGNAL.BZ] 모든 재시도 실패, 빈 배열 반환');
  return [];
}

/**
 * API 상태값을 내부 status로 변환
 */
function mapState(state: string): 'up' | 'down' | 'new' | 'same' {
  switch (state) {
    case '+':
      return 'up';
    case '-':
      return 'down';
    case 'n':
      return 'new';
    case 's':
    default:
      return 'same';
  }
}

/**
 * Signal.bz API 직접 호출 (getSignalBzKeywords와 동일)
 */
export async function getSignalBzApi(): Promise<SignalKeyword[]> {
  return getSignalBzKeywords();
}


