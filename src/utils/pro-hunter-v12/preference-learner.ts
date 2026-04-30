/**
 * 🧠 사용자 선호 실시간 학습 — 거절/클릭 신호로 추천 점진 개인화
 *
 * 5명 비평가 만장일치: "사용자 거절/클릭 학습 0%, 정적 휴리스틱만"
 *
 * 동작:
 *   - 사용자가 결과 카드의 "❌ 거절" 클릭 → 사유 기록
 *   - 사용자가 결과 카드의 "✍️ 글 작성" 클릭 → 양성 신호 기록
 *   - 누적된 신호로 카테고리/패턴별 가중치 자동 학습
 *   - 다음 헌팅 시 거절 패턴 키워드 자동 감점/제외
 *
 * 차별점: "일반 추천" → "당신만을 위한 추천"
 */

import * as path from 'path';
import * as fs from 'fs';

export type RejectReason = 'already-covered' | 'too-competitive' | 'not-interested' | 'too-hard-to-write' | 'low-revenue' | 'unsafe' | 'other';

interface RejectionRecord {
    keyword: string;
    category: string;
    reason: RejectReason;
    timestamp: number;
    keywordTokens: string[];   // 거절 패턴 학습용
}

interface AcceptanceRecord {
    keyword: string;
    category: string;
    timestamp: number;
    actionType: 'click-write' | 'export' | 'favorite';
}

interface CategoryPreference {
    category: string;
    rejectCount: number;
    acceptCount: number;
    rejectByReason: Record<RejectReason, number>;
    rejectedTokenPatterns: Record<string, number>;  // 자주 거절된 토큰
    preferenceScore: number;          // -1 (전부 거절) ~ +1 (전부 선호)
    lastUpdated: number;
}

const rejections: RejectionRecord[] = [];
const acceptances: AcceptanceRecord[] = [];
const categoryPrefs = new Map<string, CategoryPreference>();
const MAX_RECORDS = 2000;
let loaded = false;

function getStorePath(): string {
    let baseDir: string;
    try {
        const electron = require('electron');
        baseDir = electron.app && typeof electron.app.getPath === 'function'
            ? electron.app.getPath('userData')
            : process.env.APPDATA || process.cwd();
    } catch {
        baseDir = process.env.APPDATA || process.cwd();
    }
    const dir = path.join(baseDir, 'leword-pro-hunter');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'preference-store.json');
}

function loadStore(): void {
    if (loaded) return;
    loaded = true;
    try {
        const file = getStorePath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            rejections.push(...(data.rejections || []));
            acceptances.push(...(data.acceptances || []));
            for (const p of data.categoryPrefs || []) categoryPrefs.set(p.category, p);
            console.log(`[PREFERENCE] 💾 복원: 거절 ${rejections.length}, 선호 ${acceptances.length}, 카테고리 ${categoryPrefs.size}`);
        }
    } catch (err: any) {
        console.warn('[PREFERENCE] load 실패:', err?.message);
    }
}

function saveStore(): void {
    try {
        fs.writeFileSync(getStorePath(), JSON.stringify({
            rejections: rejections.slice(-MAX_RECORDS),
            acceptances: acceptances.slice(-MAX_RECORDS),
            categoryPrefs: Array.from(categoryPrefs.values()),
        }), 'utf8');
    } catch (err: any) {
        console.warn('[PREFERENCE] save 실패:', err?.message);
    }
}

/**
 * 거절 기록 → 카테고리 선호도 즉시 갱신
 */
export function recordRejection(keyword: string, category: string, reason: RejectReason): CategoryPreference {
    loadStore();
    const tokens = keyword.split(/[\s·,/]+/).filter(t => t.length >= 2);
    rejections.push({ keyword, category, reason, timestamp: Date.now(), keywordTokens: tokens });

    const pref = updateCategoryPreference(category);
    saveStore();
    return pref;
}

/**
 * 선호 기록 (글 작성 클릭/즐겨찾기)
 */
export function recordAcceptance(keyword: string, category: string, actionType: AcceptanceRecord['actionType']): CategoryPreference {
    loadStore();
    acceptances.push({ keyword, category, timestamp: Date.now(), actionType });
    const pref = updateCategoryPreference(category);
    saveStore();
    return pref;
}

