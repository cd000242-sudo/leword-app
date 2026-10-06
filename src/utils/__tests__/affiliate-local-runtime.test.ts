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
  /*
   * 관리자 수집 버튼(2026-10-06 사장님 "제휴는 내가 수집할 수 있게 버튼 하나 · 관리자만") — 로그인이 끊기면
   * 창 없는 수집은 영영 못 받는다(그날 새벽 회차가 토스 · 브랜드커넥트 둘 다 로그인 필요로 실패).
   */
  it('평소 수집은 창 없이(--headless) 돈다', async () => {
    await runAffiliateCycle('manual');
    expect(state.spawns[0][1]).toContain('--headless');
    expect(state.spawns[0][1]).not.toContain('--autoLogin');
  });
  it('로그인 수집은 보이는 창(--autoLogin)으로 열고, 저장본 재발행으로 건너뛰지 않는다', async () => {
    publish.mockResolvedValueOnce({ status: 'failed', reason: 'network' });
    await runAffiliateCycle('manual');
    state.spawns.length = 0;
    await runAffiliateCycle('manual', { login: true });
    expect(state.spawns[0][1]).toContain('--autoLogin');
    expect(state.spawns[0][1]).not.toContain('--headless');
    expect(state.spawns[0][2].windowsHide).toBe(false);
  });
});
