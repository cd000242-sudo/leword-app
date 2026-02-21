"use strict";
/**
 * 키워드 급상승 이유 분석 유틸리티
 * 네이버 뉴스/블로그 검색을 통해 키워드가 급상승한 이유 파악
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeKeywordTrendingReason = analyzeKeywordTrendingReason;
const naver_crawler_1 = require("../naver-crawler");
const environment_manager_1 = require("./environment-manager");
/**
 * 키워드 급상승 이유 분석
 */
async function analyzeKeywordTrendingReason(keyword, keywordData) {
    const defaultData = keywordData || { searchVolume: 3000, documentCount: 500, growthRate: 100 };
    try {
        const envManager = environment_manager_1.EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
        let recentNews = [];
        // 네이버 뉴스 검색 시도 (API 키가 있는 경우)
        if (clientId && clientSecret) {
            try {
                const newsResults = await (0, naver_crawler_1.searchNaverWithApi)(keyword, { customerId: clientId, secretKey: clientSecret }, 'news', { timeout: 5000, retries: 1 });
                recentNews = newsResults.slice(0, 5);
            }
            catch (error) {
                // API 실패해도 계속 진행 (다른 소스에서 정보 추출)
                console.warn(`[TREND-ANALYZER] 네이버 뉴스 검색 실패:`, error.message);
            }
        }
        // API 실패 또는 뉴스 없음 시에도 기본 정보 제공
        if (recentNews.length === 0) {
            // 실시간 검색어에서 추출한 정보 활용
            const growthRate = defaultData.growthRate || 0;
            const searchVolume = defaultData.searchVolume || 0;
            const documentCount = defaultData.documentCount || 0;
            // 검색량과 성장률 기반으로 구체적인 이유 생성
            let trendingReason = '';
            if (growthRate > 200) {
                trendingReason = `검색량이 ${Math.round(growthRate)}% 급상승하며 실시간 이슈화 진행 중`;
            }
            else if (growthRate > 100) {
                trendingReason = `검색량이 ${Math.round(growthRate)}% 증가하며 주목도 상승 중`;
            }
            else if (searchVolume > 5000) {
                trendingReason = `월 검색량 ${searchVolume.toLocaleString()}회로 높은 관심도 유지 중`;
            }
            else {
                trendingReason = '최근 검색 트렌드 급상승 중';
            }
            let whyNow = generateDefaultWhyNow(defaultData);
            if (documentCount < 100) {
                whyNow = `경쟁 문서가 ${documentCount}개로 매우 적어 조기 진입 시 상위 노출 확률 높음 • 검색량 급상승 중으로 트래픽 유입 잠재력 큼`;
            }
            return {
                trendingReason,
                whyNow
            };
        }
        // 뉴스 제목에서 공통 키워드/이슈 추출
        const titles = recentNews.map(n => n.title).join(' ');
        const descriptions = recentNews.map(n => n.description || '').join(' ');
        const fullText = titles + ' ' + descriptions;
        // 급상승 이유 추출 (더 구체적으로)
        const trendingReason = extractTrendingReason(keyword, fullText, recentNews);
        // 왜 지금 쓰면 좋은지 추출
        const whyNow = extractWhyNow(keyword, fullText, recentNews);
        // 기본값도 더 구체적으로
        const defaultReason = trendingReason || extractReasonFromTitles(recentNews) || '최근 뉴스에서 이슈화';
        return {
            trendingReason: defaultReason,
            whyNow: whyNow || generateDefaultWhyNow(defaultData)
        };
    }
    catch (error) {
        console.warn(`[TREND-ANALYZER] 키워드 "${keyword}" 분석 실패:`, error.message);
        return {
            trendingReason: '최근 검색 트렌드 급상승 중 (상세 분석 실패)',
            whyNow: generateDefaultWhyNow(defaultData)
        };
    }
}
/**
 * 급상승 이유 추출 (강화 버전 - 실제 사건/이슈 중심)
 */
