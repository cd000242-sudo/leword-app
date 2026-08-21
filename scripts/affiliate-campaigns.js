#!/usr/bin/env node
/**
 * 토스 쉐어링크 · 네이버 브랜드커넥트 — 로그인 뒤에 있는 캠페인 목록을 받아온다.
 *
 * 사장님 지시: "그들의 상품을 받아올 방법을 찾아서 보여줘야지. 로그인이 필요하면
 * 로그인을 하고."
 *
 * 방식 — 세션 영속:
 *   두 플랫폼 다 자동 로그인이 막혀 있다(토스=휴대폰 앱 인증, 네이버=캡차·기기확인).
 *   비밀번호를 저장하는 대신 **브라우저 프로필**(tmp/affiliate-profile)에 로그인
 *   세션을 남긴다. 최초 1회만 사람이 로그인하면, 이후 실행은 그 쿠키로 돈다.
 *   비밀번호는 어디에도 저장되지 않는다.
 *
 * 사용:
 *   node scripts/affiliate-campaigns.js --login
 *     → 창 두 개가 열린다. 각각 로그인만 하고 터미널에서 Enter.
 *   node scripts/affiliate-campaigns.js --scrape
 *     → 세션으로 두 콘솔을 열어 캠페인 목록 XHR 응답을 전부 채집한다.
 *       tmp/affiliate-dump/ 에 원문이 남고, 목록으로 보이는 배열을 추려
 *       tmp/affiliate-campaigns.json 으로 낸다.
 *
 * 첫 --scrape 는 채집기다. 두 콘솔의 내부 API 모양은 로그인해야만 보이므로,
 * 원문을 뜬 뒤에 파서를 그 실물에 맞춘다 — 스펙을 추측으로 박지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const puppeteer = require('puppeteer');

const PROFILE_DIR = path.join(__dirname, '..', 'tmp', 'affiliate-profile');
const DUMP_DIR = path.join(__dirname, '..', 'tmp', 'affiliate-dump');
const OUT_PATH = path.join(__dirname, '..', 'tmp', 'affiliate-campaigns.json');
/** 사이트가 읽는 파일. 선점 보드와 같은 방식 — 로컬 수집 → 스냅샷 발행 → 사이트가 읽는다. */
const PUBLISH_PATH = path.join(__dirname, '..', 'tmp', 'affiliate-campaigns-public.json');

/**
 * 사이트가 보는 계약. 수집한 실물이 어떤 모양이든 이 모양으로만 내보낸다 —
 * 화면이 플랫폼 내부 필드명에 묶이면 그쪽이 바뀔 때마다 화면이 깨진다.
 *
 * collectedAt 은 반드시 싣는다. 로컬 세션으로 도는 구조라 사장님 PC 가 꺼진 날은
 * 갱신이 없다 — "언제 수집한 목록인지" 를 화면이 말해야 거짓말이 안 된다.
 */
function toPublicShape(sites) {
  return {
    collectedAt: new Date().toISOString(),
    sites: Object.fromEntries(Object.entries(sites).map(([id, site]) => [id, {
      label: site.label,
      items: (site.items || []).map((item) => ({
        name: String(item.name || '').slice(0, 120),
        brand: String(item.brand || '').slice(0, 40),
        image: String(item.image || ''),
        url: String(item.url || ''),
        reward: String(item.reward || ''),
      })).filter((item) => item.name),
    }])),
  };
}

const TARGETS = [
  /*
   * 홈이 아니라 **상품 조회** 화면이다(2026-08-21 실측).
   *
   * 홈은 큐레이션이라 거기 뜬 상품이 상품 조회 목록에 없을 때가 많다 —
   * 21건 중 1건만 겹쳤다. 그래서 "콘솔에서 발급하세요"라고 보내도 그 상품이
   * 콘솔에 없었다(사장님 실측 "그냥 홈으로 가진다니까"). 상품 조회는 카드마다
   * [링크 발급] 버튼이 달린 발급 가능 상품 117건이다 — 우리가 보여줄 목록과
   * 사장님이 발급할 목록이 같아야 한다.
   */
  { id: 'toss', label: '토스 쉐어링크', url: 'https://sharelink.toss.im/links/recommended-products' },
  {
    id: 'brandconnect', label: '네이버 브랜드커넥트',
    /*
     * 홈이 아니라 **상품 찾기 화면**으로 바로 간다(2026-08-20). 홈에서는 목록
     * API(recommend-by-display-category)가 아예 안 불려 4건 채집에 그쳤다.
     * 스페이스 ID 는 사장님 계정 것 — 정산정보 응답에서 확인된 값이다.
     */
    url: 'https://brandconnect.naver.com/876491907827712/affiliate/products',
  },
];

const hasFlag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(message, () => { rl.close(); resolve(); }));
}

async function launch() {
  return puppeteer.launch({
    // 두 플랫폼 다 headless 를 탐지한다. 로컬에 화면이 있으니 정직하게 창을 띄운다.
    headless: false,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--lang=ko-KR', '--disable-blink-features=AutomationControlled'],
  });
}

