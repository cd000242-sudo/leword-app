import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  MobileWordPressCategory,
  MobileWordPressDraftInput,
  MobileWordPressDraftItem,
  MobileWordPressPublishInput,
  MobileWordPressPublishResult,
  MobileWordPressSiteInput,
  MobileWordPressSiteItem,
  MobileWordPressSnapshot,
} from './contracts';

interface StoredWordPressSite {
  id?: string;
  label?: string;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  defaultCategoryId?: string | number | null;
  defaultCategoryName?: string | null;
  categories?: unknown;
  source?: string;
  updatedAt?: string;
}

interface StoredWordPressDraft {
  id?: string;
  siteId?: string;
  title?: string;
  keyword?: string;
  content?: string;
  excerpt?: string;
  categoryId?: string | number | null;
  categoryName?: string | null;
  tags?: unknown;
  status?: string;
  scheduleDateTime?: string | null;
  wpPostId?: string | number | null;
  wpPostUrl?: string | null;
  publishedAt?: string | null;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface StoredWordPressData {
  sites?: StoredWordPressSite[];
  drafts?: StoredWordPressDraft[];
}

interface WordPressPublishingOptions {
  filePath?: string;
  now?: () => Date;
}

interface UpsertWordPressSiteOptions extends WordPressPublishingOptions {
  input: MobileWordPressSiteInput;
}

interface CreateWordPressDraftOptions extends WordPressPublishingOptions {
  input: MobileWordPressDraftInput;
}

export type MobileWordPressFetch = typeof fetch;

interface RefreshWordPressCategoriesOptions extends WordPressPublishingOptions {
  siteId?: string;
  fetchImpl?: MobileWordPressFetch;
}

interface PublishWordPressDraftOptions extends WordPressPublishingOptions {
  input: MobileWordPressPublishInput;
  fetchImpl?: MobileWordPressFetch;
}

function appDataDir(): string {
  return process.env['APPDATA']
    || process.env['LOCALAPPDATA']
    || process.env['HOME']
    || os.homedir()
    || process.cwd();
}

export function resolveWordPressPublishingFile(explicit?: string): string {
  const envPath = process.env['LEWORD_WORDPRESS_PUBLISHING_FILE']
    || process.env['LEWORD_MOBILE_WORDPRESS_FILE']
    || '';
  if (explicit) return explicit;
  if (envPath) return envPath;

  const base = appDataDir();
  const candidates = [
    path.join(base, 'LEWORD', 'wordpress-publishing.json'),
    path.join(base, 'leword', 'wordpress-publishing.json'),
    path.join(base, 'blogger-admin-panel', 'wordpress-publishing.json'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function emptyData(): StoredWordPressData {
  return { sites: [], drafts: [] };
}

function readData(filePath: string): StoredWordPressData {
  if (!fs.existsSync(filePath)) return emptyData();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) return { sites: parsed, drafts: [] };
    return {
      sites: Array.isArray(parsed?.sites) ? parsed.sites : [],
      drafts: Array.isArray(parsed?.drafts) ? parsed.drafts : [],
    };
  } catch {
    return emptyData();
  }
}

function writeData(filePath: string, data: StoredWordPressData): void {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    sites: data.sites || [],
    drafts: data.drafts || [],
  }, null, 2)}\n`, 'utf8');
}

function compactText(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeSiteUrl(raw: unknown): string {
  const value = compactText(raw).replace(/\/+$/, '');
  if (!value) throw new Error('WordPress site URL is required');
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    throw new Error('WordPress site URL is invalid');
  }
}

function normalizeCategories(raw: unknown): MobileWordPressCategory[] {
  const values = Array.isArray(raw) ? raw : [];
  return values
    .map((item: any) => ({
      id: compactText(item?.id),
      name: compactText(item?.name),
      count: typeof item?.count === 'number' && Number.isFinite(item.count) ? item.count : undefined,
    }))
    .filter((item) => item.id && item.name)
    .slice(0, 100);
}

function normalizeTags(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = compactText(value);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, 30);
}

function maskUsername(username: string): string {
  if (!username) return '';
  const at = username.indexOf('@');
  if (at > 0) {
    return `${username.slice(0, Math.min(2, at))}***${username.slice(at)}`;
  }
  if (username.length <= 2) return `${username[0] || ''}***`;
  return `${username.slice(0, 2)}***`;
}

function siteIdFrom(siteUrl: string, username: string): string {
  const digest = crypto.createHash('sha1').update(`${siteUrl}\n${username}`).digest('hex').slice(0, 12);
  return `mobile_wp_site_${digest}`;
}

function draftIdFrom(siteId: string, title: string, createdAt: string): string {
  const digest = crypto.createHash('sha1').update(`${siteId}\n${title}\n${createdAt}`).digest('hex').slice(0, 12);
  return `mobile_wp_draft_${digest}`;
}

function restBase(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2`;
}