function updateCategoryPreference(category: string): CategoryPreference {
    const rejectInCat = rejections.filter(r => r.category === category);
    const acceptInCat = acceptances.filter(a => a.category === category);
    const total = rejectInCat.length + acceptInCat.length;

    const rejectByReason = {} as Record<RejectReason, number>;
    for (const r of rejectInCat) rejectByReason[r.reason] = (rejectByReason[r.reason] || 0) + 1;

    // 거절된 토큰 빈도
    const rejectedTokenPatterns: Record<string, number> = {};
    for (const r of rejectInCat) {
        for (const t of r.keywordTokens) {
            rejectedTokenPatterns[t] = (rejectedTokenPatterns[t] || 0) + 1;
        }
    }

    const preferenceScore = total > 0
        ? (acceptInCat.length - rejectInCat.length) / total
        : 0;

    const pref: CategoryPreference = {
        category,
        rejectCount: rejectInCat.length,
        acceptCount: acceptInCat.length,
        rejectByReason,
        rejectedTokenPatterns,
        preferenceScore: Math.round(preferenceScore * 1000) / 1000,
        lastUpdated: Date.now(),
    };
    categoryPrefs.set(category, pref);
    return pref;
}

/**
 * 헌팅 결과 키워드의 사용자 적합도 점수 (0~1)
 *  - 거절 토큰 다수 포함 → 점수 ↓
 *  - 선호 카테고리 → 점수 ↑
 */
export function calculatePreferenceScore(keyword: string, category: string): {
    score: number;
    rejectedTokenHits: string[];
    categoryAffinity: number;
    summary: string;
} {
    loadStore();
    const pref = categoryPrefs.get(category);
    if (!pref || (pref.rejectCount + pref.acceptCount) < 3) {
        return { score: 0.5, rejectedTokenHits: [], categoryAffinity: 0, summary: '학습 데이터 부족 (중립)' };
    }

    const lower = keyword.toLowerCase();
    const tokens = keyword.split(/[\s·,/]+/);

    // 거절 토큰 hit
    const rejectedHits = tokens.filter(t =>
        (pref.rejectedTokenPatterns[t] || 0) >= 2
    );
    const tokenPenalty = Math.min(0.5, rejectedHits.length * 0.2);

    // 카테고리 친화도 (-1 ~ +1)
    const affinity = pref.preferenceScore;

    // 최종 점수: base 0.5 + affinity × 0.3 - tokenPenalty
    const score = Math.max(0, Math.min(1, 0.5 + affinity * 0.3 - tokenPenalty));

    let summary = '';
    if (rejectedHits.length > 0) summary += `🚫 거절 토큰 (${rejectedHits.join(',')}) `;
    if (affinity < -0.3) summary += `⚠️ ${category} 비선호 (${pref.rejectCount}건 거절) `;
    if (affinity > 0.3) summary += `✨ ${category} 선호 (${pref.acceptCount}건 양성) `;
    if (!summary) summary = '중립';

    return {
        score: Math.round(score * 1000) / 1000,
        rejectedTokenHits: rejectedHits,
        categoryAffinity: Math.round(affinity * 1000) / 1000,
        summary,
    };
}

/**
 * 키워드 배열에 사용자 선호 반영 (필터 + 재정렬)
 */
export function applyPreferenceLearning<T extends { keyword: string; category?: string }>(
    keywords: T[],
    category: string,
    options: { excludeRejectedScore?: number } = {}
): Array<T & { preferenceScore: number; preferenceSummary: string }> {
    const minScore = options.excludeRejectedScore ?? 0.2;
    const enriched = keywords.map(k => {
        const pref = calculatePreferenceScore(k.keyword, k.category || category);
        return { ...k, preferenceScore: pref.score, preferenceSummary: pref.summary };
    });
    const filtered = enriched.filter(k => k.preferenceScore >= minScore);
    filtered.sort((a, b) => b.preferenceScore - a.preferenceScore);
    return filtered;
}

export function getPreferenceStats(): {
    totalRejections: number;
    totalAcceptances: number;
    categoriesLearned: number;
    categoryPrefs: CategoryPreference[];
} {
    loadStore();
    return {
        totalRejections: rejections.length,
        totalAcceptances: acceptances.length,
        categoriesLearned: categoryPrefs.size,
        categoryPrefs: Array.from(categoryPrefs.values()).sort((a, b) => b.lastUpdated - a.lastUpdated),
    };
}
