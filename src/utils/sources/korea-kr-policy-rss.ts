import { expandPolicyDiscoverySeeds, getPolicyBriefingKeywords } from '../policy-briefing-api';

const POLICY_BOOST_TERMS = [
    '지원금', '보조금', '수당', '급여', '바우처', '쿠폰', '할인권', '환급',
    '신청', '지급', '대상', '자격', '청년', '소상공인', '저소득층', '고용',
    '복지', '주거', '육아', '출산', '의료', '교육', '창업', '민생',
];

export async function getPolicyKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const items = await getPolicyBriefingKeywords(140);
    const freq = new Map<string, number>();

    for (const item of items) {
        const keyword = item.keyword.trim();
        if (!keyword || keyword.length < 2 || keyword.length > 50) continue;
        const expandedSeeds = expandPolicyDiscoverySeeds(keyword, 8);
        const seeds = expandedSeeds.length > 0 ? expandedSeeds : [keyword];
        for (const seed of seeds) {
            const weight = POLICY_BOOST_TERMS.some(term => seed.includes(term)) ? 4 : 2;
            freq.set(seed, (freq.get(seed) || 0) + weight);
        }
    }

    return Array.from(freq.entries())
        .filter(([kw]) => kw.length >= 2 && kw.length <= 50)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 140)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}
