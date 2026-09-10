import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 오늘 쓸 한 편 — 화면이 잰 판정을 그대로 적는가(2026-09-11).
 *
 * 반열림도 카드로 세우기로 했으니(selectPicks), 화면이 배지를 '자리 열림'으로 박아 두면
 * **반열림을 열림이라 부르게 된다.** 지어낸 말이 카드에 실리는 순간 이 판은 못 믿을 판이 된다.
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const dp = html.slice(html.indexOf('function dpCard(p, idx)'), html.indexOf('window.loadDailyPick'));

describe('카드는 잰 판정을 그대로 적는다', () => {
  it('배지 글자를 박아 두지 않는다 — p.seat 에서 온다', () => {
    expect(dp.length).toBeGreaterThan(500);
    expect(dp, "배지에 '자리 열림'이 박혀 있다").not.toContain('>자리 열림<');
    expect(dp).toContain('p.seat');
  });

  it('열림과 반열림의 색이 다르다 — 눈으로도 구분된다', () => {
    expect(dp).toContain("p.seat === '열림'");
  });
});

describe('안 세운 것의 이유를 뭉뚱그리지 않는다', () => {
  it("탈락 머리말이 '닫혀 있어'라고 단정하지 않는다 — 자리가 있어도 셋이 차면 빠진다", () => {
    const rej = html.slice(html.indexOf("const rejBox = document.getElementById('dpRejected')"));
    expect(rej.slice(0, 3000)).not.toContain('자리가 닫혀 있어 안 세운 것');
  });
});
