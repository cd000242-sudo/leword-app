/**
 * 🧠 PRO 끝판왕 — 사용자 피드백 루프 + 모델 자동 보정
 *
 * 사용자가 실제로 글을 쓴 키워드의 트래픽/수익을 입력하면:
 *  - 예측값 vs 실측값 비교
 *  - 카테고리별 보정 계수(calibrationFactor) 자동 학습
 *  - 다음 헌팅 시 자동 적용 → 정확도 점진 향상
 */

import * as path from 'path';
import * as fs from 'fs';

interface FeedbackRecord {
    keyword: string;
    category: string;
    submittedAt: number;

    // 예측값 (헌팅 시 저장됨)
    predicted: {
        publisherMonthlyRevenue: number;
        reachabilityMonth12: number;
        searchVolume: number;
    };

    // 실측값 (사용자 입력)
    actual: {
        monthlyVisitors?: number;
        monthlyRevenue?: number;
        bestRank?: number;     // SERP 최고 순위
        publishedAt?: number;
        weeksPublished?: number;
    };

    // 자동 계산 정확도
    accuracy: {
        revenueRatio: number;   // actual / predicted
        volumeRatio: number;
        notes: string;
    };
}

interface CategoryCalibration {
    category: string;
    sampleCount: number;
    avgRevenueRatio: number;       // 1.0 = 정확, 0.5 = 예측 2배 과대
    avgVolumeRatio: number;
    confidenceLevel: 'low' | 'medium' | 'high';   // sampleCount 기반
    lastUpdated: number;
    multiplier: number;             // 다음 헌팅에 적용할 보정 계수
}

const feedbackRecords: FeedbackRecord[] = [];
const calibrationByCategory: Map<string, CategoryCalibration> = new Map();
const MAX_RECORDS = 1000;

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
    return path.join(dir, 'feedback-store.json');
}

let loaded = false;
function loadStore(): void {
    if (loaded) return;
    loaded = true;
    try {
        const file = getStorePath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            feedbackRecords.push(...(data.records || []));
            for (const c of data.calibrations || []) {
                calibrationByCategory.set(c.category, c);
            }
            console.log(`[FEEDBACK] 💾 영속화 복원 — 피드백 ${feedbackRecords.length}건, 카테고리 보정 ${calibrationByCategory.size}개`);
        }
    } catch (err: any) {
        console.warn('[FEEDBACK] store load 실패:', err?.message);
    }
}

function saveStore(): void {
    try {
        fs.writeFileSync(getStorePath(), JSON.stringify({
            records: feedbackRecords.slice(-MAX_RECORDS),
            calibrations: Array.from(calibrationByCategory.values()),
        }), 'utf8');
    } catch (err: any) {
        console.warn('[FEEDBACK] store save 실패:', err?.message);
    }
}

/**
 * 사용자 실측 입력 → 정확도 자동 계산 + 카테고리 보정 학습
 */
export function recordFeedback(input: {
    keyword: string;
    category: string;
    predicted: FeedbackRecord['predicted'];
    actual: FeedbackRecord['actual'];
}): { accuracy: FeedbackRecord['accuracy']; updatedCalibration: CategoryCalibration } {
    loadStore();

    const revRatio = (input.predicted.publisherMonthlyRevenue > 0 && input.actual.monthlyRevenue !== undefined)
        ? input.actual.monthlyRevenue / input.predicted.publisherMonthlyRevenue
        : 0;
    const volRatio = (input.predicted.searchVolume > 0 && input.actual.monthlyVisitors !== undefined)
        ? input.actual.monthlyVisitors / input.predicted.searchVolume
        : 0;

    const notes: string[] = [];
    if (revRatio > 0 && revRatio < 0.5) notes.push('예측 과대 50%+');
    if (revRatio > 1.5) notes.push('예측 과소 50%+');
    if (volRatio > 0 && volRatio < 0.3) notes.push('트래픽 도달 30% 미만');

    const record: FeedbackRecord = {
        keyword: input.keyword,
        category: input.category,
        submittedAt: Date.now(),
        predicted: input.predicted,
        actual: input.actual,
        accuracy: {
            revenueRatio: Math.round(revRatio * 1000) / 1000,
            volumeRatio: Math.round(volRatio * 1000) / 1000,
            notes: notes.join(', '),
        },
    };
    feedbackRecords.push(record);

    // 카테고리 보정 자동 학습
    const updated = updateCalibration(input.category);
    saveStore();
    return { accuracy: record.accuracy, updatedCalibration: updated };
}

