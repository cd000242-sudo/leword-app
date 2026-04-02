/**
 * 💎 황금 롱테일 키워드 발굴기 v2.0
 * 
 * 카테고리 + 타겟층 기반으로 실제 검색되는 수익화 키워드 발굴
 * 
 * ✅ v2.0 개선사항:
 * - 실제 제품명/브랜드 기반 키워드
 * - 구매 의도가 명확한 롱테일 키워드
 * - 시즌/트렌드 반영 키워드
 */

import axios from 'axios';
import { getNaverSearchAdKeywordVolume, NaverSearchAdConfig } from './naver-searchad-api';
import { getNaverBlogDocumentCount } from './naver-blog-api';

let _searchAdConfig: NaverSearchAdConfig = { accessLicense: '', secretKey: '', customerId: '' };

export function setApiConfigs(naverConfig: any, searchAdConfig: NaverSearchAdConfig): void {
  _searchAdConfig = searchAdConfig;
}

export interface CategoryLongtailOptions {
  category: string;
  target: string;
  count?: number;
  includeYear?: boolean;
  buyIntentOnly?: boolean;
}

export interface CategoryLongtailKeyword {
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number | null;
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';
  category: string;
  target: string;
  recommendation: string;
  contentGuide?: {
    format: string;
    title: string;
    length: string;
  };
  whyGolden?: string[];
}

// ============================================================
// 🎯 실제 검색되는 구체적 키워드 DB
// ============================================================

