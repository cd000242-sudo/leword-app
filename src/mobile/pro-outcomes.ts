import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileProOutcomeActionResult,
  MobileProOutcomeBenchmark,
  MobileProOutcomeDeleteInput,
  MobileProOutcomeItem,
  MobileProOutcomeRecordInput,
  MobileProOutcomeSnapshot,
} from './contracts';

interface ProOutcomeOptions {
  outcomeFile?: string;
  proTrackingFile?: string;
  now?: () => Date;
}

interface OutcomeRecord {
  postUrl?: unknown;
  keyword?: unknown;
  category?: unknown;
  predictedRank?: unknown;
  predictedTraffic?: unknown;
  actualRank?: unknown;
  actualMonthlyViews?: unknown;
  actualMonthlyRevenue?: unknown;
  firstExposureDays?: unknown;
  recordedAt?: unknown;
  notes?: unknown;
}

interface OutcomeStore {
  version?: unknown;
  records?: Record<string, OutcomeRecord>;
}

interface ProTrackingStore {
  version?: unknown;
  posts?: Record<string, ProTrackedPost>;
}

interface ProTrackedPost {
  postUrl?: unknown;
  keyword?: unknown;
  registeredAt?: unknown;
  predictedRank?: unknown;
  history?: unknown;
}

interface ProPostHistoryItem {
  ts?: unknown;
  rank?: unknown;
}

function appDataDirs(): string[] {
  const roots = [
    process.env['APPDATA'],
    process.env['LOCALAPPDATA'],
    process.env['HOME'],
    os.homedir(),
    process.cwd(),
  ].filter(Boolean) as string[];
  const appNames = ['LEWORD', 'leword', 'blogger-admin-panel', 'com.leword.app'];
  return [...new Set(roots.flatMap((root) => appNames.map((name) => path.join(root, name))))];
}

