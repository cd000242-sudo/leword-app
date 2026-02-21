/**
 * 🎯 2단계 자동완성으로 제품명까지 수집하는 테스트
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

async function testDeepAutocomplete() {
    console.log('\n========== 2단계 자동완성 테스트 (제품명 수집) ==========\n');

    // 1단계: 카테고리 시드
    const seeds = ['청소기 추천', '에어프라이어 추천', '지원금'];

    for (const seed of seeds) {
        console.log(`\n📌 1단계 시드: "${seed}"`);
        const level1 = await fetchNaverAutocomplete(seed);

        console.log(`   1단계 결과: ${level1.slice(0, 3).join(', ')}`);

        // 2단계: 더 구체적인 키워드로 파고들기
        for (const subSeed of level1.slice(0, 2)) {
            console.log(`\n   📎 2단계 시드: "${subSeed}"`);
            const level2 = await fetchNaverAutocomplete(subSeed);

            level2.slice(0, 5).forEach((kw, i) => {
                // 제품명/브랜드명이 포함된 것 표시
                const hasProduct = /다이슨|삼성|LG|샤오미|로보락|필립스|로봇/i.test(kw);
                const marker = hasProduct ? '⭐' : '  ';
                console.log(`      ${marker} ${i + 1}. ${kw}`);
            });
        }
    }

    console.log('\n========== 테스트 완료 ==========\n');
}

testDeepAutocomplete().catch(console.error);
