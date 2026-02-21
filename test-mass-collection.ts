/**
 * 대규모 키워드 수집 시스템 테스트
 */

import {
    getMassCollectionSystem,
    getKeywordStorage,
    getFreshKeywordsAPI
} from './src/utils/mass-collection';

async function testMassCollection() {
    console.log('🏭 대규모 키워드 수집 시스템 테스트 시작...\n');

    const storage = getKeywordStorage();
    const api = getFreshKeywordsAPI();
    const system = getMassCollectionSystem();

    try {
        // 1. 저장소 테스트
        console.log('📦 1단계: 저장소 테스트');
        console.log('─────────────────────────');

        // 테스트 키워드 저장
        const testKeywords = [
            { keyword: '청년도약계좌 가입방법', source: 'signal' as const, category: 'finance', searchVolume: 5000, documentCount: 3000 },
            { keyword: '아이폰16 출시일', source: 'zum' as const, category: 'it', searchVolume: 15000, documentCount: 8000 },
            { keyword: '손흥민 경기일정', source: 'nate' as const, category: 'sports', searchVolume: 8000, documentCount: 12000 },
            { keyword: '연말정산 절세팁', source: 'daum' as const, category: 'finance', searchVolume: 3000, documentCount: 1500 },
            { keyword: '넷플릭스 신작 추천', source: 'google' as const, category: 'celeb', searchVolume: 6000, documentCount: 20000 }
        ];

        for (const kw of testKeywords) {
            await storage.save(kw);
            console.log(`  ✓ 저장: ${kw.keyword} (${kw.source})`);
        }

        // 통계 확인
        const stats = await storage.getStats();
        console.log(`\n📊 저장소 통계:`);
        console.log(`  - 총 키워드: ${stats.totalKeywords}개`);
        console.log(`  - 유효 키워드: ${stats.validKeywords}개`);
        console.log(`  - 소스별: ${JSON.stringify(stats.keywordsBySource)}`);
        console.log(`  - 등급별: ${JSON.stringify(stats.keywordsByGrade)}`);

        // 2. 키워드 조회 테스트
        console.log('\n\n🔍 2단계: 키워드 조회 테스트');
        console.log('─────────────────────────────');

        // 유효한 키워드만 조회
        const validKeywords = await storage.getValidKeywords({
            validOnly: true,
            sortBy: 'goldenRatio',
            sortOrder: 'desc',
            limit: 10
        });

        console.log(`\n📋 유효한 키워드 (황금비율순):`);
        for (const kw of validKeywords) {
            console.log(`  [${kw.grade}] ${kw.keyword}`);
            console.log(`      검색량: ${kw.searchVolume}, 문서수: ${kw.documentCount}, 황금비율: ${kw.goldenRatio}`);
            console.log(`      신선도: ${Math.round((1 - (Date.now() - new Date(kw.collectedAt).getTime()) / (72 * 60 * 60 * 1000)) * 100)}%`);
        }

        // 3. 신선한 키워드 API 테스트
        console.log('\n\n🎯 3단계: 신선한 키워드 API 테스트');
        console.log('────────────────────────────────');

        const freshResult = await api.getFreshKeywords({
            minGrade: 'B',
            minFreshness: 0,  // 테스트이므로 0
            count: 10
        });

        console.log(`\n🔥 신선한 키워드 추천 결과:`);
        console.log(`  - 총 검색: ${freshResult.summary.totalFound}개`);
        console.log(`  - 유효: ${freshResult.summary.validCount}개`);
        console.log(`  - 평균 신선도: ${freshResult.summary.averageFreshness}%`);
        console.log(`  - 급등 키워드: ${freshResult.summary.risingCount}개`);

        console.log(`\n📋 추천 키워드:`);
        for (const kw of freshResult.keywords) {
            console.log(`  [${kw.grade}] ${kw.keyword}`);
            console.log(`      신선도: ${kw.freshness}%, 황금비율: ${kw.goldenRatio}${kw.isRising ? ' 🚀 급등!' : ''}`);
        }

        // 4. 시스템 상태
        console.log('\n\n📈 4단계: 시스템 상태');
        console.log('───────────────────');

        const status = await system.getStatus();
        console.log(`  - 저장소:`);
        console.log(`      총 키워드: ${status.storage.totalKeywords}개`);
        console.log(`      유효 키워드: ${status.storage.validKeywords}개`);
        console.log(`  - 수집기:`);
        console.log(`      실행 중: ${status.collector.isRunning ? '예' : '아니오'}`);
        console.log(`      마지막 수집: ${status.collector.lastCollectionAt || '없음'}`);

        // 5. 수동 수집 테스트 (선택적)
        console.log('\n\n🔄 5단계: 수동 수집 테스트');
        console.log('─────────────────────────');
        console.log('  (수동 수집을 테스트하려면 아래 주석을 해제하세요)');
        console.log('  // await system.collectNow();');

        // 결과 요약
        console.log('\n\n✅ 테스트 완료!');
        console.log('━━━━━━━━━━━━━━━');
        console.log(`총 ${stats.totalKeywords}개 키워드가 저장소에 있습니다.`);
        console.log('시스템을 시작하려면: system.start()');
        console.log('시스템을 중지하려면: system.stop()');

    } catch (error) {
        console.error('❌ 테스트 실패:', error);
    }
}

testMassCollection();
