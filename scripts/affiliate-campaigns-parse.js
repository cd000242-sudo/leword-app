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
        /*
         * 상품 주소를 만들지 않는다(2026-08-20). 응답에 주소가 없어서
         * shopping.toss.im/product/{id} 를 조립했는데 그 호스트는 어떤 경로든
         * 403 AccessDenied 였다(사장님 실측 + 5가지 모양 전수 확인). 토스 쇼핑은
         * 공개 상품 페이지가 없다 — 빈 주소로 두면 화면이 콘솔+이름복사로 안내한다.
         */
        const productId = view.productId || entry.productId;
        items.push({
          name: String(view.displayName),
          brand: String(entry.categoryName || ''),
          image: String(view.thumbnailUrl || ''),
          url: '',
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
  // NAVER API HUB 대응: env 또는 앱 설정(config.json)에 HUB 키가 있으면 새 게이트웨이로.
  // 로컬 실행은 env 가 아니라 앱 설정에 키가 있다 — 둘 다 본다.
  const hubKeyId = (process.env.NAVER_APIHUB_KEY_ID || creds.naverApiHubKeyId || '').trim();
  const hubKey = (process.env.NAVER_APIHUB_KEY || creds.naverApiHubKey || '').trim();
  const hubBase = (process.env.NAVER_APIHUB_BASE || creds.naverApiHubBase || 'https://naverapihub.apigw.ntruss.com').trim();
  const useHub = hubKeyId && hubKey;
  console.log(`실측 경로: ${useHub ? 'NAVER API HUB (' + hubBase + ')' : '개발자센터 legacy'}`);
  const blog = (keyword) => new Promise((resolve) => {
    const blogUrl = useHub
      ? `${hubBase}/search/v1/blog?query=${encodeURIComponent(keyword)}&display=10`
      : `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=10`;
    const blogHeaders = useHub
      ? { 'X-NCP-APIGW-API-KEY-ID': hubKeyId, 'X-NCP-APIGW-API-KEY': hubKey }
      : { 'X-Naver-Client-Id': creds.naverClientId, 'X-Naver-Client-Secret': creds.naverClientSecret };
    https.get(blogUrl, {
      headers: blogHeaders,
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

/**
 * 니즈 검색어 실측 부착 — 상품명 검색어(sv 0~140)로는 유입이 없다.
 * 후보(need-keywords.ts 도출)를 검색광고로 실측해 최고 수요 하나를 고르고,
 * 수수료율이 있는 레인은 건당 수익(가격×요율 단순 산술)을 함께 싣는다.
 */
async function attachNeedKeywords(items, creds) {
  const { deriveNeedKeywordCandidates, pickNeedKeyword, perSaleCommission } = require('../src/utils/need-keywords');
  const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
  const searchAd = {
    accessLicense: creds.naverSearchAdAccessLicense,
    secretKey: creds.naverSearchAdSecretKey,
    customerId: creds.naverSearchAdCustomerId,
  };

  /** 니즈 후보의 블로그 문서수. 위 상품명 실측과 같은 경로(HUB → legacy)를 쓴다. */
  const hubKeyId = (process.env.NAVER_APIHUB_KEY_ID || creds.naverApiHubKeyId || '').trim();
  const hubKey = (process.env.NAVER_APIHUB_KEY || creds.naverApiHubKey || '').trim();
  const hubBase = (process.env.NAVER_APIHUB_BASE || creds.naverApiHubBase || 'https://naverapihub.apigw.ntruss.com').trim();
  const useHub = Boolean(hubKeyId && hubKey);
  const fetchNeedDocumentCount = (keyword) => new Promise((resolve) => {
    const url = useHub
      ? `${hubBase}/search/v1/blog?query=${encodeURIComponent(keyword)}&display=1`
      : `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`;
    const headers = useHub
      ? { 'X-NCP-APIGW-API-KEY-ID': hubKeyId, 'X-NCP-APIGW-API-KEY': hubKey }
      : { 'X-Naver-Client-Id': creds.naverClientId, 'X-Naver-Client-Secret': creds.naverClientSecret };
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const total = res.statusCode === 200 ? Number(JSON.parse(data).total) : NaN;
          resolve(Number.isFinite(total) ? total : null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });

  const candidatesByItem = items.map((item) => deriveNeedKeywordCandidates(item.name, item.brand));
  const uniq = [...new Set(candidatesByItem.flat().map((k) => k.trim()).filter(Boolean))];
  const volumes = new Map();
  for (let i = 0; i < uniq.length; i += 5) {
    try {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, uniq.slice(i, i + 5));
      for (const row of rows || []) {
        const total = (row.pcSearchVolume || 0) + (row.mobileSearchVolume || 0);
        if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    } catch (error) {
      console.log(`  !! 니즈 실측 실패(${i / 5 + 1}번째 묶음) — ${String(error.message).slice(0, 60)}`);
    }
    await sleep(300);
  }

  /*
   * 니즈 후보의 **문서수**도 잰다(사장님 지적 2026-08-20). 검색량만 보면
   * "찾는 사람 많은데 글이 이미 넘치는" 걸 1등에 올린다 — 노출이 안 되면
   * 수수료가 몇 %든 의미가 없다. 수요 하한을 넘은 후보만 재서 호출을 아낀다.
   */
  const docs = new Map();
  const worthMeasuring = [...new Set(
    uniq.filter((keyword) => (volumes.get(keyword.replace(/\s+/g, '')) || 0) > 0),
  )];
  for (const keyword of worthMeasuring) {
    docs.set(keyword.replace(/\s+/g, ''), await fetchNeedDocumentCount(keyword));
    await sleep(150);
  }

  return items.map((item, index) => {
    // 의도 우선 · 자리 필수 — 최고 수요가 아니라 "쓸 수 있는 것 중 의도가 깊은" 후보.
    const best = pickNeedKeyword(
      candidatesByItem[index],
      (candidate) => volumes.get(candidate.replace(/\s+/g, '')),
      300,
      (candidate) => docs.get(candidate.replace(/\s+/g, '')),
    );
    return {
      ...item,
      needKeyword: best ? best.keyword : null,
      needVolume: best ? best.volume : null,
      // 실측 문서수와 비율. 못 쟀으면 null 이다 — 자리 있음으로 치지 않는다.
      needDocs: best ? best.docs : null,
      needRatio: best ? best.ratio : null,
      perSaleWon: perSaleCommission(item.price, item.reward),
    };
  });
}

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
    site.items = await attachNeedKeywords(site.items, creds);

    const before = site.items.length;
    /*
     * 정렬 교체(2026-08-19): 상품명 검색어의 자리 순 → **니즈 수요 순**.
     * 실측 근거 — 상품명 검색어 sv 는 0~140 이라 1위여도 유입이 없다. 성과는
     * 니즈 검색어(드리미 로봇청소기 24,940 등)로 들어가 상품을 답으로 팔 때
     * 난다. 자리 판정은 배지로 남는다. 포화(정면 6+) 제외는 유지 — 상품명조차
     * 포화면 레드오션 신호다.
     */
    /*
     * 정렬 교체(2026-08-20): 니즈 수요 순 → **노출 가능성 순**.
     * "노출이 돼야 뭐가 팔리든 말든 하니까"(사장님). 자리가 있는 것을 먼저,
     * 그 안에서 건당 수익, 그 다음 수요. 비율을 못 잰 것은 뒤로 민다 —
     * 안 잰 것을 자리 있는 것처럼 앞에 두면 그게 거짓말이다.
     */
    /*
     * 두 단짜리 정렬이다. 합성 점수를 만들지 않는다 — 실측 두 개를 순서대로 쓴다.
     *   ① 자리가 있나(비율 1 이상) — 노출이 안 되면 수수료가 몇 %든 의미가 없다
     *   ② 그 안에서 검색량 큰 순 — "노출은 되는데 검색량이 없으면 노출돼도
     *      의미가 있나"(사장님 2026-08-20). 맞는 말이다. 비율만으로 줄 세우면
     *      월 1,140 짜리가 1등이 된다.
     * 자리 없는 것들도 같은 규칙으로 뒤에 붙는다 — 지우지는 않는다.
     */
    /*
     * 토스 — 사장님이 콘솔에서 발급해 둔 링크(toss-sync-issued.js 결과)를 병합한다.
     * 이름이 같으면 그 상품의 url 이 되고(→ 화면의 [제휴링크 복사]), 목록에 없는
     * 발급본은 행으로 추가한다. 발급 자동화는 접었다 — 링크 관리에 삭제가 없어
     * 되돌릴 수 없는 동작이라서다(2026-08-20).
     */
    if (id === 'toss') {
      try {
        const issuedPath = path.join(__dirname, '..', 'tmp', 'toss-issued-links.json');
        const issued = JSON.parse(fs.readFileSync(issuedPath, 'utf8')).pairs || [];
        const norm = (v) => String(v || '').replace(/\s+/g, '');
        let linked = 0;
        for (const item of site.items) {
          const hit = issued.find((p) => norm(p.name) === norm(item.name));
          if (hit) { item.url = hit.link; linked += 1; }
        }
        const have = new Set(site.items.map((i) => norm(i.name)));
        for (const p of issued) {
          if (have.has(norm(p.name))) continue;
          site.items.push({
            name: p.name, url: p.link, price: p.price ?? null,
            reward: p.commissionRate ? `수수료 ${p.commissionRate}%` : '수수료 10%',
            image: '', keyword: '', issuedOnly: true,
          });
        }
        console.log(`  발급 링크 병합: 연결 ${linked} · 추가 ${issued.length - linked}`);
      } catch { /* 동기화 파일이 없으면 그냥 지나간다 */ }
    }

    const hasSlot = (item) => typeof item.needRatio === 'number' && item.needRatio >= 1;
    site.items = site.items
      .filter((item) => verdictGroup(item) !== 2)
      .sort((a, b) => (Number(hasSlot(b)) - Number(hasSlot(a)))
        || (b.needVolume || 0) - (a.needVolume || 0)
        || (b.perSaleWon || 0) - (a.perSaleWon || 0));
    const green = site.items.filter((item) => verdictGroup(item) === 0).length;
    const withNeed = site.items.filter((item) => item.needVolume).length;
    console.log(`  → 포화 ${before - site.items.length}건 제외 · 남은 ${site.items.length}건(자리 있음 ${green} · 니즈 실측 ${withNeed})`);
    site.items.slice(0, 3).forEach((item) => console.log(
      `    · ${item.keyword} | 니즈 ${item.needKeyword ?? '—'}(${item.needVolume ? item.needVolume.toLocaleString('ko-KR') : '—'})`
      + `${item.perSaleWon ? ` · 건당 ${item.perSaleWon.toLocaleString('ko-KR')}원` : ''} | sv ${item.searchVolume ?? '—'} · dc ${item.documentCount ?? '—'}`,
    ));
  }

  const payload = { collectedAt: new Date().toISOString(), sites };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n스냅샷 → ${OUT_PATH}`);
}

main().catch((error) => { console.error('실패:', error.message); process.exit(1); });
