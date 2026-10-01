'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ledgerRows, appendLedger } = require('./homefeed-benchmark-ledger.cjs');

const now = '2026-10-01T03:00:00.000Z';
const post = (n, extra = {}) => ({ sourceId: `s${n}`, platform: 'naver-blog', name: '표본', title: `제목 ${n}`, url: `https://blog.naver.com/s${n}/${n}00`, summary: '본문은 장부에 안 들어간다', publishedAt: '2026-10-01T01:00:00.000Z', capturedAt: now, metrics: { views: null, likes: null, comments: null }, ...extra });
const obs = (p) => ({ url: p.url, platform: p.platform, capturedAt: '2026-10-01T02:00:00.000Z', metrics: p.metrics });
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hf-ledger-'));
const lines = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('새로 본 글은 seen 한 줄 — 공개 제목 · 주소 · 출처 · 발행 시각만, 본문은 없다', () => {
  const rows = ledgerRows([post(1)], [], now);
  assert.deepEqual(rows, [{ k: 'seen', t: now, u: post(1).url, s: 's1', pf: 'naver-blog', p: '2026-10-01T01:00:00.000Z', ti: '제목 1' }]);
  assert.doesNotMatch(JSON.stringify(rows), /본문/);
});
test('이미 본 글은 반응 수가 바뀔 때만 적고, 같은 값은 다시 안 적는다', () => {
  const before = post(1, { metrics: { views: null, likes: 10, comments: null } });
  assert.deepEqual(ledgerRows([before], [obs(before)], now), []);
  const after = post(1, { metrics: { views: null, likes: 17, comments: null } });
  assert.deepEqual(ledgerRows([after], [obs(before)], now), [{ k: 'm', t: now, u: after.url, v: { likes: 17 } }]);
});
test('새 글에 반응 수가 있으면 seen 과 m 둘 다 · 같은 주소가 두 번 와도 한 번만', () => {
  const p = post(2, { metrics: { views: 300, likes: 4, comments: null } });
  const rows = ledgerRows([p, p], [], now);
  assert.deepEqual(rows.map((r) => r.k), ['seen', 'm']);
  assert.deepEqual(rows[1].v, { views: 300, likes: 4 });
});
test('첫 회차(장부 없음)는 지금 떠 있는 글 전부를 b:1 로 — 처음 본 시각을 모른다고 표시한다', () => {
  const p = post(3, { metrics: { views: null, likes: 9, comments: null } });
  const rows = ledgerRows([p], [obs(p)], now, { bootstrap: true });
  assert.deepEqual(rows, [{ k: 'seen', t: now, u: p.url, s: 's3', pf: 'naver-blog', p: '2026-10-01T01:00:00.000Z', ti: '제목 3', b: 1 }, { k: 'm', t: now, u: p.url, v: { likes: 9 } }]);
});
test('같은 KST 날짜면 한 파일에 이어 적고, KST 자정을 넘으면 새 파일', () => {
  const dir = tempDir();
  appendLedger(dir, [{ k: 'seen', t: now, u: 'a' }], now);
  appendLedger(dir, [{ k: 'm', t: now, u: 'a', v: { likes: 1 } }], '2026-10-01T14:59:00.000Z');
  assert.deepEqual(lines(path.join(dir, '2026-10-01.jsonl')).map((r) => r.k), ['seen', 'm']);
  appendLedger(dir, [{ k: 'm', t: now, u: 'a', v: { likes: 2 } }], '2026-10-01T15:00:00.000Z');
  assert.equal(lines(path.join(dir, '2026-10-02.jsonl')).length, 1);
});
test('14일 넘은 파일만 지우고, 적을 게 없어도 정리는 한다 · 다른 파일은 건드리지 않는다', () => {
  const dir = tempDir();
  for (const name of ['2026-09-16.jsonl', '2026-09-17.jsonl', 'README.md']) fs.writeFileSync(path.join(dir, name), 'x\n');
  const result = appendLedger(dir, [], now);
  assert.deepEqual(result.removed, ['2026-09-16.jsonl']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-09-17.jsonl', 'README.md']);
});
test('배선 — 수집기가 장부를 쓰고, CI 가 넘기고 커밋한다(만들어 놓고 안 불리는 모듈 방지)', () => {
  const main = fs.readFileSync(path.join(__dirname, 'homefeed-benchmarks.cjs'), 'utf8');
  assert.match(main, /require\('\.\/homefeed-benchmark-ledger\.cjs'\)/);
  const ci = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'homefeed-benchmarks.yml'), 'utf8');
  assert.match(ci, /--ledger site\/data\/homefeed-ledger/);
  assert.match(ci, /git add -A data\/homefeed-ledger/);
  assert.match(ci, /homefeed-benchmark-ledger\.test\.cjs/);
});