// 카테고리별 실제 검색 키워드 (제품명, 브랜드 포함)
const REAL_LONGTAIL_KEYWORDS: Record<string, Record<string, string[]>> = {
  '제품리뷰': {
    '시니어': [
      '60대 스마트폰 추천', '어르신 혈압계 추천', '시니어 보청기 가격',
      '60대 운동화 추천', '노인 안마기 추천', '어르신 침대 추천',
      '시니어 영양제 종류', '60대 선물 추천', '부모님 효도선물',
      '어르신 핸드폰 쉬운거', '시니어폰 추천', '노인용 태블릿'
    ],
    '20대': [
      '대학생 노트북 추천 2024', '20대 가성비 이어폰', '자취 가전 추천',
      '사회초년생 카드 추천', '20대 여자 향수 추천', '대학생 가방 추천',
      '취준생 노트북 추천', '20대 시계 브랜드', '대학생 태블릿 추천'
    ],
    '30대': [
      '신혼 가전 추천', '30대 남자 시계', '직장인 노트북 추천',
      '신혼부부 침대 추천', '30대 여자 가방', '워킹맘 시간관리',
      '맞벌이 부부 가전', '30대 골프채 추천', '직장인 영양제'
    ],
    '40대': [
      '40대 남자 골프채', '중년 여성 화장품', '40대 영양제 추천',
      '학부모 태블릿 추천', '40대 안마의자 추천', '중년 남성 시계',
      '40대 운동기구 추천', '학부모 노트북 추천'
    ],
    '주부': [
      '주부 다이어트 운동기구', '가정용 에어프라이어 추천', '주방 가전 추천',
      '살림 꿀템 추천', '가성비 청소기 추천', '주부 재택알바 추천',
      '식기세척기 추천', '음식물처리기 추천', '가정용 정수기 비교'
    ],
    '자취생': [
      '자취생 전자레인지 추천', '원룸 공기청정기', '1인용 밥솥 추천',
      '자취 필수템 리스트', '미니 세탁기 추천', '1인 가구 냉장고',
      '자취생 침구 추천', '원룸 인테리어 꿀팁'
    ]
  },
  
  '건강': {
    '시니어': [
      '60대 관절 영양제', '노인 혈압 관리', '시니어 단백질 보충제',
      '어르신 수면 영양제', '60대 눈 영양제', '노인 칼슘 영양제',
      '시니어 오메가3 추천', '60대 체력 관리', '어르신 면역력 영양제'
    ],
    '20대': [
      '20대 탈모 영양제', '피로회복제 추천', '대학생 비타민 추천',
      '다이어트 보조제 후기', '20대 피부 영양제', 'MZ세대 건강기능식품'
    ],
    '30대': [
      '30대 남자 영양제', '직장인 피로회복', '30대 여자 철분제',
      '임산부 영양제 추천', '30대 탈모 예방', '직장인 눈 피로'
    ],
    '40대': [
      '40대 갱년기 영양제', '중년 남성 활력', '40대 콜레스테롤 관리',
      '중년 여성 갱년기', '40대 관절 영양제', '중년 다이어트'
    ],
    '주부': [
      '주부 갱년기 영양제', '엄마 피로회복', '가사노동 피로',
      '주부 다이어트 식단', '엄마 면역력 영양제'
    ]
  },
  
  '육아': {
    '30대': [
      '신생아 분유 추천', '아기띠 추천 순위', '유모차 추천 2024',
      '아기 침대 추천', '이유식 재료 추천', '기저귀 가성비 추천',
      '젖병 소독기 추천', '아기 로션 순한거', '유아 카시트 추천'
    ],
    '주부': [
      '어린이집 준비물 리스트', '아기 이유식 레시피', '유아 간식 추천',
      '아이 장난감 추천', '아기 옷 사이즈', '유아 영어 교육',
      '아이 키 크는 영양제', '어린이 비타민 추천', '유아 그림책 추천'
    ],
    '신혼부부': [
      '첫아이 준비물', '신생아 필수템', '출산준비물 리스트',
      '아기방 인테리어', '신생아 침대 추천', '아기 용품 체크리스트'
    ]
  },
  
  '뷰티': {
    '20대': [
      '20대 기초화장품 추천', '대학생 색조 화장품', '여드름 화장품 추천',
      '20대 여자 향수', '가성비 화장품 추천', 'MZ 뷰티템',
      '20대 스킨케어 루틴', '다이소 화장품 추천'
    ],
    '30대': [
      '30대 주름 화장품', '안티에이징 크림 추천', '30대 여자 화장품 세트',
      '직장인 데일리 메이크업', '30대 기미 크림', '탄력 세럼 추천'
    ],
    '40대': [
      '40대 기초화장품', '중년 여성 화장품', '40대 주름 개선 크림',
      '갱년기 피부 관리', '40대 기미 제거', '탄력 관리 화장품'
    ],
    '주부': [
      '엄마 피부 관리', '주부 간단 메이크업', '육아맘 시간단축 화장',
      '주부 기초 화장품', '손 거친 엄마 핸드크림'
    ]
  },
  
  '여행': {
    '20대': [
      '대학생 해외여행 추천', '저렴한 유럽여행', '20대 혼자 여행',
      '가성비 호텔 추천', '배낭여행 준비물', '동남아 여행 추천'
    ],
    '30대': [
      '신혼여행 추천지', '직장인 휴가 여행', '국내 커플 여행',
      '가족 여행 추천', '주말 여행 코스', '호캉스 추천'
    ],
    '주부': [
      '아이랑 국내여행', '가족 캠핑장 추천', '아이 동반 해외여행',
      '키즈 호텔 추천', '가족 펜션 추천', '유아 동반 맛집'
    ],
    '시니어': [
      '60대 국내여행', '어르신 효도관광', '시니어 패키지여행',
      '부모님 모시고 여행', '노인 온천 여행'
    ]
  },
  
  '전자제품': {
    '20대': [
      '대학생 노트북 추천', '가성비 무선이어폰', '20대 스마트워치',
      '자취생 TV 추천', '갤럭시 아이폰 비교', '가성비 태블릿'
    ],
    '30대': [
      '재택근무 노트북', '가정용 빔프로젝터', '신혼 TV 추천',
      '직장인 노트북 추천', '아이패드 갤럭시탭 비교'
    ],
    '40대': [
      '40대 스마트폰 추천', '가정용 CCTV 추천', '중년 스마트워치',
      '부모님 폰 추천', '가정용 NAS 추천'
    ],
    '시니어': [
      '시니어폰 추천', '어르신 스마트폰', '노인 혈압계 추천',
      '어르신 체온계', '60대 태블릿 사용법'
    ],
    '자취생': [
      '원룸 TV 사이즈', '미니 세탁기 추천', '1인용 에어컨',
      '자취생 냉장고 추천', '미니 건조기 추천'
    ]
  },
  
  '재테크': {
    '20대': [
      '사회초년생 적금 추천', '20대 주식 시작', '대학생 재테크',
      '적금 금리 비교', '20대 보험 추천', 'MZ 투자 방법'
    ],
    '30대': [
      '30대 재테크 방법', '신혼부부 재테크', '직장인 부업 추천',
      '내집마련 방법', '30대 자산관리', '맞벌이 재테크'
    ],
    '40대': [
      '40대 노후준비', '중년 투자 방법', '40대 연금저축',
      '퇴직금 투자', '40대 부동산 투자'
    ],
    '주부': [
      '주부 재테크 방법', '살림 절약 꿀팁', '가계부 작성법',
      '주부 부업 추천', '집에서 돈버는법'
    ],
    '직장인': [
      '직장인 월급관리', '퇴근 후 부업', '직장인 주식투자',
      '재테크 자동화', '급여 실수령액 계산'
    ]
  },
  
  '교육': {
    '학생': [
      '수능 인강 추천', '고등학생 학원 추천', '수학 인강 추천',
      '영어 인강 추천', '과학 인강 추천', '국어 인강 추천'
    ],
    '20대': [
      '토익 인강 추천', '자격증 추천', '코딩 독학 방법',
      '취업 자격증', '영어회화 독학', 'IT 자격증 추천'
    ],
    '30대': [
      '직장인 자격증', '재직자 국비지원', '직장인 MBA',
      '승진 자격증', '직장인 영어공부'
    ],
    '주부': [
      '아이 영어교육', '초등 학습지 비교', '유아 학습지 추천',
      '엄마표 영어', '홈스쿨링 방법'
    ]
  },
  
  '식품': {
    '자취생': [
      '자취생 밀키트 추천', '1인분 냉동식품', '간편식 추천',
      '편의점 도시락 추천', '자취 요리 레시피', '혼밥 메뉴'
    ],
    '주부': [
      '간편 저녁 메뉴', '반찬 밀키트 추천', '건강 간식 추천',
      '아이 간식 만들기', '명절 음식 밀키트'
    ],
    '시니어': [
      '어르신 간편식', '노인 영양식', '시니어 건강식품',
      '소화 잘되는 음식', '노인 식단 추천'
    ],
    '직장인': [
      '직장인 점심 도시락', '사무실 간식 추천', '회사 야식 추천',
      '직장인 다이어트 도시락', '편의점 신상 추천'
    ]
  },
  
  '패션': {
    '20대': [
      '20대 여자 코디', '대학생 패션 브랜드', '가성비 옷 쇼핑몰',
      '20대 남자 코디', 'MZ 패션 트렌드', '데일리룩 추천'
    ],
    '30대': [
      '30대 여자 출근룩', '직장인 코디', '30대 남자 캐주얼',
      '오피스룩 브랜드', '비즈니스 캐주얼'
    ],
    '40대': [
      '40대 여자 패션', '중년 남성 옷', '40대 캐주얼 브랜드',
      '중년 여성 코디', '40대 골프웨어'
    ],
    '주부': [
      '육아맘 편한 옷', '엄마 패션 코디', '아이랑 커플룩',
      '활동하기 좋은 옷', '엄마 원피스 추천'
    ]
  }
};

