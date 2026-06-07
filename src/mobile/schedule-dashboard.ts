import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileKeywordScheduleCreateInput,
  MobileKeywordScheduleItem,
  MobileKeywordScheduleUpdateInput,
  MobileScheduleActivityItem,
  MobileScheduleDashboardSnapshot,
  MobileScheduleStatus,
} from './contracts';
import { readMobileKeywordGroupSnapshot } from './keyword-groups';

interface ScheduleDashboardOptions {
  schedulesFile?: string;
  notificationsFile?: string;
  historyFile?: string;
  keywordGroupsFile?: string;
  now?: () => Date;
}

interface AddScheduleOptions extends ScheduleDashboardOptions {
  input: MobileKeywordScheduleCreateInput;
}

interface ToggleScheduleOptions extends ScheduleDashboardOptions {
  id: string;
  enabled: boolean;
}

interface UpdateScheduleOptions extends ScheduleDashboardOptions {
  id: string;
  updates: MobileKeywordScheduleUpdateInput;
}

interface DeleteScheduleOptions extends ScheduleDashboardOptions {
  id: string;
}

interface StoredSchedule {
  id?: string;
  keyword?: unknown;
  topic?: unknown;
  keywords?: unknown;
  scheduleDateTime?: unknown;
  status?: unknown;
  platform?: unknown;
  publishType?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  payload?: unknown;
}

interface StoredNotificationSettings {
  enabled?: unknown;
  keywords?: unknown;
  settings?: unknown;
}

interface StoredHistoryItem {
  type?: unknown;
  keyword?: unknown;
  date?: unknown;
  createdAt?: unknown;
}

function appDataDir(): string {
  return process.env['APPDATA']
    || process.env['LOCALAPPDATA']
    || process.env['HOME']
    || os.homedir()
    || process.cwd();
}

function firstExisting(candidates: string[]): string {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export function resolvePcScheduleFiles(options: ScheduleDashboardOptions = {}): {
  schedulesFile: string;
  notificationsFile: string;
  historyFile: string;
  keywordGroupsFile?: string;
} {
  const base = appDataDir();
  const appDirs = [
    path.join(base, 'LEWORD'),
    path.join(base, 'leword'),
    path.join(base, 'blogger-admin-panel'),
  ];

  return {
    schedulesFile: options.schedulesFile
      || process.env['LEWORD_SCHEDULES_FILE']
      || process.env['LEWORD_MOBILE_SCHEDULES_FILE']
      || firstExisting(appDirs.flatMap((dir) => [
        path.join(dir, 'schedules.json'),
        path.join(dir, 'keyword-schedules.json'),
      ])),
    notificationsFile: options.notificationsFile
      || process.env['LEWORD_NOTIFICATIONS_FILE']
      || process.env['LEWORD_MOBILE_NOTIFICATIONS_FILE']
      || firstExisting(appDirs.map((dir) => path.join(dir, 'keyword-notifications.json'))),
    historyFile: options.historyFile
      || process.env['LEWORD_KEYWORD_HISTORY_FILE']
      || process.env['LEWORD_MOBILE_KEYWORD_HISTORY_FILE']
      || firstExisting(appDirs.map((dir) => path.join(dir, 'keyword-history.json'))),
    keywordGroupsFile: options.keywordGroupsFile,
  };
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed as T;
  } catch {
    return fallback;
  }
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function arrayFromJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.schedules)) return object.schedules;
    if (Array.isArray(object.items)) return object.items;
    if (Array.isArray(object.history)) return object.history;
  }
  return [];
}

