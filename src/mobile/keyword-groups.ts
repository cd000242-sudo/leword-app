import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileKeywordGroupInput,
  MobileKeywordGroupItem,
  MobileKeywordGroupSnapshot,
} from './contracts';

interface StoredKeywordGroup {
  id?: string;
  name?: string;
  keywords?: unknown;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
}

interface KeywordGroupOptions {
  filePath?: string;
  now?: () => Date;
}

interface AddKeywordGroupOptions extends KeywordGroupOptions {
  input: MobileKeywordGroupInput;
}

interface UpdateKeywordGroupOptions extends KeywordGroupOptions {
  id: string;
  updates: MobileKeywordGroupInput;
}

interface DeleteKeywordGroupOptions extends KeywordGroupOptions {
  id: string;
}

function appDataDir(): string {
  return process.env['APPDATA']
    || process.env['LOCALAPPDATA']
    || process.env['HOME']
    || os.homedir()
    || process.cwd();
}

export function resolveKeywordGroupsFile(explicit?: string): string {
  const envPath = process.env['LEWORD_KEYWORD_GROUPS_FILE']
    || process.env['LEWORD_MOBILE_KEYWORD_GROUPS_FILE']
    || '';
  if (explicit) return explicit;
  if (envPath) return envPath;

  const base = appDataDir();
  const candidates = [
    path.join(base, 'LEWORD', 'keyword-groups.json'),
    path.join(base, 'leword', 'keyword-groups.json'),
    path.join(base, 'blogger-admin-panel', 'keyword-groups.json'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function normalizeKeywords(values: unknown): string[] {
  const raw = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of raw) {
    const keyword = String(value || '').trim().replace(/\s+/g, ' ');
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(keyword);
  }

  return normalized.slice(0, 100);
}

function readStoredGroups(filePath: string): StoredKeywordGroup[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeStoredGroups(filePath: string, groups: StoredKeywordGroup[]): void {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(groups, null, 2)}\n`, 'utf8');
}

function normalizeGroup(group: StoredKeywordGroup, index: number, now: Date): MobileKeywordGroupItem {
  const keywords = normalizeKeywords(group.keywords);
  const createdAt = group.createdAt || group.updatedAt || now.toISOString();
  const updatedAt = group.updatedAt || createdAt;
  const name = String(group.name || keywords[0] || `키워드 그룹 ${index + 1}`).trim();

  return {
    id: String(group.id || `pc_group_${index + 1}`),
    name,
    keywords,
    keywordCount: keywords.length,
    source: group.source === 'mobile-api' ? 'mobile-api' : 'pc-json',
    createdAt,
    updatedAt,
  };
}

function makeGroupId(input: MobileKeywordGroupInput, createdAt: string): string {
  const seed = JSON.stringify({
    name: input.name || '',
    keywords: input.keywords || [],
    seedKeyword: input.seedKeyword || '',
    createdAt,
  });
  const digest = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return `mobile_group_${digest}`;
}

function defaultName(now: Date): string {
  return `모바일 키워드 그룹 ${now.toISOString().slice(0, 10)}`;
}

function toStored(group: MobileKeywordGroupItem): StoredKeywordGroup {
  return {
    id: group.id,
    name: group.name,
    keywords: group.keywords,
    source: group.source,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function readMobileKeywordGroupSnapshot(
  options: KeywordGroupOptions = {},
): MobileKeywordGroupSnapshot {
  const filePath = resolveKeywordGroupsFile(options.filePath);
  const now = options.now?.() || new Date();
  const groups = readStoredGroups(filePath).map((group, index) => normalizeGroup(group, index, now));

  return {
    updatedAt: now.toISOString(),
    storage: 'pc-keyword-groups-json',
    total: groups.length,
    groups,
  };
}

export function addMobileKeywordGroup(options: AddKeywordGroupOptions): {
  group: MobileKeywordGroupItem;
  snapshot: MobileKeywordGroupSnapshot;
} {
  const filePath = resolveKeywordGroupsFile(options.filePath);
  const now = options.now?.() || new Date();
  const createdAt = now.toISOString();
  const keywords = normalizeKeywords([
    ...(options.input.keywords || []),
    options.input.seedKeyword || '',
  ]);
  const group: MobileKeywordGroupItem = {
    id: makeGroupId(options.input, createdAt),
    name: String(options.input.name || '').trim() || defaultName(now),
    keywords,
    keywordCount: keywords.length,
    source: 'mobile-api',
    createdAt,
    updatedAt: createdAt,
  };

  const stored = readStoredGroups(filePath);
  stored.push(toStored(group));
  writeStoredGroups(filePath, stored);

  return {
    group,
    snapshot: readMobileKeywordGroupSnapshot({ filePath, now: () => now }),
  };
}

export function updateMobileKeywordGroup(options: UpdateKeywordGroupOptions): {
  group: MobileKeywordGroupItem | null;
  snapshot: MobileKeywordGroupSnapshot;
} {
  const filePath = resolveKeywordGroupsFile(options.filePath);
  const now = options.now?.() || new Date();
  const stored = readStoredGroups(filePath);
  const index = stored.findIndex((group) => String(group.id || '') === options.id);

  if (index < 0) {
    return {
      group: null,
      snapshot: readMobileKeywordGroupSnapshot({ filePath, now: () => now }),
    };
  }

  const current = normalizeGroup(stored[index], index, now);
  const nextKeywords = options.updates.keywords || options.updates.seedKeyword
    ? normalizeKeywords([
      ...(options.updates.keywords || current.keywords),
      options.updates.seedKeyword || '',
    ])
    : current.keywords;
  const updated: MobileKeywordGroupItem = {
    ...current,
    name: String(options.updates.name || current.name).trim(),
    keywords: nextKeywords,
    keywordCount: nextKeywords.length,
    updatedAt: now.toISOString(),
  };

  stored[index] = toStored(updated);
  writeStoredGroups(filePath, stored);

  return {
    group: updated,
    snapshot: readMobileKeywordGroupSnapshot({ filePath, now: () => now }),
  };
}

export function deleteMobileKeywordGroup(options: DeleteKeywordGroupOptions): {
  removed: boolean;
  snapshot: MobileKeywordGroupSnapshot;
} {
  const filePath = resolveKeywordGroupsFile(options.filePath);
  const now = options.now?.() || new Date();
  const stored = readStoredGroups(filePath);
  const next = stored.filter((group) => String(group.id || '') !== options.id);
  const removed = next.length !== stored.length;

  if (removed) writeStoredGroups(filePath, next);

  return {
    removed,
    snapshot: readMobileKeywordGroupSnapshot({ filePath, now: () => now }),
  };
}
