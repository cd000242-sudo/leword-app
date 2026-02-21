"use strict";
/**
 * 네이버 검색 API를 사용한 실시간 링크 검색 및 유효성 검증
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchNaverWithApi = searchNaverWithApi;
exports.validateLink = validateLink;
exports.validateLinks = validateLinks;
exports.getValidNaverLinks = getValidNaverLinks;
exports.getValidLinksForMultipleKeywords = getValidLinksForMultipleKeywords;
/**
 * 네이버 검색 API를 사용하여 키워드로 검색 결과 가져오기
 */
async function searchNaverWithApi(keyword, credentials, display = 10) {
    try {
        // API 키 검증
        if (!credentials.clientId || !credentials.clientSecret) {
            const errorMessage = `❌ 네이버 검색 API 키가 설정되지 않았습니다!

💡 해결 방법:
1. 설정 탭에서 네이버 API 키를 입력해주세요
2. Client ID와 Client Secret이 모두 필요합니다
3. 네이버 개발자 센터(https://developers.naver.com)에서 발급받으세요

⚠️ API 키 없이는 네이버 검색 API를 사용할 수 없습니다.`;
            throw new Error(errorMessage);
        }
        const apiUrl = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`;
        const response = await fetch(apiUrl, {
            headers: {
                'X-Naver-Client-Id': credentials.clientId,
                'X-Naver-Client-Secret': credentials.clientSecret,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) {
            // 🔧 개선된 오류 처리: 사용자 친화적 메시지 + 크레딧 충전 안내
            if (response.status === 401 || response.status === 403) {
                const errorMessage = `❌ 네이버 검색 API 키 인증 실패! (${response.status})

💡 해결 방법:
1. 네이버 개발자 센터(https://developers.naver.com)에서 API 키 확인
2. Client ID와 Client Secret이 정확한지 확인
3. 검색 API 사용 권한이 활성화되어 있는지 확인

⚠️ API 키가 유효하지 않거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
                throw new Error(errorMessage);
            }
            if (response.status === 429) {
                const errorMessage = `❌ 네이버 검색 API 할당량 초과! (429)

💡 해결 방법:
1. 잠시 후 다시 시도하세요 (1분 대기 권장)
2. 네이버 개발자 센터에서 사용량 확인
3. 필요시 유료 플랜으로 업그레이드

⚠️ 무료 할당량을 초과했습니다.
크레딧을 충전하거나 유료 플랜을 사용하세요.`;
                throw new Error(errorMessage);
            }
            if (response.status === 500) {
                const errorMessage = `❌ 네이버 검색 서버 오류가 발생했습니다. (500)

💡 해결 방법:
1. 잠시 후 다시 시도해주세요
2. 네이버 개발자 센터 상태 페이지 확인
3. 문제가 지속되면 네이버 고객센터에 문의`;
                throw new Error(errorMessage);
            }
            throw new Error(`네이버 검색 API 오류: ${response.status}`);
        }
        const data = await response.json();
        if (!data.items || !Array.isArray(data.items)) {
            return [];
        }
        return data.items.map((item) => ({
            title: item.title?.replace(/<[^>]*>/g, '') || '',
            link: item.link || '',
            description: item.description?.replace(/<[^>]*>/g, '') || ''
        }));
    }
    catch (error) {
        const errorMsg = error?.message || String(error || '').toLowerCase();
        console.error(`[NAVER-SEARCH] 검색 실패: ${errorMsg}`);
        // 🔧 개선된 오류 처리: catch 블록에서도 명확한 오류 메시지 제공
        if (errorMsg.includes('401') || errorMsg.includes('인증')) {
            const errorMessage = `❌ 네이버 검색 API 키 인증 실패! (401)

💡 해결 방법:
1. 네이버 개발자 센터(https://developers.naver.com)에서 API 키 확인
2. Client ID와 Client Secret이 정확한지 확인
3. 검색 API 사용 권한이 활성화되어 있는지 확인

⚠️ API 키가 유효하지 않거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
            throw new Error(errorMessage);
        }
        else if (errorMsg.includes('403') || errorMsg.includes('권한')) {
            const errorMessage = `❌ 네이버 검색 API 접근 거부! (403)

💡 해결 방법:
1. 네이버 개발자 센터에서 API 사용 권한 확인
2. 검색 API 서비스가 활성화되어 있는지 확인
3. API 키에 올바른 권한이 부여되어 있는지 확인

⚠️ API 사용 권한이 없거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
            throw new Error(errorMessage);
        }
        else if (errorMsg.includes('429') || errorMsg.includes('할당량') || errorMsg.includes('한도')) {
            const errorMessage = `❌ 네이버 검색 API 할당량 초과! (429)

💡 해결 방법:
1. 잠시 후 다시 시도하세요 (1분 대기 권장)
2. 네이버 개발자 센터에서 사용량 확인
3. 필요시 유료 플랜으로 업그레이드

⚠️ 무료 할당량을 초과했습니다.
크레딧을 충전하거나 유료 플랜을 사용하세요.`;
            throw new Error(errorMessage);
        }
        throw error;
    }
}
/**
 * 링크 유효성 검사 (HEAD 요청으로 200-299 상태 코드만 허용)
 */
