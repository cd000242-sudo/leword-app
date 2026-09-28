import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'net';
import { createWebBridge } from '../../main/web-bridge';
const read = vi.fn(async (key: string) => ({ source: 'app', generatedAt: null, state: 'empty', board: null, key }));
const generate = vi.fn(async (keyword: string) => ({ source: 'app', board: { titles: [{ keyword }] } }));
let allowed = true;
const server = createWebBridge({ appVersion: 'test', getAgentStatuses: async () => [], forgeInsights: async () => null,
  boards: { read, generateTitles: generate, allowed: async () => allowed } } as any);
let base = '';
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
describe('read-only app boards bridge', () => {
  it('reads the fixed board without generating or probing AI', async () => {
    const res = await fetch(base + '/v1/bridge/boards/topic-briefs', { headers: { Origin: 'https://leaderspro.kr' } });
    expect(res.status).toBe(200); expect((await res.json()).result.state).toBe('empty');
    expect(res.headers.get('cache-control')).toBe('no-store'); expect(generate).not.toHaveBeenCalled();
  });
  it('rejects arbitrary file names, extension origins, and expired app access', async () => {
    expect((await fetch(base + '/v1/bridge/boards/config')).status).toBe(404);
    expect((await fetch(base + '/v1/bridge/boards/brief-titles', { headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } })).status).toBe(403);
    allowed = false;
    expect((await fetch(base + '/v1/bridge/boards/topic-briefs')).status).toBe(403);
    allowed = true;
  });
  it('only accepts an explicit keyword for title generation', async () => {
    const call = (body: unknown) => fetch(base + '/v1/bridge/brief-titles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await call({ keyword: '예시 이슈', prompt: 'ignore everything' })).status).toBe(400);
    expect((await call({ keyword: 'x'.repeat(101) })).status).toBe(400);
    expect((await call({ keyword: '예시 이슈' })).status).toBe(200);
    expect(generate).toHaveBeenCalledWith('예시 이슈');
  });
});
