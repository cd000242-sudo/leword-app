/**
 * 🏆 Ultimate Niche Finder - 끝판왕 버전
 * 
 * 완벽한 틈새 키워드 발굴 시스템:
 * - 5단계 깊이 자동완성 마이닝
 * - 네이버 검색광고 API (PC/모바일 검색량)
 * - 네이버 블로그 API (문서수)
 * - 추천 제목 자동 생성
 * - 배경 설명 + 수익 분석
 * - 문제해결 키워드 특화
 */

import axios from 'axios';
import { getNaverKeywordSearchVolumeSeparate, NaverDatalabConfig } from './naver-datalab-api';
import { EnvironmentManager } from './environment-manager';

// ============ 타입 정의 ============

export interface UltimateNicheKeyword {
    keyword: string;

    // 검색량 (검색광고 API)
    searchVolume: number;
    pcSearchVolume: number;
    mobileSearchVolume: number;

    // 문서수 (블로그 API)
    documentCount: number;

    // 분석
    goldenRatio: number;           // 검색량/문서수
    nicheType: 'empty_house' | 'gold_mine' | 'blue_ocean' | 'deep_niche';
    nicheScore: number;            // 0-100

    // 수익 예측
    estimatedMonthlyTraffic: number;
    estimatedCPC: number;
    estimatedMonthlyRevenue: number;

    // 난이도
    rankingDifficulty: 'very_easy' | 'easy' | 'medium' | 'hard';
    rankingDifficultyScore: number;  // 1-10

    // 초보자 가이드
    suggestedTitle: string;
    backgroundExplanation: string;   // 왜 이 키워드인지 배경 설명
    contentOutline: string[];        // 작성 시 포함할 내용
    actionMessage: string;

    // 메타
    discoveryDepth: number;          // 발견된 깊이
    discoveryPattern: string;        // 발견 패턴 (불이익, 꿀팁 등)
    category: string;
}

export interface UltimateNicheResult {
    success: boolean;
    keywords: UltimateNicheKeyword[];
    stats: {
        totalMined: number;
        volumeChecked: number;
        nicheFiltered: number;
        deepNicheCount: number;
        timeMs: number;
    };
    error?: string;
}

// ============ 유틸리티 함수 ============

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

// 카테고리 감지
function detectCategory(keyword: string): string {
    const kw = keyword.toLowerCase();
    if (/지원금|보조금|청년|복지|정책|신청|정부|혜택|무료|출산|수당|환급|실업급여|도약계좌|희망적금/.test(kw)) return 'policy';
    if (/추천|가성비|순위|비교|후기|장단점|청소기|냉장고|세탁기|에어프라이어|다이슨|삼성|lg|로보락/.test(kw)) return 'life_tips';
    if (/아이폰|갤럭시|노트북|태블릿|맥북|아이패드/.test(kw)) return 'it';
    if (/주식|청약|대출|금리|적금|보험|isa/.test(kw)) return 'finance';
    return 'general';
}

// CPC 추정
function estimateCPC(keyword: string, category: string): number {
    const baseCPC: Record<string, number> = {
        policy: 150,
        finance: 500,
        life_tips: 200,
        it: 250,
        general: 120
    };
    let cpc = baseCPC[category] || 120;

    if (/추천|가격|비교|구매|최저가/.test(keyword)) cpc *= 1.3;
    if (/후기|리뷰|실사용/.test(keyword)) cpc *= 1.2;
    if (/불이익|주의|실패|거부/.test(keyword)) cpc *= 0.8; // 문제해결은 CPC 낮음

    return Math.round(cpc);
}

// 뻔한 패턴 필터
function isObviousPattern(keyword: string): boolean {
    if (/^.+\s+20\d{2}$/.test(keyword)) return true;  // 연도만 추가
    if (keyword.split(' ').length <= 1) return true;  // 단일 단어
    return false;
}

// 진짜 숨은 틈새 패턴
function isDeepNichePattern(keyword: string): boolean {
    const patterns = [
        /불이익|해결|오류|실패|안되|거부|반려|취소|해지/,
        /꿀팁|숨은|몰랐|놓치|실수|주의|함정|필수/,
        /중도.*해지|조기.*상환|갈아타기|환승|만기후/,
        /vs|차이점|뭐가.*좋|어떤게/
    ];
    return patterns.some(p => p.test(keyword));
}

