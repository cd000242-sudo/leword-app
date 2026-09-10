import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { forgeVariedTitles, FRAME_LABEL, RELATED_SEAT_CAP } from '../../main/handlers/golden-writing-kit';
import { TITLE_CLICHES } from '../title-forge/forge';

/**
 * 글감 한 벌(2026-09-10) — 발굴 줄을 펴면 나오는 제목 후보·같이 넣을 말.
 *
 * 여기서 지키는 것은 품질이 아니라 **정직**이다:
 *   - 유형은 파생 키워드 실측에서 나온 것만 (근거 없는 각도 = 낚시)
 *   - 같은 제목을 두 번 싣지 않는다
 *   - 상투구가 제목에 들어가지 않는다
 *   - 자리를 못 잰 말은 열렸다고도 닫혔다고도 하지 않는다 (화면 규칙, 아래 배선 절에서 검사)
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const derived = (pairs: Array<[string, number]>) =>
  pairs.map(([keyword, searchVolume]) => ({ keyword, searchVolume }));

describe('제목 후보 — 유형을 갈라 뽑는다', () => {
  it('유형이 여러 개면 서로 다른 유형으로 여러 개를 만든다', () => {
    const titles = forgeVariedTitles(
      '무릎 물찬 증상',
      derived([['무릎 물찬 증상 후기', 900], ['무릎 물빼기 비용', 700], ['무릎 물찬 증상 비교', 400]]),
      ['무릎 통증 원인 정리', '무릎 관절 관리법'],
    );
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(new Set(titles.map((t) => t.frame)).size).toBeGreaterThanOrEqual(2);
  });

  it('같은 제목이 두 번 실리지 않는다', () => {
    const titles = forgeVariedTitles(
      '발바닥 아침 통증',
      derived([['발바닥 아침 통증 후기', 800], ['발바닥 아침 통증 후기 정리', 600]]),
      [],
    );
    const texts = titles.map((t) => t.text.replace(/\s/g, ''));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('상투구가 제목에 들어가지 않는다 — 대장간 금지 목록을 그대로 탄다', () => {
    const titles = forgeVariedTitles(
      '허리 삐끗 응급처치',
      derived([['허리 삐끗 응급처치 방법', 900], ['허리 냉찜질 비용', 300], ['허리 보호대 추천', 500]]),
      ['허리 통증 완벽 가이드'],
    );
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title.text).not.toMatch(TITLE_CLICHES);
    }
  });

  it('파생 키워드가 없으면 유형을 지어내지 않는다 — 일반형 한 쌍만', () => {
    const titles = forgeVariedTitles('종아리 쥐 나는 이유', [], []);
    expect(titles.length).toBe(2);
    for (const title of titles) expect(title.frame).toBe('generic');
  });

  it('제목마다 어디서 나왔는지가 붙는다 — 근거 없는 줄이 없다', () => {
    const titles = forgeVariedTitles(
      '손목 시큰거림 원인',
      derived([['손목 보호대 추천', 900], ['손목터널증후군 비용', 500]]),
      ['손목 통증 원인'],
    );
    for (const title of titles) {
      expect(title.basis.length).toBeGreaterThan(0);
      expect(title.kind === '검색용' || title.kind === '끌리는').toBe(true);
      expect(FRAME_LABEL[title.frame]).toBe(title.frameLabel);
    }
  });

  it('키워드는 제목 앞자리에 그대로 남는다 — 잘라 쓰지 않는다', () => {
    const keyword = '어깨 담 결림';
    const titles = forgeVariedTitles(keyword, derived([['어깨 담 결림 방법', 700]]), []);
    for (const title of titles) expect(title.text.startsWith(keyword)).toBe(true);
  });

  it('유형 수 상한을 지킨다', () => {
    const titles = forgeVariedTitles(
      '목 디스크 초기증상',
      derived([['목 디스크 후기', 900], ['목 디스크 비용', 800], ['목 디스크 방법', 700], ['거북목 교정 추천', 600], ['목 디스크 비교', 500]]),
      [],
      2,
    );
    expect(new Set(titles.map((t) => t.frame)).size).toBeLessThanOrEqual(2);
  });
});

describe('글감 한 벌 배선', () => {
  it('핸들러가 등록 목록에 있다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("import { setupGoldenWritingKitHandlers } from './handlers/golden-writing-kit';");
    expect(hub).toContain('setupGoldenWritingKitHandlers();');
  });

  it('진행 채널 이름이 핸들러·preload·화면에서 같다', () => {
    const handler = read('src', 'main', 'handlers', 'golden-writing-kit.ts');
    const preload = read('preload.ts');
    const html = read('ui', 'keyword-master.html');
    expect(handler).toContain("WRITING_KIT_PROGRESS_CHANNEL = 'golden-writing-kit-progress'");
    expect(handler).toContain("ipcMain.handle('golden-writing-kit'");
    expect(preload).toContain("'golden-writing-kit-progress'");
    expect(html).toContain("invoke('golden-writing-kit'");
    expect(html).toContain("on('golden-writing-kit-progress'");
  });

  it('자리를 잴 때 통합검색까지 읽는다 — 안 읽으면 카드답을 열림으로 적는다', () => {
    const handler = read('src', 'main', 'handlers', 'golden-writing-kit.ts');
    expect(handler).toContain('withStructure: true');
    expect(handler).not.toContain('withStructure: false');
  });

  it('같이 넣을 말 자리 실측 상한이 있다 — 펼칠 때마다 무한정 재지 않는다', () => {
    expect(RELATED_SEAT_CAP).toBeGreaterThan(0);
    expect(RELATED_SEAT_CAP).toBeLessThanOrEqual(5);
  });

  it('못 잰 말에는 자리 값을 만들어 붙이지 않는다', () => {
    const handler = read('src', 'main', 'handlers', 'golden-writing-kit.ts');
    // 잰 경우에만 seat 를 얹는 조건부 전개여야 한다 — 기본값 '열림'/'자료없음' 을 박으면 안 된다.
    expect(handler).toContain('...(measured ? { seat: String(row!.verdict)');
    expect(handler).not.toMatch(/seat:\s*['"]열림['"]/);
  });
});

describe('발굴 화면 — 거르개·접기·펼침 배선', () => {
  const html = read('ui', 'keyword-master.html');

  it('결과 줄에 거르개가 볼 표식이 붙는다', () => {
    expect(html).toContain('class="golden-row"');
    expect(html).toContain('data-grade="${gradeValue}"');
    expect(html).toContain("data-blue=\"${item.isBlueOcean ? '1' : '0'}\"");
    expect(html).toContain("data-range=\"${rangeVerdict || ''}\"");
  });

  it('거르개 네 개가 화면 규칙과 같은 이름을 쓴다', () => {
    for (const key of ['seat', 'mine', 'sss', 'blue']) {
      expect(html).toContain("data-golden-filter=\"' + key + '\"".slice(0, 20));
      expect(html).toContain(`${key}: {`);
    }
    expect(html).toContain('자리 열림만');
    expect(html).toContain('내 크기만');
    expect(html).toContain('SSS만');
    expect(html).toContain('블루오션');
  });

  it('봉투 판정이 배지와 거르개에서 한 함수로 나온다', () => {
    expect(html).toContain('window.blogRangeOf = function blogRangeOf');
    // 배지는 판정을 다시 계산하지 않고 blogRangeOf 를 부른다
    expect(html).toContain('const verdict = window.blogRangeOf(documentCount, facing);');
  });

  it('조건 줄이 접히고 다시 펴진다', () => {
    expect(html).toContain('id="goldenCondFolded"');
    expect(html).toContain('id="goldenCondBody"');
    expect(html).toContain('window.goldenFoldConditions = function');
    expect(html).toContain('window.goldenUnfoldConditions = function');
    expect(html).toContain('onclick="goldenUnfoldConditions()"');
    // 결과가 나오면 접는다
    expect(html).toContain("if (typeof window.goldenFoldConditions === 'function') window.goldenFoldConditions();");
  });

  it('열 머리가 몇 개를 쟀는지 적는다', () => {
    expect(html).toContain('data-seat-progress');
    expect(html).toContain('window.updateSeatProgressLabel = function');
    expect(html).toContain("label.textContent = done + ' / ' + cells.length + ' 잼';");
  });

  it('펼침 줄이 표 폭을 다 쓰고 제 부모를 따라 움직인다', () => {
    expect(html).toContain('class="golden-drill"');
    expect(html).toContain('colspan="10"');
    // 정렬이 펼침 줄을 부모 뒤에 붙여 옮긴다
    expect(html).toContain("tr.golden-drill[data-golden-idx=\"' + tr.getAttribute('data-golden-idx') + '\"]");
  });

  it('표 머리와 본문 칸 수가 같다 — 추정치를 빼면서 밀린 적이 있다', () => {
    const fn = html.slice(html.indexOf('function displayGoldenResults'));
    const head = (fn.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];
    expect((head.match(/<th[\s>]/g) || []).length).toBe(10);

    const bodyStart = fn.indexOf('<tr class="golden-row"');
    const bodyEnd = fn.indexOf('<tr class="golden-drill"');
    expect(bodyStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    expect((fn.slice(bodyStart, bodyEnd).match(/<td[\s>]/g) || []).length).toBe(10);
  });

  it('추정치 열이 돌아오지 않았다', () => {
    expect(html).not.toContain('수익가치(CVI)');
    expect(html).not.toContain('예상 CPC');
    expect(html).not.toContain('item.cvi');
    expect(html).not.toContain('item.cpc');
  });

  it('수요 분석을 한 번만 부른다 — 판을 다시 그리며 두 번 부르면 에이전트가 두 번 돈다', () => {
    const fn = html.slice(html.indexOf('window.goldenDrilldown = async function'), html.indexOf('window.goldenFillSeatFromKit'));
    // 기억해 둔 것을 다시 펼 때 1회 + 처음 그릴 때 1회. 그보다 많으면 같은 일을 반복하는 것이다.
    expect((fn.match(/window\.analyzeDemand\(/g) || []).length).toBe(2);
    // 결과가 온 뒤에는 통째로 다시 그리지 않고 두 칸만 갈아 끼운다
    expect(fn).toContain('kitPatchPanel(content, kit, fallback, null)');
    expect(fn).not.toContain('content.innerHTML = kitPanelHtml(kw, idx, kit,');
  });

  it('접었다 다시 펴면 또 재지 않는다', () => {
    expect(html).toContain('window.__kitCache = window.__kitCache || {};');
    expect(html).toContain('window.__kitCache[cacheKey] = { kit, fallback };');
    // 새 발굴이면 비운다 — 지난 회차 글감이 다음 회차 줄에 붙으면 안 된다
    expect(html).toContain('window.__kitCache = {};');
  });

  it('연관어 트렌드 버튼이 알약에도 남아 있다 — 모양이 바뀐다고 되던 것이 없어지면 안 된다', () => {
    const pill = html.slice(html.indexOf('function kitPill(item)'), html.indexOf('function kitTitleRow'));
    expect(pill).toContain('rfShowTrendGraph');
    expect(pill).toContain('searchKeyword(');
  });
});

/**
 * 거르개 규칙을 화면 코드에서 꺼내 **실제로 실행**한다.
 * 문자열이 있는지만 보면 규칙이 뒤집혀도 통과한다 — 그러면 '자리 열림만' 이 닫힌 줄을 남긴다.
 */
