/**
 * URL 검증 유틸리티
 * 404 오류를 방지하고 공식 사이트만 허용
 */

// 허용된 공식 도메인 목록
const ALLOWED_DOMAINS = [
  // 정부/공공 기관
  'gov.kr',
  'go.kr',
  'police.go.kr',
  'spo.go.kr',
  'law.go.kr',
  'moj.go.kr',
  'mohw.go.kr',
  'women1366.kr',
  'safe182.go.kr',
  'mpss.go.kr',
  'korea.kr',
  'bokjiro.go.kr',
  'nhis.or.kr',
  'kca.go.kr',
  'kopico.go.kr',
  'mfds.go.kr',
  'kcab.or.kr',
  'kftc.go.kr',
  
  // 국책 연구기관
  'kari.re.kr',        // 한국항공우주연구원
  'etri.re.kr',        // 한국전자통신연구원
  'kriss.re.kr',       // 한국표준과학연구원
  'kbsi.re.kr',        // 한국기초과학지원연구원
  'kaist.ac.kr',       // 한국과학기술원
  'kitech.re.kr',      // 한국생산기술연구원
  'kepco.co.kr',       // 한국전력공사
  'korail.com',        // 한국철도공사
  'ksdn.or.kr',        // 한국우주개발센터
  'nrf.re.kr',         // 한국연구재단
  'kistep.re.kr',      // 한국과학기술기획평가원
  
  // 쇼핑몰 (공식 쇼핑몰만)
  'coupang.com',
  'shopping.naver.com', // 네이버 쇼핑만 허용 (블로그/카페는 제외)
  '11st.co.kr',
  'gmarket.co.kr',
  'auction.co.kr',
  'ssg.com',
  'lotte.com',
  
  // 공식 브랜드
  'samsung.com',
  'lge.co.kr',
  'lg.com',
  'apple.com',
  'microsoft.com',
  'google.com',
  'sktelecom.com',
  
  // 티켓 예매 사이트 (공식 사이트만)
  'interpark.com',
  'ticket.interpark.com',
  'melon.com',
  'ticket.melon.com',
  'yes24.com',
  'ticket.yes24.com',
  
  // 엔터테인먼트 (공식 사이트)
  'cjenm.com',          // CJ ENM (MAMA 등)
  'www.cjenm.com',      // CJ ENM 공식
  'tv.naver.com',       // 네이버 TV (공식 동영상)
  'naver.tv',           // 네이버 TV 단축 도메인
  
  // 금융
  'kfcc.or.kr',
  'fss.or.kr',
  'kcredit.or.kr',
  
  // 뉴스 사이트 (CTA 허용)
  'news.naver.com',
  'n.news.naver.com',
  'news.daum.net',
  'media.daum.net',
  'news.google.com',
  'yna.co.kr',
  'yonhapnews.co.kr',
  'chosun.com',
  'joongang.co.kr',
  'donga.com',
  'hani.co.kr',
  'mk.co.kr',
  'khan.co.kr',
  'seoul.co.kr',
  'news1.kr',
  'newsis.com',
  'edaily.co.kr',
  'fnnews.com',
  'etnews.com',
  'zdnet.co.kr',
  'it.chosun.com',
  'sbs.co.kr',
  'kbs.co.kr',
  'mbc.co.kr',
  'ytn.co.kr',
  'jtbc.co.kr',
  'channela.co.kr'
];

// 금지된 도메인 패턴 (블로그/카페/개인 사이트)
const BLOCKED_PATTERNS = [
  // 네이버 블로그/카페
  'blog.naver.com',
  'cafe.naver.com',
  'm.blog.naver',
  'post.naver.com',
  'naver.me',
  'naver.com/blog',
  'naver.com/cafe',
  
  // 티스토리
  'tistory.com',
  '.tistory.com',
  
  // 다음 카페
  'daum.net/cafe',
  'cafe.daum.net',
  
  // 기타 블로그 플랫폼
  'brunch.co.kr',
  'velog.io',
  'blogspot.com',
  '.blogspot.com',
  'wordpress.com',
  '.wordpress.com',
  'medium.com',
  '.medium.com',
  'tumblr.com',
  '.tumblr.com',
  
  // 검색 결과 페이지
  'naver.com/search',
  'google.com/search',
  'daum.net/search',
  
  // 단축 URL (신뢰할 수 없음)
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  
  // 기타 개인 사이트 패턴
  '.blog',
  '/blog/',
  '/cafe/',
  '/post/',
  '/entry/',
  '/archives/',
  '/category/',
  '/tag/'
];

