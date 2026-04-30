/**
 * AdSense Hunter — 자동 회귀 테스트
 *
 * 5개 핵심 카테고리(safe + caution + danger 균형) 라이브 호출 →
 * 각 카테고리에서 검증 통과 여부 + 결과 분포 자동 보고.
 * 정기 실행 (월 1~2회) 권장.
 */

import { huntAdsenseKeywords, clearHuntCache } from '../src/utils/adsense-keyword-hunter';
import { bootstrapSources } from '../src/utils/sources/source-bootstrap';
import { EnvironmentManager } from '../src/utils/environment-manager';

interface RegressionCheck {
    category: string;
    passed: boolean;
    durationMs: number;
    keywordCount: number;
    sssCount: number;
    ssCount: number;
    sCount: number;
    avgValueScore: number;
    realDataRatio: number;          // 실측 비율
    crossValidatedRatio: number;     // ⭐⭐+ 비율
    samplaBiasHHI: number;
    stages: string;                  // stage 요약
    issues: string[];                // 검출된 회귀
}

async function runOne(category: string): Promise<RegressionCheck> {
    const isSafe = ['subsidy', 'living', 'season'].includes(category);
    const t0 = Date.now();
    const issues: string[] = [];
    let result: any;
    try {
        result = await huntAdsenseKeywords({
            category, count: 10, requireRealData: true, newbieMode: true,
            excludeZeroClickHigh: true, forceRefresh: true,
            minInfoIntent: isSafe ? 30 : 40, minMonthlyRevenue: isSafe ? 200 : 2000,
        });
    } catch (err: any) {
        issues.push(`치명적 오류: ${err?.message}`);
        return {
            category, passed: false, durationMs: Date.now() - t0, keywordCount: 0,
            sssCount: 0, ssCount: 0, sCount: 0, avgValueScore: 0,
            realDataRatio: 0, crossValidatedRatio: 0, samplaBiasHHI: 0,
            stages: 'failed', issues,
        };
    }

    const ms = Date.now() - t0;
    const kws = result.keywords || [];
    const total = kws.length;

    // 회귀 검증
    if (total === 0) issues.push('결과 0개');
    if (ms > 360000) issues.push(`응답시간 6분 초과: ${(ms / 1000).toFixed(0)}초`);
    if (total > 0) {
        const realRatio = kws.filter((k: any) => k.dataSource !== 'estimated').length / total;
        if (realRatio < 0.9) issues.push(`실측 비율 < 90%: ${(realRatio * 100).toFixed(0)}%`);
        const cvRatio = kws.filter((k: any) => k.crossValidation?.score >= 2).length / total;
        if (cvRatio < 0.5) issues.push(`교차검증 ⭐⭐+ < 50%: ${(cvRatio * 100).toFixed(0)}%`);
        // 모든 키워드가 글쓰기 가능 + 적합성 체크
        if (kws.some((k: any) => !k.writable)) issues.push('writable=false 키워드 존재');
        if (kws.some((k: any) => k.adsenseEligibility?.status === 'blocked')) {
            issues.push('blocked 키워드 결과에 포함');
        }
    }

    const stages = (result.stages || []).map((s: any) => `${s.name}:${s.status}`).join(' ');
    const realCount = kws.filter((k: any) => k.dataSource !== 'estimated').length;
    const cvCount = kws.filter((k: any) => k.crossValidation?.score >= 2).length;
    const avgValue = total > 0 ? kws.reduce((s: number, k: any) => s + (k.valueScore || 0), 0) / total : 0;

    return {
        category,
        passed: issues.length === 0,
        durationMs: ms,
        keywordCount: total,
        sssCount: result.summary?.sssCount || 0,
        ssCount: result.summary?.ssCount || 0,
        sCount: result.summary?.sCount || 0,
        avgValueScore: Math.round(avgValue),
        realDataRatio: total > 0 ? Math.round((realCount / total) * 100) : 0,
        crossValidatedRatio: total > 0 ? Math.round((cvCount / total) * 100) : 0,
        samplaBiasHHI: result.sampleBias?.hhi || 0,
        stages,
        issues,
    };
}

(async () => {
    EnvironmentManager.getInstance();
    bootstrapSources();
    clearHuntCache();

    const targets = ['subsidy', 'season', 'living', 'loan', 'it'];
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🧪 AdSense Hunter 자동 회귀 테스트 — ${targets.length}개 카테고리 라이브 호출`);
    console.log(`${'═'.repeat(80)}\n`);

    const results: RegressionCheck[] = [];
    for (const cat of targets) {
        process.stdout.write(`  ▶ ${cat.padEnd(10)} ... `);
        const r = await runOne(cat);
        results.push(r);
        console.log(`${r.passed ? '✅' : '❌'} ${r.keywordCount}개 ${(r.durationMs / 1000).toFixed(0)}초`);
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 회귀 보고서`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`${'카테고리'.padEnd(10)} | 결과 | 시간(s) | SSS/SS/S | 가치 | 실측% | ⭐⭐+ % | HHI  | 통과`);
    console.log(`${'-'.repeat(80)}`);
    for (const r of results) {
        console.log(`${r.category.padEnd(10)} | ${String(r.keywordCount).padStart(4)} | ${String((r.durationMs / 1000).toFixed(0)).padStart(7)} | ${r.sssCount}/${r.ssCount}/${r.sCount} 개 | ${String(r.avgValueScore).padStart(4)} | ${String(r.realDataRatio).padStart(5)} | ${String(r.crossValidatedRatio).padStart(6)} | ${String(r.samplaBiasHHI).padStart(4)} | ${r.passed ? '✅' : '❌'}`);
        if (r.issues.length > 0) {
            r.issues.forEach(i => console.log(`           ⚠️  ${i}`));
        }
    }

    const passCount = results.filter(r => r.passed).length;
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`최종: ${passCount}/${results.length} 통과 (${passCount === results.length ? '🎉' : '🚨'})`);
    console.log(`총 소요시간: ${(results.reduce((s, r) => s + r.durationMs, 0) / 1000).toFixed(0)}초`);
    console.log(`${'═'.repeat(80)}\n`);

    process.exit(passCount === results.length ? 0 : 1);
})();
