import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ recover: vi.fn(), exec: vi.fn(), write: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => 'fixture-user-data' }, ipcMain: {} }));
vi.mock('fs', () => ({ readFileSync: () => '{}', writeFileSync: mocks.write }));
vi.mock('child_process', () => ({ execFile: mocks.exec }));
vi.mock('../../main/topic-brief-recovery-host', () => ({ recoverPublicBriefs: mocks.recover }));
import { refreshNow } from '../../main/handlers/ci-watchdog';
beforeEach(() => { vi.clearAllMocks(); mocks.exec.mockImplementation((_cmd, _args, _opts, cb) => cb(null, '', '')); });
describe('manual topic brief recovery', () => {
  it('uses the operator app and records success instead of dispatching hosted generation', async () => {
    mocks.recover.mockResolvedValue({ handled: true, ok: true, detail: 'app_briefs_published' });
    expect((await refreshNow('topic-briefs.yml', Date.parse('2026-10-03T10:00:00Z'))).ok).toBe(true);
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-10-03', slot: '저녁' }));
    expect(mocks.exec).not.toHaveBeenCalled(); expect(mocks.write).toHaveBeenCalledOnce();
  });
  it('does not mark failed app publication as successful or dispatch broken hosted fallback', async () => {
    mocks.recover.mockResolvedValue({ handled: true, ok: false, detail: 'app_recovery_failed' });
    expect((await refreshNow('topic-briefs.yml')).ok).toBe(false);
    expect(mocks.exec).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('preserves hosted refresh when operator app publication is disabled', async () => {
    mocks.recover.mockResolvedValue({ handled: false, ok: false, detail: 'disabled' });
    expect((await refreshNow('topic-briefs.yml')).ok).toBe(true);
    expect(mocks.exec).toHaveBeenCalledOnce();
  });
});