/**
 * URL이 유효한 형식인지 확인 (404 방지)
 */
function isValidUrlFormat(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // 기본 URL 형식 검증
  try {
    const urlObj = new URL(url);
    
    // 프로토콜 체크 (http/https만 허용)
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      console.log(`[URL-VALIDATOR] 허용되지 않은 프로토콜: ${urlObj.protocol}`);
      return false;
    }
    
    // 호스트명 체크
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      console.log(`[URL-VALIDATOR] 호스트명 없음: ${url}`);
      return false;
    }
    
    // IP 주소는 제외 (도메인만 허용)
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(urlObj.hostname)) {
      console.log(`[URL-VALIDATOR] IP 주소는 허용되지 않음: ${urlObj.hostname}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(`[URL-VALIDATOR] URL 파싱 실패: ${url}`);
    return false;
  }
}

/**
 * URL이 허용된 공식 사이트인지 확인
 */
export function isAllowedOfficialSite(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // 1단계: URL 형식 검증
  if (!isValidUrlFormat(url)) {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const fullUrl = url.toLowerCase();
    
    // 2단계: 금지된 패턴 체크 (우선순위 높음)
    for (const pattern of BLOCKED_PATTERNS) {
      if (hostname.includes(pattern) || fullUrl.includes(pattern)) {
        console.log(`[URL-VALIDATOR] ❌ 금지된 패턴 감지: ${pattern} in ${url}`);
        return false;
      }
    }
    
    // 3단계: 허용된 도메인 체크
    for (const domain of ALLOWED_DOMAINS) {
      if (hostname.endsWith(domain) || hostname === domain) {
        // 추가 검증: 네이버 쇼핑은 허용하지만 블로그/카페는 제외
        if (domain === 'shopping.naver.com') {
          if (hostname === 'shopping.naver.com' || hostname.endsWith('.shopping.naver.com')) {
            console.log(`[URL-VALIDATOR] ✅ 허용된 공식 사이트: ${url}`);
            return true;
          }
        } else {
          console.log(`[URL-VALIDATOR] ✅ 허용된 공식 사이트: ${url}`);
          return true;
        }
      }
    }
    
    console.log(`[URL-VALIDATOR] ❌ 허용되지 않은 도메인: ${hostname}`);
    return false;
  } catch (error) {
    console.log(`[URL-VALIDATOR] ❌ URL 파싱 실패: ${url}`);
    return false;
  }
}

/**
 * CTA 링크 목록에서 공식 사이트만 필터링
 */
export function filterOfficialCTAs<T extends { url?: string | undefined; text?: string | undefined; hook?: string | undefined }>(ctas: T[]): T[] {
  return ctas.filter(cta => {
    const isAllowed = isAllowedOfficialSite(cta.url || '');
    if (!isAllowed) {
      console.log(`[URL-VALIDATOR] CTA 제거됨 (비공식 사이트): ${cta.url}`);
    }
    return isAllowed;
  });
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_PATTERN = /(20\d{2})/g;

function replaceOldYear(value: string | undefined, fallbackTopic: string): string | undefined {
  if (!value) return value;
  const currentYearStr = String(CURRENT_YEAR);
  const updated = value.replace(YEAR_PATTERN, (match) => {
    const matchYear = parseInt(match, 10);
    return matchYear < CURRENT_YEAR ? currentYearStr : match;
  });
  return updated;
}

function normalizeCtaUrl(url: string | undefined, topic: string): string {
  if (!url) return getSafeOfficialUrl(topic);
  try {
    const urlObj = new URL(url);
    const yearMatch = urlObj.pathname.match(YEAR_PATTERN);
    if (yearMatch) {
      let updatedPath = urlObj.pathname;
      yearMatch.forEach((match) => {
        const matchYear = parseInt(match, 10);
        if (matchYear < CURRENT_YEAR) {
          updatedPath = updatedPath.replace(match, String(CURRENT_YEAR));
        }
      });
      if (updatedPath !== urlObj.pathname) {
        urlObj.pathname = updatedPath;
        urlObj.search = urlObj.search;
        return urlObj.toString();
      }
    }
    return urlObj.toString();
  } catch (error) {
    console.log(`[URL-VALIDATOR] URL 정규화 실패, 안전한 URL로 대체: ${url}`);
    return getSafeOfficialUrl(topic);
  }
}

export function normalizeOfficialCTAs<T extends { url?: string; text?: string; hook?: string; isExternal?: boolean; relevance?: number; context?: string; source?: string }>(
  ctas: T[],
  topic: string
): Array<T & { url: string; text: string; hook: string; isExternal: boolean; relevance: number; context: string }> {
  const ensureArrow = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.endsWith('👇')) {
      return trimmed;
    }
    return `${trimmed} 👇`;
  };

  const normalized = ctas.map((cta) => {
    const safeUrl = normalizeCtaUrl(cta.url, topic);
    const safeText = replaceOldYear(cta.text, topic) || `${CURRENT_YEAR}년 ${topic} 공식 정보`;
    const safeHook = ensureArrow(replaceOldYear(cta.hook, topic) || `💡 ${topic} 최신 공식 정보를 확인해보세요`);
    
    const normalizedCta = {
      ...cta,
      url: safeUrl,
      text: safeText,
      hook: safeHook,
      isExternal: cta.isExternal !== undefined ? cta.isExternal : true,
      relevance: typeof cta.relevance === 'number' ? cta.relevance : 7,
      context: (cta.context || '').trim()
    } as T & { url: string; text: string; hook: string; isExternal: boolean; relevance: number; context: string };

    if (!normalizedCta.context) {
      normalizedCta.context = `${topic} 최신 공식 안내 링크`;
    }

    return normalizedCta;
  });

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackUrl = getSafeOfficialUrl(topic);
  return [{
    url: fallbackUrl,
    text: `${CURRENT_YEAR}년 ${topic} 공식 안내 확인`,
    hook: ensureArrow(`💡 ${topic} 최신 공식 정보가 업데이트되었습니다`),
    isExternal: true,
    relevance: 10,
    context: `${topic} 관련 공식 정부 안내`
  } as T & { url: string; text: string; hook: string; isExternal: boolean; relevance: number; context: string }];
}

/**
 * URL이 메인 페이지인지 확인 (서브 경로가 적은지)
 */
export function isMainPage(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // 메인 페이지: /, /kr, /ko 등 최상위 경로만
    return pathname === '/' || 
           pathname === '/kr' || 
           pathname === '/ko' || 
           pathname === '/kr/' || 
           pathname === '/ko/';
  } catch {
    return false;
  }
}

// URL 검증 결과 캐시 (메모리 캐시, 1시간 유효)
const urlValidationCache = new Map<string, { isValid: boolean; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1시간

/**
 * URL이 실제로 존재하는지 확인 (404 체크) - 캐싱 및 재시도 로직 포함
 */
/**
 * 🔧 끝판왕 수준: URL이 실제로 존재하는지 확인 (404 체크 강화) - 오류 페이지 완전 차단
 * - HEAD 요청 실패 시 GET 요청으로 재시도
 * - 응답 본문 확인하여 오류 페이지 감지
 * - 더 엄격한 상태 코드 체크 (200-299만 허용, 3xx는 리다이렉트 확인)
 * - 타임아웃 및 재시도 강화
 */
export async function checkUrlExists(url: string, timeout: number = 5000, retries: number = 2): Promise<boolean> {
  if (!url || typeof url !== 'string') {
    console.log(`[URL-VALIDATOR] ❌ URL 형식 오류: ${url}`);
    return false;
  }
  
  // 캐시 확인
  const cached = urlValidationCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.isValid;
  }
  
  let lastError: Error | null = null;
  
  // 재시도 로직 (끝판왕 수준: 더 많은 재시도)
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // 1단계: HEAD 요청으로 빠르게 확인 (본문 다운로드 없이)
        let response: Response;
        let usedGetMethod = false;
        
        try {
          response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          });
        } catch (headError: any) {
          // HEAD 요청 실패 시 GET 요청으로 재시도 (끝판왕 수준)
          console.log(`[URL-VALIDATOR] ⚠️ HEAD 요청 실패, GET 요청으로 재시도: ${url}`);
          clearTimeout(timeoutId);
          const getController = new AbortController();
          const getTimeoutId = setTimeout(() => getController.abort(), timeout);
          
          try {
            response = await fetch(url, {
              method: 'GET',
              signal: getController.signal,
              redirect: 'follow',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
              }
            });
            clearTimeout(getTimeoutId);
            usedGetMethod = true;
          } catch (getError: any) {
            clearTimeout(getTimeoutId);
            throw getError;
          }
        }
        
        clearTimeout(timeoutId);
        
        // 🔧 끝판왕 수준: 더 엄격한 상태 코드 체크 (200-299만 허용, 3xx는 리다이렉트이므로 확인 필요)
        const statusCode = response.status;
        let isValid = false;
        
        if (statusCode >= 200 && statusCode < 300) {
          // 2xx 성공 코드는 유효
          isValid = true;
        } else if (statusCode >= 300 && statusCode < 400) {
          // 3xx 리다이렉트는 최종 URL 확인 필요
          const finalUrl = response.url || url;
          // 리다이렉트가 같은 도메인 내에서만 허용
          try {
            const originalDomain = new URL(url).hostname;
            const finalDomain = new URL(finalUrl).hostname;
            isValid = originalDomain === finalDomain;
            if (!isValid) {
              console.log(`[URL-VALIDATOR] ❌ 외부 도메인으로 리다이렉트: ${url} → ${finalUrl}`);
            }
          } catch {
            isValid = false;
          }
        } else {
          // 4xx, 5xx는 무조건 실패
          isValid = false;
        }
        
        // 🔧 끝판왕 수준: 응답 본문 확인하여 오류 페이지 감지 (GET 요청인 경우만)
        if (isValid && usedGetMethod && statusCode >= 200 && statusCode < 300) {
          try {
            const text = await response.text();
            const lowerText = text.toLowerCase();
            
            // 오류 페이지 키워드 감지
            const errorKeywords = [
              '404', 'not found', 'page not found', '페이지를 찾을 수 없습니다',
              'error', '오류', '에러', '잘못된', '존재하지 않습니다',
              'access denied', '접근 거부', 'forbidden', '403',
              'server error', '서버 오류', '500', '503', '502',
              'under construction', '공사 중', '점검 중', 'maintenance'
            ];
            
            const hasErrorKeyword = errorKeywords.some(keyword => lowerText.includes(keyword));
            
            // 오류 페이지로 판단되는 경우 (짧은 페이지이거나 HTML 문서인 경우)
            if (hasErrorKeyword && (lowerText.length < 1000 || lowerText.includes('<!doctype html'))) {
              console.log(`[URL-VALIDATOR] ❌ 오류 페이지 감지: ${url}`);
              isValid = false;
            }
          } catch (textError) {
            // 본문 읽기 실패는 무시 (이미 상태 코드로 확인했으므로)
            console.log(`[URL-VALIDATOR] ⚠️ 응답 본문 읽기 실패 (무시): ${url}`);
          }
        }
        
        // 캐시에 저장
        urlValidationCache.set(url, { isValid, timestamp: Date.now() });
        
        if (!isValid) {
          console.log(`[URL-VALIDATOR] ❌ URL 존재하지 않음 또는 오류 페이지 (${statusCode}): ${url}`);
        } else {
          console.log(`[URL-VALIDATOR] ✅ URL 존재 확인 (${statusCode}): ${url}`);
        }
        
        return isValid;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        lastError = fetchError;
        
        // 마지막 시도가 아니면 재시도
        if (attempt < retries) {
          const delay = 1000 * (attempt + 1); // 지수 백오프 (1초, 2초, 3초...)
          console.log(`[URL-VALIDATOR] ⚠️ 재시도 ${attempt + 1}/${retries} (${delay}ms 후): ${url}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // 타임아웃이나 네트워크 오류는 false 반환
        if (fetchError.name === 'AbortError') {
          console.log(`[URL-VALIDATOR] ❌ URL 확인 타임아웃 (${timeout}ms): ${url}`);
        } else {
          console.log(`[URL-VALIDATOR] ❌ URL 확인 실패: ${url} - ${fetchError.message}`);
        }
      }
    } catch (error: any) {
      lastError = error;
      if (attempt < retries) {
        const delay = 1000 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.log(`[URL-VALIDATOR] ❌ URL 확인 중 오류: ${url} - ${error.message}`);
    }
  }
  
  // 모든 재시도 실패 시 false 반환하고 캐시에 저장
  urlValidationCache.set(url, { isValid: false, timestamp: Date.now() });
  console.log(`[URL-VALIDATOR] ❌ 모든 재시도 실패, URL 무효로 판단: ${url}`);
  return false;
}