// 시즌별 추가 키워드
const SEASONAL_KEYWORDS: Record<string, string[]> = {
  '봄': ['봄 신상', '봄 코디', '봄 나들이', '봄 여행', '꽃놀이'],
  '여름': ['여름 휴가', '여름 가전', '에어컨 추천', '선풍기 추천', '여름 의류'],
  '가을': ['가을 코디', '단풍 여행', '가을 캠핑', '추석 선물'],
  '겨울': ['크리스마스 선물', '연말 파티', '신년 계획', '겨울 코트', '연말정산'],
  '설날': ['설날 선물', '명절 선물', '부모님 선물', '효도선물'],
  '추석': ['추석 선물', '명절 음식', '고향 여행', '추석 용돈'],
  '블랙프라이데이': ['블프 할인', '해외직구', '아마존 할인'],
  '신학기': ['새학기 준비물', '입학 선물', '학용품 추천']
};

// ============================================================
// 🔍 네이버 자동완성 API
// ============================================================

async function getNaverAutocomplete(keyword: string): Promise<string[]> {
  try {
    const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 5000
    });
    
    const results: string[] = [];
    if (response.data && response.data.items && Array.isArray(response.data.items[0])) {
      response.data.items[0].forEach((item: any) => {
        if (Array.isArray(item) && item[0]) {
          results.push(item[0]);
        }
      });
    }
    
    return results;
  } catch (error) {
    return [];
  }
}

