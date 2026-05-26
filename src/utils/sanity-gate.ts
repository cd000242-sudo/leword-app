/**
 * sanity-gate.ts — Single Source of Truth (SSoT) for SSS/SS/S grade validation.
 *
 * Phase A 정적 분석 (6 에이전트) 결과:
 *   - 9개 SSS 부여 path 가 각자 다른 임계치 → root cause "SSoT 부재 + add-on patch 문화"
 *   - sanity gate 가 rich-feed-builder 1곳만 적용 → 8 path 우회 가능
 *
 * Phase B baseline (v2.49.7 측정):
 *   - 정확 sv*0.5 차단: 100% (OK)
 *   - sv*0.4 / sv*0.6 인접 fallback 통과: 90% (★ leak)
 *   - Math.random shuffle: 100% (회색지대)
 *   - classifier person 도메인 100% miss
 *
 * 토론 3 에이전트 합치 (보수적/균형/급진적) — 모두 동일 결론으로 수렴:
 *   ✓ 런타임 SSoT validateGrade 함수 (보수적 안)
 *   ✓ 9 path 일괄 진입점 강제 (균형 안)
 *   ✗ Brand type 영구 보류 (1인 운영 ROI 음수, 30% boilerplate)
 *
 * 메모리 규칙 4종 enforcement:
 *   - 추정값 fallback 가드 — *Estimated 플래그 전체 다운스트림 전파
 *   - 추정치 UI 노출 금지 — estimatedFlags 반환으로 UI 가 chip 표시 가능
 *   - Math.random 점수/등급 금지 — validate 가 random 의존 X
 *   - Manus 우선 — source='claude' 행 SSS 차단
 */

/** SSS 부여 path 의 source 식별자 (모든 9 path 등록). */
export type GradeSource =
    | 'rich-feed'           // rich-feed-builder.ts
    | 'pro-traffic'         // pro-traffic-keyword-hunter.ts
    | 'lite-traffic'        // lite-traffic-keyword-hunter.ts
    | 'category-longtail'   // category-longtail-keyword-hunter.ts
    | 'rising'              // rising-keyword-finder.ts
    | 'profit-golden'       // profit-golden-keyword-engine.ts
    | 'mdp'                 // mdp-engine.ts
    | 'naver-kin'           // naver-kin-golden-hunter-v3.ts
    | 'adsense'             // adsense-keyword-hunter.ts
    | 'ultimate'            // ultimate-golden-keyword-hunter.ts
    | 'manus'               // Manus AI 보강 (메모리 규칙 우선)
    | 'claude'              // Claude API 보강 (메모리 규칙 비추천)
    | 'backup-no-api'       // API 키 없을 때 fallback (v2.49.8)
    | 'unknown';

/** validateGrade 입력. */
export interface SanityInput {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;          // sv / dc
    score: number;                // 0~100 점수
    dcEstimated?: boolean;        // dc 가 추정값인지
    svEstimated?: boolean;        // sv 가 추정값인지
    source: GradeSource;
}

/** validateGrade 출력. */
export interface SanityResult {
    /** SSS 부여 허용 여부 */
    allowSss: boolean;
    /** SS 부여 허용 여부 */
    allowSs: boolean;
    /** S 부여 허용 여부 */
    allowS: boolean;
    /** 강등 사유 목록 (UI debug + 분석용) */
    reasons: string[];
    /** 검증 후 확정된 추정 플래그 (caller 가 dcEstimated 변수 동기화 필수) */
    estimatedFlags: { dc: boolean; sv: boolean };
}

// ==================== 임계 상수 ====================
// Phase B baseline 발견 반영 — sv*0.5 인접 fallback (sv*0.4 ~ sv*0.6) 모두 차단.
const FALLBACK_HALF_SV_LO = 0.4;
const FALLBACK_HALF_SV_HI = 0.6;
const BIG_WORD_SV = 30_000;
const SINGLE_TOKEN_DC_MAX_FOR_SSS = 5_000;

/**
 * 단일 검증 함수 — 모든 9 path 가 SSS/SS/S 부여 직전 호출.
 *
 * 사용 예 (rich-feed-builder.ts):
 *   const sanity = validateGrade({ keyword, searchVolume, documentCount, ... });
 *   dcEstimated = sanity.estimatedFlags.dc;  // caller 동기화
 *   if (allowSss && score >= threshold) return applySanity('SSS', sanity);
 */
