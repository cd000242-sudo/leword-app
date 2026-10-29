// 제휴 카테고리별 황금 검색어(2026-10-29 사장님 "카테고리별로 분류해서 황금키워드를 찾아줘야지").
// 순수 함수만 시험한다 — 네트워크는 주입한 가짜로 대신한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const g = require('./affiliate-golden-keywords.cjs');

const NOW = Date.parse('2026-10-29T00:00:00Z');
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

// 상품명 마지막 낱말을 품목으로 보는 가짜 추출기 (진짜는 need-keywords.ts 의 extractCategoryPhrases)
const fakeExtract = (name) => [String(name).split(/\s+/).pop()];
const catOf = (item) => item.cat;

test('등급 — 문서÷검색 0.3 미만+검색 500↑ S · 0.7 미만 A · 1.0 미만 B · 검색 100 미만이나 비율 1 이상은 황금 아님', () => {
  assert.equal(g.gradeOf(900, 120), 'S');
  assert.equal(g.gradeOf(400, 100), 'A');          // 0.25 지만 검색 500 미만 → S 불가, A(<0.7)
  assert.equal(g.gradeOf(1000, 600), 'A');
  assert.equal(g.gradeOf(1000, 900), 'B');
  assert.equal(g.gradeOf(1000, 1000), null);       // 비율 1.0 은 황금 아님
  assert.equal(g.gradeOf(99, 1), null);            // 검색 100 미만
  assert.equal(g.gradeOf(500, 0), null);           // 문서 0 은 못 잰 값
  assert.equal(g.gradeOf(500, null), null);
});

test('씨앗 — 카테고리별로 빈도 순 · 중복(띄어쓰기 무시) 제거 · 상한 · 15자 초과/기호 제외 · needKeyword 도 씨앗', () => {
  const items = [
    { name: 'A 가습기', cat: '가전', needKeyword: '' },
    { name: 'B 가습기', cat: '가전', needKeyword: '' },
    { name: 'C 탄소매트', cat: '가전', needKeyword: '한일 탄소매트' },
    { name: 'D 선풍기', cat: '가전', needKeyword: '' },
    { name: 'E 아주아주아주아주긴이름의제품명입니다', cat: '가전', needKeyword: '' },
    { name: 'F 사과', cat: '식품', needKeyword: '' },
    { name: 'G 사 과', cat: '식품', needKeyword: '' },
  ];
  const seeds = g.pickSeeds(items, { categoryOf: catOf, extract: fakeExtract, perCategory: 3 });
  assert.deepEqual(seeds['가전'], ['가습기', '탄소매트', '한일 탄소매트']);
  assert.deepEqual(seeds['식품'], ['사과']);
});

test('씨앗 — 추출기가 던지거나 빈 이름이어도 죽지 않는다', () => {
  const seeds = g.pickSeeds([{ name: '', cat: 'x' }, { name: '가습기', cat: 'x' }], { categoryOf: catOf, extract: (n) => { if (!n) throw new Error('boom'); return [n]; }, perCategory: 5 });
  assert.deepEqual(seeds.x, ['가습기']);
});

test('핵심 명사 — 씨앗의 마지막 어절', () => {
  assert.equal(g.coreNounOf('휴대용 선풍기'), '선풍기');
  assert.equal(g.coreNounOf('가습기'), '가습기');
});

test('연관어 거르기 — 핵심 명사 포함(띄어쓰기 무시) · 검색 100↑ · "<10"/null 은 미측정 · 씨앗 자신 제외 · 중복 제거', () => {
  const rows = [
    { keyword: '가습기 세척', totalSearchVolume: 900 },
    { keyword: '가습기세척', totalSearchVolume: 800 },         // 위와 같은 말
    { keyword: '초음파 가 습기', totalSearchVolume: 300 },      // 띄어쓰기 무시 포함
    { keyword: '선풍기 추천', totalSearchVolume: 5000 },        // 핵심 명사 없음
    { keyword: '가습기 필터', totalSearchVolume: 99 },          // 하한 미만
    { keyword: '가습기 소음', totalSearchVolume: null },        // <10 → 미측정
    { keyword: '가습기 냄새', totalSearchVolume: '<10' },
    { keyword: '가습기', totalSearchVolume: 90000 },            // 씨앗 자신
  ];
  const out = g.filterRelated('가습기', rows, 100);
  assert.deepEqual(out.map((r) => [r.keyword, r.volume]), [['가습기 세척', 900], ['초음파 가 습기', 300]]);
});

