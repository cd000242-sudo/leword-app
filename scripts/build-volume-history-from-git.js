#!/usr/bin/env node
'use strict';
/*
 * Seed the search-volume history (data/seed-volume-history.json) from the git history of data/seed-db.json.
 *
 * The picks job appends one point per run from now on (seed-volume-history-update.js), but the 12-day
 * ordering needs older points on day one. data/seed-db.json is committed regularly, so its past versions
 * are the history we already have. Also used to replay the experiment: --asOf cuts the history at a snapshot.
 *
 *   node scripts/build-volume-history-from-git.js --out=data/seed-volume-history.json
 *   node scripts/build-volume-history-from-git.js --out=history.json --asOf=2026-10-04T20:43:42.952Z --every=1
 *
 * Read-only on the repository (git log / git show). Tracked scope = month-sourced seeds peaking in the next three
 * months, judged on the newest snapshot.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const store = require('./today-picks-volume-history');
const { trackedScope } = require('./today-picks-rising');
const { normalizeKeyword } = require('./today-picks-selection');

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
};

/** Fold snapshots ({ builtAt, seeds }) into a history: unique builtAt, oldest first, cut at `asOf`. */
function buildHistoryFromSnapshots(snapshots, { everyDays = store.RECORD_EVERY_DAYS, asOf = null } = {}) {
  const limit = asOf ? Date.parse(asOf) : Infinity;
  const byBuiltAt = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const time = Date.parse(snapshot && snapshot.builtAt);
    if (Number.isFinite(time) && time <= limit && !byBuiltAt.has(time)) byBuiltAt.set(time, snapshot);
  }
  const times = [...byBuiltAt.keys()].sort((a, b) => a - b);
  if (times.length === 0) return store.emptyHistory();
  // Scope = seeds tracked in the NEWEST snapshot, applied to every older snapshot by name: a seed whose source tag
  // flipped between builds (e.g. hint -> month:12) keeps the points it had before the flip.
  const latest = byBuiltAt.get(times[times.length - 1]);
  const inLatestScope = trackedScope(new Date(times[times.length - 1]));
  const tracked = new Set((Array.isArray(latest.seeds) ? latest.seeds : []).filter((seed) => seed && inLatestScope(seed)).map((seed) => normalizeKeyword(seed.keyword)));
  const inScope = (seed) => tracked.has(normalizeKeyword(seed.keyword));
  let history = store.emptyHistory();
  for (const time of times) history = store.recordSnapshot(history, byBuiltAt.get(time).seeds, { day: store.kstDayNumber(time), inScope, everyDays });
  return history;
}

function readSnapshotsFromGit(repo, file) {
  const git = (args) => execFileSync('git', args, { cwd: repo, maxBuffer: 512 * 1024 * 1024 });
  const commits = git(['log', '--reverse', '--format=%H', '--', file]).toString('utf8').split(/\r?\n/).filter(Boolean);
  const snapshots = [];
  for (const commit of commits) {
    try {
      const db = JSON.parse(git(['show', `${commit}:${file}`]).toString('utf8').replace(/^﻿/, ''));
      // Keep only the fields the history needs — a snapshot has ~50k seeds.
      snapshots.push({ builtAt: db.builtAt, seeds: (db.seeds || []).map((s) => ({ keyword: s.keyword, searchVolume: s.searchVolume, source: s.source })) });
    } catch { /* a commit without a readable snapshot is skipped */ }
  }
  return snapshots;
}

function main() {
  const repo = path.resolve(arg('repo') || '.');
  const file = arg('path') || 'data/seed-db.json';
  const out = path.resolve(arg('out') || 'data/seed-volume-history.json');
  const history = buildHistoryFromSnapshots(readSnapshotsFromGit(repo, file), { everyDays: Number(arg('every')) || store.RECORD_EVERY_DAYS, asOf: arg('asOf') || null });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(store.serializeHistory(history)), 'utf8');
  console.log(`검색량 이력 — 키워드 ${history.entries.size.toLocaleString('ko-KR')}개 · 마지막 날 ${history.updatedDay} → ${out}`);
}

module.exports = { buildHistoryFromSnapshots, readSnapshotsFromGit };

if (require.main === module) main();
