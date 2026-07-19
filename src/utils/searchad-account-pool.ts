import type { NaverSearchAdConfig } from './naver-searchad-api';
import * as fs from 'fs';
import {
  searchAdAccountId,
  searchAdCallsToday,
  searchAdDailyLimit,
  searchAdEffectiveCeiling,
  searchAdSoftCeiling,
} from './searchad-quota-governor';

export interface SearchAdAccountPoolOptions {
  softCeiling?: number;
  dailyLimit?: number;
  callsFor?: (account: NaverSearchAdConfig) => number;
}

export interface SearchAdAccountPoolSummary {
  exhausted: boolean;
  calls: number;
  remaining: number;
  softCeiling: number;
  dailyLimit: number;
  accountCount: number;
  availableAccountCount: number;
  accounts: Array<{
    customerIdMasked: string;
    customerIdLast4: string;
    calls: number;
    remaining: number;
    exhausted: boolean;
  }>;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedAccount(value: unknown, requireCustomerId = true): NaverSearchAdConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const accessLicense = clean(raw.accessLicense);
  const secretKey = clean(raw.secretKey);
  const customerId = clean(raw.customerId);
  if (
    !accessLicense
    || !secretKey
    || (requireCustomerId && (
      accessLicense.length < 20
      || secretKey.length < 20
      || !/^\d{4,20}$/.test(customerId)
    ))
  ) {
    return null;
  }
  return customerId ? { accessLicense, secretKey, customerId } : { accessLicense, secretKey };
}

function parseExtraAccountsJson(value: string): NaverSearchAdConfig[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizedAccount(item))
      .filter((item): item is NaverSearchAdConfig => Boolean(item));
  } catch {
    return [];
  }
}

function decodeExtraAccounts(encoded: string): NaverSearchAdConfig[] {
  const value = clean(encoded);
  if (!value) return [];
  try {
    return parseExtraAccountsJson(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return [];
  }
}

function loadExtraAccountsFromEnvironment(): NaverSearchAdConfig[] {
  const file = clean(process.env['LEWORD_SEARCHAD_ACCOUNTS_FILE']);
  if (file) {
    try {
      if (fs.existsSync(file)) return parseExtraAccountsJson(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }
  return decodeExtraAccounts(process.env['LEWORD_SEARCHAD_ACCOUNTS_B64'] || '');
}

export function buildSearchAdAccountPool(
  primary: NaverSearchAdConfig,
  encodedExtras?: string,
): NaverSearchAdConfig[] {
  const extras = encodedExtras === undefined
    ? loadExtraAccountsFromEnvironment()
    : decodeExtraAccounts(encodedExtras);
  const candidates = [normalizedAccount(primary, false), ...extras]
    .filter((item): item is NaverSearchAdConfig => Boolean(item));
  const seen = new Set<string>();
  return candidates.filter((account) => {
    const key = clean(account.customerId) || searchAdAccountId(account);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function callsForAccount(
  account: NaverSearchAdConfig,
  options: SearchAdAccountPoolOptions,
): number {
  const value = options.callsFor
    ? options.callsFor(account)
    : searchAdCallsToday(searchAdAccountId(account));
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function selectSearchAdAccount(
  accounts: readonly NaverSearchAdConfig[],
  options: SearchAdAccountPoolOptions = {},
): NaverSearchAdConfig | null {
  const softCeiling = searchAdEffectiveCeiling(options.softCeiling ?? searchAdSoftCeiling());
  let selected: NaverSearchAdConfig | null = null;
  let selectedRemaining = -1;
  for (const account of accounts) {
    const remaining = Math.max(0, softCeiling - callsForAccount(account, options));
    if (remaining > selectedRemaining) {
      selected = remaining > 0 ? account : null;
      selectedRemaining = remaining;
    }
  }
  return selected;
}

export function selectSearchAdAccountFromEnv(primary: NaverSearchAdConfig): NaverSearchAdConfig | null {
  return selectSearchAdAccount(buildSearchAdAccountPool(primary));
}

export function maskSearchAdCustomerId(customerId: string): string {
  const cleanId = clean(customerId);
  if (!cleanId) return '***';
  return `***${cleanId.slice(-4)}`;
}

export function summarizeSearchAdAccountPool(
  accounts: readonly NaverSearchAdConfig[],
  options: SearchAdAccountPoolOptions = {},
): SearchAdAccountPoolSummary {
  const perAccountSoftCeiling = searchAdEffectiveCeiling(options.softCeiling ?? searchAdSoftCeiling());
  const perAccountDailyLimit = searchAdEffectiveCeiling(options.dailyLimit ?? searchAdDailyLimit());
  const rows = accounts.map((account) => {
    const calls = callsForAccount(account, options);
    const remaining = Math.max(0, perAccountSoftCeiling - calls);
    const customerId = clean(account.customerId);
    return {
      customerIdMasked: maskSearchAdCustomerId(customerId),
      customerIdLast4: customerId.slice(-4),
      calls,
      remaining,
      exhausted: remaining <= 0,
    };
  });
  const calls = rows.reduce((sum, item) => sum + item.calls, 0);
  const remaining = rows.reduce((sum, item) => sum + item.remaining, 0);
  return {
    exhausted: rows.length === 0 || remaining <= 0,
    calls,
    remaining,
    softCeiling: perAccountSoftCeiling * rows.length,
    dailyLimit: perAccountDailyLimit * rows.length,
    accountCount: rows.length,
    availableAccountCount: rows.filter((item) => !item.exhausted).length,
    accounts: rows,
  };
}

export function summarizeSearchAdAccountPoolFromEnv(
  primary: NaverSearchAdConfig,
): SearchAdAccountPoolSummary {
  return summarizeSearchAdAccountPool(buildSearchAdAccountPool(primary));
}