function extractTrendingReason(keyword, text, news) {
    // 최상위 뉴스 제목에서 구체적인 이유 추출
    if (news.length > 0 && news[0]) {
        const topTitle = news[0].title || '';
        const topDesc = news[0].description || '';
        // 제목에서 핵심 이슈 추출
        let reason = '';
        // 패턴 1: 구체적 사건 추출 (인물명 + 사건)
        // 예: "머스크 '1조달러 보상안'", "김성태 날...수원지검" 같은 핵심 키워드 추출
        const specificEventPatterns = [
            // 인물명 + 사건/발표/확인 등
            /([가-힣A-Za-z]{2,15})\s*['""]?([가-힣A-Za-z0-9\s]{3,30})['""]?\s*(?:발표|공개|확인|밝혀|알려|제안|제시|공약|선언|발언|주장)/g,
            // 인물명 + 금액/수치 관련
            /([가-힣A-Za-z]{2,15})\s*['""]?([0-9조억만원달러]{2,20})['""]?\s*(?:보상|지원|투자|기부|보상안|지원안)/g,
            // 사건/이슈 + 장소/기관
            /([가-힣]{2,10})\s*(?:날|사건|논란|이슈)\s*\.\.\.\s*([가-힣]{2,15})/g,
            // 일반 사건 패턴
            /([가-힣A-Za-z]{2,15})\s*(?:발표|공개|확인|밝혀|알려|공개|오픈|출시|런칭|시작|개막|발견|제안|제시|공약|선언|발언|주장)/g,
            /([가-힣A-Za-z]{2,15})\s*(?:사건|사고|소식|이슈|논란|논쟁|쟁점|보상안|지원안|정책|법안)/g,
        ];
        for (const pattern of specificEventPatterns) {
            const matches = Array.from(topTitle.matchAll(pattern));
            if (matches && matches.length > 0) {
                // 첫 번째 매치에서 핵심 키워드 추출
                const match = matches[0];
                if (match && match.length >= 2) {
                    // 인물명 + 사건 조합 추출
                    if (match.length >= 3 && match[1] && match[2]) {
                        reason = `${match[1]} '${match[2]}'`;
                    }
                    else if (match[1]) {
                        reason = match[1] + (match[2] ? ' ' + match[2] : '');
                    }
                    // 키워드와 중복되는 부분 제거
                    reason = reason.replace(new RegExp(keyword, 'gi'), '').trim();
                    if (reason.length > 3 && reason.length < 50) {
                        return reason + ' 관련 최근 이슈';
                    }
                }
            }
        }
        // 패턴 2: 제목에서 핵심 키워드만 추출 (문장 전체가 아닌)
        if (!reason && topTitle.length > 10) {
            // 제목을 단어로 분리
            const titleWords = topTitle
                .replace(/[\/\#\:\-\[\]()【】「」<>|]/g, ' ')
                .split(/\s+/)
                .filter(w => w.trim().length > 1);
            // 키워드 제외하고 핵심 단어만 추출
            const coreWords = titleWords
                .filter(w => {
                const wLower = w.toLowerCase();
                // 불필요한 단어 제외
                const stopWords = ['뉴스', '속보', '기사', '보도', '관련', '이슈', '논란', '사건', '확인', '발표', '공개'];
                if (stopWords.some(sw => wLower.includes(sw)))
                    return false;
                // 키워드와 동일한 단어 제외
                if (wLower === keyword.toLowerCase())
                    return false;
                // 숫자만 있는 경우 제외
                if (/^\d+$/.test(w))
                    return false;
                return true;
            })
                .slice(0, 3); // 최대 3개 단어만
            if (coreWords.length >= 2) {
                // 핵심 키워드 조합 (예: "머스크 '1조달러 보상안'")
                reason = coreWords.join(' ');
                // 따옴표가 있으면 유지
                if (topTitle.includes("'") || topTitle.includes('"')) {
                    const quotedMatch = topTitle.match(/['"]([^'"]{3,30})['"]/);
                    if (quotedMatch) {
                        reason = `${coreWords[0]} '${quotedMatch[1]}'`;
                    }
                }
                if (reason.length >= 5 && reason.length <= 50) {
                    return reason + ' 관련 최근 이슈';
                }
            }
        }
        // 패턴 3: 설명에서 핵심 추출
        if (!reason && topDesc && topDesc.length > 20) {
            // 설명에서도 핵심 키워드만 추출
            const descWords = topDesc
                .split(/[\.\s]/)
                .filter(w => w.length > 2 && w.length < 15)
                .filter(w => !/^(뉴스|속보|기사|보도|관련|이슈|논란|사건|확인|발표|공개)$/.test(w))
                .slice(0, 3)
                .join(' ');
            if (descWords.length > 5 && descWords.length < 50) {
                reason = descWords;
                return reason + ' 관련 최근 이슈';
            }
        }
        // 패턴 4: 여러 뉴스 제목에서 공통 핵심 키워드 추출
        if (!reason && news.length >= 2) {
            const titles = news.slice(0, 3).map(n => n.title || '').join(' ');
            const commonWords = extractCommonKeywords(titles, keyword);
            if (commonWords.length > 0) {
                // 핵심 키워드만 조합 (최대 2-3개)
                const coreKeywords = commonWords.slice(0, 2).join(' ');
                reason = coreKeywords;
                if (reason.length >= 5 && reason.length <= 50) {
                    return reason + ' 관련 이슈';
                }
            }
        }
        if (reason) {
            // 최종 정제
            reason = reason.replace(/^[^\w가-힣]+/, '').replace(/[^\w가-힣]+$/, '').trim();
            if (reason.length >= 5 && reason.length <= 50) {
                return reason + ' 관련 최근 이슈';
            }
        }
    }
    // 기본 패턴 분석 (더 구체적으로)
    const patterns = [
        /(발표|공개|발견|확인|밝혀|알려|오픈|출시|런칭|시작|개막|제안|제시|공약|선언|발언|주장)/g,
        /(사건|사고|소식|이슈|논란|논쟁|쟁점|보상안|지원안|정책|법안)/g,
    ];
    const matchedPatterns = [];
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
            matchedPatterns.push(...matches);
        }
    }
    if (matchedPatterns.length > 0) {
        const uniquePatterns = [...new Set(matchedPatterns)].slice(0, 2);
        // 패턴 앞뒤로 핵심 키워드 추출 시도
        const contextWords = [];
        for (const pattern of uniquePatterns) {
            const patternIndex = text.indexOf(pattern);
            if (patternIndex > 0) {
                const beforeText = text.substring(Math.max(0, patternIndex - 15), patternIndex).trim();
                const words = beforeText.split(/\s+/).filter(w => w.length > 2 && w.length < 10);
                if (words.length > 0) {
                    const lastWord = words[words.length - 1];
                    if (lastWord) {
                        contextWords.push(lastWord);
                    }
                }
            }
        }
        if (contextWords.length > 0) {
            return `${contextWords[0]} ${uniquePatterns[0]} 관련 최근 이슈`;
        }
        return `${uniquePatterns.join(', ')} 관련 최근 이슈`;
    }
    return '최근 검색 트렌드 급상승 중';
}
/**
 * 공통 키워드 추출
 */