// 추천 제목 생성
function generateSuggestedTitle(keyword: string, category: string, pattern: string): string {
    const year = new Date().getFullYear();

    // 문제해결 패턴별 제목
    if (/불이익|주의|실수/.test(pattern)) {
        return `${keyword} 이것 모르면 손해! (${year} 필수 체크)`;
    }
    if (/꿀팁|숨은/.test(pattern)) {
        return `${keyword} 아무도 안 알려주는 꿀팁 5가지`;
    }
    if (/해결|오류|안되/.test(pattern)) {
        return `${keyword} 완벽 해결법 (실제 사례 포함)`;
    }
    if (/거부|반려|취소/.test(pattern)) {
        return `${keyword} 당하면 이렇게 대처하세요!`;
    }

    // 카테고리별 기본 제목
    const templates: Record<string, string> = {
        policy: `${keyword} 신청 전 반드시 알아야 할 것들 (${year})`,
        finance: `${keyword} 가입 전 필독! 핵심 정리`,
        life_tips: `${keyword} 솔직 후기 + 장단점 비교 (${year})`,
        it: `${keyword} 실사용 리뷰 + 구매 가이드`,
        general: `${keyword} 완벽 정리 (${year} 최신)`
    };

    return templates[category] || templates.general;
}

// 배경 설명 생성
function generateBackgroundExplanation(
    keyword: string,
    searchVolume: number,
    documentCount: number,
    pattern: string
): string {
    const ratio = searchVolume / Math.max(documentCount, 1);

    let explanation = '';

    // 검색량 분석
    if (searchVolume >= 10000) {
        explanation += `월 ${searchVolume.toLocaleString()}회 이상 검색되는 고수요 키워드입니다. `;
    } else if (searchVolume >= 1000) {
        explanation += `월 ${searchVolume.toLocaleString()}회 검색되며 꾸준한 수요가 있습니다. `;
    } else if (searchVolume >= 100) {
        explanation += `월 ${searchVolume.toLocaleString()}회 검색되는 롱테일 키워드입니다. `;
    } else {
        explanation += `검색량은 적지만 경쟁이 매우 낮아 상위노출이 쉽습니다. `;
    }

    // 경쟁 분석
    if (documentCount < 1000) {
        explanation += `문서수가 ${documentCount.toLocaleString()}개로 경쟁이 거의 없습니다. `;
    } else if (documentCount < 5000) {
        explanation += `문서수가 ${documentCount.toLocaleString()}개로 경쟁이 낮습니다. `;
    } else if (documentCount < 20000) {
        explanation += `문서수가 ${documentCount.toLocaleString()}개이지만 양질의 콘텐츠로 상위노출 가능합니다. `;
    }

    // 비율 분석
    if (ratio >= 5) {
        explanation += `검색량 대비 문서수 비율이 ${ratio.toFixed(1)}로 황금 틈새입니다!`;
    } else if (ratio >= 2) {
        explanation += `검색량 대비 문서수 비율이 ${ratio.toFixed(1)}로 진입 가치가 높습니다.`;
    } else if (documentCount < 3000) {
        explanation += `경쟁이 낮아 초보자도 충분히 상위노출 가능합니다.`;
    }

    // 패턴 분석
    if (/불이익|주의|실수/.test(pattern)) {
        explanation += ` 문제해결 니즈가 높은 키워드로 체류시간이 길어 SEO에 유리합니다.`;
    }

    return explanation;
}

