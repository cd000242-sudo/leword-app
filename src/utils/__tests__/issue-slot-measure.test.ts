/**
 * 자리 실측 계획·적용 — 실검 틈새 회차가 Bright Data 를 회차당 상한 안에서만 쓰고,
 * 잰 결과로 판정을 다시 내리는 순수 규칙.
 */
import { describe, expect, it } from 'vitest';
import type { IssueNicheKeyword, IssueSlotSerp } from '../issue-niche-hunter';
import type { IssueBoardPublicRow } from '../issue-niche-board-publish';
import {
  SLOT_REUSE_MS,
  applySlotResults,
  planSlotMeasurement,
  readSlotCache,
  slotCacheLookup,
  slotCacheStore,
  toSlotSerp,
} from '../issue-slot-measure';

const NOW = Date.parse('2026-09-04T04:00:00.000Z');
const T = { docCountMax: 3000, useLiveDemandRoute: true };

function serp(verdict: IssueSlotSerp['verdict'], over: Partial<IssueSlotSerp> = {}): IssueSlotSerp {
  return {
    verdict,
    reason: verdict === 'WINNABLE' ? '정면 대응 0건' : '정면 대응 있음',
    exactTitleHits: verdict === 'WINNABLE' ? 0 : 5,
    partialTitleHits: 1,
    sampledTitles: 10,
    topTitles: ['제목 하나'],
    measuredAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

/** 헌터가 낸 원장 행 — 기본은 트래픽·수요 통과 + 자리 미실측(대기). */
function ledgerRow(over: Partial<IssueNicheKeyword> = {}): IssueNicheKeyword {
  return {
    keyword: '대기 키워드',
    baseKeyword: '이슈',
    issueType: 'fresh',
    isDerived: true,
    grade: 'A',
    searchVolume: 1200,
    documentCount: 628,
    goldenRatio: 1.9,
    cpc: null,
    recencyStatus: 'stable',
    recencyRatio: 1,
    isHot: false,
    hasTraffic: true,
    frontalDocCount: 2,
    freshFrontalCount: 0,
    isNiche: false,
    isEstimated: false,
    isSearchVolumeEstimated: false,
    searchVolumeLt10: false,
    isDocumentCountEstimated: false,
    demandRecent7: 87.8,
    demandRatio: 1.2,
    demandStatus: 'stable',
    hasLiveDemand: true,
    trafficGate: true,
    demandGate: true,
    slotStatus: 'unmeasured',
    serp: null,
    nicheRoute: null,
    isPending: true,
    isPreemption: false,
    preemptionKind: null,
    nicheScore: 70,
    reasons: ['자리 미실측 — 대기'],
    source: 'signal.bz',
    origin: 'derived',
    originReason: null,
    ...over,
  };
}

/** 직전 발행본의 선점 후보 행 — 수요는 잡혔고 재측정으로 검색량이 생긴 상태. */
function prevRow(over: Partial<IssueBoardPublicRow> = {}): IssueBoardPublicRow {
  return {
    keyword: '이월 선점',
    issue: '이슈',
    topic: '이슈',
    lane: 'realtime',
    issueType: 'fresh',
    isDerived: true,
    origin: 'autocomplete',
    originReason: null,
    verdict: 'preemption',
    preemptionKind: 'demand-no-volume',
    serp: null,
    documentCount: 120,
    documentCountMeasured: true,
    searchVolume: 450,
    searchVolumeLt10: false,
    hasLiveDemand: true,
    demandStatus: 'rising',
    demandRatio: 2.4,
    issueStatus: 'rising',
    isHot: true,
    frontalDocCount: 1,
    freshFrontalCount: 0,
    reasons: ['선점 후보 — 경쟁 문서 120건, 수요 잡힘·검색량 미확인'],
    evidence: [
      { code: 'autocomplete', text: '네이버 자동완성 실측 — 사람들이 이미 치는 말' },
      { code: 'demand', text: '데이터랩 최근 7일 수요 실측 — 7일/30일 2.4배' },
      { code: 'empty-field', text: '정면으로 다룬 글 1건 (최근 0건)' },
    ],
    whySearch: null,
    intentLabel: null,
    adsenseFit: null,
    adsenseReason: null,
    titles: null,
    subKeywords: null,
    keywordPool: null,
    trend: null,
    kinCount: null,
    kinTop: null,
    monetize: null,
    measuredAt: new Date(NOW - 10 * 3_600_000).toISOString(),
    carried: true,
    ...over,
  };
}

describe('planSlotMeasurement — 무엇을 재나', () => {
  it('대기 행만 대상이고, 검색량 큰 순으로 상한까지만 잰다', () => {
    const rows = [
      ledgerRow({ keyword: '작은', searchVolume: 320 }),
      ledgerRow({ keyword: '큰', searchVolume: 5000 }),
      ledgerRow({ keyword: '중간', searchVolume: 900 }),
      ledgerRow({ keyword: '틈새 확정', isPending: false, isNiche: true, nicheRoute: 'triple', slotStatus: 'winnable', serp: serp('WINNABLE') }),
      ledgerRow({ keyword: '선점', isPending: false, isPreemption: true, preemptionKind: 'no-demand', searchVolume: null, trafficGate: false, demandGate: false, hasLiveDemand: false, demandRecent7: null }),
      ledgerRow({ keyword: '탈락', isPending: false, trafficGate: false, searchVolume: 40 }),
    ];
    const plan = planSlotMeasurement({ ledgerRows: rows, prevRows: [], cache: readSlotCache(null), nowMs: NOW, max: 2, thresholds: T });
    expect(plan.targets).toEqual(['큰', '중간']);
    expect(plan.overflow).toBe(1);
    expect(plan.reused).toBe(0);
  });

  it('48시간 안에 잰 캐시는 다시 안 재고 바로 판정에 쓴다', () => {
    let cache = readSlotCache(null);
    cache = slotCacheStore(cache, '이미 잰 것', serp('WINNABLE'), NOW);
    cache = slotCacheStore(cache, '잠긴 것', serp('LOCKED'), NOW);
    cache = slotCacheStore(cache, '오래된 것', serp('WINNABLE', { measuredAt: new Date(NOW - SLOT_REUSE_MS - 1).toISOString() }), NOW);
    const rows = [ledgerRow({ keyword: '이미 잰 것' }), ledgerRow({ keyword: '잠긴 것' }), ledgerRow({ keyword: '오래된 것' })];
    const plan = planSlotMeasurement({ ledgerRows: rows, prevRows: [], cache, nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual(['오래된 것']);
    expect(plan.reused).toBe(2);
    const byKey = new Map(plan.ledgerRows.map((r) => [r.keyword, r]));
    expect(byKey.get('이미 잰 것')?.isNiche).toBe(true);
    expect(byKey.get('이미 잰 것')?.serp?.verdict).toBe('WINNABLE');
    expect(byKey.get('잠긴 것')?.isNiche).toBe(false);
    expect(byKey.get('잠긴 것')?.isPending).toBe(false);
    expect(byKey.get('잠긴 것')?.slotStatus).toBe('locked');
    expect(byKey.get('오래된 것')?.isPending).toBe(true);
  });

  it('이월 선점 후보가 재측정으로 검색량 하한을 넘겼으면 승격 대상 — 신규와 한 풀에서 검색량 큰 순', () => {
    const rows = [ledgerRow({ keyword: '신규 큰', searchVolume: 9000 }), ledgerRow({ keyword: '신규 작은', searchVolume: 310 })];
    const prev = [
      prevRow({ keyword: '이월 선점' }),
      prevRow({ keyword: '이월 검색량 없음', searchVolume: null }),
      prevRow({ keyword: '이월 수요 없음', preemptionKind: 'no-demand', hasLiveDemand: false, searchVolume: 800 }),
      prevRow({ keyword: '이월 틈새', verdict: 'niche', preemptionKind: null, serp: serp('WINNABLE') }),
    ];
    const plan = planSlotMeasurement({ ledgerRows: rows, prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 2, thresholds: T });
    expect(plan.targets).toEqual(['신규 큰', '이월 선점']);
    expect(plan.overflow).toBe(1);
  });

  it('검색량이 같으면 이월이 먼저다 — 보강이 끝나 있어 승격이 공짜', () => {
    const rows = [ledgerRow({ keyword: '신규', searchVolume: 450 })];
    const prev = [prevRow({ keyword: '이월', searchVolume: 450 })];
    const plan = planSlotMeasurement({ ledgerRows: rows, prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 1, thresholds: T });
    expect(plan.targets).toEqual(['이월']);
  });

  it('같은 키워드가 신규와 이월에 다 있으면 한 번만 잰다', () => {
    const rows = [ledgerRow({ keyword: '겹침' })];
    const prev = [prevRow({ keyword: '겹침' })];
    const plan = planSlotMeasurement({ ledgerRows: rows, prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual(['겹침']);
  });

  it('이월 선점 후보의 검색량이 하한 아래로 실측됐으면 "검색량 미확인" 배지를 뗀다(행은 남긴다)', () => {
    const prev = [prevRow({ keyword: '적은 검색량', searchVolume: 50 })];
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual([]);
    expect(plan.prevRows[0].verdict).toBe('preemption');
    expect(plan.prevRows[0].preemptionKind).toBeNull();
  });
});

describe('applySlotResults — 잰 뒤 판정', () => {
  it('WINNABLE 이면 틈새로 승격하고 serp 를 싣는다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [ledgerRow({ keyword: '자리 있음' })], prevRows: [], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['자리 있음', serp('WINNABLE')]]), T);
    const row = out.ledgerRows[0];
    expect(row.isNiche).toBe(true);
    expect(row.nicheRoute).toBe('triple');
    expect(row.isPending).toBe(false);
    expect(row.slotStatus).toBe('winnable');
    expect(row.serp?.verdict).toBe('WINNABLE');
    expect(row.reasons.join(' ')).toContain('정면글 0건');
    expect(out.promoted).toEqual(['자리 있음']);
    expect(out.cache.entries).toHaveProperty('자리있음');
  });

  it('LOCKED·CONTESTED 는 틈새도 대기도 아니다 — 원장엔 남고 발행은 안 된다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [ledgerRow({ keyword: '잠김' }), ledgerRow({ keyword: '경쟁' })], prevRows: [], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['잠김', serp('LOCKED')], ['경쟁', serp('CONTESTED')]]), T);
    expect(out.ledgerRows.map((r) => [r.isNiche, r.isPending, r.isPreemption, r.slotStatus])).toEqual([
      [false, false, false, 'locked'],
      [false, false, false, 'contested'],
    ]);
    expect(out.dropped).toEqual(['잠김', '경쟁']);
  });

  it('NO_DATA(제목을 못 읽음)는 대기로 남기고 캐시에 넣지 않는다 — 다음 회차에 다시 잰다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [ledgerRow({ keyword: '못 읽음' })], prevRows: [], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['못 읽음', serp('NO_DATA', { sampledTitles: 0 })]]), T);
    expect(out.ledgerRows[0].isPending).toBe(true);
    expect(out.ledgerRows[0].slotStatus).toBe('unmeasured');
    expect(out.cache.entries).toEqual({});
  });

  it('안 잰 것(상한 밖·호출 실패)은 그대로 대기다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [ledgerRow({ keyword: '상한 밖' })], prevRows: [], cache: readSlotCache(null), nowMs: NOW, max: 0, thresholds: T });
    const out = applySlotResults(plan, new Map(), T);
    expect(out.ledgerRows[0].isPending).toBe(true);
    expect(out.pending).toBe(1);
  });

  it('이월 선점 후보가 WINNABLE 이면 발행본 행을 틈새로 바꾼다 — 근거 줄에 트래픽·자리 실측이 붙는다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: [prevRow({ keyword: '이월 선점' })], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['이월 선점', serp('WINNABLE')]]), T);
    const row = out.prevRows[0];
    expect(row.verdict).toBe('niche');
    expect(row.preemptionKind).toBeNull();
    expect(row.serp?.verdict).toBe('WINNABLE');
    expect(row.evidence.map((e) => e.code)).toEqual(['autocomplete', 'traffic', 'demand', 'slot', 'empty-field']);
    expect(row.reasons.join(' ')).toContain('정면글 0건');
    expect(row.carried).toBe(true);
    expect(out.promoted).toEqual(['이월 선점']);
  });

  it('이월 선점 후보가 LOCKED 면 발행본에서 뺀다 — 자리가 없는데 선점 후보라 할 수 없다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: [prevRow({ keyword: '이월 잠김' }), prevRow({ keyword: '그대로', preemptionKind: 'no-demand', hasLiveDemand: false })], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['이월 잠김', serp('LOCKED')]]), T);
    expect(out.prevRows.map((r) => r.keyword)).toEqual(['그대로']);
    expect(out.dropped).toEqual(['이월 잠김']);
  });

  it('이월 승격 대상을 상한 때문에 못 쟀으면 행은 남기되 "검색량 미확인" 배지만 뗀다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: [prevRow({ keyword: '못 잼' })], cache: readSlotCache(null), nowMs: NOW, max: 0, thresholds: T });
    const out = applySlotResults(plan, new Map(), T);
    expect(out.prevRows[0].verdict).toBe('preemption');
    expect(out.prevRows[0].preemptionKind).toBeNull();
  });
});

