/**
 * Phase 2: SERP 심층 분석 (스마트블록, 뷰 섹션 유무 등 파악)
 */
let lastSerpRequestAt = 0;
const SERP_INTERVAL = 1000; // 스크래핑은 더 보수적으로 (1초에 1회)

export async function getNaverSerpSignal(keyword: string): Promise<{
    hasSmartBlock: boolean;
    hasViewSection: boolean;
    hasInfluencer: boolean;
    difficultyScore: number; // 0 (쉬움) ~ 10 (매우 어려움)
}> {
    try {
        // Rate Limit 조절
        const now = Date.now();
        lastSerpRequestAt = Math.max(now, lastSerpRequestAt + SERP_INTERVAL);
        const waitMs = lastSerpRequestAt - now;
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

        const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.naver.com/'
            }
        });

        if (!response.ok) throw new Error('SERP 접근 실패');

        const html = await response.text();

        // 신호 판별
        const hasSmartBlock = html.includes('smart_block') || html.includes('스마트블록');
        const hasViewSection = html.includes('view_section') || html.includes('VIEW');
        const hasInfluencer = html.includes('influencer_card') || html.includes('인플루언서');
        const hasPowerLink = html.includes('power_link') || html.includes('ad_section');

        // 난이도 계산 (가석성)
        let difficulty = 3;
        if (hasSmartBlock) difficulty += 3;
        if (hasInfluencer) difficulty += 2;
        if (hasPowerLink) difficulty += 1;
        if (!hasViewSection) difficulty += 1; // 뷰 섹션이 없으면 블로그 상위 노출이 원천적으로 힘들 수 있음

        return {
            hasSmartBlock,
            hasViewSection,
            hasInfluencer,
            difficultyScore: Math.min(10, difficulty)
        };
    } catch (err) {
        console.warn(`[MDP-SERP] "${keyword}" 신호 분석 실패:`, err);
        return {
            hasSmartBlock: false,
            hasViewSection: true,
            hasInfluencer: false,
            difficultyScore: 5
        };
    }
}
