/**
 * 네이버 블로그 스마트블록 추출 및 분석
 * 네이버 블로그의 구조화된 콘텐츠 블록을 추출하여 키워드 분석에 활용
 */

import { browserPool } from './puppeteer-pool';
import { setupStealthPage } from './stealth-browser';

export interface NaverApiConfig {
  clientId: string;
  clientSecret: string;
}

// 🌐 네이버 오픈 API (블로그 검색 등) 전역 레이트 리미러
let lastOpenApiRequestAt = 0;
const OPEN_API_INTERVAL = 500; // 500ms (초당 2회로 매우 보수적으로 제한)

export interface SmartBlock {
  type: string; // 블록 타입 (예: 'text', 'image', 'video', 'table', 'quote' 등)
  content: string; // 블록 내용
  keywords: string[]; // 추출된 키워드
  order: number; // 블록 순서
}

/**
 * 스마트블록 연관 키워드 + 메트릭스 (검색량/문서량)
 */
export interface SmartBlockKeywordWithMetrics {
  keyword: string;
  frequency: number;
  searchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number;
  isSmartBlockKeyword: boolean;
}

/**
 * 네이버 블로그 URL에서 스마트블록 추출 (보안 우회 및 안정성 개선)
 */
export async function extractSmartBlocksFromNaverBlog(
  blogUrl: string,
  config: NaverApiConfig
): Promise<SmartBlock[]> {
  try {
    // 타임아웃 설정 (15초)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // 실제 브라우저처럼 보이는 헤더 설정 (보안 우회)
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Referer': 'https://www.naver.com/'
      };

      const response = await fetch(blogUrl, {
        signal: controller.signal,
        headers: headers,
        redirect: 'follow',
        // @ts-ignore - Node.js 환경에서 지원
        timeout: 15000
      } as any);

      clearTimeout(timeoutId);

      if (!response.ok) {
        // 403, 429 등의 보안 응답은 조용히 처리
        if (response.status === 403 || response.status === 429) {
          console.warn(`[NAVER-SMART-BLOCK] 블로그 접근 제한 (${response.status}): ${blogUrl.substring(0, 50)}...`);
          return [];
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // 빈 HTML 체크
      if (!html || html.trim().length < 100) {
        console.warn('[NAVER-SMART-BLOCK] 빈 HTML 응답');
        return [];
      }

      const blocks = parseSmartBlocks(html);

      // 스마트블록이 추출되지 않은 경우, 기본 텍스트 블록 생성
      if (blocks.length === 0) {
        console.warn('[NAVER-SMART-BLOCK] 스마트블록 추출 실패, 기본 텍스트 블록 생성 시도');
        // HTML에서 기본 텍스트 추출 시도
        const fallbackContent = extractTextContent(html);
        if (fallbackContent && fallbackContent.length > 50) {
          return [{
            type: 'text',
            content: fallbackContent.substring(0, 500), // 최대 500자
            keywords: extractKeywords(fallbackContent),
            order: 0
          }];
        }
      }

      return blocks;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.warn('[NAVER-SMART-BLOCK] 타임아웃 발생');
      } else if (fetchError.message?.includes('403') || fetchError.message?.includes('429')) {
        console.warn('[NAVER-SMART-BLOCK] 접근 제한 (403/429)');
      } else {
        console.warn('[NAVER-SMART-BLOCK] 크롤링 실패:', fetchError.message || String(fetchError));
      }
      return [];
    }
  } catch (error: any) {
    console.warn('[NAVER-SMART-BLOCK] 스마트블록 추출 실패:', error?.message || String(error));
    return [];
  }
}

/**
 * HTML에서 스마트블록 파싱
 */
