/**
 * 빠른 연예인 키워드 테스트 (SRAA 통합 확인)
 */

import { analyzeKeyword } from './src/utils/pro-traffic-keyword-hunter';

async function testCelebKeywords() {
    console.log('🌟 연예인 카테고리 키워드 SRAA 분석 테스트\n');
    console.log(`현재 시간: ${new Date().toISOString()}\n`);

    // 실제 연예인 관련 키워드
    const celebKeywords = [
        '방탄소년단 컴백',
        '아이유 콘서트',
        '손흥민 연봉',
        '송혜교 열애설',
        '블랙핑크 제니',
        '임영웅 신곡',
        '뉴진스 하니',
        '이도현 드라마'
    ];

    for (const kw of celebKeywords) {
        console.log(`\n🔍 분석 중: "${kw}"`);

        try {
            const result = analyzeKeyword(kw, 'celeb', 12, 10, true);

            console.log(`  ✅ [${result.grade}] ${result.keyword}`);
            console.log(`  • 종합점수: ${result.totalScore}점`);
            console.log(`  • 승률(winRate): ${result.winRate ?? 'N/A'}%`);
            console.log(`  • 빈집 기회: ${result.isEmptyHouse ? '🏠 YES' : '❌ NO'}`);
            console.log(`  • 시즌 보너스: ${result.seasonalBonus ?? 0}점`);
            console.log(`  • 신생 적합도: ${result.rookieFriendly?.score ?? 0}점 (${result.rookieFriendly?.grade ?? 'N/A'})`);
            console.log(`  • 추천 제목: ${result.proStrategy?.title?.substring(0, 50) ?? 'N/A'}...`);

            if (result.recencyAnalysis) {
                console.log(`  • 최신성 분석: 평균 ${result.recencyAnalysis.avgDaysOld}일 전, 기회=${result.recencyAnalysis.opportunityLevel}`);
            }
            if (result.smartBlockAnalysis) {
                console.log(`  • 스마트블록: ${result.smartBlockAnalysis.type}, 침투=${result.smartBlockAnalysis.canPenetrate ? '가능' : '어려움'}`);
            }
        } catch (error: any) {
            console.log(`  ❌ 분석 실패: ${error?.message}`);
        }
    }

    console.log('\n\n✅ 연예인 키워드 SRAA 테스트 완료!');
}

testCelebKeywords();
