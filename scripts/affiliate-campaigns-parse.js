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
const { currentCaptureFiles, mergeCampaignSnapshots } = require('./affiliate-snapshot');
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
const captureManifest = readJson(path.join(__dirname, '..', 'tmp', 'affiliate-campaigns.json'));
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
  const out = [];
  for (const file of currentCaptureFiles(captureManifest, site)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(DUMP_DIR, file), 'utf8'));
      if (parsed.runId === captureManifest.runId && parsed.status >= 200 && parsed.status < 300
          && urlPattern.test(parsed.url)) out.push(parsed);
    } catch { /* 깨진 덤프는 건너뛴다 */ }
  }
  return out;
}

function parseToss() {
  /*
   * 1순위: 상품 조회 목록(products) — 카드마다 [링크 발급] 버튼이 있는,
   * 실제로 발급 가능한 상품들이다. linkIssueAvailability 로 한 번 더 거른다.
   * 2순위(폴백): 옛 홈 큐레이션(curation-sections) — 상품 조회를 못 받았을 때만.
   */
  const fromProducts = [];
  for (const dump of readDump('toss', /sharelink\/products\?/)) {
    const entries = (dump.body && dump.body.success && dump.body.success.items) || [];
    for (const entry of entries) {
      const view = entry && entry.taca && entry.taca.productView;
      if (!view || !view.displayName) continue;
      // 발급이 막힌 상품은 싣지 않는다 — 보여줘 놓고 발급 안 되면 그게 고장이다.
      if (entry.linkIssueAvailability && entry.linkIssueAvailability.available === false) continue;
      fromProducts.push({
        name: String(view.displayName),
        brand: String(entry.categoryName || ''),
        image: String(view.thumbnailUrl || ''),
        url: '',
        reward: view.discountRate ? `${view.discountRate}% 할인` : '',
        price: Number(view.displayPrice || 0) || null,
        /** 콘솔 상품 조회 화면에 이 이름 그대로 있다 — 찾아서 [링크 발급]. */
        inConsoleList: true,
      });
    }
  }
  const items = [];
  for (const dump of readDump('toss', /curation-sections/)) {
    const sections = (dump.body && dump.body.success && dump.body.success.sections) || [];
    for (const section of sections) {
      // 콘솔 홈의 구획 제목 — "이 상품이 콘솔 어디에 떠 있는가"의 실측 주소다.
      const sectionName = String(section.displayName || '').slice(0, 40);
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
          /*
           * 발급은 콘솔 홈에서 된다(실측: 카드 클릭 → 모달 → 발급 버튼,
           * toss-issue-links.js 가 이 길로 실제 발급함). 상품 딥링크는 없지만
           * 구획 제목+순위가 있으면 홈에서 눈으로 바로 찾는다.
           */
          consoleSection: sectionName,
          consoleRank: Number(entry.rank || 0) || null,
        });
      }
    }
  }

  /*
   * 두 소스를 합친다 — 상품 조회(발급하러 갈 화면)를 앞에, 홈 큐레이션을 뒤에.
   * 큐레이션 쪽을 버리면 **이미 발급해 둔 상품**이 목록에서 사라진다(실측:
   * 발급 9건이 전부 큐레이션 상품이라 상품 조회 목록과 1건만 겹쳤다).
   * 이름이 겹치면 앞엣것(상품 조회)을 남긴다 — 그쪽이 발급 가능한 판이다.
   */
  const seen = new Set(fromProducts.map((item) => item.name));
  return [...fromProducts, ...items.filter((item) => !seen.has(item.name))];
}

