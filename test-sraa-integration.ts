import { analyzeKeyword } from './src/utils/pro-traffic-keyword-hunter';

async function testSraaIntegration() {
    console.log('🧪 SRAA (최신성 & 시즌 선점) 통합 검증 테스트 시작...\n');

    const testKeywords = [
        '2026 다이어리 추천', // 시즌 선점 키워드
        '재난지원금 신청방법', // 오래된 글(빈집) 가능성 있는 키워드
        '오늘 날씨'           // 일반 실시간 키워드
    ];

    for (const kw of testKeywords) {
        console.log(`\n🔍 키워드 분석 중: "${kw}"`);

        // 2025-12-31 시뮬레이션 환경에서의 분석
        const result = analyzeKeyword(kw, 'test-sraa', 12, 10, true);

        console.log(`✅ 분석 완료: [${result.grade}] ${result.keyword}`);
        console.log(`- 종합 점수: ${result.totalScore}점`);
        console.log(`- 승률(Win Rate): ${result.winRate}%`);
        console.log(`- 빈집 기회: ${result.isEmptyHouse ? '🏠 YES (오래된 글 방치)' : '❌ NO'}`);
        console.log(`- 시즌 보너스: ${result.seasonalBonus || 0}점`);
        console.log(`- 추천 제목: ${result.proStrategy.title}`);

        if (result.topPostRecency) {
            console.log(`- 최신성 분석: ${result.topPostRecency.oldPostCount}개의 '썩은 글' 발견`);
        }
    }

    console.log('\n✅ SRAA 통합 검증 완료!');
}

testSraaIntegration();
