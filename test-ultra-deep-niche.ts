/**
 * 🔥 Ultra-Deep Niche Mining - 진짜 숨은 틈새 키워드 발굴
 * 
 * 특징:
 * 1. 4-5단계 자동완성 깊이 파기
 * 2. 문서수 < 5,000이면 검색량 없어도 틈새로 포함
 * 3. 문제해결 접미사 (불이익, 꿀팁, 오류) 강화
 * 
 * 결과: "청년도약계좌 불이익", "실업급여 거부 신청방법" 같은 진짜 숨은 키워드
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

// 네이버 VIEW 문서수 직접 조회 (API 없이)
async function getDocumentCount(keyword: string): Promise<number> {
    try {
        const url = `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(keyword)}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
            timeout: 8000
        });

        const html = response.data as string;

        // 패턴 매칭
        const patterns = [
            /총\s*([0-9,]+)\s*건/,
            /약\s+([0-9,]+)\s*건/,
            /([0-9,]+)\s*개의?\s*(?:검색|블로그)/
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
        }

        // 파싱 실패 시 결과 카드로 추정
        const hasResults = html.includes('class="title"') || html.includes('total_tit');
        return hasResults ? 10000 : 500;

    } catch {
        return 10000;
    }
}

// 문제해결 접미사
const DEEP_SUFFIXES = [
    // 문제해결 (고가치!)
    '불이익', '안되', '오류', '실패', '거부', '반려', '취소', '해결',
    // 숨은 정보
    '꿀팁', '주의', '실수', '함정', '몰랐던', '필수',
    // 구체적 시나리오
    '중도해지', '조기상환', '갈아타기', '환승', '만기후',
    // 비교
    'vs', '차이점', '뭐가좋'
];

interface DeepNicheKeyword {
    keyword: string;
    documentCount: number;
    depth: number;  // 발견 깊이
    isDeepNiche: boolean;  // 진짜 숨은 틈새
    pattern: string;  // 어떤 패턴으로 발견됐는지
}

// 🔥 Ultra-Deep Mining (4-5 levels)
async function ultraDeepMine(
    baseSeed: string,
    maxDepth: number = 4
): Promise<DeepNicheKeyword[]> {
    console.log(`\n🔥 Ultra-Deep Mining: "${baseSeed}" (깊이 ${maxDepth}단계)\n`);

    const discovered = new Map<string, DeepNicheKeyword>();
    const queue: { keyword: string; depth: number; pattern: string }[] = [];

    // 시드 추가
    queue.push({ keyword: baseSeed, depth: 0, pattern: 'seed' });

    // 문제해결 접미사로 시작점 추가
    for (const suffix of DEEP_SUFFIXES.slice(0, 10)) {
        queue.push({ keyword: `${baseSeed} ${suffix}`, depth: 1, pattern: suffix });
    }

    while (queue.length > 0) {
        const { keyword, depth, pattern } = queue.shift()!;

        if (depth > maxDepth) continue;
        if (discovered.has(keyword)) continue;

        // 자동완성 조회
        const results = await fetchNaverAutocomplete(keyword);

        // 결과 처리
        for (const result of results.slice(0, 4)) {
            if (!discovered.has(result) && result !== baseSeed) {
                // 다음 깊이로 큐 추가
                if (depth < maxDepth) {
                    queue.push({ keyword: result, depth: depth + 1, pattern: pattern });
                }

                // 발견 목록에 추가
                discovered.set(result, {
                    keyword: result,
                    documentCount: 0,
                    depth: depth + 1,
                    isDeepNiche: false,
                    pattern: pattern
                });
            }
        }

        // 속도 제한
        await new Promise(r => setTimeout(r, 30));
    }

    console.log(`   📌 자동완성 발견: ${discovered.size}개 키워드`);

    // 문서수 조회 (상위 30개만)
    const keywords = Array.from(discovered.values()).slice(0, 30);

    console.log(`   📊 문서수 조회 중... (${keywords.length}개)`);

    for (const kw of keywords) {
        kw.documentCount = await getDocumentCount(kw.keyword);

        // 진짜 숨은 틈새 판정
        if (kw.documentCount < 5000) {
            kw.isDeepNiche = true;
        }

        await new Promise(r => setTimeout(r, 50));
    }

    // 문서수 적은 순으로 정렬
    keywords.sort((a, b) => a.documentCount - b.documentCount);

    // 결과 출력
    const deepNiches = keywords.filter(k => k.isDeepNiche);
    console.log(`   ✅ 진짜 숨은 틈새: ${deepNiches.length}개 (문서수 < 5,000)\n`);

    if (deepNiches.length > 0) {
        console.log('   🏆 발견된 숨은 틈새:');
        deepNiches.slice(0, 10).forEach((kw, i) => {
            const emoji = kw.documentCount < 1000 ? '🔥' : '⭐';
            console.log(`      ${i + 1}. ${emoji} "${kw.keyword}" (문서 ${kw.documentCount.toLocaleString()}개, 깊이 ${kw.depth})`);
        });
        console.log('');
    }

    return deepNiches;
}

// 테스트
async function test() {
    console.log('\n========== Ultra-Deep Niche Mining 테스트 ==========\n');

    const seeds = [
        '청년도약계좌',
        '실업급여',
        '로봇청소기'
    ];

    const allNiches: DeepNicheKeyword[] = [];

    for (const seed of seeds) {
        const niches = await ultraDeepMine(seed, 4);
        allNiches.push(...niches);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 총 결과: ${allNiches.length}개 숨은 틈새 키워드\n`);

    // 문서수 기준 TOP 15
    allNiches.sort((a, b) => a.documentCount - b.documentCount);

    console.log('🏆 TOP 15 숨은 틈새 (문서수 적은 순):');
    allNiches.slice(0, 15).forEach((kw, i) => {
        const emoji = kw.documentCount < 1000 ? '🔥' : kw.documentCount < 3000 ? '⭐' : '📌';
        console.log(`   ${i + 1}. ${emoji} "${kw.keyword}"`);
        console.log(`      문서수: ${kw.documentCount.toLocaleString()}개 | 깊이: ${kw.depth} | 패턴: ${kw.pattern}`);
    });

    console.log('\n========== 테스트 완료 ==========\n');
}

test().catch(console.error);
