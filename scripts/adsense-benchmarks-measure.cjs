#!/usr/bin/env node
/**
 * 애드센스 고수 벤치마크 2단계 — 소재마다 실측을 붙인다(2026-10-07).
 *
 * 카드의 keyword 는 제목 낱말을 이은 것이라 그대로는 검색어가 아니다. 그래서 소재 자신의 낱말로 후보를 만들어 **정확 검색량**을 잰다:
 *   후보(앞 낱말 2개 · 3개를 붙인 말, 15자 안) → 실측 검색량 최대 = 대표 검색어 → 블로그 문서수 · 파워링크 3위 입찰가.
 * 처음엔 연관어 목록에서 골랐는데 실측해 보니 '국민연금추납'은 연관어 0개, '한국축구'는 로또 · 프로야구가 돌아왔다(2026-10-07).
 * 실측 검색량이 없으면 비워 둔다 — '국민연금' 같은 넓은 한 낱말로 바꾸면 다른 소재가 된다(지어내지 않음). 검색광고 쿼터 때문에 회차당 새 소재만(상한), 잰 값은 7일 캐시.
 *
 * 사용: node scripts/adsense-benchmarks-measure.cjs --board <adsense-benchmarks.json> --cache <adsense-measure-cache.json> [--max 60]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const compact = (v) => String(v || '').replace(/\s+/g, '');

/** 검색광고 힌트 — 카드 앞 낱말 둘을 붙인 말(15자 안). 넘으면 첫 낱말, 그것도 넘으면 빈 값. */
function hintOf(card) {
  const words = String(card && card.keyword || '').split(/\s+/).filter(Boolean);
  const two = compact(words.slice(0, 2).join(''));
  if (two && two.length <= 15) return two;
  const one = compact(words[0]);
  return one && one.length <= 15 ? one : '';
}

/** 후보 검색어 — 앞 낱말 2개 · 3개를 붙인 말(검색광고 15자 한도 안). 낱말이 하나뿐이면 그 말. */
function candidatesOf(card) {
  const words = String(card && card.keyword || '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return compact(words[0]).length <= 15 ? [compact(words[0])] : [];
  return [...new Set([2, 3].map((n) => compact(words.slice(0, n).join(''))).filter((w) => w && w.length <= 15))];
}

/** 대표 검색어 — 후보 중 실측 검색량(>0) 최대. 없으면 null. */
function pickQuery(candidates, volumes) {
  const pool = (candidates || []).map((q) => ({ query: q, searchVolume: volumes.get(q) })).filter((x) => typeof x.searchVolume === 'number' && x.searchVolume > 0);
  if (!pool.length) return null;
  return pool.sort((a, b) => b.searchVolume - a.searchVolume)[0];
}

/** 이번 회차 할 일 — 7일 안 캐시는 붙이기만, 나머지는 ★ 먼저 상한까지 잰다. */
function planTargets(cards, cache, nowMs, max) {
  const fresh = (entry) => entry && Number.isFinite(Date.parse(entry.at)) && nowMs - Date.parse(entry.at) < CACHE_TTL_MS && entry.query;
  const cached = []; const rest = [];
  for (const c of cards || []) {
    const hint = hintOf(c);
    if (!hint) continue;
    if (fresh(cache && cache[hint])) cached.push(c); else rest.push(c);
  }
  const ordered = [...rest].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));
  return { cached, measure: ordered.slice(0, Math.max(0, max)) };
}

