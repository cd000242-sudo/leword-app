/**
 * 학습 데이터 모으기 (2026-11-08).
 *
 * 왜 필요한가:
 *   예측기(win-predictor)는 "학습 데이터가 모이기 전까지 휴리스틱"으로 돈다. 그런데 실제 순위를 재는 곳은
 *   노출 추적(exposure-tracking/tracked.json)이고, 보정기(model-retrainer)는 거의 안 쓰이는 옛 저장소만 읽는다.
 *   게다가 노출 추적은 글마다 최근 30회만 남기고 지운다 → 오래 지켜본 기록일수록 사라진다.
 *
 * 그래서 순위를 잴 때마다 여기로 한 줄씩 옮겨 쌓는다.
 *   - 고를 때 잰 값(검색량·경쟁 글·자리·정면) = 입력
 *   - 그 뒤 실제로 잰 순위 전부(30회 제한 없음) = 정답
 *
 * 정직 규칙(leword-proof.ts 와 같다):
 *   ① LEWORD 가 고른 것(pick 값이 있는 것)만 학습용으로 쓴다. 제목 조각 자동 추출은 검색어가 아니다.
 *   ② 아직 한 번도 안 잰 것은 정답 칸을 비워 둔다(진 것으로 만들지 않는다).
 *   ③ 못 잰 값(null)은 null 그대로 둔다. 지어내지 않는다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LEWORD_PICK_CATEGORY, WON_RANK, type PickFacts } from '../leword-proof';

export const TRAINING_FILE = 'training-samples.json';
export const TRAINING_CSV = 'training-samples.csv';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 노출 추적 한 줄에서 여기서 쓰는 칸만. */
export interface TrackedSource {
  keyword: string;
  postUrl: string;
  postTitle?: string;
  category?: string;
  registeredAt: string;
  history?: Array<{ checkedAt?: string; rank?: number | null }>;
  pick?: PickFacts;
  serp?: { sections?: string[]; hasAiBriefing?: boolean };
}

export interface TrainingSample {
  id: string;
  keyword: string;
  postUrl: string;
  postTitle: string;
  registeredAt: string;
  /** 입력: 고를 때 잰 값. */
  features: {
    source: string;
    searchVolume: number | null;
    documentCount: number | null;
    seat: string | null;
    facing: number | null;
    pickedAt: string;
    sections: string[] | null;
    hasAiBriefing: boolean | null;
  };
  /** 실제로 잰 순위 전부. 노출 추적이 30회에서 잘라도 여기는 남는다. */
  ranks: Array<{ checkedAt: string; rank: number | null }>;
  /** 정답: ranks 에서 계산. 한 번도 안 쟀으면 checked=false 이고 나머지는 null. */
  labels: {
    checked: boolean;
    checks: number;
    bestRank: number | null;
    lastRank: number | null;
    won: boolean | null;
    daysToTop10: number | null;
    daysToTop30: number | null;
    observedDays: number | null;
  };
  updatedAt: string;
}

export interface TrainingStore {
  version: 1;
  samples: Record<string, TrainingSample>;
}

export interface CollectResult {
  total: number;
  added: number;
  updated: number;
  /** pick 값이 없어 학습에 못 쓰는 줄(자동 추출 조각·옛 손 등록). */
  skipped: number;
  /** 정답(순위)이 한 번 이상 있는 학습 가능 표본 수. */
  labeled: number;
}

export const sampleId = (keyword: string, postUrl: string) =>
  `${String(keyword).toLowerCase().replace(/\s+/g, '')}|${String(postUrl).trim()}`;

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

export function computeLabels(registeredAt: string, ranks: TrainingSample['ranks']): TrainingSample['labels'] {
  if (ranks.length === 0) {
    return { checked: false, checks: 0, bestRank: null, lastRank: null, won: null, daysToTop10: null, daysToTop30: null, observedDays: null };
  }
  const found = ranks.filter((r) => typeof r.rank === 'number') as Array<{ checkedAt: string; rank: number }>;
  const bestRank = found.length ? Math.min(...found.map((r) => r.rank)) : null;
  const firstWithin = (limit: number) => {
    const hit = found.find((r) => r.rank <= limit);
    return hit ? daysBetween(registeredAt, hit.checkedAt) : null;
  };
  return {
    checked: true,
    checks: ranks.length,
    bestRank,
    lastRank: ranks[ranks.length - 1].rank,
    won: bestRank !== null && bestRank <= WON_RANK,
    daysToTop10: firstWithin(WON_RANK),
    daysToTop30: firstWithin(30),
    observedDays: daysBetween(registeredAt, ranks[ranks.length - 1].checkedAt),
  };
}

