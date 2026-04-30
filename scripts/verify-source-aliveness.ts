/**
 * 모든 등록 소스 실제 작동 검증
 *  - 각 소스 라이브 호출
 *  - 키워드 개수 + 응답시간 + 성공/실패 측정
 *  - 결과를 표로 출력
 *  - 실패 소스 → 제거 후보 명단
 */

import { bootstrapSources } from '../src/utils/sources/source-bootstrap';
import { getRegistry, safeCall } from '../src/utils/sources/source-registry';
import { EnvironmentManager } from '../src/utils/environment-manager';

interface SourceVerification {
    id: string;
    label: string;
    success: boolean;
    keywordCount: number;
    responseMs: number;
    sample: string[];
    error?: string;
}

async function verifySource(id: string): Promise<SourceVerification> {
    const registry = getRegistry();
    const meta = registry.find(m => m.id === id);
    if (!meta) return { id, label: '?', success: false, keywordCount: 0, responseMs: 0, sample: [], error: 'not registered' };

    const t0 = Date.now();
    try {
        const r = await safeCall(id, { skipStorage: true });
        const ms = Date.now() - t0;
        return {
            id,
            label: meta.label,
            success: r.success && r.keywords.length > 0,
            keywordCount: r.keywords.length,
            responseMs: ms,
            sample: r.keywords.slice(0, 3),
            error: r.success ? undefined : r.error,
        };
    } catch (err: any) {
        return { id, label: meta.label, success: false, keywordCount: 0, responseMs: Date.now() - t0, sample: [], error: err?.message || String(err) };
    }
}

(async () => {
    EnvironmentManager.getInstance();
    bootstrapSources();
    const registry = getRegistry();
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📡 소스 작동 검증 — 총 ${registry.length}개 소스 라이브 호출`);
    console.log(`${'═'.repeat(80)}\n`);

    // 직렬 실행 (rate limit 보호)
    const results: SourceVerification[] = [];
    for (const meta of registry) {
        process.stdout.write(`  ${String(results.length + 1).padStart(2)}/${registry.length} ${meta.id.padEnd(20)} ... `);
        const v = await verifySource(meta.id);
        results.push(v);
        if (v.success) {
            console.log(`✅ ${v.keywordCount}개 (${v.responseMs}ms)`);
        } else {
            console.log(`❌ ${(v.error || '0건').slice(0, 50)}`);
        }
    }

    // 결과 표
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 결과 요약`);
    console.log(`${'═'.repeat(80)}\n`);

    const success = results.filter(r => r.success);
    const fail = results.filter(r => !r.success);

    console.log(`✅ 작동 ${success.length}개 / ❌ 실패 ${fail.length}개 / 전체 ${results.length}개`);
    console.log(`평균 응답: ${Math.round(success.reduce((s, r) => s + r.responseMs, 0) / Math.max(success.length, 1))}ms`);
    console.log(`평균 키워드: ${Math.round(success.reduce((s, r) => s + r.keywordCount, 0) / Math.max(success.length, 1))}개`);

    console.log(`\n━━━ ✅ 작동 소스 (${success.length}) ━━━`);
    success.sort((a, b) => b.keywordCount - a.keywordCount);
    for (const r of success) {
        console.log(`  ${r.id.padEnd(22)} ${String(r.keywordCount).padStart(4)}개 ${String(r.responseMs).padStart(5)}ms — "${r.sample.join(', ').slice(0, 60)}"`);
    }

    console.log(`\n━━━ ❌ 실패 소스 (${fail.length}) — 제거 권장 ━━━`);
    for (const r of fail) {
        console.log(`  ${r.id.padEnd(22)} ❌ ${r.error || '0건'}`);
    }

    // 머신리더블 출력 (제거 명단)
    console.log(`\n📋 제거 권장 소스 ID:`);
    console.log(JSON.stringify(fail.map(r => r.id)));

    process.exit(0);
})();
