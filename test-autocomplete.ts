/**
 * 🧪 네이버 자동완성으로 틈새 키워드 직접 테스트
 */

import axios from 'axios';

// 우선순위 시드 (지원금/리빙)
const PRIORITY_SEEDS = [
    '청년지원금', '출산지원금', '신청방법', '복지혜택',
    '에어프라이어 추천', '청소기 추천', '인테리어 추천'
];

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

async function test() {
    console.log('\n========== 네이버 자동완성 틈새 키워드 수집 테스트 ==========\n');

    for (const seed of PRIORITY_SEEDS) {
        console.log(`📌 시드: "${seed}"`);
        const keywords = await fetchNaverAutocomplete(seed);

        if (keywords.length > 0) {
            keywords.slice(0, 5).forEach((kw, i) => {
                console.log(`   ${i + 1}. ${kw}`);
            });
        } else {
            console.log('   (결과 없음)');
        }
        console.log('');
    }

    console.log('========== 테스트 완료 ==========\n');
}

test().catch(console.error);