describe('거르개 규칙 실행', () => {
  const html = read('ui', 'keyword-master.html');
  const from = html.indexOf('const GOLDEN_FILTERS = {');
  const to = html.indexOf('window.goldenApplyFilters = function goldenApplyFilters');
  const source = html.slice(from, to);

  const loaded = new Function(source + '; return { GOLDEN_FILTERS, goldenPasses };')() as {
    GOLDEN_FILTERS: Record<string, { label: string; test: (tr: any) => boolean }>;
    goldenPasses: (tr: any, keys: string[]) => boolean;
  };

  const tr = (attrs: Record<string, string>) => ({
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
  });

  it('꺼낸 코드가 규칙 네 개를 담고 있다', () => {
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(Object.keys(loaded.GOLDEN_FILTERS).sort()).toEqual(['blue', 'mine', 'seat', 'sss']);
  });

  it('자리 열림만 — 열림만 남기고 반열림·잠김·카드답·안 잰 줄은 뺀다', () => {
    const test = loaded.GOLDEN_FILTERS.seat.test;
    expect(test(tr({ 'data-seat': '열림' }))).toBe(true);
    for (const other of ['반열림', '잠김', '카드답', '자료없음']) {
      expect(test(tr({ 'data-seat': other }))).toBe(false);
    }
    // 안 잰 줄(표식 없음)은 열렸다고 하지 않는다
    expect(test(tr({}))).toBe(false);
  });

  it('내 크기만 — 범위 밖과 봉투 없는 줄을 뺀다', () => {
    const test = loaded.GOLDEN_FILTERS.mine.test;
    expect(test(tr({ 'data-range': 'mine' }))).toBe(true);
    expect(test(tr({ 'data-range': 'out' }))).toBe(false);
    expect(test(tr({ 'data-range': '' }))).toBe(false);
    expect(test(tr({}))).toBe(false);
  });

  it('SSS만 — SS 는 남기지 않는다', () => {
    const test = loaded.GOLDEN_FILTERS.sss.test;
    expect(test(tr({ 'data-grade': 'SSS' }))).toBe(true);
    expect(test(tr({ 'data-grade': 'SS' }))).toBe(false);
    expect(test(tr({ 'data-grade': 'S' }))).toBe(false);
  });

  it('블루오션 — 1 만 남긴다', () => {
    const test = loaded.GOLDEN_FILTERS.blue.test;
    expect(test(tr({ 'data-blue': '1' }))).toBe(true);
    expect(test(tr({ 'data-blue': '0' }))).toBe(false);
    expect(test(tr({}))).toBe(false);
  });

  it('여러 개를 켜면 모두 통과한 줄만 남는다 (AND)', () => {
    const row = tr({ 'data-seat': '열림', 'data-range': 'mine', 'data-grade': 'SS', 'data-blue': '0' });
    expect(loaded.goldenPasses(row, ['seat', 'mine'])).toBe(true);
    expect(loaded.goldenPasses(row, ['seat', 'mine', 'sss'])).toBe(false);
    expect(loaded.goldenPasses(row, ['blue'])).toBe(false);
  });

  it('하나도 안 켜면 전부 남는다', () => {
    expect(loaded.goldenPasses(tr({}), [])).toBe(true);
    expect(loaded.goldenPasses(tr({ 'data-seat': '잠김' }), [])).toBe(true);
  });
});

