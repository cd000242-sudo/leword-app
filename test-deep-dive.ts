/**
 * 🔬 3~4단계 자동완성 - 최대한 깊이 파기
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

async function deepDive(seed: string, maxDepth: number = 4) {
    console.log(`\n🌊 시드: "${seed}" (최대 ${maxDepth}단계)\n`);

    const discovered = new Set<string>();
    const queue: { keyword: string; depth: number }[] = [{ keyword: seed, depth: 1 }];

    while (queue.length > 0) {
        const { keyword, depth } = queue.shift()!;

        if (depth > maxDepth) continue;
        if (discovered.has(keyword)) continue;
        discovered.add(keyword);

        const results = await fetchNaverAutocomplete(keyword);

        const indent = '  '.repeat(depth);
        console.log(`${indent}📌 [${depth}단계] "${keyword}"`);

        // 다음 레벨로 진입할 키워드 선택 (첫 2개만)
        const nextKeywords = results.slice(0, 2).filter(kw => !discovered.has(kw) && kw !== keyword);

        for (const next of nextKeywords) {
            console.log(`${indent}  └─ ${next}`);
            queue.push({ keyword: next, depth: depth + 1 });
        }

        // API 부하 방지
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n✅ 총 ${discovered.size}개 키워드 발굴`);
    return Array.from(discovered);
}

async function test() {
    console.log('\n========== 4단계 깊이 파기 테스트 ==========');

    // 테스트 시드
    const seeds = ['로봇청소기', '청년지원금'];

    for (const seed of seeds) {
        await deepDive(seed, 4);
    }

    console.log('\n========== 테스트 완료 ==========\n');
}

test().catch(console.error);
