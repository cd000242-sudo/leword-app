import { describe, expect, it } from 'vitest';
import { describeBlogFacts, rhythmLabel } from '../blog-class/plain-words';

/**
 * 내 블로그 카드의 리듬 문장(2026-09-11).
 *
 * 실측한 거짓 문장(userData/blog-class/latest.json, 2026-09-10T11:00Z, leadernam-):
 *   "최근 30일에 8개를 올렸어요. 거의 매일 한 편씩 올려요."
 * 30일에 8개는 거의 매일이 아니다. 한 문장이 두 개의 다른 창(최근 30일 / 표본 전체 190일)에서
 * 온 숫자를 이어 붙여 만들어졌다. 표본 전체의 중간 간격은 0일이었고(6개월간 200편) 최근에 느려졌는데,
 * 카드는 그 변화를 '거의 매일'로 덮었다.
 *
 * 규칙: **숫자마다 자기 창을 달고 나온다.** 최근 30일 리듬은 최근 30일 수에서 뽑고,
 * 표본 전체 리듬은 따로 적는다. 잰 값을 안 버리되 섞지도 않는다.
 */
const facts = (recent30: number, medianGapDays: number, over: any = {}) => describeBlogFacts({
  measuredAt: '2026-09-11T00:00:00.000Z',
  oldestPostOn: '2026-02-27',
  isInfluencer: null,
  snapshot: { blogId: 'x', postCount: 452 } as any,
  activity: {
    totalPosts: 200, oldestPostOn: '2026-02-27', newestPostOn: '2026-09-05',
    monthsRunning: 6, recent30, recent90: 27, medianGapDays, searchableCount: 200, blockedCount: 0,
  } as any,
  ...over,
});

const rhythmLine = (card: any) => (card.lines || []).map((l: any) => l.text).find((t: string) => t.includes('최근 30일')) || '';

describe('리듬 문장이 자기 창을 달고 나온다', () => {
  it('실측한 거짓 문장을 다시 만들지 않는다 — 30일에 8개는 거의 매일이 아니다', () => {
    const line = rhythmLine(facts(8, 0));
    expect(line).toContain('최근 30일에 8개');
    expect(line, `여전히 거짓: ${line}`).not.toContain('거의 매일');
  });

  it('최근 30일 리듬은 최근 30일 수에서 나온다', () => {
    expect(rhythmLine(facts(30, 5))).toContain('거의 매일');
    expect(rhythmLine(facts(8, 0))).toMatch(/3~4일에 한 편|3일에 한 편|4일에 한 편/);
    expect(rhythmLine(facts(1, 0))).toContain('4주에 한 편'); // rhythmLabel 눈금 그대로 — 새 눈금을 하나 더 만들지 않는다
  });

  it('표본 전체 리듬은 자기 창(며칠을 쟀는지)을 밝히고 따로 적는다', () => {
    const card = facts(8, 0);
    const all = (card.lines || []).map((l: any) => l.text).find((t: string) => t.includes('전체'));
    expect(all, '표본 전체 리듬 줄이 없다').toBeTruthy();
    expect(all).toContain('2월 27일');
    expect(all).toContain('9월 5일');
  });

  it('최근 30일과 표본 전체가 같은 리듬이면 한 줄로 끝낸다 — 같은 말을 두 번 안 한다', () => {
    const card = facts(30, 1);
    const lines = (card.lines || []).map((l: any) => l.text);
    expect(lines.filter((t: string) => t.includes('한 편')).length).toBe(1);
  });

  it('최근 30일에 글이 없으면 그대로 적는다', () => {
    expect(rhythmLine(facts(0, 3))).toBe('최근 30일에 올린 글이 없어요.');
    const lines = (facts(0, 3).lines || []).map((l: any) => l.text);
    expect(lines.some((t: string) => t.includes('최근 30일에 올린 글이 없어요'))).toBe(true);
  });
});

describe('rhythmLabel 은 그대로 둔다 — 다른 데서도 쓴다', () => {
  it('간격을 사람 말로 바꾼다', () => {
    expect(rhythmLabel(0)).toContain('거의 매일');
    expect(rhythmLabel(4)).toContain('4일에 한 편');
    expect(rhythmLabel(null)).toBe(null);
  });
});
