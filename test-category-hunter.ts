
import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';
import { EnvironmentManager } from './src/utils/environment-manager';

async function runCategoryTest() {
    console.log('🧪 카테고리별 황금키워드 발굴 테스트 (Traffic Keyword Hunter)');

    // 1. 테스트할 카테고리 목록 (유저 요청: 비즈니스 경제 지원금)
    const categories = ['business'];

    // 환경 설정 (Private 접근)
    const env = EnvironmentManager.getInstance();

    // 강제 설정 (Mock) - 기존 설정 유지 (API 키 보존)
    const currentConfig = (env as any).config;
    (env as any).config = {
        ...currentConfig,
        mockDate: '2025-12-31'
    };

    console.log(`[Test] Config Updated. MockDate: ${(env as any).config.mockDate}`);

    for (const cat of categories) {
        console.log(`\n\n==================================================`);
        console.log(`📂 카테고리: ${cat.toUpperCase()}`);
        console.log(`==================================================`);

        try {
            // 카테고리별 5개 추출 (배치 처리 검증: 5개 = 1 API Call)
            const results: any = await huntProTrafficKeywords({
                mode: 'realtime', // or 'mix'
                category: cat,
                count: 5,
                excludeKeywords: [],
                forceRefresh: true
            } as any);

            let keywords: any[] = [];
            if (Array.isArray(results)) {
                keywords = results;
            } else if (results.keywords) {
                keywords = results.keywords;
            } else if (results.data) {
                keywords = results.data;
            }

            if (!keywords || keywords.length === 0) {
                console.log('⚠️ 결과 없음 (API 제한 또는 로직 문제 가능)');
                continue;
            }

            console.log(`✅ 발굴된 키워드 (${keywords.length}개):`);
            keywords.slice(0, 10).forEach((kw: any, i: number) => {
                console.log(`\n[${i + 1}] ${kw.keyword} (${kw.grade})`);
                console.log(`   - 검색량/문서수: ${kw.searchVolume} / ${kw.documentCount}`);
                console.log(`   - 황금비율: ${kw.goldenRatio?.toFixed(1)}%`);
                console.log(`   - 스마트블록: ${kw.smartBlockAnalysis?.type || 'N/A'}`);
            });

        } catch (e) {
            console.error(`❌ 테스트 실패 (${cat}):`, e);
        }
    }
}

runCategoryTest();
