import { MDPEngine } from './src/utils/mdp-engine';
import { EnvironmentManager } from './src/utils/environment-manager';
import * as path from 'path';

async function verifyMDPV2() {
    console.log('--- MDP v2.0 Deep Intelligence Verification ---');

    const envMan = EnvironmentManager.getInstance();
    const config = envMan.getConfig();
    const clientId = config.naverClientId;
    const clientSecret = config.naverClientSecret;

    if (!clientId || !clientSecret) {
        console.error('❌ Error: Naver API keys are missing in EnvironmentManager/config.json');
        return;
    }

    const engine = new MDPEngine({ clientId, clientSecret });
    const testKeyword = '아이폰 16 프로'; // 상업성 + 최신 트렌드 키워드

    console.log(`🔍 Testing keyword: "${testKeyword}"`);
    console.log('------------------------------------------------');

    let count = 0;
    try {
        // limit 10으로 설정하여 성능 및 데이터 정확성 확인
        for await (const result of engine.discover(testKeyword, { limit: 10, minVolume: 100 })) {
            count++;
            console.log(`[Result ${count}] Keyword: ${result.keyword}`);
            console.log(`   - Intent: ${result.intentBadge} ${result.intent}`);
            console.log(`   - Volume: ${result.searchVolume.toLocaleString()}, Docs: ${result.documentCount.toLocaleString()}`);
            console.log(`   - Golden Ratio: ${result.goldenRatio}`);
            console.log(`   - SERP: SmartBlock(${result.hasSmartBlock}), Influencer(${result.hasInfluencer})`);
            console.log(`   - Difficulty: ${result.difficultyScore} / 10`);
            console.log(`   - Monetization: CVI(${result.cvi}), Est.CPC(₩${result.cpc?.toLocaleString()})`);
            console.log(`   - Final Score: ${result.score}`);
            console.log('------------------------------------------------');

            if (count >= 5) break;
        }
        console.log(`✅ Verification completed. Found ${count} samples.`);
    } catch (err) {
        console.error('❌ Verification failed:', err);
    }
}

verifyMDPV2();
