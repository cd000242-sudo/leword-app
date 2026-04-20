/**
 * Quality Extractor — TF-IDF · 고유명사 가중치 · 카테고리 부스팅
 *
 * 목적:
 *  - 기존 `extractKoreanNouns` 는 빈도만 봐서 "진짜", "오늘" 같은 고빈도 스톱워드에 약하고
 *    뉴스처럼 단어가 매번 달라지는 소스에선 빈도 필터로 다 잘려버림.
 *  - 본 모듈은 소스별 토큰 집합을 받아 TF-IDF + 고유명사 추정 + 카테고리 부스팅으로
 *    키워드 품질 점수를 산출한다.
 *
 * 구조:
 *  - scoreSeedKeyword(kw, stats): 시드 1건에 대한 점수 0~1
 *  - buildIDFStats(sourceBuckets): 전체 소스 코퍼스 기반 IDF 테이블
 *  - isLikelyNamedEntity(kw): 휴리스틱 고유명사 판정
 *  - categoryBoost(kw): 고CPC 카테고리 시그널 가중치
 */

export interface IDFStats {
    docCount: number;                    // 전체 "문서"(=소스별 시드 집합) 수
    docFreq: Map<string, number>;        // 키워드별 등장 문서 수
}

export function buildIDFStats(sourceBuckets: Map<string, string[]>): IDFStats {
    const docFreq = new Map<string, number>();
    let docCount = 0;
    for (const [, seeds] of sourceBuckets.entries()) {
        docCount++;
        const uniq = new Set(seeds);
        for (const kw of uniq) {
            docFreq.set(kw, (docFreq.get(kw) || 0) + 1);
        }
    }
    return { docCount, docFreq };
}

/** 소스 다수에 동시 등장하는 평범 키워드 페널티 — 전체의 60% 이상이면 스톱워드급 */
function idfValue(kw: string, stats: IDFStats): number {
    const df = stats.docFreq.get(kw) || 0;
    if (df === 0) return 0;
    const ratio = df / Math.max(1, stats.docCount);
    if (ratio >= 0.6) return 0.1;     // 거의 모든 소스에 등장 → 스톱워드
    if (ratio >= 0.3) return 0.5;     // 흔한 키워드
    if (ratio >= 0.1) return 0.9;     // 여러 소스 교차 — 품질 시그널
    return 1.0;                        // 희소 — 롱테일 기회
}

/**
 * 고유명사 추정 (휴리스틱)
 *  - 영문 대문자 시작 + 3자+ → 브랜드/회사/제품 가능성 높음
 *  - 숫자 포함 (예: "갤럭시S25") → 모델명
 *  - 한글+영문 혼재 → 브랜드명 또는 신조어
 *  - 4글자 이상 한글 단일 단어 → 전문용어/고유명사 가능성 높음
 *  - 2~3글자 한글 + 흔한 접미어 없음 → 인명 가능성
 */
export function isLikelyNamedEntity(kw: string): boolean {
    if (!kw) return false;
    if (/^[A-Z][a-zA-Z]{2,}/.test(kw)) return true;
    if (/\d/.test(kw) && /[가-힣A-Za-z]/.test(kw)) return true;
    if (/^[A-Za-z]+[가-힣]+$|^[가-힣]+[A-Za-z]+$/.test(kw)) return true;
    if (/^[가-힣]{4,}$/.test(kw)) return true;
    return false;
}

/** 고CPC 카테고리 강한 시그널이면 점수 가산 */
const HIGH_CPC_PATTERNS = [
    /(보험|대출|담보|리스|론|카드)/,
    /(피부과|성형|치과|한의원|병원|의원|약국|탈모|영양제)/,
    /(청약|분양|전세|재건축|재개발|아파트|주상복합|빌라)/,
    /(주식|코인|비트코인|이더리움|펀드|ETF|배당|연금)/,
    /(다이어트|비만|체중|칼로리|유산소|PT)/,
    /(유학|어학연수|자격증|공무원|토익|아이엘츠)/,
    /(지원금|보조금|수당|바우처|혜택)/,
];
export function categoryBoost(kw: string): number {
    for (const re of HIGH_CPC_PATTERNS) {
        if (re.test(kw)) return 1.25;
    }
    return 1.0;
}

/**
 * 시드 품질 점수 (0 ~ 1 범위 초과 가능, 상대 비교용)
 *  - IDF 가중 (0.1 ~ 1.0)
 *  - 소스 수 bonus (1소스 1.0 → 2+ 소스 1.2)
 *  - 고유명사 bonus (1.15)
 *  - 카테고리 bonus (1.25)
 *  - 길이 페널티 (너무 짧은 1글자 제외는 pre-filter)
 */
export function scoreSeedKeyword(kw: string, stats: IDFStats, sourceCount: number): number {
    let s = idfValue(kw, stats);
    if (sourceCount >= 2) s *= 1.2;
    if (sourceCount >= 4) s *= 1.1;
    if (isLikelyNamedEntity(kw)) s *= 1.15;
    s *= categoryBoost(kw);
    return s;
}

/** 후보를 품질 점수로 정렬 + 상위 N개 선별 */
export function rankSeedsByQuality(
    seeds: Array<{ keyword: string; sources: string[] }>,
    sourceBuckets: Map<string, string[]>,
    topN: number
): Array<{ keyword: string; sources: string[]; qualityScore: number }> {
    const stats = buildIDFStats(sourceBuckets);
    return seeds
        .map(s => ({
            ...s,
            qualityScore: scoreSeedKeyword(s.keyword, stats, s.sources.length),
        }))
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, topN);
}

/**
 * 품질 필터 — 명확한 노이즈를 사전 제거
 *  (rich-feed의 기존 `isValid` 는 유지하되, 여기서 한번 더 강화)
 */
const NOISE_PATTERNS = [
    /^[ㄱ-ㅎㅏ-ㅣ]+$/,                    // 자모만
    /^(ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㄷ+|ㄴ+)$/,         // 이모지/감탄사
    /^(https?|www\.)/i,                   // URL
    /^\d+$/,                              // 숫자만
    /^[.,!?\-_+=\/\\]+$/,                 // 문장부호만
];
export function isQualitySeed(kw: string): boolean {
    if (!kw || kw.length < 2 || kw.length > 30) return false;
    for (const re of NOISE_PATTERNS) {
        if (re.test(kw)) return false;
    }
    if (!/[가-힣a-zA-Z]/.test(kw)) return false;
    return true;
}
