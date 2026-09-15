import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 지난 연도가 붙은 말 표시(2026-09-15).
 *
 * 사장님 "지금 2026년인데 키워드에 2025가 있네? 이건 실측이라 실제 검색해서 뜨는 거지?" → 결정 "그대로 두고 표시만".
 * 9-15 사이트 판에 '옥토버페스트 서울 2025'(9-8 에 잰 이월 행)가 실려 있었다. 실측 검색어라 빼지 않고 배지만 붙인다.
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const source = html.slice(html.indexOf('window.lewordPastYearOf = function'), html.indexOf('window.lewordPastYearBadge = function'));

function loadPastYearOf(): (keyword: string, nowMs?: number) => number | null {
  const win: any = {};
  new Function('window', source)(win);
  return win.lewordPastYearOf;
}

const KST_2026_09_15 = Date.parse('2026-09-15T03:00:00Z');

describe('지난 연도 판정', () => {
  const pastYearOf = loadPastYearOf();

  it('올해보다 이른 연도가 들어 있으면 그 연도를 준다', () => {
    expect(pastYearOf('옥토버페스트 서울 2025', KST_2026_09_15)).toBe(2025);
    expect(pastYearOf('아이폰 2024 2025 비교', KST_2026_09_15)).toBe(2025);
    expect(pastYearOf('2025년 연말정산', KST_2026_09_15)).toBe(2025);
    expect(pastYearOf('서울2025축제', KST_2026_09_15)).toBe(2025);
  });

  it('올해·내년 연도나 연도가 아닌 숫자는 표시하지 않는다', () => {
    expect(pastYearOf('2026 연말정산', KST_2026_09_15)).toBeNull();
    expect(pastYearOf('2027 수능 일정', KST_2026_09_15)).toBeNull();
    expect(pastYearOf('품번 202512 사이즈', KST_2026_09_15)).toBeNull();
    expect(pastYearOf('아이폰 17', KST_2026_09_15)).toBeNull();
    expect(pastYearOf('', KST_2026_09_15)).toBeNull();
  });

  it('올해는 한국 시간으로 센다 — 한국 1월 1일 새벽이면 작년 연도를 표시한다', () => {
    const kstNewYear = Date.parse('2025-12-31T16:30:00Z'); // 한국 2026-01-01 01:30
    expect(pastYearOf('2025 연말정산', kstNewYear)).toBe(2025);
    const kstStillOldYear = Date.parse('2025-12-31T14:00:00Z'); // 한국 2025-12-31 23:00
    expect(pastYearOf('2025 연말정산', kstStillOldYear)).toBeNull();
  });
});

describe('세 화면이 같은 함수로 배지를 붙인다 — 빼지 않고 표시만', () => {
  it('황금키워드 발굴 표', () => {
    const fn = html.slice(html.indexOf('function displayGoldenResults(results)'), html.indexOf('const laneEsc'));
    expect(fn).toContain('window.lewordPastYearBadge(item.keyword)');
  });

  it('선점 보드 표', () => {
    const fn = html.slice(html.indexOf('function pbRow(row, idx)'), html.indexOf('function pbDetail(row)'));
    expect(fn).toContain('window.lewordPastYearBadge(row.keyword)');
  });

  it('오늘 쓸 한 편 카드', () => {
    const start = html.indexOf('function dpCard(p, idx)');
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start, start + 6000)).toContain('window.lewordPastYearBadge(p.keyword)');
  });

  it('판정 함수로 목록을 거르지 않는다 — 표시만 한다', () => {
    expect(html).not.toMatch(/filter\([^)]*lewordPastYearOf/);
  });
});
