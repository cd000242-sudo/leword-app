import { describe, expect, it } from 'vitest';
import { computeSignals, snapshotNear } from '../homefeed/signals';
import { at, issue, ledger, sample, settings, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호 — 신호 계산(2026-09-16). 비교할 두 시점 중 하나라도 못 쟀으면 결과는 null(화면 '미측정')이다.
 * 과거 시점은 허용 오차(수집 주기와 5분 중 큰 값) 안의 회차만 쓴다 — 10분마다 찍혔다고 가정하지 않는다.
 */
const KEY = '이란 유조선';
const titles = ['이란, 유조선 3척 타격했다', '이란 유조선 3척 타격', '이란이 유조선 3척을 타격', '유조선 선원 20명 무사 귀환'];
const samples = titles.map((title, index) => sample(title, {
  press: index === 3 ? 'b.example.com' : 'a.example.com',
  image: index === 0 ? 'https://img.example.com/a.jpg?x=1' : index === 1 ? 'https://img.example.com/a.jpg?x=2' : index === 2 ? 'https://img.example.com/b.jpg' : null,
}));

function history() {
  return [
    snapshot(at(0), [issue(KEY, { blogDocCount: 100, ranks: { 'signal.bz': 7, nate: null }, samples })]),
    snapshot(at(10), [issue(KEY, { blogDocCount: 110, ranks: { 'signal.bz': 6 }, samples })]),
    snapshot(at(20), [issue(KEY, { blogDocCount: 120, ranks: { 'signal.bz': 6 }, samples })]),
    snapshot(at(30), [issue(KEY, { blogDocCount: 130, ranks: { 'signal.bz': 5, nate: null }, samples })]),
    snapshot(at(40), [issue(KEY, { blogDocCount: 150, ranks: { 'signal.bz': 4 }, samples })]),
    // 원천을 못 받은 회차 — 목록에 없는 게 아니라 못 본 것이다
    snapshot(at(50), [], { sources: [{ name: 'signal.bz', ok: false, count: 0, error: '실패' }] }),
    snapshot(at(60), [issue(KEY, { blogDocCount: 200, ranks: { 'signal.bz': 2, nate: 3 }, samples })]),
  ];
}

describe('과거 시점 고르기', () => {
  it('허용 오차 안의 가장 가까운 앞선 회차만 쓴다', () => {
    const rows = history();
    const now = Date.parse(at(60));
    expect(snapshotNear(rows, now - 30 * 60_000, 10 * 60_000, now)?.capturedAt).toBe(at(30));
    expect(snapshotNear([rows[0], rows[6]], now - 30 * 60_000, 10 * 60_000, now)).toBeNull();
    expect(snapshotNear(rows, now, 10 * 60_000, now)?.capturedAt).toBe(at(50));
  });
});

describe('신호 계산', () => {
  const rows = history();
  const latest = rows[6];
  const signals = computeSignals(rows, latest, latest.issues[0], ledger([{ keyword: KEY, firstSeenAt: at(0) }]).entries['이란유조선'], settings());

  it('나이 · 순위 변화 · 원천 확산을 실측으로 잰다', () => {
    expect(signals.ageMinutes).toBe(60);
    expect(signals.firstSeenCensored).toBe(false);
    expect(signals).toMatchObject({ rankNow: 2, rankSource: 'signal.bz', rankDelta30m: -3, rankDelta60m: -5 });
    expect(signals).toMatchObject({ sourceCountNow: 2, sourceNames: ['signal.bz', 'nate'], sourceDelta30m: 1, sourceDelta60m: 1 });
  });

  it('문서 증가 · 속도 · 가속은 단순 산술이다', () => {
    expect(signals).toMatchObject({ blogDocNow: 200, docDelta10m: null, docDelta30m: 70, docDelta60m: 100, docVelocity30m: 2.33, docAcceleration: 40 });
  });

  it('지속성은 원천을 못 받은 회차를 건너뛰고, 60분 등장은 실제로 찍힌 회차로 나눈다', () => {
    expect(signals.persistenceStreak).toBe(6);
    expect(signals.presence60m).toEqual({ seen: 6, total: 6 });
  });

  it('포화는 기준어를 뺀 유사 제목 묶음으로, 이미지 후보는 쿼리를 뗀 주소로 센다', () => {
    expect(signals).toMatchObject({ sampleN: 4, cloneN: 3, cloneRatio: 0.75, cloneRatioPrev30m: 0.75 });
    expect(signals.visualCandidateCount).toBe(2);
    expect(signals.pressCountNow).toBe(2);
  });

  it('한쪽이라도 못 쟀으면 null 로 남긴다 — 0 으로 채우지 않는다', () => {
    const broken = history();
    broken[3] = snapshot(at(30), [issue(KEY, { blogDocCount: null, samples })]);
    const partial = computeSignals(broken, broken[6], broken[6].issues[0], null, settings());
    expect(partial).toMatchObject({ docDelta30m: null, docVelocity30m: null, docAcceleration: null, ageMinutes: null, firstSeenCensored: true });
    expect(partial.docDelta60m).toBe(100);
  });

  it('표본이 없으면 포화 비율도 미측정', () => {
    const lone = snapshot(at(60), [issue('빈 이슈', { samples: [] })]);
    expect(computeSignals([lone], lone, lone.issues[0], null, settings())).toMatchObject({ sampleN: 0, cloneN: null, cloneRatio: null, visualCandidateCount: 0 });
  });
});
