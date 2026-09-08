/**
 * scripts/e2e-app-tour.js — 앱 런처 투어 (2026-09-09 리뉴얼 안전망)
 *
 * 실제 일렉트론 앱을 띄워 추가 기능 그리드의 카드를 하나씩 눌러 보고, 화면마다 스크린샷을 찍고,
 * 렌더러 pageerror 가 하나라도 나면 0 아닌 코드로 끝난다. 실행을 시작하는 버튼(발굴·분석·조회)은 누르지 않는다.
 *
 * 실행:  npm run build
 *        NODE_PATH=<repo>/node_modules env -u ELECTRON_RUN_AS_NODE node scripts/e2e-app-tour.js
 *
 * - ELECTRON_RUN_AS_NODE 가 셸에 남아 있으면 일렉트론이 노드로 떠서 창이 안 열린다 — 반드시 지운다.
 * - 설치판 LEWORD 가 같은 PC 에서 돌고 있어도 되게 LEWORD_E2E_SKIP_SINGLE_INSTANCE=1 로 단일 인스턴스 잠금을 넘는다.
 * - 스크린샷은 .e2e-shots/ (gitignore) 에 쌓인다.
 */
const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright');

const PROJECT = path.resolve(__dirname, '..');
const OUT = path.join(PROJECT, '.e2e-shots');
fs.mkdirSync(OUT, { recursive: true });

const env = { ...process.env, LEWORD_E2E_SKIP_SINGLE_INSTANCE: '1' };
delete env.ELECTRON_RUN_AS_NODE;

// '사이트에서 보기'는 외부 브라우저(leaderspro.kr)를 띄우는 카드라 투어에서는 누르지 않는다
const SKIP_LABEL = /발굴 시작|분석 시작|찾기 시작|자리 재기|키워드 조회|자동 황금키워드 발굴|마인드맵|사이트에서 보기/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => String(s || '').replace(/[^\w가-힣]+/g, '_').slice(0, 28) || 'x';

async function listGridCards(page) {
    return page.evaluate(() => {
        const grid = document.querySelector('.additional-features');
        if (!grid) return [];
        return [...grid.querySelectorAll('button[onclick]')].map((b, idx) => {
            const rect = b.getBoundingClientRect();
            const title = b.querySelector('div[style*="font-weight"]');
            return {
                idx,
                label: (title ? title.textContent : b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
                onclick: b.getAttribute('onclick') || '',
                visible: rect.width > 0 && rect.height > 0 && getComputedStyle(b).display !== 'none',
            };
        });
    });
}

(async () => {
    const pageErrors = [];
    const app = await electron.launch({ args: ['.'], cwd: PROJECT, env, timeout: 90000 });
    await sleep(7000);
    const page = app.windows()[0];
    if (!page) throw new Error('메인 창이 없다 — ELECTRON_RUN_AS_NODE 가 남아 있는지 확인');
    page.on('pageerror', (err) => {
        pageErrors.push(`[home] ${err.message}`);
        console.log(`  !! pageerror: ${err.message}`);
    });
    const home = page.url();
    console.log(`메인 창 ${home}`);
    await page.screenshot({ path: path.join(OUT, '00-home.png'), fullPage: false });

    const cards = await listGridCards(page);
    console.log(`그리드 카드 ${cards.length}개: ${cards.map((c) => `${c.label}${c.visible ? '' : '(숨김)'}`).join(' · ')}`);

    let clicked = 0;
    let n = 0;
    for (const card of cards) {
        n += 1;
        const file = `${String(n).padStart(2, '0')}-${safe(card.label)}`;
        if (!card.visible) { console.log(`  ${card.label}: 숨김 카드 — 건너뜀`); continue; }
        if (SKIP_LABEL.test(card.label)) { console.log(`  ${card.label}: 실행 버튼 — 건너뜀`); continue; }
        const before = app.windows().length;
        try {
            const loc = page.locator('.additional-features button[onclick]').nth(card.idx);
            await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
            await loc.click({ timeout: 4000 });
            clicked += 1;
            await sleep(2500);
            const after = app.windows();
            if (after.length > before) {
                const w = after[after.length - 1];
                w.on('pageerror', (err) => { pageErrors.push(`[${card.label}] ${err.message}`); });
                await sleep(2000);
                const t = await w.title().catch(() => '?');
                await w.screenshot({ path: path.join(OUT, `${file}-window.png`), fullPage: false }).catch(() => {});
                console.log(`  ${card.label}: 새 창 "${t}" → ${file}-window.png`);
                await w.close().catch(() => {});
            } else {
                await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: false });
                const info = await page.evaluate(() => {
                    const shown = [...document.querySelectorAll('h1,h2,h3')]
                        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                        .slice(0, 4)
                        .map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30));
                    return shown.join(' | ');
                });
                console.log(`  ${card.label}: 같은 창 — 보이는 제목: ${info}`);
            }
        } catch (e) {
            pageErrors.push(`[${card.label}] 클릭 실패: ${String(e.message).split('\n')[0].slice(0, 120)}`);
            console.log(`  ${card.label}: 실패 — ${String(e.message).split('\n')[0].slice(0, 120)}`);
        }
        // 모달 닫고 홈으로 복귀 — Escape 뒤 파일 URL 재로드가 가장 확실하다
        try { await page.keyboard.press('Escape'); } catch { /* 무시 */ }
        try { await page.goto(home, { waitUntil: 'load', timeout: 20000 }); await sleep(2000); } catch { /* 무시 */ }
    }

    await app.close();
    console.log(`끝 — 카드 ${cards.length}개 중 ${clicked}개 클릭, pageerror ${pageErrors.length}건`);
    if (pageErrors.length > 0) {
        console.error(pageErrors.map((e) => ` - ${e}`).join('\n'));
        process.exit(1);
    }
    process.exit(0);
})().catch((e) => { console.error('투어 실패:', e); process.exit(1); });
