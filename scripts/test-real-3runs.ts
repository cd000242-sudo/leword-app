/**
 * 🔴 실제 환경 테스트 — 진짜 Naver API + 28개 외부 소스 3회 연속 호출
 *
 * 목적: v2.21.0 Stratified Sampling 이 실제 앱에서 매번 다른 키워드를 뽑는가
 */

import * as fs from 'fs';
import * as path from 'path';

// 1. 실제 API 키 로드 (사용자 config.json 에서)
const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
process.env['NAVER_CLIENT_ID'] = config.naverClientId;
process.env['NAVER_CLIENT_SECRET'] = config.naverClientSecret;
process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] = config.naverSearchAdAccessLicense;
process.env['NAVER_SEARCHAD_SECRET_KEY'] = config.naverSearchAdSecretKey;
process.env['NAVER_SEARCHAD_CUSTOMER_ID'] = config.naverSearchAdCustomerId;
process.env['YOUTUBE_API_KEY'] = config.youtubeApiKey;

console.log('🔑 API 키 로드 완료');
console.log(`   Naver Client: ${config.naverClientId ? '✅' : '❌'}`);
console.log(`   SearchAd:     ${config.naverSearchAdAccessLicense ? '✅' : '❌'}`);
console.log(`   YouTube:      ${config.youtubeApiKey ? '✅' : '❌'}`);
console.log('');

async function main() {
    const { buildRichFeed } = await import('../src/utils/sources/rich-feed-builder');

    const runs: string[][] = [];
    const topFull: any[][] = [];

    for (let r = 0; r < 3; r++) {
        console.log(`\n════════ Run #${r + 1} 시작 (force=fresh) ════════`);
        const t0 = Date.now();
        let lastPct = -1;
        const result = await buildRichFeed(
            { tier: 'pro', limit: 400 },
            (p) => {
                if (p.percent - lastPct >= 15 || p.percent === 100) {
                    process.stdout.write(`\r  ${p.percent}% — ${p.message.slice(0, 60)}`);
                    lastPct = p.percent;
                }
            }
        );
        process.stdout.write('\n');
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  완료: ${elapsed}s, 총 ${result.total}건, SSS ${result.rows.filter(r => r.grade === 'SSS').length} / SS ${result.rows.filter(r => r.grade === 'SS').length} / S ${result.rows.filter(r => r.grade === 'S').length}`);
        runs.push(result.rows.map(x => x.keyword));
        topFull.push(result.rows.slice(0, 20));
    }

    // 각 run 의 top 20 출력
    for (let r = 0; r < 3; r++) {
        console.log(`\n════ Run #${r + 1} Top 20 ════`);
        topFull[r].forEach((row, i) => {
            const gr = (row.goldenRatio || 0).toFixed(2);
            const sv = row.searchVolume || 0;
            const dc = row.documentCount || 0;
            console.log(`  ${String(i + 1).padStart(2)}. [${row.grade}] ${row.keyword.padEnd(25)} sv=${String(sv).padStart(6)} dc=${String(dc).padStart(6)} gr=${gr}`);
        });
    }

    // 집합 비교
    const jacc = (a: string[], b: string[]) => {
        const sa = new Set(a), sb = new Set(b);
        const inter = [...sa].filter(x => sb.has(x)).length;
        const uni = new Set([...sa, ...sb]).size;
        return uni === 0 ? 0 : inter / uni;
    };

    console.log('\n════ 집합 비교 ════');
    console.log(`  Run#1 ∩ Run#2 jaccard: ${(jacc(runs[0], runs[1]) * 100).toFixed(1)}%`);
    console.log(`  Run#1 ∩ Run#3 jaccard: ${(jacc(runs[0], runs[2]) * 100).toFixed(1)}%`);
    console.log(`  Run#2 ∩ Run#3 jaccard: ${(jacc(runs[1], runs[2]) * 100).toFixed(1)}%`);

    // Run#1 → Run#2 교체 키워드
    const set1 = new Set(runs[0]), set2 = new Set(runs[1]);
    const onlyIn2 = runs[1].filter(k => !set1.has(k));
    const onlyIn1 = runs[0].filter(k => !set2.has(k));

    console.log(`\n════ Run#1 → Run#2 변화 ════`);
    console.log(`  사라진 키워드 ${onlyIn1.length}개 (샘플 15):`);
    onlyIn1.slice(0, 15).forEach(k => console.log(`    − ${k}`));
    console.log(`  새 키워드 ${onlyIn2.length}개 (샘플 15):`);
    onlyIn2.slice(0, 15).forEach(k => console.log(`    + ${k}`));

    // 3회 모두 등장 vs 1회만
    const counts = new Map<string, number>();
    for (const run of runs) for (const k of new Set(run)) counts.set(k, (counts.get(k) || 0) + 1);
    const always = [...counts.entries()].filter(([, c]) => c === 3).map(([k]) => k);
    const once = [...counts.entries()].filter(([, c]) => c === 1).map(([k]) => k);

    console.log(`\n════ 3회 전부 등장 (절대 보장): ${always.length}개 / 희귀(1회만) ${once.length}개 ════`);
    console.log('  희귀 발굴 샘플 15:');
    once.slice(0, 15).forEach(k => console.log(`    💎 ${k}`));

    process.exit(0);
}

main().catch(e => {
    console.error('❌ 실패:', e);
    process.exit(1);
});