// 콘텐츠 아웃라인 생성
function generateContentOutline(keyword: string, category: string, pattern: string): string[] {
    // 문제해결 패턴
    if (/불이익|주의|실수/.test(pattern)) {
        return [
            `${keyword}의 주요 불이익/주의사항`,
            '실제 사례로 보는 문제 상황',
            '미리 알았으면 좋았을 점',
            '피해를 최소화하는 방법',
            '체크리스트 정리'
        ];
    }
    if (/해결|오류|안되/.test(pattern)) {
        return [
            `${keyword} 증상 확인`,
            '원인별 해결 방법',
            '단계별 가이드 (스크린샷 포함)',
            '해결 안 될 때 대안',
            '예방법 및 FAQ'
        ];
    }
    if (/꿀팁|숨은/.test(pattern)) {
        return [
            '아무도 안 알려주는 핵심 팁',
            '공식 가이드에 없는 내용',
            '실제 사용자 꿀팁 모음',
            '시행착오 줄이는 방법',
            '추가 혜택 챙기는 법'
        ];
    }

    // 카테고리별 기본 아웃라인
    if (category === 'policy') {
        return [
            '신청 자격 및 조건',
            '필요 서류 체크리스트',
            '신청 방법 (온라인/오프라인)',
            '주의사항 및 FAQ',
            '관련 지원금 정보'
        ];
    }

    return [
        '핵심 정보 요약',
        '상세 내용 설명',
        '장단점 비교',
        '실제 사용 후기',
        'FAQ 및 마무리'
    ];
}

// 난이도 계산
function calculateRankingDifficulty(documentCount: number, ratio: number): {
    difficulty: 'very_easy' | 'easy' | 'medium' | 'hard';
    score: number;
} {
    let score: number;

    if (documentCount < 1000 && ratio >= 1.0) {
        score = 1;
    } else if (documentCount < 3000 && ratio >= 0.5) {
        score = 2;
    } else if (documentCount < 5000) {
        score = 3;
    } else if (documentCount < 10000) {
        score = 5;
    } else if (documentCount < 30000) {
        score = 7;
    } else {
        score = 9;
    }

    const difficulty = score <= 2 ? 'very_easy' : score <= 4 ? 'easy' : score <= 6 ? 'medium' : 'hard';

    return { difficulty, score };
}

// 월 수익 계산
function calculateMonthlyRevenue(searchVolume: number, cpc: number, nicheScore: number): number {
    const positionFactor = nicheScore >= 85 ? 0.25 : nicheScore >= 70 ? 0.12 : 0.05;
    const monthlyClicks = searchVolume * positionFactor;
    const adClickRate = 0.025;
    return Math.round(monthlyClicks * adClickRate * cpc);
}

// 틈새 타입 분석
function analyzeNicheType(searchVolume: number, documentCount: number, isDeep: boolean): {
    type: 'empty_house' | 'gold_mine' | 'blue_ocean' | 'deep_niche' | 'none';
    score: number;
} {
    const ratio = searchVolume / Math.max(documentCount, 1);

    // 🔥 Deep Niche (문서수만으로도 가치 있음)
    if (isDeep && documentCount < 1000) {
        return { type: 'deep_niche', score: 95 };
    }
    if (isDeep && documentCount < 3000) {
        return { type: 'deep_niche', score: 85 };
    }
    if (isDeep && documentCount < 5000) {
        return { type: 'deep_niche', score: 75 };
    }

    // 🏠 빈집털이
    if (searchVolume >= 300 && documentCount < 3000 && ratio >= 0.5) {
        return { type: 'empty_house', score: Math.min(100, 85 + Math.round(ratio * 3)) };
    }

    // 💰 꿀통
    if (searchVolume >= 3000 && ratio >= 2.0) {
        return { type: 'gold_mine', score: Math.min(100, 75 + Math.round(ratio * 5)) };
    }

    // 🌊 블루오션
    if (ratio >= 1.0 && searchVolume >= 200) {
        return { type: 'blue_ocean', score: Math.min(100, 55 + Math.round(ratio * 10)) };
    }

    if (documentCount < 50000 && searchVolume >= 100) {
        return { type: 'blue_ocean', score: 40 + Math.round((50000 - documentCount) / 2000) };
    }

    return { type: 'none', score: 0 };
}

