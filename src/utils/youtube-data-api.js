"use strict";
/**
 * YouTube Data API v3를 사용한 트렌드 키워드 수집
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYouTubeTrendKeywords = getYouTubeTrendKeywords;
exports.extractYouTubeTrendingKeywords = extractYouTubeTrendingKeywords;
/**
 * YouTube 트렌드 키워드 수집 (오늘 기준 핫한 영상 제목 추출)
 */
async function getYouTubeTrendKeywords(config) {
    const maxResults = config.maxResults || 25; // 기본값을 25개로 증가 (최소 20개 이상)
    const filterRising = config.filterRising !== false; // 기본값 true
    const regionCode = config.regionCode || 'KR';
    try {
        console.log('[YOUTUBE-API] 오늘 기준 핫한 영상 제목 추출 시작');
        let videosWithStats = [];
        // 1. 뉴스/이슈 카테고리 중심으로 인기 영상 조회 (조회수순, 최근 24시간)
        try {
            const searchApiUrl = 'https://www.googleapis.com/youtube/v3/search';
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const publishedAfter = oneDayAgo.toISOString();
            // 뉴스/이슈 카테고리 중심으로 검색 (카테고리 ID: 25 = 뉴스 & 정치)
            const newsCategoryId = '25'; // 뉴스 & 정치 (News & Politics)
            // 카테고리 필터 우선, 검색어는 일반적인 키워드 사용
            const generalQueries = ['', '오늘', '최신', '인기', '화제']; // 빈 검색어로 시작하여 카테고리만으로 검색
            for (const query of generalQueries.slice(0, 5)) { // 최대 5개 검색어 사용
                try {
                    const searchParams = new URLSearchParams({
                        part: 'snippet',
                        type: 'video',
                        maxResults: '20', // 각 검색어당 20개
                        order: 'viewCount', // 조회수순 정렬
                        publishedAfter: publishedAfter,
                        regionCode: regionCode,
                        videoCategoryId: newsCategoryId, // 뉴스 & 정치 카테고리 (카테고리 중심)
                        key: config.apiKey
                    });
                    // 검색어가 있을 때만 q 파라미터 추가
                    if (query) {
                        searchParams.append('q', query);
                    }
                    const searchResponse = await fetch(`${searchApiUrl}?${searchParams}`);
                    if (searchResponse.ok) {
                        const searchData = await searchResponse.json();
                        const videoIds = (searchData.items || []).map((item) => item.id?.videoId).filter(Boolean);
                        if (videoIds.length > 0) {
                            // 동영상 상세 정보 조회 (조회수 포함)
                            const videosApiUrl = 'https://www.googleapis.com/youtube/v3/videos';
                            const videosParams = new URLSearchParams({
                                part: 'snippet,statistics',
                                id: videoIds.join(','),
                                key: config.apiKey
                            });
                            const videosResponse = await fetch(`${videosApiUrl}?${videosParams}`);
                            if (videosResponse.ok) {
                                const videosData = await videosResponse.json();
                                const newsVideos = (videosData.items || []).map((item) => {
                                    const viewCount = parseInt(item.statistics?.viewCount || '0', 10);
                                    const publishedAt = item.snippet?.publishedAt || '';
                                    const publishedDate = publishedAt ? new Date(publishedAt) : new Date();
                                    const hoursSincePublished = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
                                    const viewsPerHour = viewCount / hoursSincePublished;
                                    const categoryId = item.snippet?.categoryId || '';
                                    return {
                                        id: item.id,
                                        title: item.snippet?.title || '',
                                        channelTitle: item.snippet?.channelTitle || '',
                                        viewCount: viewCount,
                                        viewCountStr: item.statistics?.viewCount || '0',
                                        publishedAt: publishedAt,
                                        viewsPerHour: viewsPerHour,
                                        categoryId: categoryId,
                                        isNews: categoryId === '25' // 뉴스 & 정치 카테고리만 포함
                                    };
                                });
                                // 중복 제거
                                const existingIds = new Set(videosWithStats.map((v) => v.id));
                                const newVideos = newsVideos.filter((v) => !existingIds.has(v.id));
                                videosWithStats.push(...newVideos);
                            }
                        }
                    }
                }
                catch (queryError) {
                    console.warn(`[YOUTUBE-API] "${query}" 검색 실패:`, queryError.message);
                }
            }
            console.log(`[YOUTUBE-API] 뉴스 영상 ${videosWithStats.length}개 수집`);
        }
        catch (newsError) {
            console.warn('[YOUTUBE-API] 뉴스 영상 조회 실패:', newsError.message);
        }
        // 2. 뉴스 영상이 부족한 경우 트렌딩 영상 추가 (뉴스 카테고리만)
        if (videosWithStats.length < maxResults) {
            try {
                const trendingApiUrl = 'https://www.googleapis.com/youtube/v3/videos';
                const trendingParams = new URLSearchParams({
                    part: 'snippet,statistics',
                    chart: 'mostPopular',
                    regionCode: regionCode,
                    videoCategoryId: '25', // 뉴스 카테고리만
                    maxResults: String(Math.min(maxResults - videosWithStats.length, 50)),
                    key: config.apiKey
                });
                const trendingResponse = await fetch(`${trendingApiUrl}?${trendingParams}`);
                if (trendingResponse.ok) {
                    const trendingData = await trendingResponse.json();
                    if (trendingData.items && trendingData.items.length > 0) {
                        const trendingVideos = trendingData.items.map((item) => {
                            const viewCount = parseInt(item.statistics?.viewCount || '0', 10);
                            const publishedAt = item.snippet?.publishedAt || '';
                            const publishedDate = publishedAt ? new Date(publishedAt) : new Date();
                            const hoursSincePublished = Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
                            const viewsPerHour = viewCount / hoursSincePublished;
                            return {
                                id: item.id,
                                title: item.snippet?.title || '',
                                channelTitle: item.snippet?.channelTitle || '',
                                viewCount: viewCount,
                                viewCountStr: item.statistics?.viewCount || '0',
                                publishedAt: publishedAt,
                                viewsPerHour: viewsPerHour,
                                categoryId: item.snippet?.categoryId || '',
                                isNews: true
                            };
                        });
                        // 중복 제거
                        const existingIds = new Set(videosWithStats.map((v) => v.id));
                        const newVideos = trendingVideos.filter((v) => !existingIds.has(v.id));
                        videosWithStats.push(...newVideos);
                        console.log(`[YOUTUBE-API] 트렌딩 뉴스 영상 추가, 총 ${videosWithStats.length}개`);
                    }
                }
            }
            catch (trendingError) {
                console.warn('[YOUTUBE-API] 트렌딩 뉴스 영상 조회 실패:', trendingError.message);
            }
        }
        // 뉴스 영상만 필터링하고 조회수순으로 정렬
        let filteredVideos = videosWithStats.filter((v) => v.isNews || v.categoryId === '25');
        // 조회수순으로 정렬 (내림차순)
        filteredVideos.sort((a, b) => {
            return (b.viewCount || 0) - (a.viewCount || 0);
        });
        videosWithStats = filteredVideos;
        // 결과 변환 (최소 20개 이상)
        const finalResults = videosWithStats.slice(0, Math.max(maxResults, 20));
        const keywords = finalResults.map((item, index) => {
            const title = item.title || '';
            // 제목에서 핵심 키워드 추출 (태그 제거, 불필요한 단어 제거)
            // 오늘 기준 핫한 영상 제목을 그대로 사용하되, 불필요한 태그만 제거
            let keyword = title
                .replace(/\[.*?\]/g, '') // [ ] 안 내용 제거
                .replace(/\(.*?\)/g, '') // ( ) 안 내용 제거
                .replace(/【.*?】/g, '') // 【 】 안 내용 제거
                .replace(/\|/g, ' ') // 구분자 제거
                .replace(/\s+/g, ' ') // 공백 정리
                .trim();
            // 제목이 너무 길면 첫 40자만 사용 (키워드 추출을 위해 더 길게 허용)
            if (keyword.length > 40) {
                keyword = keyword.substring(0, 40).trim();
                // 마지막 단어가 잘리면 제거
                const lastSpace = keyword.lastIndexOf(' ');
                if (lastSpace > 0) {
                    keyword = keyword.substring(0, lastSpace);
                }
            }
            // 키워드가 비어있으면 기본값 사용
            if (!keyword || keyword.length < 2) {
                keyword = title.substring(0, 30).trim() || '키워드';
            }
            const viewCount = item.viewCount || 0;
            // 급상승 지표 계산 (시간당 조회수 기반, 트렌딩 영상은 더 높게)
            const viewsPerHour = item.viewsPerHour || 0;
            let changeRate = Math.min(200, Math.floor(viewsPerHour / 1000) * 10 + 30);
            // 트렌딩 영상은 기본적으로 높은 변화율 부여
            if (item.isTrending) {
                changeRate = Math.min(200, changeRate + 50);
            }
            return {
                keyword: keyword,
                rank: index + 1,
                viewCount: viewCount,
                changeRate: changeRate,
                videoId: item.id,
                videoTitle: title,
                channelTitle: item.channelTitle,
                publishedAt: item.publishedAt
            };
        });
        console.log(`[YOUTUBE-API] 오늘 기준 핫한 영상 제목 ${keywords.length}개 추출 완료`);
        return keywords;
    }
    catch (error) {
        console.error('[YOUTUBE-API] API 호출 실패:', error);
        throw error;
    }
}
/**
 * YouTube 트렌드 영상 제목에서 키워드 추출 (빈도수 기반)
 * 제공된 코드를 참고하여 구현
 */
