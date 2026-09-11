import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 실검 틈새에 글감을 붙인다(2026-09-11).
 *
 * 사장님 "실검 틈새키워드도 지금 실시간 바로재기 누르면 바로재지는데 그게끝이야
 *        파생이나 연관키워드 확장키워드도 없고 분석하는버튼도없고 검색하러가는버튼도없고".
 *
 * 실측(코드에서 셈): 틈새 행이 내놓는 버튼은 [네이버] 하나뿐이었다.
 * 같은 앱의 '오늘 쓸 한 편' 카드는 [복사]·[자리 보기]·[더 파보기]·[추적 시작] + 발행 주소 칸을 갖고,
 * 제목 후보·같이 넣을 말·근거 기사까지 준다. 부품은 이미 다 있는데 틈새 행에만 안 붙어 있었다.
 *
 * 그래서 새로 만들지 않는다 — golden-writing-kit(제목 후보·같이 넣을 말)과
 * analyze-keyword-demand(수요)를 **황금 발굴이 쓰던 그 함수 그대로** 틈새에도 잇는다.
 * 두 화면이 다른 부품을 쓰면 같은 검색어에 다른 제목이 나온다.
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');

describe('글감 펼치기를 두 화면이 같이 쓴다', () => {
  it('펼치기 본체가 화면과 분리돼 있다', () => {
    expect(html).toContain('window.openWritingKit');
  });

  it('황금 발굴이 그 본체를 쓴다 — 사본을 만들지 않는다', () => {
    // analyzeDemand 는 본체 안에서 먼저 '호출'된다 — 정의부로 끊어야 슬라이스가 안 뒤집힌다.
    const drill = html.slice(html.indexOf('window.goldenDrilldown'), html.indexOf('window.analyzeDemand = '));
    expect(drill).toContain('openWritingKit(');
    // 옛 본체가 통째로 남아 있으면 둘이 갈라진다
    expect(drill, '황금 쪽에 사본이 남아 있다').not.toContain("invoke('golden-writing-kit'");
  });

  it('틈새도 같은 본체를 쓴다', () => {
    const niche = html.slice(html.indexOf('window.nicheDrilldown'), html.indexOf('window.nicheDrilldown') + 1400);
    expect(niche).toContain('openWritingKit(');
  });

  it('닫기 버튼이 자기 화면으로 돌아간다 — 황금 것이 박혀 있지 않다', () => {
    expect(html).toContain('function kitPanelHtml(kw, idx, kit, relatedFallback, note, closeFn)');
    expect(html).toContain("closeFn || 'goldenDrilldown'");
  });
});

describe('틈새 행이 쓸 거리를 준다', () => {
  const seg = html.slice(html.indexOf('window.renderRealtimeNiche'), html.indexOf('window.nicheDrilldown'));

  it('더 파보기·자리 보기·추적 시작이 붙어 있다', () => {
    expect(seg).toContain('더 파보기');
    expect(seg).toContain('자리 보기');
    expect(seg).toContain('추적 시작');
  });

  it('네이버로 가는 버튼은 그대로 있다', () => {
    expect(seg).toContain('openNaverSearch');
  });

  it('펼칠 자리를 행마다 만든다', () => {
    expect(seg).toContain('niche-drill-');
    expect(seg).toContain('niche-drill-content-');
  });

  it('자리를 아직 안 잰 줄은 그 자리에서 잴 수 있다', () => {
    expect(seg).toContain('nicheMeasureSeat');
  });
});

describe('판정을 새로 만들지 않는다', () => {
  it('틈새 화면이 제목이나 등급을 직접 만들지 않는다 — 창구가 준 것만 그린다', () => {
    const seg = html.slice(html.indexOf('window.renderRealtimeNiche'), html.indexOf('window.analyzeDemand'));
    expect(seg).not.toContain('forgeTitles');
    expect(seg).not.toContain('goldenRatio =');
  });
});