describe('캐시', () => {
  it('깨진 입력은 빈 캐시로 읽고, 7일 지난 항목은 저장할 때 버린다', () => {
    expect(readSlotCache('garbage').entries).toEqual({});
    expect(readSlotCache({ schema: 'other', entries: { a: 1 } }).entries).toEqual({});
    const old = slotCacheStore(readSlotCache(null), '옛것', serp('WINNABLE', { measuredAt: new Date(NOW - 8 * 24 * 3_600_000).toISOString() }), NOW - 8 * 24 * 3_600_000);
    const next = slotCacheStore(old, '새것', serp('WINNABLE'), NOW);
    expect(Object.keys(next.entries)).toEqual(['새것']);
    expect(slotCacheLookup(next, '새 것', NOW)?.verdict).toBe('WINNABLE');
    expect(slotCacheLookup(next, '없는 것', NOW)).toBeNull();
  });

  it('toSlotSerp 는 분석 결과에서 싣는 값만 고른다', () => {
    const out = toSlotSerp(
      { sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 2, medianDaysAgo: 3, influencer: 1, topTitles: ['a', 'b'] },
      { verdict: 'WINNABLE', reason: '상위 10개 중 제목 정면 대응 0건' },
      '2026-09-04T04:00:00.000Z',
    );
    expect(out).toEqual({
      verdict: 'WINNABLE', reason: '상위 10개 중 제목 정면 대응 0건', exactTitleHits: 0, partialTitleHits: 2, sampledTitles: 10, topTitles: ['a', 'b'], measuredAt: '2026-09-04T04:00:00.000Z',
    });
  });
});