/** 봉투 판정도 화면 코드에서 꺼내 실행한다 — 배지 글자와 거르개가 갈라지면 둘 다 못 믿는다. */
describe('봉투 판정 실행', () => {
  const html = read('ui', 'keyword-master.html');
  const from = html.indexOf('window.blogRangeOf = function blogRangeOf');
  const to = html.indexOf('window.blogRangeBadge = function blogRangeBadge');
  const source = html.slice(from, to);

  const load = (envelope: any) => {
    const win: any = { __blogEnvelope: envelope };
    new Function('window', source)(win);
    return win.blogRangeOf as (dc: number | null, facing: number | null) => string | null;
  };

  it('봉투가 없으면 아무 판정도 하지 않는다 — 지어낸 기준으로 "네 크기다"라고 말하지 않는다', () => {
    expect(load(null)(100, null)).toBe(null);
  });

  it('문서수가 이겨본 최대보다 크면 범위 밖', () => {
    const of = load({ docMax: 890, facingMax: 2 });
    expect(of(2400, null)).toBe('out');
    expect(of(890, null)).toBe('mine');
    expect(of(380, null)).toBe('mine');
  });

  it('정면 글이 이겨본 최대보다 많으면 문서수가 작아도 범위 밖', () => {
    const of = load({ docMax: 890, facingMax: 2 });
    expect(of(310, 3)).toBe('out');
    expect(of(310, 2)).toBe('mine');
  });

  it('문서수를 모르면 판정하지 않는다', () => {
    const of = load({ docMax: 890, facingMax: 2 });
    expect(of(null, null)).toBe(null);
    expect(of(NaN, null)).toBe(null);
  });
});
