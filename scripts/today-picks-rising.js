'use strict';
/*
 * Ordering rule for today's picks (2026-11-08, approved by the owner).
 *
 *   old: seasonal seeds peaking this or next month first, then larger search volume
 *        (top-20 hit rate for "volume >= 1.5x in 3-5 weeks": 15%, test anchors 10/04 and 10/15)
 *   new: seasonal seeds peaking NEXT month or in TWO months first, and inside that group the seed whose search
 *        volume rose the most over the last 12 days first (92.5% on the same anchors)
 *
 * Evidence: golden_ml/golden_lib/rules.py variants v1 (old) and v4 (new). v4 scores a seed as
 *   100 * [peak is 1-2 months ahead] + ln(clip(volume / volume 12 days ago, 0.05, 20))
 * falling back to the 3-day ratio when no 12-day reference exists, and to ratio 1 (score 0) with no history at all.
 * Seeds outside the group keep today's order (volume, then name): the experiment only validated the top of the
 * list, which sits entirely inside the group, so the tail is deliberately left alone.
 *
 * Only the ordering changes. The golden-ratio condition, the 7-day no-repeat rule, topic grouping and the number
 * of shown rows are decided elsewhere and are untouched. The seasonPeakMonth display flag keeps its meaning
 * (this month or next month) because the site renders it as a badge.
 */
const { normalizeKeyword } = require('./today-picks-selection');
const { kstDayNumber, pointsOf, volumeAtOrBefore, MAX_REF_AGE_DAYS } = require('./today-picks-volume-history');

const MOMENTUM_LONG_DAYS = 12;
const MOMENTUM_SHORT_DAYS = 3;
const RATIO_MIN = 0.05;
const RATIO_MAX = 20;
const NO_RANK = Object.freeze({ group: 0, momentum: 0 });

/** KST month number (1-12) of an instant. */
const kstMonth = (now) => new Date(now.getTime() + 9 * 3600 * 1000).getUTCMonth() + 1;
const monthsAfter = (month, offset) => ((month - 1 + offset) % 12) + 1;

/** KST this month and next month — the "traffic is coming" display flag (seasonPeakMonth). Unchanged. */
function upcomingMonths(now = new Date()) {
  const m = kstMonth(now);
  return [m, monthsAfter(m, 1)];
}

/** KST next month and the month after — the months whose seasonal seeds lead the ordering. */
function rankingMonths(now = new Date()) {
  const m = kstMonth(now);
  return [monthsAfter(m, 1), monthsAfter(m, 2)];
}

/** Next, +2 and +3 months: tracked in the volume history so a seed already has 12 days of points when it enters the group. */
function trackedMonths(now = new Date()) {
  const m = kstMonth(now);
  return [monthsAfter(m, 1), monthsAfter(m, 2), monthsAfter(m, 3)];
}

function seasonPeak(seed, months) {
  const match = /^month:(\d{1,2})$/.exec(String(seed.source || ''));
  if (!match) return null;
  const m = Number(match[1]);
  return months.includes(m) ? m : null;
}

/** Which seeds the volume history tracks on the day of `now`. */
function trackedScope(now = new Date()) {
  const months = trackedMonths(now);
  return (seed) => seasonPeak(seed, months) !== null;
}

/** ln(clip(volume now / reference volume, 0.05, 20)); the 12-day reference first, then the 3-day one, else 0. */
function momentumOf(points, day, volumeNow) {
  if (!Array.isArray(points) || !(volumeNow > 0)) return 0;
  const oldest = day - MAX_REF_AGE_DAYS;
  const reference = [MOMENTUM_LONG_DAYS, MOMENTUM_SHORT_DAYS].map((lag) => volumeAtOrBefore(points, day - lag)).find((p) => p && p[0] >= oldest);
  if (!reference) return 0;
  return Math.log(Math.min(RATIO_MAX, Math.max(RATIO_MIN, volumeNow / reference[1])));
}

// Code-point order, not localeCompare: the same tie-break on every machine (the CI runner and the owner's PC differ in locale).
const byName = (a, b) => { const x = normalizeKeyword(a); const y = normalizeKeyword(b); return x < y ? -1 : x > y ? 1 : 0; };

/**
 * Build the comparators for one run. `history` is the parsed volume history (may be null/empty).
 *   poolOrder — candidate pool (before measuring): rank, then larger search volume, then name
 *   rowOrder  — measured non-golden rows: rank, then higher golden ratio
 * rank = in the group first, then larger 12-day momentum. Keywords unknown to the ranker rank last.
 */
function createRanker({ seeds, history, now = new Date() }) {
  const months = rankingMonths(now);
  const day = kstDayNumber(now.getTime());
  const ranks = new Map();
  let withReference = 0;
  for (const seed of Array.isArray(seeds) ? seeds : []) {
    if (seasonPeak(seed, months) === null) continue;
    const key = normalizeKeyword(seed.keyword);
    if (!key) continue;
    const points = pointsOf(history, seed.keyword);
    const momentum = momentumOf(points, day, Number(seed.searchVolume));
    if (momentum !== 0) withReference += 1;
    ranks.set(key, { group: 1, momentum });
  }
  const rank = (keyword) => ranks.get(normalizeKeyword(keyword)) || NO_RANK;
  const byRank = (a, b) => {
    const ra = rank(a.keyword);
    const rb = rank(b.keyword);
    return (rb.group - ra.group) || (rb.momentum - ra.momentum);
  };
  return {
    months,
    groupSize: ranks.size,
    movingCount: withReference,
    rank,
    poolOrder: (a, b) => byRank(a, b) || (b.searchVolume - a.searchVolume) || byName(a.keyword, b.keyword),
    rowOrder: (a, b) => byRank(a, b) || (b.ratio - a.ratio),
  };
}

module.exports = { upcomingMonths, rankingMonths, trackedMonths, seasonPeak, trackedScope, momentumOf, createRanker };