/** 노출 추적 목록을 기존 저장소에 합친다(순수 함수). 이전에 모은 순위는 지우지 않는다. */
export function mergeTrainingSamples(store: TrainingStore, tracked: TrackedSource[], nowIso: string): CollectResult {
  const result: CollectResult = { total: 0, added: 0, updated: 0, skipped: 0, labeled: 0 };
  for (const t of tracked) {
    if (!t || !t.keyword || !t.postUrl) continue;
    if (t.category !== LEWORD_PICK_CATEGORY || !t.pick) { result.skipped++; continue; }
    const id = sampleId(t.keyword, t.postUrl);
    const prev = store.samples[id];

    const byTime = new Map<string, number | null>();
    for (const r of prev?.ranks || []) byTime.set(r.checkedAt, r.rank);
    for (const h of t.history || []) {
      if (!h || !h.checkedAt) continue;
      byTime.set(h.checkedAt, typeof h.rank === 'number' ? h.rank : null);
    }
    const ranks = [...byTime.entries()]
      .map(([checkedAt, rank]) => ({ checkedAt, rank }))
      .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));

    const sections = Array.isArray(t.serp?.sections) ? t.serp!.sections! : prev?.features.sections ?? null;
    const hasAiBriefing = typeof t.serp?.hasAiBriefing === 'boolean' ? t.serp!.hasAiBriefing! : prev?.features.hasAiBriefing ?? null;

    const next: TrainingSample = {
      id,
      keyword: t.keyword,
      postUrl: t.postUrl,
      postTitle: t.postTitle || prev?.postTitle || '',
      registeredAt: t.registeredAt,
      features: {
        source: t.pick.source,
        searchVolume: t.pick.searchVolume ?? null,
        documentCount: t.pick.documentCount ?? null,
        seat: t.pick.seat ?? null,
        facing: t.pick.facing ?? null,
        pickedAt: t.pick.measuredAt,
        sections,
        hasAiBriefing,
      },
      ranks,
      labels: computeLabels(t.registeredAt, ranks),
      updatedAt: prev?.updatedAt || nowIso,
    };

    const changed = !prev || JSON.stringify({ ...prev, updatedAt: '' }) !== JSON.stringify({ ...next, updatedAt: '' });
    if (changed) next.updatedAt = nowIso;
    if (!prev) result.added++;
    else if (changed) result.updated++;
    store.samples[id] = next;
  }
  const all = Object.values(store.samples);
  result.total = all.length;
  result.labeled = all.filter((s) => s.labels.checked).length;
  return result;
}

const CSV_HEAD = [
  'keyword', 'postUrl', 'registeredAt', 'source', 'searchVolume', 'documentCount', 'seat', 'facing',
  'hasAiBriefing', 'sections', 'checks', 'bestRank', 'lastRank', 'won', 'daysToTop10', 'daysToTop30', 'observedDays',
];

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 엑셀에서 바로 열 수 있는 한 줄 한 표본 표. 못 잰 칸은 빈칸이다. */
export function toTrainingCsv(store: TrainingStore): string {
  const rows = Object.values(store.samples)
    .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt))
    .map((s) => [
      s.keyword, s.postUrl, s.registeredAt, s.features.source, s.features.searchVolume, s.features.documentCount,
      s.features.seat, s.features.facing, s.features.hasAiBriefing, (s.features.sections || []).join(' > '),
      s.labels.checks, s.labels.bestRank, s.labels.lastRank, s.labels.won, s.labels.daysToTop10, s.labels.daysToTop30,
      s.labels.observedDays,
    ].map(csvCell).join(','));
  return '﻿' + [CSV_HEAD.join(','), ...rows].join('\n') + '\n';
}

export function loadTrainingStore(dir: string): TrainingStore {
  try {
    const p = path.join(dir, TRAINING_FILE);
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && parsed.version === 1 && parsed.samples) return parsed;
    }
  } catch (err: any) {
    console.warn('[TRAINING] 불러오기 실패:', err?.message);
  }
  return { version: 1, samples: {} };
}

/** 노출 추적 목록을 받아 학습 데이터 파일(JSON + CSV)에 쌓는다. 실패해도 순위 추적은 멈추지 않게 호출 쪽에서 감싼다. */
export function collectTrainingSamples(dir: string, tracked: TrackedSource[], now = new Date()): CollectResult {
  fs.mkdirSync(dir, { recursive: true });
  const store = loadTrainingStore(dir);
  const result = mergeTrainingSamples(store, tracked, now.toISOString());
  fs.writeFileSync(path.join(dir, TRAINING_FILE), JSON.stringify(store, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, TRAINING_CSV), toTrainingCsv(store), 'utf8');
  return result;
}
