/**
 * 🔬 4단계 BFS 자동완성 - 더 넓게, 더 깊게
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

async function bfsDeepMine(seed: string, maxDepth: number = 4) {
    console.log(`\n🌊 시드: "${seed}" (BFS ${maxDepth}단계)\n`);

    const discovered = new Set<string>();
    discovered.add(seed);

    let currentLevel = [seed];

    for (let depth = 1; depth <= maxDepth; depth++) {
        const nextLevel: string[] = [];

        console.log(`\n--- ${depth}단계 (${currentLevel.length}개 시드에서 탐색) ---`);

        for (const keyword of currentLevel) {
            const results = await fetchNaverAutocomplete(keyword);

            // 새로운 키워드만 추가 (시드당 최대 3개)
            let added = 0;
            for (const kw of results) {
                if (!discovered.has(kw) && kw !== keyword && added < 3) {
                    discovered.add(kw);
                    nextLevel.push(kw);
                    console.log(`  ✅ ${kw}`);
                    added++;
                }
            }

            // API 부하 방지
            await new Promise(r => setTimeout(r, 50));
        }

        if (nextLevel.length === 0) {
            console.log('  (더 이상 새 키워드 없음)');
            break;
        }

        currentLevel = nextLevel.slice(0, 10); // 다음 레벨 최대 10개
    }

    console.log(`\n🎯 총 ${discovered.size}개 키워드 발굴\n`);

    // 결과 출력
    console.log('=== 발굴된 모든 키워드 ===');
    Array.from(discovered).forEach((kw, i) => {
        console.log(`${i + 1}. ${kw}`);
    });

    return Array.from(discovered);
}

async function test() {
    console.log('\n========== BFS 4단계 깊이 파기 테스트 ==========');

    await bfsDeepMine('로봇청소기 추천', 4);

    console.log('\n========== 테스트 완료 ==========\n');
}

test().catch(console.error);
