/**
 * 연상 키워드 마인드맵 생성기
 * 입력 키워드로부터 재귀적으로 연관/연상/관련 키워드를 확장
 * 검색의도를 고려한 스마트 확장 지원
 */

import { getNaverAutocompleteKeywords } from './naver-autocomplete';
import { getNaverSearchAdKeywordSuggestions } from './naver-searchad-api';
import { getNaverRelatedKeywords } from './naver-datalab-api';

// ==================== 인터페이스 ====================

export interface MindmapNode {
  keyword: string;
  level: number;
  parent: string | null;
  children: MindmapNode[];
  searchVolume?: number;
  competition?: number;
  source: 'input' | 'related' | 'autocomplete' | 'searchad' | 'expanded' | 'intent' | 'competitor';
  intentType?: string;
}

export interface KeywordExpansionOptions {
  maxDepth?: number;
  maxKeywordsPerLevel?: number;
  maxTotalKeywords?: number;
  clientId?: string;
  clientSecret?: string;
  searchAdLicense?: string;
  searchAdSecret?: string;
  searchAdCustomerId?: string;
  smartExpansion?: boolean;
  onProgress?: (progress: ProgressInfo) => void;
}

interface ProgressInfo {
  currentDepth: number;
  currentKeyword: string;
  totalProcessed: number;
  queueLength: number;
  collectedKeywords: number;
  message: string;
}

interface SearchIntent {
  type: 'informational' | 'transactional' | 'navigational' | 'commercial' | 'news' | 'problem';
  confidence: number;
  keywords: string[];
}

// ==================== 상수 ====================

const INTENT_PATTERNS: Record<string, string[]> = {
  news: ['유출', '사건', '사고', '논란', '이슈', '속보', '뉴스', '발표', '공지', '폭로', '해킹', '피해', '문제', '조사', '수사', '고소', '고발', '처벌', '벌금', '보상'],
  problem: ['해결', '방법', '대처', '대응', '확인', '조회', '신고', '피해', '보호', '예방', '복구', '차단', '삭제', '변경', '환불', '보상', '신청', '접수'],
  informational: ['뜻', '의미', '정의', '개념', '설명', '이유', '원인', '배경', '역사', '종류', '유형', '특징', '장단점', '비교', '차이', '현황', '통계', '사례'],
  transactional: ['가격', '비용', '할인', '구매', '구입', '판매', '주문', '배송', '무료', '쿠폰', '이벤트', '프로모션', '최저가', '싸게'],
  commercial: ['추천', '순위', '랭킹', '베스트', '인기', '후기', '리뷰', '평가', '비교', '분석', 'vs', 'TOP', '1위'],
  navigational: ['공식', '홈페이지', '사이트', '앱', '어플', '로그인', '회원가입', '고객센터', '문의', '연락처', '위치', '주소']
};

const INTENT_EXPANSION_KEYWORDS: Record<string, string[]> = {
  news: ['최신', '속보', '업데이트', '현재', '상황', '진행', '결과', '후속', '관련', '연관', '추가', '정리', '요약', '타임라인', '경과'],
  problem: ['해결방법', '대처법', '확인방법', '신고방법', '피해신고', '피해보상', '피해확인', '예방법', '보호방법', '복구방법', '차단방법', '삭제방법', '신청방법', '접수방법', '문의처'],
  informational: ['뜻', '의미', '정의', '개념', '설명', '이유', '원인', '배경', '종류', '유형', '특징', '현황', '통계', '사례', '예시'],
  transactional: ['가격', '비용', '할인', '쿠폰', '이벤트', '무료', '최저가', '할인코드', '프로모션'],
  commercial: ['추천', '순위', '베스트', '인기', '후기', '리뷰', '평가', '비교', '분석', 'TOP10', '1위'],
  navigational: ['공식홈페이지', '사이트', '앱', '고객센터', '문의', '연락처', '로그인', '회원가입']
};

