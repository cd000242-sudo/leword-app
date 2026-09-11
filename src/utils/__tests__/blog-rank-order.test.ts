import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { orderRankTargets } from '../../main/handlers/blog-class-rank';

/**
 * 순위를 잴 순서(2026-09-11).
 *
 * 전에는 `검색량 큰 것부터` 잰 뒤 maxRank(80)에서 끊었다. 주석은 "상한에서 끊겨도 값이 큰 자리부터 남는다".
 * 그런데 이 단계가 찾는 것은 **내가 이미 이긴 자리**다. 작은 블로그가 이기는 건 작은 말이다.
 *
 * 실측(leadernam-, 최근 100개, 2026-09-11 01:25 회차):
 *   잰 것 80건 — 검색량 160 ~ 137,600, 중간값 1,410
 *   순위를 찾은 것 9건 — 검색량 300·3,610·700·250·560·420·180·970·…
 *     → **9건 전부 3,610 이하, 8건이 1,000 미만.** 큰 말 쪽에서는 거의 안 나왔다.
 *   첫 페이지에 든 것 1건 — 타일 바닥 청소(검색량 300)
 *
 * 그리고 직전 회차(최근 30개)에서 4위였던 '베란다 청소 방법'(검색량 90)은
 * 후보가 114개로 늘자 **상위 80 밖으로 밀려 아예 안 재졌다.** 그래서 이긴 것이 2 → 1 로 줄었다.
 * 더 많이 쟀는데 결과가 나빠지는 정렬이다.
 *
 * 그래서 작은 말부터 잰다. 상한에 걸려 잘리는 쪽이 '아무것도 안 나오던 큰 말'이 되도록.
 */
const root = path.join(__dirname, '..', '..', '..');
const rank = fs.readFileSync(path.join(root, 'src', 'main', 'handlers', 'blog-class-rank.ts'), 'utf8');

const kw = (keyword: string, searchVolume: number) => ({ keyword, searchVolume } as any);

describe('작은 말부터 잰다', () => {
  it('검색량 오름차순으로 준다', () => {
    const got = orderRankTargets([kw('큰', 9000), kw('작은', 90), kw('중간', 800)]).map((t) => t.keyword);
    expect(got).toEqual(['작은', '중간', '큰']);
  });

  it('상한에 걸리면 큰 말이 잘린다 — 전에는 작은 말이 잘렸다', () => {
    const rows = [kw('a', 137600), kw('b', 3610), kw('c', 970), kw('d', 300), kw('e', 90)];
    expect(orderRankTargets(rows).slice(0, 3).map((t) => t.keyword)).toEqual(['e', 'd', 'c']);
  });

  it('실측 회차를 재현한다 — 이겼던 두 개가 둘 다 살아남는다', () => {
    // 검색량이 큰 것 100개 + 실제로 이겼던 작은 것 둘. 상한 80 이면 전에는 작은 둘이 잘렸다.
    const big = Array.from({ length: 100 }, (_, i) => kw(`큰${i}`, 2000 + i * 100));
    const rows = [...big, kw('타일 바닥 청소', 300), kw('베란다 청소 방법', 90)];
    const head = orderRankTargets(rows).slice(0, 80).map((t) => t.keyword);
    expect(head).toContain('베란다 청소 방법');
    expect(head).toContain('타일 바닥 청소');
    expect(head[0]).toBe('베란다 청소 방법');
  });

  it('검색량을 못 잰 줄은 뒤로 보낸다 — 없는 값을 0 으로 쳐서 앞세우지 않는다', () => {
    const got = orderRankTargets([kw('없음', null as any), kw('작은', 90), kw('큰', 9000)]).map((t) => t.keyword);
    expect(got).toEqual(['작은', '큰', '없음']);
  });

  it('원본을 건드리지 않는다', () => {
    const rows = [kw('큰', 9000), kw('작은', 90)];
    orderRankTargets(rows);
    expect(rows.map((r) => r.keyword)).toEqual(['큰', '작은']);
  });

  it('같은 검색량이면 들어온 순서를 지킨다', () => {
    const got = orderRankTargets([kw('첫째', 300), kw('둘째', 300), kw('셋째', 300)]).map((t) => t.keyword);
    expect(got).toEqual(['첫째', '둘째', '셋째']);
  });
});

describe('배선', () => {
  it('회차가 이 순서를 실제로 쓴다', () => {
    expect(rank).toContain('orderRankTargets(withVolume).slice(0, maxRank)');
    expect(rank, '옛 정렬이 남아 있다').not.toContain('withVolume.sort((a, b) => b.searchVolume - a.searchVolume)');
  });

  it('상한은 그대로 있다 — 순서만 바꿨지 재는 수를 늘리지 않았다', () => {
    expect(rank).toContain('options.maxRank ?? 80');
  });
});
