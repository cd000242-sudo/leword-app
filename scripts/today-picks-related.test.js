'use strict';
// 2026-10-20 사장님 "드롭다운 펼치면 연관 황금키워드도 같이 알려주시고, 초황금키워드면 초황금키워드라고 해주세요".
// 연관 황금은 이미 잰 말(이번 회차 + 14일 재고)에서 고른다 — 추가 API 호출 없음. 초황금 = 앱 등급표 SSS(classic · winnable).
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRelatedKeyword, attachRelated, markUltra } = require('./today-picks-related');

const sss = (sv, dc, ratio) => (sv >= 1000 && dc > 0 && dc <= 5000 && ratio >= 5) || (sv >= 100 && sv <= 1500 && dc > 0 && dc <= 500 && ratio >= 3);
const row = (keyword, searchVolume, documentCount) => ({ keyword, searchVolume, documentCount, ratio: Math.round((searchVolume / documentCount) * 100) / 100 });

test('연관은 연속 3자 조각(3자 이하는 통째)이 겹치면 — 띄어쓰기는 무시', () => {
  assert.equal(isRelatedKeyword('김장', '김장 김치 담그는법'), true);
  assert.equal(isRelatedKeyword('자동차세 연납', '자동차세연납할인'), true);
  assert.equal(isRelatedKeyword('자동차세 연납', '연말정산'), false);
  assert.equal(isRelatedKeyword('김장', '김장'), false, '같은 말은 연관이 아니다');
});

test('행마다 연관 황금을 붙인다 — 판에 이미 실린 말 · 비황금은 빼고, 초황금 먼저 · 황금비 높은 순 · 최대 5개', () => {
  const rows = [row('김장', 30000, 9000), row('김장 배추', 5000, 2000)];
  const pool = [
    row('김장 배추', 5000, 2000),
    row('김장김치 양념', 4000, 600),
    row('김장 재료', 2000, 1500),
    row('김장 매트', 300, 900),
    row('절임배추', 9000, 100),
    row('김장 양념 비율', 1200, 200),
  ];
  const out = attachRelated(rows, pool, { minRatio: 1, limit: 5, isUltra: sss });
  assert.deepEqual(out[0].related.map((r) => r.keyword), ['김장김치 양념', '김장 양념 비율', '김장 재료']);
  assert.equal(out[0].related[0].ultra, true);
  assert.equal(out[0].related[2].ultra, false);
  assert.ok(!out[1].related.some((r) => r.keyword === '김장'), '판에 실린 말은 연관으로 다시 안 싣는다');
  assert.equal(rows[0].related, undefined, '원본 행은 그대로');
});

test('연관이 없으면 related 칸을 만들지 않는다', () => {
  const out = attachRelated([row('독감', 1000, 100)], [row('연말정산', 9000, 900)], { minRatio: 1, limit: 5, isUltra: sss });
  assert.equal('related' in out[0], false);
});

test('초황금 표시는 등급표 SSS 를 만족하는 행에만', () => {
  const out = markUltra([row('절임배추', 9000, 100), row('김장', 30000, 9000)], sss);
  assert.equal(out[0].ultra, true);
  assert.equal('ultra' in out[1], false);
});

test('생성 스크립트가 발행 행에 초황금 표시와 연관 황금을 붙인다(배선)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'today-picks.js'), 'utf8');
  assert.match(src, /attachRelated\(markUltra\(selected, isGoldenSss\), relatedPool, \{ minRatio, limit: 5, isUltra: isGoldenSss \}\)/);
  assert.match(src, /require\('\.\.\/src\/utils\/grade'\)/);
});
