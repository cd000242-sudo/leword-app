/**
 * Bright Data 요청 클라이언트 — 쿼터 거버너를 통과한 호출만 나간다.
 *
 * 왜 모듈로 빼는가:
 *   지금까지 Bright Data 호출부는 scripts/serp-gap-audit.js 안에만 있었다(수동 일회성).
 *   주중 2회 배치로 가면 여러 기능이 같은 계정 예산을 나눠 쓰게 되는데, 호출부가
 *   흩어져 있으면 쿼터 거버너를 우회하는 경로가 반드시 생기고 무료 한도를 넘겨
 *   유료($3/1,000)로 조용히 샌다. 그래서 나가는 문을 하나로 만든다.
 *
 * 이 모듈이 지키는 것:
 *   1. data_format:'html' 을 반드시 싣는다 — 빠지면 네이버는 파서가 없어
 *      x-brd-error(502)로 빈 본문이 오는데 HTTP 는 200이라 조용히 실패한다.
 *   2. reserve() 가 거부하면 네트워크를 아예 건드리지 않는다.
 *   3. 실패한 호출도 사용량으로 확정한다 — Bright Data 는 실패도 차감하므로
 *      성공분만 세면 실제 사용량을 과소평가해 한도를 넘긴다.
 */
import * as https from 'https';
import {
  reserveBrightDataRequests,
  recordBrightDataRequests,
  type BrightDataFeature,
} from './brightdata-quota-governor';

const BRIGHT_DATA_ENDPOINT = 'https://api.brightdata.com/request';
const DEFAULT_TIMEOUT_MS = 90_000;
/** 이보다 짧은 본문은 차단 페이지이거나 빈 응답이다. 감사 스크립트 실측 기준. */
const MIN_BODY_BYTES = 1_000;

export interface BrightDataRawResponse {
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

/** 네트워크 계층. 테스트에서 갈아끼울 수 있게 분리한다. */
export type BrightDataTransport = (
  endpoint: string,
  payload: string,
  opts: { token: string; timeoutMs: number },
) => Promise<BrightDataRawResponse>;

export interface BrightDataFetchResult {
  ok: boolean;
  body: string;
  status?: string;
  error?: string;
  /** 쿼터 거버너가 막아서 호출 자체를 안 한 경우. 네트워크 실패와 구분한다. */
  quotaBlocked?: boolean;
}

type ReserveFn = (feature: BrightDataFeature, count: number) => { allowed: boolean; granted: number; reason?: string };
type RecordFn = (feature: BrightDataFeature, count: number) => void;

export interface BrightDataFetchOptions {
  token?: string;
  zone?: string;
  /** 기본 'html'. 네이버는 반드시 html 이어야 한다. */
  parse?: BrightDataParse;
  timeoutMs?: number;
  transport?: BrightDataTransport;
  reserve?: ReserveFn;
  record?: RecordFn;
}

/**
 * 응답 형태.
 *  - 'html'  원문 HTML. **네이버는 이것만 된다** — BD 에 네이버 파서가 없어서
 *            json 을 요구하면 x-brd-error(502)로 빈 본문이 오는데 HTTP 는 200이라
 *            조용히 실패한다.
 *  - 'json'  BD 가 파싱한 구조화 JSON(구글 계열). organic 외에
 *            related_searches · people_also_ask 가 **같은 호출에 딸려온다**.
 *            추가 크레딧이 들지 않으므로 연관 키워드를 여기서 공짜로 얻는다.
 */
export type BrightDataParse = 'html' | 'json';

/**
 * 요청 페이로드.
 * 기본값은 'html' 이다 — 네이버가 주 대상이고, 잘못 바꾸면 조용히 실패하기 때문에
 * JSON 은 호출자가 명시적으로 골라야 한다.
 */
export function buildBrightDataPayload(url: string, zone: string, parse: BrightDataParse = 'html'): string {
  if (parse === 'json') {
    // brd_json=1 은 URL 쿼리로 붙인다. data_format 은 싣지 않는다 — 둘을 같이 주면
    // 파서가 아니라 원문이 온다.
    const separator = url.includes('?') ? '&' : '?';
    return JSON.stringify({ zone, url: `${url}${separator}brd_json=1`, format: 'raw' });
  }
  return JSON.stringify({ zone, url, format: 'raw', data_format: 'html' });
}

function headerValue(headers: BrightDataRawResponse['headers'], name: string): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * 응답이 실제로 쓸 수 있는 본문인지 판정한다.
 * HTTP 200 + x-brd-error 조합(조용한 실패)을 반드시 걸러야 한다.
 */
export function interpretBrightDataResponse(
  res: BrightDataRawResponse,
  minBodyBytes: number = MIN_BODY_BYTES,
): { ok: boolean; status?: string; error?: string } {
  const brdError = headerValue(res.headers, 'x-brd-error');
  const status = headerValue(res.headers, 'x-brd-status-code');
  if (brdError) return { ok: false, status, error: `brd:${brdError}` };
  if (!res.body || res.body.length < minBodyBytes) {
    return { ok: false, status, error: `body_too_short:${res.body ? res.body.length : 0}` };
  }
  return { ok: true, status };
}

/** 기본 전송 — Node https. 테스트에서는 주입으로 대체된다. */
const httpsTransport: BrightDataTransport = async (endpoint, payload, { token, timeoutMs }) => {
  return new Promise<BrightDataRawResponse>((resolve) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({ body: Buffer.concat(chunks).toString('utf8'), headers: res.headers });
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ body: '', headers: { 'x-brd-error': 'timeout' } }); });
    req.on('error', (e: Error) => resolve({ body: '', headers: { 'x-brd-error': e.message } }));
    req.write(payload);
    req.end();
  });
};

