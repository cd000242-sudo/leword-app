import { describe, expect, it } from 'vitest';
import { judgeIssueNiche, IssueNicheMeasurements, IssueNicheThresholds } from '../issue-niche-verdict';

const T: IssueNicheThresholds = { docCountMax: 3000, useLiveDemandRoute: true };

/**
 * 틈새로 통과하는 기본형 — 트래픽(검색광고 1,200)·수요(데이터랩 87.8)·자리(블로그탭 상위 10
 * 정면글 0건) 셋 다 실측 통과. 사장님 정의(2026-09-04): 틈새 = 황금보다 센 것, "더욱 확률
 * 높고 트래픽을 몰고 올 수 있는 키워드". 문서수 628 은 실측 사례 '배재고 기숙사'.
 */
function base(overrides: Partial<IssueNicheMeasurements> = {}): IssueNicheMeasurements {
  return {
    searchVolume: 1200,
    documentCount: 628,
    isSearchVolumeEstimated: false,
    isDocumentCountEstimated: false,
    searchVolumeLt10: false,
    recencyStatus: 'stable',
    demandRecent7: 87.8,
    demandStatus: 'stable',
    freshFrontalCount: 0,
    serpVerdict: 'WINNABLE',
    ...overrides,
  };
}

describe('judgeIssueNiche — 틈새는 트래픽·수요·자리 셋 다 실측 통과', () => {
  it('셋 다 통과하면 틈새다', () => {
    const v = judgeIssueNiche(base(), T);
    expect(v.isNiche).toBe(true);
    expect(v.isPending).toBe(false);
    expect(v.isPreemption).toBe(false);
    expect(v.nicheRoute).toBe('triple');
    expect(v.trafficGate).toBe(true);
    expect(v.demandGate).toBe(true);
    expect(v.slotStatus).toBe('winnable');
    expect(v.reasons).toContain('데이터랩 실측 수요');
    expect(v.reasons.join(' ')).toContain('상위 10 정면글 0건');
  });

  it('demand 경로를 끄면 아무것도 통과하지 않는다', () => {
    expect(judgeIssueNiche(base(), { ...T, useLiveDemandRoute: false }).isNiche).toBe(false);
  });
});

describe('judgeIssueNiche — 트래픽 게이트(검색광고 실측)', () => {
  it('검색량 300 이 하한이다', () => {
    expect(judgeIssueNiche(base({ searchVolume: 300 }), T).isNiche).toBe(true);
    const v = judgeIssueNiche(base({ searchVolume: 299 }), T);
    expect(v.isNiche).toBe(false);
    expect(v.trafficGate).toBe(false);
    expect(v.isPending).toBe(false);
  });

  it('수요가 상승 중이면 100 까지 내려 잡는다 — 갓 터진 이슈는 키워드도구가 아직 작게 안다', () => {
    expect(judgeIssueNiche(base({ searchVolume: 100, demandStatus: 'rising' }), T).isNiche).toBe(true);
    expect(judgeIssueNiche(base({ searchVolume: 99, demandStatus: 'rising' }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ searchVolume: 100, demandStatus: 'stable' }), T).isNiche).toBe(false);
  });

  it('하한은 문턱값으로 바꿀 수 있다', () => {
    expect(judgeIssueNiche(base({ searchVolume: 150 }), { ...T, trafficFloor: 150 }).isNiche).toBe(true);
    expect(judgeIssueNiche(base({ searchVolume: 60, demandStatus: 'rising' }), { ...T, trafficRisingFloor: 60 }).isNiche).toBe(true);
  });

  it('추정 검색량은 트래픽 증거가 아니다', () => {
    const v = judgeIssueNiche(base({ searchVolume: 5000, isSearchVolumeEstimated: true }), T);
    expect(v.isNiche).toBe(false);
    expect(v.trafficGate).toBe(false);
  });

  it('검색량이 없으면(키워드도구 미보유) 틈새가 아니다', () => {
    const v = judgeIssueNiche(base({ searchVolume: null }), T);
    expect(v.isNiche).toBe(false);
    expect(v.trafficGate).toBe(false);
  });

  // 실측 사례 '포스코홀딩스': sv 951,500 / doc 200,469. 트래픽은 넘치지만 자리가 없다.
  it('검색량이 커도 문서수가 상한을 넘으면 떨어진다', () => {
    expect(judgeIssueNiche(base({ searchVolume: 951500, documentCount: 200469 }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 3001 }), T).isNiche).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 3000 }), T).isNiche).toBe(true);
  });
});

describe('judgeIssueNiche — 수요 게이트(데이터랩 실측)', () => {
  it('데이터랩에 수요가 안 잡히면 검색량이 커도 틈새가 아니다', () => {
    expect(judgeIssueNiche(base({ demandRecent7: null }), T).isNiche).toBe(false);
    const v = judgeIssueNiche(base({ demandRecent7: 0 }), T);
    expect(v.isNiche).toBe(false);
    expect(v.demandGate).toBe(false);
  });

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
});