function authHeader(site: StoredWordPressSite): string {
  const username = compactText(site.username);
  const password = compactText(site.applicationPassword);
  if (!username || !password) {
    throw new Error('WordPress username and application password are required');
  }
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

function findStoredSite(
  data: StoredWordPressData,
  siteId?: string,
): { site: StoredWordPressSite; index: number } {
  const sites = data.sites || [];
  const index = siteId
    ? sites.findIndex((site) => compactText(site.id) === siteId)
    : (sites.length > 0 ? 0 : -1);
  if (index < 0 || !sites[index]) throw new Error('WordPress site is not configured');
  return { site: sites[index], index };
}

function findStoredDraft(
  data: StoredWordPressData,
  draftId?: string,
): { draft: StoredWordPressDraft; index: number } | null {
  const drafts = data.drafts || [];
  if (!draftId) return drafts.length > 0 ? { draft: drafts[drafts.length - 1], index: drafts.length - 1 } : null;
  const index = drafts.findIndex((draft) => compactText(draft.id) === draftId);
  return index >= 0 && drafts[index] ? { draft: drafts[index], index } : null;
}

function numberCategoryIds(...values: Array<unknown>): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const rawValues = Array.isArray(value) ? value : [value];
    for (const raw of rawValues) {
      const numeric = Number(compactText(raw));
      if (!Number.isInteger(numeric) || numeric <= 0 || seen.has(numeric)) continue;
      seen.add(numeric);
      ids.push(numeric);
    }
  }
  return ids;
}

function sanitizeSite(site: StoredWordPressSite, index: number, now: Date): MobileWordPressSiteItem {
  const siteUrl = normalizeSiteUrl(site.siteUrl || `https://wordpress-site-${index + 1}.invalid`);
  const username = compactText(site.username);
  const updatedAt = site.updatedAt || now.toISOString();
  const defaultCategoryId = site.defaultCategoryId === undefined || site.defaultCategoryId === null
    ? null
    : compactText(site.defaultCategoryId);
  const defaultCategoryName = site.defaultCategoryName ? compactText(site.defaultCategoryName) : null;

  return {
    id: compactText(site.id) || siteIdFrom(siteUrl, username),
    label: compactText(site.label) || new URL(siteUrl).host,
    siteUrl,
    usernameMasked: maskUsername(username),
    hasApplicationPassword: !!compactText(site.applicationPassword),
    defaultCategoryId,
    defaultCategoryName,
    categories: normalizeCategories(site.categories),
    source: site.source === 'mobile-api' ? 'mobile-api' : 'pc-json',
    updatedAt,
  };
}

