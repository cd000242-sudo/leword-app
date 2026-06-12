import * as fs from 'fs';
import {
  type MobileKeywordProduct,
} from './contracts';

export type MobileEntitlementTier = 'standard' | 'pro' | 'unlimited' | 'admin';

export interface MobileEntitlement {
  subjectId: string;
  tier: MobileEntitlementTier;
  source: 'env-static-token' | 'entitlement-file' | 'license-service' | 'fixture';
  expiresAt?: string | null;
}

export interface MobileEntitlementVerification {
  ok: boolean;
  entitlement?: MobileEntitlement;
  reason?: string;
}

export type MobileEntitlementVerifier = (
  token: string,
) => Promise<MobileEntitlementVerification> | MobileEntitlementVerification;

export interface EnvironmentMobileEntitlementVerifierOptions {
  staticToken?: string | null;
  entitlementFile?: string | null;
  entitlementUrl?: string | null;
  timeoutMs?: number;
}

export interface HttpMobileEntitlementVerifierOptions {
  url: string;
  timeoutMs?: number;
}

const TIER_POWER: Record<MobileEntitlementTier, number> = {
  standard: 10,
  pro: 20,
  unlimited: 30,
  admin: 40,
};

const PRODUCT_MIN_TIER: Record<MobileKeywordProduct, MobileEntitlementTier> = {
  'golden-discovery': 'standard',
  'keyword-analysis': 'standard',
  'mindmap-expansion': 'standard',
  'pro-traffic-hunter': 'pro',
  'home-board-hunter': 'pro',
  'kin-hidden-honey': 'pro',
  'shopping-connect': 'pro',
  'youtube-golden': 'pro',
  'naver-mate-hunter': 'pro',
};

interface EntitlementFileEntry {
  token: string;
  subjectId?: string;
  tier?: MobileEntitlementTier;
  expiresAt?: string | null;
}

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function normalizeTier(value: unknown): MobileEntitlementTier {
  if (value === 'admin' || value === 'unlimited' || value === 'pro' || value === 'standard') {
    return value;
  }
  return 'standard';
}

function normalizeRemoteEntitlement(payload: any): MobileEntitlementVerification {
  if (!payload?.ok) {
    return { ok: false, reason: payload?.reason || payload?.message || 'mobile entitlement rejected' };
  }
  return {
    ok: true,
    entitlement: {
      subjectId: String(payload.subjectId || payload.userId || payload.id || 'mobile-user'),
      tier: normalizeTier(payload.tier || payload.plan || payload.licenseType),
      expiresAt: payload.expiresAt ?? null,
      source: 'license-service',
    },
  };
}

function readEntitlementFile(filePath: string): EntitlementFileEntry[] {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    tokens?: EntitlementFileEntry[];
  } | EntitlementFileEntry[];
  return Array.isArray(parsed) ? parsed : parsed.tokens || [];
}

export function getMinimumMobileEntitlementTier(product: MobileKeywordProduct): MobileEntitlementTier {
  return PRODUCT_MIN_TIER[product];
}

export function isMobileEntitlementAllowed(
  entitlement: MobileEntitlement,
  requiredTier: MobileEntitlementTier,
): boolean {
  if (isExpired(entitlement.expiresAt)) return false;
  return TIER_POWER[entitlement.tier] >= TIER_POWER[requiredTier];
}

export function createStaticMobileTokenVerifier(token: string): MobileEntitlementVerifier | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  return (candidate) => ({
    ok: candidate === trimmed,
    entitlement: candidate === trimmed
      ? {
        subjectId: 'env-mobile-api-token',
        tier: 'admin',
        source: 'env-static-token',
      }
      : undefined,
    reason: candidate === trimmed ? undefined : 'invalid mobile API token',
  });
}

export function createHttpMobileEntitlementVerifier(
  options: HttpMobileEntitlementVerifierOptions,
): MobileEntitlementVerifier {
  const url = options.url.trim();
  const timeoutMs = Math.max(1000, options.timeoutMs || 5000);

  return async (token) => {
    if (!url) return { ok: false, reason: 'mobile entitlement service url missing' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token,
          appId: 'com.leword.mobile',
          requestedAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, reason: `mobile entitlement service HTTP ${response.status}` };
      }
      const payload = await response.json();
      const verification = normalizeRemoteEntitlement(payload);
      if (verification.entitlement && isExpired(verification.entitlement.expiresAt)) {
        return { ok: false, reason: 'mobile entitlement expired' };
      }
      return verification;
    } catch (err) {
      return {
        ok: false,
        reason: (err as Error).name === 'AbortError'
          ? 'mobile entitlement service timeout'
          : ((err as Error).message || 'mobile entitlement service failed'),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createEnvironmentMobileEntitlementVerifier(
  options: EnvironmentMobileEntitlementVerifierOptions = {},
): MobileEntitlementVerifier | null {
  const staticVerifier = createStaticMobileTokenVerifier(
    options.staticToken ?? process.env['LEWORD_MOBILE_API_TOKEN'] ?? '',
  );
  const entitlementFile = options.entitlementFile ?? process.env['LEWORD_MOBILE_ENTITLEMENTS_FILE'] ?? '';
  const entitlementUrl = options.entitlementUrl ?? process.env['LEWORD_MOBILE_ENTITLEMENT_URL'] ?? '';

  if (entitlementUrl.trim()) {
    const remoteVerifier = createHttpMobileEntitlementVerifier({
      url: entitlementUrl,
      timeoutMs: options.timeoutMs,
    });
    return async (token) => {
      const staticResult = await staticVerifier?.(token);
      if (staticResult?.ok) return staticResult;
      return remoteVerifier(token);
    };
  }

  if (!entitlementFile) return staticVerifier;

  return (token) => {
    const staticResult = staticVerifier?.(token);
    if (staticResult && 'ok' in staticResult && staticResult.ok) return staticResult;

    for (const entry of readEntitlementFile(entitlementFile)) {
      if (!entry?.token || entry.token !== token) continue;
      const tier = normalizeTier(entry.tier);
      if (isExpired(entry.expiresAt)) {
        return { ok: false, reason: 'mobile entitlement expired' };
      }
      return {
        ok: true,
        entitlement: {
          subjectId: entry.subjectId || 'mobile-user',
          tier,
          expiresAt: entry.expiresAt ?? null,
          source: 'entitlement-file',
        },
      };
    }

    return { ok: false, reason: 'mobile entitlement not found' };
  };
}
