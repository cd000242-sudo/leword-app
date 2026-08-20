#!/usr/bin/env node
/*
 * 토스 쉐어링크 자동 발급 — 상품마다 콘솔 모달을 열어 발급 버튼을 누르고
 * 발급된 링크(toss.im/_m/…)를 잡아온다.
 *
 * 왜 헤드리스가 아닌가: 토스 세션은 프로필에 남지 않는다(실측 2026-08-20 —
 * 로그인 직후 저장한 프로필로도 회원 API 가 401). 그래서 창을 띄워 사장님이
 * 로그인하면 **회원 API 200 을 신호로** 자동으로 이어받는다.
 *
 * 실행: node scripts/toss-issue-links.js --test   (첫 상품 1건만 — 되돌릴 수 있는지 보는 용)
 *       node scripts/toss-issue-links.js          (목록 전체)
 * 결과: tmp/toss-issued-links.json  { name → link }
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'tmp', 'affiliate-profile');
const OUT = path.join(ROOT, 'tmp', 'toss-issued-links.json');
const TEST_ONLY = process.argv.includes('--test');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  let memberOk = false;
  const issued = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (/sharelink\/member/.test(url) && response.status() === 200) memberOk = true;
      // 발급 API 응답에서 짧은 링크를 건진다 — 이름은 몰라도 본문에서 찾는다.
      const type = String(response.headers()['content-type'] || '');
      if (!type.includes('json')) return;
      const body = await response.text();
      const match = body.match(/https:\/\/toss\.im\/_m\/[A-Za-z0-9]+/);
      if (match) issued.push({ api: url.slice(0, 110), link: match[0] });
    } catch { /* 한 응답 실패로 멈추지 않는다 */ }
  });

  console.log('브라우저가 뜹니다 — 토스 쉐어링크에 로그인해 주세요. 로그인되면 자동으로 이어받습니다.');
  await page.goto('https://sharelink.toss.im/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  // 로그인 신호 대기(최대 5분) — 회원 API 200 이 뜨면 로그인된 것이다.
  for (let waited = 0; waited < 300 && !memberOk; waited += 2) {
    await sleep(2000);
    if (waited % 20 === 0) {
      // SPA 가 회원 API 를 다시 안 부르면 새로고침으로 유도한다.
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  if (!memberOk) {
    console.error('5분 안에 로그인이 감지되지 않았습니다 — 종료합니다.');
    await ctx.close();
    process.exit(2);
  }
  console.log('✅ 로그인 감지 — 발급을 시작합니다.');
  await sleep(3000);

  // 상품 카드: 이미지 + 짧은 글자를 가진 클릭 가능한 덩어리.
  const cardCount = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div,li,button')]
      .filter((el) => el.querySelector('img') && el.textContent && el.textContent.length > 10 && el.textContent.length < 200);
    window.__cards = cards;
    return cards.length;
  });
  console.log(`상품 카드 ${cardCount}개 발견`);
  if (cardCount === 0) {
    console.error('카드를 못 찾았습니다 — 화면 구조가 바뀌었을 수 있습니다.');
    await ctx.close();
    process.exit(3);
  }

  const limit = TEST_ONLY ? 1 : cardCount;
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const before = issued.length;
    const name = await page.evaluate((i) => {
      const card = window.__cards[i];
      if (!card) return null;
      const text = card.textContent.replace(/\s+/g, ' ').trim();
      card.click();
      return text.slice(0, 80);
    }, index);
    if (!name) break;
    await sleep(2500);

    // 모달의 발급/복사 버튼 — 글자에 '발급'이나 '링크 복사'가 든 버튼을 누른다.
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => /발급|링크 복사|공유링크|쉐어링크 만들/.test(b.textContent || ''));
      if (button) { button.click(); return button.textContent.replace(/\s+/g, ' ').trim(); }
      return null;
    });
    await sleep(3000);
    const link = issued.length > before ? issued[issued.length - 1].link : null;
    console.log(`  [${index + 1}/${limit}] ${name.slice(0, 40)} → 버튼 "${clicked || '못 찾음'}" → ${link || '링크 못 잡음'}`);
    results.push({ name, button: clicked, link });

    // 모달 닫기(ESC) — 다음 카드를 위해.
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(1200);
  }

  fs.writeFileSync(OUT, JSON.stringify({ issuedAt: new Date().toISOString(), results }, null, 1), 'utf8');
  console.log(`\n결과 → ${OUT}`);
  console.log(TEST_ONLY ? '\n시험 1건 끝 — 콘솔의 발급 내역 화면에서 삭제 가능한지 확인해 주세요. 창은 열어 둡니다.' : '\n끝났습니다. 창을 닫아도 됩니다.');
  if (!TEST_ONLY) await ctx.close();
})();
