/**
 * 오늘의 추천키워드 — 황금 재고(문서 수 기억 14일 + 창고 훑기 대상).
 *
 * 2026-10-11 사장님 "황금이 많아야 돼, 그래야 가치가 있어".
 * 창고 무작위 표본 300개 실측: 검색량 2천+ 에 황금이 약 1,900개 숨어 있다(2천~1만 7% · 1만~5만 7% · 5만+ 21%, 500~2천 0%).
 * 매 회차 주제당 검색량 상위 240개만 재고 그 실측을 하루 만에 버려서 2천~1만 구간(1만 7천 개)에는 거의 닿지 못했다.
 * 그래서 실측을 14일 기억하고(재고), 회차가 끝난 뒤 남는 시간에 아직 안 잰 창고 후보를 훑는다(today-picks-sweep.js).
 * 판을 고를 때 재고의 황금(어제 실린 말 제외)을 먼저 꺼내 다시 잰다(today-picks.js --inventory).
 *
 * 재고는 Map 으로 들고 그 자리에서 고친다 — 2만 5천 항목에 2,500번 쓰는데 매번 통째로 복사하면 6천만 번 복사가 된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const INVENTORY_DAYS = 14;
const DAY = 86400000;
const flat = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const fresh = (entry, nowMs) => entry && Number.isFinite(Date.parse(entry.measuredAt)) && nowMs - Date.parse(entry.measuredAt) < INVENTORY_DAYS * DAY;

/** 파일 내용(JSON) ↔ 재고 Map — 읽기 · 쓰기는 부르는 쪽 fs 로(테스트가 가짜 fs 를 쓴다). */
function inventoryFromJson(raw) {
  return new Map(Object.entries(raw && raw.entries && typeof raw.entries === 'object' ? raw.entries : {}));
}
function inventoryToJson(inv, nowMs) {
  return { savedAt: new Date(nowMs).toISOString(), days: INVENTORY_DAYS, entries: Object.fromEntries(pruneInventory(inv, nowMs)) };
}

function loadInventory(file) {
  try { return inventoryFromJson(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return new Map(); }
}

/** 실측 한 건을 기억한다(같은 말은 새 실측이 덮는다). */
function remember(inv, keyword, { documentCount, measuredAt, searchVolume, topic, source = null }) {
  const key = flat(keyword);
  if (!key || !Number.isFinite(documentCount) || documentCount < 0) return inv;
  inv.set(key, { keyword, documentCount, measuredAt, searchVolume, topic, source });
  return inv;
}

/** 14일 지난 실측은 버린 새 Map. */
function pruneInventory(inv, nowMs) {
  return new Map([...inv].filter(([, entry]) => fresh(entry, nowMs)));
}

function saveInventory(file, inv, nowMs) {
  const json = inventoryToJson(inv, nowMs);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json), 'utf8');
  return Object.keys(json.entries).length;
}

/** 재고에서 그 주제의 황금(14일 안 실측 · 검색량 ÷ 문서수 minRatio+) — 검색량 큰 순. 판에 싣기 전 today-picks.js 가 24시간 규칙으로 다시 잰다. */
function inventoryGoldenRows(inv, topic, minRatio, nowMs) {
  return [...inv.values()]
    .filter((e) => e.topic === topic && fresh(e, nowMs) && e.documentCount > 0 && e.searchVolume > 0 && e.searchVolume / e.documentCount >= minRatio)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .map((e) => ({ keyword: e.keyword, searchVolume: e.searchVolume, documentCount: e.documentCount, measuredAt: e.measuredAt, depth: null, comp: null, source: e.source || null }));
}

/** 훑을 창고 후보 — 검색량 minVolume+ · 재고에 없거나 14일 지난 말. 주제를 돌아가며(각 주제 안은 검색량 큰 순) limit 개. */
function sweepTargets(seeds, inv, { minVolume, limit, nowMs, topicOf, guard }) {
  const byTopic = new Map();
  for (const s of Array.isArray(seeds) ? seeds : []) {
    if (!(s && s.searchVolume >= minVolume) || !guard(String(s.keyword || ''))) continue;
    if (fresh(inv.get(flat(s.keyword)), nowMs)) continue;
    const topic = topicOf(s);
    if (!topic) continue;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(s);
  }
  const queues = [...byTopic.values()].map((list) => list.sort((a, b) => b.searchVolume - a.searchVolume));
  // 주제 순서도 그 주제의 가장 큰 후보 순 — 큰 황금이 먼저 잡힌다
  queues.sort((a, b) => b[0].searchVolume - a[0].searchVolume);
  const out = [];
  for (let i = 0; out.length < limit && queues.some((q) => i < q.length); i += 1) {
    for (const q of queues) { if (out.length >= limit) break; if (i < q.length) out.push(q[i]); }
  }
  return out;
}

module.exports = { INVENTORY_DAYS, loadInventory, saveInventory, inventoryFromJson, inventoryToJson, remember, pruneInventory, inventoryGoldenRows, sweepTargets };
