/**
 * 🌟 연예인 키워드 벤치마크 스나이퍼 테스트
 */

import { benchmarkSniperPro } from './src/utils/benchmark-sniper';

async function testCelebSniper() {
    console.log('🌟 연예인 키워드 상위 블로거 추적 테스트\n');

    // 실제 연예인 관련 황금 키워드
    const celebKeywords = [
        '아이유 콘서트 2025',
        '방탄소년단 컴백',
        '뉴진스 하니',
        '임영웅 신곡',
        '손흥민 연봉'
    ];

    console.log(`📋 분석 키워드: ${celebKeywords.join(', ')}\n`);

    const results = await benchmarkSniperPro(celebKeywords);

    console.log('\n' + '='.repeat(60));
    console.log('🏆 TOP 벤치마킹 대상 블로거');
    console.log('='.repeat(60));

    for (const r of results) {
        console.log(`\n${r.rank_type}`);
        console.log(`👤 이름: ${r.name}`);
        console.log(`📊 점수: ${r.score}점`);
        console.log(`🔑 주요 키워드: ${r.main_keywords}`);
        console.log(`📝 제목 패턴:`);
        r.title_patterns.forEach((t, i) => console.log(`   ${i + 1}. ${t?.substring(0, 60)}...`));
        console.log(`🔗 URL: ${r.url}`);
        console.log(`💡 조언: ${r.advice}`);
    }

    console.log('\n✅ 테스트 완료!');
}

testCelebSniper();