// 액션 메시지 생성
function generateActionMessage(nicheType: string, difficulty: string, revenue: number, isDeep: boolean): string {
    if (isDeep && nicheType === 'deep_niche') {
        return `🔥 숨은 틈새 발견! 경쟁 거의 없음. 바로 작성하세요!`;
    }
    if (nicheType === 'empty_house' && difficulty === 'very_easy') {
        return `🏠 빈집털이! 월 ${Math.round(revenue / 1000)}천원 예상. 지금 바로 작성!`;
    }
    if (nicheType === 'gold_mine') {
        return `💰 황금 키워드! 빠르게 선점하세요`;
    }
    if (difficulty === 'easy') {
        return `✨ 진입 추천! 2주 내 상위노출 가능`;
    }
    if (difficulty === 'medium') {
        return `📝 작성 권장. 양질의 콘텐츠로 승부하세요`;
    }
    return `🔍 롱테일 확장 후 공략 추천`;
}

// ============ 메인 함수 ============

// 문제해결 접미사
export const DEEP_MINING_SUFFIXES = [
    // 문제해결 (고가치!)
    '불이익', '안되', '오류', '실패', '거부', '반려', '취소', '해결', '해지',
    '먹통', '벽돌', 'AS', '수리비', '교체', '호환', '부품',
    // 숨은 정보/커뮤니티
    '꿀팁', '주의', '실수', '함정', '몰랐', '필수', '꼭',
    '현실', '팩트', '후기', '내돈내산', '단점', '장점',
    // 구체적 시나리오/금융
    '중도해지', '조기상환', '갈아타기', '만기후', '연장',
    '서류', '심사', '부결', '이의신청', '구제', '지급일',
    // 비교/스펙
    'vs', '차이', '뭐가좋', '스펙', '성능', '배터리', '발열', '무게'
];

/**
 * 🔥 재사용 가능한 딥 마이닝 로직
 * (Traffic Hunter Pro 등 다른 모듈에서도 사용 가능)
 */
