const { lastScheduledBefore, kstDay } = require('./board-round-done');
const ROUNDS = ['06:30', '13:30', '19:30'];
const keys = ['morning', 'afternoon', 'evening'];
const labels = ['오전', '오후', '저녁'];
const flat = (value) => String(value || '').replace(/\s+/g, '');
const rowsOf = (board) => (board?.topics || []).flatMap((topic) => topic.rows || []);

function roundAt(now = Date.now()) {
  const due = lastScheduledBefore(ROUNDS, now);
  const time = new Date(due + 9 * 3600000).toISOString().slice(11, 16);
  const index = ROUNDS.indexOf(time);
  return { id: `${kstDay(due)}-${keys[index]}`, label: labels[index], scheduledAt: new Date(due).toISOString() };
}

function cachedMeasurement(entry, now = Date.now()) {
  if (!entry || !Number.isFinite(entry.count) || entry.count < 0) return null;
  const age = now - Date.parse(entry.measuredAt);
  return Number.isFinite(age) && age >= 0 && age < 24 * 3600000 ? entry : null;
}

/**
 * A failed refresh must not replace the last useful board or mark its round completed.
 * 2026-10-13: 7일 재추천 금지로 후보가 적은 주제(사진 · 원예 · 좋은글 등)가 비거나 줄어든다 — 그건 실패가 아니다.
 * 실측 실패와 판 전체 붕괴를 막으며, 100개 발행본의 이미 완성된 주제도 보존한다.
 */
function canPublish(next, previous, attempts, successes) {
  if (!rowsOf(next).length || (attempts > 0 && successes / attempts < 0.8)) return false;
  if (next?.keep === 100 && previous?.keep === 100) {
    const nextCounts = new Map((next.topics || []).map((topic) => [topic.topic, (topic.rows || []).length]));
    if ((previous.topics || []).some((topic) => (topic.rows || []).length >= 100 && (nextCounts.get(topic.topic) || 0) < 100)) return false;
  }
  return rowsOf(next).length >= rowsOf(previous).length * 0.5;
}

function describeChanges(next, previous) {
  const prior = new Map(rowsOf(previous).map((r) => [flat(r.keyword), r]));
  return rowsOf(next).reduce((counts, row) => {
    const old = prior.get(flat(row.keyword));
    const key = !old ? 'added' : old.documentCount !== row.documentCount || old.searchVolume !== row.searchVolume || old.money?.value !== row.money?.value ? 'changed' : 'retained';
    return { ...counts, [key]: counts[key] + 1 };
  }, { added: 0, changed: 0, retained: 0 });
}

module.exports = { ROUNDS, roundAt, cachedMeasurement, canPublish, describeChanges };