describe('judgeIssueNiche — 자리 게이트(블로그탭 상위 10 실측)', () => {
  it('자리를 아직 안 쟀으면 틈새가 아니라 대기다 — 다음 자리 실측 대상', () => {
    for (const serpVerdict of [undefined, null, 'NO_DATA'] as const) {
      const v = judgeIssueNiche(base({ serpVerdict }), T);
      expect(v.isNiche).toBe(false);
      expect(v.isPending).toBe(true);
      expect(v.isPreemption).toBe(false);
      expect(v.slotStatus).toBe('unmeasured');
    }
  });

  it('정면 대응 글이 있으면(CONTESTED·LOCKED) 틈새도 대기도 아니다', () => {
    const contested = judgeIssueNiche(base({ serpVerdict: 'CONTESTED' }), T);
    expect(contested.isNiche).toBe(false);
    expect(contested.isPending).toBe(false);
    expect(contested.slotStatus).toBe('contested');
    const locked = judgeIssueNiche(base({ serpVerdict: 'LOCKED' }), T);
    expect(locked.isNiche).toBe(false);
    expect(locked.isPending).toBe(false);
    expect(locked.slotStatus).toBe('locked');
    expect(locked.reasons.join(' ')).toContain('정면');
  });

  it('트래픽이나 수요가 모자라면 자리가 비어 있어도 대기가 아니다 — 자리 실측 예산은 둘 다 통과한 행에만 쓴다', () => {
    expect(judgeIssueNiche(base({ searchVolume: 50, serpVerdict: null }), T).isPending).toBe(false);
    expect(judgeIssueNiche(base({ demandRecent7: 0, serpVerdict: null }), T).isPending).toBe(false);
  });
});

describe('judgeIssueNiche — 선점 후보', () => {
  // 실측(2026-09-03): 다이슨 '카메라젯' 발표 당일 — 문서 1~3건, 데이터랩 수요 0.
  it('경쟁이 없고 수요가 미검출이면 선점 후보다', () => {
    const v = judgeIssueNiche(base({ documentCount: 3, demandRecent7: 0, searchVolume: null, serpVerdict: null }), T);
    expect(v.isNiche).toBe(false);
    expect(v.isPreemption).toBe(true);
    expect(v.preemptionKind).toBe('no-demand');
    expect(v.reasons.join(' ')).toContain('선점 후보');
  });

  // 실사고 '지예은 남편': 데이터랩엔 잡혔는데 키워드도구는 아직 모른다(null). 트래픽 증거가
  // 없으니 틈새는 아니고, 경쟁 문서가 거의 없으니 자리는 있다.
  it('수요는 잡혔는데 검색량이 아직 없고 경쟁이 없으면 선점 후보(검색량 미확인)다', () => {
    const v = judgeIssueNiche(base({ documentCount: 120, searchVolume: null, serpVerdict: null }), T);
    expect(v.isNiche).toBe(false);
    expect(v.isPending).toBe(false);
    expect(v.isPreemption).toBe(true);
    expect(v.preemptionKind).toBe('demand-no-volume');
    expect(v.reasons.join(' ')).toContain('검색량 미확인');
  });

  it('키워드도구가 "10 미만" 으로 답한 것은 미확인이 아니라 실측 저검색이다 — 선점 후보가 아니다', () => {
    const v = judgeIssueNiche(base({ documentCount: 120, searchVolume: null, searchVolumeLt10: true, serpVerdict: null }), T);
    expect(v.isPreemption).toBe(false);
    expect(v.isNiche).toBe(false);
  });

  it('검색량이 실측으로 하한 미달이면 선점 후보가 아니다 — 트래픽이 작다는 증거가 있다', () => {
    const v = judgeIssueNiche(base({ documentCount: 120, searchVolume: 50, serpVerdict: null }), T);
    expect(v.isPreemption).toBe(false);
    expect(v.isNiche).toBe(false);
    expect(v.isPending).toBe(false);
  });

  it('틈새·대기로 간 것은 선점 후보가 아니다 — 범주가 겹치면 안 된다', () => {
    expect(judgeIssueNiche(base({ documentCount: 200 }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 200, serpVerdict: null }), T).isPreemption).toBe(false);
  });

  it('문서수가 선점 상한을 넘으면 선점 후보가 아니다', () => {
    expect(judgeIssueNiche(base({ documentCount: 301, demandRecent7: null, searchVolume: null }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 300, demandRecent7: null, searchVolume: null }), T).isPreemption).toBe(true);
    expect(judgeIssueNiche(base({ documentCount: 301, searchVolume: null }), T).isPreemption).toBe(false);
  });

  it('문서수가 추정치면 선점 후보가 아니다', () => {
    const v = judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, searchVolume: null, isDocumentCountEstimated: true }), T);
    expect(v.isPreemption).toBe(false);
  });

  it('수요가 죽었거나 도배중이면 선점 후보가 아니다', () => {
    expect(judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, searchVolume: null, recencyStatus: 'dead' }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 3, demandRecent7: null, searchVolume: null, freshFrontalCount: 3 }), T).isPreemption).toBe(false);
    expect(judgeIssueNiche(base({ documentCount: 120, searchVolume: null, demandStatus: 'dead' }), T).isPreemption).toBe(false);
  });
});

describe('judgeIssueNiche — 점수(정렬용)', () => {
  it('문서수가 적을수록 점수가 높다', () => {
    const few = judgeIssueNiche(base({ documentCount: 200 }), T).nicheScore;
    const many = judgeIssueNiche(base({ documentCount: 2900 }), T).nicheScore;
    expect(few).toBeGreaterThan(many);
  });

  it('트래픽 게이트를 넘으면 점수가 오른다 — 대기 행끼리는 검색량 큰 것부터 자리를 잰다', () => {
    const passed = judgeIssueNiche(base({ serpVerdict: null }), T).nicheScore;
    const below = judgeIssueNiche(base({ searchVolume: 200, serpVerdict: null }), T).nicheScore;
    expect(passed).toBeGreaterThan(below);
  });

  it('추정치는 점수를 깎는다', () => {
    const clean = judgeIssueNiche(base(), T).nicheScore;
    const est = judgeIssueNiche(base({ isSearchVolumeEstimated: true }), T).nicheScore;
    expect(est).toBeLessThan(clean);
  });
});
