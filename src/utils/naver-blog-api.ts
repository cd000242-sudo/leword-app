/**
 * 네이버 블로그 API 유틸리티
 * 블로그 문서 수 조회 등 블로그 관련 API 기능
 * 🔥 다중 소스를 통한 정확한 문서수 조회
 */

import { EnvironmentManager } from './environment-manager';

/**
 * 네이버 블로그 검색 API를 통해 키워드의 문서 수를 조회합니다.
 * 🔥 네이버 개발자 API만 사용 (가장 정확!)
 * @param keyword 검색할 키워드
 * @returns 블로그 문서 수
 */
export async function getNaverBlogDocumentCount(keyword: string): Promise<number | null> {
  try {
    const envManager = EnvironmentManager.getInstance();
    const config = envManager.getConfig();
    
    const clientId = config.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = config.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    
    console.log(`[NAVER-BLOG-API] 🔍 문서수 조회 시작: "${keyword}"`);
    console.log(`[NAVER-BLOG-API] Client ID: ${clientId ? clientId.substring(0, 8) + '...' : '없음'}`);
    console.log(`[NAVER-BLOG-API] Client Secret: ${clientSecret ? clientSecret.substring(0, 4) + '...' : '없음'}`);
    
    if (!clientId || !clientSecret) {
      console.error(`[NAVER-BLOG-API] ❌ API 키가 설정되지 않았습니다!`);
      console.error(`[NAVER-BLOG-API] → Client ID: ${clientId || '없음'}`);
      console.error(`[NAVER-BLOG-API] → Client Secret: ${clientSecret || '없음'}`);
      return null;
    }
    
    const encodedKeyword = encodeURIComponent(keyword);
    const apiUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodedKeyword}&display=1`;
    
    console.log(`[NAVER-BLOG-API] API 호출: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      }
    });
    
    console.log(`[NAVER-BLOG-API] 응답 상태: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NAVER-BLOG-API] ❌ API 호출 실패 (${response.status})`);
      console.error(`[NAVER-BLOG-API] 오류 내용: ${errorText}`);
      return null;
    }
    
    const data = await response.json() as { total?: number; lastBuildDate?: string; items?: any[] };
    console.log(`[NAVER-BLOG-API] 응답 데이터:`, JSON.stringify(data, null, 2));
    
    if (data.total !== undefined && data.total >= 0) {
      console.log(`[NAVER-BLOG-API] ✅ API 문서수: "${keyword}" = ${data.total.toLocaleString()}개`);
      return data.total;
    } else {
      console.warn(`[NAVER-BLOG-API] ⚠️ total 필드 없음:`, data);
      return null;
    }
    
  } catch (error) {
    console.error('[NAVER-BLOG-API] ❌ 문서 수 조회 오류:', error);
    return null;
  }
}


/**
 * 여러 키워드의 문서 수를 배치로 조회합니다.
 * @param keywords 검색할 키워드 배열
 * @param delay 요청 간 딜레이 (ms)
 * @returns 키워드별 문서 수 맵
 */
export async function getNaverBlogDocumentCounts(
  keywords: string[],
  delay: number = 100
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  
  for (const keyword of keywords) {
    try {
      const count = await getNaverBlogDocumentCount(keyword);
      results.set(keyword, count);
      
      // Rate limit 방지
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (e) {
      results.set(keyword, null);
    }
  }
  
  return results;
}
