#!/usr/bin/env node
/**
 * 제휴 카테고리별 황금 검색어 (2026-10-29 사장님 "제휴 황금키워드도 카테고리별로 있을 거 아냐, 그걸 분류해서 황금키워드를 찾아줘야지").
 *
 * 실측 배경: 제휴 상품 280개의 상품명 검색어로는 황금(문서수 ÷ 월검색량 < 1.0, 월검색량 ≥ 100)이 4개뿐이었다.
 * 상품명이 아니라 **카테고리 대표어(상품 종류 명사)의 연관어**를 넓게 잰다.
 *
 *   ① 카테고리  사이트 단일 출처 affiliateGolden.mjs 의 affiliateCategory(item) 를 그대로 불러 쓴다(복제 금지)
 *   ② 씨앗      상품명 → 상품 종류 명사(src/utils/need-keywords.ts) + 아이템의 needKeyword, 카테고리별 빈도 순 상위 N
 *   ③ 연관어    검색광고 keywordstool(getNaverSearchAdKeywordSuggestions) — 씨앗의 핵심 명사를 포함한 말, 월검색량 ≥ 100
 *   ④ 문서수    블로그 검색 API total(getNaverBlogDocumentCount) — 카테고리당 검색량 상위 N개만. 0 · 실패는 미측정으로 버린다
 *   ⑤ 황금      문서수 ÷ 검색량 < 1.0 만. 등급 S(<0.3 & 검색 500↑) · A(<0.7) · B(<1.0). 잰 숫자만 — 추정 없음
 * 이번에 빈 카테고리는 이전 파일의 것을 7일까지 유지한다(빈 회차로 덮지 않음). 전체가 비면 파일을 쓰지 않고 종료코드 3.
 *
 * 사용: node scripts/affiliate-golden-keywords.cjs --campaigns=<affiliate-campaigns.json> --out=<affiliate-golden-keywords.json>
 *        [--golden-lib=site/spa/src/lib/affiliateGolden.mjs] [--seeds-per-category=5] [--measure-per-category=50] [--max-related=N]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 7 * DAY_MS;
const MIN_VOLUME = 100;
const MAX_PER_CATEGORY = 30;
const DOC_CONCURRENCY = 4;
const DEFAULT_GOLDEN_LIB = 'site/spa/src/lib/affiliateGolden.mjs';

const compact = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const isoOf = (ms) => new Date(ms).toISOString();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** 임시 파일에 쓰고 바꿔치기 — 쓰다 죽어도 반쯤 쓰인 파일이 남지 않는다. */
function writeJsonAtomic(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** { sites: { toss: { items }, brandconnect: { items } } } → 항목 전부 */
function itemsOf(snapshot) {
  const sites = snapshot && typeof snapshot.sites === 'object' && snapshot.sites ? Object.values(snapshot.sites) : [];
  return sites.flatMap((site) => (site && Array.isArray(site.items) ? site.items : [])).filter((it) => it && typeof it === 'object');
}

/** 문서수 ÷ 검색량 기준 등급. 비율 1.0 이상 · 검색 100 미만 · 문서수 0/미측정은 황금이 아니다(null). */
function gradeOf(volume, docs) {
  if (!isNum(volume) || !isNum(docs) || volume <= 0 || docs <= 0) return null;
  const ratio = docs / volume;
  if (ratio < 0.3 && volume >= 500) return 'S';
  if (ratio < 0.7 && volume >= MIN_VOLUME) return 'A';
  if (ratio < 1.0 && volume >= MIN_VOLUME) return 'B';
  return null;
}

/** 씨앗로 쓸 수 있나 — 한글 포함, 기호 없음, 검색광고 힌트 한도(띄어쓰기 뺀 15자) 이내. */
function usableSeed(seed) {
  const text = String(seed || '').replace(/\s+/g, ' ').trim();
  const flat = text.replace(/\s+/g, '');
  if (!/^[가-힣A-Za-z0-9 ]+$/.test(text) || !/[가-힣]{2,}/.test(text)) return '';
  return flat.length >= 2 && flat.length <= 15 ? text : '';
}

/**
 * 카테고리별 씨앗 — 상품명의 상품 종류 명사(extract) + needKeyword, 빈도 내림차순(같으면 처음 나온 순), 띄어쓰기 무시 중복 제거.
 * @returns {Record<string,string[]>} 새 객체
 */
function pickSeeds(items, { categoryOf, extract, perCategory = 5 }) {
  const tallies = new Map(); // category → Map(compactKey → { text, count, order })
  let order = 0;
  for (const item of items) {
    let category;
    try { category = categoryOf(item); } catch { category = ''; }
    if (!category) continue;
    let phrases = [];
    try { phrases = [...(extract(String(item.name || '')) || [])]; } catch { phrases = []; }
    phrases.push(item.needKeyword);
    const tally = tallies.get(category) || new Map();
    for (const raw of phrases) {
      const text = usableSeed(raw);
      if (!text) continue;
      const key = compact(text);
      const prev = tally.get(key);
      tally.set(key, prev ? { ...prev, count: prev.count + 1 } : { text, count: 1, order: order++ });
    }
    tallies.set(category, tally);
  }
  const out = {};
  for (const [category, tally] of tallies) {
    const seeds = [...tally.values()].sort((a, b) => b.count - a.count || a.order - b.order).slice(0, perCategory).map((s) => s.text);
    if (seeds.length) out[category] = seeds;
  }
  return out;
}

/** 씨앗의 핵심 명사 = 마지막 어절 ("휴대용 선풍기" → "선풍기") */
function coreNounOf(seed) {
  const parts = String(seed || '').trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** 월검색량(PC+모바일). "<10" · 한쪽이라도 못 쟀으면 null — 미측정은 0 이 아니다. */
function volumeOfRow(row) {
  if (!row) return null;
  if (isNum(row.totalSearchVolume)) return row.totalSearchVolume;
  const pc = row.monthlyPcQcCnt !== undefined ? row.monthlyPcQcCnt : row.pcSearchVolume;
  const mobile = row.monthlyMobileQcCnt !== undefined ? row.monthlyMobileQcCnt : row.mobileSearchVolume;
  return isNum(pc) && isNum(mobile) ? pc + mobile : null;
}

/** 연관어 거르기 — 핵심 명사 포함(띄어쓰기 무시) · 월검색량 ≥ minVolume · 씨앗 자신 제외 · 같은 말 하나. 검색량 내림차순. */
function filterRelated(seed, rows, minVolume = MIN_VOLUME) {
  const core = compact(coreNounOf(seed));
  const seedKey = compact(seed);
  const best = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const keyword = String((row && row.keyword) || '').trim();
    const key = compact(keyword);
    const volume = volumeOfRow(row);
    if (!keyword || key === seedKey || !core || !key.includes(core) || volume === null || volume < minVolume) continue;
    const prev = best.get(key);
    if (!prev || volume > prev.volume) best.set(key, { keyword, volume });
  }
  return [...best.values()].sort((a, b) => b.volume - a.volume);
}

/** 씨앗별 거른 연관어 → 카테고리 후보. 씨앗 간 같은 말은 검색량 큰 쪽 하나. 검색량 내림차순. */
function mergeCandidates(perSeed) {
  const best = new Map();
  for (const { seed, rows } of perSeed) {
    for (const row of rows) {
      const key = compact(row.keyword);
      const prev = best.get(key);
      if (!prev || row.volume > prev.volume) best.set(key, { keyword: row.keyword, volume: row.volume, seed });
    }
  }
  return [...best.values()].sort((a, b) => b.volume - a.volume);
}

const topByVolume = (candidates, n) => [...candidates].sort((a, b) => b.volume - a.volume).slice(0, Math.max(0, n));

/** 잰 것 → 황금만. docRatio 오름차순 → 같으면 검색량 내림차순, 상한. */
function goldenOf(measured, measuredAt, max = MAX_PER_CATEGORY) {
  return measured
    .map((m) => ({ ...m, grade: gradeOf(m.volume, m.docs) }))
    .filter((m) => m.grade !== null)
    .map((m) => ({ ...m, raw: m.docs / m.volume }))
    .sort((a, b) => a.raw - b.raw || b.volume - a.volume)
    .slice(0, max)
    .map((m) => ({
      keyword: m.keyword, volume: m.volume, docs: m.docs, docRatio: Math.round(m.raw * 10000) / 10000,
      grade: m.grade, seed: m.seed, measuredAt,
    }));
}

/** 카테고리의 가장 최근 측정 시각(ms) — 없으면 폴백. */
function newestMeasuredMs(category, fallbackIso) {
  const times = (Array.isArray(category && category.keywords) ? category.keywords : []).map((k) => Date.parse(k && k.measuredAt)).filter(Number.isFinite);
  if (times.length) return Math.max(...times);
  const fb = Date.parse(fallbackIso || '');
  return Number.isFinite(fb) ? fb : -Infinity;
}

/** 이번에 빈 카테고리는 이전 것을 7일까지 유지. 이번에 결과가 있으면 이번 것. 새 객체. */
function mergeCategories(next, previous, nowMs) {
  const prevCats = (previous && previous.categories) || {};
  const out = {};
  for (const [name, cat] of Object.entries(next || {})) {
    if (cat && Array.isArray(cat.keywords) && cat.keywords.length) { out[name] = { ...cat, keywords: [...cat.keywords] }; continue; }
  }
  for (const [name, old] of Object.entries(prevCats)) {
    if (out[name] || !old || !Array.isArray(old.keywords) || !old.keywords.length) continue;
    if (nowMs - newestMeasuredMs(old, previous && previous.builtAt) <= KEEP_MS) {
      out[name] = { ...old, seeds: [...(old.seeds || [])], keywords: old.keywords.map((k) => ({ ...k })) };
    }
  }
  return out;
}

/** 작업 목록을 동시에 n개씩 — 결과 순서는 입력 순서. */
async function mapPool(list, n, fn) {
  const results = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const i = cursor++;
      results[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, list.length)) }, worker));
  return results;
}

