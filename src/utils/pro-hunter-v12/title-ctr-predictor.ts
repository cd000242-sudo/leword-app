/**
 * ✍️ 제목 CTR 예측 엔진 + Gemini 자동 생성
 *
 * 10명 오푸스 토론: 같은 키워드도 제목이 좋으면 CTR 5%, 나쁘면 0.5% (10배 차이)
 *
 * 12 패턴 점수 + 페널티:
 *   숫자형 +8 / 호기심갭 +12 / 시간절박감 +10 / 손실회피 +10
 *   권위 +5 / 비교대비 +5 / 결과약속 +10 / 최신성 +5
 *   실경험 +8 / 반전 +8 / 감정자극 +5 / 질문형 +5
 *   페널티: 40자초과 -5 / 키워드누락 -15 / 인물의존 -20
 *
 * 점수 → CTR 매핑: 0.5% + (score/100) × 4.5%
 */

export interface TitleCtrResult {
    title: string;
    ctrScore: number;          // 0~100
    expectedCtr: number;       // 0.5~5.0%
    matchedPatterns: string[];
    penalties: string[];
    suggestion?: string;
}

const PATTERN_RULES: Array<{ pattern: RegExp; name: string; points: number }> = [
    // 숫자형
    { pattern: /\bTOP\s*\d+|\d+가지|\d+개|\d+분만에|\d+초만에|\d+일만에/i, name: '숫자형', points: 8 },
    // 호기심 갭
    { pattern: /아무도\s*모르|충격적|놀랍게|믿기|이게\s*말이|진짜로|진심|소름/i, name: '호기심갭', points: 12 },
    // 시간 절박감
    { pattern: /오늘까지|마감|D-\d+|내일이면|지금\s*안\s*보면|곧\s*끝/i, name: '시간절박감', points: 10 },
    // 손실 회피
    { pattern: /놓치면|후회|아직도\s*모르|모르면\s*손해|손해\s*보는/i, name: '손실회피', points: 10 },
    // 권위
    { pattern: /전문가|변호사|의사가|세무사|박사|10년차|n년차|베테랑/i, name: '권위', points: 5 },
    // 비교/대비
    { pattern: /\bvs\b|차이점|뭐가\s*다른|이것\s*저것|비교/i, name: '비교대비', points: 5 },
    // 결과 약속
    { pattern: /월\s*\d+만원|\d+%\s*절약|\d+kg|순\s*수익|연봉\s*\d+/i, name: '결과약속', points: 10 },
    // 최신성
    { pattern: /20[2-3][0-9]년?\s*최신|최신|2026|2027|새로|업데이트/i, name: '최신성', points: 5 },
    // 실경험
    { pattern: /직접\s*해|솔직\s*후기|내돈내산|n달\s*써본|n년\s*써본|실제로|진짜/i, name: '실경험', points: 8 },
    // 반전
    { pattern: /근데\s*반전|알고보니|예상과\s*달리|완전\s*달랐|뜻밖/i, name: '반전', points: 8 },
    // 감정자극
    { pattern: /이게\s*말이\s*돼|미친|대박|레전드|역대급|진짜\s*최악|화나/i, name: '감정자극', points: 5 },
    // 질문형
    { pattern: /\?$|어떻게|왜|언제|어디서|얼마|뭐가|어느|무엇/i, name: '질문형', points: 5 },
];

const POLITICAL_NOISE = ['이재명', '윤석열', '한동훈', '대통령', '검찰', '판결', '대선'];
const PERSON_DEPENDENT = ['아이유', '뉴진스', '나연', '카리나', '장원영', '하니', '민지', 'BTS', '방탄'];

export function predictTitleCtr(title: string, seedKeyword?: string): TitleCtrResult {
    let score = 30;  // 기본
    const matched: string[] = [];
    const penalties: string[] = [];

    for (const rule of PATTERN_RULES) {
        if (rule.pattern.test(title)) {
            score += rule.points;
            matched.push(rule.name);
        }
    }

    // 페널티
    if (title.length > 40) {
        score -= 5;
        penalties.push(`40자 초과 (${title.length}자)`);
    }
    if (seedKeyword && !title.toLowerCase().includes(seedKeyword.toLowerCase())) {
        score -= 15;
        penalties.push(`핵심 키워드 "${seedKeyword}" 누락`);
    }
    if (PERSON_DEPENDENT.some(p => title.includes(p))) {
        score -= 20;
        penalties.push(`인물 의존`);
    }
    if (POLITICAL_NOISE.some(p => title.includes(p))) {
        score -= 30;
        penalties.push(`정치/시사 차단`);
    }

    score = Math.max(0, Math.min(100, score));
    const expectedCtr = Math.round((0.5 + (score / 100) * 4.5) * 100) / 100;

    let suggestion: string | undefined;
    if (score < 40) {
        suggestion = '제목 강도 부족 — 숫자/호기심갭/결과약속 중 1개+ 추가 권장';
    } else if (score < 60) {
        suggestion = '평균 제목 — 시간절박감 또는 반전 패턴 추가하면 CTR 2배';
    } else if (score >= 75) {
        suggestion = '🚀 매우 강한 제목 — 발행 즉시';
    }

    return {
        title,
        ctrScore: score,
        expectedCtr,
        matchedPatterns: matched,
        penalties,
        suggestion,
    };
}