const COMPETITOR_MAPS: Record<string, Record<string, string[]>> = {
  ecommerce: {
    '쿠팡': ['지마켓', '11번가', '옥션', '위메프', '티몬', '네이버쇼핑', '롯데온', 'SSG'],
    '지마켓': ['쿠팡', '11번가', '옥션', '위메프', '티몬', '네이버쇼핑'],
    '11번가': ['쿠팡', '지마켓', '옥션', '위메프', '티몬', '네이버쇼핑'],
    '옥션': ['쿠팡', '지마켓', '11번가', '위메프', '티몬'],
    '위메프': ['쿠팡', '티몬', '지마켓', '11번가'],
    '티몬': ['쿠팡', '위메프', '지마켓', '11번가'],
    '네이버쇼핑': ['쿠팡', '지마켓', '11번가']
  },
  delivery: {
    '배달의민족': ['요기요', '쿠팡이츠', '배민'],
    '배민': ['요기요', '쿠팡이츠', '배달의민족'],
    '요기요': ['배달의민족', '쿠팡이츠', '배민'],
    '쿠팡이츠': ['배달의민족', '요기요', '배민']
  },
  finance: {
    '카카오뱅크': ['토스뱅크', '케이뱅크', '신한은행', '국민은행'],
    '토스뱅크': ['카카오뱅크', '케이뱅크', '신한은행', '국민은행'],
    '케이뱅크': ['카카오뱅크', '토스뱅크', '신한은행', '국민은행'],
    '토스': ['카카오페이', '네이버페이', '삼성페이'],
    '카카오페이': ['토스', '네이버페이', '삼성페이'],
    '네이버페이': ['토스', '카카오페이', '삼성페이']
  },
  sns: {
    '인스타그램': ['페이스북', '틱톡', '유튜브', '트위터', 'X'],
    '페이스북': ['인스타그램', '틱톡', '유튜브', '트위터'],
    '틱톡': ['인스타그램', '유튜브', '페이스북'],
    '유튜브': ['틱톡', '인스타그램', '네이버TV'],
    '카카오톡': ['라인', '텔레그램', '위챗'],
    '네이버': ['구글', '다음', '카카오'],
    '구글': ['네이버', '다음', '빙']
  }
};

// ==================== 검색의도 분석 ====================

function analyzeSearchIntent(keyword: string): SearchIntent {
  const kw = keyword.toLowerCase();
  const scores: Record<string, number> = { news: 0, problem: 0, informational: 0, transactional: 0, commercial: 0, navigational: 0 };
  
  for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (kw.includes(pattern)) scores[type] += 2;
    }
  }
  
  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sortedScores[0];
  
  if (topScore === 0) {
    return { type: 'informational', confidence: 0.5, keywords: INTENT_EXPANSION_KEYWORDS.informational };
  }
  
  return {
    type: topType as SearchIntent['type'],
    confidence: Math.min(topScore / 10, 1),
    keywords: INTENT_EXPANSION_KEYWORDS[topType] || []
  };
}

// ==================== 필터링 함수 ====================

function filterBySearchIntent(keywords: string[], originalKeyword: string, intent: SearchIntent): string[] {
  if (intent.type !== 'news' && intent.type !== 'problem') return keywords;
  
  const original = originalKeyword.toLowerCase();
  const excludePatterns = ['가격', '비용', '할인', '구매', '구입', '판매', '주문', '배송', '무료', '쿠폰', '이벤트', '최저가', '싸게', '추천', '순위', '베스트', '인기', '맛집', '여행', '브랜드', '모델', '사양', '스펙'];
  
  return keywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    for (const pattern of excludePatterns) {
      if (kwLower.includes(pattern) && !original.includes(pattern)) return false;
    }
    return true;
  });
}

function filterRepetitiveKeywords(keywords: string[]): string[] {
  return keywords.filter(kw => {
    const words = kw.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length >= 3) {
      // 연속 반복 체크
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i + 1]) return false;
      }
      // 3번 이상 등장 체크
      const wordCount = new Map<string, number>();
      for (const word of words) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
        if (wordCount.get(word)! >= 3) return false;
      }
    }
    
    return kw.length <= 40;
  });
}

function filterLowQualityKeywords(keywords: string[], parentKeyword: string): string[] {
  const parentLower = parentKeyword.toLowerCase();
  
  return keywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    if (kwLower.startsWith(parentLower) && kwLower.length <= parentLower.length + 2) return false;
    if (/\d{3,}$/.test(kw)) return false;
    if (/[!@#$%^&*()=+\[\]{};:'",.<>?\\|`~]/.test(kw)) return false;
    if (/\s+\d+$|\.+$|ㅋ+$|ㅎ+$|ㄱ+$/.test(kw)) return false;
    return true;
  });
}

function applyAllFilters(keywords: string[], parentKeyword: string): string[] {
  return filterLowQualityKeywords(filterRepetitiveKeywords(keywords), parentKeyword);
}

// ==================== 키워드 생성 ====================

function generateCompetitorKeywords(keyword: string): string[] {
  const competitors: string[] = [];
  const kw = keyword.toLowerCase();
  
  for (const map of Object.values(COMPETITOR_MAPS)) {
    for (const [brand, comps] of Object.entries(map)) {
      if (kw.includes(brand.toLowerCase())) {
        for (const comp of comps) {
          const newKeyword = keyword.replace(new RegExp(brand, 'gi'), comp);
          if (newKeyword !== keyword) competitors.push(newKeyword);
        }
        break;
      }
    }
  }
  
  return competitors.slice(0, 5);
}

