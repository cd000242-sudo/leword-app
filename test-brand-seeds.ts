/**
 * 🧪 최종 브랜드/제품명 키워드 테스트
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

async function test() {
    console.log('\n========== 브랜드/제품명 틈새 키워드 테스트 ==========\n');

    // 브랜드 시드
    const BRAND_SEEDS = [
        '다이슨', 'LG 코드제로', '삼성 비스포크', '샤오미', '로보락'
    ];

    for (const seed of BRAND_SEEDS) {
        console.log(`📌 "${seed}":`);
        const keywords = await fetchNaverAutocomplete(seed);

        keywords.slice(0, 5).forEach((kw, i) => {
            console.log(`   ${i + 1}. ${kw}`);
        });
        console.log('');
    }

    console.log('========== 테스트 완료 ==========\n');
}

test().catch(console.error);
