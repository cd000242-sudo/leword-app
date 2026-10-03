import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ files: new Map<string, string>(), spawns: [] as any[], code: 0, enrichCode: 0 }));
vi.mock('electron', () => ({ app: { getPath: () => 'C:/affiliate-test-user' }, ipcMain: {}, Notification: { isSupported: () => false }, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('fs', () => ({
  readFileSync: (file: string) => {
    if (state.files.has(file)) return state.files.get(file);
    if (file.endsWith('.js') || file.endsWith('.mjs')) return Buffer.from('// fixture script');
    throw new Error('ENOENT');
  },
  writeFileSync: (file: string, body: any) => state.files.set(file, String(body)),
  existsSync: (file: string) => file.endsWith('affiliate-campaigns-public.json'),
  mkdirSync: () => {}, statSync: () => ({ isDirectory: () => true }),
}));
vi.mock('../../main/topic-brief-preferences', () => ({ readBriefProvider: () => 'codex' }));
const publish = vi.hoisted(() => vi.fn(async () => ({ status: 'published', reason: 'published' })));
vi.mock('../../main/affiliate-publisher', () => ({ isAffiliatePublishingEnabled: () => true, publishAffiliateSnapshot: publish }));
vi.mock('child_process', () => ({ spawn: (...args: any[]) => {
  state.spawns.push(args);
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = vi.fn();
  queueMicrotask(() => {
    const collect = String(args[1][2]).endsWith('affiliate-refresh.js');
    const snapshot = `${args[2].cwd}\\tmp\\affiliate-campaigns-public.json`;
    if (collect && [0, 3].includes(state.code)) state.files.set(snapshot, JSON.stringify({ checkedAt: new Date().toISOString(), sites: { toss: { status: 'ready', collectedAt: new Date().toISOString(), items: [{name:'상품'}] } } }));
    child.stdout.emit('data', Buffer.from('이번 수집: toss 1건\n'));
    child.emit('close', collect ? state.code : state.enrichCode);
  });
  return child;
} }));
import { runAffiliateCycle } from '../../main/handlers/affiliate-local';
beforeEach(() => { state.files.clear(); state.spawns.length = 0; state.code = 0; state.enrichCode = 0; publish.mockClear(); });
describe('installed affiliate recovery runtime', () => {
  it('collects without a site checkout and publishes the enriched snapshot with selected engine', async () => {
    const run = await runAffiliateCycle('manual');
    expect(run.ok).toBe(true); expect(publish).toHaveBeenCalledTimes(1);
    expect(state.spawns[0][1]).toContain('--localOnly');
    expect(state.spawns[0][2].env.NODE_PATH).toMatch(/node_modules$/);
    expect(state.spawns[0][2].env.LEWORD_BRIEF_PROVIDER).toBe('codex');
  });
  it('partial collection still enriches and publishes the successful platform, without claiming full success', async () => {
    state.code = 3;
    const run = await runAffiliateCycle('manual');
    expect(run.ok).toBe(false); expect(state.spawns).toHaveLength(2); expect(publish).toHaveBeenCalledTimes(1);
  });
  it('enrichment failure is recorded as failure for retry rather than a successful day', async () => {
    state.enrichCode = 1;
    expect((await runAffiliateCycle('manual')).ok).toBe(false);
  });
  it('collector failure does not publish a previous snapshot or invoke enrichment', async () => {
    state.code = 1;
    expect((await runAffiliateCycle('manual')).ok).toBe(false);
    expect(state.spawns).toHaveLength(1); expect(publish).not.toHaveBeenCalled();
  });
  it('publication failure retries the saved completed snapshot without collecting or measuring again', async () => {
    publish.mockResolvedValueOnce({ status: 'failed', reason: 'network' });
    expect((await runAffiliateCycle('manual')).ok).toBe(false);
    expect((await runAffiliateCycle('manual')).ok).toBe(true);
    expect(state.spawns).toHaveLength(2); expect(publish).toHaveBeenCalledTimes(2);
  });
  it('a rejected invalid publication is not a successful daily update', async () => {
    publish.mockResolvedValueOnce({ status: 'skipped', reason: 'invalid_or_stale_snapshot' });
    expect((await runAffiliateCycle('manual')).ok).toBe(false);
  });
});
