/**
 * Source Storage — fs 기반 단순 JSON 저장 (electron-store ESM 회피)
 *
 * 목적: 소스별 일별 키워드 빈도 14일 누적 → "어제 대비" 신호 생성
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface DailySnapshot {
    date: string;
    keywords: Record<string, number>;
}

interface SourceHistory {
    sourceId: string;
    snapshots: DailySnapshot[];
}

interface StorageRoot {
    sources: Record<string, SourceHistory>;
}

const MAX_DAYS = 14;

let _storePath: string | null = null;
function getStorePath(): string {
    if (_storePath) return _storePath;
    try {
        const dir = app.getPath('userData');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        _storePath = path.join(dir, 'leword-source-history.json');
    } catch {
        _storePath = path.join(process.cwd(), 'leword-source-history.json');
    }
    return _storePath;
}

function readStore(): StorageRoot {
    const p = getStorePath();
    try {
        if (!fs.existsSync(p)) return { sources: {} };
        const raw = fs.readFileSync(p, 'utf-8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || !data.sources) return { sources: {} };
        return data as StorageRoot;
    } catch {
        return { sources: {} };
    }
}

function writeStore(data: StorageRoot): void {
    try {
        const p = getStorePath();
        fs.writeFileSync(p, JSON.stringify(data), 'utf-8');
    } catch (err) {
        console.warn('[source-storage] 저장 실패:', err);
    }
}

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

export function saveSnapshot(sourceId: string, keywords: Map<string, number> | Record<string, number>): void {
    const root = readStore();
    let history = root.sources[sourceId];
    if (!history) {
        history = { sourceId, snapshots: [] };
        root.sources[sourceId] = history;
    }

    const today = todayStr();
    const kwObj: Record<string, number> = keywords instanceof Map
        ? Object.fromEntries(keywords.entries())
        : keywords;

    const existingIdx = history.snapshots.findIndex(s => s.date === today);
    if (existingIdx >= 0) {
        history.snapshots[existingIdx] = { date: today, keywords: kwObj };
    } else {
        history.snapshots.push({ date: today, keywords: kwObj });
    }

    history.snapshots = history.snapshots
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-MAX_DAYS);

    writeStore(root);
}

export function getKeywordTrend(sourceId: string, keyword: string): { today: number; weekAvg: number; ratio: number } {
    const root = readStore();
    const history = root.sources[sourceId];
    if (!history || history.snapshots.length === 0) return { today: 0, weekAvg: 0, ratio: 0 };

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const today = sorted[0]?.keywords[keyword] || 0;
    const prior7 = sorted.slice(1, 8);
    if (prior7.length === 0) return { today, weekAvg: 0, ratio: today > 0 ? 10 : 0 };

    const sum = prior7.reduce((acc, s) => acc + (s.keywords[keyword] || 0), 0);
    const weekAvg = sum / prior7.length;
    const ratio = weekAvg > 0 ? today / weekAvg : (today > 0 ? 10 : 0);

    return { today, weekAvg: parseFloat(weekAvg.toFixed(2)), ratio: parseFloat(ratio.toFixed(2)) };
}

export function getNewKeywords(sourceId: string): string[] {
    const root = readStore();
    const history = root.sources[sourceId];
    if (!history || history.snapshots.length < 2) return [];

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const today = sorted[0]?.keywords || {};
    const yesterday = sorted[1]?.keywords || {};

    return Object.keys(today).filter(kw => !(kw in yesterday));
}

export function getRisingKeywords(sourceId: string, threshold: number = 2.0): Array<{ keyword: string; ratio: number; today: number }> {
    const root = readStore();
    const history = root.sources[sourceId];
    if (!history || history.snapshots.length < 2) return [];

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const todayKws = sorted[0]?.keywords || {};
    const result: Array<{ keyword: string; ratio: number; today: number }> = [];

    for (const [kw, count] of Object.entries(todayKws)) {
        const trend = getKeywordTrend(sourceId, kw);
        if (trend.ratio >= threshold && count >= 2) {
            result.push({ keyword: kw, ratio: trend.ratio, today: count });
        }
    }

    return result.sort((a, b) => b.ratio - a.ratio);
}

export function getStorageStats(): Array<{ sourceId: string; days: number; latestDate: string; totalKeywords: number }> {
    const root = readStore();
    return Object.values(root.sources).map(h => {
        const sorted = h.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
        const latest = sorted[0];
        return {
            sourceId: h.sourceId,
            days: h.snapshots.length,
            latestDate: latest?.date || '-',
            totalKeywords: latest ? Object.keys(latest.keywords).length : 0,
        };
    });
}

export function clearStorage(): void {
    writeStore({ sources: {} });
}