function extractCommonKeywords(text, excludeKeyword) {
    const words = text.split(/\s+/).filter(w => {
        const wTrimmed = w.trim();
        if (wTrimmed.length < 2)
            return false;
        if (wTrimmed === excludeKeyword)
            return false;
        if (/^\d+$/.test(wTrimmed))
            return false;
        return true;
    });
    // 단어 빈도 계산
    const wordCount = {};
    words.forEach(w => {
        wordCount[w] = (wordCount[w] || 0) + 1;
    });
    // 2번 이상 나온 단어만 반환
    return Object.entries(wordCount)
        .filter(([_, count]) => count >= 2)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 5)
        .map(([word, _]) => word);
}
/**
 * 뉴스 제목에서 직접 이유 추출
 */
function extractReasonFromTitles(news) {
    if (news.length === 0 || !news[0])
        return '';
    // 최상위 뉴스 제목에서 핵심 문구 추출
    const topTitle = news[0].title || '';
    if (!topTitle)
        return '';
    // 제목이 너무 길면 앞부분만
    if (topTitle.length > 60) {
        return `"${topTitle.substring(0, 60)}..." 관련 뉴스 증가`;
    }
    // 제목에서 핵심 문구 추출 (키워드 제외)
    const titleWords = topTitle.split(/[·\s\-_]/).filter(w => w.length > 2);
    if (titleWords.length > 2) {
        const coreWords = titleWords.slice(0, 3).join(' ');
        return `"${coreWords}" 관련 최근 이슈`;
    }
    return `"${topTitle}" 관련 최근 뉴스 증가`;
}
/**
 * 왜 지금 쓰면 좋은지 추출 (강화 버전)
 */
