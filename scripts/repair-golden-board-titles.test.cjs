'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { repairGoldenBoardTitles, main } = require('./repair-golden-board-titles');
const fs = require('fs');
const os = require('os');
const path = require('path');

const unsafe = { text: '크플 대출 후기 리드코프 직접 써본 기록', frame: 'review', basis: 'old' };
const fixture = () => ({
  publishedAt: '2026-09-20T00:00:00Z',
  freeSample: { day: '2026-09-20', keywords: ['크플 대출 후기'] },
  rows: [{ keyword: '크플 대출 후기', searchVolume: 1400, documentCount: 512, measuredAt: '2026-09-19T00:00:00Z', money: { pc: null }, titles: { seo: unsafe, home: unsafe } }],
  trendCandidates: [{ keyword: '커브론 방석 부작용', searchVolume: null, measuredAt: '2026-09-18', titles: { seo: { text: '커브론 방석 부작용 미희주사 어떤 정보가 있는지', frame: 'generic', basis: 'old' } } }],
  reference: [{ keyword: 'other', extra: 42 }],
});

test('both collections are repaired while all measurements, timestamps, free names and input remain unchanged', () => {
  const input = fixture();
  const snapshot = JSON.stringify(input);
  const { board, stats } = repairGoldenBoardTitles(input);
  assert.equal(stats.changed, 2);
  assert.equal(board.trendCandidates[0].titles.seo.text, '');
  assert.doesNotMatch(board.rows[0].titles.seo.text, /리드코프|직접/);
  const withoutTitles = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'titles' ? undefined : item));
  assert.deepEqual(withoutTitles(board), withoutTitles(input));
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(repairGoldenBoardTitles(board).stats.changed, 0);
});

test('rows without titles are unchanged; safe AI remains', () => {
  const safe = { text: '근로장려금 신청 방법 서류를 준비하는 순서', frame: 'ai', basis: 'verified' };
  const board = { rows: [{ keyword: '근로장려금 신청 방법', titles: { seo: safe, home: safe } }, { keyword: '새 후보', searchVolume: null }] };
  const result = repairGoldenBoardTitles(board).board;
  assert.deepEqual(result.rows[0].titles, { seo: safe, home: safe });
  assert.equal(result.rows[1], board.rows[1]);
});

test('CLI defaults to dry-run and requires --write to create output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-title-repair-test-'));
  const input = path.join(directory, 'input.json');
  const output = path.join(directory, 'output.json');
  const serialized = JSON.stringify(fixture());
  try {
    fs.writeFileSync(input, serialized);
    main([`--in=${input}`, `--out=${output}`]);
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.readFileSync(input, 'utf8'), serialized);
    main([`--in=${input}`, `--out=${output}`, '--write']);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).publishedAt, fixture().publishedAt);
    assert.equal(fs.readFileSync(input, 'utf8'), serialized);
  } finally {
    for (const file of [input, output]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