function parseSmartBlocks(html: string): SmartBlock[] {
  const blocks: SmartBlock[] = [];
  let order = 0;

  try {
    // 방법 1: se-module 클래스로 스마트블록 찾기
    const seModulePattern = /<div[^>]*class="[^"]*se-module[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;

    while ((match = seModulePattern.exec(html)) !== null && match[1]) {
      const blockHtml = match[1];
      const blockType = detectBlockType(blockHtml);
      const content = extractTextContent(blockHtml);
      const keywords = extractKeywords(content);

      if (content && content.trim().length > 0) {
        blocks.push({
          type: blockType,
          content: content,
          keywords: keywords,
          order: order++
        });
      }
    }

    // 방법 2: se-component 클래스로 스마트블록 찾기
    const seComponentPattern = /<div[^>]*class="[^"]*se-component[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let componentMatch;

    while ((componentMatch = seComponentPattern.exec(html)) !== null && componentMatch[1]) {
      const blockHtml = componentMatch[1];
      const blockType = detectBlockType(blockHtml);
      const content = extractTextContent(blockHtml);
      const keywords = extractKeywords(content);

      if (content && content.trim().length > 0 && !blocks.some(b => b.content === content)) {
        blocks.push({
          type: blockType,
          content: content,
          keywords: keywords,
          order: order++
        });
      }
    }

    // 방법 3: se-section 클래스로 섹션 단위 블록 찾기
    const seSectionPattern = /<div[^>]*class="[^"]*se-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let sectionMatch;

    while ((sectionMatch = seSectionPattern.exec(html)) !== null && sectionMatch[1]) {
      const blockHtml = sectionMatch[1];
      const blockType = detectBlockType(blockHtml);
      const content = extractTextContent(blockHtml);
      const keywords = extractKeywords(content);

      if (content && content.trim().length > 10 && !blocks.some(b => b.content === content)) {
        blocks.push({
          type: blockType,
          content: content,
          keywords: keywords,
          order: order++
        });
      }
    }

    console.log(`[NAVER-SMART-BLOCK] 스마트블록 ${blocks.length}개 추출 완료`);
    return blocks;
  } catch (error: any) {
    console.error('[NAVER-SMART-BLOCK] 스마트블록 파싱 실패:', error);
    return [];
  }
}

/**
 * 블록 타입 감지
 */
function detectBlockType(html: string): string {
  const htmlLower = html.toLowerCase();

  if (htmlLower.includes('se-image') || htmlLower.includes('se-imageText')) {
    return 'image';
  }
  if (htmlLower.includes('se-video') || htmlLower.includes('video')) {
    return 'video';
  }
  if (htmlLower.includes('table') || htmlLower.includes('<table')) {
    return 'table';
  }
  if (htmlLower.includes('quote') || htmlLower.includes('인용')) {
    return 'quote';
  }
  if (htmlLower.includes('list') || htmlLower.includes('<ul') || htmlLower.includes('<ol')) {
    return 'list';
  }
  if (htmlLower.includes('heading') || htmlLower.includes('<h1') || htmlLower.includes('<h2')) {
    return 'heading';
  }

  return 'text';
}

/**
 * HTML에서 텍스트 내용 추출
 */
