import { describe, expect, it } from 'vitest';
import {
  isAllowedCookieDomain,
  parseIncomingCookies,
  summarizeLogin,
  toPuppeteerCookies,
  SESSION_COOKIE_TTL_SEC,
} from './affiliate-session-cookies';

const NOW = 1_800_000_000; // 초 단위 고정 기준 시각

const base = { name: 'NID_AUT', value: 'v', domain: '.naver.com', path: '/', secure: true, httpOnly: true };

describe('isAllowedCookieDomain', () => {
  it('naver.com / toss.im 계열만 허용한다', () => {
    expect(isAllowedCookieDomain('.naver.com')).toBe(true);
    expect(isAllowedCookieDomain('brandconnect.naver.com')).toBe(true);
    expect(isAllowedCookieDomain('NAVER.com')).toBe(true);
    expect(isAllowedCookieDomain('.toss.im')).toBe(true);
    expect(isAllowedCookieDomain('shopping.toss.im')).toBe(true);
  });
  it('비슷한 이름의 남의 도메인은 거절한다', () => {
    expect(isAllowedCookieDomain('evilnaver.com')).toBe(false);
    expect(isAllowedCookieDomain('naver.com.evil.io')).toBe(false);
    expect(isAllowedCookieDomain('nottoss.im')).toBe(false);
    expect(isAllowedCookieDomain('')).toBe(false);
  });
});

describe('parseIncomingCookies', () => {
  it('올바른 쿠키를 받는다', () => {
    const r = parseIncomingCookies({ cookies: [base] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies).toHaveLength(1);
  });
  it('허용 밖 도메인 쿠키는 버리고, 전부 버려지면 거절한다', () => {
    const mixed = parseIncomingCookies({ cookies: [base, { ...base, domain: 'evil.com' }] });
    expect(mixed.ok && mixed.cookies.length).toBe(1);
    const none = parseIncomingCookies({ cookies: [{ ...base, domain: 'evil.com' }] });
    expect(none.ok).toBe(false);
  });
  it('모양이 틀리면 거절한다', () => {
    expect(parseIncomingCookies(null).ok).toBe(false);
    expect(parseIncomingCookies({}).ok).toBe(false);
    expect(parseIncomingCookies({ cookies: [] }).ok).toBe(false);
    expect(parseIncomingCookies({ cookies: [{ ...base, name: '' }] }).ok).toBe(false);
    expect(parseIncomingCookies({ cookies: [{ ...base, value: 5 }] }).ok).toBe(false);
    expect(parseIncomingCookies({ cookies: [{ ...base, value: 'x'.repeat(5000) }] }).ok).toBe(false);
  });
  it('개수 상한을 넘으면 거절한다', () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ ...base, name: `c${i}` }));
    expect(parseIncomingCookies({ cookies: many }).ok).toBe(false);
  });
  it('오류 문구에 쿠키 값이 섞이지 않는다', () => {
    const r = parseIncomingCookies({ cookies: [{ ...base, value: 'SECRET-VALUE'.repeat(500) }] });
    expect(JSON.stringify(r)).not.toContain('SECRET-VALUE');
  });
});

describe('toPuppeteerCookies', () => {
  it('세션 쿠키는 30일 뒤 만료로 영속시킨다', () => {
    const [c] = toPuppeteerCookies([{ ...base }], NOW);
    expect(c.expires).toBe(NOW + SESSION_COOKIE_TTL_SEC);
    expect(SESSION_COOKIE_TTL_SEC).toBe(30 * 24 * 3600);
  });
  it('남은 만료가 있으면 그대로 두고, 이미 지난 쿠키는 뺀다', () => {
    const out = toPuppeteerCookies([
      { ...base, name: 'a', expirationDate: NOW + 100 },
      { ...base, name: 'b', expirationDate: NOW - 5 },
    ], NOW);
    expect(out.map((c) => c.name)).toEqual(['a']);
    expect(out[0].expires).toBe(NOW + 100);
  });
  it('sameSite 값을 퍼핏티어 형식으로 바꾸고 모르는 값은 뺀다', () => {
    const out = toPuppeteerCookies([
      { ...base, name: 'a', sameSite: 'no_restriction' },
      { ...base, name: 'b', sameSite: 'lax' },
      { ...base, name: 'c', sameSite: 'strict' },
      { ...base, name: 'd', sameSite: 'unspecified' },
      { ...base, name: 'e', sameSite: 'no_restriction', secure: false },
    ], NOW);
    expect(out.map((c) => c.sameSite)).toEqual(['None', 'Lax', 'Strict', undefined, undefined]);
  });
  it('__Host- 쿠키는 도메인 대신 주소로 넣는다', () => {
    const [c] = toPuppeteerCookies([{ ...base, name: '__Host-x', domain: 'www.naver.com' }], NOW);
    expect(c.url).toBe('https://www.naver.com/');
    expect(c.domain).toBeUndefined();
  });
  it('허용 밖 도메인은 여기서도 거른다', () => {
    expect(toPuppeteerCookies([{ ...base, domain: 'evil.com' }], NOW)).toEqual([]);
  });
});

describe('summarizeLogin', () => {
  it('네이버는 NID_AUT 와 NID_SES 가 둘 다 있어야 로그인으로 본다', () => {
    expect(summarizeLogin([{ ...base, name: 'NID_AUT' }, { ...base, name: 'NID_SES' }]).naver).toBe(true);
    expect(summarizeLogin([{ ...base, name: 'NID_AUT' }]).naver).toBe(false);
  });
  it('토스는 toss.im 쿠키가 있는지만 센다', () => {
    expect(summarizeLogin([{ ...base, domain: '.toss.im', name: 'x' }]).tossCookies).toBe(1);
    expect(summarizeLogin([base]).tossCookies).toBe(0);
  });
});
