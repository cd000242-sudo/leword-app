/**
 * 키워드 급상승 이유 분석 유틸리티
 * 네이버 뉴스/블로그/카페 검색을 통해 키워드가 급상승한 이유 파악
 */

import { searchNaverWithApi } from '../naver-crawler';
import { EnvironmentManager } from './environment-manager';
import { classifyKeyword } from './categories';

// ==================== 인터페이스 ====================

export interface TrendAnalysis {
  trendingReason: string;
  whyNow: string;
  source?: string;
  sourceType?: 'news' | 'blog' | 'cafe' | 'default';
}

interface ContentItem {
  title: string;
  description?: string;
  link?: string;
  pubDate?: string;
}

interface KeywordData {
  searchVolume?: number;
  documentCount?: number;
  growthRate?: number;
}

type SourceType = 'news' | 'blog' | 'cafe' | 'default';

// ==================== 상수 ====================


const EVENT_ACTIONS: Record<string, Record<string, string>> = {
  celebrity: {
    '열애': '열애 사실이 공개되며', '결혼': '결혼 소식이 전해지며', '이혼': '이혼 소식이 알려지며',
    '출연': '새로운 작품 출연이 확정되며', '컴백': '컴백 소식이 전해지며', '은퇴': '은퇴 선언으로',
    '논란': '논란이 불거지며', '학폭': '학교폭력 의혹이 제기되며', '폭로': '폭로가 이어지며',
    '사과': '사과문을 발표하며', '해명': '해명에 나서며', '수상': '수상 소식이 전해지며',
    '별세': '별세 소식이 전해지며', '사망': '사망 소식이 전해지며'
  },
  incident: {
    '검찰': '검찰 수사가 진행되며', '경찰': '경찰 수사가 진행되며', '재판': '재판이 진행되며',
    '기소': '기소되며', '구속': '구속되며', '불구속': '불구속 기소되며', '논란': '논란이 확산되며',
    '피해': '피해 사실이 알려지며', '폭로': '폭로가 이어지며', '사고': '사고가 발생하며', '사건': '사건이 발생하며'
  },
  product: {
    '출시': '신제품이 출시되며', '할인': '할인 행사가 진행되며', '세일': '세일이 시작되며',
    '품절': '품절 대란이 일어나며', '리뷰': '리뷰가 화제가 되며', '후기': '후기가 확산되며',
    '추천': '추천 제품으로 주목받으며', '비교': '비교 분석이 화제가 되며'
  },
  sports: {
    '승리': '승리하며', '패배': '패배하며', '우승': '우승하며', '준우승': '준우승하며',
    '득점': '득점하며', '골': '골을 넣으며', '기록': '기록을 세우며',
    '부상': '부상 소식이 전해지며', '이적': '이적 소식이 전해지며'
  },
  entertainment: {
    '방영': '방영이 시작되며', '시청률': '시청률이 화제가 되며', '첫방송': '첫 방송이 시작되며',
    '종영': '종영을 앞두고', '촬영': '촬영 소식이 전해지며', '개봉': '개봉하며', '공개': '공개되며',
    'OST': 'OST가 화제가 되며', '캐스팅': '캐스팅이 발표되며'
  },
  health: {
    '효능': '효능이 주목받으며', '부작용': '부작용이 알려지며', '연구': '연구 결과가 발표되며',
    '권장': '권장 사항이 변경되며', '주의': '주의 사항이 알려지며', '유행': '유행하며',
    '확산': '확산되며', '예방': '예방법이 주목받으며'
  },
  finance: {
    '급등': '급등하며', '급락': '급락하며', '상승': '상승하며', '하락': '하락하며',
    '사상최고': '사상 최고치를 기록하며', '돌파': '돌파하며', '붕괴': '붕괴하며',
    '전망': '전망이 발표되며', '예측': '예측이 화제가 되며'
  },
  travel: {
    '개통': '개통되며', '오픈': '오픈하며', '할인': '할인 행사가 진행되며',
    '성수기': '성수기를 맞아', '비수기': '비수기 특가가 진행되며',
    '추천': '추천 명소로 떠오르며', '인기': '인기를 끌며'
  }
};

// ==================== 메인 함수 ====================

