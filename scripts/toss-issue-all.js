#!/usr/bin/env node
/*
 * 토스 쉐어링크 — 상품 조회 목록 전체를 발급받는다.
 *
 * 사장님 승인 2026-08-21: "발급 삭제 안 돼도 된다 — 어차피 확인해서 내가
 * 골라서 그 링크로 글 쓰면 되니까." 그래서 미리 다 발급해 두고, 화면에서는
 * 고르기만 하면 되게 한다.
 *
 * 발급 계약(실측): POST /api-public/v3/shopping/sharelink/link/issue
 *                  본문 {"tacaItemId": <상품의 tacaItemId>}
 *                  응답 {shortUrl, originUrl}
 * 이미 발급된 상품을 다시 부르면 **같은 링크**가 돌아온다 — 중복이 안 생긴다.
 * 세션은 playwright 프로필에만 산다(puppeteer 로는 로그인이 안 잡힌다).
 *
 * 실행: node scripts/toss-issue-all.js            (전체)
 *       node scripts/toss-issue-all.js --limit 5  (앞 5건만)
 * 결과: tmp/toss-issued-links.json  (기존 발급분과 합쳐 저장)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'tmp', 'affiliate-profile');
const OUT = path.join(ROOT, 'tmp', 'toss-issued-links.json');
const PAGE_URL = 'https://sharelink.toss.im/links/recommended-products';

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) || 0 : 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadExisting() {
    try {
        const json = JSON.parse(fs.readFileSync(OUT, 'utf8'));
        return Array.isArray(json.pairs) ? json.pairs : [];
    } catch {
        return [];
    }
}

(async () => {
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: { width: 1280, height: 900 },
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await sleep(3000);

        const products = await page.evaluate(async () => {
            const res = await fetch('/api-public/v3/shopping/sharelink/products?size=120', { credentials: 'include' });
            const json = await res.json();
            const success = json.success || {};
            return {
                limited: success.limited,
                limitStatus: success.limitStatus,
                items: (success.items || [])
                    .filter((i) => !i.linkIssueAvailability || i.linkIssueAvailability.available !== false)
                    .map((i) => ({
                        tacaItemId: i.taca.productView.tacaItemId,
                        name: i.taca.productView.displayName,
                        price: i.taca.productView.displayPrice ?? null,
                    })),
            };
        });

        if (products.items.length === 0) {
            console.error('상품을 못 받았습니다 — 로그인이 풀렸을 수 있습니다.');
            await sleep(90000);
            await ctx.close();
            process.exit(2);
        }
        if (products.limited) {
            console.error(`발급 한도에 걸려 있습니다 (${products.limitStatus}) — 중단합니다.`);
            await ctx.close();
            process.exit(3);
        }

        const targets = LIMIT > 0 ? products.items.slice(0, LIMIT) : products.items;
        console.log(`발급 대상 ${targets.length}건 (한도 ${products.limitStatus})`);

        const existing = loadExisting();
        const byName = new Map(existing.map((p) => [p.name, p]));
        let issued = 0;
        let failed = 0;

        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index];
            const result = await page.evaluate(async (tacaItemId) => {
                const res = await fetch('/api-public/v3/shopping/sharelink/link/issue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ tacaItemId }),
                });
                const json = await res.json().catch(() => null);
                return { status: res.status, success: json && json.success, error: json && json.error };
            }, target.tacaItemId);

            if (result.status === 200 && result.success && result.success.shortUrl) {
                byName.set(target.name, {
                    name: target.name,
                    link: result.success.shortUrl,
                    originUrl: result.success.originUrl || '',
                    price: target.price,
                    commissionRate: 10,
                    issuedAt: new Date().toISOString(),
                });
                issued += 1;
                if (index < 5 || index % 20 === 0) {
                    console.log(`  [${index + 1}/${targets.length}] ${target.name.slice(0, 36)} → ${result.success.shortUrl}`);
                }
            } else {
                failed += 1;
                console.log(`  [${index + 1}/${targets.length}] ✗ ${target.name.slice(0, 36)} (HTTP ${result.status})`);
            }
            // 연타로 막히지 않게 텀을 둔다.
            await sleep(700);
        }

        const pairs = [...byName.values()];
        fs.writeFileSync(OUT, JSON.stringify({
            syncedAt: new Date().toISOString(),
            pageUrl: PAGE_URL,
            pairs,
        }, null, 1), 'utf8');
        console.log(`\n발급 성공 ${issued}건 · 실패 ${failed}건 · 장부 총 ${pairs.length}건 → ${OUT}`);
    } catch (error) {
        console.error('실패:', error.message);
        process.exitCode = 1;
    } finally {
        await ctx.close().catch(() => {});
    }
})();
