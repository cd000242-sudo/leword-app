import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { expansionRank, orderForPublish } from '../board-order';

/**
 * 확장·연관 키워드를 앞세운다 — 그러려면 **행에 그 사실이 실려야** 한다 (2026-09-12).
 *
 * 사장님: "그키워드중에 확장 및 연관키워드 위주로 알려줘야 메리트가있는거지
 * 이건그냥 황금키워드를 그냥 카테고리별로 나눠놓은거자나"
 *
 * 실측하니 발행된 43행에 origin·isDerived·source 어느 필드도 없었다. 후보 단계에서는
 * 씨앗(seed)을 알고 있는데 배치·발행으로 오는 길에 사라졌다 — timing 필드가 네 곳에서
 * 빠져 있던 것과 같은 모양이다(preemption-ad-signal-wiring 이 잡던 그 사고).
 *
 * 그래서 네 파일을 대조한다. 한 곳만 빠져도 계산해 놓고 버리는 것이 된다.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const candidates = read('scripts/preemption-candidates.js');
const batch = read('scripts/preemption-board-batch.js');
const publish = read('scripts/publish-preemption-board.js');

describe('확장 여부가 후보 → 배치 → 발행까지 이름 그대로 간다', () => {
  for (const field of ['seedKind', 'expansionWords']) {
    it(`${field} 가 세 단계에 다 있다`, () => {
      expect(candidates, `후보가 ${field} 를 안 잰다`).toContain(field);
      expect(batch, `배치가 ${field} 를 안 옮긴다`).toContain(field);
      expect(publish, `발행이 ${field} 를 안 싣는다`).toContain(field);
    });
  }

  it('씨앗 갈래 넷을 후보가 실제로 구분한다', () => {
    for (const kind of ['coverage', 'seasonal', 'warehouse', 'related']) {
      expect(candidates, `씨앗 갈래 ${kind} 가 없다`).toContain(`'${kind}'`);
    }
  });

  it('확장 어절 수는 씨앗과의 차이다 — 절대 어절 수가 아니다', () => {
    // 절대 어절 수로 세면 씨앗 자체가 긴 말일 때 머리 키워드가 확장으로 둔갑한다.
    expect(candidates).toContain('wordCount(keyword) - wordCount(seed)');
  });
});

describe('확장 차례', () => {
  it('씨앗에서 늘어난 말이 앞, 씨앗 그대로가 뒤', () => {
    expect(expansionRank({ expansionWords: 2 })).toBeLessThan(expansionRank({ expansionWords: 0 }));
    expect(expansionRank({ expansionWords: 1 })).toBe(0);
    expect(expansionRank({ expansionWords: 0 })).toBe(2);
  });

  it('못 잰 행은 가운데다 — 모르는 것을 앞뒤 어느 쪽으로도 밀지 않는다', () => {
    const unknown = expansionRank({});
    expect(unknown).toBeGreaterThan(expansionRank({ expansionWords: 3 }));
    expect(unknown).toBeLessThan(expansionRank({ expansionWords: 0 }));
    expect(expansionRank({ expansionWords: null })).toBe(unknown);
  });
});

describe('줄세우기가 확장을 실제로 앞세운다', () => {
  it('검색량이 큰 머리 키워드보다 확장이 앞에 온다', () => {
    const ordered = orderForPublish([
      { keyword: '제주렌트카', searchVolume: 9000, expansionWords: 0 },
      { keyword: '제주렌트카 보험 자기부담금', searchVolume: 600, expansionWords: 2 },
    ], { now: new Date(2026, 8, 12) });
    expect(ordered[0].keyword).toBe('제주렌트카 보험 자기부담금');
  });

  it('시기가 확장보다 먼저다 — 확장이어도 성수기 지난 것은 뒤로', () => {
    const past = { keyword: '지난 것 확장', searchVolume: 600, expansionWords: 2, latestVsPeakPct: 10, monthsSincePeak: 5 };
    const head = { keyword: '머리 키워드', searchVolume: 9000, expansionWords: 0 };
    const ordered = orderForPublish([past, head], { now: new Date(2026, 8, 12) });
    expect(ordered[0].keyword).toBe('머리 키워드');
  });

  it('같은 차례·같은 확장이면 검색량으로 가른다 — 옛 규칙이 살아 있다', () => {
    const ordered = orderForPublish([
      { keyword: '작은 것', searchVolume: 600, expansionWords: 2 },
      { keyword: '큰 것', searchVolume: 5000, expansionWords: 2 },
    ], { now: new Date(2026, 8, 12) });
    expect(ordered[0].keyword).toBe('큰 것');
  });
});