/**
 * 전체 파이프라인. 네트워크(fetchRelated · fetchDocs)는 주입한다.
 * @returns {{ file: object|null, stats: object }} file 이 null 이면 쓸 황금이 하나도 없다.
 */
async function buildGolden({
  items, categoryOf, extract, seedsPerCategory = 5, measurePerCategory = 50, minVolume = MIN_VOLUME,
  fetchRelated, fetchDocs, nowMs = Date.now(), previous = null, maxRelated = Infinity, log = () => {},
}) {
  const stats = { relatedRequests: 0, docRequests: 0, relatedFailures: 0 };
  const seedsByCategory = pickSeeds(items, { categoryOf, extract, perCategory: seedsPerCategory });
  const measuredAt = isoOf(nowMs);
  const categories = {};
  for (const [category, seeds] of Object.entries(seedsByCategory)) {
    const perSeed = [];
    for (const seed of seeds) {
      if (stats.relatedRequests >= maxRelated) break;
      stats.relatedRequests += 1;
      try {
        perSeed.push({ seed, rows: filterRelated(seed, await fetchRelated(seed), minVolume) });
      } catch (error) {
        stats.relatedFailures += 1;
        log(`연관어 조회 실패 [${category}/${seed}]: ${error && error.message ? error.message : error}`);
      }
    }
    const targets = topByVolume(mergeCandidates(perSeed), measurePerCategory);
    const docs = await mapPool(targets, DOC_CONCURRENCY, async (target) => {
      stats.docRequests += 1;
      try { const n = await fetchDocs(target.keyword); return isNum(n) && n > 0 ? n : null; } catch { return null; }
    });
    const measured = targets.map((t, i) => ({ ...t, docs: docs[i] }));
    categories[category] = {
      seeds: [...seeds],
      measured: measured.filter((m) => m.docs !== null).length,
      keywords: goldenOf(measured, measuredAt),
    };
  }
  const merged = mergeCategories(categories, previous, nowMs);
  if (!Object.keys(merged).length) return { file: null, stats };
  return {
    file: { schemaVersion: 1, builtAt: measuredAt, source: 'naver-searchad+blog-search', minVolume, categories: merged },
    stats,
  };
}

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => { const f = argv.find((a) => a.startsWith(`--${name}=`)); return f ? f.slice(name.length + 3) : fallback; };