function normalizeKeywords(values: unknown): string[] {
  const raw = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of raw) {
    const keyword = String(value || '').trim().replace(/\s+/g, ' ');
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

function normalizeStatus(value: unknown): MobileScheduleStatus {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'pending'
    || status === 'processing'
    || status === 'completed'
    || status === 'failed'
    || status === 'cancelled') {
    return status;
  }
  return 'unknown';
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSchedule(input: StoredSchedule, index: number): MobileKeywordScheduleItem | null {
  const keywords = normalizeKeywords(input.keywords);
  const topic = String(input.topic || input.keyword || keywords[0] || '').trim();
  if (!topic || keywords.length === 0) return null;
  const status = normalizeStatus(input.status);

  return {
    id: String(input.id || `pc_schedule_${index + 1}`),
    keyword: String(input.keyword || keywords[0] || topic),
    topic,
    keywords,
    scheduleDateTime: normalizeDate(input.scheduleDateTime),
    status,
    platform: String(input.platform || 'blogger'),
    publishType: String(input.publishType || 'schedule'),
    createdAt: normalizeDate(input.createdAt),
    updatedAt: normalizeDate(input.updatedAt),
    enabled: status !== 'cancelled',
  };
}

function readStoredSchedules(filePath: string): StoredSchedule[] {
  return arrayFromJson(readJson<unknown>(filePath, [])) as StoredSchedule[];
}

function makeScheduleId(input: MobileKeywordScheduleCreateInput, createdAt: string): string {
  const digest = crypto.createHash('sha1').update(JSON.stringify({
    keyword: input.keyword,
    topic: input.topic || '',
    keywords: input.keywords || [],
    scheduleDateTime: input.scheduleDateTime,
    createdAt,
  })).digest('hex').slice(0, 12);
  return `mobile_schedule_${digest}`;
}

function toStoredSchedule(schedule: MobileKeywordScheduleItem, payload?: unknown): StoredSchedule {
  return {
    id: schedule.id,
    keyword: schedule.keyword,
    topic: schedule.topic,
    keywords: schedule.keywords,
    scheduleDateTime: schedule.scheduleDateTime || undefined,
    status: schedule.status,
    platform: schedule.platform,
    publishType: schedule.publishType || 'schedule',
    createdAt: schedule.createdAt || undefined,
    updatedAt: schedule.updatedAt || undefined,
    payload,
  };
}

function buildScheduleSnapshotForMutation(
  options: ScheduleDashboardOptions,
  files: ReturnType<typeof resolvePcScheduleFiles>,
  now: Date,
): MobileScheduleDashboardSnapshot {
  return buildMobileScheduleDashboardSnapshot({
    ...options,
    schedulesFile: files.schedulesFile,
    notificationsFile: files.notificationsFile,
    historyFile: files.historyFile,
    keywordGroupsFile: files.keywordGroupsFile,
    now: () => now,
  });
}

function fallbackScheduleFromStored(
  id: string,
  stored: StoredSchedule,
): MobileKeywordScheduleItem {
  const keyword = String(stored.keyword || stored.topic || '').trim();
  const keywords = normalizeKeywords(stored.keywords);
  return {
    id,
    keyword,
    topic: String(stored.topic || keyword).trim(),
    keywords,
    scheduleDateTime: normalizeDate(stored.scheduleDateTime),
    status: normalizeStatus(stored.status),
    platform: String(stored.platform || 'blogger'),
    publishType: String(stored.publishType || 'schedule'),
    createdAt: normalizeDate(stored.createdAt),
    updatedAt: normalizeDate(stored.updatedAt),
    enabled: normalizeStatus(stored.status) !== 'cancelled',
  };
}

function normalizeHistoryItem(item: StoredHistoryItem): MobileScheduleActivityItem {
  return {
    type: String(item.type || ''),
    keyword: String(item.keyword || 'N/A'),
    date: String(item.date || item.createdAt || ''),
  };
}

function countByStatus(items: MobileKeywordScheduleItem[], status: MobileScheduleStatus): number {
  return items.filter((item) => item.status === status).length;
}

function nextRunAt(items: MobileKeywordScheduleItem[], now: Date): string | null {
  const nowMs = now.getTime();
  const active = items
    .filter((item) => item.enabled && item.scheduleDateTime && (item.status === 'pending' || item.status === 'processing'))
    .map((item) => item.scheduleDateTime as string)
    .filter((date) => new Date(date).getTime() >= nowMs)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return active[0] || null;
}

export function buildMobileScheduleDashboardSnapshot(
  options: ScheduleDashboardOptions = {},
): MobileScheduleDashboardSnapshot {
  const files = resolvePcScheduleFiles(options);
  const now = options.now?.() || new Date();
  const rawSchedules = arrayFromJson(readJson<unknown>(files.schedulesFile, []));
  const items = rawSchedules
    .map((item, index) => normalizeSchedule(item as StoredSchedule, index))
    .filter((item): item is MobileKeywordScheduleItem => !!item);

  const rawNotifications = readJson<StoredNotificationSettings>(files.notificationsFile, {
    enabled: false,
    keywords: [],
    settings: {},
  });
  const notificationKeywords = normalizeKeywords(rawNotifications.keywords);
  const notificationSettings = rawNotifications.settings && typeof rawNotifications.settings === 'object'
    ? rawNotifications.settings as Record<string, unknown>
    : {};

  const history = arrayFromJson(readJson<unknown>(files.historyFile, []))
    .map((item) => normalizeHistoryItem(item as StoredHistoryItem));
  const trends = history.filter((item) => item.type === 'trend').slice(-10).reverse();
  const golden = history.filter((item) => item.type === 'golden').slice(-10).reverse();
  const groups = readMobileKeywordGroupSnapshot({
    filePath: files.keywordGroupsFile,
    now: () => now,
  });

  return {
    updatedAt: now.toISOString(),
    storage: {
      schedules: 'pc-schedules-json',
      notifications: 'pc-keyword-notifications-json',
      history: 'pc-keyword-history-json',
    },
    schedules: {
      total: items.length,
      pending: countByStatus(items, 'pending'),
      processing: countByStatus(items, 'processing'),
      completed: countByStatus(items, 'completed'),
      failed: countByStatus(items, 'failed'),
      cancelled: countByStatus(items, 'cancelled'),
      nextRunAt: nextRunAt(items, now),
      items: items.slice(0, 20),
    },
    notifications: {
      enabled: rawNotifications.enabled === true,
      keywordCount: notificationKeywords.length,
      settingsCount: Object.keys(notificationSettings).length,
    },
    keywords: {
      totalAnalyzed: history.length,
      recentTrendQueries: trends.length,
      recentGoldenQueries: golden.length,
    },
    recentActivity: {
      trends,
      golden,
    },
    groups: {
      total: groups.total,
      top: groups.groups.slice(0, 6),
    },
  };
}

export function addMobileKeywordSchedule(options: AddScheduleOptions): {
  schedule: MobileKeywordScheduleItem & { publishType: string };
  snapshot: MobileScheduleDashboardSnapshot;
} {
  const files = resolvePcScheduleFiles(options);
  const now = options.now?.() || new Date();
  const createdAt = now.toISOString();
  const keyword = String(options.input.keyword || '').trim().replace(/\s+/g, ' ');
  if (!keyword) {
    throw new Error('keyword is required');
  }
  const scheduleDateTime = normalizeDate(options.input.scheduleDateTime);
  if (!scheduleDateTime) {
    throw new Error('valid scheduleDateTime is required');
  }
  const keywords = normalizeKeywords([
    ...(options.input.keywords || []),
    keyword,
  ]);
  const schedule: MobileKeywordScheduleItem & { publishType: string } = {
    id: makeScheduleId(options.input, createdAt),
    keyword,
    topic: String(options.input.topic || keyword).trim(),
    keywords,
    scheduleDateTime,
    status: 'pending',
    platform: String(options.input.platform || 'blogger').trim() || 'blogger',
    publishType: String(options.input.publishType || 'schedule'),
    createdAt,
    updatedAt: createdAt,
    enabled: true,
  };

  const stored = readStoredSchedules(files.schedulesFile);
  stored.push(toStoredSchedule(schedule, {
    ...options.input,
    keyword,
    keywords,
  }));
  writeJson(files.schedulesFile, stored);

  return {
    schedule,
    snapshot: buildMobileScheduleDashboardSnapshot({
      ...options,
      schedulesFile: files.schedulesFile,
      now: () => now,
    }),
  };
}

export function toggleMobileKeywordSchedule(options: ToggleScheduleOptions): {
  schedule: MobileKeywordScheduleItem | null;
  snapshot: MobileScheduleDashboardSnapshot;
} {
  const files = resolvePcScheduleFiles(options);
  const now = options.now?.() || new Date();
  const stored = readStoredSchedules(files.schedulesFile);
  const index = stored.findIndex((schedule) => String(schedule.id || '') === options.id);

  if (index < 0) {
    return {
      schedule: null,
      snapshot: buildMobileScheduleDashboardSnapshot({
        ...options,
        schedulesFile: files.schedulesFile,
        now: () => now,
      }),
    };
  }

  const current = normalizeSchedule(stored[index], index);
  const updated: MobileKeywordScheduleItem = {
    ...(current || {
      id: options.id,
      keyword: String(stored[index].keyword || stored[index].topic || ''),
      topic: String(stored[index].topic || stored[index].keyword || ''),
      keywords: normalizeKeywords(stored[index].keywords),
      scheduleDateTime: normalizeDate(stored[index].scheduleDateTime),
      status: 'unknown',
      platform: String(stored[index].platform || 'blogger'),
      publishType: String(stored[index].publishType || 'schedule'),
      createdAt: normalizeDate(stored[index].createdAt),
      enabled: true,
    }),
    status: options.enabled ? 'pending' : 'cancelled',
    updatedAt: now.toISOString(),
    enabled: options.enabled,
  };

  stored[index] = {
    ...stored[index],
    ...toStoredSchedule(updated, stored[index].payload),
  };
  writeJson(files.schedulesFile, stored);

  return {
    schedule: updated,
    snapshot: buildMobileScheduleDashboardSnapshot({
      ...options,
      schedulesFile: files.schedulesFile,
      now: () => now,
    }),
  };
}

export function updateMobileKeywordSchedule(options: UpdateScheduleOptions): {
  schedule: MobileKeywordScheduleItem | null;
  snapshot: MobileScheduleDashboardSnapshot;
} {
  const files = resolvePcScheduleFiles(options);
  const now = options.now?.() || new Date();
  const stored = readStoredSchedules(files.schedulesFile);
  const index = stored.findIndex((schedule) => String(schedule.id || '') === options.id);

  if (index < 0) {
    return {
      schedule: null,
      snapshot: buildScheduleSnapshotForMutation(options, files, now),
    };
  }

  const current = normalizeSchedule(stored[index], index)
    || fallbackScheduleFromStored(options.id, stored[index]);
  const nextKeyword = options.updates.keyword === undefined
    ? current.keyword
    : String(options.updates.keyword || '').trim().replace(/\s+/g, ' ');
  if (!nextKeyword) {
    throw new Error('keyword is required');
  }

  const nextTopic = options.updates.topic === undefined
    ? current.topic
    : String(options.updates.topic || nextKeyword).trim().replace(/\s+/g, ' ');
  const nextScheduleDateTime = options.updates.scheduleDateTime === undefined
    ? current.scheduleDateTime
    : normalizeDate(options.updates.scheduleDateTime);
  if (!nextScheduleDateTime) {
    throw new Error('valid scheduleDateTime is required');
  }

  const requestedKeywords = options.updates.keywords === undefined
    ? current.keywords
    : options.updates.keywords;
  const nextKeywords = normalizeKeywords([
    ...requestedKeywords,
    nextKeyword,
  ]);
  if (nextKeywords.length === 0) {
    throw new Error('keywords are required');
  }

  const nextPlatform = options.updates.platform === undefined
    ? current.platform
    : String(options.updates.platform || 'blogger').trim() || 'blogger';
  const nextPublishType = options.updates.publishType === undefined
    ? current.publishType || 'schedule'
    : String(options.updates.publishType || 'schedule').trim() || 'schedule';
  const nextStatus = typeof options.updates.enabled === 'boolean'
    ? (options.updates.enabled ? 'pending' : 'cancelled')
    : current.status;

  const updated: MobileKeywordScheduleItem = {
    ...current,
    keyword: nextKeyword,
    topic: nextTopic || nextKeyword,
    keywords: nextKeywords,
    scheduleDateTime: nextScheduleDateTime,
    status: nextStatus,
    platform: nextPlatform,
    publishType: nextPublishType,
    updatedAt: now.toISOString(),
    enabled: nextStatus !== 'cancelled',
  };
  const payload = stored[index].payload && typeof stored[index].payload === 'object'
    ? {
      ...(stored[index].payload as Record<string, unknown>),
      ...options.updates,
      keyword: nextKeyword,
      topic: updated.topic,
      keywords: nextKeywords,
      scheduleDateTime: nextScheduleDateTime,
      platform: nextPlatform,
      publishType: nextPublishType,
    }
    : {
      ...options.updates,
      keyword: nextKeyword,
      topic: updated.topic,
      keywords: nextKeywords,
      scheduleDateTime: nextScheduleDateTime,
      platform: nextPlatform,
      publishType: nextPublishType,
    };

  stored[index] = {
    ...stored[index],
    ...toStoredSchedule(updated, payload),
  };
  writeJson(files.schedulesFile, stored);

  return {
    schedule: updated,
    snapshot: buildScheduleSnapshotForMutation(options, files, now),
  };
}

export function deleteMobileKeywordSchedule(options: DeleteScheduleOptions): {
  removed: boolean;
  schedule: MobileKeywordScheduleItem | null;
  snapshot: MobileScheduleDashboardSnapshot;
} {
  const files = resolvePcScheduleFiles(options);
  const now = options.now?.() || new Date();
  const stored = readStoredSchedules(files.schedulesFile);
  const index = stored.findIndex((schedule) => String(schedule.id || '') === options.id);

  if (index < 0) {
    return {
      removed: false,
      schedule: null,
      snapshot: buildScheduleSnapshotForMutation(options, files, now),
    };
  }

  const schedule = normalizeSchedule(stored[index], index)
    || fallbackScheduleFromStored(options.id, stored[index]);
  stored.splice(index, 1);
  writeJson(files.schedulesFile, stored);

  return {
    removed: true,
    schedule,
    snapshot: buildScheduleSnapshotForMutation(options, files, now),
  };
}