/**
 * URL이 주제와 관련이 있는지 확인 (개선된 로직)
 * 🔧 뉴스/정부/공식 사이트는 주제 무관해도 허용 (엄격한 필터링 완화)
 */
export function isRelevantToTopic(url: string, topic: string, keywords: string[] = []): boolean {
  if (!url || !topic) return false;
  
  const urlLower = url.toLowerCase();
  const topicLower = topic.toLowerCase();
  
  // 🔧 공식 뉴스/정부/공공기관 도메인은 항상 관련 있다고 간주
  const trustedDomains = [
    '.gov.kr', '.go.kr', '.or.kr', // 정부/공공기관
    'news.naver.com', 'news.google.com', 'news.daum.net', // 뉴스 포털
    'ytn.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr', 'jtbc.co.kr', // 방송사
    'chosun.com', 'donga.com', 'joongang.co.kr', 'hankyung.com', // 신문사
    'khan.co.kr', 'hani.co.kr', 'seoul.co.kr', 'busan.com', // 지역 신문
    'edaily.co.kr', 'mk.co.kr', 'etnews.com', 'zdnet.co.kr', // 경제/IT
    'korea.kr', 'president.go.kr', 'assembly.go.kr', // 대한민국 공식
    'nih.go.kr', 'cdc.go.kr', 'mohw.go.kr', // 보건복지부/질병관리청
    'moe.go.kr', 'mest.go.kr', // 교육부
    'molit.go.kr', 'motie.go.kr', 'moef.go.kr', // 국토부/산업부/기재부
    'ktv.go.kr', 'korea.net', // 정부 홍보
    'kari.re.kr', 'etri.re.kr', 'kriss.re.kr', // 국책 연구기관
    'nrf.re.kr', 'kistep.re.kr', // 연구재단
  ];
  
  const isTrustedDomain = trustedDomains.some(domain => urlLower.includes(domain));
  if (isTrustedDomain) {
    console.log(`[URL-VALIDATOR] ✅ 공식 도메인은 주제 무관해도 허용: ${url}`);
    return true;
  }
  
  // 주제 단어 추출 (2글자 이상만)
  const topicWords = topicLower
    .split(/[\s\-_]+/)
    .filter(w => w.length >= 2)
    .filter(w => !['년', '월', '일', '정보', '안내', '가이드', '방법'].includes(w));
  
  // 키워드 정규화
  const keywordLower = keywords
    .map(k => k.toLowerCase().trim())
    .filter(k => k.length >= 2);
  
  // URL 경로에서 의미 있는 단어 추출
  try {
    const urlObj = new URL(url);
    const pathWords = urlObj.pathname
      .split('/')
      .filter(p => p.length >= 2)
      .map(p => p.toLowerCase());
    
    // URL 경로에 주제 단어나 키워드가 포함되어 있는지 확인
    const hasTopicInPath = topicWords.some(word => 
      pathWords.some(path => path.includes(word) || word.includes(path))
    );
    const hasKeywordInPath = keywordLower.some(keyword => 
      pathWords.some(path => path.includes(keyword) || keyword.includes(path))
    );
    
    if (hasTopicInPath || hasKeywordInPath) {
      return true;
    }
  } catch {
    // URL 파싱 실패 시 전체 URL에서 확인
  }
  
  // 전체 URL에 주제나 키워드가 포함되어 있는지 확인
  const hasTopicWord = topicWords.some(word => urlLower.includes(word));
  const hasKeyword = keywordLower.some(keyword => urlLower.includes(keyword));
  
  // 주제와 관련이 없는 일반적인 메인 페이지만 있는 경우는 관련 있다고 간주
  // (예: coupang.com 등은 주제와 무관해도 허용)
  const isMain = isMainPage(url);
  
  if (isMain) {
    return true; // 메인 페이지는 주제와 무관해도 허용
  }
  
  // 서브 페이지는 주제나 키워드와 관련이 있어야 함
  return hasTopicWord || hasKeyword;
}