function parseBrandConnect() {
  const items = [];
  for (const dump of readDump('brandconnect', /\/affiliate-products\/|\/affiliate-events\/[^/]+\/products\//)) {
    const rows = Array.isArray(dump.body) ? dump.body : dump.body?.data;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !row.productName || row.enabled === false) continue;
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
  const { measuredSearchVolume } = await import('./affiliate-recommendation.mjs');
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
        const total = measuredSearchVolume(row);
        if (total !== null) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
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
    }).setTimeout(12000, function () { this.destroy(); }).on('error', () => resolve(null));
  });

  for (let i = 0; i < items.length; i += 6) {
    if (i > 0) await sleep(800);
    const batch = await Promise.all(items.slice(i, i + 6).map((item) => blog(item.keyword)));
    batch.forEach((payload, at) => {
      const item = items[i + at];
      item.searchVolume = volumes.get(item.keyword.replace(/\s+/g, '')) ?? null;
      if (payload && typeof payload.total === 'number' && Number.isFinite(payload.total) && payload.total >= 0 && Array.isArray(payload.items)) {
        item.documentCount = payload.total;
        item.serpTop = titleExactness((payload.items || []).map((row) => row.title), item.keyword);
      } else {
        item.documentCount = null;
        item.serpTop = null;
      }
      item.keywordEvidence = [{ query: item.keyword, serpQuery: item.keyword, monthlySearches: item.searchVolume,
        documentCount: item.documentCount, serpTop: item.serpTop, measuredAt: new Date().toISOString(), source: 'naver-searchad+blog-search' }];
    });
  }

  /*
   * 쇼핑 클릭 실측(2026-08-23) — "이 말이 쇼핑에서 실제로 클릭되는가".
   *
   * 사장님 지시: 유튜브 글감뿐 아니라 제휴에도 같은 판정을 걸어야 한다.
   * 검색량·문서수만으로는 '사는 말'과 '읽는 말'이 안 갈린다 — 실업급여 조건은
   * 검색량이 커도 팔 물건이 아니다. 쇼핑인사이트는 그 둘을 갈라 준다
   * (실측: 나연 혀클리너·다이슨 에어랩 → 있음 / 실업급여 조건·청년내일저축계좌 → 없음).
   * 상품 수는 여전히 못 잰다(쇼핑 검색 API 종료). 있다/없다만 싣는다.
   * 키가 없으면 undefined 로 남는다 — '없음'과 구분해야 오판이 안 생긴다.
   */
  // 위에서 이미 고른 HUB 자격증명을 그대로 쓴다(환경변수 + 설정 폴백).
  if (useHub) {
    try {
      const { probeShoppingClicks } = await import('./shopping-insight.mjs');
      for (const item of items) {
        const hit = await probeShoppingClicks(item.keyword, hubKeyId, hubKey);
        item.shoppingClicked = hit === undefined ? null : Boolean(hit);
        if (hit) item.shoppingCategory = hit.category;
      }
    } catch (error) {
      // 이 신호가 없다고 제휴 회차를 죽이지 않는다 — 나머지 실측은 그대로 쓴다.
      console.warn('[제휴] 쇼핑 클릭 실측 건너뜀:', String((error && error.message) || error).slice(0, 90));
    }
  }
  return items;
}

/**
 * 니즈 검색어 실측 부착 — 상품명 검색어(sv 0~140)로는 유입이 없다.
 * 후보(need-keywords.ts 도출)를 검색광고로 실측해 최고 수요 하나를 고르고,
 * 수수료율이 있는 레인은 건당 수익(가격×요율 단순 산술)을 함께 싣는다.
 */
