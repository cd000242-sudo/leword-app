import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const state = vi.hoisted(() => ({ dir: '', handlers: new Map<string, (...args: any[]) => Promise<any>>(), hunt: vi.fn(), rows: [] as any[] }));
vi.mock('electron', () => ({ app: { getPath: () => state.dir }, ipcMain: { listenerCount: (key: string) => Number(state.handlers.has(key)), handle: (key: string, fn: any) => state.handlers.set(key, fn) } }));
vi.mock('../issue-niche-hunter', () => ({ huntIssueNicheBoard: state.hunt }));
vi.mock('../issue-slot-measure', () => ({ readSlotCache: () => ({}), planSlotMeasurement: () => ({ targets: [] }), applySlotResults: () => ({ cache: {}, ledgerRows: state.rows }) }));
vi.mock('../environment-manager', () => ({ EnvironmentManager: { getInstance: () => ({ getConfig: () => ({ naverClientId: 'fixture', naverClientSecret: 'fixture' }) }) } }));
vi.mock('../local-serp-fetch', () => ({ localSerpFetch: vi.fn(), localSerpStats: () => ({ consecutiveBlocked: 0 }) }));
import { setupRealtimeNicheHandlers, stopRealtimeNicheScheduler } from '../../main/handlers/realtime-niche';
const stamp = '2026-09-28T04:00:00.000Z';
const issue = { issue: '서울 축제', issueType: 'fresh', headlines: [{ title: '서울 축제 개막', link: 'https://news.naver.com/a' }], why: '서울 축제가 개막했다.', nextWave: [{ keyword: '서울 축제 일정', reason: '방문 일정 확인' }], source: 'signal.bz' };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(stamp));
  state.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-realtime-'));
  state.handlers.clear(); state.hunt.mockReset();
  state.rows = [{ keyword: '서울 축제', baseKeyword: '서울 축제', issueType: 'fresh', source: 'signal.bz', origin: 'head',
    isNiche: true, searchVolume: 320, documentCount: 1200, isDocumentCountEstimated: false, isSearchVolumeEstimated: false,
    hasLiveDemand: true, demandRecent7: 40, demandRatio: 1.8, demandStatus: 'rising', trafficGate: true, demandGate: true,
    slotStatus: 'winnable', serp: { verdict: 'WINNABLE', reason: '정면 0건', exactTitleHits: 0, partialTitleHits: 1, sampledTitles: 10, topTitles: ['상위 제목'], measuredAt: stamp },
    nicheRoute: 'triple', reasons: ['실측 수요 확인'] }];
  state.hunt.mockImplementation(async () => ({ rows: state.rows, issues: [issue] }));
  setupRealtimeNicheHandlers();
});
afterEach(() => { stopRealtimeNicheScheduler(); vi.useRealTimers(); fs.rmSync(state.dir, { recursive: true, force: true }); });
const run = () => state.handlers.get('realtime-niche-run')!({ sender: { send: vi.fn() } });
describe('desktop success snapshots preserve the complete issue briefing', () => {
  it('saves public evidence and flow beside the existing app result', async () => {
    expect((await run()).success).toBe(true);
    const publicFile = JSON.parse(fs.readFileSync(path.join(state.dir, 'realtime-niche', 'public-board.json'), 'utf8'));
    expect(publicFile.issues[0].why).toBe(issue.why);
    expect(publicFile.issues[0].headlines[0].title).toBe('서울 축제 개막');
    expect(publicFile.issues[0].nextWave[0].keyword).toBe('서울 축제 일정');
    expect(publicFile.rows[0].serp.exactTitleHits).toBe(0);
  });
  it('leaves both successful files unchanged after zero results, cancellation or a provider failure', async () => {
    await run();
    const files = ['latest.json', 'public-board.json'].map(name => path.join(state.dir, 'realtime-niche', name));
    const before = files.map(file => fs.readFileSync(file, 'utf8'));
    const savedRows = state.rows;
    state.rows = []; expect((await run()).success).toBe(false);
    state.rows = savedRows;
    state.hunt.mockImplementationOnce(async () => { await state.handlers.get('realtime-niche-abort')!(); return { rows: state.rows, issues: [issue] }; });
    expect((await run()).success).toBe(false);
    state.hunt.mockRejectedValueOnce(new Error('provider unavailable'));
    expect((await run()).success).toBe(false);
    expect(files.map(file => fs.readFileSync(file, 'utf8'))).toEqual(before);
  });
});
