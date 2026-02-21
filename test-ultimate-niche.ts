/**
 * 🎯 Ultimate Niche Mining - 문제해결 접미사로 진짜 숨은 키워드 발굴
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

// 문제해결/숨겨진 패턴 접미사
const PROBLEM_SUFFIXES = [
    // 문제해결
    '불이익', '안되', '오류', '해결', '실패', '거부', '반려',
    // 숨은 정보
    '꿀팁', '주의', '실수', '함정', '몰랐던',
    // 구체적 시나리오
    '중도해지', '조기상환', '갈아타기', '환승',
    // 비교/선택
    'vs', '차이', '뭐가좋'
];

async function ultimateNicheMine(baseSeed: string) {
    console.log(`\n🔥 시드: "${baseSeed}" + 문제해결 접미사\n`);

    const discovered: string[] = [];

    // 1. 기본 자동완성
    const baseResults = await fetchNaverAutocomplete(baseSeed);
    baseResults.slice(0, 3).forEach(kw => {
        if (kw !== baseSeed) discovered.push(kw);
    });

    // 2. 문제해결 접미사 확장
    for (const suffix of PROBLEM_SUFFIXES.slice(0, 8)) {
        const extended = `${baseSeed} ${suffix}`;
        const results = await fetchNaverAutocomplete(extended);

        if (results.length > 0) {
            console.log(`  📎 "${extended}":`);
            results.slice(0, 3).forEach(kw => {
                if (!discovered.includes(kw) && kw !== baseSeed) {
                    discovered.push(kw);
                    console.log(`     ⭐ ${kw}`);
                }
            });
        }

        await new Promise(r => setTimeout(r, 30));
    }

    console.log(`\n  ✅ 총 ${discovered.length}개 숨은 틈새 발굴\n`);
    return discovered;
}

async function test() {
    console.log('\n========== Ultimate Niche Mining 테스트 ==========\n');

    const seeds = ['청년희망적금', '청년도약계좌', '실업급여', 'ISA 계좌', '로봇청소기'];

    for (const seed of seeds) {
        await ultimateNicheMine(seed);
    }

    console.log('========== 테스트 완료 ==========\n');
}

test().catch(console.error);
