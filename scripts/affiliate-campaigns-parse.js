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

  const withNeed = items.map((item, index) => {
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

  return attachWritableSlots(withNeed, {
    candidatesByItem,
    searchAd,
    getNaverSearchAdKeywordVolume,
    fetchNeedDocumentCount,
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
  const { candidatesByItem, searchAd, getNaverSearchAdKeywordVolume, fetchNeedDocumentCount } = deps;
  /** 롱테일은 원래 작다 — 헤드와 같은 하한(300)을 걸면 전멸한다. */
  const SLOT_MIN_VOLUME = Number(process.env.AFF_SLOT_MIN_VOLUME || 50);
  const SLOT_PER_ITEM = 3;
  /** 손으로 도는 스크립트라 예산을 못 박는다 — 자리 없는 상품부터 본다. */
  const SLOT_MAX_ITEMS = Number(process.env.AFF_SLOT_MAX_ITEMS || 30);

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
        allCandidates.add(suggestion);
      }
      await sleep(120);
    }
    seedsByIndex.set(index, [...found].slice(0, 12));
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
        const total = (row.pcSearchVolume || 0) + (row.mobileSearchVolume || 0);
        if (total > 0) slotVolumes.set(String(row.keyword).replace(/\s+/g, ''), total);
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
    slotDocs.set(keyword.replace(/\s+/g, ''), await fetchNeedDocumentCount(keyword));
    await sleep(150);
  }
  console.log(`  수요 ${SLOT_MIN_VOLUME}+ ${worth.length}개 문서수 실측 완료`);

  const bySlot = new Map();
  for (const { index } of targets) {
    const rows = (seedsByIndex.get(index) || []).map((keyword) => {
      const key = keyword.replace(/\s+/g, '');
      const volume = slotVolumes.get(key) || 0;
      const documentCount = slotDocs.has(key) ? slotDocs.get(key) : null;
      if (volume < SLOT_MIN_VOLUME || typeof documentCount !== 'number') return null;
      const ratio = Math.round((documentCount > 0 ? volume / documentCount : volume) * 10) / 10;
      return { keyword, volume, documentCount, ratio };
    }).filter(Boolean)
      // 자리가 넓은 순 — 검색량 대비 글이 적을수록 앞이다.
      .filter((row) => row.ratio >= 1)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, SLOT_PER_ITEM);
    if (rows.length > 0) bySlot.set(index, rows);
  }
  const opened = [...bySlot.values()].reduce((sum, rows) => sum + rows.length, 0);
  console.log(`  자리 찾음 — 상품 ${bySlot.size}건에 키워드 ${opened}개`);

  return items.map((item, index) => (bySlot.has(index) ? { ...item, slots: bySlot.get(index) } : item));
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
    }).on('error', () => resolve([]));
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
    const hasSlot = (item) => typeof item.needRatio === 'number' && item.needRatio >= 1;
    site.items = site.items
      .filter((item) => verdictGroup(item) !== 2)
      .sort((a, b) => (Number(hasSlot(b)) - Number(hasSlot(a)))
        || (b.needVolume || 0) - (a.needVolume || 0)
        || (b.perSaleWon || 0) - (a.perSaleWon || 0));

    /*
     * 토스 — 사장님이 콘솔에서 발급해 둔 링크(toss-sync-issued.js 결과)를 병합한다.
     * 이름이 같으면 그 상품의 url 이 되고(→ 화면의 [제휴링크 복사]), 목록에 없는
     * 발급본은 행으로 추가한다. **포화 필터 뒤**에서 한다 — 발급해 둔 상품이 포화로
     * 걸러져 화면에서 사라졌다(실사고: 디핀다트·제육불고기). 이미 발급한
     * 상품은 어차피 미는 것이라 측정과 무관하게 보여야 한다. 발급 자동화는 접었다 — 링크 관리에 삭제가 없어
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


    const green = site.items.filter((item) => verdictGroup(item) === 0).length;
    const withNeed = site.items.filter((item) => item.needVolume).length;
    console.log(`  → 포화 ${before - site.items.length}건 제외 · 남은 ${site.items.length}건(자리 있음 ${green} · 니즈 실측 ${withNeed})`);

    /*
     * AI 제목(사장님 지시 2026-08-20: "제품 스펙과 내용을 보고 추론해서 제목
     * 방향을 정하고 생성"). 구독 CLI 추론 → 검증 통과분만 aiTitle 로 실린다.
     * 실패·미설치면 화면의 규칙 조립 제목이 폴백 — 스냅샷 발행은 막지 않는다.
     */
    if (!process.argv.includes('--noAi')) {
      try {
        const { attachAiTitles } = require('./affiliate-ai-titles');
        const enriched = await attachAiTitles(site.items, { label: site.label });
        site.items = enriched.items;
        console.log(`  → AI 제목 ${enriched.attached}건 부착`);
      } catch (error) {
        console.log(`  !! AI 제목 단계 실패(규칙 폴백 유지): ${String(error.message || error).slice(0, 80)}`);
      }
    }
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
