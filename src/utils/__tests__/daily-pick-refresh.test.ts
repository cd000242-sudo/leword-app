import { describe, expect, it } from 'vitest';
import { pickCheckDue, pickNeedsRebuild, PICK_CHECK_MS, PICK_REMEASURE_MS } from '../daily-pick-refresh';
describe('five-minute recommendation refresh', () => {
  const now = Date.parse('2026-10-15T00:00:00Z');
  const state = { blogId: 'alpha', checkedAt: new Date(now).toISOString(), generatedAt: new Date(now).toISOString(), fingerprint: 'a' };
  it('checks every five minutes and recovers after a sleep or invalid timestamp', () => {
    expect(pickCheckDue(state, now + PICK_CHECK_MS - 1)).toBe(false);
    expect(pickCheckDue(state, now + PICK_CHECK_MS)).toBe(true);
    expect(pickCheckDue(null, now)).toBe(true);
    expect(pickCheckDue({ ...state, checkedAt: 'bad' }, now)).toBe(true);
  });
  it('reuses unchanged results but rebuilds changed or missing results', () => {
    expect(pickNeedsRebuild(state, 'a', true, now + PICK_CHECK_MS)).toBe(false);
    expect(pickNeedsRebuild(state, 'b', true, now + PICK_CHECK_MS)).toBe(true);
    expect(pickNeedsRebuild(state, 'a', false, now)).toBe(true);
    expect(pickNeedsRebuild(state, 'a', true, now + PICK_REMEASURE_MS)).toBe(true);
  });
});