function generateIntentBasedKeywords(keyword: string, intent: SearchIntent): string[] {
  // ❌ 단순 조합 키워드 생성 제거 - 실제 자동완성/연관검색어만 사용
  // 가짜 키워드를 만들지 않음
  return [];
}

// ==================== API 호출 ====================

async function getRelatedKeywords(keyword: string, clientId?: string, clientSecret?: string): Promise<string[]> {
  if (!clientId || !clientSecret) return [];
  
  try {
    const related = await getNaverRelatedKeywords(keyword, { clientId, clientSecret }, { limit: 30 });
    return related.map(k => k.keyword || '').filter(k => k.length > 0);
  } catch {
    return [];
  }
}

async function getAutocompleteKeywords(keyword: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const acUrl = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
    
    const response = await fetch(acUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://search.naver.com/'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((itemGroup: any[]) => {
          if (Array.isArray(itemGroup)) {
            itemGroup.forEach((item: any) => {
              if (Array.isArray(item) && item[0]) {
                const suggestion = item[0].toString().trim();
                if (suggestion.length >= 2 && suggestion.length <= 40 && /[가-힣]/.test(suggestion) && !suggestion.startsWith('및 ') && !/ 및 /.test(suggestion)) {
                  results.push(suggestion);
                }
              }
            });
          }
        });
      }
    }
    
    // 자모 확장
    if (results.length < 10) {
      const jamoList = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];
      for (const jamo of jamoList) {
        try {
          const jamoUrl = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword + ' ' + jamo)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
          const jamoRes = await fetch(jamoUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
          
          if (jamoRes.ok) {
            const jamoData = await jamoRes.json();
            if (jamoData.items?.[0]) {
              jamoData.items[0].forEach((item: any) => {
                if (Array.isArray(item) && item[0]) {
                  const suggestion = item[0].toString().trim();
                  if (suggestion.length >= 2 && suggestion.length <= 40 && /[가-힣]/.test(suggestion) && !results.includes(suggestion)) {
                    results.push(suggestion);
                  }
                }
              });
            }
          }
          await new Promise(r => setTimeout(r, 30));
        } catch {}
      }
    }
    
    return results;
  } catch {
    return [];
  }
}

async function getSearchAdKeywords(keyword: string, accessLicense: string, secretKey: string, customerId: string): Promise<string[]> {
  try {
    const suggestions = await getNaverSearchAdKeywordSuggestions({ accessLicense, secretKey, customerId }, keyword, 100);
    return suggestions
      .filter(s => ((s.monthlyPcQcCnt || 0) + (s.monthlyMobileQcCnt || 0)) >= 10 && s.keyword?.length > 0)
      .map(s => s.keyword || '');
  } catch {
    return [];
  }
}

// ==================== 유틸리티 ====================

function countTotalKeywords(node: MindmapNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countTotalKeywords(child), 0);
}

export function flattenMindmap(node: MindmapNode): MindmapNode[] {
  const result: MindmapNode[] = [];
  const queue: MindmapNode[] = [node];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    queue.push(...current.children);
  }
  
  return result;
}

export function extractAllKeywords(node: MindmapNode): string[] {
  return [...new Set(flattenMindmap(node).map(n => n.keyword))];
}

export function groupByLevel(node: MindmapNode): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  
  for (const n of flattenMindmap(node)) {
    if (!groups.has(n.level)) groups.set(n.level, []);
    groups.get(n.level)!.push(n.keyword);
  }
  
  return groups;
}

// ==================== 메인 함수 ====================

