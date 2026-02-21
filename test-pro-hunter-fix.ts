
import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';

async function testCelebCategory() {
    console.log('🧪 Testing Celeb Category Filtering...');

    // 1. 직접 함수 호출로 테스트 (private 함수라서 직접 호출은 어렵고, huntProTrafficKeywords를 통해 간접 테스트)
    // 대신, 모듈을 직접 import해서 테스트하는 것이 가장 확실하지만, private 함수라 export가 안되어 있을 수 있음.
    // 여기서는 huntProTrafficKeywords를 호출하고 로그를 확인하거나, 결과를 분석하는 방식으로 진행.

    // 가짜 시드 키워드를 주입하여 필터링 되는지 확인
    const testKeywords = ['사과', '바나나', '서울', '책상', '아이유', '방탄소년단', '뉴진스', '컴백', '열애'];

    console.log('🔍 Hunting with test keywords (category: celeb)...');

    const result = await huntProTrafficKeywords({
        mode: 'category',
        category: 'celeb',
        count: 20,
        seedKeywords: testKeywords,
        forceRefresh: true,
        explosionMode: false // 일반 모드로 테스트
    });

    console.log(`✅ Result Count: ${result.keywords.length}`);

    const falsePositives = result.keywords.filter(k =>
        ['사과', '바나나', '서울', '책상'].some(bad => k.keyword.includes(bad))
    );

    const truePositives = result.keywords.filter(k =>
        ['아이유', '방탄소년단', '뉴진스', '컴백', '열애'].some(good => k.keyword.includes(good))
    );

    console.log('🚫 False Positives (Should be empty):', falsePositives.map(k => k.keyword));
    console.log('✅ True Positives (Should contain celeb keywords):', truePositives.map(k => k.keyword));

    if (falsePositives.length === 0) {
        console.log('✨ SUCCESS: No false positives found!');
    } else {
        console.error('❌ FAILURE: False positives found!');
    }
}

testCelebCategory().catch(console.error);
