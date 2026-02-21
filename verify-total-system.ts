import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';

async function verifyTotalSystem() {
    console.log('🚀 [PRO 2.0] 통합 시스템 전수 검증 시작 (v11.4)');
    console.log('--------------------------------------------------');

    const testCases = [
        { name: '🛡️ 위험 분석 (보험)', options: { mode: 'category', seedKeywords: ['실비보험'], count: 1 } },
        { name: '❄️ 시즌 체감 (생활꿀팁)', options: { mode: 'category', category: 'life_tips', count: 3 } },
        { name: '💰 지원금 특화', options: { mode: 'category', category: 'grant', count: 3 } },
        { name: '🚀 스타 선점 (얼리버드)', options: { mode: 'category', category: 'celeb', count: 3 } }
    ];

    for (const tc of testCases) {
        try {
            console.log(`\n[검증 대상: ${tc.name}]`);
            const result = await huntProTrafficKeywords({
                ...tc.options,
                forceRefresh: true
            } as any);

            if (result.keywords.length === 0) {
                console.log('⚠️ 발굴된 키워드가 없습니다. (API 레이트 리밋 또는 데이터 부족)');
                continue;
            }

            result.keywords.forEach((kw, i) => {
                let labels = [];
                if (kw.riskAnalysis?.level !== 'safe') labels.push(`[${kw.riskAnalysis?.level?.toUpperCase()}]`);
                if (kw.blueOcean?.isNiche) labels.push('[🎯 NICHE]');
                if (kw.blueOcean?.isEarlyBird) labels.push('[🚀 EARLY BIRD]');

                console.log(`[${i + 1}] ${kw.keyword} (SV: ${kw.searchVolume}, DC: ${kw.documentCount}, Grade: ${kw.grade}) ${labels.join(' ')}`);

                if (kw.blueOcean?.issueForecast) console.log(`   💡 AI 예보: ${kw.blueOcean.issueForecast}`);
                if (kw.riskAnalysis?.warningMessage) console.log(`   ⚠️ 경고: ${kw.riskAnalysis.warningMessage}`);
            });

            // 약간의 대기 (API 부하 방지)
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`❌ ${tc.name} 테스트 중 오류:`, error);
        }
    }

    console.log('\n--------------------------------------------------');
    console.log('✅ 전수 검증 프로세스 완료!');
}

verifyTotalSystem();