export async function generateKeywordMindmap(keyword: string, options: KeywordExpansionOptions = {}): Promise<MindmapNode> {
  const {
    maxDepth = 3,
    maxKeywordsPerLevel = 50,
    maxTotalKeywords,
    clientId,
    clientSecret,
    searchAdLicense,
    searchAdSecret,
    searchAdCustomerId,
    smartExpansion = true,
    onProgress
  } = options;

  console.log(`[MINDMAP] 키워드 마인드맵 생성 시작: "${keyword}"`);
  const depthLabel = maxDepth >= 999 ? '무제한' : maxDepth.toString();
  console.log(`[MINDMAP] 설정: 최대 깊이 ${depthLabel}, 레벨당 ${maxKeywordsPerLevel}개${maxTotalKeywords ? `, 전체 ${maxTotalKeywords}개` : ', 전체 무제한'}`);

  const intent = analyzeSearchIntent(keyword);
  console.log(`[MINDMAP] 검색의도: ${intent.type} (신뢰도: ${(intent.confidence * 100).toFixed(0)}%)`);

  const rootNode: MindmapNode = { keyword, level: 0, parent: null, children: [], source: 'input', intentType: intent.type };
  const visited = new Set<string>([keyword.toLowerCase()]);
  const queue: Array<{ node: MindmapNode; depth: number }> = [{ node: rootNode, depth: 0 }];
  let totalProcessed = 0;
  let collectedKeywords = 1;

  onProgress?.({ currentDepth: 0, currentKeyword: keyword, totalProcessed: 0, queueLength: 1, collectedKeywords: 1, message: `시작... (검색의도: ${intent.type})` });

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    totalProcessed++;

    // ⚠️ 무한 확장: maxDepth가 999 이상이면 깊이 제한 없음
    if (maxDepth < 999 && depth >= maxDepth) continue;
    if (maxTotalKeywords && collectedKeywords >= maxTotalKeywords) break;

    console.log(`[MINDMAP] Level ${depth + 1}: "${node.keyword}" 확장 중...`);
    const depthLabel = maxDepth >= 999 ? '∞' : maxDepth.toString();
    onProgress?.({ currentDepth: depth + 1, currentKeyword: node.keyword, totalProcessed, queueLength: queue.length, collectedKeywords, message: `Level ${depth + 1}/${depthLabel}: "${node.keyword}" 처리 중...` });

    // 키워드 수집
    let relatedKws = await getRelatedKeywords(node.keyword, clientId, clientSecret);
    let autocompleteKws = await getAutocompleteKeywords(node.keyword);
    let searchAdKws = searchAdLicense && searchAdSecret && searchAdCustomerId 
      ? await getSearchAdKeywords(node.keyword, searchAdLicense, searchAdSecret, searchAdCustomerId) 
      : [];

    // 스마트 확장
    if (smartExpansion) {
      relatedKws = filterBySearchIntent(relatedKws, keyword, intent);
      autocompleteKws = filterBySearchIntent(autocompleteKws, keyword, intent);
      searchAdKws = filterBySearchIntent(searchAdKws, keyword, intent);
    }

    // 검색의도/경쟁사 키워드 (Level 1에서만)
    const intentKws = smartExpansion && depth === 0 ? generateIntentBasedKeywords(node.keyword, intent) : [];
    const competitorKws = smartExpansion && depth === 0 ? generateCompetitorKeywords(node.keyword) : [];

    // 필터링 적용
    relatedKws = applyAllFilters(relatedKws, node.keyword);
    autocompleteKws = applyAllFilters(autocompleteKws, node.keyword);
    searchAdKws = applyAllFilters(searchAdKws, node.keyword);

    // 병합 및 중복 제거
    const allKeywords = [
      ...relatedKws.map(k => ({ keyword: k, source: 'related' as const })),
      ...autocompleteKws.map(k => ({ keyword: k, source: 'autocomplete' as const })),
      ...searchAdKws.map(k => ({ keyword: k, source: 'searchad' as const })),
      ...intentKws.map(k => ({ keyword: k, source: 'intent' as const })),
      ...competitorKws.map(k => ({ keyword: k, source: 'competitor' as const }))
    ];

    const uniqueKeywords = allKeywords
      .filter(({ keyword: k }) => !visited.has(k.toLowerCase()) && k.trim().length > 0)
      .slice(0, maxKeywordsPerLevel);

    // 자식 노드 생성
    for (const { keyword: childKeyword, source } of uniqueKeywords) {
      if (maxTotalKeywords && collectedKeywords >= maxTotalKeywords) break;
      
      visited.add(childKeyword.toLowerCase());
      const childNode: MindmapNode = { keyword: childKeyword, level: depth + 1, parent: node.keyword, children: [], source, intentType: intent.type };
      node.children.push(childNode);
      collectedKeywords++;

      // ⚠️ 무한 확장: maxDepth가 999 이상이면 깊이 제한 없음
      const canExpand = maxDepth >= 999 || depth + 1 < maxDepth;
      if (canExpand && (!maxTotalKeywords || collectedKeywords < maxTotalKeywords)) {
        queue.push({ node: childNode, depth: depth + 1 });
      }
    }

    if (maxTotalKeywords && collectedKeywords >= maxTotalKeywords) queue.length = 0;

    console.log(`[MINDMAP] "${node.keyword}" 자식 ${node.children.length}개 생성`);
    onProgress?.({ currentDepth: depth + 1, currentKeyword: node.keyword, totalProcessed, queueLength: queue.length, collectedKeywords, message: `Level ${depth + 1} 완료: ${node.children.length}개 발견 (총 ${collectedKeywords}개)` });

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const totalKeywords = countTotalKeywords(rootNode);
  console.log(`[MINDMAP] ✅ 완료: 총 ${totalKeywords}개 키워드`);
  onProgress?.({ currentDepth: maxDepth, currentKeyword: keyword, totalProcessed, queueLength: 0, collectedKeywords: totalKeywords, message: `✅ 완료! 총 ${totalKeywords}개 키워드 (검색의도: ${intent.type})` });

  return rootNode;
}