import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const state = vi.hoisted(() => ({ dir: '', status: 200, ids: new Map<string, string[]>(), calls: [] as Array<{ partition: string; url: string }> }));
vi.mock('electron', () => ({
  BrowserWindow: class {
    closed = false;
    handlers: Record<string, () => void> = {};
    webContents = { on: () => {}, debugger: { attach: () => {}, on: () => {}, sendCommand: async () => {} } };
    on(event: string, callback: () => void) { this.handlers[event] = callback; }
    isDestroyed() { return this.closed; }
    focus() {}
    loadURL() { return Promise.resolve(); }
    close() { this.closed = true; this.handlers.closed?.(); }
  },
  app: { getPath: () => state.dir, userAgentFallback: 'Chrome/130.0.0.0' },
  ipcMain: { listenerCount: () => 0, handle: () => {} },
  session: { fromPartition: (partition: string) => ({
    setUserAgent: () => {},
    cookies: { get: async (query: any) => query.name || !state.ids.has(partition) ? [] : [{ name: 'NID_AUT' }, { name: 'NID_SES' }] },
    fetch: async (url: string) => {
      state.calls.push({ partition, url });
      return { status: state.status, text: async () => JSON.stringify({ data: (state.ids.get(partition) || []).map((channelId) => ({ service: 'naver_blog', channelId })) }) };
    },
    clearStorageData: async () => { state.ids.delete(partition); },
  }) },
}));
import { advisorFetch, clearNaverSession, connectedNaverBlogs, naverSessionStatus, openAdvisorWindow } from '../../main/handlers/naver-session';
beforeEach(() => { state.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-sessions-')); state.status = 200; state.ids.clear(); state.calls.length = 0; });
afterEach(() => fs.rmSync(state.dir, { recursive: true, force: true }));
describe('persistent Naver sessions with verified blog ownership', () => {
  it('reports the login window before cookies exist, and detects cancellation', async () => {
    await openAdvisorWindow('alpha');
    expect(await naverSessionStatus('alpha')).toMatchObject({ loggedIn: false, windowOpen: true });
    await clearNaverSession('alpha');
    expect(await naverSessionStatus('alpha')).toMatchObject({ loggedIn: false, windowOpen: false });
  });
  it('reports an unavailable server separately from an expired login', async () => {
    state.ids.set('persist:naver-blog-alpha', ['alpha']);
    state.status = 503;
    await expect(naverSessionStatus('alpha')).rejects.toThrow('연결 상태');
    state.status = 401;
    expect((await naverSessionStatus('alpha')).loggedIn).toBe(false);
  });
  it('reuses an existing login only for its actual blog and keeps the second account separate', async () => {
    state.ids.set('persist:naver-login', ['alpha']);
    state.ids.set('persist:naver-blog-beta', ['beta']);
    expect((await naverSessionStatus('alpha')).loggedIn).toBe(true);
    expect((await naverSessionStatus('beta')).loggedIn).toBe(true);
    state.calls.length = 0;
    await advisorFetch('/test?channelId=alpha', {}, 'alpha');
    await advisorFetch('/test?channelId=beta', {}, 'beta');
    expect(state.calls.filter((c) => c.url.includes('/test')).map((c) => c.partition)).toEqual(['persist:naver-login', 'persist:naver-blog-beta']);
    expect(await connectedNaverBlogs()).toEqual(['alpha', 'beta']);
  });
  it('does not treat another logged-in account as the selected account', async () => {
    state.ids.set('persist:naver-login', ['alpha']);
    expect((await naverSessionStatus('beta')).loggedIn).toBe(false);
  });
  it('logging out beta leaves alpha connected and detects expiry', async () => {
    state.ids.set('persist:naver-login', ['alpha']);
    state.ids.set('persist:naver-blog-beta', ['beta']);
    await naverSessionStatus('beta');
    await clearNaverSession('beta');
    expect((await naverSessionStatus('alpha')).loggedIn).toBe(true);
    expect((await naverSessionStatus('beta')).loggedIn).toBe(false);
  });
});
