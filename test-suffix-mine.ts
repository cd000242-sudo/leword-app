/**
 * 🔬 접미사 확장 + 깊이 파기 (더 많은 틈새 키워드 발굴)
 */

import axios from 'axios';

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

// 틈새 키워드 발굴용 접미사 (돈 되는 패턴)
const SUFFIXES = [
    // 구매 의도
    '추천', '가성비', '순위', '비교', '가격', '최저가',
    // 리뷰/후기
    '후기', '단점', '장단점', '내돈내산',
    // 사용법
    '사용법', '세척', 'AS', '수리', '부품',
    // 스펙
    '스펙', '성능', '소음',
    // 모델
    '신제품', '2026', '2025'
];

async function deepMineWithSuffixes(baseSeed: string) {
    console.log(`\n🌊 시드: "${baseSeed}" + 접미사 확장\n`);

    const discovered = new Set<string>();

    // 1. 기본 시드 자동완성
    console.log('--- 기본 자동완성 ---');
    const baseResults = await fetchNaverAutocomplete(baseSeed);
    baseResults.slice(0, 5).forEach(kw => {
        discovered.add(kw);
        console.log(`  ✅ ${kw}`);
    });

    // 2. 접미사 확장 자동완성
    console.log('\n--- 접미사 확장 ---');
    for (const suffix of SUFFIXES.slice(0, 10)) {
        const extendedSeed = `${baseSeed} ${suffix}`;
        const results = await fetchNaverAutocomplete(extendedSeed);

        if (results.length > 0) {
            console.log(`\n  📌 "${extendedSeed}":`);
            results.slice(0, 3).forEach(kw => {
                if (!discovered.has(kw)) {
                    discovered.add(kw);
                    console.log(`     ⭐ ${kw}`);
                }
            });
        }

        await new Promise(r => setTimeout(r, 30));
    }

    console.log(`\n🎯 총 ${discovered.size}개 틈새 키워드 발굴\n`);
    return Array.from(discovered);
}

async function test() {
    console.log('\n========== 접미사 확장 깊이 파기 테스트 ==========');

    const allKeywords: string[] = [];

    // 테스트 시드
    const seeds = ['로봇청소기', '청년지원금'];

    for (const seed of seeds) {
        const keywords = await deepMineWithSuffixes(seed);
        allKeywords.push(...keywords);
    }

    console.log('\n========== 전체 발굴 결과 ==========');
    console.log(`총 ${allKeywords.length}개 틈새 키워드`);

    console.log('\n========== 테스트 완료 ==========\n');
}

test().catch(console.error);