async function extractYouTubeTrendingKeywords(config) {
    try {
        console.log('[YOUTUBE-API] 트렌드 영상 제목에서 키워드 추출 시작');
        // 트렌드 영상 가져오기
        const trendKeywords = await getYouTubeTrendKeywords(config);
        // 영상 제목에서 키워드 추출 (더 정확한 추출)
        const allKeywords = [];
        trendKeywords.forEach((item) => {
            const title = item.videoTitle || '';
            if (!title || title.length < 3)
                return;
            // HTML 태그 제거
            const cleanTitle = title.replace(/<[^>]*>/g, '').trim();
            // 제목을 단어로 분리 (제공된 코드 참고)
            const words = cleanTitle
                .split(/[\s\[\]\(\)｜|/\-:·]+/)
                .map((w) => w.trim())
                .filter((word) => {
                return (word.length >= 2 &&
                    word.length <= 15 &&
                    !/^\d+$/.test(word) && // 숫자만 있는 것 제외
                    !/^[a-z]+$/i.test(word) || word.length >= 3 // 영문 단일 단어는 3자 이상
                );
            })
                .filter((word) => {
                // 불필요한 단어 제외 (일부만 제외하여 더 많은 키워드 추출)
                const stopWords = ['영상', '동영상', '비디오', '보기', '시청', '구독', '좋아요', '클릭', '알림설정'];
                return !stopWords.includes(word);
            });
            // 2-3단어 조합도 추가 (뉴스/이슈 관련 키워드 우선)
            if (words.length >= 2) {
                // 핵심 키워드가 포함된 조합 우선 추가
                const hasNewsKeyword = words.some(w => ['뉴스', '이슈', '속보', '화제', '사건', '논란', '발표', '공개'].includes(w));
                if (hasNewsKeyword || words.length >= 2) {
                    const phrase2 = words.slice(0, 2).join(' ');
                    if (phrase2.length >= 4 && phrase2.length <= 20) {
                        allKeywords.push(phrase2);
                    }
                    if (words.length >= 3) {
                        const phrase3 = words.slice(0, 3).join(' ');
                        if (phrase3.length >= 4 && phrase3.length <= 25) {
                            allKeywords.push(phrase3);
                        }
                    }
                }
            }
            // 개별 단어 추가 (더 많이 포함)
            words.slice(0, 8).forEach((word) => {
                if (word.length >= 2 && word.length <= 15) {
                    allKeywords.push(word);
                }
            });
        });
        // 빈도수 계산
        const frequency = {};
        allKeywords.forEach((keyword) => {
            const lower = keyword.toLowerCase().trim();
            if (lower.length > 0) {
                frequency[lower] = (frequency[lower] || 0) + 1;
            }
        });
        // 빈도순 정렬
        const sortedKeywords = Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([keyword]) => keyword);
        console.log(`[YOUTUBE-API] ${sortedKeywords.length}개 키워드 추출 완료`);
        return sortedKeywords;
    }
    catch (error) {
        console.error('[YOUTUBE-API] 키워드 추출 실패:', error);
        return [];
    }
}