function extractWhyNow(keyword, text, news) {
    const reasons = [];
    // 1. 최근 뉴스 타이밍 및 이슈화 정도
    if (news.length >= 5) {
        reasons.push(`최근 ${news.length}개 이상의 뉴스에서 다뤄지며 이슈화 진행 중`);
    }
    else if (news.length >= 3) {
        reasons.push('최근 3개 이상의 뉴스에서 다뤄지며 주목도 상승 중');
    }
    else if (news.length >= 1) {
        reasons.push('최근 뉴스에서 이슈화되며 검색량 급증 중');
    }
    // 2. 구체적인 사건/이슈 언급
    const eventKeywords = ['발표', '공개', '확인', '밝혀', '사건', '사고', '논란', '이슈', '출시', '런칭'];
    const hasEvent = eventKeywords.some(word => text.includes(word));
    if (hasEvent) {
        const eventWord = eventKeywords.find(word => text.includes(word));
        reasons.push(`"${eventWord}" 관련 구체적 사건으로 실시간 관심 집중`);
    }
    // 3. 검색 트렌드 키워드 포함 여부
    const trendingWords = ['급상승', '화제', '인기', '주목', '이슈', '관심', '논란', '충격', '폭발', '급증'];
    const foundTrendingWords = trendingWords.filter(word => text.includes(word));
    if (foundTrendingWords.length > 0) {
        reasons.push(`뉴스에서 "${foundTrendingWords[0]}" 키워드로 언급되며 화제성 확보`);
    }
    // 4. 시기적절성
    const timeKeywords = ['오늘', '당일', '실시간', '급', '신규', '최신'];
    const hasTimeKeyword = timeKeywords.some(word => text.includes(word));
    if (hasTimeKeyword) {
        reasons.push('최신 이슈로 실시간 관심 집중 중');
    }
    // 5. 뉴스 제목에서 구체적 이유 추출
    if (news.length > 0 && news[0]) {
        const topTitle = news[0].title || '';
        // 제목에서 핵심 문구 추출 (키워드 제외)
        const titleWithoutKeyword = topTitle.replace(new RegExp(keyword, 'gi'), '').trim();
        if (titleWithoutKeyword.length > 5 && titleWithoutKeyword.length < 40) {
            reasons.push(`"${titleWithoutKeyword.substring(0, 40)}" 관련 최신 뉴스로 조기 진입 효과 기대`);
        }
    }
    // 기본 이유 추가 (구체적으로)
    if (reasons.length === 0) {
        reasons.push('검색량 급상승 중으로 조기 진입 시 상위 노출 가능성 높음');
        reasons.push('경쟁 문서가 적어 노출 확률이 높음');
    }
    return reasons.join(' • ');
}
/**
 * 기본 "왜 지금 쓰면 좋은지" 생성
 */
function generateDefaultWhyNow(keywordData) {
    const searchVolume = keywordData.searchVolume || 1000;
    const documentCount = keywordData.documentCount || 100;
    const growthRate = keywordData.growthRate || 0;
    const reasons = [];
    if (growthRate > 100) {
        reasons.push(`검색량이 ${Math.round(growthRate)}% 급상승 중`);
    }
    if (documentCount < 100) {
        reasons.push('경쟁 문서가 매우 적어 조기 진입 시 상위 노출 확률 높음');
    }
    else if (documentCount < 500) {
        reasons.push('경쟁 문서가 적어 노출 가능성 높음');
    }
    if (searchVolume > 5000) {
        reasons.push('검색량이 높아 트래픽 유입 잠재력 큼');
    }
    if (reasons.length === 0) {
        reasons.push('검색 트렌드 상승 중으로 조기 진입 효과 기대');
    }
    return reasons.join(' • ');
}
