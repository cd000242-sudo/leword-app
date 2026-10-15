import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const state = vi.hoisted(() => ({ dir: '', ids: new Map<string, string[]>(), calls: [] as Array<{ partition: string; url: string }> }));
vi.mock('electron', () => ({
  app: { getPath: () => state.dir, userAgentFallback: 'Chrome/130.0.0.0' },
  ipcMain: { listenerCount: () => 0, handle: () => {} },
  session: { fromPartition: (partition: string) => ({
    setUserAgent: () => {},
    cookies: { get: async (query: any) => query.name || !state.ids.has(partition) ? [] : [{ name: 'NID_AUT' }, { name: 'NID_SES' }] },
    fetch: async (url: string) => {
      state.calls.push({ partition, url });
      return { status: 200, text: async () => JSON.stringify({ data: (state.ids.get(partition) || []).map((channelId) => ({ service: 'naver_blog', channelId })) }) };
    },
    clearStorageData: async () => { state.ids.delete(partition); },
  }) },
}));
import { advisorFetch, clearNaverSession, connectedNaverBlogs, naverSessionStatus } from '../../main/handlers/naver-session';
beforeEach(() => { state.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-sessions-')); state.ids.clear(); state.calls.length = 0; });
afterEach(() => fs.rmSync(state.dir, { recursive: true, force: true }));
describe('persistent Naver sessions with verified blog ownership', () => {
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
