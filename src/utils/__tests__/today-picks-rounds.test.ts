import { describe, expect, it } from 'vitest';
const { roundAt, cachedMeasurement, canPublish, describeChanges } = require('../../../scripts/today-picks-rounds');
const at = (time: string) => Date.parse(`2026-09-28T${time}:00+09:00`);

describe('추천키워드 하루 세 회차', () => {
  it('한국 오전·오후·저녁 경계와 자정 이후 직전 회차를 보존한다', () => {
    expect(roundAt(at('06:29')).id).toBe('2026-09-27-evening');
    expect(roundAt(at('06:30')).id).toBe('2026-09-28-morning');
    expect(roundAt(at('13:30')).id).toBe('2026-09-28-afternoon');
    expect(roundAt(at('19:30')).id).toBe('2026-09-28-evening');
  });
  it('24시간 이내 유효 실측만 재사용하며 원래 실측 시각을 유지한다', () => {
    const now = at('19:30');
    const valid = { count: 123, measuredAt: new Date(now - 20 * 3600000).toISOString() };
    expect(cachedMeasurement(valid, now)).toEqual(valid);
    for (const row of [null, { ...valid, count: -1 }, { ...valid, count: NaN }, { ...valid, measuredAt: 'bad' }, { ...valid, measuredAt: new Date(now + 1).toISOString() }, { ...valid, measuredAt: new Date(now - 24 * 3600000).toISOString() }]) {
      expect(cachedMeasurement(row, now)).toBeNull();
    }
  });
  it('빈 결과·API 다수 실패·기존 주제 소실은 발행하지 않는다', () => {
    const prior = { topics: [{ topic: '경제', rows: [{ keyword: '기존' }] }] };
    expect(canPublish({ topics: [] }, prior, 0, 0)).toBe(false);
    expect(canPublish({ topics: [{ topic: '경제', rows: [{ keyword: '새말' }] }] }, prior, 10, 7)).toBe(false);
    expect(canPublish(prior, prior, 10, 8)).toBe(true);
    // 판 전체가 깨진 것(직전 판의 절반 미만)은 막는다
    expect(canPublish(prior, { topics: [{ topic: '경제', rows: Array(10).fill({}) }] }, 10, 10)).toBe(false);
  });
  // 2026-10-13 7일 재추천 금지 뒤 13:30 · 19:30 회차 연달아 실패 — 사진 0 · 원예 7 · 좋은글 8 처럼 후보가 바닥난 주제 때문에
  // '기존 주제 소실 · 80% 미만' 규칙이 판 전체를 막았다. 후보 소진은 실패가 아니다 — 실측 실패와 판 전체 붕괴만 막는다.
  it('후보가 바닥나 일부 주제가 비거나 줄어도(직전 판의 절반 이상) 발행한다', () => {
    const prior = { topics: ['경제', '여행', '사진', '원예'].map((topic) => ({ topic, rows: Array(30).fill({}) })) };
    // 67 / 120 행 — 꽉 찬 주제 둘 + 바닥난 주제 둘(실제 10/13 회차: 사진 0 · 원예 7)
    const next = { topics: [{ topic: '경제', rows: Array(30).fill({}) }, { topic: '여행', rows: Array(30).fill({}) }, { topic: '사진', rows: [] }, { topic: '원예', rows: Array(7).fill({}) }] };
    expect(canPublish(next, prior, 100, 100)).toBe(true);
    expect(canPublish({ topics: [{ topic: '경제', rows: [] }, { topic: '여행', rows: [{}] }] }, { topics: [{ topic: '경제', rows: [{}] }] }, 10, 10)).toBe(true);
  });
  it('처음 게시·신규·수치 변경·유지 건수를 구분한다', () => {
    const old = { topics: [{ rows: [{ keyword: '가 나', documentCount: 10, searchVolume: 100 }, { keyword: '유지', documentCount: 10, searchVolume: 200 }] }] };
    const next = { topics: [{ rows: [{ keyword: '가나', documentCount: 11, searchVolume: 100 }, { keyword: '유지', documentCount: 10, searchVolume: 200 }, { keyword: '신규', documentCount: 20, searchVolume: 300 }] }] };
    expect(describeChanges(next, old)).toEqual({ added: 1, changed: 1, retained: 1 });
    expect(describeChanges(next, null).added).toBe(3);
  });
});