async function main() {
  const campaignsPath = path.resolve(arg('campaigns'));
  const outPath = path.resolve(arg('out'));
  if (!arg('campaigns') || !arg('out') || !fs.existsSync(campaignsPath)) {
    console.error('--campaigns=<affiliate-campaigns.json> 과 --out=<affiliate-golden-keywords.json> 이 필요합니다.');
    process.exit(2);
  }
  const libPath = path.resolve(arg('golden-lib', DEFAULT_GOLDEN_LIB));
  if (!fs.existsSync(libPath)) { console.error(`분류 라이브러리를 찾지 못했습니다: ${libPath}`); process.exit(2); }

  require('ts-node/register/transpile-only');
  require('./load-project-env').loadProjectEnv();
  const { affiliateCategory } = await import(pathToFileURL(libPath).href);
  const { extractCategoryPhrases } = require('../src/utils/need-keywords');
  const { getNaverSearchAdKeywordSuggestions } = require('../src/utils/naver-searchad-api');
  const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');

  // 키는 앱 설정(EnvironmentManager)이 먼저, 없으면 환경 변수(CI). 값은 어디에도 찍지 않는다.
  let cfg = {};
  try {
    const { EnvironmentManager } = require('../src/utils/environment-manager');
    const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
    cfg = manager.getConfig() || {};
  } catch { cfg = {}; }
  const adConfig = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };
  if (!adConfig.accessLicense || !adConfig.secretKey) { console.error('검색광고 키가 없습니다 — 연관어를 잴 수 없어 중단합니다.'); process.exit(2); }

  const items = itemsOf(readJson(campaignsPath));
  console.log(`제휴 상품 ${items.length}개 읽음`);
  const maxRelated = Number(arg('max-related')) || Infinity;
  const { file, stats } = await buildGolden({
    items,
    categoryOf: affiliateCategory,
    extract: extractCategoryPhrases,
    seedsPerCategory: Number(arg('seeds-per-category')) || 5,
    measurePerCategory: Number(arg('measure-per-category')) || 50,
    minVolume: MIN_VOLUME,
    fetchRelated: (seed) => getNaverSearchAdKeywordSuggestions(adConfig, seed, 200),
    fetchDocs: (keyword) => getNaverBlogDocumentCount(keyword, openApi.clientId ? { config: openApi } : {}),
    nowMs: Date.now(),
    previous: readJson(outPath),
    maxRelated,
    log: (line) => console.warn(line),
  });
  console.log(`검색광고 연관어 요청 ${stats.relatedRequests}건(실패 ${stats.relatedFailures}) · 블로그 문서수 요청 ${stats.docRequests}건`);
  if (!file) { console.error('황금 검색어가 하나도 없어 파일을 쓰지 않습니다.'); process.exit(3); }
  writeJsonAtomic(outPath, file);
  for (const [name, cat] of Object.entries(file.categories)) console.log(`${name}: 황금 ${cat.keywords.length}개 (잰 말 ${cat.measured}, 씨앗 ${cat.seeds.join('·')})`);
  console.log(`저장: ${outPath}`);
}

if (require.main === module) {
  main().catch((error) => { console.error('제휴 황금 검색어 실패:', error && error.message ? error.message : error); process.exit(1); });
}

module.exports = {
  gradeOf, pickSeeds, coreNounOf, volumeOfRow, filterRelated, mergeCandidates, topByVolume, goldenOf,
  mergeCategories, buildGolden, readJson, writeJsonAtomic, itemsOf, usableSeed,
};
