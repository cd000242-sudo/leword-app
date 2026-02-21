"use strict";
/**
 * ZUM 실시간 검색어 API 유틸리티
 * Puppeteer를 사용하여 실제 ZUM 메인 페이지를 크롤링
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getZumRealtimeKeywordsWithPuppeteer = getZumRealtimeKeywordsWithPuppeteer;
/**
 * Puppeteer를 사용하여 ZUM 실시간 검색어 크롤링
 */
async function getZumRealtimeKeywordsWithPuppeteer(limit = 10) {
    let browser = null;
    try {
        console.log('[ZUM-REALTIME] ZUM 실시간 검색어 크롤링 시작 (Puppeteer)');
        // Puppeteer 동적 import
        const puppeteer = await Promise.resolve().then(() => __importStar(require('puppeteer')));
        console.log('[ZUM-REALTIME] 브라우저 실행 중...');
        browser = await puppeteer.default.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        });
        const page = await browser.newPage();
        // User-Agent 설정
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // 언어 설정
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        // ZUM 메인 페이지 접속
        const zumUrl = 'https://www.zum.com/';
        console.log('[ZUM-REALTIME] 페이지 로딩 중:', zumUrl);
        await page.goto(zumUrl, {
            waitUntil: 'domcontentloaded', // networkidle2 대신 domcontentloaded로 변경 (더 빠름)
            timeout: 20000 // 30초 -> 20초로 단축
        });
        // 페이지 로딩 대기 (3초 -> 2초로 단축)
        await page.waitForTimeout(2000);
        console.log('[ZUM-REALTIME] 페이지 크롤링 중...');
        // ZUM 페이지에서 실시간 검색어 추출
        const keywords = await page.evaluate((maxLimit) => {
            const result = [];
            // 제외할 텍스트 패턴
            const excludePatterns = [
                /^더보기$/i,
                /^전체보기$/i,
                /^검색$/i,
                /^ZUM$/i,
                /^로그인$/i,
                /^회원가입$/i,
                /^메일$/i,
                /^카페$/i,
                /^블로그$/i,
                /^뉴스$/i,
                /^지도$/i,
                /^쇼핑$/i,
                /^영화$/i,
                /^웹툰$/i,
                /^실시간$/i,
                /^인기$/i,
                /^이슈$/i,
            ];
            // 실시간 검색어 선택자들 (우선순위 순)
            const selectors = [
                // 실시간 검색어 전용 섹션
                '.realtime_keyword li a',
                '.realtime_keyword .keyword_item',
                '.realtime_keyword .keyword',
                '.realtime_keyword a',
                '.realtime_keyword span',
                // 이슈/트렌드 섹션
                '.issue_keyword li a',
                '.issue_keyword .keyword_item',
                '.issue_keyword a',
                '.trending_keyword li a',
                '.trending_keyword a',
                // 순위/랭킹 섹션
                '.rank_list li a',
                '.rank_list .keyword',
                '.keyword_list li a',
                '.keyword_list .keyword',
                // ZUM 실시간 검색어 특정 클래스들
                '.list_hotissue li a',
                '.list_hotissue .keyword',
                '.list_issue li a',
                '.list_issue .keyword',
                '.rank_cont li a',
                '.rank_cont .keyword',
                // 데이터 속성 사용
                '[data-keyword]',
                '[data-query]',
                // 일반적인 선택자들
                'ol[class*="rank"] li a',
                'ul[class*="rank"] li a',
                'ol[class*="keyword"] li a',
                'ul[class*="keyword"] li a',
                'ol[class*="issue"] li a',
                'ul[class*="issue"] li a',
                'ol[class*="realtime"] li a',
                'ul[class*="realtime"] li a',
                // 검색 링크
                'a[href*="/search?q="]',
                'a[href*="/search?query="]',
                'a[href*="/search?keyword="]',
            ];
            for (const selector of selectors) {
                if (result.length >= maxLimit)
                    break;
                const elements = document.querySelectorAll(selector);
                if (elements.length === 0)
                    continue;
                console.log(`[ZUM-REALTIME] 선택자 "${selector}": ${elements.length}개 발견`);
                elements.forEach((el) => {
                    if (result.length >= maxLimit)
                        return;
                    let keyword = '';
                    // 우선순위 1: data-keyword 속성
                    const dataKeyword = el.getAttribute('data-keyword');
                    if (dataKeyword) {
                        keyword = dataKeyword.trim();
                    }
                    if (!keyword) {
                        const dataQuery = el.getAttribute('data-query');
                        if (dataQuery) {
                            keyword = dataQuery.trim();
                        }
                    }
                    // 우선순위 2: href에서 키워드 추출
                    if (!keyword && el.tagName === 'A') {
                        const href = el.href || '';
                        if (href) {
                            const hrefMatch = href.match(/[?&](?:q|query|keyword)=([^&]+)/);
                            if (hrefMatch && hrefMatch[1]) {
                                try {
                                    keyword = decodeURIComponent(hrefMatch[1]).trim();
                                }
                                catch (e) {
                                    // 디코딩 실패 무시
                                }
                            }
                        }
                    }
                    // 우선순위 3: 텍스트 내용
                    if (!keyword || keyword.length < 2) {
                        keyword = el.textContent?.trim() || '';
                    }
                    // 키워드 정제 (순위 번호, 공백, 특수문자 제거)
                    keyword = keyword
                        .replace(/^\d+\.?\s*/, '')
                        .replace(/^\d+위\s*/, '')
                        .replace(/^▶\s*/, '')
                        .replace(/^▶/, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    // 제외 패턴 체크
                    const shouldExclude = excludePatterns.some(pattern => pattern.test(keyword));
                    // 유효한 키워드 검증
                    if (keyword &&
                        keyword.length >= 2 &&
                        keyword.length < 50 &&
                        !keyword.includes('http') &&
                        !keyword.includes('://') &&
                        !shouldExclude &&
                        !/^[\d\s\-_]+$/.test(keyword) &&
                        !keyword.match(/^[a-zA-Z\s]+$/)) {
                        // 중복 체크
                        const isDuplicate = result.some(item => item.keyword.toLowerCase() === keyword.toLowerCase());
                        if (!isDuplicate) {
                            result.push({
                                keyword: keyword,
                                rank: result.length + 1
                            });
                        }
                    }
                });
                if (result.length >= maxLimit)
                    break;
            }
            // 방법 2: 스크립트 태그에서 JSON 데이터 추출
            if (result.length < maxLimit) {
                const scripts = document.querySelectorAll('script');
                scripts.forEach((script) => {
                    if (result.length >= maxLimit)
                        return;
                    const scriptContent = script.textContent || script.innerHTML || '';
                    if (scriptContent.length < 100)
                        return;
                    // 실시간 검색어 관련 JSON 패턴 검색
                    const patterns = [
                        /realtimeKeywords?\s*[:=]\s*(\[.*?\])/,
                        /searchKeywords?\s*[:=]\s*(\[.*?\])/,
                        /hotKeywords?\s*[:=]\s*(\[.*?\])/,
                        /trendingKeywords?\s*[:=]\s*(\[.*?\])/,
                        /"keyword"\s*:\s*"([^"]+)"/g,
                        /"query"\s*:\s*"([^"]+)"/g,
                        /"word"\s*:\s*"([^"]+)"/g,
                        /"text"\s*:\s*"([^"]+)"/g,
                        /"title"\s*:\s*"([^"]+)"/g,
                    ];
                    for (const pattern of patterns) {
                        if (result.length >= maxLimit)
                            break;
                        if (pattern.global) {
                            let match;
                            while ((match = pattern.exec(scriptContent)) !== null && result.length < maxLimit * 2) {
                                const keyword = (match[1] || '').trim();
                                if (keyword &&
                                    keyword.length >= 2 &&
                                    keyword.length < 50 &&
                                    !keyword.includes('http') &&
                                    !keyword.includes('더보기') &&
                                    !keyword.includes('전체보기') &&
                                    !excludePatterns.some(p => p.test(keyword))) {
                                    const isDuplicate = result.some(item => item.keyword.toLowerCase() === keyword.toLowerCase());
                                    if (!isDuplicate) {
                                        result.push({
                                            keyword: keyword,
                                            rank: result.length + 1
                                        });
                                    }
                                }
                            }
                        }
                        else {
                            const match = scriptContent.match(pattern);
                            if (match && match[1]) {
                                try {
                                    const data = JSON.parse(match[1]);
                                    const keywordList = Array.isArray(data) ? data : (data.keywords || data.items || data.list || []);
                                    if (Array.isArray(keywordList)) {
                                        keywordList.forEach((item) => {
                                            if (result.length >= maxLimit)
                                                return;
                                            const keyword = typeof item === 'string' ? item : (item.keyword || item.text || item.title || item.query || item.word || '');
                                            if (keyword && typeof keyword === 'string' && keyword.trim().length >= 2 && keyword.trim().length < 50 &&
                                                !keyword.includes('http') && !keyword.includes('더보기') && !keyword.includes('전체보기') &&
                                                !excludePatterns.some(p => p.test(keyword))) {
                                                const isDuplicate = result.some(item => item.keyword.toLowerCase() === keyword.trim().toLowerCase());
                                                if (!isDuplicate) {
                                                    result.push({
                                                        keyword: keyword.trim(),
                                                        rank: result.length + 1
                                                    });
                                                }
                                            }
                                        });
                                    }
                                }
                                catch (e) {
                                    // 파싱 실패 무시
                                }
                            }
                        }
                    }
                });
            }
            return result;
        }, limit);
        console.log(`[ZUM-REALTIME] ${keywords.length}개 키워드 발견`);
        // 결과 변환
        const realtimeKeywords = keywords
            .slice(0, limit)
            .map((item, index) => ({
            rank: index + 1,
            keyword: item.keyword,
            source: 'zum',
            timestamp: new Date().toISOString()
        }));
        console.log(`[ZUM-REALTIME] 실시간 검색어 ${realtimeKeywords.length}개 수집 완료`);
        if (realtimeKeywords.length >= 5) {
            return realtimeKeywords;
        }
        throw new Error(`키워드 수집 부족 (${realtimeKeywords.length}개)`);
    }
    catch (error) {
        console.error('[ZUM-REALTIME] Puppeteer 크롤링 실패:', error.message || error);
        throw error;
    }
    finally {
        if (browser) {
            try {
                await browser.close();
                console.log('[ZUM-REALTIME] 브라우저 종료 완료');
            }
            catch (e) {
                console.warn('[ZUM-REALTIME] 브라우저 종료 오류:', e);
            }
        }
    }
}
