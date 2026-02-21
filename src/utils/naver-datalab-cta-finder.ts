/**
 * 네이버 데이터랩 API를 활용한 CTA 링크 발굴
 * 트렌드 키워드와 연관 키워드를 분석하여 관련성이 높은 공식 사이트를 찾습니다.
 */

import { getNaverTrendKeywords, getNaverRelatedKeywords, NaverDatalabConfig } from './naver-datalab-api';
import { getValidNaverLinks } from './naver-search-validator';

export interface CtaLinkCandidate {
  url: string;
  title: string;
  relevance: number; // 관련성 점수 (0-100)
  searchVolume: number; // 검색량
  source: 'trend' | 'related' | 'direct'; // 출처
  keyword: string; // 발견된 키워드
}

export interface DatalabCtaOptions {
  maxResults?: number; // 최대 결과 수
  minRelevance?: number; // 최소 관련성 점수
  includeTrendKeywords?: boolean; // 트렌드 키워드 포함 여부
  includeRelatedKeywords?: boolean; // 연관 키워드 포함 여부
  validateLinks?: boolean; // 링크 유효성 검증 여부
}

/**
 * 네이버 데이터랩 API를 활용하여 CTA 링크 후보 발굴
 */
export async function findCtaLinksViaDatalab(
  topic: string,
  keywords: string[],
  config: NaverDatalabConfig,
  options: DatalabCtaOptions = {}
): Promise<CtaLinkCandidate[]> {
  const {
    maxResults = 10,
    minRelevance = 50,
    includeTrendKeywords = true,
    includeRelatedKeywords = true,
    validateLinks = true
  } = options;

  const candidates: CtaLinkCandidate[] = [];
  const seenUrls = new Set<string>();

  try {
    // 1. 트렌드 키워드 조회 (최근 30일)
    if (includeTrendKeywords) {
      console.log('[DATALAB-CTA] 트렌드 키워드 조회 중...');
      try {
        const trendKeywords = await getNaverTrendKeywords(
          config,
          {
            keywords: [topic, ...keywords.slice(0, 3)],
            startDate: getDateDaysAgo(30),
            endDate: getDateToday(),
            timeUnit: 'date'
          }
        );

        // 트렌드 키워드로 검색하여 링크 찾기
        for (const trend of trendKeywords.slice(0, 5)) {
          if (trend.keyword && trend.searchVolume && trend.searchVolume > 0) {
            try {
              const links = await getValidNaverLinks(
                trend.keyword,
                config,
                {
                  maxResults: 3,
                  validateLinks: validateLinks
                }
              );

        for (const link of links) {
          // 블로그/카페 완전 차단
          const urlLower = link.url.toLowerCase();
          const isBlocked = [
            'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr',
            'blogspot.com', 'wordpress.com', 'velog.io', 'medium.com',
            'naver.com/blog', 'daum.net/cafe', 'cafe.daum.net'
          ].some(domain => urlLower.includes(domain));
          
          if (isBlocked) {
            continue; // 블로그/카페는 완전히 제외
          }
          
          if (!seenUrls.has(link.url)) {
            seenUrls.add(link.url);
            candidates.push({
              url: link.url,
              title: link.title || trend.keyword,
              relevance: calculateRelevance(topic, keywords, trend.keyword, link.title || ''),
              searchVolume: trend.searchVolume || 0,
              source: 'trend',
              keyword: trend.keyword
            });
          }
        }
            } catch (error) {
              console.warn(`[DATALAB-CTA] 트렌드 키워드 "${trend.keyword}" 검색 실패:`, error);
            }
          }
        }
      } catch (error) {
        console.warn('[DATALAB-CTA] 트렌드 키워드 조회 실패:', error);
      }
    }

    // 2. 연관 키워드 조회
    if (includeRelatedKeywords) {
      console.log('[DATALAB-CTA] 연관 키워드 조회 중...');
      try {
        // 주제와 주요 키워드로 연관 키워드 조회
        const searchKeywords = [topic, ...keywords.slice(0, 2)].filter(k => k && k.length > 0);
        
        for (const baseKeyword of searchKeywords) {
          try {
            const relatedKeywords = await getNaverRelatedKeywords(
              baseKeyword,
              config,
              {
                limit: 5,
                page: 0
              }
            );

            // 연관 키워드로 검색하여 링크 찾기
            for (const related of relatedKeywords.slice(0, 3)) {
              if (related.keyword && related.keyword !== baseKeyword) {
                try {
                  const links = await getValidNaverLinks(
                    related.keyword,
                    config,
                    {
                      maxResults: 2,
                      validateLinks: validateLinks
                    }
                  );

                  for (const link of links) {
                    // 블로그/카페 완전 차단
                    const urlLower = link.url.toLowerCase();
                    const isBlocked = [
                      'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr',
                      'blogspot.com', 'wordpress.com', 'velog.io', 'medium.com',
                      'naver.com/blog', 'daum.net/cafe', 'cafe.daum.net'
                    ].some(domain => urlLower.includes(domain));
                    
                    if (isBlocked) {
                      continue; // 블로그/카페는 완전히 제외
                    }
                    
                    if (!seenUrls.has(link.url)) {
                      seenUrls.add(link.url);
                      candidates.push({
                        url: link.url,
                        title: link.title || related.keyword,
                        relevance: calculateRelevance(topic, keywords, related.keyword, link.title || ''),
                        searchVolume: related.searchVolume || 0,
                        source: 'related',
                        keyword: related.keyword
                      });
                    }
                  }
                } catch (error) {
                  console.warn(`[DATALAB-CTA] 연관 키워드 "${related.keyword}" 검색 실패:`, error);
                }
              }
            }

            // API 호출 간격 조절
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.warn(`[DATALAB-CTA] 연관 키워드 조회 실패 (${baseKeyword}):`, error);
          }
        }
      } catch (error) {
        console.warn('[DATALAB-CTA] 연관 키워드 조회 실패:', error);
      }
    }

    // 3. 직접 키워드로 검색 (주제와 주요 키워드)
    console.log('[DATALAB-CTA] 직접 키워드 검색 중...');
    const directKeywords = [topic, ...keywords.slice(0, 2)].filter(k => k && k.length > 0);
    
    for (const keyword of directKeywords) {
      try {
        const links = await getValidNaverLinks(
          keyword,
          config,
          {
            maxResults: 3,
            validateLinks: validateLinks
          }
        );

        for (const link of links) {
          // 블로그/카페 완전 차단
          const urlLower = link.url.toLowerCase();
          const isBlocked = [
            'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr',
            'blogspot.com', 'wordpress.com', 'velog.io', 'medium.com',
            'naver.com/blog', 'daum.net/cafe', 'cafe.daum.net'
          ].some(domain => urlLower.includes(domain));
          
          if (isBlocked) {
            continue; // 블로그/카페는 완전히 제외
          }
          
          if (!seenUrls.has(link.url)) {
            seenUrls.add(link.url);
            candidates.push({
              url: link.url,
              title: link.title || keyword,
              relevance: calculateRelevance(topic, keywords, keyword, link.title || ''),
              searchVolume: 0, // 직접 검색은 검색량 정보 없음
              source: 'direct',
              keyword: keyword
            });
          }
        }
      } catch (error) {
        console.warn(`[DATALAB-CTA] 직접 키워드 "${keyword}" 검색 실패:`, error);
      }
    }

    // 4. 관련성 점수 기준 정렬 및 필터링
    const filtered = candidates
      .filter(c => c.relevance >= minRelevance)
      .sort((a, b) => {
        // 관련성 점수 우선, 그 다음 검색량
        if (b.relevance !== a.relevance) {
          return b.relevance - a.relevance;
        }
        return b.searchVolume - a.searchVolume;
      })
      .slice(0, maxResults);

    console.log(`[DATALAB-CTA] ✅ CTA 링크 ${filtered.length}개 발굴 완료 (전체 ${candidates.length}개 후보)`);
    
    return filtered;

  } catch (error) {
    console.error('[DATALAB-CTA] CTA 링크 발굴 실패:', error);
    return [];
  }
}

