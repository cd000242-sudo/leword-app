/**
 * 네이버 블로그 API 유틸리티
 * 블로그 문서 수 조회 등 블로그 관련 API 기능
 * 🔥 다중 소스를 통한 정확한 문서수 조회
 */

import { EnvironmentManager } from './environment-manager';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const NAVER_BLOG_OPENAPI_QUOTA_COOLDOWN_MS = 5 * 60 * 1000;
const NAVER_BLOG_OPENAPI_RATE_LIMIT_BACKOFF_MS = 2_500;
const NAVER_BLOG_OPENAPI_STATE_SCHEMA = 1;
const NAVER_BLOG_DOCUMENT_COUNT_CACHE_SCHEMA = 1;
const NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let legacyNaverBlogOpenApiQuotaBlockedUntil = 0;
let naverBlogOpenApiRotationCursor = 0;
let quotaStateLoaded = false;
let quotaStateDirty = false;
let naverBlogOpenApiNextAllowedAtMs = 0;
const naverBlogOpenApiQuotaBlockedUntilByKey = new Map<string, number>();
let documentCountCacheLoaded = false;
let documentCountCacheDirty = false;
const naverBlogDocumentCountCache = new Map<string, {
  total: number;
  measuredAtMs: number;
}>();

export interface NaverBlogOpenApiCredential {
  clientId: string;
  clientSecret: string;
  label: string;
}

interface NaverBlogOpenApiFallbackConfig {
  clientId?: string;
  clientSecret?: string;
  env?: Record<string, string | undefined>;
}

export function isNaverBlogOpenApiQuotaBlocked(
  fallback?: NaverBlogOpenApiFallbackConfig,
  nowMs = Date.now(),
): boolean {
  loadNaverBlogOpenApiQuotaState();
  if (nowMs < legacyNaverBlogOpenApiQuotaBlockedUntil) return true;
  const credentials = getNaverBlogOpenApiCredentials(fallback);
  if (credentials.length === 0) return false;
  return !credentials.some((credential) => !isCredentialQuotaBlocked(credential, nowMs));
}

export function getNaverBlogOpenApiQuotaBlockedUntil(
  fallback?: NaverBlogOpenApiFallbackConfig,
  nowMs = Date.now(),
): number | null {
  loadNaverBlogOpenApiQuotaState();
  const credentials = getNaverBlogOpenApiCredentials(fallback);
  const candidateUntilValues = credentials
    .map((credential) => naverBlogOpenApiQuotaBlockedUntilByKey.get(credentialStateKey(credential)) || 0)
    .filter((until) => until > nowMs);
  const legacyUntil = legacyNaverBlogOpenApiQuotaBlockedUntil > nowMs
    ? legacyNaverBlogOpenApiQuotaBlockedUntil
    : 0;
  const values = [
    legacyUntil,
    ...(credentials.length > 0 && candidateUntilValues.length === credentials.length ? candidateUntilValues : []),
  ].filter((until) => until > nowMs);
  return values.length > 0 ? Math.max(...values) : null;
}

export function markNaverBlogOpenApiQuotaBlocked(
  credential?: NaverBlogOpenApiCredential | null,
  nowMs = Date.now(),
): void {
  loadNaverBlogOpenApiQuotaState();
  const blockedUntil = quotaBlockedUntilMs(nowMs);
  if (credential) {
    const key = credentialStateKey(credential);
    const until = Math.max(
      naverBlogOpenApiQuotaBlockedUntilByKey.get(key) || 0,
      blockedUntil,
    );
    naverBlogOpenApiQuotaBlockedUntilByKey.set(key, until);
  } else {
    legacyNaverBlogOpenApiQuotaBlockedUntil = Math.max(
      legacyNaverBlogOpenApiQuotaBlockedUntil,
      blockedUntil,
    );
  }
  quotaStateDirty = true;
  saveNaverBlogOpenApiQuotaState();
}

