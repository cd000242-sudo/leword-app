/**
 * OpenAlex 학술 트렌드 — 미래 키워드 예측기
 *
 * 합법성: OpenAlex는 완전 공개 무료 API. API 키 불필요.
 * 차별점: 학계→업계→대중 전파 3~6개월 선행 신호. 경쟁 키워드 도구 0개.
 */

import axios from 'axios';

const BASE = 'https://api.openalex.org';
const POLITE = '?mailto=cd000242@gmail.com';

export interface OpenAlexConcept {
    id: string;
    displayName: string;
    level: number;
    score: number;
    worksCount: number;
}

export interface ConceptTrend {
    concept: string;
    yearCounts: Record<string, number>;
    growthRate: number;
}

/**
 * 한국 기관 논문에서 가장 많이 등장한 개념 (최근 N개월)
 */
export async function fetchKoreanResearchConcepts(months: number = 6): Promise<OpenAlexConcept[]> {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - months);
    const fromIso = fromDate.toISOString().split('T')[0];

    const url = `${BASE}/works${POLITE}&filter=institutions.country_code:KR,from_publication_date:${fromIso}&group_by=concepts.id&per-page=200`;

    try {
        const res = await axios.get(url, {
            timeout: 20000,
            headers: { 'User-Agent': 'LEWORD-KeywordTool/1.0 (mailto:cd000242@gmail.com)' },
        });

        const groups = res.data?.group_by;
        if (!Array.isArray(groups)) return [];

        return groups.slice(0, 100).map((g: any) => ({
            id: String(g.key || ''),
            displayName: String(g.key_display_name || ''),
            level: 0,
            score: 0,
            worksCount: Number(g.count) || 0,
        })).filter((c: OpenAlexConcept) => c.displayName.length > 0);
    } catch (err: any) {
        console.error('[openalex] 한국 연구 개념 실패:', err.message);
        return [];
    }
}

/**
 * 특정 개념의 연도별 논문 수 시계열 (성장 추세 측정)
 */
export async function fetchConceptTrend(conceptId: string): Promise<ConceptTrend | null> {
    const cleanId = conceptId.replace(/^https?:\/\/openalex\.org\//, '');
    const url = `${BASE}/works${POLITE}&filter=concepts.id:${cleanId},institutions.country_code:KR&group_by=publication_year`;

    try {
        const res = await axios.get(url, { timeout: 15000 });
        const groups = res.data?.group_by;
        if (!Array.isArray(groups)) return null;

        const yearCounts: Record<string, number> = {};
        for (const g of groups) {
            yearCounts[String(g.key)] = Number(g.count) || 0;
        }

        const years = Object.keys(yearCounts).sort();
        if (years.length < 2) return { concept: conceptId, yearCounts, growthRate: 0 };

        const recent = yearCounts[years[years.length - 1]] || 0;
        const prior = yearCounts[years[years.length - 2]] || 1;
        const growthRate = ((recent - prior) / Math.max(1, prior)) * 100;

        return { concept: conceptId, yearCounts, growthRate: parseFloat(growthRate.toFixed(2)) };
    } catch (err: any) {
        return null;
    }
}

/**
 * 미래 키워드 예측: 한국 연구 개념 중 최근 급성장 (>50% YoY)
 */
export async function predictEmergingTopics(): Promise<Array<{ topic: string; growthRate: number; worksCount: number }>> {
    const concepts = await fetchKoreanResearchConcepts(12);
    const result: Array<{ topic: string; growthRate: number; worksCount: number }> = [];

    for (const concept of concepts.slice(0, 30)) {
        const trend = await fetchConceptTrend(concept.id);
        if (trend && trend.growthRate >= 50) {
            result.push({
                topic: concept.displayName,
                growthRate: trend.growthRate,
                worksCount: concept.worksCount,
            });
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return result.sort((a, b) => b.growthRate - a.growthRate);
}