/**
 * Bright Data 로 URL 하나를 받아온다.
 * 쿼터 거부 시에는 네트워크를 건드리지 않고 quotaBlocked 로 돌려준다.
 */
export async function brightDataFetch(
  url: string,
  feature: BrightDataFeature,
  options: BrightDataFetchOptions = {},
): Promise<BrightDataFetchResult> {
  const token = (options.token ?? process.env['BRIGHTDATA_TOKEN'] ?? '').trim();
  const zone = (options.zone ?? process.env['BRIGHTDATA_ZONE'] ?? '77').trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const transport = options.transport ?? httpsTransport;
  const reserve = options.reserve
    ?? ((f: BrightDataFeature, n: number) => reserveBrightDataRequests(f, n));
  const record = options.record
    ?? ((f: BrightDataFeature, n: number) => { recordBrightDataRequests(f, n); });

  // 토큰이 없으면 호출해봐야 401 을 쿼터에서 차감당할 뿐이다. 먼저 막는다.
  if (!token) {
    return { ok: false, body: '', error: 'missing_token' };
  }

  const decision = reserve(feature, 1);
  if (!decision.allowed || decision.granted < 1) {
    return { ok: false, body: '', quotaBlocked: true, error: decision.reason || 'quota_denied' };
  }

  let raw: BrightDataRawResponse;
  try {
    raw = await transport(
      BRIGHT_DATA_ENDPOINT,
      buildBrightDataPayload(url, zone, options.parse ?? 'html'),
      { token, timeoutMs },
    );
  } catch (error) {
    // 전송이 통째로 터져도 Bright Data 쪽에서는 이미 차감됐을 수 있다.
    record(feature, 1);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, body: '', error: `transport:${message}` };
  }

  // 성공·실패 무관하게 확정한다. 실패분을 안 세면 한도를 넘긴다.
  record(feature, 1);

  const verdict = interpretBrightDataResponse(raw);
  return {
    ok: verdict.ok,
    body: raw.body,
    ...(verdict.status ? { status: verdict.status } : {}),
    ...(verdict.error ? { error: verdict.error } : {}),
  };
}
