import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('unexpected app path lookup'); } } }));
import { createBoardBridgeDeps } from '../../main/board-bridge-host';
const now = Date.parse('2026-09-28T04:00:00Z');
const at = new Date(now).toISOString();
const legacy = (ranAt = at): any => ({ ranAt, rows: [{ keyword: '서울 축제', baseKeyword: '서울 축제', issueType: 'fresh',
  verdict: 'niche', searchVolume: 320, documentCount: 1200, hasLiveDemand: true, demandStatus: 'rising',
  seat: '열림', seatFacing: 0, seatVacancy: null, reasons: ['앱 측정 결과'], measuredAt: ranAt }] });
function host(files: Record<string, unknown>) {
  const readFile = vi.fn((file: string) => files[path.basename(file)] || null);
  const deps = createBoardBridgeDeps({ userData: () => 'fixture-data', readFile, now: () => now });
  return { deps, readFile };
}
describe('board host reads pre-upgrade successful app results', () => {
  it('returns legacy latest-only rows with their original measurements and without invented articles', async () => {
    const { deps, readFile } = host({ 'latest.json': legacy() });
    const result: any = await deps.read('issue-niche');
    expect(result.state).toBe('ready'); expect(result.source).toBe('app'); expect(result.generatedAt).toBe(at);
    expect(result.board.rows[0]).toMatchObject({ keyword: '서울 축제', searchVolume: 320, documentCount: 1200, measuredAt: at, hasLiveDemand: true });
    expect(result.board.rows[0].serp).toBeUndefined();
    expect(result.board.issues).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('nextWave');
    expect(readFile.mock.calls.map(call => path.basename(call[0]))).toEqual(['public-board.json', 'latest.json']);
  });
  it('prefers public evidence at equal or later timestamps and compares a newer legacy result', async () => {
    const complete = { publishedAt: at, rows: [], issues: [{ issue: '공개 이슈', why: '확인된 보도', headlines: [{ title: '확인된 보도', link: 'https://news.naver.com/a' }] }] };
    for (const legacyAt of [at, new Date(now - 1000).toISOString()]) {
      const { deps } = host({ 'public-board.json': complete, 'latest.json': legacy(legacyAt) });
      expect(((await deps.read('issue-niche')) as any).board.issues[0].why).toBe('확인된 보도');
    }
    const { deps } = host({ 'public-board.json': { ...complete, publishedAt: new Date(now - 1000).toISOString() }, 'latest.json': legacy() });
    expect(((await deps.read('issue-niche')) as any).board.rows[0].keyword).toBe('서울 축제');
  });
  it('does not promote pending/out rows or accept expired and future measurements', async () => {
    for (const data of [legacy(new Date(now - 49 * 3600000).toISOString()), legacy(new Date(now + 3600000).toISOString()),
      { ...legacy(), rows: [{ ...legacy().rows[0], verdict: 'pending' }] },
      { ...legacy(), rows: [{ ...legacy().rows[0], measuredAt: 'invalid' }] }]) {
      const { deps } = host({ 'latest.json': data });
      expect(((await deps.read('issue-niche')) as any).state).toBe('empty');
    }
  });
});
