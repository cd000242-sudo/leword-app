#!/usr/bin/env node
/**
 * 오늘의 추천키워드 — 니치 우선 전/후 분포 보고(2026-11-15). API 호출 없이 이미 발행된 판(과 보관함)만 읽는다.
 *
 *   node scripts/today-picks-niche-report.js --board=today-picks.json [--archive=today-picks-archive] [--keep=100] [--json=out.json]
 *
 * 세 가지 보기:
 *   현재    발행된 판 그대로(예전 규칙으로 뽑힌 순서)
 *   순서만  같은 행을 새 순서(니치 → 고볼륨 저경쟁 → 일반 → 대형)로 다시 세운 것 — 무엇이 앞에 오는지 본다
 *   다시 고름 판 + 보관함에 남은 실측 행 전부(같은 말은 가장 최근 실측)에서 새 규칙으로 다시 고른 것. 7일 재추천 금지는 적용하지 않는다.
 * 새 후보를 더 재는 효과는 여기서 볼 수 없다 — 그건 실제 회차에서만 나온다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeKeyword } = require('./today-picks-selection');
const { tierOf, selectNicheFirst, TIER_ORDER } = require('./today-picks-niche');

const median = (values) => {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
};
const bucket = (value, cuts, labels) => { const at = cuts.findIndex((cut) => value < cut); return labels[at === -1 ? cuts.length : at]; };
const VOLUME_LABELS = ['1천 미만', '1천~3천', '3천~1만', '1만~3만', '3만 이상'];
const DOCS_LABELS = ['5천 이하', '5천~1만', '1만~5만', '5만 초과'];
const count = (list, key) => list.reduce((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] || 0) + 1 }), {});
const emptyTiers = () => Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0]));

/** 주제 목록 [{topic, rows}] → 분포 숫자. heads = 앞 N칸(무료 열람은 3칸). */
function viewStats(topics, { minRatio = 1, keep = 100, heads = [3, 10, 30] } = {}) {
  const rows = topics.flatMap((t) => t.rows);
  const tierRows = (list) => ({ ...emptyTiers(), ...count(list, (row) => tierOf(row, minRatio)) });
  const head = Object.fromEntries(heads.map((n) => {
    const first = topics.flatMap((t) => t.rows.slice(0, n));
    return [n, { rows: first.length, tiers: tierRows(first), medianVolume: median(first.map((r) => r.searchVolume)), medianDocs: median(first.map((r) => r.documentCount)) }];
  }));
  const tiers = tierRows(rows);
  return {
    topics: topics.length, rows: rows.length, golden: rows.filter((r) => r.ratio >= minRatio).length, tiers,
    volume: { ...Object.fromEntries(VOLUME_LABELS.map((l) => [l, 0])), ...count(rows, (r) => bucket(r.searchVolume, [1000, 3000, 10000, 30000], VOLUME_LABELS)) },
    docs: { ...Object.fromEntries(DOCS_LABELS.map((l) => [l, 0])), ...count(rows, (r) => bucket(r.documentCount, [5001, 10001, 50001], DOCS_LABELS)) },
    medianVolume: median(rows.map((r) => r.searchVolume)), medianDocs: median(rows.map((r) => r.documentCount)),
    nicheShortfall: topics.reduce((sum, t) => sum + Math.max(0, keep - t.rows.filter((r) => ['niche', 'mid'].includes(tierOf(r, minRatio))).length), 0),
    topicsWithoutNiche: topics.filter((t) => !t.rows.some((r) => tierOf(r, minRatio) === 'niche')).length,
    head,
  };
}