function extractTextContent(html: string): string {
  // script, style 태그 제거
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // HTML 태그 제거
  text = text.replace(/<[^>]*>/g, ' ');

  // HTML 엔티티 디코딩
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // 연속된 공백 제거
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * 텍스트에서 키워드 추출
 */
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();

  // 한글 명사 추출 (2-10자)
  const koreanNounPattern = /[가-힣]{2,10}/g;
  const matches = text.match(koreanNounPattern);

  if (matches) {
    matches.forEach(match => {
      if (match.length >= 2 && match.length <= 10) {
        // 불용어 필터링 (확장)
        const stopWords = [
          // 조사/부사
          '것', '수', '그', '이', '그것', '이것', '저것', '때', '경우', '중', '것이', '것을', '것을', '것도', '것만', '것이다', '것이라고', '것이며', '것으로', '것이다',
          '처음', '처음엔', '처음에', '처음부터', '처음으로', '처음부터', '처음에는',
          '나중', '나중에', '나중엔', '나중에는',
          '그래서', '그런데', '그러나', '그리고', '그런', '그럼', '그렇다면',
          '이제', '이미', '이미지', '이미지가', '이미지를',
          '다시', '다시는', '다시는', '다시는',
          '또한', '또', '또한', '또한',
          '하지만', '하지만', '하지만', '하지만',
          '그러면', '그러면', '그러면', '그러면',
          '그래도', '그래도', '그래도', '그래도',
          '그런가', '그런가', '그런가', '그런가',
          '그렇다면', '그렇다면', '그렇다면', '그렇다면',
          '그래서', '그래서', '그래서', '그래서',
          '그런데', '그런데', '그런데', '그런데',
          '그리고', '그리고', '그리고', '그리고',
          '그런', '그런', '그런', '그런',
          '그럼', '그럼', '그럼', '그럼',
          '그렇다면', '그렇다면', '그렇다면', '그렇다면',
          // 일반적인 부사/조사
          '있다', '없다', '된다', '된다', '된다', '된다',
          '하는', '하는', '하는', '하는',
          '하는데', '하는데', '하는데', '하는데',
          '하지만', '하지만', '하지만', '하지만',
          '하지만', '하지만', '하지만', '하지만',
          '하지만', '하지만', '하지만', '하지만',
          '하지만', '하지만', '하지만', '하지만',
          // 의미 없는 단어
          '이런', '저런', '그런', '어떤', '무엇', '누구', '언제', '어디', '어떻게', '왜',
          '이렇게', '저렇게', '그렇게', '어떻게', '무엇을', '누구를', '언제를', '어디를',
          '이것', '저것', '그것', '무엇', '누구', '언제', '어디',
          '이런', '저런', '그런', '어떤', '무엇', '누구', '언제', '어디',
          // 검색 의도가 없는 일반 단어
          '때문', '때문에', '때문이다', '때문이다',
          '위해', '위해서', '위해서', '위해서',
          '대해', '대해서', '대해서', '대해서',
          '관해', '관해서', '관해서', '관해서',
          '관련', '관련하여', '관련하여', '관련하여',
          '통해', '통해서', '통해서', '통해서',
          '통한', '통한', '통한', '통한',
          '통해', '통해서', '통해서', '통해서',
          '통한', '통한', '통한', '통한',
          // 최소 길이 체크 (2자 이하 제외)
        ];

        // 의미 있는 키워드만 허용 (최소 3자 이상, 또는 명사 패턴)
        const isMeaningful = match.length >= 3 &&
          !stopWords.includes(match) &&
          !match.match(/^(처음|나중|그래서|그런데|그리고|하지만|그러면|그래도|그런가|그렇다면)/) &&
          !match.match(/(때문|위해|대해|관해|관련|통해|통한)$/);

        if (isMeaningful) {
          keywords.add(match);
        }
      }
    });
  }

  // 연속된 명사구 추출 (2-3개 단어 조합) - 의미 있는 구문만
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const meaninglessWords = ['처음', '처음엔', '처음에', '나중', '나중에', '그래서', '그런데', '그리고', '하지만', '그러면', '그래도', '이제', '이미', '다시', '또한', '또', '이런', '저런', '그런', '어떤', '무엇', '누구', '언제', '어디', '때문', '위해', '대해', '관해', '관련', '통해', '통한'];

  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`.trim();
    // 의미 있는 구문만 허용 (불용어 포함 안 함, 최소 4자)
    if (phrase.length >= 4 && phrase.length <= 20 &&
      /^[가-힣\s]+$/.test(phrase) &&
      !meaninglessWords.some(w => phrase.includes(w))) {
      keywords.add(phrase);
    }
  }

  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.trim();
    // 의미 있는 구문만 허용 (불용어 포함 안 함, 최소 6자)
    if (phrase.length >= 6 && phrase.length <= 30 &&
      /^[가-힣\s]+$/.test(phrase) &&
      !meaninglessWords.some(w => phrase.includes(w))) {
      keywords.add(phrase);
    }
  }

  return Array.from(keywords).slice(0, 20); // 최대 20개
}

/**
 * 네이버 블로그 검색 API 응답에서 키워드 추출 (안전한 방법)
 */
function extractKeywordsFromApiItems(items: any[], baseKeyword: string): Map<string, number> {
  const keywordFrequency = new Map<string, number>();

  items.forEach((item: any) => {
    const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
    const description = (item.description || '').replace(/<[^>]*>/g, '').trim();
    const fullText = `${title} ${description}`;

    // 제목과 설명에서 키워드 추출
    const keywords = extractKeywords(fullText);
    keywords.forEach(kw => {
      if (kw && kw.length >= 2 && kw !== baseKeyword) {
        keywordFrequency.set(kw, (keywordFrequency.get(kw) || 0) + 1);
      }
    });
  });

  return keywordFrequency;
}

/**
 * 네이버 블로그 검색 결과에서 스마트블록과 연관키워드 분석 (보안 개선 버전)
 */
export async function analyzeNaverBlogSmartBlocks(
  keyword: string,
  config: NaverApiConfig,
  maxResults: number = 10
): Promise<{
  smartBlocks: SmartBlock[];
  relatedKeywords: string[];
  topKeywords: Array<{ keyword: string; frequency: number }>;
}> {
  try {
    // 1. 네이버 블로그 검색 API (공식 API 사용 - 안전함)
    const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
    const params = new URLSearchParams({
      query: keyword,
      display: String(Math.min(maxResults, 100)), // 최대 100개
      sort: 'sim'
    });

    // Rate Limit 조절
    const now = Date.now();
    lastOpenApiRequestAt = Math.max(now, lastOpenApiRequestAt + OPEN_API_INTERVAL);
    const waitMs = lastOpenApiRequestAt - now;
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret
      }
    });

    if (!response.ok) {
      console.warn(`[NAVER-SMART-BLOCK] API 호출 실패: ${response.status}`);
      return {
        smartBlocks: [],
        relatedKeywords: [],
        topKeywords: []
      };
    }

    const data = await response.json();
    const items = data.items || [];

    if (items.length === 0) {
      console.warn('[NAVER-SMART-BLOCK] 검색 결과 없음');
      return {
        smartBlocks: [],
        relatedKeywords: [],
        topKeywords: []
      };
    }

    // 2. API 응답에서 바로 키워드 추출 (안전하고 빠름)
    const keywordFrequency = extractKeywordsFromApiItems(items, keyword);

    // 3. 실제 블로그 크롤링 시도 (선택적, 실패해도 계속 진행)
    const allSmartBlocks: SmartBlock[] = [];
    const crawledUrls = new Set<string>();
    let crawlSuccessCount = 0;
    let crawlFailCount = 0;

    // 상위 3개만 크롤링 시도 (시간과 보안 고려)
    const itemsToCrawl = items.slice(0, 3);

    for (const item of itemsToCrawl) {
      try {
        const blogUrl = item.link;

        // 중복 URL 방지
        if (crawledUrls.has(blogUrl)) continue;
        crawledUrls.add(blogUrl);

        // 각 블로그 크롤링 시도 (타임아웃 및 보안 처리 포함)
        const blocks = await Promise.race([
          extractSmartBlocksFromNaverBlog(blogUrl, config),
          new Promise<SmartBlock[]>((resolve) => {
            setTimeout(() => resolve([]), 15000); // 15초 타임아웃
          })
        ]);

        if (blocks && blocks.length > 0) {
          allSmartBlocks.push(...blocks);
          crawlSuccessCount++;

          // 크롤링한 블록에서 키워드 추가
          blocks.forEach(block => {
            block.keywords.forEach(kw => {
              if (kw && kw.length >= 2 && kw !== keyword) {
                keywordFrequency.set(kw, (keywordFrequency.get(kw) || 0) + 1);
              }
            });
          });
        } else {
          crawlFailCount++;
        }

        // API 호출 간격 조절 (보안을 위해 1초씩 대기)
        if (itemsToCrawl.indexOf(item) < itemsToCrawl.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        crawlFailCount++;
        console.warn(`[NAVER-SMART-BLOCK] 블로그 크롤링 실패: ${item.link?.substring(0, 50)}...`);
        // 실패해도 계속 진행
      }
    }

    // 4. 상위 키워드 추출
    const topKeywords = Array.from(keywordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30) // 최대 30개
      .map(([keyword, frequency]) => ({ keyword, frequency }));

    // 5. 연관키워드 생성 (의미 있는 키워드만 필터링)
    // - 크롤링 성공 시: 빈도 2회 이상
    // - 크롤링 실패 시: 빈도 1회 이상 (API 응답만으로도 충분)
    const minFrequency = crawlSuccessCount > 0 ? 2 : 1;
    const meaninglessPatterns = [
      /^처음/, /^나중/, /^그래서/, /^그런데/, /^그리고/, /^하지만/, /^그러면/, /^그래도/,
      /때문/, /위해/, /대해/, /관해/, /관련/, /통해/, /통한/,
      /^이런/, /^저런/, /^그런/, /^어떤/, /^무엇/, /^누구/, /^언제/, /^어디/,
      /^이제/, /^이미/, /^다시/, /^또한/, /^또$/
    ];

    const relatedKeywords = topKeywords
      .filter(item => {
        // 빈도 체크
        if (item.frequency < minFrequency) return false;

        // 의미 없는 패턴 제외
        if (meaninglessPatterns.some(pattern => pattern.test(item.keyword))) return false;

        // 최소 길이 체크 (3자 이상)
        if (item.keyword.length < 3) return false;

        // 검색 의도가 있는 키워드만 (명사 위주)
        return true;
      })
      .map(item => item.keyword)
      .slice(0, 20); // 최대 20개

    console.log(`[NAVER-SMART-BLOCK] 분석 완료: API 항목 ${items.length}개, 크롤링 성공 ${crawlSuccessCount}개, 실패 ${crawlFailCount}개, 스마트블록 ${allSmartBlocks.length}개, 연관키워드 ${relatedKeywords.length}개`);

    return {
      smartBlocks: allSmartBlocks,
      relatedKeywords: relatedKeywords,
      topKeywords: topKeywords
    };
  } catch (error: any) {
    console.error('[NAVER-SMART-BLOCK] 분석 실패:', error?.message || String(error));
    return {
      smartBlocks: [],
      relatedKeywords: [],
      topKeywords: []
    };
  }
}

/**
 * 🆕 스마트블록 연관 키워드 + 메트릭스 조회 (검색량/문서량 포함)
 * 
 * 입력한 키워드에서 스마트블록 연관 키워드들을 추출하고,
 * 각 키워드의 검색량/문서량/황금비율을 조회하여 반환
 */
export async function analyzeSmartBlockKeywordsWithMetrics(
  keyword: string,
  config: NaverApiConfig,
  options: {
    maxSmartBlockKeywords?: number;  // 스마트블록 키워드 최대 개수 (기본: 20)
    searchAdConfig?: {              // 네이버 검색광고 API 설정 (검색량 조회용)
      accessLicense: string;
      secretKey: string;
      customerId?: string;
    };
  } = {}
): Promise<{
  smartBlockKeywords: SmartBlockKeywordWithMetrics[];
  totalFound: number;
}> {
  const { maxSmartBlockKeywords = 20, searchAdConfig } = options;

  try {
    // 1. 스마트블록 분석으로 연관 키워드 수집
    const smartBlockResult = await analyzeNaverBlogSmartBlocks(keyword, config, 10);

    if (smartBlockResult.relatedKeywords.length === 0) {
      console.log('[NAVER-SMART-BLOCK] 연관 키워드 없음');
      return { smartBlockKeywords: [], totalFound: 0 };
    }

    // 상위 N개 키워드만 처리
    const targetKeywords = smartBlockResult.relatedKeywords.slice(0, maxSmartBlockKeywords);
    console.log(`[NAVER-SMART-BLOCK] 메트릭스 조회 대상: ${targetKeywords.length}개 키워드`);

    // 2. 각 키워드의 문서수 조회 (네이버 블로그 검색 API 활용)
    const documentCounts = new Map<string, number | null>();

    for (const kw of targetKeywords) {
      try {
        const blogApiUrl = 'https://openapi.naver.com/v1/search/blog.json';
        const params = new URLSearchParams({ query: kw, display: '1' });

        // Rate Limit 조절
        const now = Date.now();
        lastOpenApiRequestAt = Math.max(now, lastOpenApiRequestAt + OPEN_API_INTERVAL);
        const waitMs = lastOpenApiRequestAt - now;
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

        const response = await fetch(`${blogApiUrl}?${params}`, {
          headers: {
            'X-Naver-Client-Id': config.clientId,
            'X-Naver-Client-Secret': config.clientSecret
          }
        });

        if (response.ok) {
          const data = await response.json();
          documentCounts.set(kw, data.total || 0);
        } else {
          documentCounts.set(kw, null);
        }

        // API 호출 간격 조절
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        documentCounts.set(kw, null);
      }
    }

    // 3. 검색량 조회 (검색광고 API 사용 가능한 경우)
    let searchVolumes = new Map<string, number | null>();

    if (searchAdConfig?.accessLicense && searchAdConfig?.secretKey) {
      try {
        const { getNaverSearchAdKeywordVolume } = await import('./naver-searchad-api');
        const volumeResults = await getNaverSearchAdKeywordVolume(searchAdConfig, targetKeywords);

        for (const result of volumeResults) {
          searchVolumes.set(result.keyword, result.totalSearchVolume);
        }
      } catch (e: any) {
        console.warn('[NAVER-SMART-BLOCK] 검색량 조회 실패:', e?.message);
      }
    }

    // 4. 키워드별 빈도 맵 생성
    const frequencyMap = new Map<string, number>();
    for (const item of smartBlockResult.topKeywords) {
      frequencyMap.set(item.keyword, item.frequency);
    }

    // 5. 결과 조합 및 황금비율 계산
    const keywordsWithMetrics: SmartBlockKeywordWithMetrics[] = targetKeywords.map(kw => {
      const searchVolume = searchVolumes.get(kw) ?? null;
      const documentCount = documentCounts.get(kw) ?? null;

      // 황금비율 계산: 검색량 / 문서수 (문서수가 0이면 검색량 그대로)
      let goldenRatio = 0;
      if (searchVolume !== null && documentCount !== null) {
        goldenRatio = documentCount > 0
          ? Math.round((searchVolume / documentCount) * 100) / 100
          : searchVolume > 0 ? 999 : 0;
      }

      return {
        keyword: kw,
        frequency: frequencyMap.get(kw) || 1,
        searchVolume,
        documentCount,
        goldenRatio,
        isSmartBlockKeyword: true
      };
    });

    // 6. 황금비율 기준 정렬 (높은 순)
    keywordsWithMetrics.sort((a, b) => {
      // 먼저 황금비율로 정렬
      const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
      if (Math.abs(ratioDiff) > 0.01) return ratioDiff;

      // 황금비율 같으면 검색량으로
      const svDiff = (b.searchVolume || 0) - (a.searchVolume || 0);
      if (svDiff !== 0) return svDiff;

      // 검색량도 같으면 문서수 적은 순
      return (a.documentCount || 0) - (b.documentCount || 0);
    });

    console.log(`[NAVER-SMART-BLOCK] 메트릭스 조회 완료: ${keywordsWithMetrics.length}개 키워드`);
    if (keywordsWithMetrics.length > 0) {
      const top3 = keywordsWithMetrics.slice(0, 3).map(k =>
        `${k.keyword}(검색${k.searchVolume ?? '?'}/문서${k.documentCount ?? '?'}/비율${k.goldenRatio})`
      );
      console.log(`[NAVER-SMART-BLOCK] TOP3: ${top3.join(', ')}`);
    }

    return {
      smartBlockKeywords: keywordsWithMetrics,
      totalFound: smartBlockResult.relatedKeywords.length
    };

  } catch (error: any) {
    console.error('[NAVER-SMART-BLOCK] 메트릭스 조회 실패:', error?.message || String(error));
    return { smartBlockKeywords: [], totalFound: 0 };
  }
}

/**
 * 🕵️‍♀️ 2025 New! SERP 기반 스마트블록 타입 감지 (Puppeteer 사용)
 * 
 * 검색 결과 페이지(SERP)를 직접 분석하여 키워드의 성격(인물, 장소, 영화 등)을 파악합니다.
 * 타이틀 생성기의 정확도를 높이기 위해 사용됩니다.
 */
export async function detectSmartBlockType(keyword: string): Promise<string | null> {
  let browser;
  try {
    browser = await browserPool.acquire();
    const page = await browser.newPage();
    await setupStealthPage(page);

    // 모바일 검색 결과가 구조 파악에 더 유리함
    const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const type = await page.evaluate(() => {
      // 1. 인물 정보 (프로필) 확인
      const profile = document.querySelector('.people_info, .cm_content_area .my_profile, .who');
      if (profile) return 'person';

      // 2. 장소 정보 (지도/플레이스) 확인
      const place = document.querySelector('.place_info, .place_bl, .api_map_wrap');
      if (place) return 'place';

      // 3. 영화/드라마/방송 정보 확인
      const broadcast = document.querySelector('.broadcast_content, .movie_content, .drama_content');
      if (broadcast) return 'movie'; // movie/drama/broadcast 통합

      // 4. 쇼핑/제품 정보 확인
      const shopping = document.querySelector('.sp_shop, .shop_content, .product_info');
      if (shopping) return 'product';

      // 5. 금융/주식 (증권정보)
      const stock = document.querySelector('.stock_content, .finance_content, .stock_tlt');
      if (stock) return 'stock';

      // 6. 스마트블록 타이틀 기반 추론
      const titles = Array.from(document.querySelectorAll('.api_title, .nblock_tit, .title')).map(el => el.textContent?.trim() || '');
      const fullText = titles.join(' ');

      if (/프로필|작품활동|필모그래피|나이|배우자|자녀/.test(fullText)) return 'person';
      if (/출연진|등장인물|회차정보|시청률|결말/.test(fullText)) return 'movie';
      if (/위치|지도|메뉴|주차|가는길/.test(fullText)) return 'place';
      if (/가격|비교|스펙|성능|최저가/.test(fullText)) return 'product';
      if (/신청|자격|대상|환급|조회|지급일/.test(fullText)) return 'policy';
      if (/주가|전망|실적|배당|관련주/.test(fullText)) return 'stock';
      if (/효능|부작용|증상|치료|원인/.test(fullText)) return 'health';

      return null;
    });

    return type;

  } catch (error) {
    console.warn(`[SMART-BLOCK-DETECT] 타입 감지 실패 (${keyword}):`, error);
    return null;
  } finally {
    if (browser) browserPool.release(browser);
  }
}
