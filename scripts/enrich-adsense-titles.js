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

const ADSENSE_TITLE_RULES = '2026-10-07-search';

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
    return { ...card, titles: hit ? [...hit.titles] : [], ...(hit ? { titlesAt: hit.at } : {}) };
  });
  return { ...board, candidates };
}

/** 이번 회차 — 창고에 없는 카드(판 순서 = ★ 먼저) 최대 max. */
function pickAdsenseTargets(cards, kept, max) {
  const have = new Set(kept.map((e) => e.id));
  return cards.filter((c) => !have.has(c.id)).slice(0, Math.max(0, max));
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
    ({ made, provider } = await generateTitles(cards, kept, { batchSize: ADSENSE_TITLE_BATCH, concurrency, budgetMs, titlesFor: (batch) => titlesForAdsenseCards(batch) }));
    made = made.map((e) => ({ ...e, rules: ADSENSE_TITLE_RULES }));
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