function firstExisting(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export function resolvePcProOutcomeFile(options: ProOutcomeOptions = {}): string {
  const proDir = process.env['LEWORD_PRO_OUTCOMES_DIR']
    || process.env['LEWORD_MOBILE_PRO_OUTCOMES_DIR']
    || '';
  const candidates = [
    ...(proDir ? [path.join(proDir, 'outcome-records.json')] : []),
    ...appDataDirs().map((base) => path.join(base, 'pro-hunter-v12', 'outcome-records.json')),
  ];
  return options.outcomeFile
    || process.env['LEWORD_PRO_OUTCOMES_FILE']
    || process.env['LEWORD_MOBILE_PRO_OUTCOMES_FILE']
    || firstExisting(candidates);
}

export function resolvePcProTrackingFile(options: ProOutcomeOptions = {}): string {
  const proDir = process.env['LEWORD_PRO_TRACKING_DIR']
    || process.env['LEWORD_MOBILE_PRO_TRACKING_DIR']
    || process.env['LEWORD_PRO_OUTCOMES_DIR']
    || process.env['LEWORD_MOBILE_PRO_OUTCOMES_DIR']
    || '';
  const candidates = [
    ...(proDir ? [path.join(proDir, 'tracking-store.json')] : []),
    ...appDataDirs().map((base) => path.join(base, 'pro-hunter-v12', 'tracking-store.json')),
  ];
  return options.proTrackingFile
    || process.env['LEWORD_PRO_TRACKING_FILE']
    || process.env['LEWORD_MOBILE_PRO_TRACKING_FILE']
    || firstExisting(candidates);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compactText(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoFromDateLike(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = numeric(value);
  const date = numericValue !== null ? new Date(numericValue) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOutcomeRecord(record: OutcomeRecord, fallbackUrl: string): MobileProOutcomeItem | null {
  const postUrl = compactText(record.postUrl) || fallbackUrl;
  const keyword = compactText(record.keyword);
  if (!postUrl || !keyword) return null;
  const predictedRank = numeric(record.predictedRank) || 0;
  const predictedTraffic = numeric(record.predictedTraffic) || 0;
  const actualRank = numeric(record.actualRank);
  const actualMonthlyViews = numeric(record.actualMonthlyViews);
  const actualMonthlyRevenue = numeric(record.actualMonthlyRevenue);

  return {
    postUrl,
    keyword,
    category: compactText(record.category) || 'uncategorized',
    predictedRank,
    predictedTraffic,
    actualRank,
    actualMonthlyViews,
    actualMonthlyRevenue,
    firstExposureDays: numeric(record.firstExposureDays),
    rankError: actualRank !== null && predictedRank > 0 ? Math.abs(actualRank - predictedRank) : null,
    revenuePerView: actualMonthlyViews && actualMonthlyRevenue !== null
      ? Math.round((actualMonthlyRevenue / actualMonthlyViews) * 10) / 10
      : null,
    recordedAt: isoFromDateLike(record.recordedAt),
    notes: compactText(record.notes) || null,
  };
}

function readOutcomeStore(outcomeFile: string): OutcomeStore {
  const store = readJson<OutcomeStore>(outcomeFile, { version: 1, records: {} });
  return {
    version: 1,
    records: store.records || {},
  };
}

function upsertOutcomeRecord(params: {
  store: OutcomeStore;
  input: MobileProOutcomeRecordInput;
  now: Date;
}): OutcomeRecord | null {
  const postUrl = compactText(params.input.postUrl);
  const keyword = compactText(params.input.keyword);
  if (!postUrl || !keyword) return null;

  const records = params.store.records || {};
  const existing = records[postUrl] || {};
  const input = params.input;
  const record: OutcomeRecord = {
    postUrl,
    keyword,
    category: compactText(input.category) || compactText(existing.category) || undefined,
    predictedRank: numeric(input.predictedRank) ?? numeric(existing.predictedRank) ?? 0,
    predictedTraffic: numeric(input.predictedTraffic) ?? numeric(existing.predictedTraffic) ?? 0,
    actualRank: input.actualRank !== undefined ? numeric(input.actualRank) : numeric(existing.actualRank),
    actualMonthlyViews: input.actualMonthlyViews !== undefined
      ? numeric(input.actualMonthlyViews)
      : numeric(existing.actualMonthlyViews),
    actualMonthlyRevenue: input.actualMonthlyRevenue !== undefined
      ? numeric(input.actualMonthlyRevenue)
      : numeric(existing.actualMonthlyRevenue),
    firstExposureDays: input.firstExposureDays !== undefined
      ? numeric(input.firstExposureDays)
      : numeric(existing.firstExposureDays),
    recordedAt: params.now.getTime(),
    notes: compactText(input.notes) || compactText(existing.notes) || undefined,
  };
  records[postUrl] = record;
  params.store.records = records;
  return record;
}

function emptyBenchmark(now: Date): MobileProOutcomeBenchmark {
  return {
    totalPosts: 0,
    avgPredictionAccuracy: 0,
    avgRankError: 0,
    avgFirstExposureDays: 0,
    totalMonthlyViews: 0,
    totalMonthlyRevenue: 0,
    avgRevenuePerPost: 0,
    avgRevenuePerView: 0,
    topPerformingKeywords: [],
    categoryBreakdown: {},
    computedAt: now.toISOString(),
  };
}

function computeBenchmark(items: MobileProOutcomeItem[], now: Date): MobileProOutcomeBenchmark {
  const measured = items.filter((item) => item.actualRank !== null);
  if (measured.length === 0) return emptyBenchmark(now);

  const rankErrors = measured
    .filter((item) => item.rankError !== null && item.predictedRank > 0)
    .map((item) => item.rankError as number);
  const accurate = rankErrors.filter((error) => error <= 3).length;
  const exposureDays = measured
    .filter((item) => item.firstExposureDays !== null)
    .map((item) => item.firstExposureDays as number);
  const totalMonthlyViews = measured.reduce((sum, item) => sum + (item.actualMonthlyViews || 0), 0);
  const totalMonthlyRevenue = measured.reduce((sum, item) => sum + (item.actualMonthlyRevenue || 0), 0);

  const categoryBreakdown: MobileProOutcomeBenchmark['categoryBreakdown'] = {};
  for (const item of measured) {
    const key = item.category || 'uncategorized';
    const current = categoryBreakdown[key] || { posts: 0, avgRank: null, revenue: 0 };
    current.posts += 1;
    current.revenue += item.actualMonthlyRevenue || 0;
    categoryBreakdown[key] = current;
  }
  for (const key of Object.keys(categoryBreakdown)) {
    const ranks = measured
      .filter((item) => (item.category || 'uncategorized') === key && item.actualRank !== null)
      .map((item) => item.actualRank as number);
    categoryBreakdown[key].avgRank = ranks.length
      ? Math.round((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length) * 10) / 10
      : null;
  }

  return {
    totalPosts: measured.length,
    avgPredictionAccuracy: rankErrors.length ? Math.round((accurate / rankErrors.length) * 100) : 0,
    avgRankError: rankErrors.length
      ? Math.round((rankErrors.reduce((sum, error) => sum + error, 0) / rankErrors.length) * 10) / 10
      : 0,
    avgFirstExposureDays: exposureDays.length
      ? Math.round(exposureDays.reduce((sum, days) => sum + days, 0) / exposureDays.length)
      : 0,
    totalMonthlyViews,
    totalMonthlyRevenue,
    avgRevenuePerPost: measured.length ? Math.round(totalMonthlyRevenue / measured.length) : 0,
    avgRevenuePerView: totalMonthlyViews > 0 ? Math.round((totalMonthlyRevenue / totalMonthlyViews) * 1000) : 0,
    topPerformingKeywords: [...measured]
      .sort((a, b) => (b.actualMonthlyViews || 0) - (a.actualMonthlyViews || 0))
      .slice(0, 10)
      .map((item) => ({
        keyword: item.keyword,
        rank: item.actualRank,
        views: item.actualMonthlyViews || 0,
        revenue: item.actualMonthlyRevenue || 0,
      })),
    categoryBreakdown,
    computedAt: now.toISOString(),
  };
}

export function readMobileProOutcomeSnapshot(options: ProOutcomeOptions = {}): MobileProOutcomeSnapshot {
  const now = options.now?.() || new Date();
  const outcomeFile = resolvePcProOutcomeFile(options);
  const store = readOutcomeStore(outcomeFile);
  const items = Object.entries(store.records || {})
    .map(([postUrl, record]) => normalizeOutcomeRecord(record, postUrl))
    .filter((item): item is MobileProOutcomeItem => !!item)
    .sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '') || a.keyword.localeCompare(b.keyword));

  return {
    updatedAt: now.toISOString(),
    storage: 'pc-pro-hunter-v12-outcome-json',
    configured: items.length > 0,
    totalRecords: items.length,
    measuredPosts: items.filter((item) => item.actualRank !== null).length,
    benchmark: computeBenchmark(items, now),
    items: items.slice(0, 50),
  };
}

export function recordMobileProOutcome(params: {
  input: MobileProOutcomeRecordInput;
  options?: ProOutcomeOptions;
}): MobileProOutcomeActionResult {
  const options = params.options || {};
  const now = options.now?.() || new Date();
  const outcomeFile = resolvePcProOutcomeFile(options);
  const store = readOutcomeStore(outcomeFile);
  const record = upsertOutcomeRecord({ store, input: params.input, now });
  if (!record) {
    return {
      success: false,
      action: 'record-outcome',
      error: 'post-url-keyword-required',
      snapshot: readMobileProOutcomeSnapshot(options),
    };
  }

  writeJson(outcomeFile, store);
  return {
    success: true,
    action: 'record-outcome',
    record: normalizeOutcomeRecord(record, compactText(params.input.postUrl)) || undefined,
    snapshot: readMobileProOutcomeSnapshot(options),
  };
}

export function deleteMobileProOutcome(params: {
  input: MobileProOutcomeDeleteInput;
  options?: ProOutcomeOptions;
}): MobileProOutcomeActionResult {
  const options = params.options || {};
  const outcomeFile = resolvePcProOutcomeFile(options);
  const store = readOutcomeStore(outcomeFile);
  const postUrl = compactText(params.input.postUrl);
  const existed = !!postUrl && !!store.records?.[postUrl];
  if (postUrl && store.records) delete store.records[postUrl];
  writeJson(outcomeFile, store);

  return {
    success: true,
    action: 'delete-outcome',
    removed: existed ? 1 : 0,
    snapshot: readMobileProOutcomeSnapshot(options),
  };
}

export function syncMobileProOutcomesFromRankTracker(params: {
  options?: ProOutcomeOptions;
} = {}): MobileProOutcomeActionResult {
  const options = params.options || {};
  const now = options.now?.() || new Date();
  const outcomeFile = resolvePcProOutcomeFile(options);
  const proTrackingFile = resolvePcProTrackingFile(options);
  const store = readOutcomeStore(outcomeFile);
  const proStore = readJson<ProTrackingStore>(proTrackingFile, { version: 1, posts: {} });
  let synced = 0;

  for (const post of Object.values(proStore.posts || {})) {
    const postUrl = compactText(post.postUrl);
    const keyword = compactText(post.keyword);
    if (!postUrl || !keyword) continue;
    const history = arrayFrom(post.history) as ProPostHistoryItem[];
    const lastWithRank = [...history].reverse().find((item) => numeric(item.rank) !== null);
    if (!lastWithRank) continue;
    const firstWithRank = history.find((item) => numeric(item.rank) !== null);
    const firstTs = numeric(firstWithRank?.ts);
    const registeredAt = numeric(post.registeredAt);
    const firstExposureDays = firstTs !== null && registeredAt !== null
      ? Math.round((firstTs - registeredAt) / 86400000)
      : null;

    const record = upsertOutcomeRecord({
      store,
      input: {
        postUrl,
        keyword,
        predictedRank: numeric(post.predictedRank) ?? 0,
        predictedTraffic: 0,
        actualRank: numeric(lastWithRank.rank),
        firstExposureDays,
      },
      now,
    });
    if (record) synced += 1;
  }

  writeJson(outcomeFile, store);
  return {
    success: true,
    action: 'sync-outcomes',
    synced,
    snapshot: readMobileProOutcomeSnapshot(options),
  };
}
