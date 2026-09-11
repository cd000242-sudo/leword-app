import { describe, expect, it } from 'vitest';
import { LEWORD_PICK_CATEGORY, summarizeProof, type TrackedLike } from '../leword-proof';

/**
 * "그걸 꾸준히 쓰면 성과가 나는거야?" 에 답할 숫자를 만든다(2026-09-11).
 *
 * 지금은 답할 근거가 없다. 노출 추적에 319건이 쌓여 있지만 실측해 보니 쓸 수 없었다:
 *   category 분포 — auto-extracted 307 · naver-home 1 · (없음) 11
 *   '첫 페이지에 든 적 있음' 59건의 검색량을 검색광고에 물었더니 **12/12 전부 "모름"**.
 *   1위 목록: "왕복 벗고 이등병" · "빚더미 고백 돌연" · "모습 성동일 닮은꼴이라니"
 *   → 제목을 잘라 만든 조각이지 검색어가 아니다. 아무도 안 치는 말에서 1위 하는 건 쉽다.
 *
 * 그래서 **LEWORD 가 고른 것만** 따로 표시해 세고, 고를 때 잰 값(검색량·경쟁 글·자리)을 같이 남긴다.
 * 나중에 "정면 2개 이하 · 경쟁 글 3천 이하에서는 올라갔다" 같은 경계가 사장님 블로그 실측으로 나온다.
 *
 * 정직 규칙: 표본이 적으면 **비율을 말하지 않는다.** 3건 중 1건을 33%라 적으면 그건 지어낸 숫자다.
 */
const pick = (over: Partial<TrackedLike> = {}): TrackedLike => ({
  keyword: '베란다 청소 방법',
  category: LEWORD_PICK_CATEGORY,
  registeredAt: '2026-09-01T00:00:00.000Z',
  history: [],
  pick: { source: '오늘 쓸 한 편', searchVolume: 90, documentCount: 3615, seat: '열림', facing: 0, measuredAt: '2026-09-01T00:00:00.000Z' },
  ...over,
});
const ranked = (rank: number | null) => [{ checkedAt: '2026-09-08T00:00:00.000Z', rank }];

describe('LEWORD 가 고른 것만 센다', () => {
  it('자동 추출 조각은 안 센다 — 그게 319건 중 307건이었다', () => {
    const rows = [
      pick(),
      { keyword: '왕복 벗고 이등병', category: 'auto-extracted', registeredAt: '2026-05-16T00:00:00.000Z', history: ranked(1) } as TrackedLike,
    ];
    const out = summarizeProof(rows);
    expect(out.tracked).toBe(1);
    expect(out.excluded).toBe(1);
  });

  it('표시가 없는 옛 기록도 안 센다', () => {
    expect(summarizeProof([{ keyword: 'x', registeredAt: '2026-01-01T00:00:00.000Z', history: ranked(3) } as TrackedLike]).tracked).toBe(0);
  });
});

describe('잰 것만 말한다', () => {
  it('첫 페이지에 든 것을 센다', () => {
    const out = summarizeProof([
      pick({ keyword: 'a', history: ranked(4) }),
      pick({ keyword: 'b', history: ranked(12) }),
      pick({ keyword: 'c', history: ranked(null) }),
    ]);
    expect(out.tracked).toBe(3);
    expect(out.measured).toBe(3);
    expect(out.won).toBe(1);
  });

  it('아직 한 번도 안 잰 것은 분모에서 뺀다 — 안 잰 것을 진 것으로 만들지 않는다', () => {
    const out = summarizeProof([pick({ keyword: 'a', history: ranked(4) }), pick({ keyword: 'b', history: [] })]);
    expect(out.tracked).toBe(2);
    expect(out.measured).toBe(1);
    expect(out.pending).toBe(1);
  });

  it('가장 좋았던 순위를 쓴다 — 한 번 올라갔다 밀린 것도 올라간 것이다', () => {
    const out = summarizeProof([pick({ history: [
      { checkedAt: '2026-09-05T00:00:00.000Z', rank: 7 },
      { checkedAt: '2026-09-09T00:00:00.000Z', rank: 22 },
    ] })]);
    expect(out.won).toBe(1);
    expect(out.rows[0].bestRank).toBe(7);
  });
});

describe('표본이 적으면 비율을 말하지 않는다', () => {
  it('다섯 건 미만이면 비율이 null 이다 — 3건 중 1건을 33%라 적지 않는다', () => {
    const few = Array.from({ length: 4 }, (_, i) => pick({ keyword: 'k' + i, history: ranked(i === 0 ? 3 : 40) }));
    const out = summarizeProof(few);
    expect(out.rate).toBeNull();
    expect(out.note).toMatch(/아직|적/);
  });

  it('충분히 쌓이면 비율을 준다', () => {
    const many = Array.from({ length: 10 }, (_, i) => pick({ keyword: 'k' + i, history: ranked(i < 3 ? 5 : 40) }));
    const out = summarizeProof(many);
    expect(out.rate).toBeCloseTo(0.3, 5);
  });

  it('잰 것이 하나도 없으면 비율이 null 이다', () => {
    expect(summarizeProof([pick({ history: [] })]).rate).toBeNull();
  });
});

describe('갈린 조건을 사실로 남긴다', () => {
  it('올라간 것과 안 올라간 것의 경쟁 글·정면을 따로 모은다', () => {
    const out = summarizeProof([
      pick({ keyword: 'a', history: ranked(4), pick: { source: 's', searchVolume: 90, documentCount: 1200, seat: '열림', facing: 0, measuredAt: '' } }),
      pick({ keyword: 'b', history: ranked(30), pick: { source: 's', searchVolume: 800, documentCount: 90000, seat: '반열림', facing: 5, measuredAt: '' } }),
    ]);
    expect(out.wonMaxDocumentCount).toBe(1200);
    expect(out.lostMinDocumentCount).toBe(90000);
  });

  it('못 잰 값은 경계를 만들지 않는다', () => {
    const out = summarizeProof([pick({ history: ranked(4), pick: { source: 's', searchVolume: null, documentCount: null, seat: null, facing: null, measuredAt: '' } })]);
    expect(out.wonMaxDocumentCount).toBeNull();
  });
});
