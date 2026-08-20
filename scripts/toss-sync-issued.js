#!/usr/bin/env node
/*
 * 토스 쉐어링크 — **이미 발급한** 링크 목록 동기화.
 *
 * 발급 자동화는 접었다(2026-08-20): 링크 관리에 삭제 버튼이 없어 발급이
 * 되돌릴 수 없는 동작이고, Open API 는 정비 중이다. 대신 사장님이 발급해 둔
 * 링크(링크 관리 목록)를 읽어 "상품명 ↔ toss.im/_m 링크" 짝을 만든다 —
 * 이 짝이 스냅샷에 실리면 사이트의 그 상품들이 [제휴링크 복사] 로 바뀐다.
 *
 * 토스 세션은 프로필에 안 남으므로(실측: 회원 API 401) 창을 띄워 로그인을
 * 기다렸다가(회원 API 200 신호) 링크 관리로 들어가 API 응답을 전부 받아 적는다.
 *
 * 실행: node scripts/toss-sync-issued.js
 * 결과: tmp/toss-issued-links.json + 원문 tmp/toss-issued-dump/
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'tmp', 'affiliate-profile');
const OUT = path.join(ROOT, 'tmp', 'toss-issued-links.json');
const DUMP = path.join(ROOT, 'tmp', 'toss-issued-dump');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(DUMP, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  let memberOk = false;
  let fileIndex = 0;
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (/sharelink\/member/.test(url) && response.status() === 200) memberOk = true;
      const type = String(response.headers()['content-type'] || '');
      if (!type.includes('json') || !/sharelink/.test(url)) return;
      const body = await response.text();
      if (!body || body.length > 3_000_000) return;
      fileIndex += 1;
      fs.writeFileSync(
        path.join(DUMP, `${String(fileIndex).padStart(3, '0')}.json`),
        JSON.stringify({ url, status: response.status(), body: JSON.parse(body) }, null, 1),
        'utf8',
      );
    } catch { /* 한 응답 실패로 멈추지 않는다 */ }
  });

  console.log('브라우저가 뜹니다 — 토스 쉐어링크에 로그인만 해 주세요. 로그인되면 자동으로 링크 관리를 읽습니다.');
  await page.goto('https://sharelink.toss.im/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  for (let waited = 0; waited < 300 && !memberOk; waited += 2) {
    await sleep(2000);
    if (waited > 0 && waited % 24 === 0) await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  if (!memberOk) {
    console.error('5분 안에 로그인이 감지되지 않았습니다 — 종료합니다.');
    await ctx.close();
    process.exit(2);
  }
  console.log('✅ 로그인 감지 — 링크 관리로 들어갑니다.');
  await sleep(2500);

  // 사이드바의 '링크 관리' — 글자로 찾는다. 목록이 길면 스크롤로 더 부른다.
  await page.click('text=링크 관리', { timeout: 15000 }).catch(async () => {
    console.log('사이드바 클릭 실패 — 주소로 시도합니다.');
    await page.goto('https://sharelink.toss.im/links', { waitUntil: 'domcontentloaded' }).catch(() => {});
  });
  await sleep(4000);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => window.scrollBy(0, 1400)).catch(() => {});
    await sleep(1200);
  }
  await sleep(2000);
  console.log(`링크 관리 화면 주소: ${page.url()}`);

  // 덤프에서 상품명↔링크 짝을 찾는다 — 이름·주소 필드는 실물에서 확인해 맞춘다.
  const pairs = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const text = JSON.stringify(node);
    const link = (text.match(/https:\/\/toss\.im\/_m\/[A-Za-z0-9]+/) || [])[0];
    const name = node.tacaName || node.productName || node.displayName || node.name || node.title; // 실물 필드는 tacaName(2026-08-20 확인)
    if (link && name && String(name).length > 3) {
      pairs.push({ name: String(name).slice(0, 120), link });
      return; // 이 덩어리에서 이미 짝을 얻었다 — 더 파고들지 않는다
    }
    Object.values(node).forEach(walk);
  };
  for (const file of fs.readdirSync(DUMP)) {
    try { walk(JSON.parse(fs.readFileSync(path.join(DUMP, file), 'utf8')).body); } catch { /* skip */ }
  }
  const seen = new Set();
  const unique = pairs.filter((p) => { if (seen.has(p.link)) return false; seen.add(p.link); return true; });

  fs.writeFileSync(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), pageUrl: page.url(), pairs: unique }, null, 1), 'utf8');
  console.log(`\n발급 링크 ${unique.length}건 확보 → ${OUT}`);
  unique.slice(0, 10).forEach((p) => console.log(`  · ${p.name.slice(0, 40)} → ${p.link}`));
  if (unique.length === 0) {
    console.log('짝을 못 찾았습니다 — 원문(tmp/toss-issued-dump)을 보고 필드명을 맞춰야 합니다.');
  }
  await ctx.close();
})();