function sanitizeDraft(draft: StoredWordPressDraft, index: number, now: Date): MobileWordPressDraftItem {
  const createdAt = draft.createdAt || draft.updatedAt || now.toISOString();
  const updatedAt = draft.updatedAt || createdAt;
  const content = String(draft.content || '');
  const title = compactText(draft.title) || `워드프레스 초안 ${index + 1}`;

  return {
    id: compactText(draft.id) || draftIdFrom(compactText(draft.siteId), title, createdAt),
    siteId: compactText(draft.siteId),
    title,
    keyword: compactText(draft.keyword),
    status: compactText(draft.status) || 'draft',
    categoryId: draft.categoryId === undefined || draft.categoryId === null ? null : compactText(draft.categoryId),
    categoryName: draft.categoryName ? compactText(draft.categoryName) : null,
    tags: normalizeTags(draft.tags),
    scheduleDateTime: draft.scheduleDateTime ? compactText(draft.scheduleDateTime) : null,
    contentLength: content.length,
    preview: compactText(draft.excerpt || content).slice(0, 160),
    source: draft.source === 'pc-json' ? 'pc-json' : 'mobile-api',
    wpPostId: draft.wpPostId === undefined || draft.wpPostId === null ? undefined : compactText(draft.wpPostId),
    wpPostUrl: draft.wpPostUrl ? compactText(draft.wpPostUrl) : undefined,
    publishedAt: draft.publishedAt ? compactText(draft.publishedAt) : null,
    createdAt,
    updatedAt,
  };
}

function toStoredSite(site: MobileWordPressSiteInput, current: StoredWordPressSite | null, now: Date): StoredWordPressSite {
  const siteUrl = normalizeSiteUrl(site.siteUrl || current?.siteUrl);
  const username = compactText(site.username ?? current?.username);
  const id = compactText(site.id || current?.id) || siteIdFrom(siteUrl, username);
  const applicationPassword = site.applicationPassword === undefined
    ? compactText(current?.applicationPassword)
    : compactText(site.applicationPassword);

  return {
    id,
    label: compactText(site.label || current?.label) || new URL(siteUrl).host,
    siteUrl,
    username,
    applicationPassword,
    defaultCategoryId: site.defaultCategoryId ?? current?.defaultCategoryId ?? null,
    defaultCategoryName: compactText(site.defaultCategoryName ?? current?.defaultCategoryName) || null,
    categories: site.categories !== undefined ? normalizeCategories(site.categories) : normalizeCategories(current?.categories),
    source: 'mobile-api',
    updatedAt: now.toISOString(),
  };
}