async function attachNeedKeywords(items, creds) {
  const { deriveNeedKeywordCandidates, perSaleCommission } = require('../src/utils/need-keywords');
  const { measuredSearchVolume, selectAffiliateCandidate } = await import('./affiliate-recommendation.mjs');
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
  const fetchNeedSerp = (keyword) => new Promise((resolve) => {
    const url = useHub
      ? `${hubBase}/search/v1/blog?query=${encodeURIComponent(keyword)}&display=10`
      : `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=10`;
    const headers = useHub
      ? { 'X-NCP-APIGW-API-KEY-ID': hubKeyId, 'X-NCP-APIGW-API-KEY': hubKey }
      : { 'X-Naver-Client-Id': creds.naverClientId, 'X-Naver-Client-Secret': creds.naverClientSecret };
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const payload = res.statusCode === 200 ? JSON.parse(data) : null;
          resolve(payload && typeof payload.total === 'number' && Number.isFinite(payload.total) && payload.total >= 0 && Array.isArray(payload.items)
            ? { documentCount: payload.total, serpTop: titleExactness(payload.items.map((row) => row.title), keyword) } : null);
        } catch { resolve(null); }
      });
    }).setTimeout(12000, function () { this.destroy(); }).on('error', () => resolve(null));
  });

  const candidatesByItem = items.map((item) => deriveNeedKeywordCandidates(item.name, item.brand).slice(0, 5));
  const uniq = [...new Set(candidatesByItem.flat().map((k) => k.trim()).filter(Boolean))];
  const volumes = new Map();
  for (let i = 0; i < uniq.length; i += 5) {
    try {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, uniq.slice(i, i + 5));
      for (const row of rows || []) {
        const total = measuredSearchVolume(row);
        if (total !== null) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
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
    docs.set(keyword.replace(/\s+/g, ''), await fetchNeedSerp(keyword));
    await sleep(150);
  }

  const withNeed = items.map((item, index) => {
    const keywordEvidence = candidatesByItem[index].map((query) => {
      const key = query.replace(/\s+/g, '');
      const serp = docs.get(key);
      return { query, serpQuery: query, monthlySearches: volumes.get(key) ?? null, documentCount: serp?.documentCount ?? null,
        serpTop: serp?.serpTop ?? null, measuredAt: new Date().toISOString(), source: 'naver-searchad+blog-search' };
    });
    const best = selectAffiliateCandidate({ ...item, keywordEvidence }, { collectedAt: item.collectedAt });
    return {
      ...item,
      keywordEvidence: [...(item.keywordEvidence || []), ...keywordEvidence],
      needKeyword: best ? best.query : null,
      needVolume: best ? best.monthlySearches : null,
      // 실측 문서수와 비율. 못 쟀으면 null 이다 — 자리 있음으로 치지 않는다.
      needDocs: best ? best.documentCount : null,
      needSerpTop: best ? best.serpTop : null,
      needRatio: best && best.monthlySearches !== null && best.documentCount !== null ? best.monthlySearches / Math.max(1, best.documentCount) : null,
      perSaleWon: perSaleCommission(item.price, item.reward),
    };
  });

  return attachWritableSlots(withNeed, {
    candidatesByItem,
    searchAd,
    getNaverSearchAdKeywordVolume,
    fetchNeedSerp,
  });
}

/**
 * 쓸 수 있는 자리(롱테일) 발굴 — 사장님 지적 2026-08-22:
 * "노출 어려움으로만 도배돼 있으면 노출된 걸 알려줘야 황금 제품 키워드 아니냐".
 *
 * 왜 전부 '노출 어려움'이었나: 니즈 후보가 전부 **브랜드+카테고리**(= 헤드)다.
 * 실측 6건 전부 검색량 < 문서수 —
 *   드리미 로봇청소기 24,940 / 44,301 · 한일 분쇄기 830 / 11,455
 * 브랜드 이름에는 이미 그 브랜드 글이 쌓여 있으니 당연한 결과다.
 * 제품을 바꿔 봐야 소용없다(브랜드커넥트 캠페인은 6건이 전부).
 * 바꿀 것은 **키워드**다.
 *
 * 그래서 자동완성이 인정한 실제 롱테일을 뻗어 검색량·문서수를 재고,
 * 검색량 ≥ 문서수(비율 1 이상)인 자리만 싣는다. 우리가 조합해 만들지 않는다 —
 * 지어낸 말은 아무도 안 친다.
 */
