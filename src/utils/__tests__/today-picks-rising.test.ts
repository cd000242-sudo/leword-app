import { describe, expect, it } from 'vitest';

const rising = require('../../../scripts/today-picks-rising');
const store = require('../../../scripts/today-picks-volume-history');
const { candidatePools, selectRows } = require('../../../scripts/today-picks-selection');
const { buildHistoryFromSnapshots } = require('../../../scripts/build-volume-history-from-git');

/*
 * 오늘의 추천 정렬 교체 (2026-11-08 사장님 승인).
 * 현행 "이번 달·다음 달 피크 시즌 씨앗 먼저 → 검색량 큰 순" (시험 구간 상위 20 적중 15%)
 *  → "피크가 다음 달·두 달 뒤인 시즌 씨앗 먼저 → 그 안에서 최근 12일 검색량 오름세 큰 순" (92.5%).
 * 근거 실험: golden_ml/golden_lib/rules.py 의 v1(현행) · v4(개선), report/taskA_rule_variants.csv.
 */
const at = (iso: string) => new Date(iso);
const day = (iso: string) => store.kstDayNumber(Date.parse(iso));

describe('정렬 시즌 창 — KST 기준 다음 달 · 두 달 뒤', () => {
  it('11월이면 12월·1월, 12월이면 1월·2월 (해를 넘긴다)', () => {
    expect(rising.rankingMonths(at('2026-11-08T03:00:00Z'))).toEqual([12, 1]);
    expect(rising.rankingMonths(at('2026-12-15T03:00:00Z'))).toEqual([1, 2]);
    expect(rising.rankingMonths(at('2026-10-01T03:00:00Z'))).toEqual([11, 12]);
  });
  it('달이 바뀌는 시각은 UTC 가 아니라 KST 자정이다', () => {
    expect(rising.rankingMonths(at('2026-11-30T14:59:59Z'))).toEqual([12, 1]); // KST 11/30 23:59:59
    expect(rising.rankingMonths(at('2026-11-30T15:00:00Z'))).toEqual([1, 2]);  // KST 12/01 00:00:00
  });
  it('표시용 "이번 달·다음 달" 창(seasonPeakMonth)은 그대로다', () => {
    expect(rising.upcomingMonths(at('2026-11-08T03:00:00Z'))).toEqual([11, 12]);
    expect(rising.upcomingMonths(at('2026-12-31T15:00:00Z'))).toEqual([1, 2]);
  });
  it('시즌 판정은 기존 seasonPeak 를 그대로 쓴다 — month:M 씨앗만, 창 안의 달일 때만', () => {
    expect(rising.seasonPeak({ source: 'month:12' }, [12, 1])).toBe(12);
    expect(rising.seasonPeak({ source: 'month:1' }, [12, 1])).toBe(1);
    expect(rising.seasonPeak({ source: 'month:11' }, [12, 1])).toBe(null);
    expect(rising.seasonPeak({ source: 'hint' }, [12, 1])).toBe(null);
  });
  it('이력으로 추적할 범위는 다음 달 · 두 달 뒤 · 석 달 뒤 피크 씨앗이다 (두 달 뒤 창에 들어올 때 이미 12일치가 있도록)', () => {
    expect(rising.trackedMonths(at('2026-11-08T03:00:00Z'))).toEqual([12, 1, 2]);
    expect(rising.trackedMonths(at('2026-11-30T15:00:00Z'))).toEqual([1, 2, 3]);
  });
});