// ============================================================
// 🚀 메인 발굴 함수
// ============================================================

export async function huntCategoryLongtailKeywords(
  category: string,
  target: string,
  count: number = 10
): Promise<CategoryLongtailKeyword[]> {
  console.log(`\n[LONGTAIL] 🔍 ${category} + ${target} 황금키워드 발굴 시작`);
  
  const results: CategoryLongtailKeyword[] = [];
  
  // 1. 실제 키워드 DB에서 가져오기
  const categoryKeywords = REAL_LONGTAIL_KEYWORDS[category];
  let seedKeywords: string[] = [];
  
  if (categoryKeywords && categoryKeywords[target]) {
    seedKeywords = [...categoryKeywords[target]];
    console.log(`[LONGTAIL] 📦 ${target} 타겟 키워드 ${seedKeywords.length}개 로드`);
  } else if (categoryKeywords) {
    // 타겟이 없으면 해당 카테고리의 모든 키워드
    Object.values(categoryKeywords).forEach(kws => {
      seedKeywords.push(...kws);
    });
    console.log(`[LONGTAIL] 📦 ${category} 전체 키워드 ${seedKeywords.length}개 로드`);
  }
  
  // 2. 시즌 키워드 추가
  const now = new Date();
  const month = now.getMonth() + 1;
  let seasonalKeys: string[] = [];
  
  if (month >= 3 && month <= 5) seasonalKeys = SEASONAL_KEYWORDS['봄'];
  else if (month >= 6 && month <= 8) seasonalKeys = SEASONAL_KEYWORDS['여름'];
  else if (month >= 9 && month <= 11) seasonalKeys = SEASONAL_KEYWORDS['가을'];
  else seasonalKeys = SEASONAL_KEYWORDS['겨울'];
  
  // 12월은 크리스마스/연말 추가
  if (month === 12) {
    seasonalKeys = [...seasonalKeys, ...SEASONAL_KEYWORDS['겨울']];
  }
  
  console.log(`[LONGTAIL] 🗓️ 시즌 키워드 ${seasonalKeys.length}개 추가`);
  
  // 3. 네이버 자동완성으로 확장
  const allKeywords = new Set<string>();
  
  // 기본 시드 추가
  seedKeywords.forEach(k => allKeywords.add(k));
  
  // 자동완성 확장 (시드 키워드 기반)
  for (const seed of seedKeywords.slice(0, 5)) {
    try {
      const autocomplete = await getNaverAutocomplete(seed);
      autocomplete.forEach(k => allKeywords.add(k));
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      // 무시
    }
  }
  
  console.log(`[LONGTAIL] 🔗 총 ${allKeywords.size}개 키워드 수집`);
  
  // 4. 각 키워드 분석
  const keywordsArray = Array.from(allKeywords);
  let analyzed = 0;
  
  for (const keyword of keywordsArray) {
    if (results.length >= count * 2) break; // 충분히 모았으면 중단
    
    try {
      // 검색량 조회 (롱테일 키워드는 API에서 '< 10' 반환이 많음)
      let searchVolume: number | null = null;
      let isRealData = false;
      
      if (_searchAdConfig.accessLicense && _searchAdConfig.secretKey) {
        try {
          const volumeData = await getNaverSearchAdKeywordVolume(_searchAdConfig, [keyword]);
          if (volumeData && volumeData.length > 0) {
            const data = volumeData[0];
            const parsePcMobile = (val: any): number | null => {
              if (typeof val === 'number') return Number.isFinite(val) ? val : null;
              if (typeof val === 'string') {
                const cleaned = val.replace(/[^0-9]/g, '');
                if (!cleaned) return null;
                const parsed = parseInt(cleaned, 10);
                return Number.isFinite(parsed) ? parsed : null;
              }
              return null;
            };
            const pc = parsePcMobile((data as any).monthlyPcQcCnt);
            const mobile = parsePcMobile((data as any).monthlyMobileQcCnt);
            searchVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
            
            // API가 실제 값을 반환한 경우
            if (typeof searchVolume === 'number' && searchVolume >= 100) {
              isRealData = true;
            } else {
              // 낮은 값/누락 값도 그대로 유지 (추정값 사용 안 함)
            }
          }
        } catch (e) {
          // API 실패
        }
      }
      
      // 문서수 먼저 조회 (검색량 추정에 사용)
      let documentCount: number | null = null;
      try {
        documentCount = await getNaverBlogDocumentCount(keyword);
      } catch (e) {
        documentCount = null;
      }
      
      if (typeof documentCount === 'number' && documentCount < 100) documentCount = 100;
      
      // 최소 검색량 300 이상만 (미확인 데이터는 제외)
      if (searchVolume === null || searchVolume < 300) continue;
      if (documentCount === null || documentCount <= 0) continue;
      
      // 황금비율 계산
      const goldenRatio = Math.round((searchVolume / documentCount) * 100) / 100;
      
      // Multi-gate 등급 산정: 황금비율 + 문서수 + 검색량 동시 충족
      let grade: CategoryLongtailKeyword['grade'];
      if (goldenRatio >= 5 && documentCount <= 3000 && searchVolume >= 1000) grade = 'SSS';
      else if (goldenRatio >= 3 && documentCount <= 8000 && searchVolume >= 500) grade = 'SS';
      else if (goldenRatio >= 2 && documentCount <= 15000 && searchVolume >= 300) grade = 'S';
      else if (goldenRatio >= 1 && searchVolume >= 200) grade = 'A';
      else if (goldenRatio >= 0.5 && searchVolume >= 100) grade = 'B';
      else grade = 'C';
      
      // C등급도 포함 (롱테일이라 경쟁이 높을 수 있음)
      // 단, 검색량 100 미만은 제외
      if (searchVolume < 100 && grade === 'C') continue;
      
      // 데이터 기반 추천 생성
      const recommendation = grade === 'SSS'
        ? `🔥 초황금! 검색 ${searchVolume.toLocaleString()} / 문서 ${documentCount.toLocaleString()} — 즉시 작성!`
        : grade === 'SS'
        ? `💎 황금키워드 (비율 ${goldenRatio.toFixed(1)}) — 빠른 작성 권장`
        : grade === 'S'
        ? `⭐ 추천 키워드 — 상위노출 가능성 있음`
        : `📝 도전 가능 — 롱테일 확장 추천`;
      
      // 콘텐츠 가이드 생성
      const contentGuide = {
        format: keyword.includes('추천') || keyword.includes('비교') 
          ? '리뷰/추천 리스트' 
          : keyword.includes('방법') || keyword.includes('하는법')
          ? '가이드/튜토리얼'
          : '정보성 포스팅',
        title: `2025 ${keyword} 총정리`,
        length: '2,000~3,000자'
      };
      
      // 황금키워드 이유
      const whyGolden: string[] = [];
      whyGolden.push(`✅ 검색량 ${searchVolume.toLocaleString()}회 - 트래픽 유입 가능`);
      whyGolden.push(`✅ 문서수 ${documentCount.toLocaleString()}개 - 경쟁 ${documentCount < 1000 ? '낮음' : '보통'}`);
      whyGolden.push(`✅ 황금비율 ${goldenRatio} - ${goldenRatio >= 5 ? '블루오션!' : '좋은 기회'}`);
      whyGolden.push(`✅ 타겟: ${target} - 명확한 타겟층`);
      
      results.push({
        keyword,
        searchVolume,
        documentCount,
        goldenRatio,
        grade,
        category,
        target,
        recommendation,
        contentGuide,
        whyGolden
      });
      
      analyzed++;
      
      await new Promise(r => setTimeout(r, 50));
      
    } catch (e) {
      // 오류 무시
    }
  }
  
  console.log(`[LONGTAIL] 📊 ${analyzed}개 분석, ${results.length}개 유효`);
  
  // 황금비율 기준 정렬
  results.sort((a, b) => {
    // 등급 먼저, 같으면 황금비율
    const gradeOrder = { SSS: 0, SS: 1, S: 2, A: 3, B: 4, C: 5 };
    if (gradeOrder[a.grade] !== gradeOrder[b.grade]) {
      return gradeOrder[a.grade] - gradeOrder[b.grade];
    }
    return b.goldenRatio - a.goldenRatio;
  });
  
  console.log(`[LONGTAIL] ✅ ${Math.min(results.length, count)}개 황금키워드 발굴 완료\n`);
  
  return results.slice(0, count);
}

