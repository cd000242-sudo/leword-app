/**
 * 5중 폴백 시스템 라이브 검증
 *  - 4월30일 종료될 네이버 연관검색어 대신 작동하는지 확인
 *  - 5개 소스에서 각각 결과가 나오는지
 */

import { fetchRelatedKeywordsMulti, getNaverRelatedKeywordCountdown } from '../src/utils/related-keyword-fallback';
import { EnvironmentManager } from '../src/utils/environment-manager';

(async () => {
    const env = EnvironmentManager.getInstance().getConfig();
    const countdown = getNaverRelatedKeywordCountdown();

    console.log('═'.repeat(70));
    console.log(`🚨 ${countdown.message}`);
    console.log('═'.repeat(70));

    const testSeeds = ['대출', '연말정산', '봄 네일'];

    for (const seed of testSeeds) {
        console.log(`\n\n━━━ 시드: "${seed}" ━━━`);
        const t0 = Date.now();
        const results = await fetchRelatedKeywordsMulti(seed, {
            naverSearchAdAccessLicense: env.naverSearchAdAccessLicense,
            naverSearchAdSecretKey: env.naverSearchAdSecretKey,
            naverSearchAdCustomerId: env.naverSearchAdCustomerId,
        });
        const ms = Date.now() - t0;

        // 소스별 카운트
        const bySource: Record<string, number> = {};
        for (const r of results) {
            for (const s of r.sources) bySource[s] = (bySource[s] || 0) + 1;
        }
        console.log(`📊 ${results.length}개 키워드 (${ms}ms)`);
        console.log(`   소스별: ${Object.entries(bySource).map(([s, c]) => `${s}=${c}`).join(' · ')}`);

        console.log(`\n📋 TOP 10:`);
        results.slice(0, 10).forEach((r, i) => {
            const stars = r.sources.length >= 3 ? '⭐⭐⭐' : r.sources.length === 2 ? '⭐⭐' : '⭐';
            const vol = r.monthlyVolume ? ` (월 ${r.monthlyVolume.toLocaleString()})` : '';
            console.log(`  ${String(i + 1).padStart(2)}. ${stars} ${r.keyword}${vol}`);
            console.log(`      소스: ${r.sources.join(', ')}`);
        });
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ 5중 폴백 검증 완료');
    console.log('═'.repeat(70));
    process.exit(0);
})();