export async function analyzeKeywordTrendingReason(
  keyword: string,
  keywordData?: KeywordData
): Promise<TrendAnalysis> {
  const data = keywordData || { searchVolume: 3000, documentCount: 500, growthRate: 100 };
  
  try {
    const envManager = EnvironmentManager.getInstance();
    const env = envManager.getConfig();
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    
    if (!clientId || !clientSecret) {
      return generateDefaultAnalysis(keyword, data);
    }
    
    // 순차 검색: 뉴스 → 블로그 → 카페
    const { contents, sourceType } = await fetchContents(keyword, clientId, clientSecret);
    
    if (contents.length === 0) {
      return generateDefaultAnalysis(keyword, data);
    }
    
    return generateDetailedAnalysis(keyword, contents, data, sourceType);
  } catch (error: any) {
    console.warn(`[TREND-ANALYZER] "${keyword}" 분석 실패:`, error.message);
    return generateDefaultAnalysis(keyword, data);
  }
}

// ==================== 콘텐츠 수집 ====================

async function fetchContents(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<{ contents: ContentItem[]; sourceType: SourceType }> {
  const sources: Array<{ type: SourceType; apiType: string }> = [
    { type: 'news', apiType: 'news' },
    { type: 'blog', apiType: 'blog' },
    { type: 'cafe', apiType: 'cafearticle' }
  ];
  
  for (const { type, apiType } of sources) {
    try {
      const results = await searchNaverWithApi(
        keyword,
        { clientId, clientSecret },
        apiType,
        { timeout: 5000, retries: 1, display: 10, sort: 'sim' }
      );
      if (results?.length > 0) {
        console.log(`[TREND-ANALYZER] ✅ ${type}에서 ${results.length}개 결과`);
        return { contents: results.slice(0, 10), sourceType: type };
      }
    } catch (e) {}
  }

  // 뉴스/블로그/카페에서 못 찾으면 webkr로라도 근거(제목/설명)를 확보
  try {
    const webResults = await searchNaverWithApi(
      keyword,
      { clientId, clientSecret },
      'webkr',
      { timeout: 5000, retries: 1, display: 10, sort: 'sim' }
    );
    if (webResults?.length > 0) {
      console.log(`[TREND-ANALYZER] ✅ webkr에서 ${webResults.length}개 결과`);
      return { contents: webResults.slice(0, 10), sourceType: 'news' };
    }
  } catch (e) {}
  
  return { contents: [], sourceType: 'default' };
}

// ==================== 분석 생성 ====================

function generateDetailedAnalysis(
  keyword: string,
  contents: ContentItem[],
  keywordData: KeywordData,
  sourceType: SourceType
): TrendAnalysis {
  const allTitles = contents.map(n => cleanHtml(n.title || '')).filter(t => t.length > 0);
  const allDescriptions = contents.map(n => cleanHtml(n.description || '')).filter(d => d.length > 0);
  const bestContent = findBestContent(keyword, contents);
  
  const trendingReason = generateConcreteReason(keyword, bestContent, allTitles, allDescriptions, sourceType);
  const whyNow = generateWhyNowAdvice(keyword, contents, keywordData, sourceType);
  const source = bestContent.title ? cleanHtml(bestContent.title).substring(0, 60) : undefined;
  
  return { trendingReason, whyNow, source, sourceType };
}

function generateConcreteReason(
  keyword: string,
  bestContent: ContentItem,
  allTitles: string[],
  allDescriptions: string[],
  sourceType: SourceType
): string {
  const title = cleanHtml(bestContent.title || '');
  const description = cleanHtml(bestContent.description || '');
  const fullText = [description, ...allDescriptions].join(' ');
  const category = classifyKeyword(keyword).primary;
  
  // 정책 카테고리는 별도 처리
  if (category === 'policy') {
    return generatePolicyExplanation(keyword, title, description, allDescriptions);
  }
  
  // 이벤트 액션 기반 설명 생성
  const actions = EVENT_ACTIONS[category];
  if (actions) {
    const action = findAction(fullText, actions);
    if (action) {
      // 🔥 description을 정리하고 사용 (URL/학술인용 제거)
      const cleanDesc = cleanAndSummarize(description, keyword);
      if (cleanDesc.length > 30) {
        return `${cleanDesc.substring(0, 250)}${cleanDesc.length > 250 ? '...' : ''} 이로 인해 "${keyword}" 검색량이 급증하고 있습니다.`;
      }
      const sourceLabel = getSourceLabel(sourceType, category);
      return `"${keyword}" ${action} 검색량이 급증하고 있습니다. ${sourceLabel}`;
    }
  }
  
  // 기본 설명
  return generateGeneralExplanation(keyword, title, description, allDescriptions, sourceType);
}

function generatePolicyExplanation(keyword: string, title: string, description: string, allDescriptions: string[]): string {
  const fullText = [description, ...allDescriptions].join(' ');
  const parts: string[] = [];
  
  const purpose = extractPattern(fullText, [/(위해|위한|목적|취지)[^.]{10,50}/g]);
  const target = extractMultiPattern(fullText, [
    /(청년|중장년|노인|아동|여성|남성|가구|세대|국민|주민|근로자|자영업자|소상공인)/g,
    /(저소득층|취약계층|무주택자|1인가구|다자녀|한부모)/g
  ]);
  const amount = extractPattern(fullText, [/최대\s*(\d{1,3}(,\d{3})*)\s*원/g, /(\d+)\s*만\s*원/g]);
  const period = extractPattern(fullText, [/(\d{1,2}월\s*\d{1,2}일)/g, /(\d{4}년\s*\d{1,2}월)/g]);
  
  if (purpose) parts.push(purpose);
  if (title.length > 10 && !parts.join('').includes(title.substring(0, 20))) parts.push(title);
  if (target) parts.push(`대상은 ${target}`);
  if (amount) parts.push(`${amount} 지원됩니다`);
  if (period) parts.push(`신청 기간은 ${period}입니다`);
  
  if (parts.length > 0) return parts.join('. ').trim() + '.';
  if (description.length > 30) return description.substring(0, 250) + (description.length > 250 ? '...' : '');
  
  return `"${keyword}" 관련 정책이 시행 또는 변경되어 국민들의 관심이 집중되고 있습니다.`;
}

function generateGeneralExplanation(keyword: string, title: string, description: string, allDescriptions: string[], sourceType: SourceType): string {
  const bestDescription = description.length >= 50 ? description : (allDescriptions.find(d => d.length > 50) || description);
  const sourceLabel = sourceType === 'blog' ? '블로그' : sourceType === 'cafe' ? '카페' : '뉴스';
  
  // 🎯 여러 설명에서 핵심 정보 추출
  const allText = [description, ...allDescriptions].join(' ');
  const coreInfo = extractCoreInformation(keyword, allText);
  
  if (coreInfo) {
    return coreInfo;
  }
  
  if (bestDescription.length > 30) {
    // 설명에서 불필요한 부분 제거하고 핵심만 추출
    const cleanDesc = cleanAndSummarize(bestDescription, keyword);
    return `${cleanDesc} 이로 인해 "${keyword}" 관련 검색이 증가하고 있습니다.`;
  }
  if (title.length > 10) {
    return `"${title}" - ${sourceLabel}에서 화제가 되며 "${keyword}" 검색량이 급증하고 있습니다.`;
  }
  return `"${keyword}" 관련 최신 이슈가 ${sourceLabel}에서 다뤄지며 검색량이 급증하고 있습니다.`;
}

// 🎯 핵심 정보 추출 (누가, 무엇을, 언제, 왜)
function extractCoreInformation(keyword: string, text: string): string | null {
  // 인물 관련
  const personMatch = text.match(/([가-힣]{2,4})\s*(씨|이|는|가|의)?\s*(발표|선언|공개|밝혔|밝히|전했|알려|확인|인정|부인|해명|사과|수상|우승|결혼|열애|이혼|별세|사망|출연|컴백|복귀|은퇴|탈퇴|논란|의혹|기소|구속|석방|무죄|유죄)/);
  if (personMatch) {
    const action = personMatch[3];
    const name = personMatch[1];
    const actionDesc = getActionDescription(action);
    if (actionDesc) {
      return `${name}${personMatch[2] || '이/가'} ${actionDesc} "${keyword}" 검색이 급증하고 있습니다.`;
    }
  }
  
  // 이벤트/사건 관련
  const eventMatch = text.match(/(오늘|어제|최근|이번|지난)\s*([가-힣0-9\s]{5,30})\s*(발생|시작|진행|개최|출시|공개|오픈|개통|시행)/);
  if (eventMatch) {
    return `${eventMatch[1]} ${eventMatch[2]}${eventMatch[2].endsWith('이') || eventMatch[2].endsWith('가') ? '' : '이/가'} ${eventMatch[3]}되어 "${keyword}" 검색이 증가하고 있습니다.`;
  }
  
  // 정책/제도 관련
  const policyMatch = text.match(/(신청|접수|시행|변경|확대|인상|인하|지급|지원)\s*(시작|개시|예정|완료)/);
  if (policyMatch) {
    return `"${keyword}" 관련 ${policyMatch[1]}이 ${policyMatch[2]}되어 검색량이 급증하고 있습니다.`;
  }
  
  // 날짜/기간 관련
  const dateMatch = text.match(/(\d{1,2}월\s*\d{1,2}일|\d{4}년\s*\d{1,2}월)/);
  if (dateMatch) {
    const context = text.substring(Math.max(0, text.indexOf(dateMatch[0]) - 30), text.indexOf(dateMatch[0]) + dateMatch[0].length + 50);
    if (context.length > 20) {
      return `${dateMatch[0]} ${cleanAndSummarize(context, keyword)} 이로 인해 "${keyword}" 검색이 증가하고 있습니다.`;
    }
  }
  
  return null;
}

// 액션에 대한 설명 생성
function getActionDescription(action: string): string | null {
  const actionMap: Record<string, string> = {
    '발표': '발표하여', '선언': '선언하여', '공개': '공개하여', 
    '밝혔': '밝혀', '밝히': '밝혀', '전했': '전해',
    '알려': '알려져', '확인': '확인되어', '인정': '인정하여',
    '부인': '부인하여', '해명': '해명하여', '사과': '사과하여',
    '수상': '수상하여', '우승': '우승하여', '결혼': '결혼 소식이 전해져',
    '열애': '열애 사실이 공개되어', '이혼': '이혼 소식이 전해져',
    '별세': '별세 소식이 전해져', '사망': '사망 소식이 전해져',
    '출연': '출연이 확정되어', '컴백': '컴백을 예고하여',
    '복귀': '복귀를 선언하여', '은퇴': '은퇴를 선언하여',
    '탈퇴': '탈퇴를 발표하여', '논란': '논란이 불거져',
    '의혹': '의혹이 제기되어', '기소': '기소되어',
    '구속': '구속되어', '석방': '석방되어',
    '무죄': '무죄 판결을 받아', '유죄': '유죄 판결을 받아'
  };
  return actionMap[action] || null;
}

// 텍스트 정리 및 요약
function cleanAndSummarize(text: string, keyword: string): string {
  // HTML 태그 및 특수문자 제거
  let clean = text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  
  // 🔥 URL 제거 (http, https, www)
  clean = clean.replace(/https?:\/\/[^\s]+/gi, '').replace(/www\.[^\s]+/gi, '');
  
  // 🔥 학술 인용 패턴 제거 (Kim, C. Y., & Chung, S. H. (2024). ...)
  clean = clean.replace(/[A-Za-z]+,\s*[A-Z]\.\s*[A-Z]?\.?,?\s*&?\s*[A-Za-z]*,?\s*[A-Z]?\.?\s*[A-Z]?\.?\s*\(\d{4}\)\.?[^.]*\./gi, '');
  
  // 🔥 PDF 파일명 제거
  clean = clean.replace(/[A-Za-z0-9_-]+\.pdf/gi, '');
  
  // 🔥 영어 문장 제거 (3단어 이상 연속 영어)
  clean = clean.replace(/[A-Za-z]{3,}(\s+[A-Za-z]{2,}){2,}/g, '');
  
  // 연속 공백 정리
  clean = clean.replace(/\s+/g, ' ').trim();
  
  // 너무 긴 경우 키워드 주변 문맥만 추출
  if (clean.length > 200) {
    const keywordIndex = clean.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex !== -1) {
      const start = Math.max(0, keywordIndex - 50);
      const end = Math.min(clean.length, keywordIndex + keyword.length + 150);
      clean = (start > 0 ? '...' : '') + clean.substring(start, end) + (end < clean.length ? '...' : '');
    } else {
      clean = clean.substring(0, 200) + '...';
    }
  }
  
  // 정리 후 너무 짧으면 null 반환
  if (clean.length < 10) {
    return '';
  }
  
  return clean;
}