/**
 * CTA 링크를 검증하고 필터링 (404 체크 + 주제 관련성 확인) - 병렬 처리 개선
 */
export async function validateAndFilterCTAs<T extends { url?: string; text?: string; hook?: string; isExternal?: boolean; relevance?: number; context?: string }>(
  ctas: T[],
  topic: string,
  keywords: string[] = [],
  check404: boolean = true
): Promise<T[]> {
  if (ctas.length === 0) return [];
  
  // 1단계: 빠른 필터링 (동기 작업)
  const quickFiltered = ctas.filter(cta => {
    const url = cta.url;
    
    if (!url) {
      console.log(`[URL-VALIDATOR] ❌ CTA 제거됨 (URL 없음): ${cta.text || 'N/A'}`);
      return false;
    }
    
    // 공식 사이트인지 확인
    if (!isAllowedOfficialSite(url)) {
      console.log(`[URL-VALIDATOR] ❌ CTA 제거됨 (비공식 사이트): ${url}`);
      return false;
    }
    
    return true;
  });
  
  if (quickFiltered.length === 0) return [];
  
  // 2단계: 비동기 검증 (병렬 처리로 성능 개선)
  const validationPromises = quickFiltered.map(async (cta) => {
    const url = cta.url!;
    const reasons: string[] = [];
    
    // 🔧 끝판왕 수준: 404 체크 강화 (옵션)
    if (check404) {
      const exists = await checkUrlExists(url, 5000, 2); // 5초 타임아웃, 2회 재시도 (끝판왕 수준)
      if (!exists) {
        reasons.push('404 오류 또는 오류 페이지');
        console.log(`[URL-VALIDATOR] ❌ CTA 제거됨 (URL 검증 실패): ${url}`);
        return { cta, valid: false, reasons };
      }
      console.log(`[URL-VALIDATOR] ✅ CTA URL 검증 통과: ${url}`);
    }
    
    // 주제 관련성 확인 (메인 페이지가 아닌 경우만)
    if (!isMainPage(url)) {
      if (!isRelevantToTopic(url, topic, keywords)) {
        reasons.push('주제와 무관');
        return { cta, valid: false, reasons };
      }
    }
    
    return { cta, valid: true, reasons: [] };
  });
  
  // 모든 검증을 병렬로 실행
  const results = await Promise.all(validationPromises);
  
  // 검증 통과한 CTA만 반환
  const validated: T[] = [];
  for (const result of results) {
    if (result.valid) {
      validated.push(result.cta);
      console.log(`[URL-VALIDATOR] ✅ CTA 검증 통과: ${result.cta.url}`);
    } else {
      console.log(`[URL-VALIDATOR] ❌ CTA 제거됨 (${result.reasons.join(', ')}): ${result.cta.url}`);
    }
  }
  
  return validated;
}

/**
 * 안전한 공식 사이트 URL 생성
 */
export function getSafeOfficialUrl(topic: string): string {
  const topicLower = topic.toLowerCase();
  
  // 주제에 따라 가장 적합한 공식 사이트 반환
  if (topicLower.includes('정부') || topicLower.includes('행정') || topicLower.includes('신청')) {
    return 'https://www.gov.kr';
  }
  if (topicLower.includes('복지') || topicLower.includes('지원금') || topicLower.includes('혜택')) {
    return 'https://www.bokjiro.go.kr';
  }
  if (topicLower.includes('건강') || topicLower.includes('보험') || topicLower.includes('의료')) {
    return 'https://www.nhis.or.kr';
  }
  if (topicLower.includes('쇼핑') || topicLower.includes('구매') || topicLower.includes('제품')) {
    return 'https://www.coupang.com';
  }
  if (topicLower.includes('소비자') || topicLower.includes('피해') || topicLower.includes('신고')) {
    return 'https://www.kca.go.kr';
  }
  
  // 기본값: 정부24
  return 'https://www.gov.kr';
}

