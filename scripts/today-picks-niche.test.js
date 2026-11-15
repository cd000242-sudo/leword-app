'use strict';
// 2026-11-15 사장님 "대형키워드가 많네. 그럼 있으나 마나야. 니치키워드를 기본으로 잡아줘."
// 니치 우선 순서는 이미 잰 값(검색량 · 문서수 · 황금비)만 쓴다 — 추가 호출도, 지어낸 키워드도 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NICHE_MAX_VOLUME, FRONT_MAX_DOCS, TIER_ORDER,
  tierOf, nicheBandFirst, selectNicheFirst, countFront, tierSummary,
} = require('./today-picks-niche');

const row = (keyword, searchVolume, documentCount) => ({
  keyword, searchVolume, documentCount, ratio: Math.round((searchVolume / documentCount) * 100) / 100,
});
const names = (rows) => rows.map((r) => r.keyword);

test('기준 숫자는 저장소 정의를 그대로 쓴다 — 대형 헤드 1만 · 경쟁 상한은 등급표 SS 문서수', () => {
  require('ts-node/register/transpile-only');
  const { GRADE_THRESHOLDS } = require('../src/utils/grade');
  assert.equal(FRONT_MAX_DOCS, GRADE_THRESHOLDS.ss.docsMax);
  assert.equal(NICHE_MAX_VOLUME, 10000);
  assert.deepEqual(TIER_ORDER, ['niche', 'mid', 'plain', 'large']);
});

test('등급 판정 — 검색량 1만 미만 황금은 니치, 1만 이상은 문서수 1만 이하여야 고볼륨 저경쟁', () => {
  assert.equal(tierOf(row('작은황금', 3000, 1000)), 'niche');
  assert.equal(tierOf(row('경계 아래', 9999, 9000)), 'niche');
  assert.equal(tierOf(row('경계 위 저경쟁', 10000, 9999)), 'mid');
  assert.equal(tierOf(row('경계 위 문서 1만 딱', 10000, 10000)), 'mid');
  assert.equal(tierOf(row('경계 위 문서 많음', 10000, 10001)), 'large');
  assert.equal(tierOf(row('메가커피', 1256000, 1064729)), 'large', '황금비 1 이상이어도 문서가 많으면 대형');
  assert.equal(tierOf(row('황금비 미달 작은 말', 4990, 57719854)), 'plain');
  assert.equal(tierOf(row('황금비 미달 큰 말', 50000, 400000)), 'large');
});

test('황금비 경계 — 1.00 은 황금, 0.99 는 아니다 · minRatio 를 따른다', () => {
  assert.equal(tierOf(row('딱 1', 500, 500)), 'niche');
  assert.equal(tierOf(row('0.99', 495, 500)), 'plain');
  assert.equal(tierOf(row('기준 3', 900, 600), 3), 'plain');
  assert.equal(tierOf(row('기준 3 통과', 900, 300), 3), 'niche');
});

test('잘못된 값은 니치로 치지 않는다', () => {
  assert.equal(tierOf({ keyword: '값없음' }), 'plain');
  assert.equal(tierOf({ keyword: '검색량0', searchVolume: 0, documentCount: 10, ratio: 0 }), 'plain');
});

test('후보 순서 — 검색량 1만 미만 후보를 앞으로, 각 묶음 안은 원래 순서를 지킨다', () => {
  const byVolume = (a, b) => b.searchVolume - a.searchVolume;
  const seeds = [{ keyword: 'a', searchVolume: 50000 }, { keyword: 'b', searchVolume: 9000 }, { keyword: 'c', searchVolume: 3000 },
    { keyword: 'd', searchVolume: 20000 }, { keyword: 'e', searchVolume: 600 }, { keyword: 'f', searchVolume: 10000 }];
  assert.deepEqual(names([...seeds].sort(nicheBandFirst(byVolume))), ['b', 'c', 'e', 'a', 'd', 'f']);
  assert.deepEqual(names([...seeds].sort(nicheBandFirst())), ['b', 'c', 'e', 'a', 'd', 'f'], '기본 순서 = 검색량 큰 순');
});