async function attachWritableSlots(items, deps) {
  const { candidatesByItem, searchAd, getNaverSearchAdKeywordVolume, fetchNeedSerp } = deps;
  const { measuredSearchVolume, assessAffiliateRecommendation, AFFILIATE_MIN_DEMAND } = await import('./affiliate-recommendation.mjs');
  /** 롱테일은 원래 작다 — 헤드와 같은 하한(300)을 걸면 전멸한다. */
  const SLOT_MIN_VOLUME = Math.max(AFFILIATE_MIN_DEMAND, Number(process.env.AFF_SLOT_MIN_VOLUME || AFFILIATE_MIN_DEMAND));
  const SLOT_PER_ITEM = 3;
  /** 손으로 도는 스크립트라 예산을 못 박는다 — 자리 없는 상품부터 본다. */
  const requestedSlots = Number(process.env.AFF_SLOT_MAX_ITEMS || 30);
  const SLOT_MAX_ITEMS = Number.isFinite(requestedSlots) ? Math.min(30, Math.max(0, Math.floor(requestedSlots))) : 30;

  const needsSlot = (item) => !(typeof item.needRatio === 'number' && item.needRatio >= 1);
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => needsSlot(item))
    .slice(0, SLOT_MAX_ITEMS);
  if (targets.length === 0) return items;
  console.log(`\n자리 발굴 — 니즈가 막힌 상품 ${targets.length}건 (전체 ${items.length}건 중)`);

  // ① 자동완성으로 롱테일을 뻗는다. 씨앗은 이미 뽑아 둔 니즈 후보(브랜드·카테고리).
  const seedsByIndex = new Map();
  const allCandidates = new Set();
  for (const { item, index } of targets) {
    const seeds = [...new Set([
      item.needKeyword,
      ...(candidatesByItem[index] || []).slice(0, 5),
    ].filter(Boolean))].slice(0, 5);
    const found = new Set();
    for (const seed of seeds) {
      for (const suggestion of await fetchNaverSuggestions(seed)) {
        /*
         * 씨앗으로 **시작**해야 한다(실측 2026-08-22). 포함만 보면 자동완성이
         * 남의 브랜드를 물어 온다 — "빗고데기"를 물었더니 'jmw 빗고데기',
         * '뉴메이슨 빗고데기'가 왔다. 슈틸루스터 제품을 파는데 경쟁사 키워드로
         * 글을 쓰라는 셈이라 자리가 아니라 오답이다.
         * 경계까지 본다: 씨앗 다음이 공백이거나 끝일 때만 같은 말로 친다.
         */
        if (!suggestion.startsWith(seed)) continue;
        const next = suggestion.charAt(seed.length);
        if (next !== ' ') continue;
        if (suggestion.length > 25) continue;
        found.add(suggestion);
      }
      await sleep(120);
    }
    const bounded = [...found].slice(0, 12);
    seedsByIndex.set(index, bounded);
    for (const keyword of bounded) allCandidates.add(keyword);
  }
  const pool = [...allCandidates];
  console.log(`  자동완성이 인정한 롱테일 ${pool.length}개 실측 시작`);
  if (pool.length === 0) return items;

  // ② 검색량 — 검색광고는 한 번에 5개
  const slotVolumes = new Map();
  for (let i = 0; i < pool.length; i += 5) {
    try {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, pool.slice(i, i + 5));
      for (const row of rows || []) {
        const total = measuredSearchVolume(row);
        if (total !== null) slotVolumes.set(String(row.keyword).replace(/\s+/g, ''), total);
      }
    } catch (error) {
      console.log(`  !! 자리 검색량 실패(${Math.floor(i / 5) + 1}번째 묶음) — ${String(error.message).slice(0, 60)}`);
    }
    await sleep(300);
  }

  // ③ 수요 하한을 넘은 것만 문서수를 잰다 — 문서수 조회가 더 비싸다
  const slotDocs = new Map();
  const worth = pool.filter((k) => (slotVolumes.get(k.replace(/\s+/g, '')) || 0) >= SLOT_MIN_VOLUME);
  for (const keyword of worth) {
    slotDocs.set(keyword.replace(/\s+/g, ''), await fetchNeedSerp(keyword));
    await sleep(150);
  }
  console.log(`  수요 ${SLOT_MIN_VOLUME}+ ${worth.length}개 문서수 실측 완료`);

  const bySlot = new Map();
  for (const { index } of targets) {
    const rows = (seedsByIndex.get(index) || []).map((keyword) => {
      const key = keyword.replace(/\s+/g, '');
      const volume = slotVolumes.get(key) ?? null;
      const serp = slotDocs.get(key);
      const documentCount = serp?.documentCount ?? null;
      if (volume === null || volume < SLOT_MIN_VOLUME || documentCount === null) return null;
      const ratio = volume / Math.max(1, documentCount);
      const evidence = { query: keyword, serpQuery: keyword, monthlySearches: volume, documentCount, serpTop: serp.serpTop,
        measuredAt: new Date().toISOString(), source: 'naver-searchad+blog-search' };
      if (assessAffiliateRecommendation({ ...items[index], keywordEvidence: [evidence] }).status !== 'ready') return null;
      return { keyword, volume, documentCount, ratio, evidence };
    }).filter(Boolean)
      // 자리가 넓은 순 — 검색량 대비 글이 적을수록 앞이다.
      .filter((row) => row.ratio >= 1)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, SLOT_PER_ITEM);
    if (rows.length > 0) bySlot.set(index, rows);
  }
  const opened = [...bySlot.values()].reduce((sum, rows) => sum + rows.length, 0);
  console.log(`  자리 찾음 — 상품 ${bySlot.size}건에 키워드 ${opened}개`);

  return items.map((item, index) => (bySlot.has(index) ? { ...item, slots: bySlot.get(index),
    keywordEvidence: [...(item.keywordEvidence || []), ...bySlot.get(index).map((row) => row.evidence)] } : item));
}

