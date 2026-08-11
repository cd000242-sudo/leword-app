#!/usr/bin/env node
/**
 * 채집한 원문 → 사이트가 읽는 스냅샷.
 *
 * 파서는 **실물 응답을 뜬 뒤에** 맞췄다(2026-08-12 실측). 추측으로 박지 않는다.
 *
 *   토스        sharelink.toss.im/api-public/v3/shopping/sharelink/curation-sections
 *               success.sections[].items[].taca.productView
 *               displayName · thumbnailUrl · originalPrice/displayPrice · discountRate
 *               상품 URL 은 응답에 없다 — productId 로 쇼핑 주소를 만든다.
 *   브랜드커넥트  gw-brandconnect.naver.com/affiliate/query/affiliate-products/recommend-by-display-category
 *               data[] — productName · storeName · commissionRate · shortenUrl · productUrl
 *               **commissionRate 가 제휴수익의 핵심 신호다.** 그대로 싣는다.
 *
 * 여기에 우리 판정을 붙인다 — 목록만 옮기면 "남의 목록 나열"이 된다:
 *   상품명 → 검색어 추출(쿠팡 레인과 같은 규칙) → 월 검색량 · 블로그 문서수 ·
 *   상위10 정면 실측. 그래야 초록/경합 배지가 같은 뜻으로 붙는다.
 *
 * 사용: node scripts/affiliate-campaigns-parse.js [--limit=24]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const https = require('https');

const DUMP_DIR = path.join(__dirname, '..', 'tmp', 'affiliate-dump');
const OUT_PATH = path.join(__dirname, '..', 'tmp', 'affiliate-campaigns-public.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// 핵심 검색어는 정본 모듈이 낸다 — 사본을 만들면 화면과 배치가 갈라진다.
const { productCoreKeyword: productKeyword } = require('../src/utils/product-core-keyword');

/** 상위 10 제목 정면 대응. worker.js titleExactness 와 같은 규칙(낱덩어리 기준). */
const subTokens = (text) => String(text || '').toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) || [];
function titleExactness(titles, keyword) {
  const tokens = subTokens(keyword);
  if (tokens.length === 0) return null;
  let exact = 0;
  let partial = 0;
  const sample = (titles || []).slice(0, 10);
  for (const raw of sample) {
    const compact = subTokens(String(raw).replace(/<[^>]+>/g, ' ')).join('');
    const hits = tokens.filter((t) => compact.includes(t)).length;
    if (hits === tokens.length) exact += 1;
    else if (hits * 2 >= tokens.length) partial += 1;
  }
  return { sampled: sample.length, exact, partial };
}

function readDump(site, urlPattern) {
  const dir = path.join(DUMP_DIR, site);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (urlPattern.test(parsed.url)) out.push(parsed);
    } catch { /* 깨진 덤프는 건너뛴다 */ }
  }
  return out;
}

function parseToss() {
  const items = [];
  for (const dump of readDump('toss', /curation-sections/)) {
    const sections = (dump.body && dump.body.success && dump.body.success.sections) || [];
    for (const section of sections) {
      for (const entry of section.items || []) {
        const view = entry && entry.taca && entry.taca.productView;
        if (!view || !view.displayName) continue;
        // 상품 주소가 응답에 없다 — productId 로 만든다(쉐어링크는 콘솔에서 발급).
        const productId = view.productId || entry.productId;
        items.push({
          name: String(view.displayName),
          brand: String(entry.categoryName || ''),
          image: String(view.thumbnailUrl || ''),
          url: productId ? `https://shopping.toss.im/product/${productId}` : '',
          reward: view.discountRate ? `${view.discountRate}% 할인` : '',
          price: Number(view.displayPrice || 0) || null,
        });
      }
    }
  }
  return items;
}

function parseBrandConnect() {
  const items = [];
  for (const dump of readDump('brandconnect', /recommend-by-display-category/)) {
    for (const row of (dump.body && dump.body.data) || []) {
      if (!row || !row.productName) continue;
      items.push({
        name: String(row.productName),
        // 링크발급 화면 주소에 쓰인다 — 스페이스ID + 이 값이라야 열린다(실측).
        productId: String(row.id || ''),
        brand: String(row.storeName || ''),
        image: String(row.representativeProductImageUrl || ''),
        // shortenUrl 이 이미 제휴링크다. 없으면 상품 주소.
        url: String(row.shortenUrl || row.productUrl || ''),
        // 제휴수익의 핵심 신호 — 그대로 싣는다.
        reward: row.commissionRate ? `수수료 ${row.commissionRate}%` : '',
        price: Number(row.discountedSalePrice || row.salePrice || 0) || null,
      });
    }
  }
  return items;
}

