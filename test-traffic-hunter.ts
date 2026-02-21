/**
 * 트래픽 헌터 테스트 스크립트
 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);

 * 황금 키워드 (검색량 높고 + 경쟁도 낮음) 우선 발굴 테스트
 */

import { TimingGoldenFinder, KeywordData, TimingScore } from './src/utils/timing-golden-finder';

// 테스트용 키워드 데이터 생성
function createTestKeyword(
  keyword: string,
  searchVolume: number,
  documentCount: number,
  growthRate: number = 50,
  hoursAgo: number = 24
): KeywordData {
  return {
    keyword,
    searchVolume,
    documentCount,
    growthRate,
    firstSeenDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    category: '테스트',
    source: 'test'
  };
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('🏆 황금 키워드 발굴 테스트');
  console.log('='.repeat(70));
  console.log('\n📌 황금 키워드 = 검색량 높고 + 경쟁도 낮음!\n');

  const finder = new TimingGoldenFinder();

  // 테스트 케이스들 (황금 키워드 우선)
  const testCases = [
    {
      name: '💎 초황금 키워드 (검색량 5000 / 문서 30개)',
      keyword: createTestKeyword('새로운 다이어트 방법 2025', 5000, 30, 100)
    },
    {
      name: '🏆 황금 키워드 (검색량 3000 / 문서 100개)',
      keyword: createTestKeyword('맥북 M4 프로 비교 후기', 3000, 100, 80)
    },
    {
      name: '⭐ 좋은 키워드 (검색량 2000 / 문서 200개)',
      keyword: createTestKeyword('아이폰16 케이스 추천', 2000, 200, 50)
    },
    {
      name: '⚠️ 경쟁 높은 키워드 (검색량 10000 / 문서 5000개)',
      keyword: createTestKeyword('다이어트', 10000, 5000, 10)
    },
    {
      name: '❌ 레드오션 키워드 (검색량 50000 / 문서 20000개)',
      keyword: createTestKeyword('맛집', 50000, 20000, 5)
    },
    {
      name: '🔥 이슈성 키워드 (급상승)',
      keyword: createTestKeyword('트럼프 관세 발표', 15000, 50, 450, 3)
    }
  ];

  const results: Array<{name: string; result: TimingScore}> = [];

  for (const testCase of testCases) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`${'━'.repeat(70)}`);
    
    const result = finder.calculateTimingGoldScore(testCase.keyword);
    results.push({ name: testCase.name, result });
    
    displayResult(result);
  }

  // 점수 순으로 정렬
  console.log('\n' + '='.repeat(70));
  console.log('🏆 황금 키워드 순위 (점수 순)');
  console.log('='.repeat(70));
  
  results.sort((a, b) => b.result.timingGoldScore - a.result.timingGoldScore);
  
  results.forEach((item, i) => {
    const r = item.result;
    const goldenRatio = r.documentCount > 0 ? (r.searchVolume / r.documentCount).toFixed(1) : '∞';
    const emoji = r.keywordType?.emoji || '📝';
    const label = r.keywordType?.label || '일반';
    
    console.log(`\n${i + 1}. ${emoji} ${r.keyword}`);
    console.log(`   유형: ${label}`);
    console.log(`   점수: ${r.timingGoldScore}점`);
    console.log(`   황금비율: ${goldenRatio} (검색량 ${r.searchVolume.toLocaleString()} / 문서 ${r.documentCount.toLocaleString()})`);
    console.log(`   예상 수익: ${(r.monetizationGuide?.estimatedMonthlyRevenue || 0).toLocaleString()}원/월`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료!');
  console.log('='.repeat(70));
  console.log('\n💡 황금 키워드는 황금비율(검색량/문서수)이 높고 문서수가 적은 키워드입니다.');
  console.log('   초황금(💎) > 황금(🏆) > 이슈성(🔥) > 롱테일(🎯) > 시즌성(📅) > 숏테일(📊) > 에버그린(🌱)');
}

function displayResult(result: TimingScore) {
  const goldenRatio = result.documentCount > 0 
    ? (result.searchVolume / result.documentCount).toFixed(2) 
    : '∞';
  
  console.log(`\n🔑 키워드: "${result.keyword}"`);
  
  if (result.keywordType) {
    console.log(`${result.keywordType.emoji} 유형: ${result.keywordType.label}`);
    console.log(`📝 ${result.keywordType.description}`);
  }
  
  console.log(`\n📊 황금 분석:`);
  console.log(`  • 황금 비율: ${goldenRatio} (검색량/문서수)`);
  console.log(`  • 검색량: ${result.searchVolume.toLocaleString()}회/월`);
  console.log(`  • 경쟁 문서: ${result.documentCount.toLocaleString()}개`);
  console.log(`  • 타이밍 골드 점수: ${result.timingGoldScore}점`);
  
  if (result.monetizationGuide) {
    console.log(`\n💰 수익 분석:`);
    console.log(`  • 예상 월 수익: ${result.monetizationGuide.estimatedMonthlyRevenue.toLocaleString()}원`);
    console.log(`  • 💡 ${result.monetizationGuide.revenueStrategy}`);
  }
  
  if (result.expansionKeywords && result.expansionKeywords.length > 0) {
    console.log(`\n🔗 확장 키워드 (상위 5개):`);
    result.expansionKeywords.slice(0, 5).forEach((exp, i) => {
      const diffEmoji = exp.difficulty === 'easy' ? '🟢' : exp.difficulty === 'medium' ? '🟡' : '🔴';
      console.log(`  ${i + 1}. ${diffEmoji} "${exp.keyword}"`);
    });
  }
}

runTest().catch(console.error);
