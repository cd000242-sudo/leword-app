// LEWORD Key Wizard — OAuth 2.0 Installed App + PKCE Loopback 전략
// 작성: 2026-04-15
// 공급자별 OAuth 자동화의 공용 엔진. shell.openExternal로 사용자 기본 브라우저를 띄우고
// 로컬 HTTP 서버에서 콜백을 수신해 code를 토큰으로 교환한다.

import { shell } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';

export interface OAuthLoopbackConfig {
  authUrl: string;          // 공급자 인증 엔드포인트
  tokenUrl: string;         // 토큰 교환 엔드포인트
  clientId: string;
  clientSecret?: string;    // PKCE 사용 시 미필수, 일부 공급자(GCP)는 동시 요구
  scopes: string[];
  preferredPort?: number;
  extraAuthParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
  successHtml?: string;
  timeoutMs?: number;
}

export interface OAuthLoopbackResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  raw: any;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce() {
  const verifier = base64UrlEncode(crypto.randomBytes(48));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(24));
}

function defaultSuccessHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>LEWORD 인증 완료</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:40px;background:#1e293b;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.4)}
h1{font-size:28px;margin:0 0 12px;color:#10b981}p{color:#94a3b8;margin:0}</style>
</head><body><div class="box"><h1>✅ 인증 완료</h1><p>이 창을 닫고 LEWORD 앱으로 돌아가세요.</p></div></body></html>`;
}

function defaultErrorHtml(reason: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>LEWORD 인증 실패</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:40px;background:#1e293b;border-radius:16px}
h1{font-size:28px;margin:0 0 12px;color:#ef4444}p{color:#94a3b8;margin:0}</style>
</head><body><div class="box"><h1>❌ 인증 실패</h1><p>${reason}</p><p>LEWORD 앱으로 돌아가 다시 시도하세요.</p></div></body></html>`;
}

async function startServer(port: number): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error('서버 주소를 확인할 수 없습니다.'));
      }
    });
  });
}

export async function runOAuthLoopback(
  config: OAuthLoopbackConfig,
  onProgress?: (msg: string) => void
): Promise<OAuthLoopbackResult> {
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;

  // 1) 로컬 서버 기동 (preferredPort 우선, 실패 시 0)
  let server: http.Server;
  let port: number;
  try {
    const r = await startServer(config.preferredPort ?? 0);
    server = r.server;
    port = r.port;
  } catch {
    const r = await startServer(0);
    server = r.server;
    port = r.port;
  }
  onProgress?.(`로컬 콜백 서버 기동: 127.0.0.1:${port}`);

  const redirectUri = `http://127.0.0.1:${port}/callback`;

  // 2) 인증 URL 구성
  const authParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    ...(config.extraAuthParams || {}),
  });
  const authUrl = `${config.authUrl}?${authParams.toString()}`;

  // 3) 콜백 대기 + 외부 브라우저 열기
  const codePromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OAuth 타임아웃 — 사용자 인증 시간 초과'));
    }, timeoutMs);

    server.on('request', (req, res) => {
      if (!req.url) return;
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      if (u.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get('code');
      const recvState = u.searchParams.get('state');
      const error = u.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(defaultErrorHtml(error));
        clearTimeout(timer);
        reject(new Error(`OAuth 거부됨: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(defaultErrorHtml('code 누락'));
        clearTimeout(timer);
        reject(new Error('OAuth code 누락'));
        return;
      }
      if (recvState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(defaultErrorHtml('state 불일치 — CSRF 의심'));
        clearTimeout(timer);
        reject(new Error('OAuth state 불일치'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(config.successHtml || defaultSuccessHtml());
      clearTimeout(timer);
      resolve(code);
    });
  });

  onProgress?.('사용자 기본 브라우저로 인증 페이지 열기...');
  await shell.openExternal(authUrl);

  let code: string;
  try {
    code = await codePromise;
    onProgress?.('✅ 인증 코드 수신 완료');
  } finally {
    server.close();
  }

  // 4) code → token 교환
  onProgress?.('토큰 교환 중...');
  const tokenParams = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    ...(config.extraTokenParams || {}),
  });

  const tokenRes = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: tokenParams.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`토큰 교환 실패 (${tokenRes.status}): ${text.slice(0, 200)}`);
  }

  const json: any = await tokenRes.json();
  if (!json.access_token) {
    throw new Error('토큰 응답에 access_token 누락: ' + JSON.stringify(json).slice(0, 200));
  }

  const expiresAt = json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined;
  onProgress?.('✅ 토큰 교환 완료');

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    expiresAt,
    tokenType: json.token_type,
    scope: json.scope,
    raw: json,
  };
}

export async function refreshAccessToken(config: {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): Promise<OAuthLoopbackResult> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
  });
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: params.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`토큰 갱신 실패 (${res.status}): ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  if (!json.access_token) throw new Error('갱신 응답에 access_token 누락');
  const expiresAt = json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || config.refreshToken,
    expiresIn: json.expires_in,
    expiresAt,
    tokenType: json.token_type,
    scope: json.scope,
    raw: json,
  };
}
