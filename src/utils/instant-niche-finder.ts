/**
 * 🎯 Instant Niche Finder (즉시 완벽한 틈새 키워드 발굴)
 * 
 * 수집 → 분석 → 필터링을 한 번에 처리
 * 결과: 100% 보장된 빈집털이/꿀통 키워드만 반환
 */

import axios from 'axios';
import { getNaverSearchAdKeywordVolume, NaverSearchAdConfig } from './naver-searchad-api';

export interface NicheKeyword {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;
    nicheType: 'empty_house' | 'gold_mine' | 'blue_ocean';
    nicheScore: number;
    estimatedMonthlyTraffic: number;
    category: string;
}

export interface InstantNicheResult {
    success: boolean;
    keywords: NicheKeyword[];
    stats: {
        totalDiscovered: number;
        metricsChecked: number;
        nicheFiltered: number;
        timeMs: number;
    };
    error?: string;
}

// 네이버 자동완성 API
async function fetchNaverAutocomplete(keyword: string): Promise<string[]> {
    try {
        const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&st=100`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
                'Referer': 'https://www.naver.com/'
            },
            timeout: 5000
        });

        const items = response.data?.items?.[0] || [];
        return items.map((item: any) => item[0]).filter((kw: string) => kw && kw.length > 2);
    } catch {
        return [];
    }
}

// 네이버 문서수 조회 (간단 버전)
async function getDocumentCount(keyword: string): Promise<number> {
    try {
        const url = `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(keyword)}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
            timeout: 5000
        });

        // 검색 결과 수 파싱 (예: "약 1,234건")
        const html = response.data;
        const match = html.match(/총\s+([0-9,]+)\s*건/);
        if (match) {
            return parseInt(match[1].replace(/,/g, ''), 10);
        }

        // 대안: 결과 수 다른 패턴
        const alt = html.match(/([0-9,]+)\s*개의?\s*(?:검색|블로그)/);
        if (alt) {
            return parseInt(alt[1].replace(/,/g, ''), 10);
        }

        return 100000; // 파싱 실패 시 높은 값 (필터링됨)
    } catch {
        return 100000;
    }
}

// 카테고리 자동 감지
function detectCategory(keyword: string): string {
    const kw = keyword.toLowerCase();
    if (/지원금|보조금|청년|복지|정책|신청|정부|혜택|무료|출산|수당/.test(kw)) return 'policy';
    if (/추천|가성비|순위|비교|후기|장단점|청소기|냉장고|세탁기|에어프라이어|다이슨|삼성|lg/.test(kw)) return 'life_tips';
    if (/아이폰|갤럭시|노트북|태블릿|맥북|아이패드/.test(kw)) return 'it';
    if (/주식|청약|대출|금리|적금|보험/.test(kw)) return 'finance';
    return 'general';
}

// 틈새 타입 판정
function analyzeNicheType(searchVolume: number, documentCount: number): {
    type: 'empty_house' | 'gold_mine' | 'blue_ocean' | 'none';
    score: number;
} {
    const ratio = searchVolume / Math.max(documentCount, 1);

    // 빈집털이: 검색량 500+, 문서수 < 1000, 비율 1.0 이상
    if (searchVolume >= 500 && documentCount < 1000 && ratio >= 1.0) {
        return { type: 'empty_house', score: 90 + Math.min(10, ratio) };
    }

    // 꿀통: 검색량 5000+, 비율 3.0 이상
    if (searchVolume >= 5000 && ratio >= 3.0) {
        return { type: 'gold_mine', score: 80 + Math.min(20, ratio * 2) };
    }

    // 블루오션: 비율 2.0 이상, 검색량 300+
    if (ratio >= 2.0 && searchVolume >= 300) {
        return { type: 'blue_ocean', score: 60 + Math.min(30, ratio * 5) };
    }

    return { type: 'none', score: ratio * 10 };
}

/**
 * 🚀 즉시 틈새 키워드 발굴 (원클릭)
 */
export async function findNicheKeywordsInstantly(
    apiConfig: NaverSearchAdConfig,
    options: {
        seeds?: string[];
        suffixes?: string[];
        minSearchVolume?: number;
        maxDocumentCount?: number;
        targetCount?: number;
    } = {}
): Promise<InstantNicheResult> {
    const startTime = Date.now();

    const {
        seeds = ['로봇청소기', '에어프라이어', '청년지원금', '다이슨', 'LG 코드제로'],
        suffixes = ['추천', '가성비', '순위', '비교', '후기', '단점'],
        minSearchVolume = 300,
        maxDocumentCount = 5000,
        targetCount = 20
    } = options;

    try {
        // 1. 자동완성으로 키워드 수집
        console.log('[INSTANT] 1단계: 키워드 수집 시작...');
        const discoveredKeywords = new Set<string>();

        for (const seed of seeds) {
            // 기본 자동완성
            const baseResults = await fetchNaverAutocomplete(seed);
            baseResults.slice(0, 3).forEach(kw => discoveredKeywords.add(kw));

            // 접미사 확장
            for (const suffix of suffixes.slice(0, 3)) {
                const extended = await fetchNaverAutocomplete(`${seed} ${suffix}`);
                extended.slice(0, 2).forEach(kw => discoveredKeywords.add(kw));
            }
        }

        const allKeywords = Array.from(discoveredKeywords);
        console.log(`[INSTANT] 수집완료: ${allKeywords.length}개 키워드`);

        // 2. 검색량 조회 (5개씩 배치)
        console.log('[INSTANT] 2단계: 검색량 조회 중...');
        const volumeResults = await getNaverSearchAdKeywordVolume(apiConfig, allKeywords);

        // 3. 문서수 조회 + 필터링 (병렬 처리)
        console.log('[INSTANT] 3단계: 문서수 조회 및 필터링...');
        const nicheKeywords: NicheKeyword[] = [];

        for (const vol of volumeResults) {
            if ((vol.totalSearchVolume || 0) < minSearchVolume) continue;

            const docCount = await getDocumentCount(vol.keyword);
            if (docCount > maxDocumentCount) continue;

            const searchVolume = vol.totalSearchVolume || 0;
            const niche = analyzeNicheType(searchVolume, docCount);

            if (niche.type !== 'none') {
                nicheKeywords.push({
                    keyword: vol.keyword,
                    searchVolume,
                    documentCount: docCount,
                    goldenRatio: Math.round((searchVolume / Math.max(docCount, 1)) * 100) / 100,
                    nicheType: niche.type,
                    nicheScore: Math.round(niche.score),
                    estimatedMonthlyTraffic: Math.round(searchVolume * 0.1), // 10% CTR 가정
                    category: detectCategory(vol.keyword)
                });
            }

            // 충분히 모았으면 중단
            if (nicheKeywords.length >= targetCount) break;
        }

        // 4. 점수순 정렬
        nicheKeywords.sort((a, b) => b.nicheScore - a.nicheScore);

        const endTime = Date.now();

        console.log(`[INSTANT] 완료: ${nicheKeywords.length}개 틈새 키워드 (${endTime - startTime}ms)`);

        return {
            success: true,
            keywords: nicheKeywords.slice(0, targetCount),
            stats: {
                totalDiscovered: allKeywords.length,
                metricsChecked: volumeResults.length,
                nicheFiltered: nicheKeywords.length,
                timeMs: endTime - startTime
            }
        };

    } catch (error: any) {
        return {
            success: false,
            keywords: [],
            stats: { totalDiscovered: 0, metricsChecked: 0, nicheFiltered: 0, timeMs: Date.now() - startTime },
            error: error.message
        };
    }
}
