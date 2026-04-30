/**
 * 📈 홈판 노출 추적 + 자동 가중치 학습
 *
 * 사용자가 발행한 키워드를 N시간 후 자동 측정 → homeScore 가중치 재조정
 *
 * 측정 시점: 24h / 72h / 168h (1주일)
 * 측정 항목:
 *   - 네이버 검색 1페이지 진입 여부
 *   - 검색 SmartBlock 진입 여부
 *   - 노출 SmartBlock 종류
 *
 * 누적 100건+ → 회귀 분석으로 35/30/20/15 가중치 자동 보정
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const STORE_DIR_NAME = 'leword-pro-hunter';
const STORE_FILENAME = 'home-exposure-store.json';
const FETCH_TIMEOUT = 10000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export interface PublishedKeyword {
    keyword: string;
    publishedAt: number;          // 발행 시각
    blogUrl?: string;              // 사용자 블로그 글 URL
    predictedHomeScore: number;    // 발행 시 예측한 점수
    predictedBreakdown: {
        ctrPotential: number;
        freshness: number;
        categoryFit: number;
        vacancy: number;
    };
    measurements: ExposureMeasurement[];
}

export interface ExposureMeasurement {
    measuredAt: number;
    hoursAfterPublish: number;
    inSearchTop10: boolean;
    searchRank?: number;
    inSmartBlock: boolean;
    smartBlockType?: string;
}

interface ExposureStore {
    published: PublishedKeyword[];
    weightAdjustments: {
        ctrPotential: number;        // 0.8~1.2 multiplier
        freshness: number;
        categoryFit: number;
        vacancy: number;
        confidence: number;          // 학습 신뢰도 (sample 수 기반)
        sampleSize: number;
        lastTrainedAt: number;
    };
}

const DEFAULT_STORE: ExposureStore = {
    published: [],
    weightAdjustments: {
        ctrPotential: 1.0,
        freshness: 1.0,
        categoryFit: 1.0,
        vacancy: 1.0,
        confidence: 0,
        sampleSize: 0,
        lastTrainedAt: 0,
    },
};

let store: ExposureStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
let initialized = false;

function getStoreDir(): string {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') return path.join(app.getPath('userData'), STORE_DIR_NAME);
    } catch { /* not electron */ }
    const base = process.env['APPDATA'] || process.env['HOME'] || '.';
    return path.join(base, STORE_DIR_NAME);
}

function ensureInit() {
    if (initialized) return;
    initialized = true;
    try {
        const dir = getStoreDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, STORE_FILENAME);
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            store = { ...DEFAULT_STORE, ...raw, weightAdjustments: { ...DEFAULT_STORE.weightAdjustments, ...(raw.weightAdjustments || {}) } };
            console.log(`[HOME-EXPOSURE] 💾 복원 — 발행 ${store.published.length}건, 학습 ${store.weightAdjustments.sampleSize}샘플`);
        }
    } catch (err: any) {
        console.warn('[HOME-EXPOSURE] 영속화 복원 실패:', err?.message);
    }
}

function persist() {
    try {
        const dir = getStoreDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify(store, null, 2), 'utf8');
    } catch (err: any) {
        console.warn('[HOME-EXPOSURE] 영속화 실패:', err?.message);
    }
}

/**
 * 발행 등록 — 사용자가 키워드로 글 발행했음을 기록
 */
export function recordPublish(input: {
    keyword: string;
    blogUrl?: string;
    predictedHomeScore: number;
    predictedBreakdown: { ctrPotential: number; freshness: number; categoryFit: number; vacancy: number };
}): PublishedKeyword {
    ensureInit();
    const entry: PublishedKeyword = {
        keyword: input.keyword,
        publishedAt: Date.now(),
        blogUrl: input.blogUrl,
        predictedHomeScore: input.predictedHomeScore,
        predictedBreakdown: input.predictedBreakdown,
        measurements: [],
    };
    store.published.push(entry);
    persist();
    return entry;
}

/**
 * 노출 측정 — 키워드로 네이버 검색해서 사용자 글이 1페이지에 있는지 + SmartBlock 진입 여부
 */