async function loginMode() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const browser = await launch();
  for (const target of TARGETS) {
    const page = await browser.newPage();
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }
  console.log('');
  console.log('열린 두 탭에서 각각 로그인하세요 (토스=휴대폰 인증, 네이버=아이디 로그인).');
  console.log('로그인 상태로 캠페인 목록이 보이면 — 브라우저 창을 그냥 닫으세요.');
  console.log('세션(쿠키)은 닫는 순간 프로필에 남습니다. 비밀번호는 저장되지 않습니다.');
  // 배경 실행에선 stdin 이 없다. 종료 신호 = ① 사용자가 창을 닫음 ② Enter(터미널 직접 실행 시).
  await Promise.race([
    new Promise((resolve) => browser.on('disconnected', resolve)),
    waitForEnter('끝났으면 Enter (또는 그냥 창을 닫으세요): ').then(() => browser.close().catch(() => {})),
  ]);
  console.log(`세션 저장됨: ${PROFILE_DIR}`);
  console.log('다음: node scripts/affiliate-campaigns.js --scrape');
}

/** 응답 JSON 에서 "목록"으로 보이는 배열을 찾는다 — 이름·이미지·가격류 키를 가진 객체 배열. */
function findListCandidates(payload, urlPath) {
  const out = [];
  const seen = new Set();
  const walk = (node, keyPath) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      const objects = node.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
      if (objects.length >= 3) {
        const keys = Object.keys(objects[0] || {});
        const nameKey = keys.find((k) => /name|title|productNm|campaign/i.test(k));
        if (nameKey) {
          out.push({ from: urlPath, path: keyPath, size: objects.length, keys: keys.slice(0, 14), sample: objects[0] });
        }
      }
      node.slice(0, 30).forEach((child, i) => walk(child, `${keyPath}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, keyPath ? `${keyPath}.${k}` : k);
  };
  walk(payload, '');
  return out;
}

async function scrapeMode() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('프로필이 없습니다. 먼저 --login 을 실행하세요.');
    process.exit(2);
  }
  fs.mkdirSync(DUMP_DIR, { recursive: true });
  const browser = await launch();
  const result = { generatedAt: new Date().toISOString(), sites: {} };

  for (const target of TARGETS) {
    const siteDump = path.join(DUMP_DIR, target.id);
    fs.mkdirSync(siteDump, { recursive: true });
    const page = await browser.newPage();
    const captured = [];
    let fileIndex = 0;

    page.on('response', async (response) => {
      try {
        const url = response.url();
        const type = String(response.headers()['content-type'] || '');
        if (!type.includes('json')) return;
        if (!/api|campaign|product|sharelink|brandconnect|list|feed/i.test(url)) return;
        const body = await response.text();
        if (!body || body.length > 3_000_000) return;
        fileIndex += 1;
        const file = path.join(siteDump, `${String(fileIndex).padStart(3, '0')}.json`);
        fs.writeFileSync(file, JSON.stringify({ url, status: response.status(), body: JSON.parse(body) }, null, 1), 'utf8');
        captured.push({ url: url.slice(0, 160), file: path.basename(file) });
      } catch { /* 한 응답 실패로 채집을 멈추지 않는다 */ }
    });

    console.log(`\n■ ${target.label} 여는 중…`);
    await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
    // 목록이 지연 로드되는 경우를 위해 두 번 스크롤하고 잠시 둔다.
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.scrollBy(0, 1200)).catch(() => {});
      await sleep(1500);
    }
    await sleep(4000);

    /*
     * 로그아웃 판정은 본문 글자가 아니라 **주소**로 한다. 로그인된 화면에도
     * "로그인" 글자는 흔해서(헤더·팝업) 매번 오탐했다 — 세션이 살아 있는데
     * "풀린 것으로 보임" 이 찍혔다(실사고 2026-08-20, 정산정보까지 온 상태).
     */
    const loggedOut = /nid\.naver\.com|business\.toss\.im\/account|\/login/.test(page.url());

    // 채집된 JSON 에서 목록 후보를 추린다.
    const candidates = [];
    for (const item of captured) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(siteDump, item.file), 'utf8'));
        candidates.push(...findListCandidates(parsed.body, parsed.url.slice(0, 120)));
      } catch { /* skip */ }
    }
    candidates.sort((a, b) => b.size - a.size);

    result.sites[target.id] = {
      label: target.label,
      capturedResponses: captured.length,
      maybeLoggedOut: Boolean(loggedOut),
      listCandidates: candidates.slice(0, 8).map(({ sample, ...rest }) => rest),
    };
    // 표본은 원문 덤프에 이미 있으므로 결과 파일에는 요약만 싣는다.
    console.log(`  JSON 응답 ${captured.length}건 채집 · 목록 후보 ${candidates.length}건`
      + (loggedOut ? ' · ⚠️ 로그인 풀린 것으로 보임' : ''));
    candidates.slice(0, 3).forEach((c) => console.log(`    후보: ${c.size}개짜리 배열 @ ${c.path} ← ${c.from}`));
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 1), 'utf8');
  console.log(`\n요약 → ${OUT_PATH}`);
  console.log(`원문 → ${DUMP_DIR}`);
  console.log('이 원문을 보고 파서를 실물에 맞춰 완성한다 — 추측으로 박지 않는다.');
}

(async () => {
  if (hasFlag('login')) return loginMode();
  if (hasFlag('scrape')) return scrapeMode();
  console.log('사용: --login (최초 1회 수동 로그인) 또는 --scrape (세션으로 목록 채집)');
})().catch((error) => { console.error('실패:', error.message); process.exit(1); });