async function validateLink(url, timeout = 5000) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        const statusCode = response.status;
        const isValid = statusCode >= 200 && statusCode < 300;
        return {
            isValid,
            statusCode
        };
    }
    catch (error) {
        if (error.name === 'AbortError') {
            return {
                isValid: false,
                error: '타임아웃'
            };
        }
        return {
            isValid: false,
            error: error.message || '알 수 없는 오류'
        };
    }
}
/**
 * 여러 링크의 유효성을 병렬로 검증
 */
async function validateLinks(links, maxConcurrent = 5) {
    const results = [];
    // 배치로 처리하여 동시 요청 수 제한
    for (let i = 0; i < links.length; i += maxConcurrent) {
        const batch = links.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(batch.map(async (link) => {
            const validation = await validateLink(link.url);
            return {
                ...link,
                isValid: validation.isValid,
                statusCode: validation.statusCode,
                error: validation.error
            };
        }));
        results.push(...batchResults);
        // 배치 간 딜레이 (Rate Limiting)
        if (i + maxConcurrent < links.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return results;
}
/**
 * 네이버 검색 API로 키워드 검색 후 유효한 링크만 반환
 */
async function getValidNaverLinks(keyword, credentials, options = {}) {
    const { maxResults = 10, maxConcurrent = 5, validateLinks: shouldValidate = true } = options;
    try {
        console.log(`[NAVER-SEARCH] "${keyword}" 검색 시작 (최대 ${maxResults}개)`);
        // 1. 네이버 검색 API로 검색 결과 가져오기
        const searchResults = await searchNaverWithApi(keyword, credentials, maxResults * 2);
        if (searchResults.length === 0) {
            console.log(`[NAVER-SEARCH] "${keyword}"에 대한 검색 결과가 없습니다.`);
            return [];
        }
        console.log(`[NAVER-SEARCH] 검색 결과 ${searchResults.length}개 발견`);
        // 2. 링크 유효성 검증
        if (shouldValidate) {
            console.log(`[NAVER-SEARCH] 링크 유효성 검증 중...`);
            const validatedLinks = await validateLinks(searchResults.map(link => ({ url: link.link, title: link.title, description: link.description })), maxConcurrent);
            // 유효한 링크만 필터링
            const validLinks = validatedLinks.filter(link => link.isValid);
            console.log(`[NAVER-SEARCH] 유효한 링크 ${validLinks.length}개 / 전체 ${validatedLinks.length}개`);
            // 로그 출력
            validatedLinks.forEach((link, index) => {
                if (link.isValid) {
                    console.log(`[NAVER-SEARCH] ✅ ${index + 1}. ${link.title} (${link.statusCode || 'N/A'})`);
                    console.log(`[NAVER-SEARCH]    ${link.url}`);
                }
                else {
                    console.log(`[NAVER-SEARCH] ❌ ${index + 1}. ${link.title} (${link.statusCode || link.error || 'N/A'})`);
                    console.log(`[NAVER-SEARCH]    ${link.url}`);
                }
            });
            return validLinks.slice(0, maxResults);
        }
        else {
            // 유효성 검증 없이 반환
            return searchResults.slice(0, maxResults).map(link => ({
                url: link.link,
                title: link.title,
                description: link.description,
                isValid: true
            }));
        }
    }
    catch (error) {
        console.error(`[NAVER-SEARCH] 오류: ${error.message}`);
        throw error;
    }
}
/**
 * 여러 키워드로 검색하여 유효한 링크 수집
 */
async function getValidLinksForMultipleKeywords(keywords, credentials, options = {}) {
    const { maxResultsPerKeyword = 5, maxTotalResults = 10, validateLinks: shouldValidate = true } = options;
    const allLinks = [];
    const seenUrls = new Set();
    for (const keyword of keywords) {
        try {
            const links = await getValidNaverLinks(keyword, credentials, {
                maxResults: maxResultsPerKeyword,
                validateLinks: shouldValidate
            });
            // 중복 제거
            for (const link of links) {
                if (!seenUrls.has(link.url)) {
                    seenUrls.add(link.url);
                    allLinks.push(link);
                    if (allLinks.length >= maxTotalResults) {
                        break;
                    }
                }
            }
            if (allLinks.length >= maxTotalResults) {
                break;
            }
            // 키워드 간 딜레이 (Rate Limiting)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch (error) {
            console.error(`[NAVER-SEARCH] "${keyword}" 검색 실패: ${error.message}`);
            // 계속 진행
        }
    }
    return allLinks.slice(0, maxTotalResults);
}
