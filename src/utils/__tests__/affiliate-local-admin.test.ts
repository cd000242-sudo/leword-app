/**
 * 제휴 수집 버튼은 관리자 PC 에서만 돈다(2026-10-06 사장님 "관리자만 건들 수 있게").
 * 관리자 = 운영자 발행 설정(affiliate-local/publish.json enabled)이 켜진 PC. 남의 앱에는 버튼이 그려지지 않고,
 * 화면을 우회해 invoke 를 불러도 처리기가 거부해 수집 프로세스를 띄우지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ operator: false, spawns: 0, handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/affiliate-admin-user' },
  ipcMain: {
    listenerCount: (channel: string) => (state.handlers.has(channel) ? 1 : 0),
    handle: (channel: string, fn: (...args: any[]) => any) => state.handlers.set(channel, fn),
  },
  Notification: { isSupported: () => false },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('../../main/topic-brief-preferences', () => ({ readBriefProvider: () => 'codex' }));
vi.mock('../../main/affiliate-publisher', () => ({
  isAffiliatePublishingEnabled: () => state.operator,
  publishAffiliateSnapshot: vi.fn(async () => ({ status: 'published', reason: 'published' })),
}));
vi.mock('child_process', () => ({ spawn: () => { state.spawns += 1; throw new Error('수집 프로세스를 띄우면 안 된다'); } }));

import { setupAffiliateLocalHandlers } from '../../main/handlers/affiliate-local';

beforeEach(() => {
  state.handlers.clear();
  state.spawns = 0;
  setupAffiliateLocalHandlers();
});

describe('제휴 수집 관리자 전용', () => {
  it('상태 창구가 이 PC 가 관리자인지 알려 준다', async () => {
    state.operator = false;
    expect((await state.handlers.get('affiliate-local-state')!({})).operator).toBe(false);
    state.operator = true;
    expect((await state.handlers.get('affiliate-local-state')!({})).operator).toBe(true);
  });
  it('관리자가 아니면 실행을 거부하고 수집 프로세스를 띄우지 않는다', async () => {
    state.operator = false;
    const res = await state.handlers.get('affiliate-local-run')!({}, { login: true });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/관리자/);
    expect(state.spawns).toBe(0);
  });
});
