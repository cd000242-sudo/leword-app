/**
 * PRO Hunter 끝판왕 (Phase A~E) 라이브 e2e
 *  - PRO 헌터 호출 → AdSense 9-게이트 후처리
 *  - 결과 카드: Publisher RPM, Reachability, 블루오션, 신뢰구간 모두 표시
 */

import { huntProTrafficKeywords } from '../src/utils/pro-traffic-keyword-hunter';
import { enhanceProResults } from '../src/utils/pro-traffic-adsense-enhancer';
import { getWorkerHealthSummary } from '../src/utils/pro-hunter-v12/worker-status';
import { bootstrapSources } from '../src/utils/sources/source-bootstrap';
import { EnvironmentManager } from '../src/utils/environment-manager';

(async () => {
    EnvironmentManager.getInstance();
    bootstrapSources();
    const category = process.argv[2] || 'all';

    console.log('═'.repeat(70));
    console.log(`🚀 PRO 끝판왕 헌터 — 카테고리: ${category}`);
    console.log('═'.repeat(70));

    const t0 = Date.now();
    const proResult = await huntProTrafficKeywords({
        mode: 'category',
        category,
        targetRookie: false,
        includeSeasonKeywords: true,
        explosionMode: false,
        useDeepMining: true,
        count: 30,
        forceRefresh: true,
    });
    const proMs = Date.now() - t0;
    console.log(`\n⏱️  PRO 헌팅 ${(proMs / 1000).toFixed(0)}초 → ${proResult.keywords?.length || 0}개`);

    if (!proResult.keywords || proResult.keywords.length === 0) {
        console.log('⚠️ PRO 결과 0개');
        return process.exit(0);
    }

    // Phase A 후처리
    const t1 = Date.now();
    const { enhanced, blockedCount, blockedReasons } = enhanceProResults(proResult.keywords, {
        excludeNonWritable: true,
        excludePersonDependent: true,
        excludeBlocked: true,
        excludeZeroClickHigh: true,
        blueOceanOnly: false,  // 블루오션 강제는 옵션
    });
    console.log(`\n🚀 AdSense 9-게이트 후처리 (${(Date.now() - t1).toFixed(0)}ms): ${enhanced.length}/${proResult.keywords.length} 통과`);
    console.log(`   차단 ${blockedCount}개 — ${JSON.stringify(blockedReasons)}`);

    // 워커 상태
    const wh = getWorkerHealthSummary();
    console.log(`\n${wh.summary}`);

    // 통계
    const sss = enhanced.filter(k => k.proEnhancedGrade === 'SSS').length;
    const ss = enhanced.filter(k => k.proEnhancedGrade === 'SS').length;
    const s = enhanced.filter(k => k.proEnhancedGrade === 'S').length;
    const ub = enhanced.filter(k => k.blueOcean.level === 'ultra-blue').length;
    const blue = enhanced.filter(k => k.blueOcean.level === 'blue').length;
    console.log(`📊 등급 SSS=${sss} SS=${ss} S=${s} | 블루오션 💎💎💎=${ub} 💎=${blue}`);
    console.log(`📊 평균 Publisher 월수익: ₩${enhanced.length > 0 ? Math.round(enhanced.reduce((s, k) => s + k.publisherMonthlyRevenue, 0) / enhanced.length).toLocaleString() : 0}`);

    // TOP 8 출력
    enhanced.sort((a, b) => b.reachability.month12.monthlyRevenue - a.reachability.month12.monthlyRevenue);
    console.log(`\n📋 TOP 8 (12개월 도달 월수익 순):`);
    console.log('─'.repeat(70));
    enhanced.slice(0, 8).forEach((kw, i) => {
        const blueIcon = kw.blueOcean.level === 'ultra-blue' ? '💎💎💎'
            : kw.blueOcean.level === 'blue' ? '💎'
            : kw.blueOcean.level === 'green' ? '🟢' : kw.blueOcean.level === 'red' ? '🔴' : '⚪';
        console.log(`${String(i + 1).padStart(2)}. [${kw.proEnhancedGrade}] ${blueIcon} ${kw.keyword}`);
        console.log(`    검색 ${kw.searchVolume.toLocaleString()}/월 · 경쟁 ${kw.blueOcean.ratio.toFixed(2)}x · CPC ₩${kw.estimatedCPC.toLocaleString()}`);
        console.log(`    Gross RPM ₩${kw.grossRPM.toLocaleString()} → Publisher RPM ₩${kw.publisherRPM.toLocaleString()} (×0.40)`);
        console.log(`    🎯 100% 점유: ₩${kw.publisherMonthlyRevenue.toLocaleString()}/월 (12m: ₩${kw.reachability.month12.monthlyRevenue.toLocaleString()})`);
        console.log(`    📊 신뢰구간 ±${kw.revenueRangeAt12m.errorMargin}%: ₩${kw.revenueRangeAt12m.lower.toLocaleString()}~${kw.revenueRangeAt12m.upper.toLocaleString()}`);
        console.log(`    🎯 ${kw.searchIntent.summary} · ${kw.zeroClickRisk.summary}`);
        console.log(`    ${kw.adsenseEligibility.summary}`);
        console.log('');
    });

    console.log('═'.repeat(70));
    console.log(`✅ PRO 끝판왕 e2e 완료 — 총 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    console.log('═'.repeat(70));
    process.exit(0);
})();
