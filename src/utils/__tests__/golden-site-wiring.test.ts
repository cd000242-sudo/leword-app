import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 황금키워드 발굴 = 사이트 판 + 같은 관문 통과분 — 배선을 잠근다(2026-09-15).
 *
 * 사장님 "앱에 있는 황금키워드 발굴도 4개밖에 안 나와 사이트랑 많이 다른데 상위호환으로 발굴해줘야지".
 * 조사에서 확인한 원인: 기본 개수 10(빠른 미리보기) · 씨앗이 비면 '황금키워드' 한 단어 · 정밀 검사가 작은 SSS 를 버림 ·
 * 무제한이 1000 · PRO 보충이 연예로 고정 · 발굴 화면이 사이트 판을 안 읽음.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const html = read('ui', 'keyword-master.html');
const discovery = read('src', 'main', 'handlers', 'keyword-discovery.ts');

describe('사이트 판을 발굴 표에 깐다', () => {
  it('메인이 사이트 판 행을 카테고리로 골라 준다', () => {
    const board = read('src', 'main', 'handlers', 'preemption-board.ts');
    expect(board).toContain("ipcMain.handle('golden-site-rows'");
    expect(board).toContain('buildSiteGoldenRows(board');
    expect(board).toContain('readReseats()');
  });

  it('화면을 열 때와 카테고리를 바꿀 때 사이트 판을 받는다', () => {
    expect(html).toMatch(/golden:\s*\{\s*load:\s*'loadGoldenSiteRows'\s*\}/);
    expect(html).toContain('<select id="keywordCategory" onchange="loadGoldenSiteRows()"');
    expect(html).toContain("window.electronAPI.invoke('golden-site-rows', { category })");
  });

  it('발굴 표는 사이트 줄을 앞에 두고 같은 말을 한 번만 싣는다', () => {
    const fn = html.slice(html.indexOf('function displayGoldenResults(results)'), html.indexOf('const laneEsc'));
    const merge = fn.indexOf('results = window.goldenMergeSiteRows(results);');
    expect(merge).toBeGreaterThan(-1);
    expect(merge).toBeLessThan(fn.indexOf('if (!results || results.length === 0)'));
    expect(fn).toContain('window.goldenSiteSeatHtml(item)');
    expect(fn).toContain('window.goldenSiteBadge(item)');
  });

  it('사이트 줄의 자리 칸은 사이트가 잰 사실만 적는다 — 판정을 지어내지 않는다', () => {
    const seat = html.slice(html.indexOf('window.goldenSiteSeatHtml = function'), html.indexOf('function displayGoldenResults(results)'));
    expect(seat).toContain('사이트가 잼');
    expect(seat).not.toMatch(/verdict:\s*'(열림|반열림|잠김)'/);
  });
});

describe('앱이 찾은 말은 사이트와 같은 관문을 넘어야 싣는다', () => {
  it('세 갈래(본류·교차 보충·직접 보충) 모두 쌓기 전에 관문을 본다', () => {
    for (const name of ['formattedResult', 'formattedSupplement', 'formattedDirect']) {
      const gate = discovery.indexOf(`if (!passSiteGate(${name})) continue;`);
      const push = discovery.indexOf(`allKeywords.push(${name} as any);`);
      expect(gate, `${name} 앞에 관문이 없다`).toBeGreaterThan(-1);
      expect(push).toBeGreaterThan(gate);
    }
    expect(discovery).toContain('judgeSiteGate(row)');
    expect(discovery).toContain('describeSiteGateDrops(siteGateDrops)');
  });
});

describe('확인된 원인을 되돌리지 않는다', () => {
  it('기본 개수는 50 — 10은 빠른 미리보기로 돌아 4개 안팎이었다', () => {
    expect(html).toContain('name="keywordLimit" value="50" checked');
    expect(html).not.toContain('name="keywordLimit" value="10" checked');
  });

  it('무제한은 0 을 보낸다 — 발굴 코드는 0 일 때만 무제한이다', () => {
    expect(html).toContain('limit: maxCount === null ? 0 : maxCount');
    expect(discovery).toContain('const isUnlimited = hasExplicitLimit && limit === 0;');
  });

  it("카테고리·키워드가 없으면 모든 카테고리 씨앗으로 발굴한다 — '황금키워드' 한 단어로 돌지 않는다", () => {
    expect(discovery).toContain('getCrossCategoryDiscoverySeeds([], Math.min(420');
  });

  it('최종 목록이 비면 흘러온 줄을 지운다', () => {
    const start = html.slice(html.indexOf('window.startKeywordDiscovery = async function'), html.indexOf('function displayGoldenResults(results)'));
    expect(start).toMatch(/\} else \{\s*\/\/ 최종 목록이 비면[^\n]*\n\s*discoveryResults = \[\];/);
  });

  it('PRO 보충이 연예로 고정되지 않는다', () => {
    const miner = read('src', 'utils', 'direct-golden-keyword-miner.ts');
    expect(miner).not.toContain("category: 'entertainment'");
    expect(miner).toContain('category: proSupplementCategory');
  });

  it('정밀 검사가 등급표의 SSS 두 갈래를 공용 함수로 쓴다', () => {
    const precision = read('src', 'utils', 'golden-keyword-precision.ts');
    expect(precision).toContain('isStrictGoldenDiscoverySss(');
    expect(precision).not.toMatch(/score >= 85 && volume >= 1000/);
  });
});
