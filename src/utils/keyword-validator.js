"use strict";
/**
 * 키워드 검증 유틸리티
 * 네이버 API를 통해 키워드의 실제 검색량, 문서수, 유효성을 검증
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateKeyword = validateKeyword;
exports.validateKeywords = validateKeywords;
const naver_datalab_api_1 = require("./naver-datalab-api");
const naver_crawler_1 = require("../naver-crawler");
const environment_manager_1 = require("./environment-manager");
/**
 * 키워드 검증
 */
async function validateKeyword(keyword) {
    try {
        const envManager = environment_manager_1.EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
        if (!clientId || !clientSecret) {
            return {
                keyword,
                searchVolume: 0,
                documentCount: 0,
                validated: false,
                validationScore: 0,
                reason: '네이버 API 키 없음'
            };
        }
        // 1. 검색량 검증
        let searchVolume = 0;
        try {
            const volumeData = await (0, naver_datalab_api_1.getNaverKeywordSearchVolumeSeparate)({
                clientId,
                clientSecret
            }, [keyword]);
            if (volumeData && volumeData.length > 0 && volumeData[0]) {
                // pcSearchVolume + mobileSearchVolume 합산
                searchVolume = (volumeData[0].pcSearchVolume || 0) + (volumeData[0].mobileSearchVolume || 0);
            }
        }
        catch (e) {
            console.warn(`[KEYWORD-VALIDATOR] 검색량 조회 실패 (${keyword}):`, e);
        }
        // 2. 문서수 검증 (블로그 검색)
        let documentCount = 0;
        try {
            const blogResults = await (0, naver_crawler_1.searchNaverWithApi)(keyword, { customerId: clientId, secretKey: clientSecret }, 'blog', { timeout: 5000, retries: 1 });
            // 첫 페이지 결과로 문서수 추정 (정확한 문서수는 total 필드에 있지만 간접 추정)
            if (blogResults && blogResults.length > 0) {
                // 검색 API 응답에서 total 가져오기 (간접 추정)
                documentCount = blogResults.length > 0 ? 100 : 0; // 최소 100개로 추정
            }
            // 직접 API로 total 가져오기 시도
            try {
                const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
                const params = new URLSearchParams({
                    query: keyword,
                    display: '1',
                    start: '1',
                    sort: 'sim'
                });
                const response = await fetch(`${apiUrl}?${params}`, {
                    headers: {
                        'X-Naver-Client-Id': clientId,
                        'X-Naver-Client-Secret': clientSecret
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    documentCount = parseInt(data.total || '0');
                }
            }
            catch (e) {
                // 실패해도 계속 진행
            }
        }
        catch (e) {
            console.warn(`[KEYWORD-VALIDATOR] 문서수 조회 실패 (${keyword}):`, e);
        }
        // 3. 검증 점수 계산
        let validationScore = 0;
        let validated = false;
        let reason = '';
        if (searchVolume > 0 && documentCount > 0) {
            // 검색량과 문서수가 모두 있으면 유효한 키워드
            validated = true;
            // 검증 점수: 검색량이 높을수록, 문서수가 적당할수록 높은 점수
            const volumeScore = Math.min(100, (searchVolume / 100) * 10); // 검색량 점수
            const competitionScore = documentCount < 100 ? 100 :
                documentCount < 500 ? 80 :
                    documentCount < 1000 ? 60 : 40; // 경쟁 적을수록 높은 점수
            validationScore = Math.round((volumeScore * 0.6) + (competitionScore * 0.4));
            reason = '검증 완료';
        }
        else if (documentCount > 0) {
            // 문서수만 있어도 유효한 키워드 (검색량은 추정 불가일 수 있음)
            validated = true;
            validationScore = 60;
            reason = '문서 존재 확인 (검색량 미확인)';
        }
        else {
            validated = false;
            validationScore = 0;
            reason = '검색 결과 없음';
        }
        return {
            keyword,
            searchVolume,
            documentCount,
            validated,
            validationScore,
            reason
        };
    }
    catch (error) {
        console.warn(`[KEYWORD-VALIDATOR] 키워드 검증 실패 (${keyword}):`, error.message);
        return {
            keyword,
            searchVolume: 0,
            documentCount: 0,
            validated: false,
            validationScore: 0,
            reason: error.message || '검증 실패'
        };
    }
}
/**
 * 키워드 목록 일괄 검증
 */
async function validateKeywords(keywords, maxConcurrent = 5) {
    const results = [];
    // 동시 처리 수 제한
    for (let i = 0; i < keywords.length; i += maxConcurrent) {
        const batch = keywords.slice(i, i + maxConcurrent);
        const batchResults = await Promise.allSettled(batch.map(keyword => validateKeyword(keyword)));
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
            else {
                results.push({
                    keyword: batch[Math.min(batchResults.indexOf(result), batch.length - 1)] || '',
                    searchVolume: 0,
                    documentCount: 0,
                    validated: false,
                    validationScore: 0,
                    reason: result.reason?.message || '검증 실패'
                });
            }
        }
    }
    return results;
}