describe('오름세 = ln(검색량 ÷ 12일 전 검색량), 0.05~20 로 자른다', () => {
  const D = day('2026-11-08T03:00:00Z');
  it('12일 전(이하) 값이 있으면 그것으로 — 2배면 ln 2', () => {
    expect(rising.momentumOf([[D - 14, 5000], [D - 9, 8000]], D, 10000)).toBeCloseTo(Math.log(2), 10);
  });
  it('12일 전 값이 없으면 3일 전(이하) 값으로 대신한다', () => {
    expect(rising.momentumOf([[D - 4, 3000]], D, 6000)).toBeCloseTo(Math.log(2), 10);
  });
  it('3일 안 값만 있거나 이력이 없으면 0 (현행 순서로 떨어진다)', () => {
    expect(rising.momentumOf([[D - 1, 3000]], D, 6000)).toBe(0);
    expect(rising.momentumOf([], D, 6000)).toBe(0);
    expect(rising.momentumOf(undefined, D, 6000)).toBe(0);
  });
  it('폭주(20배 초과)·붕괴(0.05배 미만)는 자르고, 12일 전 값이 0이면 20배로 본다', () => {
    expect(rising.momentumOf([[D - 13, 10]], D, 1000)).toBeCloseTo(Math.log(20), 10);
    expect(rising.momentumOf([[D - 13, 0]], D, 1000)).toBeCloseTo(Math.log(20), 10);
    expect(rising.momentumOf([[D - 13, 100000]], D, 1000)).toBeCloseTo(Math.log(0.05), 10);
  });
  it('너무 오래된 값(30일 초과)은 12일 오름세가 아니므로 쓰지 않는다', () => {
    expect(rising.momentumOf([[D - 31, 1000]], D, 5000)).toBe(0);
    expect(rising.momentumOf([[D - 30, 1000]], D, 5000)).toBeCloseTo(Math.log(5), 10);
  });
  it('현재 검색량이 숫자가 아니면 0', () => {
    expect(rising.momentumOf([[D - 14, 5000]], D, NaN)).toBe(0);
  });
});

/*
 * rules.py v4 와 같은 순서 — 작은 고정 데이터.
 * 기대 순서는 실험 라이브러리(golden_lib.seed_task.build_seed_samples)로 같은 스냅샷에서 뽑은 v4 점수
 * (season(1-2 개월 앞) * 100 + ln(clip(12일 변화율, 0.05, 20)), 12일 값이 없으면 3일 변화율, 그것도 없으면 1)
 * 의 내림차순이다. 동점은 실험에선 난수였고, 여기선 검색량 큰 순이다.
 */
const SNAPSHOTS = [
  ['2026-10-25T12:00:00Z', { A겨울: [5000, 'month:12'], B겨울: [20000, 'month:1'], C겨울: [16000, 'month:12'], F급등: [10, 'month:12'], G제로: [1, 'month:1'], H이번달: [10000, 'month:11'], I일반: [100000, 'hint'], J석달뒤: [50000, 'month:2'], K작년: [4000, 'month:12'] }],
  ['2026-10-30T12:00:00Z', { A겨울: [6000, 'month:12'], B겨울: [20000, 'month:1'], C겨울: [12000, 'month:12'], F급등: [40, 'month:12'], G제로: [1, 'month:1'], H이번달: [30000, 'month:11'], I일반: [100000, 'hint'], J석달뒤: [50000, 'month:2'], K작년: [4000, 'month:12'] }],
  ['2026-11-04T12:00:00Z', { A겨울: [8000, 'month:12'], B겨울: [20000, 'month:1'], C겨울: [9000, 'month:12'], E사흘: [3000, 'month:1'], F급등: [400, 'month:12'], G제로: [1, 'month:1'], H이번달: [60000, 'month:11'], I일반: [100000, 'hint'], J석달뒤: [50000, 'month:2'], K작년: [4000, 'month:12'] }],
] as const;
const ANCHOR = '2026-11-08T12:00:00Z';
const ANCHOR_SEEDS = Object.entries({
  A겨울: [10000, 'month:12'], B겨울: [20000, 'month:1'], C겨울: [8000, 'month:12'], D신규: [30000, 'month:12'], E사흘: [6000, 'month:1'],
  F급등: [1000, 'month:12'], G제로: [1100, 'month:1'], H이번달: [90000, 'month:11'], I일반: [100000, 'hint'], J석달뒤: [50000, 'month:2'], K작년: [4000, 'month:12'],
} as Record<string, [number, string]>).map(([keyword, [searchVolume, source]]) => ({ keyword, searchVolume, source }));
const snapshotsOf = () => SNAPSHOTS.map(([builtAt, seeds]) => ({ builtAt, seeds: Object.entries(seeds).map(([keyword, [searchVolume, source]]) => ({ keyword, searchVolume, source })) }));
const PYTHON_V4_GROUP_ORDER = ['G제로', 'F급등', 'A겨울', 'E사흘', 'D신규', 'B겨울', 'K작년', 'C겨울'];