/**
 * 네이버 자동완성 — 사람이 실제로 치는 말인지의 유일한 무료 판정기.
 * 실패하면 빈 배열이다. 못 받아 온 것을 지어내지 않는다.
 */
function fetchNaverSuggestions(query) {
  const url = 'https://ac.search.naver.com/nx/ac'
    + `?q=${encodeURIComponent(query)}&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&frm=nv&q_enc=UTF-8`;
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://search.naver.com/' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const groups = Array.isArray(parsed.items) ? parsed.items : [];
          const out = [];
          for (const group of groups) {
            for (const row of Array.isArray(group) ? group : []) {
              const text = Array.isArray(row) ? String(row[0] || '') : String(row || '');
              if (text.trim()) out.push(text.trim());
            }
          }
          resolve([...new Set(out)]);
        } catch { resolve([]); }
      });
    }).setTimeout(12000, function () { this.destroy(); }).on('error', () => resolve([]));
  });
}

async function main() {
  const { assessAffiliateRecommendation, compareAffiliateRecommendations } = await import('./affiliate-recommendation.mjs');
  const limit = Number(arg('limit', '24'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 160) throw new Error('limit은 1~160 사이 정수여야 합니다.');
  const { EnvironmentManager } = require('../src/utils/environment-manager');
  const manager = EnvironmentManager.getInstance ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const creds = manager.getConfig();

  const sites = { toss: { label: '토스쇼핑 쉐어링크', items: parseToss() },
    brandconnect: { label: '네이버 브랜드커넥트', items: parseBrandConnect() } };
  const selected = arg('sites', 'toss,brandconnect').split(',');
  if (selected.some((id) => !Object.hasOwn(sites, id))) throw new Error('알 수 없는 제휴 플랫폼');
  for (const id of Object.keys(sites)) if (!selected.includes(id)) delete sites[id];

  for (const [id, site] of Object.entries(sites)) {
    const capture = captureManifest?.sites?.[id];
    site.collectedAt = capture?.collectedAt || null;
    site.status = capture?.maybeLoggedOut ? 'login-required' : 'collection-failed';
    if (site.items.length === 0) {
      console.log(`■ ${site.label} — 이번 수집의 상품 응답 없음. 기존 목록/수집 시각 유지`);
      continue;
    }
    site.status = 'ready';
    const seen = new Set();
    const prepared = [];
    for (const item of site.items) {
      const keyword = productKeyword(item.name);
      const key = keyword.replace(/\s+/g, '');
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      prepared.push({ ...item, keyword, collectedAt: site.collectedAt });
      if (prepared.length >= limit) break;
    }
    console.log(`■ ${site.label} — 원문 ${site.items.length}건 → 분석 대상 ${prepared.length}건`);
    site.items = await analyze(prepared, creds);
    site.items = await attachNeedKeywords(site.items, creds);

    /*
     * 토스 — 사장님이 콘솔에서 발급해 둔 링크(toss-sync-issued.js 결과)를 병합한다.
     * 이름이 같으면 그 상품의 url 이 되고(→ 화면의 [제휴링크 복사]), 목록에 없는
     * 발급본은 관리용 행으로 추가하되, 실측 없이는 추천하지 않는다.
     * 발급 자동화는 접었다 — 링크 관리에 삭제가 없어
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
            reward: p.commissionRate ? `수수료 ${p.commissionRate}%` : '',
            image: '', keyword: '', issuedOnly: true,
          });
        }
        console.log(`  발급 링크 병합: 연결 ${linked} · 추가 ${issued.length - linked}`);
      } catch { /* 동기화 파일이 없으면 그냥 지나간다 */ }
    }
    // Keep observations and issued links, but separate them from evidence-passed writing candidates.
    site.items = site.items.map((item) => ({ ...item,
      recommendation: assessAffiliateRecommendation(item, { collectedAt: site.collectedAt }),
    })).sort(compareAffiliateRecommendations);
    const counts = { ready: 0, research: 0, excluded: 0 };
    site.items.forEach((item) => { counts[item.recommendation.status] += 1; });
    console.log(`  → 근거 통과 ${counts.ready} · 관찰 ${counts.research} · 추천 제외 ${counts.excluded}`);

    /*
     * 공식 제품 본문 근거가 있는 상품만 AI 제목을 만든다. 상품명·가격이나
     * 검색량으로 제품 성능/체험을 추론하지 않는다. 실패하면 제목 없이 발행한다.
     */
    if (!process.argv.includes('--noAi')) {
      try {
        const { attachAiTitles } = require('./affiliate-ai-titles');
        const enriched = await attachAiTitles(site.items, { label: site.label });
        site.items = enriched.items;
        console.log(`  → AI 제목 ${enriched.attached}건 부착`);
      } catch (error) {
        console.log(`  !! AI 제목 단계 실패(미확인 제목 제외): ${String(error.message || error).slice(0, 80)}`);
      }
    }
    site.items.slice(0, 3).forEach((item) => console.log(
      `    · ${item.keyword} | 니즈 ${item.needKeyword ?? '—'}(${item.needVolume ? item.needVolume.toLocaleString('ko-KR') : '—'})`
      + `${item.perSaleWon ? ` · 건당 ${item.perSaleWon.toLocaleString('ko-KR')}원` : ''} | sv ${item.searchVolume ?? '—'} · dc ${item.documentCount ?? '—'}`,
    ));
  }

  const previous = readJson(arg('previous', OUT_PATH));
  const payload = mergeCampaignSnapshots(previous, sites, new Date().toISOString());
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n스냅샷 → ${OUT_PATH}`);
}

main().catch((error) => { console.error('실패:', error.message); process.exit(1); });