function toStoredDraft(
  input: MobileWordPressDraftInput,
  site: MobileWordPressSiteItem,
  now: Date,
): StoredWordPressDraft {
  const title = compactText(input.title);
  if (!title) throw new Error('WordPress draft title is required');
  const createdAt = now.toISOString();
  const content = String(input.content || '').trim();

  return {
    id: draftIdFrom(site.id, title, createdAt),
    siteId: site.id,
    title,
    keyword: compactText(input.keyword),
    content,
    excerpt: compactText(input.excerpt || content).slice(0, 300),
    categoryId: input.categoryId ?? site.defaultCategoryId ?? null,
    categoryName: compactText(input.categoryName || site.defaultCategoryName) || null,
    tags: normalizeTags(input.tags),
    status: compactText(input.status) || 'draft',
    scheduleDateTime: input.scheduleDateTime ? compactText(input.scheduleDateTime) : null,
    source: 'mobile-api',
    wpPostId: null,
    wpPostUrl: null,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function readMobileWordPressSnapshot(
  options: WordPressPublishingOptions = {},
): MobileWordPressSnapshot {
  const filePath = resolveWordPressPublishingFile(options.filePath);
  const now = options.now?.() || new Date();
  const data = readData(filePath);
  const sites = (data.sites || []).map((site, index) => sanitizeSite(site, index, now));
  const drafts = (data.drafts || []).map((draft, index) => sanitizeDraft(draft, index, now));

  return {
    updatedAt: now.toISOString(),
    storage: 'pc-wordpress-publishing-json',
    configured: sites.some((site) => !!site.siteUrl && site.hasApplicationPassword),
    sites: {
      total: sites.length,
      items: sites,
    },
    drafts: {
      total: drafts.length,
      items: drafts,
    },
  };
}

export function upsertMobileWordPressSite(options: UpsertWordPressSiteOptions): {
  site: MobileWordPressSiteItem;
  snapshot: MobileWordPressSnapshot;
} {
  const filePath = resolveWordPressPublishingFile(options.filePath);
  const now = options.now?.() || new Date();
  const data = readData(filePath);
  const sites = data.sites || [];
  const nextSiteUrl = normalizeSiteUrl(options.input.siteUrl);
  const nextUsername = compactText(options.input.username);
  const explicitId = compactText(options.input.id);
  const index = sites.findIndex((site) => {
    const currentUrl = site.siteUrl ? normalizeSiteUrl(site.siteUrl) : '';
    const currentUsername = compactText(site.username);
    return (!!explicitId && site.id === explicitId)
      || (currentUrl === nextSiteUrl && currentUsername === nextUsername);
  });
  const stored = toStoredSite(options.input, index >= 0 ? sites[index] : null, now);
  if (index >= 0) sites[index] = stored;
  else sites.push(stored);

  writeData(filePath, { ...data, sites });
  const snapshot = readMobileWordPressSnapshot({ filePath, now: () => now });
  return {
    site: snapshot.sites.items.find((item) => item.id === stored.id) || sanitizeSite(stored, 0, now),
    snapshot,
  };
}

export function createMobileWordPressDraft(options: CreateWordPressDraftOptions): {
  draft: MobileWordPressDraftItem;
  snapshot: MobileWordPressSnapshot;
} {
  const filePath = resolveWordPressPublishingFile(options.filePath);
  const now = options.now?.() || new Date();
  const data = readData(filePath);
  const snapshot = readMobileWordPressSnapshot({ filePath, now: () => now });
  const site = options.input.siteId
    ? snapshot.sites.items.find((item) => item.id === options.input.siteId)
    : snapshot.sites.items[0];

  if (!site) throw new Error('WordPress site is not configured');

  const drafts = data.drafts || [];
  const stored = toStoredDraft(options.input, site, now);
  drafts.push(stored);
  writeData(filePath, { ...data, drafts });
  const nextSnapshot = readMobileWordPressSnapshot({ filePath, now: () => now });

  return {
    draft: nextSnapshot.drafts.items.find((item) => item.id === stored.id) || sanitizeDraft(stored, 0, now),
    snapshot: nextSnapshot,
  };
}

export async function refreshMobileWordPressCategories(
  options: RefreshWordPressCategoriesOptions = {},
): Promise<{
  site: MobileWordPressSiteItem;
  categories: MobileWordPressCategory[];
  snapshot: MobileWordPressSnapshot;
}> {
  const filePath = resolveWordPressPublishingFile(options.filePath);
  const now = options.now?.() || new Date();
  const data = readData(filePath);
  const { site, index } = findStoredSite(data, options.siteId);
  const siteUrl = normalizeSiteUrl(site.siteUrl);
  const fetcher = options.fetchImpl || fetch;
  const response = await fetcher(`${restBase(siteUrl)}/categories?per_page=100&hide_empty=false`, {
    method: 'GET',
    headers: {
      Authorization: authHeader(site),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`WordPress categories request failed: ${response.status}`);
  }

  const parsed = await response.json();
  const categories = normalizeCategories(parsed);
  const sites = data.sites || [];
  sites[index] = {
    ...site,
    siteUrl,
    categories,
    defaultCategoryId: site.defaultCategoryId || categories[0]?.id || null,
    defaultCategoryName: site.defaultCategoryName || categories[0]?.name || null,
    updatedAt: now.toISOString(),
  };
  writeData(filePath, { ...data, sites });
  const snapshot = readMobileWordPressSnapshot({ filePath, now: () => now });
  const sanitized = snapshot.sites.items.find((item) => item.id === compactText(sites[index].id))
    || sanitizeSite(sites[index], index, now);

  return {
    site: sanitized,
    categories,
    snapshot,
  };
}

export async function publishMobileWordPressDraft(
  options: PublishWordPressDraftOptions,
): Promise<{
  result: MobileWordPressPublishResult;
  draft: MobileWordPressDraftItem;
  snapshot: MobileWordPressSnapshot;
}> {
  const filePath = resolveWordPressPublishingFile(options.filePath);
  const now = options.now?.() || new Date();
  const data = readData(filePath);
  const drafts = data.drafts || [];
  const foundDraft = findStoredDraft(data, options.input.draftId);
  const siteId = options.input.siteId || foundDraft?.draft.siteId;
  const { site } = findStoredSite(data, siteId);
  const sanitizedSite = sanitizeSite(site, 0, now);
  const createdAt = now.toISOString();
  const draft = foundDraft?.draft || toStoredDraft({
    siteId: sanitizedSite.id,
    title: options.input.title || '',
    keyword: options.input.keyword,
    content: options.input.content,
    excerpt: options.input.excerpt,
    categoryId: options.input.categoryId,
    categoryName: options.input.categoryName,
    tags: options.input.tags,
    status: options.input.status || 'draft',
    scheduleDateTime: options.input.scheduleDateTime,
  }, sanitizedSite, now);
  const draftIndex = foundDraft?.index ?? drafts.length;
  if (!foundDraft) drafts.push(draft);

  const title = compactText(options.input.title || draft.title);
  const content = String(options.input.content ?? draft.content ?? '').trim();
  if (!title) throw new Error('WordPress post title is required');
  if (!content) throw new Error('WordPress post content is required');

  const status = compactText(options.input.status || draft.status || 'draft') || 'draft';
  const categoryIds = numberCategoryIds(options.input.categoryId, draft.categoryId, site.defaultCategoryId);
  const postBody: Record<string, unknown> = {
    title,
    content,
    status,
  };
  if (categoryIds.length > 0) postBody.categories = categoryIds;
  const scheduleDateTime = options.input.scheduleDateTime || draft.scheduleDateTime;
  if (status === 'future' && scheduleDateTime) postBody.date = scheduleDateTime;

  const fetcher = options.fetchImpl || fetch;
  const response = await fetcher(`${restBase(sanitizedSite.siteUrl)}/posts`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(site),
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    throw new Error(`WordPress publish request failed: ${response.status}`);
  }

  const parsed = await response.json();
  const postId = compactText(parsed?.id);
  const postUrl = compactText(parsed?.link || parsed?.guid?.rendered || '');
  const wpStatus = compactText(parsed?.status || status);
  const updatedDraft: StoredWordPressDraft = {
    ...draft,
    siteId: sanitizedSite.id,
    title,
    content,
    categoryId: options.input.categoryId ?? draft.categoryId ?? site.defaultCategoryId ?? null,
    categoryName: compactText(options.input.categoryName || draft.categoryName || site.defaultCategoryName) || null,
    status: `wp-${wpStatus}`,
    wpPostId: postId,
    wpPostUrl: postUrl,
    publishedAt: createdAt,
    updatedAt: createdAt,
  };
  drafts[draftIndex] = updatedDraft;
  writeData(filePath, { ...data, drafts });
  const snapshot = readMobileWordPressSnapshot({ filePath, now: () => now });
  const sanitizedDraft = snapshot.drafts.items.find((item) => item.id === compactText(updatedDraft.id))
    || sanitizeDraft(updatedDraft, draftIndex, now);

  return {
    result: {
      siteId: sanitizedSite.id,
      draftId: sanitizedDraft.id,
      postId,
      postUrl,
      status: wpStatus,
      title,
      categoryIds: categoryIds.map(String),
      createdAt,
    },
    draft: sanitizedDraft,
    snapshot,
  };
}
