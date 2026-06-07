import type http from 'http';
import { MOBILE_PC_PARITY_SLA } from './contracts';

export interface MobileApiGuardrailOptions {
  maxBodyBytes: number;
  maxRequestsPerMinute: number;
  windowMs: number;
}

export interface MobileApiRateLimitResult {
  ok: boolean;
  key: string;
  remaining: number;
  retryAfterMs: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export class MobileApiBodyTooLargeError extends Error {
  constructor(public readonly maxBodyBytes: number) {
    super(`mobile API body exceeds ${maxBodyBytes} bytes`);
  }
}

export const MOBILE_API_GUARDRAIL_DEFAULTS: MobileApiGuardrailOptions = Object.freeze({
  maxBodyBytes: MOBILE_PC_PARITY_SLA.apiGuardrails.maxBodyBytesDefault,
  maxRequestsPerMinute: MOBILE_PC_PARITY_SLA.apiGuardrails.maxRequestsPerMinuteDefault,
  windowMs: 60_000,
});

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getMobileApiGuardrailOptions(
  env: Record<string, string | undefined> = process.env,
): MobileApiGuardrailOptions {
  return {
    maxBodyBytes: parsePositiveInteger(
      env.LEWORD_MOBILE_MAX_BODY_BYTES,
      MOBILE_API_GUARDRAIL_DEFAULTS.maxBodyBytes,
    ),
    maxRequestsPerMinute: parsePositiveInteger(
      env.LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE,
      MOBILE_API_GUARDRAIL_DEFAULTS.maxRequestsPerMinute,
    ),
    windowMs: MOBILE_API_GUARDRAIL_DEFAULTS.windowMs,
  };
}

export function getMobileApiClientKey(req: http.IncomingMessage): string {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return `token:${bearer}`;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  const remote = req.socket.remoteAddress || 'anonymous';
  return `ip:${forwarded || remote}`;
}

export class MobileApiRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly options: MobileApiGuardrailOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(req: http.IncomingMessage): MobileApiRateLimitResult {
    const key = getMobileApiClientKey(req);
    const stamp = this.now();
    const existing = this.buckets.get(key);
    const bucket = existing && existing.resetAt > stamp
      ? existing
      : { count: 0, resetAt: stamp + this.options.windowMs };

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const remaining = Math.max(0, this.options.maxRequestsPerMinute - bucket.count);
    return {
      ok: bucket.count <= this.options.maxRequestsPerMinute,
      key,
      remaining,
      retryAfterMs: Math.max(0, bucket.resetAt - stamp),
    };
  }

  snapshot(): { buckets: number; maxRequestsPerMinute: number; windowMs: number } {
    return {
      buckets: this.buckets.size,
      maxRequestsPerMinute: this.options.maxRequestsPerMinute,
      windowMs: this.options.windowMs,
    };
  }
}

export function parseMobileJsonBody(
  req: http.IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk: Buffer | string) => {
      if (tooLarge) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBodyBytes) {
        tooLarge = true;
        reject(new MobileApiBodyTooLargeError(maxBodyBytes));
        return;
      }
      raw += buffer.toString('utf8');
    });

    req.on('error', (err) => {
      if (!tooLarge) reject(err);
    });

    req.on('end', () => {
      if (tooLarge) return;
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
  });
}
