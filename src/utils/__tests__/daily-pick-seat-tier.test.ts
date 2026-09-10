import { describe, expect, it } from 'vitest';
import { selectPicks, type Candidate, type Gated, type MeasuredRow, type PickSource } from '../../main/handlers/daily-pick';

/**
 * 반열림을 버리지 않는다(2026-09-11).
 *
 * 실측 회차(2026-09-10T15:22Z): 잰 14개의 판정이 **잠김 7 · 반열림 7 · 열림 0** 이었고
 * 화면은 0개를 내놓았다. 반열림은 자리 실측기가 "경쟁 있으나 여지 있음"이라 부르는 값이다
 * (serp-winnability: 제목 정확 일치 2건 이하). 그걸 통째로 버리면 잰 사실을 안 쓰는 것이다.
 *
 * 규칙: **열림이 먼저**, 자리가 남을 때만 반열림으로 채운다. 카드에는 잰 판정을 그대로 적는다
 * (지어내지 않는다). 잠김·카드답·자료없음은 그대로 탈락이다.
 */
const g = (keyword: string, source: PickSource = '선점 보드', over: Partial<Candidate> = {}): Gated => ({
  candidate: {
    keyword, source, topic: '', searchVolume: 1000, documentCount: 100,
    facing: null, vacancy: null, titles: [], related: [], why: '', facts: [], ...over,
  },
  fitReason: '견줄 게 없어요',
  myTopic: false,
});

const row = (keyword: string, verdict: string | null, over: Partial<MeasuredRow> = {}): MeasuredRow =>
  ({ keyword, status: 'ok', verdict, facing: 2, vacancy: 3, reason: '이유', measuredAt: '2026-09-11T00:00:00.000Z', ...over });

describe('열림이 먼저, 반열림이 그다음', () => {
  it('열림으로 셋이 차면 반열림은 안 쓴다', () => {
    const t = [g('열1'), g('열2'), g('열3'), g('반1')];
    const rows = [row('열1', '열림'), row('열2', '열림'), row('열3', '열림'), row('반1', '반열림')];
    const out = selectPicks(t, rows, null, 3);
    expect(out.picks.map((p) => p.keyword)).toEqual(['열1', '열2', '열3']);
    expect(out.picks.every((p) => p.seat === '열림')).toBe(true);
  });

  it('열림이 모자라면 반열림이 뒤를 채운다 — 실측 회차가 이 모양이었다', () => {
    const t = [g('잠1'), g('반1'), g('반2'), g('잠2'), g('반3'), g('반4')];
    const rows = [row('잠1', '잠김'), row('반1', '반열림'), row('반2', '반열림'),
      row('잠2', '잠김'), row('반3', '반열림'), row('반4', '반열림')];
    const out = selectPicks(t, rows, null, 3);
    expect(out.picks).toHaveLength(3);
    expect(out.picks.map((p) => p.keyword)).toEqual(['반1', '반2', '반3']);
  });

  it('세운 카드는 잰 판정을 그대로 적는다 — 반열림을 열림이라 부르지 않는다', () => {
    const out = selectPicks([g('반1')], [row('반1', '반열림', { reason: '제목 정확 일치 2건' })], null, 3);
    expect(out.picks[0].seat).toBe('반열림');
    expect(out.picks[0].seatReason).toBe('제목 정확 일치 2건');
    expect(out.picks[0].seatFacing).toBe(2);
  });
});

describe('닫힌 것은 그대로 탈락', () => {
  it('잠김·카드답·자료없음은 안 세운다', () => {
    const t = [g('잠'), g('카드'), g('없음')];
    const rows = [row('잠', '잠김'), row('카드', '카드답'), row('없음', '자료없음')];
    const out = selectPicks(t, rows, null, 3);
    expect(out.picks).toHaveLength(0);
    expect(out.rejected.map((r) => r.seat).sort()).toEqual(['자료없음', '잠김', '카드답']);
  });

  it('못 잰 것은 잰 수에 안 넣는다 — 안 잰 것을 잰 것처럼 세지 않는다', () => {
    const out = selectPicks([g('막힘'), g('열림')], [row('막힘', null, { status: 'blocked' }), row('열림', '열림')], null, 3);
    expect(out.measured).toBe(1);
    expect(out.rejected.some((r) => r.keyword === '막힘')).toBe(false);
  });

  it('안 세운 것은 왜 안 세웠는지 남는다 — 자리는 있었지만 셋이 찼다는 것도 적는다', () => {
    const t = [g('반1'), g('반2')];
    const out = selectPicks(t, [row('반1', '반열림'), row('반2', '반열림')], null, 1);
    expect(out.picks.map((p) => p.keyword)).toEqual(['반1']);
    expect(out.rejected).toEqual([{ keyword: '반2', source: '선점 보드', seat: '반열림' }]);
  });
});

describe('봉투는 자리를 잰 뒤 다시 본다', () => {
  const envelope = { docMax: 300, facingMax: 5, topics: [], wonRows: 4 } as any;

  it('실제 정면 수가 내가 이겨본 것을 넘으면 뺀다', () => {
    const out = selectPicks([g('큼', '선점 보드', { documentCount: 200 })], [row('큼', '열림', { facing: 9 })], envelope, 3);
    expect(out.picks).toHaveLength(0);
    expect(out.rejected[0].seat).toBe('내 범위 밖');
  });

  it('봉투 안이면 그 이유를 카드에 담는다', () => {
    const out = selectPicks([g('맞음', '선점 보드', { documentCount: 200 })], [row('맞음', '열림', { facing: 2 })], envelope, 3);
    expect(out.picks).toHaveLength(1);
    expect(out.picks[0].fitReason.length).toBeGreaterThan(0);
  });
});