export async function measureExposure(keyword: string, blogUrl?: string): Promise<ExposureMeasurement | null> {
    try {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        const res = await axios.get(url, {
            timeout: FETCH_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ko-KR' },
            validateStatus: s => s < 500,
        });
        if (typeof res.data !== 'string') return null;

        const $ = cheerio.load(res.data);
        const allLinks: string[] = [];
        $('a[href*="://"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.startsWith('http')) allLinks.push(href);
        });

        let inSearchTop10 = false;
        let searchRank: number | undefined;
        if (blogUrl) {
            const idx = allLinks.findIndex(href => href.includes(blogUrl));
            if (idx >= 0 && idx < 10) {
                inSearchTop10 = true;
                searchRank = idx + 1;
            }
        }

        // SmartBlock 진입 — fds-comps-* 또는 .api_subject_bx 안에 사용자 URL 존재 여부
        let inSmartBlock = false;
        let smartBlockType: string | undefined;
        if (blogUrl) {
            $('[class*="fds-comps-"], .api_subject_bx').each((_, block) => {
                const blockHtml = $(block).html() || '';
                if (blockHtml.includes(blogUrl)) {
                    inSmartBlock = true;
                    const cls = $(block).attr('class') || '';
                    smartBlockType = cls.split(' ').find(c => c.startsWith('fds-comps-')) || 'unknown';
                    return false;
                }
            });
        }

        return {
            measuredAt: Date.now(),
            hoursAfterPublish: 0, // caller가 채움
            inSearchTop10,
            searchRank,
            inSmartBlock,
            smartBlockType,
        };
    } catch (err: any) {
        return null;
    }
}

/**
 * 등록된 발행 중 측정 시점이 지난 것 자동 측정
 */
export async function processScheduledMeasurements(): Promise<{ measured: number }> {
    ensureInit();
    let measured = 0;
    const now = Date.now();
    const checkpoints = [24, 72, 168];

    for (const entry of store.published) {
        const elapsed = (now - entry.publishedAt) / 3600000;
        for (const hr of checkpoints) {
            if (elapsed < hr) continue;
            const already = entry.measurements.some(m => Math.abs(m.hoursAfterPublish - hr) < 6);
            if (already) continue;

            const result = await measureExposure(entry.keyword, entry.blogUrl);
            if (result) {
                result.hoursAfterPublish = hr;
                entry.measurements.push(result);
                measured++;
            }
        }
    }
    if (measured > 0) {
        persist();
        retrainWeights();
    }
    return { measured };
}

/**
 * 가중치 자동 재조정 — 100건+ 누적 시 회귀 분석
 *
 * 단순 회귀: predictedHomeScore가 실제 inSearchTop10/inSmartBlock과 상관관계 강한 차원에 가중치 ↑
 */
function retrainWeights(): void {
    const samples = store.published.filter(p => p.measurements.length > 0);
    if (samples.length < 20) return;

    // 각 차원의 점수 → 노출 성공률 상관계수 계산
    const dims: Array<keyof PublishedKeyword['predictedBreakdown']> = ['ctrPotential', 'freshness', 'categoryFit', 'vacancy'];
    const correlations: Record<string, number> = {};

    for (const dim of dims) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const s of samples) {
            const success = s.measurements.some(m => m.inSearchTop10 || m.inSmartBlock);
            xs.push(s.predictedBreakdown[dim]);
            ys.push(success ? 1 : 0);
        }
        correlations[dim] = pearson(xs, ys);
    }

    // 상관계수 → 가중치 multiplier (0.8 ~ 1.2)
    const mean = (Object.values(correlations).reduce((a, b) => a + b, 0)) / 4;
    for (const dim of dims) {
        const delta = correlations[dim] - mean;
        const multiplier = Math.max(0.8, Math.min(1.2, 1 + delta * 0.5));
        (store.weightAdjustments as any)[dim] = multiplier;
    }

    store.weightAdjustments.sampleSize = samples.length;
    store.weightAdjustments.confidence = Math.min(1, samples.length / 100);
    store.weightAdjustments.lastTrainedAt = Date.now();
    persist();
    console.log(`[HOME-EXPOSURE] 🧠 재학습 — ${samples.length}건, 가중치:`, JSON.stringify(store.weightAdjustments));
}

function pearson(xs: number[], ys: number[]): number {
    const n = xs.length;
    if (n === 0) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
        const a = xs[i] - mx;
        const b = ys[i] - my;
        num += a * b;
        dx += a * a;
        dy += b * b;
    }
    const den = Math.sqrt(dx * dy);
    return den === 0 ? 0 : num / den;
}

export function getWeightAdjustments(): ExposureStore['weightAdjustments'] {
    ensureInit();
    return store.weightAdjustments;
}

export function getPublishedHistory(limit: number = 50): PublishedKeyword[] {
    ensureInit();
    return store.published.slice(-limit).reverse();
}

export function getExposureStats(): { totalPublished: number; totalMeasurements: number; successRate: number } {
    ensureInit();
    const totalPublished = store.published.length;
    const allMeasurements = store.published.flatMap(p => p.measurements);
    const successCount = allMeasurements.filter(m => m.inSearchTop10 || m.inSmartBlock).length;
    return {
        totalPublished,
        totalMeasurements: allMeasurements.length,
        successRate: allMeasurements.length === 0 ? 0 : successCount / allMeasurements.length,
    };
}
