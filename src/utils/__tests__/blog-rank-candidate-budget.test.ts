import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 글당 후보 수(2026-09-11).
 *
 * 후보 생성기가 두 크기를 번갈아 뽑게 되면서 2어절이 생겼다. 그런데 글당 3개면
 * 2어절 자리가 하나뿐이라 새로 생긴 말이 대부분 안 쓰인다(실측: 글 30개에서 2어절 30개만 씀,
 * 만들 수 있는 건 188개). 글당 6개면 2어절 88 · 3어절 88 로 고르게 나가고
 * "옷 보관법"·"비염 예방"·"환절기 비염"·"공기압 마사지기"가 다 잡힌다.
 *
 * 값은 싸다: 검색량은 5개씩 묶어 묻고, **비싼 단계(순위 실측, 건당 약 2초)는 maxRank 로 따로 막혀 있다.**
 * 후보를 넓혀도 재는 수는 안 늘고, 그 80칸에 무엇이 들어가는지만 좋아진다.
 * (실측 100개 회차: 후보 281 → 검색량 잡힌 것 26개(9.2%)뿐이라 80칸을 다 못 채웠다.)
 */
const rank = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'main', 'handlers', 'blog-class-rank.ts'), 'utf8');

describe('후보 예산', () => {
  it('글당 후보가 두 크기에 고루 갈 만큼은 된다', () => {
    const per = Number((rank.match(/collectCandidates\(posts, (\d+)\)/) || [])[1]);
    expect(per, 'collectCandidates 호출을 못 찾음').toBeGreaterThanOrEqual(4);
  });

  it('비싼 단계는 여전히 따로 막혀 있다 — 후보를 넓혀도 재는 수는 안 늘어난다', () => {
    expect(rank).toContain('options.maxRank ?? 80');
    expect(rank).toContain('.slice(0, maxRank)');
  });

  it('검색량이 잡힌 것만 순위를 잰다 — 넓힌 후보가 그대로 요청이 되지 않는다', () => {
    expect(rank).toContain('const targets = withVolume.sort');
  });
});
