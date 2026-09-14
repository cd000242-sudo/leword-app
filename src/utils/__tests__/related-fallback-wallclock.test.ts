import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withWallClock } from '../related-keyword-fallback';

/**
 * 연관어 폴백에 벽시계 상한을 씌운다 (2026-09-15).
 *
 * 실사고 — 선점 보드 발굴 샤드 4개가 09-12 부터 **매 회차 240분 제한에 걸려 잘렸다.**
 * 황금키워드 보드가 09-09 이후 6일간 안 바뀌었다. 샤드 0 로그를 세니:
 *   fetchRelatedKeywordsMulti 한 번 = 중앙값 21,194ms · 90% 21,410ms · 최대 22,467ms (2,361회)
 *   09-07 정상 회차          = 중앙값  3,210ms · 90%  4,333ms · 최대  4,848ms (  902회)
 *
 * 20초의 정체: 다섯 HTTP 소스는 axios timeout 5초를 받지만, 검색광고 소스는
 * naver-searchad-api 의 native fetch(20초 abort)를 타서 상한 밖이었다. 검색광고가 응답을
 * 물고 있으면 매 씨앗마다 20초를 꼬박 기다렸고, catch 가 [] 를 돌려 "6/6 소스 성공"으로
 * 찍혔다 — 실패가 성공으로 보였다.
 *
 * 여기서 잠그는 것: ① 상한을 넘긴 약속은 **거절**된다(빈 값으로 해결되지 않는다 — 그래야
 * 집계에 실패로 잡힌다) ② 제때 온 것은 그대로 통과한다 ③ 타이머를 반드시 거둔다
 * ④ 모듈이 실제로 모든 소스에 이 상한을 씌운다.
 */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'related-keyword-fallback.ts'), 'utf8');

describe('withWallClock', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('제때 오면 그 값을 그대로 돌려준다', async () => {
    const p = withWallClock(Promise.resolve(['a', 'b']), 5_000);
    await expect(p).resolves.toEqual(['a', 'b']);
  });

  it('상한을 넘기면 거절한다 — 빈 값으로 해결하지 않는다', async () => {
    const hang = new Promise<string[]>(() => { /* 영원히 안 온다 — 20초 abort 를 흉내낸다 */ });
    const p = withWallClock(hang, 5_000);
    const settled = p.then(() => 'resolved', (e: Error) => `rejected:${e.message}`);
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(settled).resolves.toBe('rejected:wall-clock 5000ms 초과');
  });

  it('본 약속이 거절되면 그 이유가 그대로 나온다 — 상한 오류로 덮어쓰지 않는다', async () => {
    const p = withWallClock(Promise.reject(new Error('원래 실패')), 5_000);
    await expect(p).rejects.toThrow('원래 실패');
  });

  it('끝나면 타이머를 거둔다 — 회차마다 수천 개가 이벤트 루프를 붙잡으면 안 된다', async () => {
    await withWallClock(Promise.resolve(1), 5_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('제때 온 뒤에는 상한이 지나도 아무 일도 없다', async () => {
    const p = withWallClock(Promise.resolve('ok'), 5_000);
    await expect(p).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('모듈이 실제로 모든 소스에 상한을 씌운다', () => {
  it('allSettled 에 들어가는 모든 작업이 withWallClock 을 거친다', () => {
    expect(SRC, '소스 목록에 상한을 안 씌운다').toMatch(/Promise\.allSettled\(tasks\.map\(\(task\) => withWallClock\(task, FALLBACK_TIMEOUT\)\)\)/);
    // 옛 모양이 남아 있으면 검색광고 소스가 20초까지 매달린다
    expect(SRC).not.toMatch(/Promise\.allSettled\(tasks\);/);
  });

  it('상한은 소스별 HTTP timeout 과 같은 값이다 — 두 숫자가 따로 놀면 한쪽이 거짓이 된다', () => {
    expect(SRC).toMatch(/const FALLBACK_TIMEOUT = 5000;/);
  });

  it('시간 초과로 끊긴 소스를 로그에 따로 센다 — "6/6 성공"이 실패를 감추던 것이 사고였다', () => {
    expect(SRC).toContain('시간초과');
    expect(SRC).toMatch(/r\.status === 'rejected' && \/wall-clock\//);
  });
});
