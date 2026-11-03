/**
 * 제휴 세션 쿠키 — 순수 함수 모음 (electron·puppeteer 무의존, vitest 로 검증).
 *
 * 크롬 확장(leword-session-link)이 보낸 네이버·토스 쿠키를 받아 거르고,
 * 수집 전용 프로필에 넣을 퍼핏티어 형식으로 바꾼다. 쿠키 값은 어디에도 출력하지 않는다.
 */

/** 세션 쿠키(만료 없음)를 프로필에 영속시킬 때 주는 수명. */
export const SESSION_COOKIE_TTL_SEC = 30 * 24 * 3600;

export const MAX_COOKIES = 400;
const MAX_NAME = 256;
const MAX_VALUE = 4096;
const MAX_PATH = 512;

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** 초 단위 유닉스 시각. 없으면 세션 쿠키. */
  expirationDate?: number;
  secure: boolean;
  httpOnly: boolean;
  /** chrome.cookies 형식: no_restriction | lax | strict | unspecified */
  sameSite?: string;
}

export interface PuppeteerCookie {
  name: string;
  value: string;
  domain?: string;
  url?: string;
  path?: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'None' | 'Lax' | 'Strict';
}

const ALLOWED_ROOTS = ['naver.com', 'toss.im'] as const;

export function isAllowedCookieDomain(domain: unknown): boolean {
  if (typeof domain !== 'string') return false;
  const host = domain.trim().toLowerCase().replace(/^\./, '');
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return false;
  return ALLOWED_ROOTS.some((root) => host === root || host.endsWith(`.${root}`));
}

function parseOne(raw: unknown): SessionCookie | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== 'string' || !c.name || c.name.length > MAX_NAME) return null;
  if (typeof c.value !== 'string' || c.value.length > MAX_VALUE) return null;
  if (typeof c.domain !== 'string' || typeof c.path !== 'string' || !c.path.startsWith('/') || c.path.length > MAX_PATH) return null;
  if (typeof c.secure !== 'boolean' || typeof c.httpOnly !== 'boolean') return null;
  if (c.expirationDate !== undefined && (typeof c.expirationDate !== 'number' || !Number.isFinite(c.expirationDate))) return null;
  if (c.sameSite !== undefined && typeof c.sameSite !== 'string') return null;
  return {
    name: c.name,
    value: c.value,
    domain: c.domain.trim(),
    path: c.path,
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate as number } : {}),
    secure: c.secure,
    httpOnly: c.httpOnly,
    ...(c.sameSite !== undefined ? { sameSite: c.sameSite as string } : {}),
  };
}

export type ParseResult = { ok: true; cookies: SessionCookie[] } | { ok: false; error: string };

/** 본문 { cookies: [...] } 를 검증한다. 허용 밖 도메인은 버리고, 하나도 안 남으면 거절. 오류 문구에 값은 안 넣는다. */
export function parseIncomingCookies(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: '본문이 올바르지 않습니다.' };
  const list = (body as { cookies?: unknown }).cookies;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: '쿠키 목록이 비었습니다.' };
  if (list.length > MAX_COOKIES) return { ok: false, error: '쿠키가 너무 많습니다.' };
  const cookies: SessionCookie[] = [];
  for (const raw of list) {
    const parsed = parseOne(raw);
    if (!parsed) return { ok: false, error: '쿠키 모양이 올바르지 않습니다.' };
    if (isAllowedCookieDomain(parsed.domain)) cookies.push(parsed);
  }
  if (cookies.length === 0) return { ok: false, error: '허용된 도메인의 쿠키가 없습니다.' };
  return { ok: true, cookies };
}

function mapSameSite(c: SessionCookie): PuppeteerCookie['sameSite'] {
  switch (c.sameSite) {
    case 'no_restriction': return c.secure ? 'None' : undefined; // None 은 secure 필수
    case 'lax': return 'Lax';
    case 'strict': return 'Strict';
    default: return undefined;
  }
}

/** 저장 쿠키 → 퍼핏티어 setCookie 입력. 만료 지난 것·허용 밖 도메인은 뺀다. 세션 쿠키는 30일 뒤로 영속화. */
export function toPuppeteerCookies(cookies: SessionCookie[], nowSec: number): PuppeteerCookie[] {
  const out: PuppeteerCookie[] = [];
  for (const c of cookies) {
    if (!isAllowedCookieDomain(c.domain)) continue;
    if (c.expirationDate !== undefined && c.expirationDate <= nowSec) continue;
    const expires = c.expirationDate !== undefined ? c.expirationDate : nowSec + SESSION_COOKIE_TTL_SEC;
    const sameSite = mapSameSite(c);
    const host = c.domain.replace(/^\./, '');
    const target = c.name.startsWith('__Host-') ? { url: `https://${host}${c.path}` } : { domain: c.domain };
    out.push({
      name: c.name,
      value: c.value,
      ...target,
      ...(c.name.startsWith('__Host-') ? {} : { path: c.path }),
      expires,
      secure: c.secure,
      httpOnly: c.httpOnly,
      ...(sameSite ? { sameSite } : {}),
    });
  }
  return out;
}

export interface LoginSummary {
  naver: boolean;
  tossCookies: number;
}

/** 로그인 쿠키가 있는지만 요약한다(값은 안 건드림). 토스는 로그인 쿠키 이름을 몰라 개수만 센다. */
export function summarizeLogin(cookies: SessionCookie[]): LoginSummary {
  const naverNames = new Set(
    cookies.filter((c) => /(^|\.)naver\.com$/i.test(c.domain.replace(/^\./, ''))).map((c) => c.name),
  );
  return {
    naver: naverNames.has('NID_AUT') && naverNames.has('NID_SES'),
    tossCookies: cookies.filter((c) => /(^|\.)toss\.im$/i.test(c.domain.replace(/^\./, ''))).length,
  };
}
