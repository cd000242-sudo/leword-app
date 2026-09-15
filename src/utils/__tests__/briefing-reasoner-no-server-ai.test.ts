import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inferBriefingSearchReasons } from '../../../apps/api/src/briefing-manus-reasoner';

/**
 * 모바일 서버는 서버 환경변수의 API 키로 AI 를 부르지 않는다(2026-09-16 사장님 결정 "서버 키 경로를 코드에서 제거" ·
 * "Manus 도 지우기"). 관리자 브리핑의 검색 이유 추론은 Claude(ANTHROPIC_API_KEY) → Manus(MANUS_API_KEY) 순으로
 * 유료 호출을 했다. 이제 키가 들어 있어도 아무 곳도 부르지 않고 이유 없이 돌려준다 — 브라우저가 사전 · 규칙으로 채운다.
 */
const saved = { anthropic: process.env.ANTHROPIC_API_KEY, manus: process.env.MANUS_API_KEY };
const fetchSpy = vi.fn();

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-server-key';
  process.env.MANUS_API_KEY = 'manus-test-server-key';
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (saved.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved.anthropic;
  if (saved.manus === undefined) delete process.env.MANUS_API_KEY;
  else process.env.MANUS_API_KEY = saved.manus;
});

describe('브리핑 검색 이유 추론 — 서버 AI 없음', () => {
  it('서버에 Claude · Manus 키가 있어도 부르지 않고 이유 없이 돌려준다', async () => {
    const result = await inferBriefingSearchReasons([{ keyword: '원피스 이무 앵무새', searchVolume: 1200 }]);
    expect(result).toEqual({ reasons: {}, status: 'disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('빈 목록은 그대로 끝낸다', async () => {
    await expect(inferBriefingSearchReasons([])).resolves.toEqual({ reasons: {}, status: 'ok' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
