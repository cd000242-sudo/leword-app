import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { estimatePeak, LEAD_MIN, LEAD_MAX, SEASONAL_MULTIPLIER } from '../board-order';

/**
 * 선점 키워드를 '지금 검색량'으로 자르지 않는다 (2026-09-12).
 *
 * 사장님: "선점보드를 보면 뻔한 키워드말고 지금 미리쓰면 나중에 몇월달에 트래픽이
 * 몰릴가능성이있는 키워드를 알려주고 … 이건그냥 황금키워드를 그냥 카테고리별로 나눠놓은거자나"
 *
 * 실측으로 찾은 원인 — 발행 게이트가 검색량 하한(500)을 **지금 달 값**으로 봤다.
 * 12월에 터질 말은 9월엔 바닥이라 잘린다. 11월이 되어서야 통과하는데 그때는 상위가
 * 이미 정면 글로 찬다(실측: 검색량 1만↑ 9행 전부 상위 10개가 1~3주 전 글). 선점하려는
 * 바로 그 말을 "지금 작다"는 이유로 잘라내고 있었다.
 *
 * 계절 씨앗은 멀쩡했다 — 9월에 95개가 켜져 있었다(김장 시기·수능 디데이·단풍 명소·
 * 겨울 타이어 교체·블랙프라이데이·연말정산 간소화…). 발행까지 못 온 것이다.
 *
 * 여기서 잠그는 것은 '무엇을 살리고 무엇을 안 살리나' 다. 너무 넓히면 아무 저볼륨이나
 * 피크를 핑계로 들어온다.
 */
/** 지금은 2026년 9월. 12월 피크는 3개월 앞이다. */
const SEP = new Date(2026, 8, 12);

const publishScript = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'scripts', 'publish-preemption-board.js'),
  'utf8',
);

/**
 * **지난달까지** 이어지는 시계열을 만든다. 값은 데이터랩 비율(0~100)이다.
 *
 * 여기서 한 번 틀렸다(2026-09-12): 시계열을 작년 12월에서 끊었더니 '마지막 완결 달'이
 * 곧 피크가 되어 peakVolume 이 지금 검색량과 같아졌다. 실제 데이터는 늘 지난달까지 온다.
 *
 * @param peakMonth 이 달에 100, 나머지 달은 base
 * @param years     몇 해치
 */
function seriesEndingLastMonth(peakMonth: number | null, years: number, base = 5, now = SEP) {
  const out: { period: string; ratio: number }[] = [];
  // 지난달(= 마지막 완결 달)부터 거꾸로 12 × years 개를 채운다.
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  for (let i = 12 * years - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const month = d.getMonth() + 1;
    out.push({
      period: `${d.getFullYear()}-${String(month).padStart(2, '0')}-01`,
      ratio: peakMonth !== null && month === peakMonth ? 100 : base,
    });
  }
  return out;
}

/** 마지막 한 해에만 그 달이 튀는 시계열 — 일회성 급등(뉴스)을 흉내낸다. */
function oneOffSpike(peakMonth: number, base = 5, now = SEP) {
  const two = seriesEndingLastMonth(null, 2, base, now);
  const half = two.length / 2;
  return two.map((p, i) => (i >= half && Number(p.period.slice(5, 7)) === peakMonth ? { ...p, ratio: 100 } : p));
}

/** 게이트가 쓰는 것과 같은 규칙. 스크립트와 어긋나면 아래 배선 검사가 잡는다. */
function gateVolume(row: { searchVolume: number; demandSeries?: unknown }, now: Date): number {
  const current = Number(row.searchVolume) || 0;
  const peak = estimatePeak(row as never, now);
  if (!peak) return current;
  const ahead = peak.monthsToPeak >= LEAD_MIN && peak.monthsToPeak <= LEAD_MAX;
  if (!ahead || peak.peakRecurring === false || peak.peakMultiplier < SEASONAL_MULTIPLIER) return current;
  return Math.max(current, peak.peakVolume);
}

const MIN = 500;