test('연관어 거르기 — 합계가 없고 PC·모바일이 정확한 수면 합산, 한쪽이 "<10" 이면 미측정', () => {
  assert.equal(g.volumeOfRow({ monthlyPcQcCnt: 120, monthlyMobileQcCnt: 80 }), 200);
  assert.equal(g.volumeOfRow({ pcSearchVolume: 120, mobileSearchVolume: '<10' }), null);
  assert.equal(g.volumeOfRow({ totalSearchVolume: 350 }), 350);
  assert.equal(g.volumeOfRow({}), null);
});

test('카테고리 후보 — 씨앗 간 같은 말은 검색량 큰 쪽 하나 · 검색량 상위 N개만 문서수 측정', () => {
  const cands = g.mergeCandidates([
    { seed: '가습기', rows: [{ keyword: '가습기 세척', volume: 900 }, { keyword: '가습기 필터', volume: 300 }] },
    { seed: '가열식가습기', rows: [{ keyword: '가습기세척', volume: 1000 }, { keyword: '가습기 청소', volume: 200 }] },
  ]);
  assert.deepEqual(cands.map((c) => [c.keyword, c.volume, c.seed]), [['가습기세척', 1000, '가열식가습기'], ['가습기 필터', 300, '가습기'], ['가습기 청소', 200, '가열식가습기']]);
  assert.equal(g.topByVolume(cands, 2).length, 2);
  assert.equal(g.topByVolume(cands, 2)[0].volume, 1000);
});

test('황금 뽑기 — 문서수 0·실패는 버리고, 비율<1 & 검색≥100 만, 비율 오름차순 → 같으면 검색 내림차순, 상한', () => {
  const measured = [
    { keyword: 'a', volume: 1000, docs: 100, seed: 's' },    // 0.1 S
    { keyword: 'b', volume: 2000, docs: 200, seed: 's' },    // 0.1 S, 검색 더 큼 → 먼저
    { keyword: 'c', volume: 1000, docs: 0, seed: 's' },      // 0 → 미측정
    { keyword: 'd', volume: 1000, docs: null, seed: 's' },   // 실패
    { keyword: 'e', volume: 1000, docs: 1500, seed: 's' },   // 1.5 탈락
    { keyword: 'f', volume: 200, docs: 140, seed: 's' },     // 0.7 → B
  ];
  const out = g.goldenOf(measured, iso(NOW), 30);
  assert.deepEqual(out.map((k) => k.keyword), ['b', 'a', 'f']);
  assert.equal(out[0].grade, 'S');
  assert.equal(out[2].grade, 'B');
  assert.equal(out[0].docRatio, 0.1);
  assert.equal(out[0].measuredAt, iso(NOW));
  assert.equal(g.goldenOf(measured, iso(NOW), 2).length, 2);
});

test('병합 — 이번에 빈 카테고리는 이전 것을 7일까지 유지, 7일 지나면 버린다 · 이번 결과가 있으면 이전 것 무시', () => {
  const kw = (ms) => ({ keyword: 'k', volume: 500, docs: 10, docRatio: 0.02, grade: 'S', seed: 's', measuredAt: iso(ms) });
  const prev = { builtAt: iso(NOW - DAY), categories: {
    fresh: { seeds: ['x'], measured: 3, keywords: [kw(NOW - 3 * DAY)] },
    stale: { seeds: ['x'], measured: 3, keywords: [kw(NOW - 8 * DAY)] },
    replaced: { seeds: ['x'], measured: 3, keywords: [kw(NOW - DAY)] },
  } };
  const next = {
    fresh: { seeds: ['x'], measured: 0, keywords: [] },
    stale: { seeds: ['x'], measured: 0, keywords: [] },
    replaced: { seeds: ['y'], measured: 4, keywords: [{ ...kw(NOW), keyword: 'new' }] },
    brandNew: { seeds: ['z'], measured: 0, keywords: [] },
  };
  const merged = g.mergeCategories(next, prev, NOW);
  assert.deepEqual(Object.keys(merged).sort(), ['fresh', 'replaced']);
  assert.equal(merged.fresh.keywords.length, 1);
  assert.equal(merged.replaced.keywords[0].keyword, 'new');
  assert.notEqual(merged.fresh, prev.categories.fresh); // 새 객체
  assert.equal(Object.keys(next).length, 4);             // 입력은 그대로
});

