import { describe, it, expect } from 'vitest';
import { BIZTP_TOPIC, pickSeeds, roundFromDate, seedDbAgeDays, topicOfSeed, type SeedDb } from '../seed-db';

const db = (count: number): SeedDb => ({
  builtAt: new Date().toISOString(),
  totalSeeds: count,
  // 검색량이 서로 다르게 — 정렬이 실제로 먹는지 보려고 역순으로 넣는다.
  seeds: Array.from({ length: count }, (_, i) => ({ keyword: `말${i}`, searchVolume: (i + 1) * 100 })),
});

describe('pickSeeds', () => {
  it('검색량 하한 아래는 뺀다', () => {
    const picked = pickSeeds(db(10), { limit: 100, minVolume: 500 });
    // 100,200,…,1000 중 500 이상 = 6개
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain('말0');
  });

  it('이미 쓰는 씨앗은 공백을 지워 비교해 뺀다', () => {
    const picked = pickSeeds(db(5), { limit: 100, minVolume: 0, exclude: ['말 4', '말3'] });
    expect(picked).not.toContain('말4');
    expect(picked).not.toContain('말3');
    expect(picked).toHaveLength(3);
  });

  it('검색량 큰 것부터 판다', () => {
    expect(pickSeeds(db(5), { limit: 2, minVolume: 0, round: 0 })).toEqual(['말4', '말3']);
  });

  it('회차마다 다른 구간을 판다 — 앞쪽만 반복해서 파지 않는다', () => {
    const first = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 0 });
    const second = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 1 });
    const third = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 2 });
    expect(first).not.toEqual(second);
    expect(second).not.toEqual(third);
    // 겹치지 않는다 — 창이 정확히 limit 만큼 밀린다
    expect(first.filter((k) => second.includes(k))).toHaveLength(0);
  });

  it('같은 회차 번호면 같은 결과다 — 재현된다(난수 아님)', () => {
    expect(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }))
      .toEqual(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }));
  });

  it('창이 끝에 닿으면 앞으로 돌아온다 — 요청한 개수를 항상 채운다', () => {
    const picked = pickSeeds(db(10), { limit: 8, minVolume: 0, round: 1 });
    expect(picked).toHaveLength(8);
    expect(new Set(picked).size).toBe(8); // 한 회차 안에서 중복 없음
  });

  it('창고가 없거나 비었으면 빈 배열 — 회차를 죽이지 않는다', () => {
    expect(pickSeeds(null, { limit: 10, minVolume: 0 })).toEqual([]);
    expect(pickSeeds({ builtAt: '', totalSeeds: 0, seeds: [] }, { limit: 10, minVolume: 0 })).toEqual([]);
  });

  it('하한을 넘는 씨앗이 없으면 빈 배열', () => {
    expect(pickSeeds(db(3), { limit: 10, minVolume: 999999 })).toEqual([]);
  });
});

describe('seedDbAgeDays', () => {
  it('며칠 됐는지 잰다 — 월·금 갱신이라 3일이 문턱이다', () => {
    const now = new Date('2026-09-07T00:00:00Z');
    const four = { builtAt: '2026-09-03T00:00:00Z', totalSeeds: 0, seeds: [] };
    expect(seedDbAgeDays(four, now)).toBeCloseTo(4, 5);
    expect(seedDbAgeDays(null, now)).toBeNull();
    expect(seedDbAgeDays({ builtAt: '깨진값', totalSeeds: 0, seeds: [] }, now)).toBeNull();
  });
});

describe('topicOfSeed — 말이 먼저, 업종이 다음', () => {
  it('지원금 계열은 업종이 무엇이든 사회·정치다 — 여덟 업종에 흩어져 있던 것들', () => {
    // 실측: 소상공인지원금=마케팅업종, 청년주택=부동산업종, 서울시청년수당=3월
    expect(topicOfSeed({ keyword: '소상공인지원금', searchVolume: 50210, source: 'biztp:18' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '근로장려금신청방법', searchVolume: 10180, source: 'biztp:24' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '평생교육바우처', searchVolume: 16680, source: 'biztp:4' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '청년임대주택', searchVolume: 18400, source: 'biztp:9' })).toBe('사회·정치');
    // 월·시즌 출처라 업종 매핑이 아예 없는 것도 말로 잡힌다
    expect(topicOfSeed({ keyword: '서울시청년수당', searchVolume: 6430, source: 'month:3' })).toBe('사회·정치');
  });

  it('축제는 국내여행, 공연은 공연·전시 — 출처가 월·시즌이어도 잡는다', () => {
    // 실측: 여의도불꽃축제 962,700(10월) · 봉평메밀꽃축제(9월) · 거창감악산축제(event:49)
    expect(topicOfSeed({ keyword: '여의도불꽃축제', searchVolume: 962700, source: 'month:10' })).toBe('국내여행');
    expect(topicOfSeed({ keyword: '거창감악산축제', searchVolume: 49120, source: 'event:49' })).toBe('국내여행');
    // 공연은 별개 주제 — 예매·좌석으로 찾는 말이라 나들이와 섞지 않는다
    expect(topicOfSeed({ keyword: '드라큘라뮤지컬', searchVolume: 79900, source: 'biztp:56' })).toBe('공연·전시');
    expect(topicOfSeed({ keyword: '대학로연극', searchVolume: 97600, source: 'biztp:8' })).toBe('공연·전시');
  });

  it('투어·티켓·게임은 안 잡는다 — 딴 밭이 딸려 오던 말들', () => {
    for (const keyword of ['부산요트투어', '고속버스표예매', '발로란트', '신작웹툰']) {
      expect(topicOfSeed({ keyword, searchVolume: 5000, source: 'biztp:8' })).toBeNull();
    }
  });

  it('말에 안 걸리면 업종 매핑을 쓴다', () => {
    expect(topicOfSeed({ keyword: '제네시스G90중고', searchVolume: 1000, source: 'biztp:17' })).toBe('자동차');
    expect(topicOfSeed({ keyword: '산후조리원가격', searchVolume: 1000, source: 'biztp:37' })).toBe('육아·결혼');
  });

  it('매핑에서 뺀 업종과 월·시즌 출처는 null — 주제를 고른 발굴에서 안 쓴다', () => {
    // 15(금시세→옷), 10·62(산업 자재), 50(레저·수예 혼재) 은 뺐다
    for (const source of ['biztp:15', 'biztp:10', 'biztp:62', 'biztp:50', 'month:11', 'event:23']) {
      expect(topicOfSeed({ keyword: '아무말', searchVolume: 1000, source })).toBeNull();
    }
    expect(topicOfSeed({ keyword: '아무말', searchVolume: 1000 })).toBeNull();
  });

  it('오염으로 뺀 업종이 매핑에 되살아나 있지 않다', () => {
    for (const id of ['1', '15', '34', '49', '75', '10', '62', '50', '11', '65', '67']) {
      expect(BIZTP_TOPIC[id]).toBeUndefined();
    }
  });
});

describe('roundFromDate', () => {
  it('같은 날은 같은 회차 번호', () => {
    expect(roundFromDate(new Date(2026, 8, 7, 3))).toBe(roundFromDate(new Date(2026, 8, 7, 20)));
    expect(roundFromDate(new Date(2026, 8, 7))).not.toBe(roundFromDate(new Date(2026, 8, 8)));
  });
});
