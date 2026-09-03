import { describe, expect, it } from 'vitest';
import { judgeIssueNiche, IssueNicheMeasurements, IssueNicheThresholds } from '../issue-niche-verdict';

const T: IssueNicheThresholds = { docCountMax: 3000, useLiveDemandRoute: true };

/** 틈새로 통과하는 기본형 — 실측 사례 '배재고 기숙사'(sv 140 / doc 628 / 수요 87.8). */
function base(overrides: Partial<IssueNicheMeasurements> = {}): IssueNicheMeasurements {
  return {
    searchVolume: 140,
    documentCount: 628,
    isSearchVolumeEstimated: false,
    isDocumentCountEstimated: false,
    recencyStatus: 'stable',
    demandRecent7: 87.8,
    demandStatus: 'stable',
    freshFrontalCount: 0,
    ...overrides,
  };
}

describe('judgeIssueNiche — demand 경로', () => {
  it('실측 수요 + 저경쟁이면 틈새다', () => {
    const v = judgeIssueNiche(base(), T);
    expect(v.isNiche).toBe(true);
    expect(v.nicheRoute).toBe('demand');
    expect(v.reasons).toContain('데이터랩 실측 수요');
  });

  it('데이터랩에 수요가 안 잡히면 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ demandRecent7: null }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ demandRecent7: 0 }), T).isNiche).toBe(false);
  });

  it('문서수가 상한을 넘으면 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ documentCount: 3001 }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 3000 }), T).isNiche).toBe(true);
  });

  // 두 축이 다 추정이면 근거가 없는데 틈새로 올라오는 구멍이 생긴다.
  it('문서수가 추정치면 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ isDocumentCountEstimated: true }), T).isNiche).toBe(false);
  });

  it('수요가 죽었으면 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ recencyStatus: 'dead' }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ demandStatus: 'dead' }), T).isNiche).toBe(false);
  });

  it('오늘 도배중이면 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ freshFrontalCount: 3 }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ freshFrontalCount: 2 }), T).isNiche).toBe(true);
  });

  it('demand 경로를 끄면 아무것도 통과하지 않는다', () => {
    expect(judgeIssueNiche(base(), { ...T, useLiveDemandRoute: false }).isNiche).toBe(false);
  });
});

describe('judgeIssueNiche — 검색량은 판정에 쓰지 않는다', () => {
  // 이 탭에서 volume 경로를 제거한 근거: 황금비 게이트 통과 0건, 통과자는 거대 머리뿐이었다.
  it('검색량이 없어도 실측 수요만 있으면 통과한다', () => {
    const v = judgeIssueNiche(base({ searchVolume: null }), T);
    expect(v.isNiche).toBe(true);
    expect(v.goldenRatio).toBeNull();
    expect(v.hasTraffic).toBe(false);
  });

  it('황금비율이 낮아도 통과한다', () => {
    // 실측 사례 '고우석 아내': sv 360 / doc 857 = 0.42
    const v = judgeIssueNiche(base({ searchVolume: 360, documentCount: 857 }), T);
    expect(v.goldenRatio).toBeCloseTo(0.42, 2);
    expect(v.isNiche).toBe(true);
  });

  it('황금비율이 높아도 문서수가 많으면 떨어진다', () => {
    // 실측 사례 '포스코홀딩스': sv 951,500 / doc 200,469 = 4.7
    const v = judgeIssueNiche(base({ searchVolume: 951500, documentCount: 200469 }), T);
    expect(v.goldenRatio).toBeGreaterThan(3);
    expect(v.isNiche).toBe(false);
  });
});

describe('judgeIssueNiche — 점수', () => {
  it('문서수가 적을수록 점수가 높다', () => {
    const few = judgeIssueNiche(base({ documentCount: 200 }), T).nicheScore;
    const many = judgeIssueNiche(base({ documentCount: 2900 }), T).nicheScore;
    expect(few).toBeGreaterThan(many);
  });

  // 판정에서 뺀 황금비가 점수에 남아 있으면 정렬이 판정과 어긋난다.
  it('황금비가 커도 점수를 끌어올리지 않는다', () => {
    const lowRatio = judgeIssueNiche(base({ searchVolume: 100, documentCount: 628 }), T).nicheScore;
    const highRatio = judgeIssueNiche(base({ searchVolume: 99999, documentCount: 628 }), T).nicheScore;
    expect(highRatio).toBe(lowRatio);
  });

  it('추정치는 점수를 깎는다', () => {
    const clean = judgeIssueNiche(base(), T).nicheScore;
    const est = judgeIssueNiche(base({ isSearchVolumeEstimated: true }), T).nicheScore;
    expect(est).toBeLessThan(clean);
  });
});

describe('judgeIssueNiche — 선점 후보', () => {
  // 실측(2026-09-03): 다이슨 '카메라젯' 발표 당일 — 문서 1~3건, 데이터랩 수요 0.
  // 경쟁은 없는데 수요 증거도 없다. 틈새로 부를 수 없고, 버리기도 아깝다.
  it('경쟁이 없고 수요가 미검출이면 선점 후보다', () => {
    const v = judgeIssueNiche(base({ documentCount: 3, demandRecent7: 0, searchVolume: null }), T);
    expect(v.isNiche).toBe(false);
    expect(v.isPreemption).toBe(true);
    expect(v.reasons.join(' ')).toContain('선점 후보');
  });

  it('틈새로 통과한 것은 선점 후보가 아니다 — 범주가 겹치면 안 된다', () => {
    const v = judgeIssueNiche(base({ documentCount: 200 }), T);
    expect(v.isNiche).toBe(true);
    expect(v.isPreemption).toBe(false);
  });

  // 수요 증거가 없는 만큼 "경쟁이 없다"는 것 하나는 확실해야 한다.
  it('문서수가 선점 상한을 넘으면 선점 후보가 아니다', () => {
    expect(judgeIssueNiche(base({ documentCount: 301, demandRecent7: null }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 300, demandRecent7: null }), T).isPreemption).toBe(true);
  });

  it('문서수가 추정치면 선점 후보가 아니다', () => {
    const v = judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, isDocumentCountEstimated: true }), T);
    expect(v.isPreemption).toBe(false);
  });

  it('수요가 죽었거나 도배중이면 선점 후보가 아니다', () => {
    expect(judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, recencyStatus: 'dead' }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, freshFrontalCount: 3 }), T).isPreemption).toBe(false);
  });
});
