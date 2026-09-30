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
  it('앱 쪽이 실패하면 503 으로 사유 없이 알린다', async () => {
    sessionStatus.mockRejectedValueOnce(new Error('C:\\Users\\secret\\path'));
    const res = await fetch(base + '/v1/bridge/my-blog/session');
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
