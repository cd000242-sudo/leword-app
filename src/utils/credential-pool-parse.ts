/**
 * Shared parser for credential pools ("id:secret,id:secret" pairs or a JSON array).
 * Extracted from naver-blog-api.ts so the API HUB key pool can reuse the exact same rules
 * without an import cycle (naver-api-hub -> naver-blog-api -> naver-api-hub).
 */

export interface PooledCredential {
  clientId: string;
  clientSecret: string;
  label: string;
}

export function normalizeCredentialPart(value: unknown): string {
  return String(value || '').trim();
}

export function splitCredentialPool(value: string): string[] {
  return String(value || '')
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonOrPairPool(value: string): PooledCredential[] {
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
        // keyId / key are the API HUB field names; the rest are the legacy OpenAPI names.
        clientId: normalizeCredentialPart(item?.clientId || item?.id || item?.keyId || item?.NAVER_CLIENT_ID),
        clientSecret: normalizeCredentialPart(item?.clientSecret || item?.secret || item?.key || item?.NAVER_CLIENT_SECRET),
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