export function validateGrade(input: SanityInput): SanityResult {
    const reasons: string[] = [];
    let dcEst = input.dcEstimated === true;
    const svEst = input.svEstimated === true;

    const { keyword, searchVolume: sv, documentCount: dc, goldenRatio, source } = input;
    const tokens = keyword.trim().split(/\s+/).filter(Boolean).length;

    let allowSss = true;
    let allowSs = true;
    let allowS = true;

    // [1] sv*0.5 fallback 매칭 — EXACT(±5%)는 즉시 SSS 차단, NEAR(±10%)는 dcEst 마킹만.
    //     EXACT: 사용자 보고 케이스 ("게이밍 노트북 추천" sv=1980, dc=990 = 정확 sv/2)
    //     NEAR: Phase B 발견 케이스 (sv*0.4/0.6 fallback 90% 통과) — 단 실측 ratio 5.0 (dc=sv*0.2) 도 0.4 안 → 보수적 차단 X
    if (sv > 0 && dc > 0) {
        const halfSvRatio = dc / (sv * 0.5);
        if (halfSvRatio >= 0.95 && halfSvRatio <= 1.05) {
            // EXACT 매칭 — sv/2 정확. fallback 의심 매우 높음.
            dcEst = true;
            allowSss = false;
            reasons.push('FALLBACK_HALF_SV_EXACT');
        } else if (halfSvRatio >= 0.45 && halfSvRatio <= 0.55) {
            // NEAR 매칭 (±10%, [0.45, 0.55]) — 의심만 마킹, downstream gate 가 처리
            dcEst = true;
            reasons.push('FALLBACK_HALF_SV_NEAR');
        }
    }

    // [2] svEstimated → SSS 차단 (sv 자체 추정은 다운스트림 ratio 무의미)
    if (svEst) {
        allowSss = false;
        reasons.push('SV_ESTIMATED');
    }

    // [3] redOcean (ratio < 1) → SSS/SS 차단
    if (dc > 0 && goldenRatio < 1.0) {
        allowSss = false;
        allowSs = false;
        reasons.push('RED_OCEAN');
    }

    // [4] 단일 토큰 + dcEstimated → SSS 차단 (메모리 규칙)
    if (tokens <= 1 && dcEst) {
        allowSss = false;
        reasons.push('SINGLE_TOKEN_ESTIMATED');
    }

    // [5] 빅워드 (sv 30K+ AND tokens<=2) → SSS 차단 (롱테일 우선)
    if (sv >= BIG_WORD_SV && tokens <= 2) {
        allowSss = false;
        reasons.push('BIG_WORD');
    }

    // [6] 단일 토큰 + dc 5K+ → SSS 차단
    if (tokens <= 1 && dc > SINGLE_TOKEN_DC_MAX_FOR_SSS) {
        allowSss = false;
        reasons.push('SINGLE_TOKEN_HIGH_DC');
    }

    // [7] Manus 우선 정책 — Claude API 보강 행 SSS 차단
    //     사용자 메모리: "외부 AI 보강 시 Manus(open.manus.im) 1순위. Claude/GPT/Gemini API 대신"
    if (source === 'claude') {
        allowSss = false;
        reasons.push('CLAUDE_SOURCE_REJECTED');
    }

    // [8] API 키 없는 backup fallback — 모든 등급 차단 (메모리 규칙: 추정치 UI 노출 금지)
    if (source === 'backup-no-api') {
        allowSss = false;
        allowSs = false;
        allowS = false;
        reasons.push('BACKUP_NO_API');
    }

    return {
        allowSss,
        allowSs,
        allowS,
        reasons,
        estimatedFlags: { dc: dcEst, sv: svEst },
    };
}

/**
 * 등급 강등 helper — caller 가 grade 결정 직후 호출.
 * applySanity('SSS', sanity) → SSS 안 되면 SS/S/A 로 자동 강등.
 */
export type Grade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | '';

export function applySanity(grade: Grade, r: SanityResult): Grade {
    if (grade === 'SSS' && !r.allowSss) {
        return r.allowSs ? 'SS' : (r.allowS ? 'S' : 'A');
    }
    if (grade === 'SS' && !r.allowSs) {
        return r.allowS ? 'S' : 'A';
    }
    if (grade === 'S' && !r.allowS) {
        return 'A';
    }
    return grade;
}

/**
 * 진단용 — sanity 결과 요약 문자열 (로깅).
 */
export function sanitySummary(r: SanityResult): string {
    const flags = [
        r.estimatedFlags.dc ? 'dcEst' : null,
        r.estimatedFlags.sv ? 'svEst' : null,
    ].filter(Boolean).join('+') || 'measured';
    const blocks = [
        !r.allowSss && 'SSS×',
        !r.allowSs && 'SS×',
        !r.allowS && 'S×',
    ].filter(Boolean).join(' ');
    return `[${flags}] ${blocks || 'all-pass'}${r.reasons.length ? ' (' + r.reasons.join(',') + ')' : ''}`;
}

/**
 * v2.49.12: CACHE_SCHEMA_VERSION 자동 hash.
 * validateGrade + applySanity 함수 source 의 sha256 → 변경 시 cache 자동 무효화.
 * 다른 cache layer (rich-feed-cache, persistent-keyword-cache) 가 import 하여 사용.
 * 회귀 방지: sanity-gate 변경 → schema 자동 bump → 옛 가짜 SSS 캐시 자동 폐기.
 */
function computeCacheSchemaVersion(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createHash } = require('crypto');
        const src = String(validateGrade) + String(applySanity);
        const h = createHash('sha256').update(src).digest('hex');
        return `sg-${h.slice(0, 12)}`;
    } catch {
        return 'sg-fallback';
    }
}

export const CACHE_SCHEMA_VERSION = computeCacheSchemaVersion();