/** 판 + 보관함 → 주제별 실측 행 풀(같은 말은 가장 최근 실측). */
function poolTopics(boards, minRatio = 1) {
  const byTopic = new Map();
  for (const board of boards) {
    for (const topic of board.topics || []) {
      if (!byTopic.has(topic.topic)) byTopic.set(topic.topic, new Map());
      for (const row of topic.rows || []) {
        if (!(row.documentCount > 0 && row.searchVolume > 0)) continue;
        const key = normalizeKeyword(row.keyword);
        const seen = byTopic.get(topic.topic).get(key);
        const at = Date.parse(row.measuredAt || board.builtAt) || 0;
        const { freshness, tier, related, ...bare } = row;
        if (!seen || at > seen.at) byTopic.get(topic.topic).set(key, { at, row: { ...bare, ratio: bare.ratio ?? bare.searchVolume / bare.documentCount } });
      }
    }
  }
  return [...byTopic].map(([topic, rows]) => ({ topic, rows: [...rows.values()].map((entry) => entry.row) }));
}

function main() {
  const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
  if (!arg('board')) { console.error('--board=<today-picks.json> 이 필요합니다.'); process.exit(2); }
  const board = JSON.parse(fs.readFileSync(path.resolve(arg('board')), 'utf8'));
  const keep = Number(arg('keep')) || board.keep || 100;
  const minRatio = Number(board.minRatio) || 1;
  const boards = [board];
  if (arg('archive')) {
    const dir = path.resolve(arg('archive'));
    for (const file of fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) boards.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  // 실제 회차와 같은 입찰가 순(src/utils/money-keywords.ts)을 등급 안에서 쓴다 — 7일 재추천 금지는 적용하지 않는다(빈 이력).
  require('ts-node/register/transpile-only');
  const { orderGoldenByMoney } = require('../src/utils/money-keywords');
  const none = new Map();
  const rank = (rows) => selectNicheFirst(rows, none, keep, minRatio, orderGoldenByMoney);
  const options = { minRatio, keep };
  const report = {
    current: viewStats(board.topics, options),
    reordered: viewStats(board.topics.map((t) => ({ topic: t.topic, rows: rank(t.rows) })), options),
    reselected: viewStats(poolTopics(boards).map((t) => ({ topic: t.topic, rows: rank(t.rows) })), options),
    poolRows: poolTopics(boards).reduce((n, t) => n + t.rows.length, 0),
  };
  if (arg('json')) fs.writeFileSync(path.resolve(arg('json')), JSON.stringify(report, null, 1), 'utf8');
  for (const [name, stats] of [['현재 발행본', report.current], ['순서만 바꿈(같은 100행)', report.reordered], ['다시 고름(판+보관함 실측 풀)', report.reselected]]) {
    console.log(`\n[${name}] 주제 ${stats.topics} · 행 ${stats.rows} · 황금비 1+ ${stats.golden}`);
    console.log(`  등급  니치 ${stats.tiers.niche} · 고볼륨 저경쟁 ${stats.tiers.mid} · 일반 ${stats.tiers.plain} · 대형 ${stats.tiers.large}  (니치 없는 주제 ${stats.topicsWithoutNiche} · 모자란 칸 합 ${stats.nicheShortfall})`);
    console.log(`  검색량 ${VOLUME_LABELS.map((l) => `${l} ${stats.volume[l]}`).join(' · ')}  (중앙값 ${stats.medianVolume})`);
    console.log(`  문서수 ${DOCS_LABELS.map((l) => `${l} ${stats.docs[l]}`).join(' · ')}  (중앙값 ${stats.medianDocs})`);
    for (const [n, h] of Object.entries(stats.head)) console.log(`  앞 ${n}칸(주제별) ${h.rows}행 — 니치 ${h.tiers.niche} · 고볼륨 ${h.tiers.mid} · 일반 ${h.tiers.plain} · 대형 ${h.tiers.large} · 검색량 중앙값 ${h.medianVolume} · 문서수 중앙값 ${h.medianDocs}`);
  }
  console.log(`\n풀 행 수(판+보관함, 중복 제거) ${report.poolRows}`);
}

module.exports = { viewStats, poolTopics, median };

if (require.main === module) main();