test('고르기 — 니치 → 고볼륨 저경쟁 → 황금비 미달 작은 말 → 대형 순, 목표 개수에서 대형부터 잘린다', () => {
  const history = new Map();
  const rows = [row('대형황금', 800000, 300000), row('작은일반', 2000, 90000), row('니치A', 3000, 1000), row('저경쟁고볼륨', 40000, 2000),
    row('니치B', 800, 300), row('대형일반', 90000, 5000000)];
  const picked = selectNicheFirst(rows, history, 6, 1);
  assert.deepEqual(names(picked), ['니치A', '니치B', '저경쟁고볼륨', '작은일반', '대형황금', '대형일반']);
  assert.deepEqual(picked.map((r) => r.tier), ['niche', 'niche', 'mid', 'plain', 'large', 'large']);
  assert.deepEqual(names(selectNicheFirst(rows, history, 4, 1)), ['니치A', '니치B', '저경쟁고볼륨', '작은일반']);
});

test('고르기 — 같은 등급 안에서는 신규가 먼저, 재추천은 날짜를 남기고 뒤로', () => {
  const history = new Map([['니치재추천', '2026-11-14T01:00:00.000Z']]);
  const rows = [row('니치재추천', 5000, 1000), row('니치신규', 1000, 900)];
  const picked = selectNicheFirst(rows, history, 2, 1);
  assert.deepEqual(names(picked), ['니치신규', '니치재추천']);
  assert.deepEqual(picked[1].freshness, { status: 'repeated', lastShownAt: '2026-11-14T01:00:00.000Z' });
  assert.deepEqual(picked[0].freshness, { status: 'new' });
});

test('고르기 — 재추천 니치가 신규 대형보다 앞이다(니치가 기본)', () => {
  const history = new Map([['어제니치', '2026-11-14T01:00:00.000Z']]);
  const picked = selectNicheFirst([row('신규대형', 300000, 100000), row('어제니치', 2500, 800)], history, 2, 1);
  assert.deepEqual(names(picked), ['어제니치', '신규대형']);
});

test('고르기 — 입력에 없는 말은 만들지 않고 같은 말은 한 번만, 원본 행은 건드리지 않는다', () => {
  const input = [row('니치', 2000, 500), row('니치', 2000, 500), row('대형', 99000, 90000)];
  const copy = JSON.parse(JSON.stringify(input));
  const picked = selectNicheFirst(input, new Map(), 100, 1);
  assert.deepEqual(names(picked), ['니치', '대형']);
  assert.deepEqual(input, copy);
  assert.equal('tier' in input[0], false);
});

test('고르기 — 정렬 함수(입찰가 순)는 같은 등급 안에서만 쓰인다', () => {
  const rows = [{ ...row('비싼 대형', 99000, 50000), money: { value: 9000 } }, { ...row('싼 니치', 2000, 500), money: { value: 70 } },
    { ...row('비싼 니치', 3000, 600), money: { value: 800 } }];
  const byMoney = (list) => [...list].sort((a, b) => b.money.value - a.money.value);
  assert.deepEqual(names(selectNicheFirst(rows, new Map(), 3, 1, byMoney)), ['비싼 니치', '싼 니치', '비싼 대형']);
});

test('요약 — 니치·고볼륨 저경쟁 수와 모자란 수(목표 − 둘의 합), 모자라면 모자란다고 그대로 적는다', () => {
  const rows = [row('니치A', 3000, 1000), row('니치B', 900, 300), row('고볼륨', 40000, 2000), row('작은일반', 2000, 90000), row('대형', 90000, 5000000)];
  assert.deepEqual(tierSummary(rows, 100), { nicheCount: 2, midCount: 1, plainCount: 1, largeCount: 1, nicheShortfall: 97 });
  assert.equal(countFront(rows), 3);
  assert.deepEqual(tierSummary([], 100), { nicheCount: 0, midCount: 0, plainCount: 0, largeCount: 0, nicheShortfall: 100 });
  assert.equal(tierSummary(Array.from({ length: 120 }, (_, i) => row(`니치${i}`, 2000, 500)), 100).nicheShortfall, 0);
});
