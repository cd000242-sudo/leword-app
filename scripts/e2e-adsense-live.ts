/**
 * AdSense 헌터 E2E 라이브 호출 검증
 *
 * 단위 테스트(9000회)는 모두 통과했지만,
 * 실제로 PRO 헌터 + 네이버 API + 자동완성을 거쳐
 * 결과 키워드가 진짜로 나오는지는 라이브 호출로만 확인 가능.
 *
 * 사용법:
 *   node -r ts-node/register scripts/e2e-adsense-live.ts [category]
 *
 * 예시:
 *   node -r ts-node/register scripts/e2e-adsense-live.ts loan
 *   node -r ts-node/register scripts/e2e-adsense-live.ts life_tips
 */

import { huntAdsenseKeywords } from '../src/utils/adsense-keyword-hunter';
import { EnvironmentManager } from '../src/utils/environment-manager';
import { bootstrapSources } from '../src/utils/sources/source-bootstrap';

async function runOne(category: string): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log(`🎯 카테고리: ${category}`);
    console.log('═'.repeat(70));

    const t0 = Date.now();
    let result;
    try {
        // safe 카테고리는 옵션 자동 완화 (저RPM 특성 반영)
        const isSafe = ['season', 'subsidy', 'living', 'life_tips', 'interior', 'diy', 'gardening', 'parenting', 'pet', 'travel', 'beauty', 'fashion', 'recipe', 'food', 'game', 'sports', 'hobby', 'review', 'shopping'].includes(category);
        result = await huntAdsenseKeywords({
            category,
            count: 10,
            excludeYmylHigh: false,
            minInfoIntent: isSafe ? 30 : 40,
            minMonthlyRevenue: isSafe ? 200 : 2000,
            requireRealData: true,
            newbieMode: true,
            excludeZeroClickHigh: true,
            excludeNonInformational: false,
            blueOceanOnly: true,           // 💎 블루오션만 (사용자 요구)
            sortBy: 'blueOcean',           // 💎 블루오션 우선 정렬
        });
    } catch (err: any) {
        console.error(`❌ 호출 실패: ${err?.message || err}`);
        if (err?.stack) console.error(err.stack);
        return;
    }
    const ms = Date.now() - t0;

    console.log(`\n⏱️  소요시간: ${(ms / 1000).toFixed(1)}초`);
    if ((result as any).sampleBias) {
        console.log(`📊 ${(result as any).sampleBias.summary}`);
    }
    console.log(`📊 결과 ${result.summary.totalFound}개`);
    console.log(`   등급: SSS ${result.summary.sssCount} · SS ${result.summary.ssCount} · S ${result.summary.sCount}`);
    console.log(`   신뢰도: 실측 ${result.summary.realDataCount} · 추정 ${result.summary.estimatedCount} · 고신뢰 ${result.summary.highConfidenceCount}`);
    console.log(`   교차검증: ⭐⭐⭐ ${result.summary.verifiedCount} · ⭐⭐ ${result.summary.doubleVerifiedCount} · ⭐ ${result.summary.singleSourceCount}`);
    console.log(`   💎 블루오션: 💎💎💎 ${result.summary.ultraBlueCount || 0} · 💎 ${result.summary.blueCount || 0} · 🟢 ${result.summary.greenCount || 0} · 🔴 ${result.summary.redCount || 0}`);
    console.log(`   평균 월수익 추정: ₩${result.summary.avgMonthlyRevenue.toLocaleString()}`);

    if (result.keywords.length === 0) {
        console.log(`\n⚠️  결과 0개 — 가능한 원인:`);
        console.log(`   1. 네이버 API 키 미설정 (실측 데이터 없음)`);
        console.log(`   2. PRO 헌터가 카테고리 시드를 못 받음`);
        console.log(`   3. 모든 시드가 게이트(글쓰기/가치/실측) 탈락`);
        return;
    }

    // 📅 season 카테고리: 카테고리별 그룹 출력
    if (result.keywordsByCategory) {
        console.log(`\n📅 sub-카테고리별 그룹 (${Object.keys(result.keywordsByCategory).length}종):`);
        console.log('═'.repeat(70));
        const sortedCats = Object.entries(result.keywordsByCategory as Record<string, any[]>).sort((a, b) => b[1].length - a[1].length);
        for (const [cat, items] of sortedCats) {
            const catEmoji: Record<string, string> = {
                beauty: '💄', fashion: '👗', travel: '✈️', food: '🍱', living: '🛏️',
                gardening: '🌿', subsidy: '💎', health: '💪', parenting: '👶',
                education: '📚', gift: '🎁', family: '👨‍👩‍👧', shopping: '🛒', hobby: '📷', etc: '📌',
            };
            console.log(`\n${catEmoji[cat] || '📌'} ${cat.toUpperCase()} (${items.length}개)`);
            console.log('─'.repeat(70));
            items.forEach((kw, i) => {
                const stars = kw.crossValidation?.level === 'verified' ? '⭐⭐⭐'
                    : kw.crossValidation?.level === 'double' ? '⭐⭐'
                    : kw.crossValidation?.level === 'single' ? '⭐' : '○';
                console.log(`  ${i + 1}. [${kw.grade}] ${stars} ${kw.keyword}`);
                console.log(`     검색량 ${kw.searchVolume.toLocaleString()}/월 · 경쟁 ${kw.competitionRatio.toFixed(2)}x · CPC ₩${kw.estimatedCPC.toLocaleString()} · 월수익 ₩${kw.estimatedMonthlyRevenue.toLocaleString()} · 가치 ${kw.valueScore}/100`);
            });
        }
        console.log('\n' + '═'.repeat(70));
        return;
    }

    console.log(`\n📋 키워드 목록 (${result.keywords.length}개):`);
    console.log('─'.repeat(70));
    result.keywords.forEach((kw, i) => {
        const stars = kw.crossValidation?.level === 'verified' ? '⭐⭐⭐'
            : kw.crossValidation?.level === 'double' ? '⭐⭐'
            : kw.crossValidation?.level === 'single' ? '⭐' : '○';
        const conf = kw.dataConfidence === 'high' ? '🟢' : kw.dataConfidence === 'medium' ? '🟡' : '🔴';
        const blueIcon = kw.blueOcean?.level === 'ultra-blue' ? '💎💎💎'
            : kw.blueOcean?.level === 'blue' ? '💎'
            : kw.blueOcean?.level === 'green' ? '🟢'
            : kw.blueOcean?.level === 'red' ? '🔴'
            : kw.blueOcean?.level === 'crimson' ? '💀' : '⚪';
        console.log(`${String(i + 1).padStart(2)}. [${kw.grade}] ${blueIcon} ${stars} ${conf} ${kw.keyword}`);
        console.log(`    검색량 ${kw.searchVolume.toLocaleString()}/월 · 문서 ${kw.documentCount.toLocaleString()} · 경쟁 ${kw.competitionRatio.toFixed(2)}x`);
        console.log(`    CPC ₩${kw.estimatedCPC.toLocaleString()} · Gross RPM ₩${(kw.grossRPM || 0).toLocaleString()} → Publisher RPM ₩${kw.estimatedRPM.toLocaleString()} (×0.40)`);
        console.log(`    🎯 100% 점유 가정: ₩${kw.estimatedMonthlyRevenue.toLocaleString()}/월 (Gross ₩${(kw.estimatedGrossMonthlyRevenue || 0).toLocaleString()})`);
        if (kw.reachability) {
            console.log(`    📈 신생 블로그 도달률: 6개월 ₩${kw.reachability.month6.monthlyRevenue.toLocaleString()} → 12개월 ₩${kw.reachability.month12.monthlyRevenue.toLocaleString()} → 24개월 ₩${kw.reachability.month24.monthlyRevenue.toLocaleString()}`);
            console.log(`       ${kw.reachability.summary}`);
        }
        if (kw.revenueRangeAt12m) {
            console.log(`    🎯 12개월 후 신뢰구간 ±${kw.revenueRangeAt12m.errorMargin}%: ₩${kw.revenueRangeAt12m.lower.toLocaleString()} ~ ₩${kw.revenueRangeAt12m.upper.toLocaleString()}`);
        }
        if (kw.annualizedVolume) {
            if (kw.annualizedVolume.isSeasonal) {
                console.log(`    📅 ${kw.annualizedVolume.summary} → 연평균 ${kw.annualizedVolume.annualAverage.toLocaleString()}회`);
            }
        }
        if (kw.searchIntent) console.log(`    🎯 ${kw.searchIntent.summary}`);
        if (kw.zeroClickRisk) console.log(`    ${kw.zeroClickRisk.summary}`);
        if (kw.adsenseEligibility) console.log(`    ${kw.adsenseEligibility.summary}${kw.adsenseEligibility.blockingReasons?.length ? ' — ' + kw.adsenseEligibility.blockingReasons[0] : ''}`);
        if (kw.seasonalTiming?.isSeasonal) console.log(`    📅 ${kw.seasonalTiming.summary} (피크 ${kw.seasonalTiming.peakStartDate} ~ ${kw.seasonalTiming.peakEndDate}, 발행권장 ${kw.seasonalTiming.publishWindowStart})`);
        console.log(`    💎 가치 ${kw.valueScore}/100 (${kw.valueBreakdown.reason})`);
        console.log(`    📖 정보의도 ${kw.infoIntentScore} · YMYL ${kw.ymylRisk} · ✍️ ${kw.writableReason}`);
        console.log(`    🔍 ${kw.dataSourceReason}`);
        if (kw.crossValidation) console.log(`    ⭐ ${kw.crossValidation.summary}`);
        console.log('');
    });
}