function generateWhyNowAdvice(keyword: string, contents: ContentItem[], keywordData: KeywordData, sourceType: SourceType): string {
  const { searchVolume = 0, documentCount = 0, growthRate = 0 } = keywordData;
  const advice: string[] = [];
  
  if (searchVolume > 10000) advice.push(`월 검색량 ${searchVolume.toLocaleString()}회로 높은 트래픽 유입 기대`);
  else if (searchVolume > 1000) advice.push(`월 검색량 ${searchVolume.toLocaleString()}회로 안정적인 트래픽 확보 가능`);
  
  if (documentCount < 100) advice.push(`경쟁 문서 ${documentCount}개로 매우 적어 상위 노출 확률 높음`);
  else if (documentCount < 1000) advice.push(`경쟁 문서 ${documentCount}개로 비교적 진입 용이`);
  
  if (growthRate > 200) advice.push(`검색량 ${Math.round(growthRate)}% 급상승 중으로 조기 진입 효과 극대화 가능`);
  else if (growthRate > 100) advice.push(`검색량 ${Math.round(growthRate)}% 상승 중으로 트렌드 선점 가능`);
  
  const sourceLabel = sourceType === 'blog' ? '블로그' : sourceType === 'cafe' ? '카페' : '뉴스';
  if (contents.length >= 5) advice.push(`최근 ${contents.length}개 ${sourceLabel}에서 다뤄지며 이슈화 진행 중`);
  
  advice.push('지금 작성하면 검색 상위 노출로 초기 트래픽 선점 가능');
  return advice.slice(0, 3).join(' • ');
}

