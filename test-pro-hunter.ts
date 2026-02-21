/**
 * PRO 트래픽 헌터 테스트
 */

import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';

async function testProHunter() {
  console.log('🏆 PRO 트래픽 헌터 테스트 시작...\n');

  try {
    const result = await huntProTrafficKeywords({
      mode: 'realtime',
      category: 'celeb',
      targetRookie: true,
      includeSeasonKeywords: true,
      explosionMode: true,
      count: 5,
      forceRefresh: true
    });

    console.log('\n📊 결과 요약:');
    console.log(`- 총 발굴: ${result.keywords?.length || 0}개`);
    console.log(`- SSS등급: ${result.keywords?.filter(k => k.grade === 'SSS').length || 0}개`);
    console.log(`- SS등급: ${result.keywords?.filter(k => k.grade === 'SS').length || 0}개`);
    console.log(`- S등급: ${result.keywords?.filter(k => k.grade === 'S').length || 0}개`);

    console.log('\n🔥 상위 10개 키워드:');
    const top10 = result.keywords?.slice(0, 10) || [];

    for (const kw of top10) {
      const ratio = kw.goldenRatio?.toFixed(2) || '0';
      console.log(`\n[${kw.grade}] ${kw.keyword}`);
      console.log(`  - 검색량: ${kw.searchVolume}, 문서수: ${kw.documentCount}, 황금비율: ${ratio}`);
      console.log(`  - 블루오션: ${kw.blueOcean?.score || 0}점`);
      console.log(`  - 신생적합도: ${kw.rookieFriendly?.score || 0}점 (${kw.rookieFriendly?.grade})`);
      console.log(`  - 예상 상위노출: ${kw.rookieFriendly?.canRankWithin}`);

      // 🤖 MDP v2.0 메트릭스 출력
      console.log(`  - MDP v2.0 지표:`);
      console.log(`    * 수익 가치(CVI): ${kw.cvi || 0}`);
      console.log(`    * 노출 난이도: ${kw.difficultyScore || 0}/10`);
      console.log(`    * 스마트블록: ${kw.hasSmartBlock ? '✅' : '❌'}, 인플루언서: ${kw.hasInfluencer ? '✅' : '❌'}`);
      console.log(`    * 상업적 의도: ${kw.isCommercial ? '💰 YES' : 'ℹ️ NO'}`);

      if (kw.topBlogData) {
        console.log(`  - 상위 블로그 지수: ${kw.topBlogData.summary.avgBlogIndexScore} (약점: ${kw.topBlogData.summary.weakCompetitorCount}개)`);
        console.log(`  - 기회 분석: ${kw.topBlogData.opportunities.bestOpportunity}`);
      } else {
        console.log(`  ⚠️ 상위 블로그 경쟁 데이터 없음!`);
      }

      if (kw.monetizationBlueprint) {
        console.log(`  - 수익전략: ${kw.monetizationBlueprint.name} (${kw.monetizationBlueprint.type})`);
      }

      // 문서수가 0인 경우만 경고 (황금비율 높은 건 초황금 키워드!)
      if (kw.documentCount === 0) {
        console.log(`  ⚠️ 문서수 0 - 데이터 오류!`);
      }
      if (kw.goldenRatio > 100) {
        console.log(`  🔥 황금비율 ${ratio} - 초황금 키워드!`);
      }
    }

    // 데이터 품질 검증
    console.log('\n\n📋 데이터 품질 검증:');
    const allKeywords = result.keywords || [];
    const zeroDocCount = allKeywords.filter(k => k.documentCount === 0).length;
    const superGolden = allKeywords.filter(k => k.goldenRatio > 100).length;
    const validKeywords = allKeywords.filter(k => k.documentCount > 0).length;

    console.log(`- 문서수 0인 키워드: ${zeroDocCount}개`);
    console.log(`- 초황금 키워드 (비율 100+): ${superGolden}개 🔥`);
    console.log(`- 유효한 키워드: ${validKeywords}개`);

    // 🆕 스마트블록 키워드 메트릭스 출력
    if (result.smartBlockKeywordsWithMetrics && result.smartBlockKeywordsWithMetrics.length > 0) {
      console.log(`\n\n🎯 스마트블록 추천 키워드 (메트릭스 포함): ${result.smartBlockKeywordsWithMetrics.length}개`);
      for (const sbKw of result.smartBlockKeywordsWithMetrics.slice(0, 5)) {
        console.log(`  📌 ${sbKw.keyword}`);
        console.log(`     검색량: ${sbKw.searchVolume ?? '?'}, 문서수: ${sbKw.documentCount ?? '?'}, 황금비율: ${sbKw.goldenRatio?.toFixed(2) || '?'}`);
      }
    } else if (result.smartBlockKeywords && result.smartBlockKeywords.length > 0) {
      console.log(`\n\n🎯 스마트블록 키워드: ${result.smartBlockKeywords.length}개`);
      console.log(`   ${result.smartBlockKeywords.slice(0, 5).join(', ')}`);
    }

    if (zeroDocCount > 0) {
      console.log('\n❌ 데이터 품질 문제 발견!');
    } else {
      console.log('\n✅ 데이터 품질 양호!');
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  }
}

testProHunter();