async function main(): Promise<void> {
    // 네이버 API 키 확인
    try {
        const env = EnvironmentManager.getInstance();
        const cfg = env.getConfig();
        console.log('🔑 네이버 API 키 확인:');
        console.log(`   clientId: ${cfg.naverClientId ? `✅ (${cfg.naverClientId.length}자)` : '❌ 미설정'}`);
        console.log(`   clientSecret: ${cfg.naverClientSecret ? `✅ (${cfg.naverClientSecret.length}자)` : '❌ 미설정'}`);
        console.log(`   searchAdAccessLicense: ${cfg.naverSearchAdAccessLicense ? `✅` : '❌'}`);
        console.log(`   searchAdSecretKey: ${cfg.naverSearchAdSecretKey ? `✅` : '❌'}`);

        if (!cfg.naverClientId || !cfg.naverClientSecret) {
            console.log('\n⚠️  네이버 검색 API 키 없음 → PRO 헌터 사용 불가 → 결과 0개 예상');
            console.log('   해결: Electron 앱 실행 후 설정 → 네이버 API 키 입력');
        }
    } catch (err: any) {
        console.warn(`⚠️ Environment 로드 실패: ${err?.message}`);
    }

    // 🔥 28개 외부 데이터 소스 등록 (ts-node 환경에서 필수, electron은 자동)
    try {
        bootstrapSources();
        console.log('✅ 28개 데이터 소스 부트스트랩 완료');
    } catch (err: any) {
        console.warn(`⚠️ 부트스트랩 실패: ${err?.message}`);
    }

    const target = process.argv[2];
    const categories = target ? [target] : ['loan', 'life_tips', 'beauty'];
    for (const cat of categories) {
        await runOne(cat);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('e2e 라이브 호출 완료');
    console.log('═'.repeat(70));
}

main().catch(err => {
    console.error('치명적 오류:', err);
    process.exit(1);
});