describe('rules.py v4 와 같은 순서', () => {
  const history = buildHistoryFromSnapshots(snapshotsOf(), { everyDays: 1 });
  const ranker = rising.createRanker({ seeds: ANCHOR_SEEDS, history, now: at(ANCHOR) });
  const ordered = [...ANCHOR_SEEDS].sort(ranker.poolOrder).map((s) => s.keyword);

  it('다음 달·두 달 뒤 피크 씨앗 8개가 앞이고, 그 안의 순서가 v4 와 한 줄도 다르지 않다', () => {
    expect(ordered.slice(0, 8)).toEqual(PYTHON_V4_GROUP_ORDER);
  });
  it('시즌 앞이 아닌 씨앗(이번 달 피크·석 달 뒤·일반)은 오름세와 무관하게 현행 순서(검색량 큰 순) 그대로 뒤에 온다', () => {
    expect(ordered.slice(8)).toEqual(['I일반', 'H이번달', 'J석달뒤']);
  });
  it('이력을 같은 스냅샷에서 두 번 만들어도(재현) 순서가 같다 — 결정적이다', () => {
    const again = rising.createRanker({ seeds: ANCHOR_SEEDS, history: buildHistoryFromSnapshots(snapshotsOf(), { everyDays: 1 }), now: at(ANCHOR) });
    expect([...ANCHOR_SEEDS].sort(again.poolOrder).map((s) => s.keyword)).toEqual(ordered);
  });
  it('이력이 아직 없으면 오름세 0 — 시즌 앞 씨앗이 검색량 큰 순으로 먼저, 나머지도 검색량 큰 순(오류·빈 화면 없음)', () => {
    for (const empty of [null, undefined, store.emptyHistory()]) {
      const r = rising.createRanker({ seeds: ANCHOR_SEEDS, history: empty, now: at(ANCHOR) });
      const keywords = [...ANCHOR_SEEDS].sort(r.poolOrder).map((s) => s.keyword);
      expect(keywords).toEqual(['D신규', 'B겨울', 'A겨울', 'C겨울', 'E사흘', 'K작년', 'G제로', 'F급등', 'I일반', 'H이번달', 'J석달뒤']);
    }
  });
  it('오름세·검색량이 같으면 이름의 코드 포인트 순이다 — PC 로케일과 무관하게 CI 와 같은 순서', () => {
    const tied = [{ keyword: '크리스마스캘린더', searchVolume: 870, source: 'month:12' }, { keyword: 'LG김치냉장고', searchVolume: 870, source: 'month:12' }];
    const r = rising.createRanker({ seeds: tied, history, now: at(ANCHOR) });
    expect([...tied].sort(r.poolOrder).map((s) => s.keyword)).toEqual(['LG김치냉장고', '크리스마스캘린더']);
  });
  it('시즌 앞 씨앗이 하나도 없는 창고는 예전 순서(검색량 큰 순, 동점은 이름순)와 완전히 같다', () => {
    const plain = [{ keyword: '나', searchVolume: 900, source: 'hint' }, { keyword: '가', searchVolume: 900, source: 'biztp:5' }, { keyword: '다', searchVolume: 5000, source: 'event:1' }];
    const r = rising.createRanker({ seeds: plain, history, now: at(ANCHOR) });
    expect([...plain].sort(r.poolOrder).map((s) => s.keyword)).toEqual(['다', '가', '나']);
  });
});

