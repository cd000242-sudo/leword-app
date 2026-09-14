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
 * 21초의 정체: 다섯 HTTP 소스는 axios timeout 5초를 받지만, 검색광고 소스는 HTTP 가 아니라
 * naver-searchad-api 의 **공유 대기열**에 선다 — 샤드 회차의 호출 간격 3.6초 × 동시 주제 6
 * ≈ 21.6초. (처음엔 "native fetch 의 20초 abort" 로 적었는데 틀렸다 — 제안 조회 fetch 에는
 * abort 가 없었고 검색량 조회에만 있었다. 2026-09-15 검증에서 바로잡음.)
 * 그러고도 catch 가 [] 를 돌려 "6/6 소스 성공"으로 찍혔다 — 기다림이 성공으로 보였다.
 *
 * 여기서 잠그는 것: ① 상한을 넘긴 약속은 **거절**된다(빈 값으로 해결되지 않는다 — 그래야
 * 집계에 실패로 잡힌다) ② 제때 온 것은 그대로 통과한다 ③ 타이머를 반드시 거둔다
 * ④ 상한을 넘기면 abort 신호를 보내 **일도 거둔다** ⑤ 모듈이 실제로 모든 소스에 상한을 씌우되
 * 대기열 소스(검색광고)는 20초, HTTP 소스는 5초다 ⑥ 검색광고 제안 조회가 줄에 서기 전에
 * 예산을 보고, 요청에 abort 를 잇는다.
 */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'related-keyword-fallback.ts'), 'utf8');
const SEARCHAD = fs.readFileSync(path.join(__dirname, '..', 'naver-searchad-api.ts'), 'utf8');

describe('withWallClock', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('제때 오면 그 값을 그대로 돌려준다', async () => {
    const p = withWallClock(Promise.resolve(['a', 'b']), 5_000);
    await expect(p).resolves.toEqual(['a', 'b']);
  });

  it('상한을 넘기면 거절한다 — 빈 값으로 해결하지 않는다', async () => {
    const hang = new Promise<string[]>(() => { /* 영원히 안 온다 — 대기열에 갇힌 호출을 흉내낸다 */ });
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

  it('신호를 받는 작업이면 상한을 넘길 때 abort 를 보낸다 — 값만 버리고 비용은 치르는 일이 없게', async () => {
    let aborted = false;
    const p = withWallClock((signal) => new Promise<string[]>(() => {
      signal.addEventListener('abort', () => { aborted = true; });
    }), 5_000);
    const settled = p.then(() => 'resolved', () => 'rejected');
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(settled).resolves.toBe('rejected');
    expect(aborted).toBe(true);
  });

  it('제때 온 작업의 신호는 abort 되지 않는다', async () => {
    let seen: AbortSignal | null = null;
    await withWallClock((signal) => { seen = signal; return Promise.resolve('ok'); }, 5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen!.aborted).toBe(false);
  });
});

describe('모듈이 실제로 모든 소스에 상한을 씌운다', () => {
  it('tasks 에 들어가는 모든 작업이 withWallClock 을 거친다', () => {
    const pushes = (SRC.match(/tasks\.push\(/g) || []).length;
    const wrapped = (SRC.match(/tasks\.push\(withWallClock\(/g) || []).length;
    expect(pushes).toBeGreaterThanOrEqual(6);
    expect(wrapped, '상한 없이 들어가는 소스가 있다').toBe(pushes);
  });

  it('HTTP 소스 상한은 소스별 axios timeout 과 같은 값이다 — 두 숫자가 따로 놀면 한쪽이 거짓이 된다', () => {
    expect(SRC).toMatch(/const FALLBACK_TIMEOUT = 5000;/);
  });

  it('검색광고(대기열) 소스는 20초를 받고, 신호를 넘겨 끊을 때 일도 거둔다', () => {
    expect(SRC).toMatch(/const SEARCHAD_FALLBACK_TIMEOUT = 20000;/);
    expect(SRC).toMatch(/withWallClock\(\(signal\) => fetchSearchAdRelKeywords\(seed, config, signal\)/);
    expect(SRC).toMatch(/\{ maxWaitMs: SEARCHAD_QUEUE_BUDGET_MS, signal \}/);
  });

  it('시간 초과·대기열 거절로 빠진 소스를 로그에 따로 센다 — "6/6 성공"이 실패를 감추던 것이 사고였다', () => {
    expect(SRC).toContain('시간초과');
    expect(SRC).toMatch(/r\.status === 'rejected' && \/wall-clock\//);
    expect(SRC).toContain('대기열 거절');
    // 검색광고 소스가 대기열 거절을 삼키면 "성공"으로 세어진다
    expect(SRC).toMatch(/err\?\.name === 'SearchAdQueueBusyError' \|\| err\?\.name === 'AbortError'\) throw err;/);
  });
});

describe('검색광고 제안 조회가 대기열 예산과 abort 를 안다', () => {
  const fn = SEARCHAD.slice(SEARCHAD.indexOf('export async function getNaverSearchAdKeywordSuggestions('));
  const body = fn.slice(0, fn.indexOf('const selectedSuggestions'));

  it('예산을 넘기는 대기는 줄에 서기 전에 거절한다 — 자리·쿼터·요청을 안 쓴다', () => {
    const check = body.indexOf('throw new SearchAdQueueBusyError(');
    const claim = body.indexOf('lastSearchAdRequestAt = Math.max(');
    const reserve = body.indexOf('reserveSearchAdCall(');
    expect(check).toBeGreaterThan(-1);
    expect(check, '예산 판정이 줄 서기보다 앞이어야 한다').toBeLessThan(claim);
    expect(claim).toBeLessThan(reserve);
  });

  it('기다리는 동안 abort 되면 쿼터를 예약하기 전에 나간다', () => {
    const abortCheck = body.indexOf('options.signal?.aborted');
    const reserve = body.indexOf('reserveSearchAdCall(');
    expect(abortCheck).toBeGreaterThan(-1);
    expect(abortCheck).toBeLessThan(reserve);
  });

  it('요청에 abort 신호가 붙는다 — 예전엔 없어서 값을 버린 뒤에도 요청이 계속 갔다', () => {
    expect(body).toContain('{ method, headers, signal: fetchController.signal }');
  });

  it('대기열 거절과 부른 쪽의 abort 는 삼키지 않는다 — 다른 호출자는 예전처럼 [] 를 받는다', () => {
    expect(fn).toContain("if (error?.name === 'SearchAdQueueBusyError' || (error?.name === 'AbortError' && options.signal?.aborted)) throw error;");
  });
});