function updateCalibration(category: string): CategoryCalibration {
    const samples = feedbackRecords.filter(r => r.category === category);
    const validRevSamples = samples.filter(s => s.accuracy.revenueRatio > 0);
    const validVolSamples = samples.filter(s => s.accuracy.volumeRatio > 0);

    const avgRev = validRevSamples.length > 0
        ? validRevSamples.reduce((s, r) => s + r.accuracy.revenueRatio, 0) / validRevSamples.length
        : 1.0;
    const avgVol = validVolSamples.length > 0
        ? validVolSamples.reduce((s, r) => s + r.accuracy.volumeRatio, 0) / validVolSamples.length
        : 1.0;

    const confidenceLevel = samples.length >= 30 ? 'high'
        : samples.length >= 10 ? 'medium' : 'low';

    // 보정 계수: 예측이 과대면 ×0.5~1.0, 과소면 ×1.0~2.0
    // 단, 표본 부족 시 보정 약화 (1.0에 가깝게 회귀)
    const dampening = confidenceLevel === 'high' ? 1.0 : confidenceLevel === 'medium' ? 0.5 : 0.2;
    const rawMultiplier = avgRev || 1.0;
    const multiplier = 1.0 + (rawMultiplier - 1.0) * dampening;

    const cal: CategoryCalibration = {
        category,
        sampleCount: samples.length,
        avgRevenueRatio: Math.round(avgRev * 1000) / 1000,
        avgVolumeRatio: Math.round(avgVol * 1000) / 1000,
        confidenceLevel,
        lastUpdated: Date.now(),
        multiplier: Math.round(Math.max(0.1, Math.min(3.0, multiplier)) * 1000) / 1000,
    };
    calibrationByCategory.set(category, cal);
    return cal;
}

/**
 * 헌팅 시 카테고리 보정 계수 조회 (예측값에 곱해서 사용)
 */
export function getCalibrationMultiplier(category: string): number {
    loadStore();
    return calibrationByCategory.get(category)?.multiplier || 1.0;
}

export function getAllCalibrations(): CategoryCalibration[] {
    loadStore();
    return Array.from(calibrationByCategory.values());
}

export function getFeedbackHistory(limit: number = 50): FeedbackRecord[] {
    loadStore();
    return feedbackRecords.slice(-limit).reverse();
}

export function getFeedbackStats(): {
    totalRecords: number;
    categoriesLearned: number;
    avgRevenueRatio: number;
    avgVolumeRatio: number;
} {
    loadStore();
    const validRev = feedbackRecords.filter(r => r.accuracy.revenueRatio > 0);
    const validVol = feedbackRecords.filter(r => r.accuracy.volumeRatio > 0);
    return {
        totalRecords: feedbackRecords.length,
        categoriesLearned: calibrationByCategory.size,
        avgRevenueRatio: validRev.length > 0
            ? Math.round((validRev.reduce((s, r) => s + r.accuracy.revenueRatio, 0) / validRev.length) * 1000) / 1000
            : 0,
        avgVolumeRatio: validVol.length > 0
            ? Math.round((validVol.reduce((s, r) => s + r.accuracy.volumeRatio, 0) / validVol.length) * 1000) / 1000
            : 0,
    };
}
