/**
 * AdSense Hunter — naver-home 카테고리 시드 추출 통과율 진단
 * 홈판 헌터 결과의 1단계는 hunt-adsense-keywords({category:'naver-home'})
 * 이 단계에서 0건이면 그 뒤 무엇이든 0건. 통과율 측정.
 */

async function diagnoseAdsenseNaverHomeSeeds() {
    const { huntAdSenseKeywords } = require('../src/utils/adsense-keyword-hunter');
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 AdSense Hunter — naver-home 시드 추출 통과율`);
    console.log(`${'═'.repeat(70)}\n`);

    try {
        const t0 = Date.now();
        const result = await huntAdSenseKeywords({
            category: 'naver-home',
            excludeYmylHigh: false,
            requireRealData: false,        // 시드 발견을 위해 추정값도 허용
            blueOceanOnly: false,
            sortBy: 'value',
            minInfoIntent: 30,             // 매우 느슨
            minMonthlyRevenue: 0,
            count: 30,
        });
        const elapsed = Date.now() - t0;
        const kws = result?.keywords || [];

        console.log(`📋 결과:`);
        console.log(`   소요 시간: ${(elapsed / 1000).toFixed(1)}초`);
        console.log(`   최종 키워드: ${kws.length}건`);

        if (result?.requiresPremium) {
            console.log(`   🚫 PREMIUM 모드 — 라이선스 필요`);
            return;
        }

        if (kws.length === 0) {
            console.log(`   🚨 0건 — naver-home 시드 추출 실패`);
            console.log(`   분석 메타: ${JSON.stringify(result?.meta || {}, null, 2).slice(0, 500)}`);
        } else {
            console.log(`\n   샘플 5개:`);
            kws.slice(0, 5).forEach((k: any, i: number) => {
                console.log(`     ${i + 1}. ${k.keyword || k.title || JSON.stringify(k).slice(0, 80)}`);
            });
        }
    } catch (err: any) {
        console.log(`   🚨 에러: ${err?.message}`);
        console.log(`   stack: ${(err?.stack || '').split('\n').slice(0, 3).join('\n')}`);
    }
    console.log(`\n${'═'.repeat(70)}\n`);
}

diagnoseAdsenseNaverHomeSeeds();
