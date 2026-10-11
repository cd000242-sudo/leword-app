#!/usr/bin/env node
/**
 * 오늘의 추천키워드 — 창고 훑기(황금 재고 채우기).
 *
 * 2026-10-11 사장님 "황금이 많아야 돼, 그래야 가치가 있어". 창고 표본 300개 실측으로 검색량 2천+ 에 황금 약 1,900개가 숨어 있었다.
 * 회차가 발행된 뒤(판을 늦추지 않게) 아직 안 잰 창고 후보의 블로그 문서 수를 재서 재고(14일)에 남긴다.
 * 다음 회차의 today-picks.js --inventory 가 재고의 황금을 먼저 꺼내 다시 잰다. 검색량 2천 미만은 표본에서 황금 0%라 안 잰다.
 *
 * 사용: node scripts/today-picks-sweep.js --warehouse=data/seed-db.json --inventory=.today-picks-inventory/inventory.json [--calls=2500] [--minVolume=2000]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const { topicOfSeed } = require('../src/utils/seed-db');
const { judgeAnswerCardKeyword, judgeEphemeralKeyword, listedNamesFromSeeds, isListedName } = require('../src/utils/preemption-supply-guards');
const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { loadInventory, saveInventory, remember, sweepTargets } = require('./today-picks-inventory');

const arg = (name, fallback = '') => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const warehousePath = arg('warehouse', 'data/seed-db.json');
  const inventoryPath = arg('inventory');
  if (!inventoryPath) { console.error('--inventory=<inventory.json> 이 필요합니다.'); process.exit(2); }
  const calls = Math.max(0, Number(arg('calls')) || 2500);
  const minVolume = Math.max(1, Number(arg('minVolume')) || 2000);
  const gapMs = Math.max(0, Number(arg('gapMs')) || 120);
  const cfg = (typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager()).getConfig();
  if (!cfg.naverClientId || !cfg.naverClientSecret) { console.error('네이버 오픈 API 자격증명이 필요합니다(문서수 실측).'); process.exit(2); }
  const db = JSON.parse(fs.readFileSync(warehousePath, 'utf8'));
  const listed = listedNamesFromSeeds(db.seeds || []);
  const guard = (kw) => kw.length >= 2 && kw.length <= 15 && !judgeAnswerCardKeyword(kw).answerCard && !judgeEphemeralKeyword(kw).ephemeral && !isListedName(kw, listed);
  const nowMs = Date.now();
  const inv = loadInventory(inventoryPath);
  const before = inv.size;
  const targets = sweepTargets(db.seeds || [], inv, { minVolume, limit: calls, nowMs, topicOf: topicOfSeed, guard });
  console.log(`창고 훑기 — 재고 ${before.toLocaleString('ko-KR')}개 · 이번에 잴 후보 ${targets.length.toLocaleString('ko-KR')}개(검색량 ${minVolume}+)`);
  let measured = 0; let golden = 0; let failed = 0;
  const started = Date.now();
  for (const s of targets) {
    let dc = null;
    try { dc = await getNaverBlogDocumentCount(s.keyword, { config: { clientId: cfg.naverClientId, clientSecret: cfg.naverClientSecret } }); } catch { dc = null; }
    if (Number.isFinite(dc) && dc >= 0) {
      measured += 1;
      remember(inv, s.keyword, { documentCount: dc, measuredAt: new Date().toISOString(), searchVolume: s.searchVolume, topic: topicOfSeed(s), source: String(s.source || '').split(':')[0] || null });
      if (dc > 0 && s.searchVolume / dc >= 1) golden += 1;
    } else failed += 1;
    if (failed >= 50 && failed > measured) { console.log('::warning::문서수 실측이 연달아 실패 — 일일 한도일 수 있어 멈춘다.'); break; }
    await sleep(gapMs);
  }
  const size = saveInventory(inventoryPath, inv, Date.now());
  const goldenTotal = [...inv.values()].filter((e) => e.documentCount > 0 && e.searchVolume / e.documentCount >= 1).length;
  console.log(`끝 — 잰 ${measured} · 새 황금 ${golden} · 실패 ${failed} · ${Math.round((Date.now() - started) / 1000)}초 → 재고 ${size.toLocaleString('ko-KR')}개(그중 황금 ${goldenTotal.toLocaleString('ko-KR')}개)`);
}

if (require.main === module) main().then(() => process.exit(0)).catch((error) => { console.error('창고 훑기 실패:', error); process.exit(1); });
