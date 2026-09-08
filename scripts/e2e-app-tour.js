/**
 * scripts/e2e-app-tour.js — 앱 셸 투어 (2026-09-09 리뉴얼 안전망 · 셸 통일판)
 *
 * 실제 일렉트론 앱을 띄워 사이드바 항목을 하나씩 눌러 화면을 바꿔 보고, 화면마다 스크린샷을 찍고,
 * 렌더러 pageerror 가 하나라도 나면 0 아닌 코드로 끝난다. 실행을 시작하는 버튼(발굴·분석·조회)은 누르지 않는다.
 * 화면 섹션(data-screen)이 있는 항목은 실제로 보이는지(활성 섹션 높이 > 0 · 사이드바 선택 표시 · 떠 있는 고정 오버레이 없음 ·
 * body 스크롤 안 잠김)까지 본다. 섹션이 없는 항목(아직 모달로 뜨는 기능)은 스크린샷만 찍고 Escape + 재로드로 되돌린다.
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

// 화면 안의 실행 버튼은 누르지 않는다 — 사이드바 항목만 누른다('사이트에서 보기'는 화면이라 안전, 카드가 브라우저를 연다)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => String(s || '').replace(/[^\w가-힣]+/g, '_').slice(0, 28) || 'x';

async function listNavItems(page) {
    return page.evaluate(() => {
        return [...document.querySelectorAll('.leword-nav button[data-screen]')].map((b, idx) => {
            const rect = b.getBoundingClientRect();
            const screen = b.getAttribute('data-screen') || '';
            const label = [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
            return {
                idx,
                screen,
                label: (label || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
                onclick: b.getAttribute('onclick') || '',
                hasSection: !!document.querySelector('section.leword-screen[data-screen="' + screen + '"]'),
                visible: rect.width > 0 && rect.height > 0 && getComputedStyle(b).display !== 'none',
            };
        });
    });
}

async function inspectScreen(page, screen) {
    return page.evaluate((id) => {
        const section = document.querySelector('section.leword-screen[data-screen="' + id + '"]');
        if (!section) return { ok: false, why: '섹션 없음', heads: '', stray: [], selected: null, bodyOverflow: '' };
        const active = section.hasAttribute('data-active');
        const rect = section.getBoundingClientRect();
        const heads = [...section.querySelectorAll('h1,h2,h3')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .slice(0, 3)
            .map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30));
        const stray = [...document.querySelectorAll('body > div[id$="Modal"]')]
            .filter((el) => getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none')
            .map((el) => el.id);
        const selected = document.querySelector('.leword-nav button[aria-selected="true"]');
        return {
            ok: active && rect.height > 0,
            why: !active ? '활성 아님' : rect.height <= 0 ? '높이 0' : '',
            heads: heads.join(' | '),
            stray,
            selected: selected ? selected.getAttribute('data-screen') : null,
            bodyOverflow: document.body.style.overflow || '',
        };
    }, screen);
}

async function visibleHeads(page) {
    return page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .slice(0, 4)
        .map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30))
        .join(' | '));
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

    const items = await listNavItems(page);
    console.log(`사이드바 항목 ${items.length}개: ${items.map((c) => `${c.screen}${c.hasSection ? '' : '(모달)'}${c.visible ? '' : '(숨김)'}`).join(' · ')}`);

    let clicked = 0;
    let n = 0;
    for (const item of items) {
        n += 1;
        const file = `${String(n).padStart(2, '0')}-${safe(item.label)}`;
        if (!item.visible) { pageErrors.push(`[${item.label}] 사이드바 항목이 안 보인다`); continue; }
        const before = app.windows().length;
        try {
            const loc = page.locator('.leword-nav button[data-screen]').nth(item.idx);
            await loc.click({ timeout: 4000 });
            clicked += 1;
            await sleep(3000);
            const after = app.windows();
            if (after.length > before) {
                const w = after[after.length - 1];
                w.on('pageerror', (err) => { pageErrors.push(`[${item.label}] ${err.message}`); });
                await sleep(2000);
                const t = await w.title().catch(() => '?');
                await w.screenshot({ path: path.join(OUT, `${file}-window.png`), fullPage: false }).catch(() => {});
                console.log(`  ${item.label}: 새 창 "${t}" → ${file}-window.png`);
                await w.close().catch(() => {});
            }
            await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: false });
            if (item.hasSection) {
                const info = await inspectScreen(page, item.screen);
                const flags = [];
                if (!info.ok) flags.push(`화면 안 보임(${info.why})`);
                if (info.selected !== item.screen) flags.push(`사이드바 선택 표시가 ${info.selected}`);
                if (info.stray.length) flags.push(`떠 있는 고정 오버레이: ${info.stray.join(',')}`);
                if (info.bodyOverflow === 'hidden') flags.push('body 스크롤 잠김');
                if (flags.length) pageErrors.push(`[${item.label}] ${flags.join(' · ')}`);
                console.log(`  ${item.label}: ${flags.length ? '문제 — ' + flags.join(' · ') : '화면 OK'} — 보이는 제목: ${info.heads}`);
            } else {
                // 아직 모달로 뜨는 기능: 스크린샷만 찍고 Escape + 재로드로 되돌린다
                console.log(`  ${item.label}: 모달 — 보이는 제목: ${await visibleHeads(page)}`);
                try { await page.keyboard.press('Escape'); } catch { /* 무시 */ }
                try { await page.goto(home, { waitUntil: 'load', timeout: 20000 }); await sleep(2500); } catch { /* 무시 */ }
            }
        } catch (e) {
            pageErrors.push(`[${item.label}] 클릭 실패: ${String(e.message).split('\n')[0].slice(0, 120)}`);
            console.log(`  ${item.label}: 실패 — ${String(e.message).split('\n')[0].slice(0, 120)}`);
        }
    }

    // 두 번째 순회: 이미 실은 화면으로 되돌아가도 그대로 보이는지(상태 보존) — 화면 섹션이 있는 항목만
    const revisit = items.filter((i) => i.hasSection && ['realtime', 'seat', 'pro', 'golden'].includes(i.screen)).map((i) => i.screen);
    for (const screen of revisit) {
        try {
            await page.locator(`.leword-nav button[data-screen="${screen}"]`).click({ timeout: 4000 });
            await sleep(1200);
            const info = await inspectScreen(page, screen);
            if (!info.ok) pageErrors.push(`[재방문 ${screen}] 화면 안 보임(${info.why})`);
            console.log(`  재방문 ${screen}: ${info.ok ? 'OK' : '문제 ' + info.why}`);
        } catch (e) {
            pageErrors.push(`[재방문 ${screen}] ${String(e.message).split('\n')[0].slice(0, 120)}`);
        }
    }
    await page.screenshot({ path: path.join(OUT, '99-revisit.png'), fullPage: false });

    await app.close();
    console.log(`끝 — 사이드바 ${items.length}개 중 ${clicked}개 클릭, pageerror/문제 ${pageErrors.length}건`);
    if (pageErrors.length > 0) {
        console.error(pageErrors.map((e) => ` - ${e}`).join('\n'));
        process.exit(1);
    }
    process.exit(0);
})().catch((e) => { console.error('투어 실패:', e); process.exit(1); });