describe('선정 규칙의 나머지는 그대로', () => {
  const D = day(ANCHOR);
  const history = { entries: new Map([['오름', [[D - 14, 1000]]], ['보합', [[D - 14, 3000]]]]), updatedDay: D - 1 };
  const seeds = [
    { keyword: '큰일반', searchVolume: 90000, source: 'hint' },
    { keyword: '보합', searchVolume: 3000, source: 'month:12' },
    { keyword: '오름', searchVolume: 2000, source: 'month:12' },
  ];
  const ranker = rising.createRanker({ seeds, history, now: at(ANCHOR) });
  const row = (keyword: string, ratio: number, extra = {}) => ({ keyword, searchVolume: 1000, documentCount: 1000 / ratio, ratio, ...extra });

  it('후보 풀은 시즌 앞·오름세 순으로 perTopic 만큼 자르되 7일 안에 실린 말은 신규 풀에서 빠진다', () => {
    const shown = new Map([['오름', new Date().toISOString()]]);
    const pools = candidatePools(seeds, shown, 2, ranker.poolOrder);
    expect(pools.fresh.map((s: any) => s.keyword)).toEqual(['보합', '큰일반']);
    expect(pools.repeated.map((s: any) => s.keyword)).toEqual(['오름']);
  });
  it('순서 인자를 안 주면 후보 풀은 예전처럼 검색량 큰 순이다', () => {
    expect(candidatePools(seeds, new Map(), 3).fresh.map((s: any) => s.keyword)).toEqual(['큰일반', '보합', '오름']);
  });
  it('황금(비율 1+)은 오름세와 무관하게 채움 행보다 앞이다 — 황금 조건·표시 개수 그대로', () => {
    const rows = [row('오름', 0.2), row('보합', 0.9), row('일반황금', 4), row('큰일반', 0.5)];
    const out = selectRows(rows, new Map(), 3, 1, undefined, ranker.rowOrder);
    expect(out.map((r: any) => r.keyword)).toEqual(['일반황금', '오름', '보합']);
  });
  it('채움 행은 시즌 앞(오름세 큰 순) → 나머지(황금비 큰 순)이고, 최근 7일 실린 말은 맨 뒤다', () => {
    const rows = [row('큰일반', 0.5), row('보합', 0.9), row('오름', 0.2), row('작은일반', 0.1)];
    const out = selectRows(rows, new Map([['보합', '2026-11-06T00:00:00.000Z']]), 4, 1, undefined, ranker.rowOrder);
    expect(out.map((r: any) => r.keyword)).toEqual(['오름', '큰일반', '작은일반', '보합']);
    expect(out[3].freshness).toEqual({ status: 'repeated', lastShownAt: '2026-11-06T00:00:00.000Z' });
  });
  it('순서 인자를 안 주면 채움 행은 예전처럼 seasonPeakMonth 표시 → 황금비 순이다', () => {
    const rows = [row('가', 0.9), row('나', 0.2, { seasonPeakMonth: 12 })];
    expect(selectRows(rows, new Map(), 2).map((r: any) => r.keyword)).toEqual(['나', '가']);
  });
});

