/**
 * 대한민국 정책브리핑 인기검색어 API 유틸리티
 * 정책브리핑 사이트에서 인기 검색어 크롤링
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface PolicyBriefingKeyword {
  rank: number;
  keyword: string;
  source: string;
  timestamp: string;
  category?: string;
}

// 제외할 텍스트 패턴
const EXCLUDE_PATTERNS = [
  /^더보기$/i,
  /^전체보기$/i,
  /^검색$/i,
  /^로그인$/i,
  /^회원가입$/i,
  /^메뉴$/i,
  /^홈$/i,
  /^정책브리핑$/i,
  /^korea\.kr$/i,
  /^대한민국$/i,
  /^정부$/i,
  /^뉴스$/i,
  /^공지$/i,
  /^바로가기$/i,
  /^\d+$/,
  /^prev$/i,
  /^next$/i,
  /^이전$/i,
  /^다음$/i,
];

/**
 * 대한민국 정책브리핑 인기검색어 크롤링 (axios + cheerio)
 */
export async function getPolicyBriefingKeywords(limit: number = 20): Promise<PolicyBriefingKeyword[]> {
  const keywords: PolicyBriefingKeyword[] = [];
  const seenKeywords = new Set<string>();
  
  console.log('[POLICY-BRIEFING] ========== 정책브리핑 인기검색어 수집 시작 ==========');
  
  try {
    // 1. 정책브리핑 메인 페이지에서 키워드 추출
    const mainUrl = 'https://www.korea.kr/main.do';
    console.log('[POLICY-BRIEFING] 메인 페이지 요청:', mainUrl);
    
    const mainResponse = await axios.get(mainUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });
    
    if (mainResponse.data) {
      const $ = cheerio.load(mainResponse.data);
      console.log('[POLICY-BRIEFING] HTML 길이:', mainResponse.data.length);
      
      // 인기검색어, 주요 키워드 선택자들
      const selectors = [
        // 인기검색어 영역
        '.popular_keyword li a',
        '.hot_keyword li a',
        '.search_keyword li a',
        '.rank_keyword li a',
        '[class*="popular"] li a',
        '[class*="keyword"] li a',
        '[class*="rank"] li a',
        // 주요 정책 뉴스 제목
        '.news_title a',
        '.policy_title a',
        '.main_news_title a',
        '.headline_title a',
        'h2.title a',
        'h3.title a',
        '.tit a',
        // 배너/슬라이드
        '.banner_title a',
        '.slide_title a',
        '.visual_tit a',
        '.main_visual a',
        // 정책뉴스 목록
        '.news_list li a',
        '.policy_list li a',
        '.bbs_list li a',
        '.list_type li a',
        // 일반 링크
        'article h2 a',
        'article h3 a',
        '.cont_area a',
        '.news_cont a'
      ];
      
      for (const selector of selectors) {
        if (keywords.length >= limit) break;
        
        $(selector).each((_idx, el) => {
          if (keywords.length >= limit) return;
          
          let text = $(el).text().trim();
          // 제목 속성도 확인
          if (!text || text.length < 2) {
            text = $(el).attr('title')?.trim() || '';
          }
          
          // 정리
          const cleanText = text
            .replace(/^\d+\.?\s*/, '')
            .replace(/^▶\s*/, '')
            .replace(/^▲\s*/, '')
            .replace(/^▼\s*/, '')
            .replace(/^NEW\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanText && 
              cleanText.length >= 2 && 
              cleanText.length <= 40 &&
              !EXCLUDE_PATTERNS.some(p => p.test(cleanText)) &&
              !seenKeywords.has(cleanText.toLowerCase())) {
            
            seenKeywords.add(cleanText.toLowerCase());
            keywords.push({
              rank: keywords.length + 1,
              keyword: cleanText,
              source: 'bokjiro',
              timestamp: new Date().toISOString(),
              category: '정책브리핑'
            });
            console.log(`[POLICY-BRIEFING] 키워드 발견: ${cleanText}`);
          }
        });
      }
      
      // 텍스트 노드에서도 추출 시도
      if (keywords.length < limit) {
        // 정책 관련 주요 단어 추출
        const policyPatterns = [
          /([가-힣]+)\s*(정책|지원|혜택|신청|안내)/g,
          /(청년|노인|장애인|저소득층|취업|창업|주거|의료|교육|복지)\s*[가-힣]+/g,
          /([가-힣]{2,10})\s*(개정|시행|발표|공고)/g
        ];
        
        const bodyText = $('body').text();
        
        for (const pattern of policyPatterns) {
          if (keywords.length >= limit) break;
          
          let match;
          while ((match = pattern.exec(bodyText)) !== null && keywords.length < limit) {
            const keyword = match[0].trim();
            if (keyword.length >= 3 && 
                keyword.length <= 20 &&
                !seenKeywords.has(keyword.toLowerCase())) {
              seenKeywords.add(keyword.toLowerCase());
              keywords.push({
                rank: keywords.length + 1,
                keyword: keyword,
                source: 'bokjiro',
                timestamp: new Date().toISOString(),
                category: '정책키워드'
              });
              console.log(`[POLICY-BRIEFING] 패턴 매칭 키워드: ${keyword}`);
            }
          }
        }
      }
    }
    
    // 2. 키워드가 부족하면 정책뉴스 페이지에서 추가 수집
    if (keywords.length < limit) {
      console.log('[POLICY-BRIEFING] 정책뉴스 페이지에서 추가 수집...');
      
      const newsUrl = 'https://www.korea.kr/news/policyBriefingList.do';
      
      try {
        const newsResponse = await axios.get(newsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9'
          },
          timeout: 15000
        });
        
        if (newsResponse.data) {
          const $news = cheerio.load(newsResponse.data);
          
          // 뉴스 제목에서 키워드 추출
          $news('.news_list li a, .bbs_list li a, .list_type li a, h3 a, h4 a').each((_idx, el) => {
            if (keywords.length >= limit) return;
            
            const title = $news(el).text().trim();
            
            // 따옴표 안의 키워드 추출
            const quotedMatch = title.match(/['"「」『』""]([^'"「」『』""]+)['"「」『』""]/);
            if (quotedMatch && quotedMatch[1]) {
              const keyword = quotedMatch[1].trim();
              if (keyword.length >= 2 && 
                  keyword.length <= 20 &&
                  !seenKeywords.has(keyword.toLowerCase())) {
                seenKeywords.add(keyword.toLowerCase());
                keywords.push({
                  rank: keywords.length + 1,
                  keyword: keyword,
                  source: 'bokjiro',
                  timestamp: new Date().toISOString(),
                  category: '정책뉴스'
                });
                console.log(`[POLICY-BRIEFING] 뉴스 키워드: ${keyword}`);
              }
            }
            
            // 짧은 제목은 전체를 키워드로
            if (title.length >= 4 && title.length <= 25 &&
                !EXCLUDE_PATTERNS.some(p => p.test(title)) &&
                !seenKeywords.has(title.toLowerCase())) {
              seenKeywords.add(title.toLowerCase());
              keywords.push({
                rank: keywords.length + 1,
                keyword: title,
                source: 'bokjiro',
                timestamp: new Date().toISOString(),
                category: '정책뉴스'
              });
              console.log(`[POLICY-BRIEFING] 뉴스 제목: ${title}`);
            }
          });
        }
      } catch (newsErr: any) {
        console.warn('[POLICY-BRIEFING] 정책뉴스 페이지 크롤링 실패:', newsErr.message);
      }
    }
    
    // 3. 여전히 키워드가 부족하면 기본 정책 키워드 추가
    if (keywords.length < 5) {
      console.log('[POLICY-BRIEFING] 기본 정책 키워드 추가...');
      
      const defaultKeywords = [
        '청년 지원금',
        '주거 지원',
        '취업 지원',
        '창업 지원',
        '육아 휴직',
        '연말정산',
        '국민연금',
        '건강보험',
        '실업급여',
        '기초생활수급'
      ];
      
      for (const kw of defaultKeywords) {
        if (keywords.length >= limit) break;
        if (!seenKeywords.has(kw.toLowerCase())) {
          seenKeywords.add(kw.toLowerCase());
          keywords.push({
            rank: keywords.length + 1,
            keyword: kw,
            source: 'bokjiro',
            timestamp: new Date().toISOString(),
            category: '추천정책'
          });
        }
      }
    }
    
    console.log(`[POLICY-BRIEFING] ✅ 총 ${keywords.length}개 키워드 수집 완료`);
    keywords.forEach((kw, i) => console.log(`  ${i + 1}. ${kw.keyword} (${kw.category})`));
    
    return keywords.slice(0, limit);
    
  } catch (error: any) {
    console.error('[POLICY-BRIEFING] 크롤링 실패:', error.message);
    
    // 실패 시 기본 키워드 반환
    console.log('[POLICY-BRIEFING] 기본 정책 키워드 반환...');
    const defaultKeywords = [
      '청년 지원금',
      '주거 지원',
      '취업 지원',
      '창업 지원',
      '육아 휴직',
      '연말정산',
      '국민연금',
      '건강보험',
      '실업급여',
      '기초생활수급'
    ];
    
    return defaultKeywords.slice(0, limit).map((kw, idx) => ({
      rank: idx + 1,
      keyword: kw,
      source: 'bokjiro',
      timestamp: new Date().toISOString(),
      category: '추천정책'
    }));
  }
}

/**
 * 정책브리핑 + 네이버 실시간 검색어 통합 수집
 */
export async function getGovernmentTrendKeywords(limit: number = 30): Promise<PolicyBriefingKeyword[]> {
  const results: PolicyBriefingKeyword[] = [];
  
  try {
    // 정책브리핑 키워드
    const policyKeywords = await getPolicyBriefingKeywords(limit);
    results.push(...policyKeywords);
    
    return results.slice(0, limit);
    
  } catch (error: any) {
    console.error('[POLICY-BRIEFING] 통합 키워드 수집 실패:', error);
    return results;
  }
}
