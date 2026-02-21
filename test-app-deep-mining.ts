
/**
 * 🔥 실제 앱 환경 검증 테스트
 * IPC 핸들러 → huntProTrafficKeywords() 호출 → 딥 마이닝 로그 확인
 */
import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';

async function testAppIntegration() {
    console.log('='.repeat(60));
    console.log('🚀 앱 통합 검증: Traffic Hunter Pro + Deep Mining');
    console.log('='.repeat(60));

    try {
        // IPC 핸들러가 호출하는 것과 동일한 파라미터로 호출
        const result = await huntProTrafficKeywords({
            mode: 'category',
            seedKeywords: [],
            category: 'life_tips',
            targetRookie: true,
            includeSeasonKeywords: true,
            explosionMode: true,
            useDeepMining: true, // 🔥 핵심 옵션
            count: 20,
            forceRefresh: true
        });

        console.log('\n' + '='.repeat(60));
        console.log('📊 결과 요약');
        console.log('='.repeat(60));
        console.log(`✅ 총 키워드: ${result.keywords.length}개`);

        // 딥 마이닝 소스 확인
        const deepMinedKws = result.keywords.filter(k =>
            k.source && k.source.startsWith('deep_mining')
        );

        console.log(`💎 Deep Mining 키워드: ${deepMinedKws.length}개`);

        if (deepMinedKws.length > 0) {
            console.log('\n🔎 [Deep Mining 키워드 샘플]');
            deepMinedKws.slice(0, 5).forEach((k, i) => {
                console.log(`   ${i + 1}. ${k.keyword} (Vol: ${k.searchVolume}, Doc: ${k.documentCount}, Source: ${k.source})`);
            });
            console.log('\n✅ 검증 성공: 딥 마이닝 기능이 앱에서 정상 작동 중!');
        } else {
            console.log('\n⚠️ 딥 마이닝 키워드가 최종 결과에 없습니다.');
            console.log('   → 필터링에서 제외되었을 수 있으나, 마이닝 로그는 위에서 확인하세요.');
        }

        // 전체 결과 샘플
        console.log('\n🏆 [상위 5개 키워드 샘플]');
        result.keywords.slice(0, 5).forEach((k, i) => {
            console.log(`   ${i + 1}. ${k.keyword} (Vol: ${k.searchVolume}, Doc: ${k.documentCount})`);
        });

    } catch (error) {
        console.error('❌ 검증 실패:', error);
    }
}

testAppIntegration();