describe('검색량 이력 파일 — 작게, 오래된 건 자르고, 깨져도 죽지 않는다', () => {
  const inScope = (seed: any) => /^month:/.test(seed.source);
  const seed = (keyword: string, searchVolume: number, source = 'month:12') => ({ keyword, searchVolume, source });

  it('하루 걸러 한 번만 남긴다 — 같은 날 재실행과 하루 뒤는 건너뛴다', () => {
    let h = store.recordSnapshot(store.emptyHistory(), [seed('가', 100)], { day: 100, inScope });
    h = store.recordSnapshot(h, [seed('가', 110)], { day: 100, inScope });
    h = store.recordSnapshot(h, [seed('가', 120)], { day: 101, inScope });
    h = store.recordSnapshot(h, [seed('가', 130)], { day: 102, inScope });
    expect(store.pointsOf(h, '가')).toEqual([[100, 100], [102, 130]]);
  });
  it('시간을 거슬러 온 스냅샷은 무시한다', () => {
    let h = store.recordSnapshot(store.emptyHistory(), [seed('가', 100)], { day: 110, inScope });
    h = store.recordSnapshot(h, [seed('가', 50)], { day: 105, inScope });
    expect(store.pointsOf(h, '가')).toEqual([[110, 100]]);
  });
  it('추적 범위 밖 씨앗 · 검색량이 숫자가 아니거나 0 이하인 씨앗은 남기지 않는다', () => {
    const h = store.recordSnapshot(store.emptyHistory(), [seed('범위밖', 100, 'hint'), seed('영', 0), seed('엔에이엔', NaN), seed('정상', 7)], { day: 100, inScope });
    expect([...h.entries.keys()]).toEqual(['정상']);
  });
  it('입력 이력을 바꾸지 않고 새 이력을 돌려준다', () => {
    const before = store.recordSnapshot(store.emptyHistory(), [seed('가', 100)], { day: 100, inScope });
    const snapshot = JSON.stringify(store.serializeHistory(before));
    store.recordSnapshot(before, [seed('가', 200), seed('나', 5)], { day: 110, inScope });
    expect(JSON.stringify(store.serializeHistory(before))).toBe(snapshot);
  });
  it('보관 16일 밖 값은 자르되, 12일 전 기준으로 쓸 가장 최근 옛 값 하나는 30일까지 남긴다', () => {
    let h = store.emptyHistory();
    for (const d of [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120]) h = store.recordSnapshot(h, [seed('가', d)], { day: d, inScope });
    // 120 기준 16일 → 104 이상 + 그보다 옛 값 중 가장 최근(102)
    expect(store.pointsOf(h, '가').map((p: number[]) => p[0])).toEqual([102, 104, 106, 108, 110, 112, 114, 116, 118, 120]);
  });
  it('갱신이 끊겨 30일을 넘긴 키워드는 이력에서 빠진다', () => {
    let h = store.recordSnapshot(store.emptyHistory(), [seed('옛날', 5), seed('계속', 5)], { day: 100, inScope });
    h = store.recordSnapshot(h, [seed('계속', 6)], { day: 131, inScope });
    expect([...h.entries.keys()]).toEqual(['계속']);
  });
  it('한 키워드의 점 수 · 전체 키워드 수에 상한이 있다 — 상한 밖은 검색량 작은 쪽부터 버린다', () => {
    let h = store.emptyHistory();
    for (let d = 0; d < 60; d += 1) h = store.recordSnapshot(h, [seed('가', 100 + d)], { day: 1000 + d, inScope });
    expect(store.pointsOf(h, '가').length).toBeLessThanOrEqual(store.MAX_POINTS);
    const many = Array.from({ length: store.MAX_ENTRIES + 500 }, (_, i) => seed(`씨앗${i}`, 1000 + i));
    const capped = store.recordSnapshot(store.emptyHistory(), many, { day: 100, inScope });
    expect(capped.entries.size).toBe(store.MAX_ENTRIES);
    expect(capped.entries.has('씨앗0')).toBe(false);
    expect(capped.entries.has(`씨앗${store.MAX_ENTRIES + 499}`)).toBe(true);
  });
  it('가장 나쁜 경우에도 파일이 800KB 를 넘지 않는다 (상한 키워드 × 상한 점 수, 긴 한글 이름)', () => {
    let h = store.emptyHistory();
    for (let d = 0; d < 40; d += 1) {
      const seeds = Array.from({ length: store.MAX_ENTRIES }, (_, i) => seed(`겨울이불세탁방법종류${i}`, 1_000_000 + i * 37 + d));
      h = store.recordSnapshot(h, seeds, { day: 20000 + d, inScope });
    }
    const bytes = Buffer.byteLength(JSON.stringify(store.serializeHistory(h)), 'utf8');
    expect(bytes).toBeLessThan(800_000);
  });
  it('직렬화 → 파싱이 왕복한다 (키워드 순 정렬이라 같은 내용이면 같은 파일)', () => {
    const h = store.recordSnapshot(store.emptyHistory(), [seed('나', 5), seed('가', 7)], { day: 100, inScope });
    const text = JSON.stringify(store.serializeHistory(h));
    expect(Object.keys(JSON.parse(text).entries)).toEqual(['가', '나']);
    expect(JSON.stringify(store.serializeHistory(store.parseHistory(JSON.parse(text))))).toBe(text);
  });
  it('깨진 파일 · 빈 값 · 버전 불일치 · 모양이 틀린 점은 빈 이력으로 (던지지 않는다)', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { version: 99, entries: {} }, { version: 1, entries: [] }]) {
      expect(store.parseHistory(bad).entries.size).toBe(0);
    }
    const partly = store.parseHistory({ version: 1, entries: { 정상: [[100, 5], [102, 6]], 뒤죽박죽: [[102, 6], [100, 5]], 문자: [['a', 'b']], 음수: [[100, -5]], 비배열: 7 } });
    expect([...partly.entries.keys()].sort()).toEqual(['뒤죽박죽', '정상']);
    expect(store.pointsOf(partly, '뒤죽박죽')).toEqual([[100, 5], [102, 6]]);
  });
  it('기준값 조회 — 그날 이하 가장 최근 점', () => {
    const points = [[100, 5], [104, 9], [110, 20]];
    expect(store.volumeAtOrBefore(points, 104)).toEqual([104, 9]);
    expect(store.volumeAtOrBefore(points, 103)).toEqual([100, 5]);
    expect(store.volumeAtOrBefore(points, 99)).toBe(null);
  });
});

