import { describe, expect, it, vi } from 'vitest';
import { createBriefRecovery, type BriefRecoveryDue } from '../../main/topic-brief-recovery';

const start = Date.parse('2026-10-03T09:00:00Z');
const due: BriefRecoveryDue = { day: '2026-10-03', slot: '저녁', dueAtMs: start - 3600000 };
const board = { builtAt: new Date(start).toISOString(), day: due.day, slot: due.slot, briefs: [{ title: '지원금 조건 확인', coreKeyword: '지원금 조건', field: '정책', facts: [{ id: 'f1', title: '지원금', link: 'https://example.test' }] }] };
function harness() {
  let now = start;
  const deps = { enabled: () => true, read: vi.fn((): unknown => board), generate: vi.fn(async (_due: typeof due): Promise<unknown> => board), publish: vi.fn(async (_raw: unknown) => ({ status: 'published' as const, reason: 'app_board_published' })), now: () => now };
  return { deps, advance: (ms: number) => { now += ms; }, ...createBriefRecovery(deps) };
}

describe('operator brief watchdog recovery', () => {
  it('disabled operation does not read, generate or publish', async () => {
    const h = harness(); h.deps.enabled = () => false;
    expect(await h.recover(due)).toEqual({ handled: false, ok: false, detail: 'disabled' });
    expect(h.deps.read).not.toHaveBeenCalled();
    expect(h.deps.generate).not.toHaveBeenCalled();
    expect(h.deps.publish).not.toHaveBeenCalled();
  });
  it('publishes the matching fresh local edition without another AI call', async () => {
    const h = harness();
    expect(await h.recover(due)).toMatchObject({ handled: true, ok: true });
    expect(h.deps.publish).toHaveBeenCalledWith(board);
    expect(h.deps.generate).not.toHaveBeenCalled();
    expect(await h.recover(due)).toMatchObject({ ok: true, detail: 'already_recovered' });
    expect(h.deps.publish).toHaveBeenCalledOnce();
  });
  it.each([
    null, { ...board, briefs: [] }, { ...board, builtAt: '2026-10-01T09:00:00Z' },
    { ...board, builtAt: '2026-10-03T09:10:00Z' }, { ...board, slot: '아침' }, { ...board, day: '2026-10-02' },
  ])('regenerates when the saved edition is empty, stale, future or a different round', async saved => {
    const h = harness(); h.deps.read.mockReturnValue(saved);
    expect(await h.recover(due)).toMatchObject({ ok: true });
    expect(h.deps.generate).toHaveBeenCalledOnce();
    expect(h.deps.generate).toHaveBeenCalledWith(due);
    expect(h.deps.publish).toHaveBeenCalledWith(board);
  });
  it('shares a single operation across parallel requests', async () => {
    const h = harness(); h.deps.read.mockReturnValue(null);
    let finish!: (value: unknown) => void;
    h.deps.generate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = h.recover(due), second = h.recover(due);
    expect(first).toBe(second);
    expect(await h.recover({ ...due, slot: '오후' })).toMatchObject({ detail: 'recovery_in_progress' });
    finish(board);
    expect(await first).toMatchObject({ ok: true });
    expect(h.deps.generate).toHaveBeenCalledOnce();
    expect(h.deps.publish).toHaveBeenCalledOnce();
  });
  it('retains generated content and retries publication after cooldown without regenerating', async () => {
    const h = harness(); h.deps.read.mockReturnValue(null);
    h.deps.publish.mockRejectedValueOnce(new Error('PRIVATE token'));
    expect(await h.recover(due)).toEqual({ handled: true, ok: false, detail: 'app_recovery_failed' });
    expect(await h.recover(due)).toMatchObject({ detail: 'recovery_cooldown' });
    expect(h.deps.generate).toHaveBeenCalledOnce();
    h.advance(30 * 60000);
    expect(await h.recover(due)).toMatchObject({ ok: true });
    expect(h.deps.generate).toHaveBeenCalledOnce();
    expect(h.deps.publish).toHaveBeenCalledTimes(2);
    expect(h.deps.publish.mock.calls[1][0]).toBe(board);
  });
  it.each([null, { ...board, briefs: [] }, { ...board, builtAt: '2026-10-02T09:00:00Z' }, { ...board, builtAt: '2026-10-04T09:00:00Z' }, { ...board, slot: '아침' }])('never publishes invalid generation or changes its date', async generated => {
    const h = harness(); h.deps.read.mockReturnValue(null); h.deps.generate.mockResolvedValue(generated);
    expect(await h.recover(due)).toMatchObject({ ok: false });
    expect(h.deps.publish).not.toHaveBeenCalled();
  });
  it('does not swallow a skipped-invalid publication as success', async () => {
    const h = harness(); h.deps.publish.mockResolvedValue({ status: 'skipped', reason: 'invalid_or_stale_board' } as any);
    expect(await h.recover(due)).toMatchObject({ ok: false });
  });
  it.each(['already_published', 'newer_remote', 'richer_remote_round'])('recognizes a preserved remote edition (%s)', async reason => {
    const h = harness(); h.deps.publish.mockResolvedValue({ status: 'skipped', reason } as any);
    expect(await h.recover(due)).toMatchObject({ ok: true, detail: 'remote_briefs_preserved' });
  });
  it('never throws provider or configuration errors to callers', async () => {
    const h = harness(); h.deps.enabled = () => { throw new Error('PRIVATE'); };
    expect(await h.recover(due)).toEqual({ handled: true, ok: false, detail: 'app_recovery_unavailable' });
  });
});