/**
 * Claude(또는 룰)로 12 패턴 적용된 N개 제목 자동 생성
 */
export async function generateOptimizedTitles(
    keyword: string,
    options: { count?: number; category?: string } = {}
): Promise<TitleCtrResult[]> {
    const count = options.count || 5;
    try {
        const { callAI, RuleFallbackRequired } = await import('./ai-client');
        const prompt = `한국 블로그 SEO 전문가로서 키워드 "${keyword}" (카테고리: ${options.category || 'general'})에 대해 네이버 홈판 노출에 최적화된 제목 ${count}개를 생성하세요.

각 제목은 아래 12 패턴 중 2~4개를 결합:
1. 숫자형 (TOP10, 5가지, 3분만에)
2. 호기심갭 (아무도 모르는, 충격적인)
3. 시간절박감 (오늘까지, D-3)
4. 손실회피 (놓치면 후회, 아직도 모르세요?)
5. 권위 (전문가, 변호사, 의사가)
6. 비교대비 (vs, 차이점)
7. 결과약속 (월 100만원, 1주일 5kg)
8. 최신성 (2026 최신)
9. 실경험 (직접 해봤더니, 1년 써본 솔직)
10. 반전 (근데 반전이, 알고보니)
11. 감정자극 (이게 말이돼?)
12. 질문형 (~는 뭐예요?)

규칙:
- 키워드 "${keyword}" 반드시 포함
- 35자 이내
- 인물명/정치 키워드 금지
- 자연스러운 한국어

JSON 배열만 응답: ["제목1", "제목2", ...]`;
        try {
            const { text } = await callAI(prompt, { maxTokens: 1024, temperature: 0.8 });
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return generateFallbackTitles(keyword, count);
            const titles: string[] = JSON.parse(jsonMatch[0]);
            return titles.slice(0, count).map(t => predictTitleCtr(t, keyword));
        } catch (err) {
            if (!(err instanceof RuleFallbackRequired)) {
                console.warn('[TITLE-CTR] AI 실패, fallback:', (err as any)?.message);
            }
            return generateFallbackTitles(keyword, count);
        }
    } catch (err: any) {
        return generateFallbackTitles(keyword, count);
    }
}