/**
 * 관련성 점수 계산 (0-100)
 */
function calculateRelevance(
  topic: string,
  keywords: string[],
  foundKeyword: string,
  linkTitle: string
): number {
  let score = 0;

  // 1. 주제와의 일치도 (40점)
  const topicLower = topic.toLowerCase();
  const foundLower = foundKeyword.toLowerCase();
  const titleLower = linkTitle.toLowerCase();

  if (titleLower.includes(topicLower) || foundLower.includes(topicLower)) {
    score += 40;
  } else {
    // 부분 일치
    const topicWords = topicLower.split(/\s+/);
    const matchCount = topicWords.filter(word => 
      titleLower.includes(word) || foundLower.includes(word)
    ).length;
    score += (matchCount / topicWords.length) * 40;
  }

  // 2. 키워드와의 일치도 (30점)
  const keywordMatches = keywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    return titleLower.includes(kwLower) || foundLower.includes(kwLower);
  }).length;
  score += Math.min((keywordMatches / Math.max(keywords.length, 1)) * 30, 30);

  // 3. 공식 사이트 여부 (20점)
  const officialDomains = [
    'gov.kr', 'go.kr', 'or.kr', 'ac.kr', 'co.kr',
    'samsung.com', 'lg.com', 'apple.com',
    'coupang.com', 'naver.com', '11st.co.kr', 'gmarket.co.kr'
  ];
  const isOfficial = officialDomains.some(domain => titleLower.includes(domain));
  if (isOfficial) {
    score += 20;
  }

  // 4. 블로그/카페 완전 차단 (관련성 0점으로 처리)
  const excludedDomains = [
    'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr',
    'blogspot.com', 'wordpress.com', 'velog.io', 'medium.com',
    'naver.com/blog', 'daum.net/cafe', 'cafe.daum.net'
  ];
  const isExcluded = excludedDomains.some(domain => titleLower.includes(domain));
  if (isExcluded) {
    return 0; // 블로그/카페는 완전히 제외
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 유틸리티 함수
 */
function getDateToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

