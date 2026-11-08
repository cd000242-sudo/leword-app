#!/usr/bin/env node
'use strict';
/*
 * Append today's seed-db volumes to the search-volume history (data/seed-volume-history.json).
 *
 * Runs in the picks workflow right after the daily seed-db rebuild and before today-picks.js reads the history.
 * The observation day is the seed-db's own builtAt (KST), not the wall clock — a stale seed-db after a failed
 * rebuild must not be recorded as today's. Same-day re-runs and older snapshots change nothing.
 *
 *   node scripts/seed-volume-history-update.js
 *   node scripts/seed-volume-history-update.js --seeds=data/seed-db.json --history=data/seed-volume-history.json
 */
const fs = require('fs');
const path = require('path');
const store = require('./today-picks-volume-history');
const { trackedScope } = require('./today-picks-rising');

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
};

function readHistory(historyPath) {
  try { return store.parseHistory(JSON.parse(fs.readFileSync(historyPath, 'utf8'))); } catch { return store.emptyHistory(); }
}

function updateHistoryFile({ seedsPath, historyPath, now = new Date() }) {
  const db = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  if (!db || !Array.isArray(db.seeds)) throw new Error(`씨앗 창고를 못 읽었습니다: ${seedsPath}`);
  const before = readHistory(historyPath);
  const built = Date.parse(db.builtAt);
  const observedAt = new Date(Number.isFinite(built) ? built : now.getTime());
  const after = store.recordSnapshot(before, db.seeds, { day: store.kstDayNumber(observedAt.getTime()), inScope: trackedScope(observedAt) });
  const text = JSON.stringify(store.serializeHistory(after));
  let current = '';
  try { current = fs.readFileSync(historyPath, 'utf8'); } catch { current = ''; }
  const changed = text !== current;
  if (changed) {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(`${historyPath}.tmp`, text, 'utf8');
    fs.renameSync(`${historyPath}.tmp`, historyPath);
  }
  return { entries: after.entries.size, updatedDay: after.updatedDay, bytes: Buffer.byteLength(text, 'utf8'), changed };
}

module.exports = { updateHistoryFile };

if (require.main === module) {
  try {
    const result = updateHistoryFile({
      seedsPath: path.resolve(arg('seeds') || path.join(__dirname, '..', 'data', 'seed-db.json')),
      historyPath: path.resolve(arg('history') || path.join(__dirname, '..', 'data', 'seed-volume-history.json')),
    });
    console.log(`검색량 이력 — 키워드 ${result.entries.toLocaleString('ko-KR')}개 · ${(result.bytes / 1024).toFixed(0)}KB · ${result.changed ? '갱신' : '변경 없음'}`);
  } catch (error) {
    console.error(`검색량 이력 갱신 실패: ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}