async function analyze(items, creds) {
  const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
  const searchAd = {
    accessLicense: creds.naverSearchAdAccessLicense,
    secretKey: creds.naverSearchAdSecretKey,
    customerId: creds.naverSearchAdCustomerId,
  };
  const keywords = items.map((item) => item.keyword);

  const volumes = new Map();
  for (let i = 0; i < keywords.length; i += 5) {
    try {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, keywords.slice(i, i + 5));
      for (const row of rows) {
        const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
        if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    } catch { /* 실패분은 빠진다 */ }
    await sleep(200);
  }

  // 블로그: 6개씩 + 800ms — 오픈 API 는 이보다 빠르면 429 를 준다(실측).
  const blog = (keyword) => new Promise((resolve) => {
    https.get(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=10`, {
      headers: { 'X-Naver-Client-Id': creds.naverClientId, 'X-Naver-Client-Secret': creds.naverClientSecret },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(data) : null); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });

  for (let i = 0; i < items.length; i += 6) {
    if (i > 0) await sleep(800);
    const batch = await Promise.all(items.slice(i, i + 6).map((item) => blog(item.keyword)));
    batch.forEach((payload, at) => {
      const item = items[i + at];
      item.searchVolume = volumes.get(item.keyword.replace(/\s+/g, '')) ?? null;
      if (payload) {
        item.documentCount = Number(payload.total || 0);
        item.serpTop = titleExactness((payload.items || []).map((row) => row.title), item.keyword);
      } else {
        item.documentCount = null;
        item.serpTop = null;
      }
    });
  }
  return items;
}

/** 판정 그룹 — 쿠팡 레인과 같다. 포화(정면 6+)는 내보내지 않는다. */
const verdictGroup = (item) => {
  if (!item.serpTop || !item.serpTop.sampled) return 3;
  if (item.serpTop.exact <= 2) return 0;
  if (item.serpTop.exact <= 5) return 1;
  return 2;
};

async function main() {
  const limit = Number(arg('limit', '24'));
  const { EnvironmentManager } = require('../src/utils/environment-manager');
  const manager = EnvironmentManager.getInstance ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const creds = manager.getConfig();

  const sites = { toss: { label: '토스쇼핑 쉐어링크', items: parseToss() },
    brandconnect: { label: '네이버 브랜드커넥트', items: parseBrandConnect() } };

  for (const [id, site] of Object.entries(sites)) {
    const seen = new Set();
    const prepared = [];
    for (const item of site.items) {
      const keyword = productKeyword(item.name);
      const key = keyword.replace(/\s+/g, '');
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      prepared.push({ ...item, keyword });
      if (prepared.length >= limit) break;
    }
    console.log(`■ ${site.label} — 원문 ${site.items.length}건 → 분석 대상 ${prepared.length}건`);
    site.items = await analyze(prepared, creds);

    const before = site.items.length;
    site.items = site.items
      .filter((item) => verdictGroup(item) !== 2)
      .sort((a, b) => {
        const va = verdictGroup(a);
        const vb = verdictGroup(b);
        if (va !== vb) return va - vb;
        return (b.searchVolume || 0) - (a.searchVolume || 0);
      });
    const green = site.items.filter((item) => verdictGroup(item) === 0).length;
    console.log(`  → 포화 ${before - site.items.length}건 제외 · 남은 ${site.items.length}건(자리 있음 ${green})`);
    site.items.slice(0, 3).forEach((item) => console.log(`    · ${item.keyword} | sv ${item.searchVolume ?? '—'} · dc ${item.documentCount ?? '—'} · 정면 ${item.serpTop ? item.serpTop.exact : '—'} | ${item.reward}`));
  }

  const payload = { collectedAt: new Date().toISOString(), sites };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n스냅샷 → ${OUT_PATH}`);
}

main().catch((error) => { console.error('실패:', error.message); process.exit(1); });
