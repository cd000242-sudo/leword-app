/**
 * 홈판 작성 안내 · 제목 워크플로 구조(2026-11-08, 사장님 "안내를 제목보다 우선").
 * 두 작업은 같은 Claude 구독 주간 한도를 쓴다. 안내가 먼저 돌고(제목은 안내 작업이 성공한 뒤에만),
 * 제목은 회차당 상한 · 상위 창을 지키고, 안내가 0건이면 빨간불로 끝나야 한다. 다른 엔진으로 자동 전환하는 단계는 없다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const file = path.join(__dirname, '..', '.github', 'workflows', 'homefeed-guides.yml');
const text = fs.readFileSync(file, 'utf8');
const doc = yaml.load(text);
const steps = (job) => doc.jobs[job].steps;
const runOf = (job, name) => String((steps(job).find((s) => String(s.name || '').includes(name)) || {}).run || '');

test('제목 작업은 안내 작업이 끝나 성공한 뒤에만 돈다 — 한도가 이미 닿은 회차에는 제목이 한도를 더 먹지 않는다', () => {
  const needs = [].concat(doc.jobs.titles.needs || []);
  assert.ok(needs.includes('guides'), 'titles.needs 에 guides');
  assert.doesNotMatch(String(doc.jobs.titles.if), /always\(\)/, 'always() 를 쓰면 안내 실패에도 제목이 돈다');
});

test('제목 작업은 회차당 상한과 상위 창을 지킨다(기본 40장 · 상위 300장) — 전체 요청 1000 이 아니다', () => {
  const run = runOf('titles', '홈판 제목');
  const max = /--max=\$\{\{ inputs\.title_max \|\| '(\d+)' \}\}/.exec(run);
  const top = /--top=\$\{\{ inputs\.title_top \|\| '(\d+)' \}\}/.exec(run);
  assert.ok(max && top, '--max / --top 이 입력값(title_max · title_top)과 기본값을 가진다');
  assert.equal(Number(max[1]), 40);
  assert.equal(Number(top[1]), 300);
  assert.ok(Number(max[1]) <= Number(top[1]));
  assert.ok(doc.on.workflow_dispatch.inputs.title_max && doc.on.workflow_dispatch.inputs.title_top);
  assert.doesNotMatch(run, /inputs\.max/, '안내용 상한(max=1000)을 제목이 같이 쓰지 않는다');
});

test('안내 작업은 요약을 남기고 마지막 단계가 0건이면 빨간불 · 한도면 경고로 끝낸다(발행은 마친 뒤, 항상 실행)', () => {
  const gen = runOf('guides', '카드별 작성 안내');
  assert.match(gen, /--summary=tmp\/guide-run\.json/);
  assert.match(gen, /--max=\$\{\{ inputs\.max \|\| '1000' \}\}/, '안내는 위쪽부터 전부 — 상한은 그대로');
  const list = steps('guides');
  const publish = list.findIndex((s) => String(s.name || '').includes('Publish only the guide store'));
  const check = list.findIndex((s) => /benchmark-run-summary\.cjs tmp\/guide-run\.json/.test(String(s.run || '')));
  assert.ok(publish >= 0 && check > publish, '판정 단계는 발행 단계 뒤');
  assert.equal(String(list[check].if).replace(/[\s${}]/g, ''), 'always()');
});

test('두 작업 모두 새 테스트를 먼저 돌린다', () => {
  assert.match(runOf('guides', 'Test guide store rules'), /enrich-benchmark-guides\.test\.cjs/);
  assert.match(runOf('guides', 'Test guide store rules'), /homefeed-guides-workflow\.test\.cjs/);
  assert.match(runOf('titles', 'Test title store rules'), /enrich-benchmark-titles\.test\.cjs/);
});

test('자동 폴백을 켜는 옵션 · 다른 엔진 인증 파일이 워크플로에 없다(사장님 원칙: 자동 폴백 금지)', () => {
  assert.doesNotMatch(text, /--fallback|--engine=|OPENAI_API_KEY|auth\.json:|CODEX_AUTH|GEMINI_API_KEY/);
});