describe('git 스냅샷으로 이력 만들기 (처음 한 번 · 실험 재현용)', () => {
  it('같은 builtAt 은 한 번만, 시간순이 아니어도 시간순으로 넣고, asOf 이후는 버린다', () => {
    const snaps = snapshotsOf();
    const shuffled = [snaps[2], snaps[0], snaps[0], snaps[1]];
    const h = buildHistoryFromSnapshots(shuffled, { everyDays: 1, asOf: '2026-11-03T00:00:00Z' });
    expect(store.pointsOf(h, 'A겨울').map((p: number[]) => p[1])).toEqual([5000, 6000]);
  });
  it('옛 스냅샷에서 출처 표시가 달랐던 씨앗도(hint → month:12) 이름이 추적 범위면 그 전 점을 잃지 않는다', () => {
    const snaps = [
      { builtAt: '2026-10-25T12:00:00Z', seeds: [{ keyword: '연하장', searchVolume: 1000, source: 'hint' }] },
      { builtAt: '2026-11-04T12:00:00Z', seeds: [{ keyword: '연하장', searchVolume: 1500, source: 'month:12' }] },
    ];
    expect(store.pointsOf(buildHistoryFromSnapshots(snaps, { everyDays: 1 }), '연하장').map((p: number[]) => p[1])).toEqual([1000, 1500]);
  });
  it('추적 범위는 마지막 스냅샷 달 기준이다 — 이번 달 피크(11월)·일반 씨앗은 이력에 없다', () => {
    const h = buildHistoryFromSnapshots(snapshotsOf(), { everyDays: 1 });
    // 이력의 키는 정규화(소문자·공백 제거)된 이름이다
    expect([...h.entries.keys()].sort()).toEqual(['a겨울', 'b겨울', 'c겨울', 'e사흘', 'f급등', 'g제로', 'j석달뒤', 'k작년'].sort());
  });
});
