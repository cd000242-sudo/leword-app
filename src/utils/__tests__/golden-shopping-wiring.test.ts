import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 쇼핑 쪽으로 넘긴 말을 발굴 화면에 따로 보이는 배선(2026-09-15, 사장님 "쇼핑으로 넘긴 말도 앱에 따로 보이기").
 * 황금 표는 그대로(쇼핑판 말은 본판에서 뺀다 — 플랫폼 레인 2026-08-17), 표 아래에 따로 붙인다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('쇼핑 쪽 말을 모아 화면에 준다', () => {
  it('발행 스크립트가 쇼핑 쪽 줄을 판에 싣는다 — 사이트 판 출처', () => {
    expect(read('scripts/publish-preemption-board.js')).toContain('routedShopping: (Array.isArray(board.routedShopping) ? board.routedShopping : []).map((row) => ({');
  });

  it('이 PC 회차가 끝나면 자리 재기 결과의 쇼핑 쪽 말을 쌓는다', () => {
    const handler = read('src/main/handlers/golden-local.ts');
    expect(handler).toContain('const shopping = saveShoppingFromRun();');
    expect(handler).toContain('normalizeShoppingEntries(board && board.routedShopping, new Date().toISOString())');
    expect(handler).toContain('mergeShoppingStore(readGoldenLocalShopping(), incoming, Date.now())');
    expect(handler).toContain('export function readGoldenLocalShopping()');
  });

  it('사이트 판 행 응답에 쇼핑 쪽 목록을 따로 싣는다 — 이 PC 것을 먼저, 황금 판에 실린 말은 뺀다', () => {
    const board = read('src/main/handlers/preemption-board.ts');
    expect(board).toContain("{ from: 'app-board', entries: readGoldenLocalShopping() }");
    expect(board).toContain("{ from: 'site-board', entries: normalizeShoppingEntries(board && board.routedShopping");
    expect(board).toContain('rows.map((row) => row.keyword)');
    expect(board).toMatch(/shoppingRows,\r?\n/);
    expect(board.indexOf("{ from: 'app-board'")).toBeLessThan(board.indexOf("{ from: 'site-board'"));
  });
});

describe('발굴 화면의 쇼핑 쪽 구획', () => {
  const html = read('ui/keyword-master.html');
  const fnStart = html.indexOf('window.goldenShoppingSectionHtml = function');
  const tableStart = html.indexOf('function displayGoldenResults(results)');
  const source = html.slice(fnStart, tableStart);

  function load(win: any): (rows: any[]) => string {
    new Function('window', source)(win);
    return win.goldenShoppingSectionHtml;
  }

  it('황금 표는 그대로 두고 표 아래에 따로 붙인다 — 결과가 없거나 전부 쇼핑이어도 보인다', () => {
    expect(fnStart).toBeGreaterThan(-1);
    const table = html.slice(tableStart, html.indexOf('const laneEsc'));
    expect(table).toContain("results = results.filter((r) => r.platformLane !== 'shopping');");
    expect(table).toContain(`resultsDiv.innerHTML = '<div class="loading">발굴된 키워드가 없습니다.</div>' + window.goldenShoppingSectionHtml([]);`);
    expect(table).toContain('쇼핑판 키워드였습니다 — 🛒 쇼핑 커넥트에서 확인하세요.</div>` + window.goldenShoppingSectionHtml(routedShoppingRows);');
    expect(table).toContain('resultsDiv.innerHTML = html + window.goldenShoppingSectionHtml(routedShoppingRows);');
  });

  it('메인이 준 목록을 받아 둔다', () => {
    const loadRows = html.slice(html.indexOf('window.loadGoldenSiteRows = async function'), html.indexOf('window.goldenMergeSiteRows = function'));
    expect(loadRows).toContain('shoppingRows: Array.isArray(res.shoppingRows) ? res.shoppingRows : []');
  });

  it('사이트 판 · 이 PC 판 · 이번 발굴의 쇼핑 말을 한 번씩, 검색량 큰 순으로 — 못 잰 칸은 - 로', () => {
    const section = load({
      __goldenSite: {
        shoppingRows: [
          { keyword: '욕실 수전 교체', topic: '인테리어·DIY', searchVolume: 2400, documentCount: null, reasons: ['SERP 2번째 구획이 쇼핑'], from: 'site-board', measuredAt: '2026-09-10T00:00:00Z' },
          { keyword: '위프 탈취제 내돈내산', topic: '인테리어·DIY', searchVolume: 820, documentCount: 574, reasons: ['SERP 2번째 구획이 쇼핑'], from: 'app-board', measuredAt: '2026-09-15T00:00:00Z' },
        ],
      },
      goldenPublishedLabel: (iso: string) => iso.slice(5, 10),
    });
    const out = section([
      { keyword: '위프탈취제 내돈내산', searchVolume: 900, laneReasons: ['중복'], platformLane: 'shopping' },
      { keyword: '타일 줄눈 클리너', pcSearchVolume: 950, mobileSearchVolume: 2000, documentCount: 19266, laneReasons: ['SERP 1번째 구획이 쇼핑'], platformLane: 'shopping' },
    ]);
    expect(out).toContain('황금 표에서 뺀 말 3개');
    const order = ['타일 줄눈 클리너', '욕실 수전 교체', '위프 탈취제 내돈내산'].map((keyword) => out.indexOf(`>${keyword}</td>`));
    expect(order.every((position) => position > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).not.toContain('>위프탈취제 내돈내산</td>');
    expect(out).toContain((2950).toLocaleString());
    expect(out).toContain('사이트 판 · 09-10');
    expect(out).toContain('이 PC 판 · 09-15');
    expect(out).toContain('이번 발굴');
    expect(out).toMatch(/>-<\/td>/);
  });

  it('보일 말이 없으면 구획을 그리지 않는다', () => {
    expect(load({ __goldenSite: { shoppingRows: [] } })([])).toBe('');
    expect(load({})([])).toBe('');
  });

  it('많으면 100개만 펴고 나머지 수를 적는다 — 말없이 자르지 않는다', () => {
    const many = Array.from({ length: 105 }, (_, index) => ({
      keyword: `상품 ${index}`, topic: '상품리뷰', searchVolume: 5000 - index, documentCount: null, reasons: [], from: 'site-board', measuredAt: null,
    }));
    const out = load({ __goldenSite: { shoppingRows: many } })([]);
    expect(out).toContain('외 5개는');
    expect(out).toContain('>상품 99</td>');
    expect(out).not.toContain('>상품 100</td>');
  });

  it('걸릴 시간이나 예상 수치를 적지 않는다', () => {
    expect(source).not.toMatch(/예상|추정|남은 시간/);
  });
});