function generateDefaultAnalysis(keyword: string, keywordData: KeywordData): TrendAnalysis {
  const { searchVolume = 0, documentCount = 0, growthRate = 0 } = keywordData;
  
  let trendingReason: string;

  const category = classifyKeyword(keyword).primary;
  const kw = (keyword || '').trim();

  const growthLabel = growthRate > 0 ? ` (검색량 +${Math.round(growthRate)}%)` : '';

  // ✅ 유형별 구체화된 기본 설명 (외부 기사 내용을 단정하지 않고 "~관련 소식/이슈" 형태로 표현)
  if (category === 'policy') {
    trendingReason = `"${kw}" 관련 정책/제도 변경 또는 신청 일정 이슈로 관심이 몰리고 있습니다${growthLabel}. 보통 자격조건/신청방법/지급일/필요서류를 찾는 수요가 함께 증가합니다.`;
  } else if (category === 'entertainment' && (kw.includes('시즌') || kw.includes('season'))) {
    trendingReason = `"${kw}"는 시즌 업데이트(제작/방영/캐스팅/티저 공개/방영일) 관련 소식이 돌면서 검색이 급증하는 패턴입니다${growthLabel}. 시청 포인트, 방영 일정, 출연진 변화, 전 시즌 정리 콘텐츠가 함께 소비됩니다.`;
  } else if (category === 'entertainment') {
    trendingReason = `"${kw}"는 방송/콘텐츠 공개(첫방/회차/예고/OTT 공개) 관련 이슈로 검색이 늘어나는 유형입니다${growthLabel}. 핵심 줄거리, 출연진, 공개 일정, 다시보기 정보가 같이 검색됩니다.`;
  } else if (category === 'celebrity') {
    trendingReason = `"${kw}"는 연예 이슈(열애/결혼/출연/논란/해명 등)로 검색이 급증하는 대표 유형입니다${growthLabel}. 사실관계 정리, 관련 인물 소개, 타임라인 형태 콘텐츠가 반응이 좋습니다.`;
  } else if (category === 'sports') {
    trendingReason = `"${kw}"는 경기 결과/선수 이슈(승패, 기록, 부상, 이적)로 검색량이 튀는 유형입니다${growthLabel}. 하이라이트, 스탯, 다음 일정/중계 정보가 함께 조회됩니다.`;
  } else if (category === 'incident') {
    trendingReason = `"${kw}"는 사건/사고/수사 진행 등 이슈성 검색어로 확산되는 유형입니다${growthLabel}. 핵심 요약, 진행 상황, 공식 발표/후속 조치 정리형 콘텐츠 수요가 증가합니다.`;
  } else if (searchVolume > 5000) {
    trendingReason = `"${kw}"는 월 검색량 ${searchVolume.toLocaleString()}회로 수요가 꾸준히 높은 키워드입니다${growthLabel}. 최근 이슈가 겹치면 단기적으로 검색량이 더 튈 수 있습니다.`;
  } else if (growthRate > 200) {
    trendingReason = `"${kw}"는 단기간에 급격히 언급량이 늘면서 검색이 폭발하는 패턴입니다${growthLabel}. 지금 시점의 핵심 이슈(무슨 일이 있었는지) 요약형 콘텐츠가 효과적입니다.`;
  } else if (growthRate > 100) {
    trendingReason = `"${kw}"는 최근 언급량 증가로 검색이 상승세인 키워드입니다${growthLabel}. 관련 최신 정보/정리형 글이 특히 잘 먹힙니다.`;
  } else {
    trendingReason = `"${kw}" 관련 최신 이슈/업데이트로 관심이 증가하고 있습니다${growthLabel}.`;
  }
  
  const whyNow = documentCount < 100
    ? `경쟁 문서가 ${documentCount}개로 매우 적어 조기 진입 시 상위 노출 확률 높음 • 검색량 급상승 중으로 트래픽 유입 잠재력 큼 • 지금 작성하면 트렌드 선점 가능`
    : generateWhyNowAdvice(keyword, [], keywordData, 'default');
  
  return { trendingReason, whyNow, sourceType: 'default' };
}