test('전체 파이프라인 — 가짜 연관어·문서수로 출력 계약대로 만든다', async () => {
  const items = [
    { name: 'A 가습기', cat: '가전' }, { name: 'B 가습기', cat: '가전' }, { name: 'C 사과', cat: '식품' },
  ];
  const related = {
    가습기: [{ keyword: '가습기 세척', totalSearchVolume: 900 }, { keyword: '가습기 필터', totalSearchVolume: 400 }, { keyword: '선풍기', totalSearchVolume: 9999 }],
    사과: [{ keyword: '사과 효능', totalSearchVolume: 300 }],
  };
  const docs = { '가습기 세척': 120, '가습기 필터': 4000, '사과 효능': 0 };
  let relatedCalls = 0; let docCalls = 0;
  const out = await g.buildGolden({
    items, categoryOf: catOf, extract: fakeExtract, seedsPerCategory: 5, measurePerCategory: 50, minVolume: 100,
    fetchRelated: async (seed) => { relatedCalls++; return related[seed] || []; },
    fetchDocs: async (kw) => { docCalls++; return docs[kw] ?? null; },
    nowMs: NOW, previous: null,
  });
  assert.equal(out.file.schemaVersion, 1);
  assert.equal(out.file.source, 'naver-searchad+blog-search');
  assert.equal(out.file.minVolume, 100);
  assert.equal(out.file.builtAt, iso(NOW));
  assert.deepEqual(Object.keys(out.file.categories), ['가전']);          // 식품은 문서수 0 → 황금 없음 → 비어 버림
  const c = out.file.categories['가전'];
  assert.deepEqual(c.seeds, ['가습기']);
  assert.equal(c.measured, 2);
  assert.deepEqual(c.keywords.map((k) => [k.keyword, k.grade, k.seed, k.docRatio]), [['가습기 세척', 'S', '가습기', 0.1333]]);
  assert.equal(relatedCalls, 2);
  assert.equal(docCalls, 3);    // 세척·필터·사과 효능 (핵심 명사 없는 '선풍기' 는 안 잰다)
  assert.equal(out.stats.relatedRequests, 2);
  assert.equal(out.stats.docRequests, 3);
});

test('전체가 비면 file 은 null (종료코드 3 의 근거)', async () => {
  const out = await g.buildGolden({
    items: [{ name: 'A 가습기', cat: '가전' }], categoryOf: catOf, extract: fakeExtract, seedsPerCategory: 5, measurePerCategory: 50, minVolume: 100,
    fetchRelated: async () => [], fetchDocs: async () => null, nowMs: NOW, previous: null,
  });
  assert.equal(out.file, null);
});

test('한 씨앗 조회가 던져도 나머지는 계속한다', async () => {
  const out = await g.buildGolden({
    items: [{ name: 'A 가습기', cat: '가전' }, { name: 'B 사과', cat: '가전' }], categoryOf: catOf, extract: fakeExtract, seedsPerCategory: 5, measurePerCategory: 50, minVolume: 100,
    fetchRelated: async (seed) => { if (seed === '가습기') throw new Error('429'); return [{ keyword: '사과 효능', totalSearchVolume: 800 }]; },
    fetchDocs: async () => 80, nowMs: NOW, previous: null,
  });
  assert.equal(out.file.categories['가전'].keywords[0].keyword, '사과 효능');
});

test('원자적 쓰기 — 임시 파일 후 교체, 기존 파일 읽기', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agk-'));
  const file = path.join(dir, 'out.json');
  assert.equal(g.readJson(file), null);
  g.writeJsonAtomic(file, { a: 1 });
  assert.deepEqual(g.readJson(file), { a: 1 });
  g.writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(g.readJson(file), { a: 2 });
  assert.deepEqual(fs.readdirSync(dir), ['out.json']);
  fs.rmSync(dir, { recursive: true });
});

test('캠페인 → 항목 평탄화 — sites 아래 items 전부', () => {
  const items = g.itemsOf({ sites: { toss: { items: [{ name: 'a' }] }, brandconnect: { items: [{ name: 'b' }] }, x: null } });
  assert.deepEqual(items.map((i) => i.name), ['a', 'b']);
  assert.deepEqual(g.itemsOf(null), []);
});
