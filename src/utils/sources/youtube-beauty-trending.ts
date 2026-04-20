/**
 * YouTube 뷰티/패션 트렌딩 — 영상 제목·설명에서 실시간 제품명 추출
 *
 * 합법성: YouTube Data API v3 공식.
 * 차별점: 유튜버가 리뷰하는 "지금 핫한 제품"이 영상 제목에 그대로 노출 → 실시간 유행 반영.
 */

import { searchYouTubeVideos } from '../youtube-data-api';
import { EnvironmentManager } from '../environment-manager';

/**
 * 뷰티 관련 키워드로 최근 7일간 업로드된 인기 영상 제목 수집
 *  - 영상 제목에서 브랜드·제품명 추출 (한글+영문 토큰)
 *  - 여러 영상에 반복 등장 = 실시간 유행 제품
 */
const BEAUTY_QUERIES = [
    '뷰티 추천',
    '화장품 추천',
    '스킨케어 추천',
    '메이크업 추천',
    '선크림 추천',
    '올리브영 추천',
    '다이소 뷰티',
    '피부과 화장품',
];

const FASHION_QUERIES = [
    '패션 추천',
    '코디 추천',
    '겨울 아우터',
    '원피스 추천',
    '무신사 추천',
    '29cm 추천',
    '지그재그 추천',
];

export interface TrendingProduct {
    name: string;
    frequency: number;     // 영상 제목 등장 횟수
    source: 'youtube-beauty' | 'youtube-fashion';
}

/**
 * 영상 제목에서 "브랜드 + 제품명" 형태 시드 추출
 *  - 한글 2~10자 / 영문 3~15자 토큰
 *  - 불용어 제거
 *  - 2-gram 우선 (브랜드+카테고리)
 */
function extractProductNamesFromTitles(titles: string[]): Map<string, number> {
    const STOPWORDS = new Set([
        // 추천/리뷰 메타
        '추천', '후기', '리뷰', '비교', '순위', '총정리', '정리', '완전', '진짜', '최고',
        '요즘', '오늘', '지금', '올해', '내돈내산', '솔직', '꿀팁', '신상', '신제품', 'NEW', 'new',
        'OOTD', 'ootd', 'GRWM', 'grwm', '데일리', '브이로그', 'VLOG', 'vlog',
        '언박싱', '공구', '세일', '할인', '쿠폰', '특가', '한정', '증정',
        '뷰티', '패션', '화장품', '옷', '룩북', '코디', '스타일링', '아우터',
        '영상', '방송', '채널', '구독', '좋아요', '댓글',
        // 🔥 범용 유행어·동영상 특화 용어 (단독 1-gram으로는 무의미)
        '다이소', '올리브영', '올영', '피부과', '백화점', '메이크업', '스킨케어', '헤어', '바디',
        '추천템', '꿀템', '올영추천템', '다이소템', '립추천', '선크림추천', '코덕', '코덕계',
        '생활음계', '가성비', '직접', '이유', '이거', '사는', '쓰는', '신규',
        '여성', '남성', '여자', '남자', '20대', '30대', '40대',
        '데일리룩', '봄코디', '여름코디', '중년패션코디', '여름', '봄', '가을', '겨울',
        '모음', '입는', '세련된', '스타일', '화장',
    ]);

    const freq = new Map<string, number>();

    for (const title of titles) {
        // 이모지/특수문자/괄호내용 제거
        const cleaned = title
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/[^\w가-힣\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = cleaned.split(/\s+/).filter(t => {
            if (STOPWORDS.has(t)) return false;
            if (/^\d+$/.test(t)) return false;
            if (t.length < 2) return false;
            if (/^[가-힣]{2,10}$/.test(t)) return true;
            if (/^[A-Za-z][A-Za-z0-9-]{1,14}$/.test(t)) return true;
            return false;
        });

        // 🔥 1-gram은 완전 제거 (너무 범용적). 2-gram 이상만 시드로 사용.
        // 2-gram: 브랜드 + 제품카테고리 패턴만 의미 있음
        for (let i = 0; i < tokens.length - 1; i++) {
            const bigram = `${tokens[i]} ${tokens[i + 1]}`;
            // 둘 다 STOPWORDS에 없는 구체 토큰이어야
            if (STOPWORDS.has(tokens[i]) || STOPWORDS.has(tokens[i + 1])) continue;
            if (bigram.length >= 5 && bigram.length <= 30) {
                freq.set(bigram, (freq.get(bigram) || 0) + 1);
            }
        }

        // 3-gram: 긴 제품명 후보 (브랜드 + 제품라인 + 카테고리)
        for (let i = 0; i < tokens.length - 2; i++) {
            const trigram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
            if (trigram.length >= 7 && trigram.length <= 40) {
                freq.set(trigram, (freq.get(trigram) || 0) + 1);
            }
        }
    }

    return freq;
}

async function fetchTrendingForQueries(queries: string[], apiKey: string, label: string): Promise<string[]> {
    const allTitles: string[] = [];
    for (const q of queries) {
        try {
            const { from, to } = (() => {
                const d = new Date();
                const from = new Date(d);
                from.setDate(d.getDate() - 7);
                return { from: from.toISOString(), to: d.toISOString() };
            })();
            const res = await searchYouTubeVideos({
                apiKey,
                keyword: q,
                publishedAfter: from,
                publishedBefore: to,
                maxResults: 25,
                regionCode: 'KR',
                order: 'viewCount',
                useCache: true,
            });
            if (res.videos && res.videos.length > 0) {
                for (const v of res.videos) {
                    if (v.title) allTitles.push(v.title);
                }
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
            console.warn(`[${label}] 쿼리 "${q}" 실패:`, err?.message);
        }
    }
    return allTitles;
}

export async function fetchYoutubeBeautyTrending(): Promise<TrendingProduct[]> {
    const envMgr = EnvironmentManager.getInstance();
    const apiKey = envMgr.getConfig().youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';
    if (!apiKey) {
        console.warn('[youtube-beauty] YouTube API 키 없음');
        return [];
    }

    const titles = await fetchTrendingForQueries(BEAUTY_QUERIES, apiKey, 'youtube-beauty');
    if (titles.length === 0) return [];

    const freq = extractProductNamesFromTitles(titles);
    // 빈도 2회+ (여러 영상 공통 언급), 상위 60개
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([name, frequency]) => ({ name, frequency, source: 'youtube-beauty' as const }));
}

export async function fetchYoutubeFashionTrending(): Promise<TrendingProduct[]> {
    const envMgr = EnvironmentManager.getInstance();
    const apiKey = envMgr.getConfig().youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';
    if (!apiKey) {
        console.warn('[youtube-fashion] YouTube API 키 없음');
        return [];
    }

    const titles = await fetchTrendingForQueries(FASHION_QUERIES, apiKey, 'youtube-fashion');
    if (titles.length === 0) return [];

    const freq = extractProductNamesFromTitles(titles);
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([name, frequency]) => ({ name, frequency, source: 'youtube-fashion' as const }));
}