export async function mineUltimateDeepKeywords(
    seeds: string[],
    maxDepth: number = 5,
    maxLimit: number = 300
): Promise<Map<string, { depth: number; pattern: string }>> {
    console.log(`[ULTIMATE-MINING] 🎯 ${seeds.length}개 시드에서 딥 마이닝 시작 (Depth: ${maxDepth})`);
    const discoveredKeywords = new Map<string, { depth: number; pattern: string }>();

    for (const seed of seeds) {
        if (discoveredKeywords.size >= maxLimit) break;

        const queue: { keyword: string; depth: number; pattern: string }[] = [
            { keyword: seed, depth: 0, pattern: 'seed' }
        ];

        // 문제해결 접미사로 시작점 추가
        for (const suffix of DEEP_MINING_SUFFIXES.slice(0, 12)) {
            queue.push({ keyword: `${seed} ${suffix}`, depth: 1, pattern: suffix });
        }

        while (queue.length > 0) {
            if (discoveredKeywords.size >= maxLimit) break;
            const { keyword, depth, pattern } = queue.shift()!;

            if (depth > maxDepth) continue;
            if (discoveredKeywords.has(keyword)) continue;

            const results = await fetchNaverAutocomplete(keyword);

            for (const result of results.slice(0, 4)) {
                if (discoveredKeywords.size >= maxLimit) break;
                if (!discoveredKeywords.has(result) && result !== seed) {
                    // 뻔한 패턴 제외
                    if (!isObviousPattern(result)) {
                        discoveredKeywords.set(result, { depth: depth + 1, pattern });

                        if (depth + 1 < maxDepth) {
                            queue.push({ keyword: result, depth: depth + 1, pattern });

                            // 🔥 Recursive Suffix Injection (중간 단계에서도 접미사 강제 주입)
                            if (result.split(' ').length <= 3) {
                                const randomSuffixes = DEEP_MINING_SUFFIXES.sort(() => 0.5 - Math.random()).slice(0, 2);
                                for (const suffix of randomSuffixes) {
                                    const injectedKw = `${result} ${suffix}`;
                                    if (!discoveredKeywords.has(injectedKw)) {
                                        queue.push({ keyword: injectedKw, depth: depth + 1, pattern: suffix });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            await new Promise(r => setTimeout(r, 20)); // 속도 조절
        }
    }

    console.log(`[ULTIMATE-MINING] ✅ 총 ${discoveredKeywords.size}개 딥 마이닝 발견`);
    return discoveredKeywords;
}

/**
 * 🏆 Ultimate Niche Finder - 끝판왕
 */
export async function findUltimateNicheKeywords(options: {
    seeds?: string[];
    maxDepth?: number;
    targetCount?: number;
} = {}): Promise<UltimateNicheResult> {
    const startTime = Date.now();

    const {
        seeds = [
            // 정책/금융 (문제해결 니즈 높음)
            '청년도약계좌', '청년희망적금', '실업급여', '청년지원금',
            'ISA 계좌', '주택청약', '연말정산',
            // 가전 (비교/문제해결 니즈)
            '로봇청소기', '에어프라이어', '무선청소기',
            // IT
            '아이폰', '갤럭시', '아이패드'
        ],
        maxDepth = 7,  // 더 깊게!
        targetCount = 30
    } = options;

    try {
        // 환경 설정 로드
        const envManager = EnvironmentManager.getInstance();
        const envConfig = envManager.getConfig();

        const datalabConfig: NaverDatalabConfig = {
            clientId: envConfig.naverClientId || '',
            clientSecret: envConfig.naverClientSecret || ''
        };

        const hasApiKeys = datalabConfig.clientId && datalabConfig.clientSecret;
        if (!hasApiKeys) {
            console.warn('[ULTIMATE] ⚠️ 네이버 API 키 미설정');
        }

        // 1. Deep Mining: 자동완성 깊이 파기
        console.log('[ULTIMATE] 1단계: Deep Mining 시작...');
        const discoveredKeywords = await mineUltimateDeepKeywords(seeds, maxDepth, 500);

        console.log(`[ULTIMATE] 발견: ${discoveredKeywords.size}개 키워드`);

        // 2. 검색량 + 문서수 조회
        console.log('[ULTIMATE] 2단계: 메트릭 조회...');
        const allKeywords = Array.from(discoveredKeywords.keys()).slice(0, 100);

        let metricsResults: any[] = [];

        if (hasApiKeys) {
            metricsResults = await getNaverKeywordSearchVolumeSeparate(
                datalabConfig,
                allKeywords,
                { includeDocumentCount: true }
            );
        }

        // 3. 틈새 분석
        console.log('[ULTIMATE] 3단계: 틈새 분석...');
        const nicheKeywords: UltimateNicheKeyword[] = [];

        for (let i = 0; i < allKeywords.length; i++) {
            const keyword = allKeywords[i];
            const meta = discoveredKeywords.get(keyword)!;
            const metric = metricsResults[i];

            const pc = metric?.pcSearchVolume || 0;
            const mobile = metric?.mobileSearchVolume || 0;
            const totalVolume = pc + mobile;
            const docCount = metric?.documentCount || 5000; // 기본값

            // Deep Niche 패턴 확인
            const isDeep = isDeepNichePattern(keyword);

            // 틈새 분석
            const niche = analyzeNicheType(totalVolume, docCount, isDeep);

            if (niche.type === 'none') continue;

            const category = detectCategory(keyword);
            const cpc = estimateCPC(keyword, category);
            const ratio = totalVolume / Math.max(docCount, 1);
            const ranking = calculateRankingDifficulty(docCount, ratio);
            const monthlyRevenue = calculateMonthlyRevenue(totalVolume, cpc, niche.score);

            nicheKeywords.push({
                keyword,
                searchVolume: totalVolume,
                pcSearchVolume: pc,
                mobileSearchVolume: mobile,
                documentCount: docCount,
                goldenRatio: Math.round(ratio * 100) / 100,
                nicheType: niche.type,
                nicheScore: niche.score,
                estimatedMonthlyTraffic: Math.round(totalVolume * 0.15),
                estimatedCPC: cpc,
                estimatedMonthlyRevenue: monthlyRevenue,
                rankingDifficulty: ranking.difficulty,
                rankingDifficultyScore: ranking.score,
                suggestedTitle: generateSuggestedTitle(keyword, category, meta.pattern),
                backgroundExplanation: generateBackgroundExplanation(keyword, totalVolume, docCount, meta.pattern),
                contentOutline: generateContentOutline(keyword, category, meta.pattern),
                actionMessage: generateActionMessage(niche.type, ranking.difficulty, monthlyRevenue, isDeep),
                discoveryDepth: meta.depth,
                discoveryPattern: meta.pattern,
                category
            });
        }

        // 점수순 정렬
        nicheKeywords.sort((a, b) => b.nicheScore - a.nicheScore);

        const endTime = Date.now();
        const finalKeywords = nicheKeywords.slice(0, targetCount);

        console.log(`[ULTIMATE] ✅ 완료: ${finalKeywords.length}개 틈새 키워드 (${endTime - startTime}ms)`);

        return {
            success: true,
            keywords: finalKeywords,
            stats: {
                totalMined: discoveredKeywords.size,
                volumeChecked: metricsResults.length,
                nicheFiltered: nicheKeywords.length,
                deepNicheCount: nicheKeywords.filter(k => k.nicheType === 'deep_niche').length,
                timeMs: endTime - startTime
            }
        };

    } catch (error: any) {
        console.error('[ULTIMATE] 에러:', error.message);
        return {
            success: false,
            keywords: [],
            stats: { totalMined: 0, volumeChecked: 0, nicheFiltered: 0, deepNicheCount: 0, timeMs: Date.now() - startTime },
            error: error.message
        };
    }
}

// CLI 테스트
if (require.main === module) {
    (async () => {
        console.log('\n========== 🏆 Ultimate Niche Finder 테스트 ==========\n');

        const result = await findUltimateNicheKeywords({
            seeds: ['청년도약계좌', '실업급여', '로봇청소기'],
            maxDepth: 5,
            targetCount: 15
        });

        if (result.success) {
            console.log(`\n🎯 ${result.keywords.length}개 틈새 키워드 발굴!\n`);
            console.log(`   총 마이닝: ${result.stats.totalMined}개`);
            console.log(`   검색량 조회: ${result.stats.volumeChecked}개`);
            console.log(`   틈새 필터: ${result.stats.nicheFiltered}개`);
            console.log(`   🔥 Deep Niche: ${result.stats.deepNicheCount}개`);
            console.log(`   소요시간: ${result.stats.timeMs}ms`);
            console.log('');

            result.keywords.forEach((kw, i) => {
                const emoji = kw.nicheType === 'deep_niche' ? '🔥' :
                    kw.nicheType === 'empty_house' ? '🏠' :
                        kw.nicheType === 'gold_mine' ? '💰' : '🌊';
                const diffEmoji = kw.rankingDifficulty === 'very_easy' ? '🟢' :
                    kw.rankingDifficulty === 'easy' ? '🟡' :
                        kw.rankingDifficulty === 'medium' ? '🟠' : '🔴';

                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(`${i + 1}. ${emoji} "${kw.keyword}"`);
                console.log(`   ${kw.actionMessage}`);
                console.log('');
                console.log(`   📊 검색량: PC ${kw.pcSearchVolume.toLocaleString()} + Mobile ${kw.mobileSearchVolume.toLocaleString()} = ${kw.searchVolume.toLocaleString()}`);
                console.log(`   📄 문서수: ${kw.documentCount.toLocaleString()}개`);
                console.log(`   ${diffEmoji} 난이도: ${kw.rankingDifficulty} (${kw.rankingDifficultyScore}/10)`);
                console.log(`   💵 월 예상 수익: ${kw.estimatedMonthlyRevenue.toLocaleString()}원`);
                console.log('');
                console.log(`   📝 추천 제목:`);
                console.log(`   "${kw.suggestedTitle}"`);
                console.log('');
                console.log(`   📖 배경 설명:`);
                console.log(`   ${kw.backgroundExplanation}`);
                console.log('');
                console.log(`   ✍️ 작성 시 포함 내용:`);
                kw.contentOutline.forEach((item, j) => {
                    console.log(`      ${j + 1}. ${item}`);
                });
                console.log('');
            });
        } else {
            console.log(`❌ 실패: ${result.error}`);
        }

        console.log('========== 테스트 완료 ==========\n');
    })();
}