// ==================== 유틸리티 ====================

function cleanHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBestContent(keyword: string, contents: ContentItem[]): ContentItem {
  const withKeyword = contents.find(n => n.title && cleanHtml(n.title).includes(keyword));
  if (withKeyword) return withKeyword;
  return contents.reduce((best, curr) => 
    (curr.description?.length || 0) > (best.description?.length || 0) ? curr : best,
    contents[0] || { title: '', description: '' }
  );
}


function findAction(text: string, actions: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(actions)) {
    if (text.includes(key)) return value;
  }
  return null;
}

function getSourceLabel(sourceType: SourceType, category: string): string {
  const labels: Record<string, Record<string, string>> = {
    celebrity: { blog: '팬들과 대중의 관심이 집중되고 있어', news: '뉴스에서 다뤄지며', default: '관련 콘텐츠 작성 시 높은 트래픽을 기대할 수 있습니다.' },
    product: { blog: '블로거들의 리뷰가 확산되며', news: '소비자들의 관심이 집중되어', default: '구매 정보나 비교 분석 콘텐츠가 주목받을 수 있습니다.' },
    entertainment: { blog: '블로거들 사이에서 리뷰와 분석 글이 인기를 끌고 있어', news: '시청자들의 관심이 집중되어', default: '관련 콘텐츠가 주목받을 수 있습니다.' },
    health: { blog: '건강 정보를 다루는 블로거들 사이에서 화제가 되고 있어', news: '관련 정보에 대한 관심이 높아져', default: '정확한 정보를 제공하는 콘텐츠가 주목받을 수 있습니다.' },
    travel: { blog: '여행 블로거들 사이에서 화제가 되고 있어', news: '여행 계획을 세우는 사람들의 관심이 집중되어', default: '여행 정보, 코스 추천 등의 콘텐츠가 주목받을 수 있습니다.' }
  };
  return labels[category]?.[sourceType] || labels[category]?.default || '관련 콘텐츠가 주목받을 수 있습니다.';
}

function extractPattern(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return '';
}

function extractMultiPattern(text: string, patterns: RegExp[]): string {
  const results: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) results.push(...matches);
  }
  return [...new Set(results)].slice(0, 3).join(', ');
}