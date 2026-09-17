import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), deps: { stories: vi.fn(async () => ({ stories: [] })), collect: vi.fn(), story: vi.fn(), brief: vi.fn(), selectEditorial: vi.fn(), shareEditorial: vi.fn(), draft: vi.fn() } }));
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, fn: any) => { if (mocks.handlers.has(key)) throw new Error('duplicate handler'); mocks.handlers.set(key, fn); }, listenerCount: () => 0 } }));
vi.mock('../../main/homefeed/host', () => ({ createHomefeedHostDeps: () => mocks.deps }));
import { registerHomefeedHandlers } from '../../main/handlers/homefeed-handlers';

describe('홈판 작성안 앱 IPC', () => {
  it('목록·상세·작성안·선택·원고 창구를 중복 등록하지 않는다', () => {
    registerHomefeedHandlers();
    expect([...mocks.handlers.keys()]).toEqual(expect.arrayContaining(['homefeed-stories', 'homefeed-collect', 'homefeed-story', 'homefeed-brief', 'homefeed-select-editorial', 'homefeed-share-editorial', 'homefeed-draft']));
    expect(() => registerHomefeedHandlers()).not.toThrow();
  });

  it.each([['homefeed-story', 'story'], ['homefeed-brief', 'brief'], ['homefeed-select-editorial', 'selectEditorial'], ['homefeed-share-editorial', 'shareEditorial'], ['homefeed-draft', 'draft']])('%s는 버전과 편집 내용을 공용 서비스에 그대로 전달한다', async (channel, method) => {
    registerHomefeedHandlers();
    const input = { id: '남산:issue', briefRevision: 'brief-3', evidenceRevision: 'ev-2', expectedRevision: 2, selectionRevision: 3, card: { line1: '수정한 문구', line2: '둘째 줄' }, imageId: 'source-1' };
    const handler = mocks.handlers.get(channel);
    expect(handler).toBeTypeOf('function');
    const mocked = mocks.deps[method as 'story' | 'brief' | 'selectEditorial' | 'shareEditorial' | 'draft']; mocked.mockResolvedValueOnce({ saved: true });
    expect(await handler!({}, input)).toEqual({ success: true, result: { saved: true } });
    expect(mocked).toHaveBeenLastCalledWith(input);
  });

  it('서비스의 저장 충돌·검증 실패를 성공으로 응답하지 않는다', async () => {
    registerHomefeedHandlers(); mocks.deps.selectEditorial.mockRejectedValueOnce(new Error('선택이 다른 화면에서 변경되었습니다.'));
    const handler = mocks.handlers.get('homefeed-select-editorial'); expect(handler).toBeTypeOf('function');
    expect(await handler!({}, { id: 'issue', expectedRevision: 0 })).toEqual({ success: false, error: '선택이 다른 화면에서 변경되었습니다.' });
  });
});
