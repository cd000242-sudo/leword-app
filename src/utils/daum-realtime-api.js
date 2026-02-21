"use strict";
/**
 * 다음(Daum) 실시간 검색어 API 유틸리티
 * Puppeteer를 사용하여 실제 다음 메인 페이지를 크롤링
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
exports.getDaumRealtimeKeywordsWithPuppeteer = getDaumRealtimeKeywordsWithPuppeteer;
/**
 * Puppeteer를 사용하여 다음 실시간 검색어 크롤링
 */
async function getDaumRealtimeKeywordsWithPuppeteer(limit = 10) {
    let browser = null;
    try {
        console.log('[DAUM-REALTIME] 다음 실시간 검색어 크롤링 시작 (Puppeteer)');
        // Puppeteer 동적 import
        const puppeteer = await Promise.resolve().then(() => __importStar(require('puppeteer')));
        console.log('[DAUM-REALTIME] 브라우저 실행 중...');
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
        // 네트워크 요청 최적화: 이미지, 폰트, 미디어는 차단하여 속도 향상
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // 이미지, 폰트, 미디어는 차단하여 속도 향상 (텍스트 콘텐츠만 필요)
            if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        // User-Agent 설정
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // 언어 설정
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        // 다음 메인 페이지 접속
        const daumUrl = 'https://www.daum.net/';
        console.log('[DAUM-REALTIME] 페이지 로딩 중:', daumUrl);
        // domcontentloaded 사용 (가장 빠른 로딩, DOM만 로드되면 진행)
        await page.goto(daumUrl, {
            waitUntil: 'domcontentloaded', // DOM만 로드되면 진행 (가장 빠름)
            timeout: 15000 // 15초로 단축 (성능 최적화)
        });
        // 페이지 로딩 대기 (동적 콘텐츠 로딩을 위해 최소 시간만 확보)
        await page.waitForTimeout(1000); // 1초로 단축
        // 실시간 검색어 섹션이 로드될 때까지 대기 (더 많은 선택자 시도)
        try {
            // 다음 실시간 검색어 섹션의 다양한 선택자 시도 (타임아웃 더 단축)
            // 뉴스 섹션 선택자도 추가
            await page.waitForSelector('#issueKeyword, #realtimeKeyword, .realtime_keyword, .issue_keyword, .list_issue, .list_news, .news_keyword, [class*="issue"], [id*="issue"], [data-tiara-id*="issue"], [data-tiara-id*="keyword"], a[href*="/search?q="], .rank_issue, .rank_keyword', { timeout: 3000 } // 3초로 단축 (성능 최적화)
            );
            console.log('[DAUM-REALTIME] 실시간 검색어 섹션 요소 발견');
        }
        catch (e) {
            console.log('[DAUM-REALTIME] 실시간 검색어 섹션 선택자 대기 실패 (계속 진행)');
        }
        // 추가 대기 시간 최소화 (JavaScript로 동적 로딩되는 경우 대비)
        await page.waitForTimeout(500); // 0.5초로 단축
        console.log('[DAUM-REALTIME] 페이지 크롤링 중...');
        // 다음 페이지에서 실시간 검색어 추출 (더 풍부한 키워드 수집)
        const keywords = await page.evaluate((maxLimit) => {
            const result = [];
            const allKeywords = new Set(); // 중복 방지를 위한 Set
            // 제외할 텍스트 패턴 (강화)
            const excludePatterns = [
                /^더보기$/i,
                /^전체보기$/i,
                /^검색$/i,
                /^다음$/i,
                /^DAUM$/i,
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
                /.*바로가기.*/i,
                /.*서비스.*바로가기.*/i,
                /.*본문.*바로가기.*/i,
                /.*홈.*화면.*설정.*/i,
                /.*로그인.*MY정보.*/i,
                /^설정$/i,
                /^MY정보$/i,
                // 다음 UI 텍스트 필터링
                /.*오늘의.*주요.*소식.*/i,
                /.*도움말.*보기.*/i,
                /.*자세히.*보기.*/i,
                /^닫기$/i,
                /.*많이.*본.*스포츠.*/i,
                /^오늘의$/i,
                /^주요 소식$/i,
                /^도움말$/i,
                /^보기$/i,
                /^자세히$/i,
                /^많이 본$/i,
                /^스포츠$/i,
                // 다음 UI 요소 추가
                /.*웹\s*접근성.*/i,
                /.*안내.*/i,
                /.*새창.*/i,
                /.*열림.*/i,
                /.*입력.*내용.*지우기.*/i,
                /.*입력\s*도구.*/i,
                /.*입력\s*도구\s*검색.*/i,
                /^입력$/i,
                /^내용$/i,
                /^지우기$/i,
                /^도구$/i,
            ];
            // UI 요소 필터링 키워드 (강화) - 다음 UI 텍스트 포함
            const uiKeywords = [
                '바로가기', '서비스 바로가기', '본문 바로가기', '홈 화면 설정',
                '로그인', 'MY정보', '설정', '메뉴', '네비게이션',
                '오늘의 주요 소식', '도움말보기', '자세히보기', '닫기',
                '많이 본 스포츠', '오늘의', '주요 소식', '도움말', '보기',
                '자세히', '많이 본', '스포츠', '닫기',
                // 다음 UI 요소 추가
                '웹 접근성', '안내', '새창', '열림', '입력', '내용', '지우기', '도구',
                '웹 접근성 안내', '새창 열림', '입력 내용 지우기', '입력 도구', '입력 도구 검색'
            ];
            // 방법 0: 실시간 이슈/검색어 섹션 타겟팅 (뉴스 섹션 포함)
            // 뉴스 섹션도 이슈의 덩어리이므로 포함하되, 제목처럼 보이는 긴 텍스트는 필터링
            const realtimeIssueSelectors = [
                // 실시간 이슈 전용 섹션 (우선순위 높음)
                '.list_briefing_wrap', // 브리핑 영역 (실시간 이슈)
                '.list_trend_wrap', // 트렌드 영역 (실시간 이슈)
                '#issueKeyword', // 이슈 키워드 ID
                '#realtimeKeyword', // 실시간 키워드 ID
                '.realtime_keyword', // 실시간 키워드 클래스
                '.issue_keyword', // 이슈 키워드 클래스
                '.list_issue', // 이슈 리스트
                '.rank_issue', // 이슈 순위
                '[data-tiara-layer="issue"]', // 이슈 레이어
                '[data-tiara-id*="issue"]', // 이슈 관련 데이터 속성
                '[data-tiara-id*="realtime"]', // 실시간 관련 데이터 속성
                // 뉴스 섹션 추가 (이슈의 덩어리)
                '.list_news', // 뉴스 리스트
                '.news_keyword', // 뉴스 키워드
                '.news_issue', // 뉴스 이슈
                '.news_list', // 뉴스 목록
                '[class*="news"][class*="keyword"]', // 뉴스 키워드 관련
                '[class*="news"][class*="issue"]' // 뉴스 이슈 관련
            ];
            console.log('[DAUM-REALTIME] 방법 0: 실시간 이슈 섹션에서 키워드 수집 시작 (뉴스 섹션 포함)');
            // 실시간 이슈 섹션 찾기
            let realtimeSection = null;
            for (const selector of realtimeIssueSelectors) {
                try {
                    const sections = document.querySelectorAll(selector);
                    for (const section of Array.from(sections)) {
                        const sectionText = section.textContent || '';
                        // "실시간", "이슈", "검색어", "브리핑", "트렌드" 등의 키워드가 포함된 섹션인지 확인
                        const hasRealtimeText = /실시간|이슈|검색어|브리핑|트렌드/i.test(sectionText);
                        const hasSearchLinks = section.querySelectorAll('a[href*="/search"], a[href*="q="]').length >= 3;
                        if (hasRealtimeText && hasSearchLinks) {
                            realtimeSection = section;
                            console.log(`[DAUM-REALTIME] 실시간 이슈 섹션 발견: ${selector}`);
                            break;
                        }
                    }
                    if (realtimeSection)
                        break;
                }
                catch (e) {
                    // 선택자 오류 무시
                }
            }
            // 실시간 이슈 섹션에서만 키워드 수집
            if (realtimeSection) {
                const links = realtimeSection.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="]');
                console.log(`[DAUM-REALTIME] 실시간 이슈 섹션에서 ${links.length}개 링크 발견`);
                links.forEach((link, index) => {
                    if (result.length >= maxLimit)
                        return;
                    let keyword = '';
                    const href = link.href || '';
                    const hrefMatch = href.match(/[?&]q=([^&]+)/);
                    if (hrefMatch && hrefMatch[1]) {
                        try {
                            keyword = decodeURIComponent(hrefMatch[1]).trim();
                        }
                        catch (e) {
                            keyword = hrefMatch[1].trim();
                        }
                    }
                    if (!keyword || keyword.length < 2) {
                        keyword = link.textContent?.trim() || '';
                        keyword = keyword
                            .replace(/^\d+\.?\s*/, '')
                            .replace(/^\d+위\s*/, '')
                            .replace(/^위,\s*/, '')
                            .replace(/^▶\s*/, '')
                            .replace(/^▶/, '')
                            .replace(/^▲\s*/, '')
                            .replace(/^▼\s*/, '')
                            .replace(/^NEW\s*/i, '')
                            .replace(/^HOT\s*/i, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                    }
                    // 실시간 이슈 키워드 검증: 제목처럼 보이는 긴 텍스트 제외
                    // 뉴스 섹션의 경우 더 엄격한 필터링 적용 (뉴스 제목은 보통 길고 상세함)
                    const isLikelyTitle = keyword.length > 50 && keyword.split(/\s+/).length > 8;
                    // 뉴스 제목처럼 보이는 패턴: "~했다", "~했다고", "~한다" 등으로 끝나는 긴 문장
                    const isNewsTitle = keyword.length > 30 && (keyword.endsWith('했다') ||
                        keyword.endsWith('했다고') ||
                        keyword.endsWith('한다') ||
                        keyword.endsWith('했다는') ||
                        keyword.endsWith('했다.') ||
                        keyword.endsWith('한다.') ||
                        keyword.split(/\s+/).length > 6 // 6단어 이상은 뉴스 제목일 가능성 높음
                    );
                    if (keyword &&
                        keyword.length >= 2 &&
                        keyword.length <= 50 &&
                        !isLikelyTitle &&
                        !isNewsTitle &&
                        /[가-힣a-zA-Z0-9]/.test(keyword) &&
                        !/^\d+$/.test(keyword) &&
                        !['통합검색', '로그인', '로그아웃', '더보기', '전체보기'].includes(keyword)) {
                        const keywordLower = keyword.toLowerCase();
                        if (!allKeywords.has(keywordLower)) {
                            allKeywords.add(keywordLower);
                            result.push({
                                keyword: keyword,
                                rank: result.length + 1
                            });
                            console.log(`[DAUM-REALTIME] 실시간 이슈 키워드 발견: "${keyword}" (${result.length}번째)`);
                        }
                    }
                });
            }
            console.log(`[DAUM-REALTIME] 실시간 이슈 섹션에서 ${result.length}개 키워드 수집`);
            // 방법 1: "실시간 검색어" 텍스트가 포함된 섹션을 명시적으로 찾기 (최우선)
            let targetSection = null;
            // 우선순위 1: "실시간 검색어" 텍스트가 포함된 섹션 찾기
            const allElements = document.querySelectorAll('*');
            for (const el of Array.from(allElements)) {
                const text = el.textContent || '';
                // "실시간 검색어" 또는 "실시간이슈" 텍스트가 정확히 포함된 섹션 찾기
                if ((/실시간\s*검색어/i.test(text) || /실시간\s*이슈/i.test(text)) &&
                    el.querySelectorAll('a[href*="/search"], a[href*="q="]').length >= 5) {
                    // 부모 섹션 찾기 (실제 키워드 리스트가 있는 컨테이너)
                    let parent = el;
                    for (let i = 0; i < 5; i++) {
                        parent = parent?.parentElement || null;
                        if (!parent)
                            break;
                        const linkCount = parent.querySelectorAll('a[href*="/search"], a[href*="q="]').length;
                        if (linkCount >= 5) {
                            targetSection = parent;
                            console.log(`[DAUM-REALTIME] "실시간 검색어" 섹션 발견 (레벨 ${i}):`, parent.className || parent.id);
                            break;
                        }
                    }
                    if (targetSection)
                        break;
                }
            }
            // 우선순위 2: 특정 ID/클래스로 찾기
            if (!targetSection) {
                const issueSelectors = [
                    // 최신 다음 페이지 구조 (실시간 검색어 전용)
                    '#issueKeyword',
                    '#realtimeKeyword',
                    '#rankKeyword',
                    '.realtime_keyword',
                    '.realtime_keyword_list',
                    '.rank_keyword_list',
                    '.list_issue',
                    '.rank_issue',
                    '.list_issue_keyword',
                    '.issue_keyword',
                    '.issue_list',
                    '[data-tiara-layer="issue"]',
                    '[data-tiara-id*="issue"]',
                    '[data-tiara-id*="keyword"]',
                    '[data-tiara-id*="realtime"]',
                    // 브리핑/트렌드 영역
                    '.list_briefing_wrap',
                    '.list_trend_wrap',
                    '.list_briefing',
                    '.list_trend',
                    // 실시간 검색어 관련 클래스
                    '.link_issue',
                    '.rank_keyword',
                    '.keyword_list'
                ];
                for (const selector of issueSelectors) {
                    try {
                        const sections = document.querySelectorAll(selector);
                        for (const section of Array.from(sections)) {
                            const sectionText = section.textContent || '';
                            // "실시간", "이슈", "검색어" 등의 텍스트가 포함된 섹션인지 확인
                            const hasIssueText = /실시간|이슈|검색어/i.test(sectionText);
                            // 섹션 내에 검색 링크가 있는지 확인 (최소 5개 이상)
                            const hasSearchLinks = section.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="]').length >= 5;
                            if (hasIssueText && hasSearchLinks) {
                                targetSection = section;
                                console.log(`[DAUM-REALTIME] 실시간 이슈 섹션 발견: ${selector}`);
                                break;
                            }
                        }
                        if (targetSection)
                            break;
                    }
                    catch (e) {
                        // 선택자 오류 무시
                    }
                }
            }
            // 우선순위 2: 실시간 이슈 섹션을 찾지 못한 경우에만 전체 페이지에서 검색 (최후의 수단)
            // 단, 실시간 이슈 관련 텍스트가 포함된 링크만 수집
            if (!targetSection || result.length < maxLimit) {
                console.log('[DAUM-REALTIME] 실시간 이슈 섹션을 찾지 못함. 전체 페이지에서 실시간 이슈 관련 링크만 검색');
                // 실시간 이슈 관련 링크만 찾기 (부모 요소에 "실시간", "이슈" 텍스트가 있는 링크만)
                const allSearchLinks = document.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="]');
                console.log(`[DAUM-REALTIME] 전체 검색 링크 ${allSearchLinks.length}개 발견`);
                const candidates = [];
                allSearchLinks.forEach((link, index) => {
                    if (candidates.length >= maxLimit * 2)
                        return; // 후보 수 제한
                    // 부모 요소에서 "실시간", "이슈", "브리핑", "트렌드" 텍스트 확인
                    let parent = link.parentElement;
                    let hasRealtimeContext = false;
                    // 최대 5단계 상위 요소까지 확인
                    for (let i = 0; i < 5 && parent; i++) {
                        const parentText = parent.textContent || '';
                        const parentClass = parent.className || '';
                        const parentId = parent.id || '';
                        // 실시간 이슈 관련 컨텍스트 확인
                        if (/실시간|이슈|브리핑|트렌드|issue|realtime|briefing|trend/i.test(parentText) ||
                            /실시간|이슈|브리핑|트렌드|issue|realtime|briefing|trend/i.test(parentClass) ||
                            /실시간|이슈|브리핑|트렌드|issue|realtime|briefing|trend/i.test(parentId)) {
                            hasRealtimeContext = true;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    // 실시간 이슈 컨텍스트가 없는 링크는 제외
                    if (!hasRealtimeContext) {
                        return;
                    }
                    let keyword = '';
                    // href에서 키워드 추출 (우선순위 1)
                    const href = link.href || '';
                    const hrefMatch = href.match(/[?&]q=([^&]+)/);
                    if (hrefMatch && hrefMatch[1]) {
                        try {
                            keyword = decodeURIComponent(hrefMatch[1]).trim();
                        }
                        catch (e) {
                            keyword = hrefMatch[1].trim();
                        }
                    }
                    // 텍스트에서 추출 (우선순위 2)
                    if (!keyword || keyword.length < 2) {
                        keyword = link.textContent?.trim() || '';
                        keyword = keyword
                            .replace(/^\d+\.?\s*/, '')
                            .replace(/^\d+위\s*/, '')
                            .replace(/^위,\s*/, '')
                            .replace(/^▶\s*/, '')
                            .replace(/^▶/, '')
                            .replace(/^▲\s*/, '')
                            .replace(/^▼\s*/, '')
                            .replace(/^NEW\s*/i, '')
                            .replace(/^HOT\s*/i, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                    }
                    // 제목처럼 보이는 긴 텍스트 제외
                    const isLikelyTitle = keyword.length > 50 && keyword.split(/\s+/).length > 8;
                    // 뉴스 제목처럼 보이는 패턴 필터링
                    const isNewsTitle = keyword.length > 30 && (keyword.endsWith('했다') ||
                        keyword.endsWith('했다고') ||
                        keyword.endsWith('한다') ||
                        keyword.endsWith('했다는') ||
                        keyword.endsWith('했다.') ||
                        keyword.endsWith('한다.') ||
                        keyword.split(/\s+/).length > 6);
                    // 기본 필터링
                    if (keyword &&
                        keyword.length >= 2 &&
                        keyword.length <= 50 &&
                        !isLikelyTitle &&
                        !isNewsTitle &&
                        /[가-힣a-zA-Z0-9]/.test(keyword) &&
                        !/^\d+$/.test(keyword) &&
                        !['통합검색', '로그인', '로그아웃', '더보기', '전체보기'].includes(keyword)) {
                        candidates.push({
                            element: link,
                            keyword: keyword,
                            rank: index + 1
                        });
                    }
                });
                console.log(`[DAUM-REALTIME] 실시간 이슈 관련 후보 키워드 ${candidates.length}개 수집`);
                // 후보 키워드 추가
                if (candidates.length >= 1) {
                    candidates.forEach((candidate) => {
                        if (result.length >= maxLimit)
                            return;
                        const keywordLower = candidate.keyword.toLowerCase();
                        // 중복 체크
                        if (!allKeywords.has(keywordLower)) {
                            allKeywords.add(keywordLower);
                            result.push({
                                keyword: candidate.keyword,
                                rank: result.length + 1
                            });
                        }
                    });
                    console.log(`[DAUM-REALTIME] 실시간 이슈 관련 키워드 ${result.length}개 추출 완료`);
                    // 10개를 확보했으면 여기서 반환
                    if (result.length >= maxLimit) {
                        return result;
                    }
                }
            }
            // 우선순위 3: targetSection에서 키워드 추출 (targetSection이 있어도 전체 페이지에서 추가 수집)
            if (targetSection) {
                console.log(`[DAUM-REALTIME] 실시간 이슈 섹션 확인: ${targetSection.id || targetSection.className}`);
                // 섹션 내의 모든 링크 찾기
                const keywordLinks = targetSection.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="], a[href*="issue"]');
                console.log(`[DAUM-REALTIME] 검색 링크 ${keywordLinks.length}개 발견`);
                const tempKeywords = [];
                // 최소 10개 확보를 위해 더 많은 링크 확인 (maxLimit * 3까지)
                keywordLinks.forEach((el, index) => {
                    if (tempKeywords.length >= maxLimit * 3)
                        return;
                    let keyword = '';
                    // 1. href에서 키워드 추출 (가장 확실한 방법)
                    if (el.tagName === 'A') {
                        const href = el.href || '';
                        // 다음 검색 URL 패턴: /search?w=tot&...&q=검색어 또는 ?q=검색어
                        const hrefMatch = href.match(/[?&]q=([^&]+)/);
                        if (hrefMatch && hrefMatch[1]) {
                            try {
                                keyword = decodeURIComponent(hrefMatch[1]).trim();
                                console.log(`[DAUM-REALTIME] 링크 ${index} href에서 추출: "${keyword}"`);
                            }
                            catch (e) {
                                keyword = hrefMatch[1].trim();
                            }
                        }
                    }
                    // 2. data 속성 확인 (실시간 이슈 관련 속성)
                    if (!keyword || keyword.length < 2) {
                        keyword = el.getAttribute('data-keyword') ||
                            el.getAttribute('data-query') ||
                            el.getAttribute('data-tiara-keyword') ||
                            el.getAttribute('title') || '';
                    }
                    // 3. 텍스트에서 추출 (마지막 수단) - 브리핑/트렌드 영역의 경우
                    if (!keyword || keyword.length < 2) {
                        keyword = el.textContent?.trim() || '';
                        // 순위 번호, 아이콘, UI 텍스트 제거
                        keyword = keyword
                            .replace(/^\d+\.?\s*/, '')
                            .replace(/^\d+위\s*/, '')
                            .replace(/^위,\s*/, '')
                            .replace(/^▶\s*/, '')
                            .replace(/^▶/, '')
                            .replace(/^▲\s*/, '')
                            .replace(/^▼\s*/, '')
                            .replace(/^NEW\s*/i, '')
                            .replace(/^HOT\s*/i, '')
                            .trim();
                    }
                    // 기본 필터링 (길이 제한 완화: 30자 -> 50자)
                    if (!keyword || keyword.length < 2 || keyword.length > 50) {
                        return;
                    }
                    // 한글/영어/숫자 포함 필터 (더 완화)
                    if (!/[가-힣a-zA-Z0-9]/.test(keyword)) {
                        return;
                    }
                    // UI 요소 제외 (최소한만 - 필수 UI 요소만)
                    const essentialUiKeywords = ['통합검색', '로그인', '로그아웃', '더보기', '전체보기'];
                    if (essentialUiKeywords.includes(keyword)) {
                        return;
                    }
                    // 숫자만 있는 키워드 제외 (예: "1위", "2위")
                    if (/^\d+$/.test(keyword)) {
                        return;
                    }
                    // 너무 짧은 단일 단어 제외 (단, 2자 이상이면 허용)
                    if (keyword.length === 1) {
                        return;
                    }
                    // 중복 체크 (allKeywords Set 사용)
                    const keywordLower = keyword.toLowerCase();
                    if (!allKeywords.has(keywordLower)) {
                        allKeywords.add(keywordLower);
                        tempKeywords.push(keyword);
                        console.log(`[DAUM-REALTIME] 실시간 이슈 키워드 추가 (${tempKeywords.length}번째): "${keyword}"`);
                    }
                });
                // 결과에 추가 (최대 maxLimit개)
                tempKeywords.slice(0, maxLimit).forEach((keyword, index) => {
                    if (result.length >= maxLimit)
                        return;
                    result.push({
                        keyword: keyword,
                        rank: index + 1
                    });
                });
                console.log(`[DAUM-REALTIME] 실시간 이슈 섹션에서 ${result.length}개 키워드 추출 완료`);
            }
            // 최소 10개 확보를 위한 추가 수집 (아직 부족한 경우 - 반복 시도)
            let retryCount = 0;
            const maxRetries = 3;
            while (result.length < maxLimit && retryCount < maxRetries) {
                console.log(`[DAUM-REALTIME] 추가 수집 시작 (현재 ${result.length}개, 목표 ${maxLimit}개, 시도 ${retryCount + 1}/${maxRetries})`);
                // 전체 페이지에서 추가 키워드 찾기 (더 넓은 범위)
                const allSearchLinks = document.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="], a[href*="keyword"], a[href*="issue"]');
                const additionalKeywords = [];
                allSearchLinks.forEach((link) => {
                    if (additionalKeywords.length >= (maxLimit - result.length) * 3)
                        return;
                    let keyword = '';
                    const href = link.href || '';
                    const hrefMatch = href.match(/[?&]q=([^&]+)/);
                    if (hrefMatch && hrefMatch[1]) {
                        try {
                            keyword = decodeURIComponent(hrefMatch[1]).trim();
                        }
                        catch (e) {
                            keyword = hrefMatch[1].trim();
                        }
                    }
                    if (!keyword || keyword.length < 2) {
                        keyword = link.textContent?.trim() || '';
                        keyword = keyword
                            .replace(/^\d+\.?\s*/, '')
                            .replace(/^\d+위\s*/, '')
                            .replace(/^위,\s*/, '')
                            .replace(/^▶\s*/, '')
                            .replace(/^▶/, '')
                            .replace(/^▲\s*/, '')
                            .replace(/^▼\s*/, '')
                            .replace(/^NEW\s*/i, '')
                            .replace(/^HOT\s*/i, '')
                            .trim();
                    }
                    // 기본 필터링 (더 완화 - 최소한만 필터링)
                    if (keyword &&
                        keyword.length >= 2 &&
                        keyword.length <= 50 &&
                        /[가-힣a-zA-Z0-9]/.test(keyword) &&
                        !/^\d+$/.test(keyword) &&
                        !['통합검색', '로그인', '로그아웃', '더보기', '전체보기'].includes(keyword)) {
                        const keywordLower = keyword.toLowerCase();
                        if (!allKeywords.has(keywordLower)) {
                            allKeywords.add(keywordLower);
                            additionalKeywords.push(keyword);
                        }
                    }
                });
                // 추가 키워드를 결과에 합치기
                additionalKeywords.slice(0, maxLimit - result.length).forEach((keyword) => {
                    if (result.length >= maxLimit)
                        return;
                    result.push({
                        keyword: keyword,
                        rank: result.length + 1
                    });
                });
                console.log(`[DAUM-REALTIME] 추가 수집 완료: 총 ${result.length}개 키워드 (목표: ${maxLimit}개)`);
                // 10개를 확보했으면 중단
                if (result.length >= maxLimit) {
                    break;
                }
                retryCount++;
                // 재시도 전에 더 많은 선택자 시도
                if (retryCount < maxRetries) {
                    // 다른 선택자로 추가 시도
                    const alternativeSelectors = [
                        'a[href*="/search"]',
                        'a[title*="검색"]',
                        '[class*="keyword"] a',
                        '[class*="rank"] a',
                        '[class*="issue"] a',
                        '[class*="trend"] a'
                    ];
                    for (const selector of alternativeSelectors) {
                        if (result.length >= maxLimit)
                            break;
                        const altLinks = document.querySelectorAll(selector);
                        altLinks.forEach((link) => {
                            if (result.length >= maxLimit)
                                return;
                            let keyword = '';
                            const href = link.href || '';
                            const hrefMatch = href.match(/[?&]q=([^&]+)/);
                            if (hrefMatch && hrefMatch[1]) {
                                try {
                                    keyword = decodeURIComponent(hrefMatch[1]).trim();
                                }
                                catch (e) {
                                    keyword = hrefMatch[1].trim();
                                }
                            }
                            if (!keyword || keyword.length < 2) {
                                keyword = link.textContent?.trim() || '';
                                keyword = keyword.replace(/^\d+\.?\s*/, '').replace(/^\d+위\s*/, '').trim();
                            }
                            if (keyword &&
                                keyword.length >= 2 &&
                                keyword.length <= 50 &&
                                /[가-힣a-zA-Z0-9]/.test(keyword) &&
                                !/^\d+$/.test(keyword) &&
                                !['통합검색', '로그인', '로그아웃', '더보기', '전체보기'].includes(keyword)) {
                                const keywordLower = keyword.toLowerCase();
                                if (!allKeywords.has(keywordLower)) {
                                    allKeywords.add(keywordLower);
                                    result.push({
                                        keyword: keyword,
                                        rank: result.length + 1
                                    });
                                    console.log(`[DAUM-REALTIME] 대체 선택자에서 키워드 발견: "${keyword}" (총 ${result.length}개)`);
                                }
                            }
                        });
                    }
                }
            }
            // 최종적으로 10개 미만이면 경고 및 디버깅 정보
            if (result.length < maxLimit) {
                console.warn(`[DAUM-REALTIME] ⚠️ 목표(${maxLimit}개) 미달: ${result.length}개만 수집됨`);
                console.log(`[DAUM-REALTIME] 수집된 키워드 목록:`, result.map(r => r.keyword));
                // 전체 페이지에서 검색 링크 개수 확인
                const totalSearchLinks = document.querySelectorAll('a[href*="/search"], a[href*="q="], a[href*="query="]').length;
                console.log(`[DAUM-REALTIME] 전체 검색 링크: ${totalSearchLinks}개`);
            }
            else {
                console.log(`[DAUM-REALTIME] ✅ 목표(${maxLimit}개) 달성: ${result.length}개 수집 완료`);
                console.log(`[DAUM-REALTIME] 수집된 키워드:`, result.map(r => r.keyword));
            }
            return result;
        }, limit);
        console.log(`[DAUM-REALTIME] ${keywords.length}개 키워드 발견`);
        // 결과 변환
        let realtimeKeywords = keywords
            .slice(0, limit)
            .map((item, index) => ({
            rank: index + 1,
            keyword: item.keyword,
            source: 'daum',
            timestamp: new Date().toISOString()
        }));
        console.log(`[DAUM-REALTIME] 실시간 검색어 ${realtimeKeywords.length}개 수집 완료 (목표: ${limit}개)`);
        // 목표 개수보다 적으면 경고하되, 수집된 것이라도 반환
        if (realtimeKeywords.length < limit) {
            console.warn(`[DAUM-REALTIME] ⚠️ 목표(${limit}개)보다 적은 ${realtimeKeywords.length}개만 수집됨`);
        }
        // 1개 이상이면 반환 (목표보다 적어도 수집된 것 반환)
        if (realtimeKeywords.length > 0) {
            return realtimeKeywords;
        }
        // 0개일 경우에만 에러 발생
        throw new Error(`키워드 수집 부족: 0개`);
    }
    catch (error) {
        console.warn('[DAUM-REALTIME] Puppeteer 크롤링 실패:', error.message || error);
        throw error;
    }
    finally {
        if (browser) {
            try {
                await browser.close();
                console.log('[DAUM-REALTIME] 브라우저 종료 완료');
            }
            catch (e) {
                console.warn('[DAUM-REALTIME] 브라우저 종료 오류:', e);
            }
        }
    }
}