function quotaBlockedUntilMs(nowMs: number): number {
  return nowMs + NAVER_BLOG_OPENAPI_QUOTA_COOLDOWN_MS;
}

export function selectNaverBlogOpenApiCredential(
  fallback?: NaverBlogOpenApiFallbackConfig,
  nowMs = Date.now(),
): NaverBlogOpenApiCredential | null {
  loadNaverBlogOpenApiQuotaState();
  if (nowMs < legacyNaverBlogOpenApiQuotaBlockedUntil) return null;
  const credentials = getNaverBlogOpenApiCredentials(fallback);
  if (credentials.length === 0) return null;

  for (let offset = 0; offset < credentials.length; offset++) {
    const index = (naverBlogOpenApiRotationCursor + offset) % credentials.length;
    const credential = credentials[index];
    if (isCredentialQuotaBlocked(credential, nowMs)) continue;
    naverBlogOpenApiRotationCursor = (index + 1) % credentials.length;
    return credential;
  }
  return null;
}

export function getNaverBlogOpenApiCredentials(
  fallback?: NaverBlogOpenApiFallbackConfig,
): NaverBlogOpenApiCredential[] {
  const env = fallback?.env || process.env;
  const candidates = [
    ...parseJsonOrPairPool(env['NAVER_OPENAPI_KEY_POOL'] || ''),
    ...parseJsonOrPairPool(env['NAVER_CLIENT_KEY_POOL'] || ''),
    ...zipCredentialPool(
      env['NAVER_CLIENT_ID_POOL'] || '',
      env['NAVER_CLIENT_SECRET_POOL'] || '',
      'env-pool',
    ),
  ];
  const singleClientId = normalizeCredentialPart(fallback?.clientId)
    || normalizeCredentialPart(env['NAVER_CLIENT_ID']);
  const singleClientSecret = normalizeCredentialPart(fallback?.clientSecret)
    || normalizeCredentialPart(env['NAVER_CLIENT_SECRET']);
  if (singleClientId && singleClientSecret) {
    candidates.push({
      clientId: singleClientId,
      clientSecret: singleClientSecret,
      label: 'primary',
    });
  }

  const seen = new Set<string>();
  const out: NaverBlogOpenApiCredential[] = [];
  for (const credential of candidates) {
    const clientId = normalizeCredentialPart(credential.clientId);
    const clientSecret = normalizeCredentialPart(credential.clientSecret);
    if (!clientId || !clientSecret) continue;
    const key = `${clientId}\n${clientSecret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      clientId,
      clientSecret,
      label: credential.label || `key-${out.length + 1}`,
    });
  }
  return out;
}

function normalizeCredentialPart(value: unknown): string {
  return String(value || '').trim();
}

function splitCredentialPool(value: string): string[] {
  return String(value || '')
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonOrPairPool(value: string): NaverBlogOpenApiCredential[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.keys)
          ? parsed.keys
          : Array.isArray(parsed.credentials)
            ? parsed.credentials
            : [];
      return rows.map((item: any, index: number) => ({
        clientId: normalizeCredentialPart(item?.clientId || item?.id || item?.NAVER_CLIENT_ID),
        clientSecret: normalizeCredentialPart(item?.clientSecret || item?.secret || item?.NAVER_CLIENT_SECRET),
        label: normalizeCredentialPart(item?.label || item?.name) || `pool-${index + 1}`,
      }));
    } catch {
      // Fall through to compact pair parsing.
    }
  }

  return splitCredentialPool(raw).map((item, index) => {
    const separator = item.includes('|') ? '|' : ':';
    const [clientId, ...secretParts] = item.split(separator);
    return {
      clientId: normalizeCredentialPart(clientId),
      clientSecret: normalizeCredentialPart(secretParts.join(separator)),
      label: `pool-${index + 1}`,
    };
  });
}

function zipCredentialPool(
  clientIds: string,
  clientSecrets: string,
  labelPrefix: string,
): NaverBlogOpenApiCredential[] {
  const ids = splitCredentialPool(clientIds);
  const secrets = splitCredentialPool(clientSecrets);
  const count = Math.min(ids.length, secrets.length);
  return Array.from({ length: count }, (_, index) => ({
    clientId: ids[index],
    clientSecret: secrets[index],
    label: `${labelPrefix}-${index + 1}`,
  }));
}

function credentialStateKey(credential: NaverBlogOpenApiCredential): string {
  return crypto
    .createHash('sha256')
    .update(`${credential.clientId}\n${credential.clientSecret}`)
    .digest('hex');
}

function isCredentialQuotaBlocked(credential: NaverBlogOpenApiCredential, nowMs: number): boolean {
  const until = naverBlogOpenApiQuotaBlockedUntilByKey.get(credentialStateKey(credential)) || 0;
  return nowMs < until;
}

function quotaStateFile(): string {
  const explicit = process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'];
  if (explicit) return explicit;
  const dataDir = process.env['LEWORD_SERVER_USER_DATA']
    || process.env['LEWORD_MOBILE_DATA_DIR']
    || process.env['LEWORD_MOBILE_CACHE_DIR']
    || (fs.existsSync('/data') ? '/data' : '')
    || path.join(os.tmpdir(), 'leword');
  return path.join(dataDir, 'naver-openapi-quota-state.json');
}

function loadNaverBlogOpenApiQuotaState(): void {
  if (quotaStateLoaded) return;
  quotaStateLoaded = true;
  const file = quotaStateFile();
  try {
    if (!fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schemaVersion !== NAVER_BLOG_OPENAPI_STATE_SCHEMA) return;
    const nowMs = Date.now();
    const savedAtMs = Date.parse(String(parsed.savedAt || '')) || 0;
    if (savedAtMs > 0 && nowMs - savedAtMs > NAVER_BLOG_OPENAPI_QUOTA_COOLDOWN_MS) {
      quotaStateDirty = true;
      saveNaverBlogOpenApiQuotaState();
      return;
    }
    legacyNaverBlogOpenApiQuotaBlockedUntil = Number(parsed.legacyBlockedUntil || 0) || 0;
    for (const [key, value] of Object.entries(parsed.blockedUntilByKey || {})) {
      const until = Number(value || 0);
      if (until > nowMs) naverBlogOpenApiQuotaBlockedUntilByKey.set(key, until);
    }
  } catch {
    // Quota state is only a throttle optimization.
  }
}

function saveNaverBlogOpenApiQuotaState(): void {
  if (!quotaStateDirty) return;
  quotaStateDirty = false;
  const file = quotaStateFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const nowMs = Date.now();
    const blockedUntilByKey: Record<string, number> = {};
    for (const [key, until] of naverBlogOpenApiQuotaBlockedUntilByKey.entries()) {
      if (until > nowMs) blockedUntilByKey[key] = until;
    }
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: NAVER_BLOG_OPENAPI_STATE_SCHEMA,
      savedAt: new Date(nowMs).toISOString(),
      legacyBlockedUntil: legacyNaverBlogOpenApiQuotaBlockedUntil > nowMs
        ? legacyNaverBlogOpenApiQuotaBlockedUntil
        : 0,
      blockedUntilByKey,
    }, null, 2), 'utf8');
  } catch {
    // Runtime still works without persisted throttle state.
  }
}

export function isNaverBlogOpenApiQuotaExceededText(text: string): boolean {
  const clean = String(text || '');
  if (isNaverBlogOpenApiRateLimitedText(clean)) return false;
  return /quota exceeded|daily quota|query quota|쿼리 한도|일일 한도|count\/quota|errorCode["']?\s*:\s*["']?010/i.test(clean);
}

export function isNaverBlogOpenApiRateLimitedText(text: string): boolean {
  return /Rate limit exceeded|속도 제한|too many requests|errorCode["']?\s*:\s*["']?012/i.test(String(text || ''));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitForNaverBlogOpenApiRateLimit(nowMs = Date.now()): Promise<void> {
  const waitMs = naverBlogOpenApiNextAllowedAtMs - nowMs;
  if (waitMs > 0) await sleep(waitMs);
}

function markNaverBlogOpenApiRateLimited(nowMs = Date.now()): void {
  naverBlogOpenApiNextAllowedAtMs = Math.max(
    naverBlogOpenApiNextAllowedAtMs,
    nowMs + NAVER_BLOG_OPENAPI_RATE_LIMIT_BACKOFF_MS,
  );
}

function documentCountCacheKey(keyword: string): string {
  return String(keyword || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function documentCountCacheFile(): string {
  const explicit = process.env['LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE'];
  if (explicit) return explicit;
  const dataDir = process.env['LEWORD_SERVER_USER_DATA']
    || process.env['LEWORD_MOBILE_DATA_DIR']
    || process.env['LEWORD_MOBILE_CACHE_DIR']
    || (fs.existsSync('/data') ? '/data' : '')
    || path.join(os.tmpdir(), 'leword');
  return path.join(dataDir, 'naver-document-count-cache.json');
}

function loadNaverBlogDocumentCountCache(): void {
  if (documentCountCacheLoaded) return;
  documentCountCacheLoaded = true;
  const file = documentCountCacheFile();
  try {
    if (!fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schemaVersion !== NAVER_BLOG_DOCUMENT_COUNT_CACHE_SCHEMA) return;
    const nowMs = Date.now();
    for (const entry of parsed.entries || []) {
      const key = documentCountCacheKey(entry?.keyword);
      const total = Number(entry?.total);
      const measuredAtMs = Number(entry?.measuredAtMs || Date.parse(entry?.measuredAt || ''));
      if (!key || !Number.isFinite(total) || total < 0 || !Number.isFinite(measuredAtMs)) continue;
      if (nowMs - measuredAtMs > NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS) continue;
      naverBlogDocumentCountCache.set(key, { total, measuredAtMs });
    }
  } catch {
    naverBlogDocumentCountCache.clear();
  }
}

function saveNaverBlogDocumentCountCache(): void {
  if (!documentCountCacheDirty) return;
  documentCountCacheDirty = false;
  const file = documentCountCacheFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const nowMs = Date.now();
    const entries = [...naverBlogDocumentCountCache.entries()]
      .filter(([, entry]) => nowMs - entry.measuredAtMs <= NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS)
      .map(([keyword, entry]) => ({
        keyword,
        total: entry.total,
        measuredAtMs: entry.measuredAtMs,
        measuredAt: new Date(entry.measuredAtMs).toISOString(),
      }));
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: NAVER_BLOG_DOCUMENT_COUNT_CACHE_SCHEMA,
      savedAt: new Date(nowMs).toISOString(),
      ttlMs: NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS,
      entries,
    }, null, 2), 'utf8');
  } catch {
    // Document count cache is a quota optimization only.
  }
}

function getCachedNaverBlogDocumentCount(keyword: string, nowMs = Date.now()): number | null {
  loadNaverBlogDocumentCountCache();
  const key = documentCountCacheKey(keyword);
  const cached = key ? naverBlogDocumentCountCache.get(key) : undefined;
  if (!cached) return null;
  if (nowMs - cached.measuredAtMs > NAVER_BLOG_DOCUMENT_COUNT_CACHE_TTL_MS) {
    naverBlogDocumentCountCache.delete(key);
    documentCountCacheDirty = true;
    saveNaverBlogDocumentCountCache();
    return null;
  }
  return cached.total;
}

/**
 * Read-only cache hint for quota-aware candidate ordering. Callers must never
 * treat this value as publication evidence; the normal measurement path still
 * owns provenance and freshness checks.
 */
export function peekCachedNaverBlogDocumentCount(
  keyword: string,
  nowMs = Date.now(),
): number | null {
  return getCachedNaverBlogDocumentCount(keyword, nowMs);
}

function setCachedNaverBlogDocumentCount(keyword: string, total: number, nowMs = Date.now()): void {
  const key = documentCountCacheKey(keyword);
  if (!key || !Number.isFinite(total) || total < 0) return;
  loadNaverBlogDocumentCountCache();
  naverBlogDocumentCountCache.set(key, { total, measuredAtMs: nowMs });
  documentCountCacheDirty = true;
  saveNaverBlogDocumentCountCache();
}

/**
 * 네이버 블로그 검색 API를 통해 키워드의 문서 수를 조회합니다.
 * 🔥 네이버 개발자 API만 사용 (가장 정확!)
 * @param keyword 검색할 키워드
 * @returns 블로그 문서 수
 */
export async function getNaverBlogDocumentCount(keyword: string): Promise<number | null> {
  try {
    const cached = getCachedNaverBlogDocumentCount(keyword);
    if (cached !== null) {
      console.log(`[NAVER-BLOG-API] cache hit: "${keyword}" = ${cached.toLocaleString()}`);
      return cached;
    }

    const envManager = EnvironmentManager.getInstance();
    const config = envManager.getConfig();
    
    const credential = selectNaverBlogOpenApiCredential({
      clientId: config.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
      clientSecret: config.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
    });
    
    console.log(`[NAVER-BLOG-API] document count lookup: "${keyword}" (${credential?.label || 'no-key'})`);
    
    if (!credential) {
      if (isNaverBlogOpenApiQuotaBlocked({
        clientId: config.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
        clientSecret: config.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
      })) {
        console.warn(`[NAVER-BLOG-API] OpenAPI key pool quota cooldown active, skip document lookup: "${keyword}"`);
      } else {
        console.error(`[NAVER-BLOG-API] ❌ API 키가 설정되지 않았습니다!`);
      }
      return null;
    }
    
    const encodedKeyword = encodeURIComponent(keyword);
    const apiUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodedKeyword}&display=1`;
    
    console.log(`[NAVER-BLOG-API] API 호출: ${apiUrl}`);
    
    await waitForNaverBlogOpenApiRateLimit();
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': credential.clientId,
        'X-Naver-Client-Secret': credential.clientSecret
      }
    });
    
    console.log(`[NAVER-BLOG-API] 응답 상태: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NAVER-BLOG-API] ❌ API 호출 실패 (${response.status})`);
      console.error(`[NAVER-BLOG-API] 오류 내용: ${errorText}`);
      if (response.status === 429 && isNaverBlogOpenApiRateLimitedText(errorText)) {
        markNaverBlogOpenApiRateLimited();
      } else if (response.status === 429 || isNaverBlogOpenApiQuotaExceededText(errorText)) {
        markNaverBlogOpenApiQuotaBlocked(credential);
      }
      return null;
    }
    
    const data = await response.json() as { total?: number; lastBuildDate?: string; items?: any[] };
    
    if (data.total !== undefined && data.total >= 0) {
      console.log(`[NAVER-BLOG-API] ✅ API 문서수: "${keyword}" = ${data.total.toLocaleString()}개`);
      setCachedNaverBlogDocumentCount(keyword, data.total);
      return data.total;
    } else {
      console.warn(`[NAVER-BLOG-API] ⚠️ total 필드 없음:`, data);
      return null;
    }
    
  } catch (error) {
    console.error('[NAVER-BLOG-API] ❌ 문서 수 조회 오류:', error);
    return null;
  }
}


/**
 * 여러 키워드의 문서 수를 배치로 조회합니다.
 * @param keywords 검색할 키워드 배열
 * @param delay 요청 간 딜레이 (ms)
 * @returns 키워드별 문서 수 맵
 */
export async function getNaverBlogDocumentCounts(
  keywords: string[],
  delay: number = 100
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  
  for (const keyword of keywords) {
    try {
      const count = await getNaverBlogDocumentCount(keyword);
      results.set(keyword, count);
      
      // Rate limit 방지
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (e) {
      results.set(keyword, null);
    }
  }
  
  return results;
}