// 강화된 룰 fallback — 12 패턴 × 10 변주 = 120개 후보 풀
const TITLE_TEMPLATES: Array<(kw: string) => string> = [
    // 숫자형 (10)
    kw => `${kw} TOP 10 추천 (2026년 최신)`,
    kw => `${kw} 5가지 핵심 정리`,
    kw => `${kw} 3분만에 끝내는 법`,
    kw => `${kw} 7일 챌린지 결과`,
    kw => `${kw} 100% 활용하는 4단계`,
    // 호기심갭 (10)
    kw => `아무도 모르는 ${kw} 5가지 비밀`,
    kw => `충격적인 ${kw} 진실, 알고보니...`,
    kw => `${kw}, 이게 말이 돼? 진짜 놀랐다`,
    kw => `${kw}의 숨겨진 사실 7가지`,
    kw => `${kw} 진짜 모르는 사실들`,
    // 시간절박감 (10)
    kw => `${kw}, 오늘까지 안 보면 후회`,
    kw => `${kw} D-3 마감 임박 — 핵심 정리`,
    kw => `${kw} 지금 안 보면 손해`,
    kw => `${kw} 곧 끝납니다 — 마지막 정리`,
    kw => `${kw} 마감 직전 — 5가지 체크`,
    // 손실회피 (10)
    kw => `${kw}, 놓치면 후회하는 핵심 정리`,
    kw => `${kw} 아직도 모르세요? 손해 막심`,
    kw => `${kw}, 이것 모르면 손해입니다`,
    kw => `${kw} 모르면 100만원 손해`,
    kw => `${kw} 이거 안 챙기면 후회`,
    // 권위 (10)
    kw => `전문가가 알려주는 ${kw} 완벽 가이드`,
    kw => `10년차 베테랑이 본 ${kw}`,
    kw => `의사가 추천하는 ${kw} 5가지`,
    kw => `세무사가 정리한 ${kw} 핵심`,
    kw => `변호사가 본 ${kw} 진실`,
    // 비교대비 (10)
    kw => `${kw} vs 대안: 알고보니 완전 달랐다`,
    kw => `${kw} 차이점 7가지 (실제 비교)`,
    kw => `${kw} A vs B 뭐가 다른가`,
    kw => `${kw} 비교 정리 — 결정 가이드`,
    kw => `${kw}와 비슷한 것들의 차이`,
    // 결과약속 (10)
    kw => `${kw}로 월 100만원 절약하는 법`,
    kw => `${kw} 1주일 만에 5kg 감량`,
    kw => `${kw}로 50% 할인 받는 법`,
    kw => `${kw} 연봉 1천만 원 더 받기`,
    kw => `${kw} 한 달 30만원 추가 수익`,
    // 최신성 (10)
    kw => `${kw} 2026 최신 가이드`,
    kw => `${kw} 새로 바뀐 점 5가지`,
    kw => `${kw} 업데이트 핵심 정리`,
    kw => `${kw} 2026년 변경사항 총정리`,
    kw => `${kw} 최신 트렌드 정리`,
    // 실경험 (10)
    kw => `${kw} 직접 해봤더니 — 솔직 후기`,
    kw => `${kw} 1년 써본 솔직 평가`,
    kw => `${kw} 내돈내산 솔직 후기`,
    kw => `${kw} 실제로 해본 결과`,
    kw => `${kw} 한 달 해본 후기`,
    // 반전 (10)
    kw => `${kw}, 알고보니 완전 달랐다`,
    kw => `${kw} 근데 반전이 있었다`,
    kw => `${kw} 예상과 달랐던 결과`,
    kw => `${kw}, 뜻밖의 진실`,
    kw => `${kw} 사실은 이랬다`,
    // 감정자극 (10)
    kw => `${kw}, 이거 진짜 미친 이유`,
    kw => `${kw} 레전드 — 역대급 후기`,
    kw => `${kw} 대박 정리 — 진짜 최고`,
    kw => `${kw} 실화? 진짜 놀랐다`,
    kw => `${kw} 화나서 정리해봤다`,
    // 질문형 (10)
    kw => `${kw}는 뭐예요? 5분 정리`,
    kw => `${kw} 어떻게 하나요? 핵심 정리`,
    kw => `${kw} 왜 중요할까? 7가지 이유`,
    kw => `${kw} 얼마예요? 실제 비용 공개`,
    kw => `${kw} 언제 해야 하나? 시기 정리`,
    // 결합형 (10) — 보너스
    kw => `${kw} TOP 5, 놓치면 후회하는 이유`,
    kw => `${kw} 전문가가 본 충격적 진실`,
    kw => `${kw} 직접 해본 결과 — 반전 충격`,
    kw => `${kw} 2026 최신 — 5분 핵심 정리`,
    kw => `${kw} 1주일 결과, 진짜 놀랐다`,
];

/**
 * 결정론적 hash → 0..n 인덱스
 */
function hashSeed(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * 65 템플릿을 키워드별 결정론적으로 셔플 → 매번 다른 5개 + 패턴 분포 강제
 */
function generateFallbackTitles(keyword: string, count: number): TitleCtrResult[] {
    const seed = hashSeed(keyword);
    const indexed = TITLE_TEMPLATES.map((fn, idx) => ({ idx, title: fn(keyword) }));

    // 해시 기반 결정론적 셔플 (Fisher-Yates with seeded prng)
    const shuffled = [...indexed];
    let s = seed || 1;
    for (let i = shuffled.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 점수 평가 + 패턴 분포 다양성 (한 패턴당 최대 2개)
    const scored = shuffled.map(item => predictTitleCtr(item.title, keyword));
    scored.sort((a, b) => b.ctrScore - a.ctrScore);

    const picked: TitleCtrResult[] = [];
    const patternCount: Record<string, number> = {};
    for (const t of scored) {
        if (picked.length >= count) break;
        const sig = t.matchedPatterns.slice(0, 2).join('+') || '_';
        if ((patternCount[sig] || 0) >= 2) continue;
        picked.push(t);
        patternCount[sig] = (patternCount[sig] || 0) + 1;
    }
    // 부족하면 점수순 보충
    if (picked.length < count) {
        for (const t of scored) {
            if (picked.length >= count) break;
            if (!picked.includes(t)) picked.push(t);
        }
    }
    return picked.slice(0, count);
}

/**
 * 키워드 배열에 각각 최적 제목 생성 + 점수
 */
export async function batchGenerateTitlesWithCtr(
    keywords: Array<{ keyword: string; category?: string }>,
    titlesPerKeyword: number = 5
): Promise<Array<{ keyword: string; titles: TitleCtrResult[]; bestTitle: TitleCtrResult }>> {
    const results = [];
    for (const kw of keywords.slice(0, 10)) {  // 비용 제한
        const titles = await generateOptimizedTitles(kw.keyword, { count: titlesPerKeyword, category: kw.category });
        const sorted = [...titles].sort((a, b) => b.ctrScore - a.ctrScore);
        results.push({ keyword: kw.keyword, titles: sorted, bestTitle: sorted[0] });
    }
    return results;
}
