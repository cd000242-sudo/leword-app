import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  advisorSecretFromCookie,
  browserLikeUserAgent,
  isNaverLoggedIn,
  shouldCaptureAdvisorCall,
  signAdvisorRequest,
  summarizeProbeLines,
  type ProbeLine,
} from '../naver-advisor-probe';

/**
 * 크리에이터 어드바이저 창구 실측(C 0단계, 2026-09-30).
 *
 * 사장님 "내 블로그를 주면 알고리즘이 어디에 특화되어있나 파악도가능할까?".
 * 공개 창구엔 조회·공감·댓글 값이 없어(leadernam- 39편 실측 전부 빈 값) 로그인 실측이 유일한 길이다.
 * 이 파일은 그 첫 단계 — 로그인 창에서 어드바이저가 실제로 부르는 JSON 창구를 잡아 두는 부분의 순수 함수만 잰다.
 */
describe('어드바이저 창구 실측 — 무엇을 잡고 무엇을 안 잡나', () => {
  it('어드바이저 호스트의 XHR/Fetch 만 잡는다', () => {
    expect(shouldCaptureAdvisorCall('https://creator-advisor.naver.com/api/v6/inflow-search?metric=cv', 'XHR')).toBe(true);
    expect(shouldCaptureAdvisorCall('https://creator-advisor.naver.com/api/v6/contents', 'Fetch')).toBe(true);
    expect(shouldCaptureAdvisorCall('https://creator-advisor.naver.com/naver_blog/leadernam-/stats', 'Document')).toBe(false);
    expect(shouldCaptureAdvisorCall('https://creator-advisor.naver.com/static/app.js', 'Script')).toBe(false);
  });

  it('로그인(nid)·통계 비콘·다른 호스트는 절대 잡지 않는다 — 비밀번호가 실릴 수 있는 곳', () => {
    expect(shouldCaptureAdvisorCall('https://nid.naver.com/nidlogin.login', 'XHR')).toBe(false);
    expect(shouldCaptureAdvisorCall('https://nid.naver.com/login/ext/otp', 'Fetch')).toBe(false);
    expect(shouldCaptureAdvisorCall('https://wcs.naver.com/b', 'XHR')).toBe(false);
    expect(shouldCaptureAdvisorCall('https://blog.naver.com/PostTitleListAsync.naver', 'XHR')).toBe(false);
    expect(shouldCaptureAdvisorCall('not a url', 'XHR')).toBe(false);
  });

  it('브라우저 UA 로 보이게 Electron·앱 이름 토큰을 뗀다', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) leword-app/2.49.141 Chrome/120.0.6099.291 Electron/28.3.3 Safari/537.36';
    expect(browserLikeUserAgent(ua)).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.291 Safari/537.36');
    expect(browserLikeUserAgent('')).toBe('');
  });

  it('로그인 판정은 NID_AUT + NID_SES 두 쿠키가 다 있어야 한다', () => {
    expect(isNaverLoggedIn([{ name: 'NID_AUT' }, { name: 'NID_SES' }, { name: 'NNB' }])).toBe(true);
    expect(isNaverLoggedIn([{ name: 'NID_SES' }, { name: 'NNB' }])).toBe(false);
    expect(isNaverLoggedIn([])).toBe(false);
  });
});

describe('창구 요청 서명 — 데이터 창구는 서명 없이는 전부 403(2026-09-30 실측 45/45)', () => {
  it('비밀은 __ca_key 쿠키의 첫 마디(. 앞)다 — 없거나 비면 null', () => {
    expect(advisorSecretFromCookie('abc123.rest.more')).toBe('abc123');
    expect(advisorSecretFromCookie('"abc123.x"')).toBe('abc123');
    expect(advisorSecretFromCookie('ab%2Bc%3D.x')).toBe('ab+c=');
    expect(advisorSecretFromCookie('')).toBeNull();
    expect(advisorSecretFromCookie(undefined)).toBeNull();
    expect(advisorSecretFromCookie('.tail')).toBeNull();
  });
  it('서명은 HMAC-SHA256(비밀, "METHOD|경로|ts|nonce") 16진수 — 쿼리는 경로에 안 들어간다', () => {
    const headers = signAdvisorRequest({ secret: 'k', method: 'get', pathAndQuery: '/trend/trend-stats?service=naver_blog&date=2026-09-29', ts: '1700000000000', nonce: 'n-1' });
    const expected = createHmac('sha256', 'k').update('GET|/api/v6/trend/trend-stats|1700000000000|n-1').digest('hex');
    expect(headers).toEqual({ 'X-CA-Nonce': 'n-1', 'X-CA-Ts': '1700000000000', 'X-CA-Sig': expected });
  });
  it('ts·nonce 를 안 주면 지금 시각·무작위 nonce 로 채운다', () => {
    const a = signAdvisorRequest({ secret: 'k', method: 'GET', pathAndQuery: '/x' });
    const b = signAdvisorRequest({ secret: 'k', method: 'GET', pathAndQuery: '/x' });
    expect(a['X-CA-Nonce']).not.toBe(b['X-CA-Nonce']);
    expect(Number(a['X-CA-Ts'])).toBeGreaterThan(1_700_000_000_000);
    expect(a['X-CA-Sig']).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('실측 기록 요약 — 창구별로 묶는다', () => {
  const line = (over: Partial<ProbeLine>): ProbeLine => ({
    at: '2026-09-30T01:00:00.000Z',
    method: 'GET',
    url: 'https://creator-advisor.naver.com/api/v6/inflow-search?service=naver_blog&channelId=leadernam-&metric=cv&date=2026-09-29',
    status: 200,
    mimeType: 'application/json',
    bodyBytes: 120,
    bodyHead: '{"data":[]}',
    ...over,
  });

  it('메서드+경로로 묶고 쿼리 이름·응답 머리는 표본으로 남긴다', () => {
    const summary = summarizeProbeLines([
      line({}),
      line({ url: 'https://creator-advisor.naver.com/api/v6/inflow-search?service=naver_blog&channelId=leadernam-&metric=cv&date=2026-09-28' }),
      line({ url: 'https://creator-advisor.naver.com/api/v6/contents?service=naver_blog&channelId=leadernam-', status: 401, bodyHead: '', bodyBytes: 0 }),
    ]);
    expect(summary).toHaveLength(2);
    const inflow = summary.find((entry) => entry.path === '/api/v6/inflow-search');
    expect(inflow).toMatchObject({ method: 'GET', count: 2, statuses: [200], queryKeys: ['channelId', 'date', 'metric', 'service'] });
    expect(inflow?.sampleUrl).toContain('date=2026-09-29');
    expect(inflow?.bodyHead).toBe('{"data":[]}');
    const contents = summary.find((entry) => entry.path === '/api/v6/contents');
    expect(contents).toMatchObject({ count: 1, statuses: [401] });
  });

  it('많이 불린 창구가 앞에 온다', () => {
    const summary = summarizeProbeLines([
      line({ url: 'https://creator-advisor.naver.com/api/a' }),
      line({ url: 'https://creator-advisor.naver.com/api/b' }),
      line({ url: 'https://creator-advisor.naver.com/api/b' }),
    ]);
    expect(summary.map((entry) => entry.path)).toEqual(['/api/b', '/api/a']);
  });

  it('깨진 줄은 건너뛴다', () => {
    expect(summarizeProbeLines([line({ url: 'nope' })])).toEqual([]);
  });
});
