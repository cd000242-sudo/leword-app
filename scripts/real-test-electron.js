/**
 * 🔴 Electron 내부에서 buildRichFeed 3회 실행 — 28 소스 전부 동작
 *
 * 실행: electron scripts/real-test-electron.js
 */

// 🔧 undici(fetch) 가 main process 에서 File 참조 — node:buffer 로 폴리필
try {
    const { File, Blob } = require('node:buffer');
    if (!globalThis.File) globalThis.File = File;
    if (!globalThis.Blob) globalThis.Blob = Blob;
} catch {}

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 🔑 실전 앱과 동일한 userData 경로로 고정 — Naver API 키/캐시 공유
const realUserData = path.join(app.getPath('appData'), 'blogger-admin-panel');
app.setPath('userData', realUserData);

app.whenReady().then(async () => {
    console.log('🚀 Electron ready — 실전 환경 테스트 시작');
    console.log(`   userData: ${app.getPath('userData')}`);

    // 🔌 28개 소스 부트스트랩 — 앱 실전과 동일
    const { bootstrapSources } = require('../dist/utils/sources/source-bootstrap');
    bootstrapSources();
    const { buildRichFeed } = require('../dist/utils/sources/rich-feed-builder');

    const runs = [];
    const topFull = [];

    for (let r = 0; r < 3; r++) {
        console.log(`\n════════ Run #${r + 1} 시작 (force=fresh) ════════`);
        const t0 = Date.now();
        let lastPct = -1;
        const result = await buildRichFeed(
            { tier: 'pro', limit: 200 },
            (p) => {
                if (p.percent - lastPct >= 10 || p.percent === 100) {
                    console.log(`  ${p.percent}% — ${p.message}`);
                    lastPct = p.percent;
                }
            }
        );
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const sss = result.rows.filter(x => x.grade === 'SSS').length;
        const ss = result.rows.filter(x => x.grade === 'SS').length;
        const s = result.rows.filter(x => x.grade === 'S').length;
        const a = result.rows.filter(x => x.grade === 'A').length;
        const b = result.rows.filter(x => x.grade === 'B').length;
        const pages = Math.ceil(result.total / 20);
        console.log(`  ✅ 완료: ${elapsed}s, 총 ${result.total}건, SSS ${sss} / SS ${ss} / S ${s} / A ${a} / B ${b} — 페이지 ${pages}장 (20씩)`);
        runs.push(result.rows.map(x => x.keyword));
        topFull.push(result.rows.slice(0, 30));

        // 다음 run 은 캐시 우회 — 메모리/디스크 캐시 둘 다 제거
        const { clearRichFeedCache } = require('../dist/utils/sources/rich-feed-builder');
        clearRichFeedCache();
        try {
            const cacheFile = path.join(app.getPath('userData'), 'rich-feed-cache.json');
            if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
        } catch {}
    }

    // 결과 출력
    for (let r = 0; r < 3; r++) {
        console.log(`\n════ Run #${r + 1} Top 30 ════`);
        topFull[r].forEach((row, i) => {
            const gr = (row.goldenRatio || 0).toFixed(2);
            const sv = row.searchVolume || 0;
            const dc = row.documentCount || 0;
            console.log(`  ${String(i + 1).padStart(2)}. [${row.grade}] ${(row.keyword || '').padEnd(30)} sv=${String(sv).padStart(6)} dc=${String(dc).padStart(7)} gr=${gr}`);
        });
    }

    // Jaccard
    const jacc = (a, b) => {
        const sa = new Set(a), sb = new Set(b);
        const inter = [...sa].filter(x => sb.has(x)).length;
        const uni = new Set([...sa, ...sb]).size;
        return uni === 0 ? 0 : inter / uni;
    };
    console.log('\n════ 3회 집합 비교 (Jaccard) ════');
    console.log(`  Run#1 ∩ Run#2: ${(jacc(runs[0], runs[1]) * 100).toFixed(1)}%`);
    console.log(`  Run#1 ∩ Run#3: ${(jacc(runs[0], runs[2]) * 100).toFixed(1)}%`);
    console.log(`  Run#2 ∩ Run#3: ${(jacc(runs[1], runs[2]) * 100).toFixed(1)}%`);

    // 변화 디테일
    const set1 = new Set(runs[0]), set2 = new Set(runs[1]);
    const onlyIn2 = runs[1].filter(k => !set1.has(k));
    const onlyIn1 = runs[0].filter(k => !set2.has(k));
    console.log(`\n════ Run#1 → Run#2 변화 ════`);
    console.log(`  사라진 키워드 ${onlyIn1.length}개 (샘플 20):`);
    onlyIn1.slice(0, 20).forEach(k => console.log(`    − ${k}`));
    console.log(`  새 키워드 ${onlyIn2.length}개 (샘플 20):`);
    onlyIn2.slice(0, 20).forEach(k => console.log(`    + ${k}`));

    // 3회 모두 등장 vs 1회만
    const counts = new Map();
    for (const run of runs) for (const k of new Set(run)) counts.set(k, (counts.get(k) || 0) + 1);
    const always = [...counts.entries()].filter(([, c]) => c === 3).map(([k]) => k);
    const once = [...counts.entries()].filter(([, c]) => c === 1).map(([k]) => k);
    console.log(`\n════ 고정/희귀 분포 ════`);
    console.log(`  3회 전부 등장 (Fixed/SSS 보장): ${always.length}개`);
    console.log(`  1회만 등장 (희귀 발굴): ${once.length}개`);
    console.log('  희귀 발굴 샘플 20:');
    once.slice(0, 20).forEach(k => console.log(`    💎 ${k}`));

    // 종합
    const avgJacc = (jacc(runs[0], runs[1]) + jacc(runs[0], runs[2]) + jacc(runs[1], runs[2])) / 3;
    console.log('\n════════════════════════════');
    console.log(`평균 Jaccard: ${(avgJacc * 100).toFixed(1)}%`);
    console.log(`→ 매 run 마다 top ${runs[0].length} 중 평균 ${Math.round((1 - avgJacc) * runs[0].length)}개가 새 키워드`);
    console.log('════════════════════════════');

    app.quit();
});
