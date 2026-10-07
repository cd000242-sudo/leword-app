#!/usr/bin/env node
/**
 * 애드센스 고수 벤치마크 제목 창고 — 소재 1개당 구글 · 다음 검색용 제목 20개(2026-10-07, 3단계).
 *
 * 홈판 제목 창고(enrich-benchmark-titles.js)와 같은 구조다: 창고에 없는 카드만 골라 동시에(4) 짓고(시간 상한),
 * 창고 제목을 판 카드의 `titles` 로 얹는다. 실측 대표 검색어(2단계)가 있는 카드만 짓는다 — 검색어 없는 검색용 제목은 없다.
 * 회차당 상한은 사장님 결정(홈판 20 · 애드센스 20, 구독 사용량을 나눠 씀).
 *
 * 사용: node scripts/enrich-adsense-titles.js --board=<adsense-benchmarks.json> --store=<adsense-benchmark-titles.json> [--max=20] [--concurrency=4] [--budget-min=8]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { freshEntries, mergeEntries, generateTitles } = require('./enrich-benchmark-titles.js');
const { serialize } = require('./homefeed-benchmarks-core.cjs');

// 2026-10-07-superior: 고수 제목과 같은 채점표로 재서 가장 높은 고수 제목을 넘는 것만(사장님 "고수 제목보다 훨씬 상위호환").
const ADSENSE_TITLE_RULES = '2026-10-07-superior';

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function atomicWrite(file, value) {
  const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, serialize(value) + '\n', 'utf8'); fs.renameSync(temp, resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

/** 판 카드마다 창고 제목을 `titles` 로 얹는다. 없으면 빈 목록 — 화면이 [지금 제목 만들기]를 그린다. */
function attachAdsenseTitles(board, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const candidates = (board && Array.isArray(board.candidates) ? board.candidates : []).map((card) => {
    const hit = byId.get(card.id);
    return {
      ...card,
      titles: hit ? [...hit.titles] : [],
      // 제목과 같은 순서 — 그 제목이 고수 제목보다 나은 점. 예전 규칙 제목엔 없다(빈 목록).
      titleEdges: hit && Array.isArray(hit.edges) ? [...hit.edges] : [],
      ...(hit && Number.isFinite(hit.masterBest) ? { masterBest: hit.masterBest } : {}),
      ...(hit ? { titlesAt: hit.at } : {}),
    };
  });
  return { ...board, candidates };
}

/**
 * 이번 회차 — 예전 규칙으로 지은 카드(이미 화면에 보이는 고수 다시 쓰기 제목)를 먼저, 그다음 창고에 없는 카드. 판 순서(★ 먼저), 최대 max.
 * 규칙 표시가 없는 항목은 건드리지 않는다.
 */
function pickAdsenseTargets(cards, kept, max) {
  const byId = new Map(kept.map((e) => [e.id, e]));
  const stale = cards.filter((c) => { const e = byId.get(c.id); return e && typeof e.rules === 'string' && e.rules !== ADSENSE_TITLE_RULES; });
  const missing = cards.filter((c) => !byId.has(c.id));
  return [...stale, ...missing].slice(0, Math.max(0, max));
}

async function main() {
  const boardPath = arg('board');
  const storePath = arg('store');
  if (!boardPath || !storePath) { console.error('--board=<adsense-benchmarks.json> --store=<adsense-benchmark-titles.json> 이 필요합니다.'); process.exit(2); }
  const max = Number(arg('max')) || 20;
  const concurrency = Math.max(1, Number(arg('concurrency')) || 4);
  const budgetMs = Math.max(0, Number(arg('budget-min')) || 8) * 60_000;
  const board = readJson(boardPath);
  if (!board || !Array.isArray(board.candidates)) throw new Error(`애드센스 판을 읽지 못했습니다: ${boardPath}`);
  const kept = freshEntries(readJson(storePath));

  let made = [];
  let provider = '';
  try {
    require('ts-node/register/transpile-only');
    const { cardsFromAdsenseBoard, titlesForAdsenseCards, ADSENSE_TITLE_BATCH } = require('../src/utils/adsense-title-engine');
    const cards = pickAdsenseTargets(cardsFromAdsenseBoard(board), kept, max);
    console.log(`애드센스 제목 대상 ${cards.length}장 (창고 유지 ${kept.length}장) · 배치 ${ADSENSE_TITLE_BATCH} · 동시 ${concurrency}`);
    // 공용 생성기(홈판과 같음)는 titles 만 옮긴다 — 고수보다 나은 점(edges)과 기준 점수는 여기서 따로 받아 붙인다.
    const extras = new Map();
    const titlesFor = async (batch) => {
      const result = await titlesForAdsenseCards(batch);
      for (const row of result.results) extras.set(row.id, { edges: row.edges, masterBest: row.masterBest });
      return result;
    };
    ({ made, provider } = await generateTitles(cards, kept, { batchSize: ADSENSE_TITLE_BATCH, concurrency, budgetMs, titlesFor }));
    made = made.map((e) => ({ ...e, ...(extras.get(e.id) || {}), rules: ADSENSE_TITLE_RULES }));
  } catch (error) {
    console.log(`!! 애드센스 제목 생성 실패(부착은 계속): ${String((error && error.message) || error).slice(0, 200)}`);
  }
  const entries = mergeEntries(kept, made);
  atomicWrite(storePath, { generatedAt: new Date().toISOString(), provider: provider || (readJson(storePath) || {}).provider || '', total: entries.length, entries });
  atomicWrite(boardPath, attachAdsenseTitles(board, entries));
  const attached = board.candidates.filter((c) => entries.some((e) => e.id === c.id)).length;
  console.log(`애드센스 제목 창고 ${entries.length}장 (새로 ${made.length}장) · 판 카드 ${board.candidates.length}장 중 제목 있는 카드 ${attached}장`);
}

module.exports = { attachAdsenseTitles, pickAdsenseTargets, ADSENSE_TITLE_RULES };

if (require.main === module) {
  main().catch((error) => { console.error('애드센스 제목 창고 실패:', error); process.exit(1); });
}
