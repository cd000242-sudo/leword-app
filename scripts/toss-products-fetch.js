#!/usr/bin/env node
/*
 * 토스 쉐어링크 **상품 조회** 목록을 받아 온다.
 *
 * 왜 따로 있나: 기존 채집기(affiliate-campaigns.js)는 puppeteer 인데, 토스
 * 세션은 playwright 프로필에만 산다(실측 2026-08-21 — 같은 디렉터리를 줘도
 * puppeteer 로 열면 로그인이 안 잡힌다). 그래서 토스만 playwright 로 받는다.
 *
 * 왜 홈이 아니라 상품 조회인가: 홈은 큐레이션이라 거기 뜬 상품이 상품 조회
 * 목록에 거의 없다(21건 중 1건만 겹침). 사장님이 발급하러 갈 화면은 상품
 * 조회이므로, 우리가 보여주는 목록도 같은 곳에서 와야 한다.
 *
 * 실행: node scripts/toss-products-fetch.js
 * 결과: tmp/affiliate-dump/toss/products.json  (파서가 읽는 덤프 형식)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'tmp', 'affiliate-profile');
const DUMP = path.join(ROOT, 'tmp', 'affiliate-dump', 'toss', 'products.json');
const PAGE_URL = 'https://sharelink.toss.im/links/recommended-products';
const API = '/api-public/v3/shopping/sharelink/products?size=120';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: { width: 1280, height: 900 },
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await sleep(3500);

        const payload = await page.evaluate(async (api) => {
            const res = await fetch(api, { credentials: 'include' });
            return { status: res.status, body: await res.json().catch(() => null) };
        }, API);

        const items = (payload.body && payload.body.success && payload.body.success.items) || [];
        if (payload.status !== 200 || items.length === 0) {
            console.error(`상품을 못 받았습니다 (HTTP ${payload.status}, ${items.length}건).`);
            console.error('로그인이 풀렸을 수 있습니다 — 뜬 창에서 로그인한 뒤 다시 실행하세요.');
            await sleep(120000); // 창을 열어 두어 로그인할 시간을 준다
            await ctx.close();
            process.exit(2);
        }

        fs.mkdirSync(path.dirname(DUMP), { recursive: true });
        fs.writeFileSync(DUMP, JSON.stringify({
            url: `https://sharelink.toss.im${API}`,
            status: payload.status,
            body: payload.body,
        }, null, 1), 'utf8');

        const issuable = items.filter((i) => !i.linkIssueAvailability || i.linkIssueAvailability.available !== false);
        console.log(`상품 ${items.length}건 (발급 가능 ${issuable.length}건) → ${DUMP}`);
        issuable.slice(0, 5).forEach((i) => console.log(`  · ${i.taca.productView.displayName.slice(0, 44)}`));
    } catch (error) {
        console.error('실패:', error.message);
        process.exitCode = 1;
    } finally {
        await ctx.close().catch(() => {});
    }
})();