// ============================================================
// 📋 옵션 함수들
// ============================================================

export function getCategoryOptions(): { value: string; label: string }[] {
  return [
    { value: '제품리뷰', label: '🛒 제품 리뷰/추천' },
    { value: '건강', label: '💊 건강/영양제' },
    { value: '여행', label: '✈️ 여행/관광' },
    { value: '뷰티', label: '💄 뷰티/화장품' },
    { value: '육아', label: '👶 육아/아기용품' },
    { value: '전자제품', label: '📱 전자제품/가전' },
    { value: '패션', label: '👗 패션/의류' },
    { value: '재테크', label: '💰 재테크/투자' },
    { value: '교육', label: '📚 교육/자격증' },
    { value: '식품', label: '🍱 식품/밀키트' }
  ];
}

export function getTargetOptions(): { value: string; label: string }[] {
  return [
    { value: '시니어', label: '👴 시니어 (50-70대)' },
    { value: '20대', label: '🎓 20대 (대학생/사회초년생)' },
    { value: '30대', label: '💼 30대 (직장인/신혼)' },
    { value: '40대', label: '👨‍👩‍👧 40대 (학부모/중년)' },
    { value: '직장인', label: '🏢 직장인' },
    { value: '주부', label: '🏠 주부/엄마' },
    { value: '학생', label: '📖 학생/수험생' },
    { value: '신혼부부', label: '💑 신혼부부' },
    { value: '자취생', label: '🏠 자취생/1인가구' },
    { value: '반려동물', label: '🐕 반려동물 양육자' }
  ];
}

export const getAvailableCategories = getCategoryOptions;
export const getAvailableTargets = getTargetOptions;

export function getRecommendedCombinations(): { category: string; target: string; description: string }[] {
  return [
    { category: '건강', target: '시니어', description: '💊 건강/영양제 + 시니어 - 고수익 조합' },
    { category: '육아', target: '30대', description: '👶 육아용품 + 30대 - 인기 조합' },
    { category: '뷰티', target: '20대', description: '💄 뷰티 + 20대 - 트렌드 조합' },
    { category: '재테크', target: '직장인', description: '💰 재테크 + 직장인 - 수익화 조합' },
    { category: '전자제품', target: '자취생', description: '📱 전자제품 + 자취생 - 실용 조합' },
  ];
}

export async function generateCategoryLongtailKeywords(
  options: CategoryLongtailOptions
): Promise<CategoryLongtailKeyword[]> {
  return huntCategoryLongtailKeywords(
    options.category,
    options.target,
    options.count || 10
  );
}
