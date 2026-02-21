import { analyzeKeyword } from './src/utils/pro-traffic-keyword-hunter';
import { fetchKeywordDataParallel } from './src/utils/pro-traffic-keyword-hunter';
import { EnvironmentManager } from './src/utils/environment-manager';

async function testSingleKeywordIntegration() {
    console.log('🧪 단일 키워드 MDP v2.0 통합 정밀 테스트 시작...\n');

    const testKeyword = '사과'; // 심플한 키워드로 테스트
    const env = EnvironmentManager.getInstance().getConfig();

    try {
        console.log(`🔍 [STEP 1] API 데이터 수집 (병렬) 시작...`);
        const t1 = Date.now();
        await fetchKeywordDataParallel([testKeyword], env);
        console.log(`✅ API 데이터 수집 완료 (${Date.now() - t1}ms)`);

        console.log(`\n🔍 [STEP 2] 키워드 심층 분석 실행...`);
        const t2 = Date.now();
        const kwResult = analyzeKeyword(
            testKeyword,
            'Test-Runner',
            new Date().getMonth() + 1,
            new Date().getHours(),
            true
        );
        console.log(`✅ 키워드 심층 분석 완료 (${Date.now() - t2}ms)`);

        console.log('\n✅ 분석 결과:');
        console.log(`- 키워드: ${kwResult.keyword}`);
        console.log(`- 점수/등급: ${kwResult.totalScore}점 (${kwResult.grade})`);

        console.log('\n🤖 MDP v2.0 통합 지표 (Pro Hunter):');
        console.log(`- CVI (수익 가치): ${kwResult.cvi}`);
        console.log(`- Difficulty (난이도): ${kwResult.difficultyScore}/10`);
        console.log(`- SmartBlock (스마트블록): ${kwResult.hasSmartBlock ? '✅ 있음' : '❌ 없음'}`);
        console.log(`- Influencer (인플루언서): ${kwResult.hasInfluencer ? '✅ 있음' : '❌ 없음'}`);
        console.log(`- isCommercial (상업적): ${kwResult.isCommercial ? '💰 YES' : 'ℹ️ NO'}`);

        console.log('\n💰 수익성 분석 상세 (profitAnalysis):');
        if (kwResult.profitAnalysis) {
            console.log(`- 등급: ${kwResult.profitAnalysis.grade}`);
            console.log(`- 예상 CPC: ${kwResult.profitAnalysis.estimatedCPC}원`);
            console.log(`- 수익 황금비율: ${kwResult.profitAnalysis.profitGoldenRatio}`);
            console.log(`- 일일 예상 수익: ${kwResult.profitAnalysis.estimatedDailyRevenue}원`);
        } else {
            console.log('❌ profitAnalysis 데이터가 없습니다.');
        }

        console.log('\n📝 전략 가이드 요약:');
        console.log(`- 최적 제목: ${kwResult.proStrategy?.title}`);
        console.log(`- 접근 방식: ${kwResult.profitAnalysis?.strategy?.approach}`);

        console.log('\n✅ 테스트 완료!');

    } catch (error) {
        console.error('❌ 테스트 중 오류 발생:', error);
    }
}

testSingleKeywordIntegration();
