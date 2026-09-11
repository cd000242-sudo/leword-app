import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { isRealVacancy } from '../../main/handlers/trend-import';

/**
 * 아무도 안 치는 말을 '빈자리'라 부르던 것(2026-09-11).
 *
 * 사장님 "트렌드 CSV 들이기도 결과가 제대로 잘나와야되는데 안나오네".
 *
 * 실측(이 PC 브라우저로 블로그탭을 직접 받아 잼):
 *   '시메오네 아틀레티코 결렬 가능성 50~60%'  표본 3 · 정면 0 · 부분 0 → 열림
 *     상위 제목: "이강인 올여름 이적 임박? 그리즈만 대체자 아틀레티코 최우선 타깃"
 *                "NEWS :: 대한민국 영어공장 내신 수능 워크북"
 *                "월스트리트 퀀트의 시선 데이터로 해체한 글로벌 마켓"
 *   상위 목록이 그 검색어와 아무 상관이 없다. 자리가 빈 게 아니라 **아무도 그 말로 안 온다.**
 *   검색량도 '—' 였다 — 검색광고가 그 말을 모른다(trend-import 는 모르면 null 로 남긴다).
 *
 * '빈자리'의 뜻은 "찾는 사람은 있는데 그 자리를 아무도 안 가져갔다"이다.
 * 찾는 사람이 실측되지 않았으면 앞부분이 없는 것이라 빈자리가 아니다.
 * 버리지는 않는다 — [전체] 에서 그대로 보이고, 왜 빠졌는지 줄에 적는다.
 */
const row = (over: any = {}) => ({ keyword: 'x', seat: '열림', searchVolume: 800, documentCount: 1277, ...over });

describe('빈자리 = 자리가 열렸고 + 찾는 사람이 실측됐다', () => {
  it('둘 다 맞으면 빈자리다', () => {
    expect(isRealVacancy(row())).toBe(true);
    expect(isRealVacancy(row({ seat: '반열림' }))).toBe(true);
  });

  it('검색광고가 모르는 말은 빈자리가 아니다 — 실측한 그 줄', () => {
    expect(isRealVacancy(row({ keyword: '시메오네 아틀레티코 결렬 가능성 50~60%', searchVolume: null }))).toBe(false);
  });

  it('검색량 0 도 빈자리가 아니다', () => {
    expect(isRealVacancy(row({ searchVolume: 0 }))).toBe(false);
  });

  it('자리가 닫혔으면 검색량이 커도 빈자리가 아니다', () => {
    expect(isRealVacancy(row({ seat: '잠김', searchVolume: 40800 }))).toBe(false);
    expect(isRealVacancy(row({ seat: '안 잼' }))).toBe(false);
    expect(isRealVacancy(row({ seat: '자료없음' }))).toBe(false);
  });
});

describe('화면과 회차가 같은 규칙을 쓴다', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const handler = fs.readFileSync(path.join(root, 'src', 'main', 'handlers', 'trend-import.ts'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');

  it('회차 요약의 빈자리 수가 이 규칙으로 세어진다', () => {
    expect(handler).toContain('rows.filter(isRealVacancy).length');
    expect(handler, '옛 셈이 남아 있다').not.toContain("open: rows.filter((r) => r.seat === '열림').length");
  });

  it('거르개도 같은 함수를 쓴다 — 화면과 요약이 다른 수를 말하면 둘 다 못 믿는다', () => {
    const render = html.slice(html.indexOf('window.renderTrendImport'), html.indexOf('function fillTrendCategories'));
    expect(render).toContain('trendIsRealVacancy');
    expect(render, '옛 거르개가 남아 있다').not.toContain("rows.filter((r) => r.seat === '열림' || r.seat === '반열림')");
  });

  it('빠진 줄에 이유를 적는다 — 버리지 않고 전체에서 보인다', () => {
    const render = html.slice(html.indexOf('window.renderTrendImport'), html.indexOf('function fillTrendCategories'));
    expect(render).toContain('수요 미측정');
  });
});
