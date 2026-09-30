import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'net';
import { createWebBridge } from '../../main/web-bridge';

/**
 * 사이트 '내 블로그' 탭 ↔ 앱 브리지(C 0단계 사이트 반영, 2026-09-30).
 * 사이트는 로그인 상태를 읽고 · 로그인 창을 열어 달라고 하고 · 앱이 잰 내 블로그 기록을 읽는다.
 * 측정은 여기서 시작하지 않는다(분 단위 작업은 앱 화면에서).
 */
const sessionStatus = vi.fn(async () => ({ loggedIn: true, windowOpen: false, capturedToday: 12, endpointCount: 3 }));
const openLogin = vi.fn(async () => undefined);
const blogClassGet = vi.fn(async () => ({ blogId: 'leadernam-', card: { headline: '글 39편', lines: [], notices: [] } }));
const server = createWebBridge({ appVersion: 'test', getAgentStatuses: async () => [], forgeInsights: async () => null,
  myBlog: { sessionStatus, openLogin, blogClassGet } } as any);
let base = '';
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('내 블로그 브리지', () => {
  it('로그인 상태를 사이트 출처로 읽는다 — 창구 목록은 넘기지 않는다', async () => {
    const res = await fetch(base + '/v1/bridge/my-blog/session', { headers: { Origin: 'https://leaderspro.kr' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({ loggedIn: true, windowOpen: false, capturedToday: 12, endpointCount: 3 });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(openLogin).not.toHaveBeenCalled();
  });
  it('로그인 창 열기는 POST 만 받고, GET 은 열지 않는다', async () => {
    expect((await fetch(base + '/v1/bridge/my-blog/session/open')).status).toBe(404);
    expect(openLogin).not.toHaveBeenCalled();
    const res = await fetch(base + '/v1/bridge/my-blog/session/open', { method: 'POST', headers: { Origin: 'https://leaderspro.kr' } });
    expect(res.status).toBe(200);
    expect(openLogin).toHaveBeenCalledTimes(1);
  });
  it('내 블로그 기록을 그대로 돌려주고, 기록이 없으면 record:null 로 말한다(사이트 bridgeCall 은 result null 을 오류로 본다)', async () => {
    const res = await fetch(base + '/v1/bridge/my-blog/class');
    expect((await res.json()).result.record.blogId).toBe('leadernam-');
    blogClassGet.mockResolvedValueOnce(null as any);
    const empty = await fetch(base + '/v1/bridge/my-blog/class');
    expect(empty.status).toBe(200);
    expect((await empty.json()).result).toEqual({ record: null });
  });
  it('확장 프로그램 출처·모르는 경로는 막는다', async () => {
    expect((await fetch(base + '/v1/bridge/my-blog/session', { headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } })).status).toBe(403);
    expect((await fetch(base + '/v1/bridge/my-blog/probe-file')).status).toBe(404);
  });
  it('창구 직접 호출(advisor)은 개발판 전용 — 기능이 없으면 404, 출처가 있으면 403, 있으면 경로를 그대로 넘긴다', async () => {
    expect((await fetch(base + '/v1/bridge/my-blog/advisor?p=%2Fhome%2Fyesterday-summary')).status).toBe(404);
    const advisorFetch = vi.fn(async (p: string) => ({ status: 200, body: `{"path":"${p}"}` }));
    const dev = createWebBridge({ appVersion: 'test', getAgentStatuses: async () => [], forgeInsights: async () => null,
      myBlog: { sessionStatus, openLogin, blogClassGet, advisorFetch } } as any);
    await new Promise<void>(resolve => dev.listen(0, '127.0.0.1', resolve));
    const devBase = `http://127.0.0.1:${(dev.address() as AddressInfo).port}`;
    try {
      const res = await fetch(devBase + '/v1/bridge/my-blog/advisor?p=%2Fhome%2Fyesterday-summary%3Fservice%3Dnaver_blog');
      expect(res.status).toBe(200);
      expect((await res.json()).result).toEqual({ status: 200, body: '{"path":"/home/yesterday-summary?service=naver_blog"}' });
      expect(advisorFetch).toHaveBeenCalledWith('/home/yesterday-summary?service=naver_blog', {});
      // 사이트·확장이 원본 창구를 그대로 빨아가면 안 된다 — 출처가 붙은 요청은 거절.
      expect((await fetch(devBase + '/v1/bridge/my-blog/advisor?p=%2Fhome%2Fyesterday-summary', { headers: { Origin: 'https://leaderspro.kr' } })).status).toBe(403);
      // 경로는 / 로 시작하는 어드바이저 상대경로만.
      expect((await fetch(devBase + '/v1/bridge/my-blog/advisor?p=https%3A%2F%2Fevil')).status).toBe(400);
      expect(advisorFetch).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>(resolve => dev.close(() => resolve()));
    }
  });
  it('앱 쪽이 실패하면 503 으로 사유 없이 알린다', async () => {
    sessionStatus.mockRejectedValueOnce(new Error('C:\\Users\\secret\\path'));
    const res = await fetch(base + '/v1/bridge/my-blog/session');
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