function withMetrics(card, entry) {
  return { ...card, metrics: { query: entry.query, searchVolume: entry.searchVolume ?? null, documentCount: entry.documentCount ?? null, bid: entry.bid ?? null, measuredAt: entry.at } };
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) { if (['--board', '--cache', '--max'].includes(argv[i]) && argv[i + 1]) args[argv[i].slice(2)] = argv[++i]; }
  if (!args.board || !args.cache) throw new Error('Usage: --board <adsense-benchmarks.json> --cache <cache.json> [--max 60]');
  const board = readJson(args.board);
  if (!board || !Array.isArray(board.candidates)) throw new Error('판을 읽지 못했습니다.');
  const cache = readJson(args.cache) || {};
  const nowMs = Date.now();
  const at = new Date(nowMs).toISOString();
  const max = Number(args.max) || 60;

  require('ts-node/register/transpile-only');
  const { getNaverSearchAdKeywordVolume, getNaverSearchAdBidPairs } = require('../src/utils/naver-searchad-api');
  const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
  const { bidKey } = require('../src/utils/money-keywords');
  const searchAd = { accessLicense: process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '', secretKey: process.env.NAVER_SEARCH_AD_SECRET_KEY || '', customerId: process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '' };
  const openApi = { clientId: process.env.NAVER_CLIENT_ID || '', clientSecret: process.env.NAVER_CLIENT_SECRET || '' };
  const canMeasure = Boolean(searchAd.accessLicense && searchAd.secretKey);

  const plan = planTargets(board.candidates, cache, nowMs, canMeasure ? max : 0);
  if (!canMeasure) console.log('검색광고 키 없음 — 캐시만 붙인다.');
  let made = 0; let empty = 0;
  // 후보 검색량은 한꺼번에(검색광고는 한 번에 5개씩 묶어 묻는다).
  const volumes = new Map();
  const allCandidates = [...new Set(plan.measure.flatMap(candidatesOf))];
  if (allCandidates.length) {
    try {
      for (const row of await getNaverSearchAdKeywordVolume(searchAd, allCandidates)) volumes.set(compact(row.keyword), row.totalSearchVolume);
    } catch (error) { console.log(`  !! 검색량: ${String((error && error.message) || error).slice(0, 100)}`); }
  }
  for (const card of plan.measure) {
    const hint = hintOf(card);
    try {
      const picked = pickQuery(candidatesOf(card), volumes);
      if (!picked) { empty += 1; cache[hint] = { query: null, at }; continue; }
      let documentCount = null;
      try { documentCount = await getNaverBlogDocumentCount(picked.query, openApi.clientId ? { config: openApi } : {}); } catch { documentCount = null; }
      cache[hint] = { query: picked.query, searchVolume: picked.searchVolume, documentCount, bid: null, at };
      made += 1;
    } catch (error) {
      console.log(`  !! ${hint}: ${String((error && error.message) || error).slice(0, 100)}`);
    }
  }
  // 입찰가는 한꺼번에(PC · 모바일 두 번) — 이번에 새로 잰 검색어만.
  const fresh = Object.values(cache).filter((e) => e && e.at === at && e.query);
  if (canMeasure && fresh.length) {
    try {
      const bids = await getNaverSearchAdBidPairs(searchAd, fresh.map((e) => e.query));
      for (const e of fresh) { const pair = bids.get(bidKey(e.query)); e.bid = pair ? (pair.mobile ?? pair.pc ?? null) : null; }
    } catch (error) { console.log(`  !! 입찰가: ${String((error && error.message) || error).slice(0, 100)}`); }
  }
  // 낡은 캐시는 버리고 판에 붙인다.
  for (const [k, e] of Object.entries(cache)) if (!e || !Number.isFinite(Date.parse(e.at)) || nowMs - Date.parse(e.at) >= CACHE_TTL_MS) delete cache[k];
  const candidates = board.candidates.map((c) => { const e = cache[hintOf(c)]; return e && e.query ? withMetrics(c, e) : c; });
  fs.writeFileSync(path.resolve(args.cache), JSON.stringify(cache, null, 1) + '\n', 'utf8');
  const { serialize } = require('./homefeed-benchmarks-core.cjs');
  fs.writeFileSync(path.resolve(args.board), serialize({ ...board, candidates }) + '\n', 'utf8');
  const measured = candidates.filter((c) => c.metrics && c.metrics.query).length;
  console.log(`실측: 새로 ${made}개 · 연관어 없음 ${empty}개 · 캐시 붙임 ${plan.cached.length}개 → 실측 붙은 카드 ${measured}/${candidates.length}`);
}

module.exports = { hintOf, candidatesOf, pickQuery, planTargets, withMetrics, CACHE_TTL_MS };

if (require.main === module) {
  main().catch((error) => { console.error('애드센스 실측 실패(판은 그대로):', error.message); process.exit(0); });
}
