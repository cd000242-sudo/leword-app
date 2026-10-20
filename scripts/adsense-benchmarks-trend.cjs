#!/usr/bin/env node
/**
 * 애드센스 고수 벤치마크 3단계 — 대표 검색어마다 "지금 쓰면 트래픽이 오나"를 붙인다(2026-10-20).
 *
 * 사장님: "검색량 문서량도 중요하지만 현재 글을 쓰면 트래픽을 몰고 올 수 있냐 없냐가 중요해요. 그래프로 확인을 하지만 그걸 확인해서 알려줘야."
 * 판정은 src/utils/demand-now.ts — 데이터랩 주별 13개월 실측 비율(지금 오르는 중 · 곧 시즌 · 꾸준함 · 식는 중 · 피크 지남).
 * 데이터랩 하루 한도 때문에 회차당 상한(기본 40) · 판정은 3일 기억. 경쟁 낮은 소재부터 잰다. 못 잰 카드는 비워 둔다(지어내지 않음).
 *
 * 사용: node scripts/adsense-benchmarks-trend.cjs --board <adsense-benchmarks.json> --cache <adsense-trend-cache.json> [--max 40]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TTL_MS = 3 * 24 * 60 * 60 * 1000;

const queryOf = (card) => String((card && card.metrics && card.metrics.query) || '').trim();
// 추이 모름은 하루만 — 새로 생긴 말은 금방 판정이 달라진다(2026-10-20 실측: 아이폰듀오 · 태풍 기록 1~14주).
const UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000;
const fresh = (entry, nowMs) => Boolean(entry && entry.demand && Number.isFinite(Date.parse(entry.at)) && nowMs - Date.parse(entry.at) < (entry.demand.verdict === 'unknown' ? UNKNOWN_TTL_MS : TTL_MS));
const competition = (card) => {
  const m = (card && card.metrics) || {};
  return Number(m.searchVolume) > 0 && Number.isFinite(Number(m.documentCount)) ? Number(m.documentCount) / Number(m.searchVolume) : Infinity;
};

/** 이번 회차에 잴 검색어 — 3일 안 판정이 없는 것만, 경쟁 낮은 순으로 상한까지. */
function planTrend(cards, cache, nowMs, max) {
  const seen = new Set();
  const pending = [];
  for (const card of cards || []) {
    const q = queryOf(card);
    if (!q || seen.has(q)) continue;
    seen.add(q);
    if (!fresh(cache && cache[q], nowMs)) pending.push({ q, score: competition(card) });
  }
  return { measure: pending.sort((a, b) => a.score - b.score).slice(0, Math.max(0, max)).map((x) => x.q) };
}

/** 낡은 판정은 버리고, 살아 있는 판정을 카드에 붙인다(새 배열 · 새 객체). */
function attachDemand(cards, cache, nowMs) {
  const kept = Object.fromEntries(Object.entries(cache || {}).filter(([, e]) => fresh(e, nowMs)));
  const candidates = (cards || []).map((card) => {
    const entry = kept[queryOf(card)];
    return entry ? { ...card, demand: entry.demand } : card;
  });
  return { candidates, cache: kept };
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) { if (['--board', '--cache', '--max'].includes(argv[i]) && argv[i + 1]) args[argv[i].slice(2)] = argv[++i]; }
  if (!args.board || !args.cache) throw new Error('Usage: --board <adsense-benchmarks.json> --cache <cache.json> [--max 40]');
  const board = readJson(args.board);
  if (!board || !Array.isArray(board.candidates)) throw new Error('판을 읽지 못했습니다.');
  const cache = readJson(args.cache) || {};
  const nowMs = Date.now();
  const at = new Date(nowMs).toISOString();
  const todayKst = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
  const config = { clientId: process.env.NAVER_CLIENT_ID || '', clientSecret: process.env.NAVER_CLIENT_SECRET || '' };
  const canMeasure = Boolean((config.clientId && config.clientSecret) || (process.env.NAVER_APIHUB_KEY_ID && process.env.NAVER_APIHUB_KEY));
  const { measure } = planTrend(board.candidates, cache, nowMs, canMeasure ? Number(args.max) || 40 : 0);
  if (!canMeasure) console.log('데이터랩 키 없음 — 기억해 둔 판정만 붙인다.');

  let made = 0;
  if (measure.length) {
    require('ts-node/register/transpile-only');
    const { fetchWeeklyDemand, readDemandNow } = require('../src/utils/demand-now');
    for (const q of measure) {
      const points = await fetchWeeklyDemand(q, config);
      if (points.length) {
        cache[q] = { at, demand: readDemandNow(points, todayKst) };
        made += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  const { candidates, cache: kept } = attachDemand(board.candidates, cache, nowMs);
  fs.writeFileSync(path.resolve(args.cache), JSON.stringify(kept, null, 1) + '\n', 'utf8');
  fs.writeFileSync(path.resolve(args.board), JSON.stringify({ ...board, candidates }, null, 2) + '\n', 'utf8');
  const counts = candidates.reduce((acc, c) => { if (c.demand) acc[c.demand.verdict] = (acc[c.demand.verdict] || 0) + 1; return acc; }, {});
  console.log(`추이 판정: 새로 ${made}/${measure.length} · 카드 판정 ${JSON.stringify(counts)}`);
}

if (require.main === module) {
  main().catch((error) => { console.error(String((error && error.message) || error)); process.exit(0); });
}

module.exports = { planTrend, attachDemand, TTL_MS };
