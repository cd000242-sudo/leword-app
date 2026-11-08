'use strict';
/*
 * Small per-keyword search-volume history for the "today's picks" ordering (2026-11-08).
 *
 * seed-db.json only carries the latest volume, but the ordering needs "how much did it rise over the last
 * 12 days". This store keeps a few dated points per tracked keyword so the picks job can compare today's
 * volume against an earlier one. It is deliberately tiny: a point every RECORD_EVERY_DAYS days, nothing older
 * than KEEP_DAYS (plus one older anchor point for forward-filling), MAX_POINTS per keyword, MAX_ENTRIES keywords.
 *
 * Days are KST day numbers (whole days since 1970-01-01 in KST). The in-memory history is immutable:
 * every function returns a new object. Keys are normalized like the rest of the picks code.
 */
const { normalizeKeyword } = require('./today-picks-selection');

const FORMAT_VERSION = 1;
const RECORD_EVERY_DAYS = 2;
const KEEP_DAYS = 16;
// A reference older than this is no longer a "12-day" comparison; it is ignored (and the point is dropped).
const MAX_REF_AGE_DAYS = 30;
const MAX_POINTS = 10;
const MAX_ENTRIES = 4000;

const DAY_MS = 86400000;
const kstDayNumber = (ms) => Math.floor((ms + 9 * 3600000) / DAY_MS);

const emptyHistory = () => ({ entries: new Map(), updatedDay: 0 });

const isPoint = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isFinite(p[1]) && p[1] > 0;

/** Read a parsed JSON payload. Anything unexpected becomes an empty history — it must never throw. */
function parseHistory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== FORMAT_VERSION) return emptyHistory();
  const source = raw.entries;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return emptyHistory();
  const entries = new Map();
  for (const [keyword, points] of Object.entries(source)) {
    const key = normalizeKeyword(keyword);
    if (!key || !Array.isArray(points)) continue;
    const valid = points.filter(isPoint).map((p) => [p[0], Math.round(p[1])]).sort((a, b) => a[0] - b[0]);
    if (valid.length > 0) entries.set(key, valid);
  }
  return { entries, updatedDay: Number.isInteger(raw.updatedDay) ? raw.updatedDay : 0 };
}

/** Plain JSON-able form with keywords in a fixed order, so equal content gives an identical file. */
function serializeHistory(history) {
  const entries = {};
  for (const key of [...history.entries.keys()].sort()) entries[key] = history.entries.get(key).map((p) => [p[0], p[1]]);
  return { version: FORMAT_VERSION, updatedDay: history.updatedDay, entries };
}

const pointsOf = (history, keyword) => (history && history.entries && history.entries.get(normalizeKeyword(keyword))) || undefined;

/** The latest point on or before `day` (null if none). Points are ascending by day. */
function volumeAtOrBefore(points, day) {
  if (!Array.isArray(points)) return null;
  let found = null;
  for (const p of points) { if (p[0] <= day) found = p; else break; }
  return found;
}

/** Keep recent points plus the single newest older one (still within MAX_REF_AGE_DAYS); empty array = drop the keyword. */
function pruned(points, day) {
  const cutoff = day - KEEP_DAYS;
  const recent = points.filter((p) => p[0] >= cutoff);
  const older = points.filter((p) => p[0] < cutoff && p[0] >= day - MAX_REF_AGE_DAYS);
  const kept = older.length > 0 ? [older[older.length - 1], ...recent] : recent;
  return kept.slice(-MAX_POINTS);
}

/**
 * Record one seed-db snapshot taken on KST day `day`.
 * `inScope(seed)` decides which seeds are tracked. A point is added only when the newest stored point is at least
 * `everyDays` old; snapshots from the past are ignored. Entries are pruned on every call.
 */
function recordSnapshot(history, seeds, { day, inScope = () => true, everyDays = RECORD_EVERY_DAYS }) {
  if (!Number.isInteger(day) || day < history.updatedDay) return history;
  const next = new Map();
  for (const [key, points] of history.entries) next.set(key, points);
  const latest = new Map();
  for (const seed of Array.isArray(seeds) ? seeds : []) {
    const volume = Number(seed && seed.searchVolume);
    const key = normalizeKeyword(seed && seed.keyword);
    if (!key || !(volume > 0) || !Number.isFinite(volume) || !inScope(seed)) continue;
    latest.set(key, Math.round(volume));
  }
  for (const [key, volume] of latest) {
    const points = next.get(key) || [];
    const newest = points[points.length - 1];
    if (!newest || day - newest[0] >= everyDays) next.set(key, [...points, [day, volume]]);
  }
  const entries = new Map();
  for (const [key, points] of next) {
    const kept = pruned(points, day);
    if (kept.length > 0) entries.set(key, kept);
  }
  if (entries.size > MAX_ENTRIES) {
    // Over the cap: drop the smallest current volumes first (they matter least for the ordering).
    const biggest = [...entries].sort((a, b) => b[1][b[1].length - 1][1] - a[1][a[1].length - 1][1] || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_ENTRIES);
    return { entries: new Map(biggest), updatedDay: day };
  }
  return { entries, updatedDay: day };
}

module.exports = {
  FORMAT_VERSION, RECORD_EVERY_DAYS, KEEP_DAYS, MAX_REF_AGE_DAYS, MAX_POINTS, MAX_ENTRIES,
  kstDayNumber, emptyHistory, parseHistory, serializeHistory, pointsOf, volumeAtOrBefore, recordSnapshot,
};