describe('곧 터질 계절은 지금이 작아도 살린다', () => {
  it('12월 피크 · 2년 반복 · 9월엔 200 — 살아야 한다', () => {
    const row = { searchVolume: 200, demandSeries: seriesEndingLastMonth(12, 2) };
    const peak = estimatePeak(row as never, SEP)!;
    expect(peak.peakMonth).toBe(12);
    expect(peak.monthsToPeak).toBe(3);
    expect(peak.peakRecurring).toBe(true);
    expect(gateVolume(row, SEP)).toBeGreaterThanOrEqual(MIN);
  });

  it('1년치만 있어도 살린다 — 저볼륨은 데이터랩이 24개월을 안 준다(실측 19/43행)', () => {
    const row = { searchVolume: 200, demandSeries: seriesEndingLastMonth(12, 1) };
    const peak = estimatePeak(row as never, SEP)!;
    expect(peak.peakRecurring).toBeNull();
    expect(gateVolume(row, SEP)).toBeGreaterThanOrEqual(MIN);
  });
});

describe('아무 저볼륨이나 피크를 핑계로 들어오지 않는다', () => {
  it('피크가 이미 지났으면 안 살린다 — 다음 피크까지 열 달을 기다린다', () => {
    // 8월 피크. 9월 기준으로 다음 8월은 11개월 뒤 — 창(1~6) 밖이다.
    const row = { searchVolume: 200, demandSeries: seriesEndingLastMonth(8, 2) };
    expect(estimatePeak(row as never, SEP)!.monthsToPeak).toBe(11);
    expect(gateVolume(row, SEP)).toBe(200);
  });

  it('일회성 급등(재작년은 다른 달)은 안 살린다 — 계절이 아니라 뉴스다', () => {
    const row = { searchVolume: 200, demandSeries: oneOffSpike(12) };
    expect(estimatePeak(row as never, SEP)!.peakRecurring).toBe(false);
    expect(gateVolume(row, SEP)).toBe(200);
  });

  it('출렁임이 평소의 2배도 안 되면 계절이 아니다', () => {
    // 12월이 70, 나머지가 50 — 1.4배는 계절이라 부르지 않는다.
    const row = { searchVolume: 200, demandSeries: seriesEndingLastMonth(12, 2, 50).map((p) => (p.ratio === 100 ? { ...p, ratio: 70 } : p)) };
    expect(estimatePeak(row as never, SEP)!.peakMultiplier).toBeLessThan(SEASONAL_MULTIPLIER);
    expect(gateVolume(row, SEP)).toBe(200);
  });

  it('시계열이 없으면 지금 값 그대로다 — 모르는 것으로 구제하지 않는다', () => {
    expect(gateVolume({ searchVolume: 200 }, SEP)).toBe(200);
    expect(gateVolume({ searchVolume: 200, demandSeries: [] }, SEP)).toBe(200);
  });

  it('이미 큰 것은 그대로 통과한다 — 구제가 기존 행을 밀어내지 않는다', () => {
    expect(gateVolume({ searchVolume: 9360 }, SEP)).toBe(9360);
  });
});

describe('발행 스크립트가 실제로 그 규칙을 쓴다', () => {
  it('게이트가 지금 검색량 대신 gateVolume 을 본다', () => {
    expect(publishScript, '아직 지금 검색량으로 자른다').not.toContain('Number(row.searchVolume) >= minVolume');
    expect(publishScript).toContain('gateVolume(row) >= minVolume');
  });

  it('구제 창이 board-order 와 같은 출처다 — 두 곳에 따로 적으면 조용히 어긋난다', () => {
    expect(publishScript).toContain("require('../src/utils/board-order')");
    for (const name of ['estimatePeak', 'LEAD_MIN', 'LEAD_MAX', 'SEASONAL_MULTIPLIER']) {
      expect(publishScript, `${name} 을 안 가져온다`).toContain(name);
    }
  });

  it('일회성 급등을 빼는 조건이 들어 있다', () => {
    expect(publishScript).toContain('peak.peakRecurring === false');
  });

  it('무엇을 살렸는지 회차 로그에 남긴다 — 안 남기면 효과를 셀 수가 없다', () => {
    expect(publishScript).toContain('선점 구제');
  });
});