describe('이월 틈새 행에 serp 가 없다 — 옛 정의(수요만)로 실린 행은 다시 판정한다', () => {
  const legacy = (over: Partial<IssueBoardPublicRow> = {}) => prevRow({
    keyword: '옛 틈새',
    verdict: 'niche',
    preemptionKind: null,
    serp: null,
    searchVolume: 1430,
    documentCount: 1190,
    reasons: ['데이터랩 실측 수요'],
    evidence: [
      { code: 'autocomplete', text: '네이버 자동완성 실측 — 사람들이 이미 치는 말' },
      { code: 'demand', text: '데이터랩 최근 7일 수요 실측' },
      { code: 'fresh', text: '최근 7일 정면글 0건' },
    ],
    ...over,
  });

  it('트래픽·수요를 통과하면 잴 대상이 된다 — 신규·이월 한 풀에서 검색량 큰 순', () => {
    const prev = [legacy({ keyword: '옛 작은', searchVolume: 350 }), legacy({ keyword: '옛 큰', searchVolume: 26290 }), prevRow({ keyword: '이월 선점', searchVolume: 450 })];
    const plan = planSlotMeasurement({ ledgerRows: [ledgerRow({ keyword: '신규', searchVolume: 99999 })], prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual(['신규', '옛 큰', '이월 선점', '옛 작은']);
  });

  it('WINNABLE 이면 틈새로 남고 serp·근거 줄이 붙는다', () => {
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: [legacy()], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    const out = applySlotResults(plan, new Map([['옛 틈새', serp('WINNABLE')]]), T);
    expect(out.prevRows[0].verdict).toBe('niche');
    expect(out.prevRows[0].serp?.verdict).toBe('WINNABLE');
    expect(out.prevRows[0].evidence.map((e) => e.code)).toEqual(['autocomplete', 'traffic', 'demand', 'slot', 'fresh']);
    expect(out.promoted).toEqual(['옛 틈새']);
  });

  it('LOCKED 거나 못 쟀으면 발행본에서 뺀다 — 새 정의로는 틈새라 부를 수 없다', () => {
    const prev = [legacy({ keyword: '옛 잠김' }), legacy({ keyword: '옛 못 잼', searchVolume: 320 })];
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 1, thresholds: T });
    expect(plan.targets).toEqual(['옛 잠김']);
    const out = applySlotResults(plan, new Map([['옛 잠김', serp('LOCKED')]]), T);
    expect(out.prevRows).toEqual([]);
    expect(out.dropped).toEqual(['옛 잠김', '옛 못 잼']);
  });

  it('검색량이 하한 아래면 잴 필요 없다 — 빈 자리(문서 300↓)·검색량 미확인이면 선점 후보로, 아니면 뺀다', () => {
    const prev = [
      legacy({ keyword: '검색량 없음 빈자리', searchVolume: null, documentCount: 283 }),
      legacy({ keyword: '검색량 50', searchVolume: 50, documentCount: 246 }),
      legacy({ keyword: '검색량 없음 문서 많음', searchVolume: null, documentCount: 2902 }),
    ];
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: prev, cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual([]);
    expect(plan.prevRows.map((r) => [r.keyword, r.verdict, r.preemptionKind])).toEqual([['검색량 없음 빈자리', 'preemption', 'demand-no-volume']]);
    expect(plan.prevRows[0].reasons.join(' ')).toContain('선점 후보');
    expect(plan.prevRows[0].evidence.map((e) => e.code)).toEqual(['autocomplete', 'demand', 'fresh']);
  });

  it('serp 가 있는 이월 틈새 행은 손대지 않는다', () => {
    const measured = legacy({ keyword: '새 틈새', serp: serp('WINNABLE') });
    const plan = planSlotMeasurement({ ledgerRows: [], prevRows: [measured], cache: readSlotCache(null), nowMs: NOW, max: 12, thresholds: T });
    expect(plan.targets).toEqual([]);
    expect(plan.prevRows).toEqual([measured]);
  });
});
