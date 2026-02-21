/**
 * 🎯 Deep Niche Mining - 진짜 숨겨진 틈새 키워드 발굴
 * 
 * "청년희망적금 2026" ❌ 누구나 생각함
 * "청년희망적금 중도해지 불이익" ✅ 진짜 틈새!
 * 
 * 3-4단계 자동완성 + 문제해결 패턴으로 진짜 숨은 키워드 발굴
 */

import axios from 'axios';

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

// ❌ 뻔한 패턴 필터 (연도, 단순 숫자 추가 등)
function isObviousPattern(keyword: string, baseSeed: string): boolean {
    const kw = keyword.toLowerCase();
    const seed = baseSeed.toLowerCase();

    // 연도만 추가된 경우 (2024, 2025, 2026 등)
    if (/\b20\d{2}\b/.test(kw) && kw.replace(/\s*20\d{2}\s*/, '').trim() === seed.replace(/\s*20\d{2}\s*/, '').trim()) {
        return true;
    }

    // 단순 차수만 추가된 경우 (1차, 2차, 3차 등) - 단, 구체적 맥락 있으면 예외
    if (/[1-9]차\s*$/.test(kw) && !kw.includes('신청') && !kw.includes('일정')) {
        return true;
    }

    // 시드와 거의 동일한 경우
    if (kw === seed || kw.replace(/\s/g, '') === seed.replace(/\s/g, '')) {
        return true;
    }

    return false;
}

// ✅ 진짜 틈새 패턴 (문제해결, 구체적 시나리오)
function hasDeepNichePattern(keyword: string): boolean {
    const nichePatterns = [
        // 문제해결 패턴
        /불이익|해결|오류|실패|안되|거부|반려|취소|환불|해지/,
        // 구체적 조건/상황
        /조건.*충족|자격.*미달|소득.*기준|나이.*제한/,
        // 비교/선택 패턴
        /vs|차이|뭐가.*좋|어디가.*좋|비교.*추천/,
        // 구체적 시나리오
        /중도.*해지|조기.*상환|만기.*후|갈아타기/,
        // 숨겨진 꿀팁
        /꿀팁|숨은|몰랐|놓치|실수|주의/
    ];

    return nichePatterns.some(pattern => pattern.test(keyword));
}

// 🔥 3-4단계 깊이 파기
async function deepMine(baseSeed: string, maxDepth: number = 3): Promise<string[]> {
    const discovered = new Set<string>();
    const queue: { keyword: string; depth: number }[] = [{ keyword: baseSeed, depth: 0 }];

    while (queue.length > 0) {
        const { keyword, depth } = queue.shift()!;

        if (depth >= maxDepth) continue;
        if (discovered.has(keyword)) continue;
        discovered.add(keyword);

        const results = await fetchNaverAutocomplete(keyword);

        for (const result of results.slice(0, 5)) {
            if (!discovered.has(result)) {
                // 뻔한 패턴 제외
                if (!isObviousPattern(result, baseSeed)) {
                    queue.push({ keyword: result, depth: depth + 1 });
                }
            }
        }

        // API 부하 방지
        await new Promise(r => setTimeout(r, 50));
    }

    // 시드 자체는 제외
    discovered.delete(baseSeed);

    return Array.from(discovered);
}

async function test() {
    console.log('\n========== Deep Niche Mining 테스트 ==========\n');

    const seeds = ['청년희망적금', '실업급여', 'ISA 계좌'];

    for (const seed of seeds) {
        console.log(`\n📌 시드: "${seed}" (3단계 깊이 파기)\n`);

        const keywords = await deepMine(seed, 3);

        console.log(`   발견: ${keywords.length}개 키워드`);
        console.log('');

        // 뻔한 패턴 vs 진짜 틈새 분류
        const realNiche: string[] = [];
        const maybeNiche: string[] = [];

        for (const kw of keywords.slice(0, 15)) {
            if (hasDeepNichePattern(kw)) {
                realNiche.push(kw);
            } else if (kw.split(' ').length >= 3) { // 3단어 이상
                maybeNiche.push(kw);
            }
        }

        if (realNiche.length > 0) {
            console.log('   ✅ 진짜 틈새 (문제해결/구체적 시나리오):');
            realNiche.slice(0, 5).forEach(kw => console.log(`      - ${kw}`));
        }

        if (maybeNiche.length > 0) {
            console.log('   🔍 확장 키워드 (3단어 이상):');
            maybeNiche.slice(0, 5).forEach(kw => console.log(`      - ${kw}`));
        }

        console.log('');
    }

    console.log('========== 테스트 완료 ==========\n');
}

test().catch(console.error);
