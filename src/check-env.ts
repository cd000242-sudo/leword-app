
import { EnvironmentManager } from './utils/environment-manager';
import { testNaverApiConnection } from './utils/environment-manager';

async function checkEnv() {
    console.log('🔍 환경변수 진단 및 API 연결 테스트 시작...\n');

    const envMan = EnvironmentManager.getInstance();
    const config = envMan.getConfig();

    console.log('📋 현재 설정 상태:');
    console.log('--------------------------------------------------');
    console.log(`- 네이버 Client ID: ${config.naverClientId ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- 네이버 Client Secret: ${config.naverClientSecret ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- 네이버 검색광고 Access License: ${config.naverSearchAdAccessLicense ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- 네이버 검색광고 Secret Key: ${config.naverSearchAdSecretKey ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- 네이버 검색광고 Customer ID: ${config.naverSearchAdCustomerId ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- Gemini API Key: ${config.geminiApiKey ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log(`- YouTube API Key: ${config.youtubeApiKey ? '✅ (설정됨)' : '❌ (미설정)'}`);
    console.log('--------------------------------------------------\n');

    if (config.naverClientId && config.naverClientSecret) {
        console.log('🌐 네이버 API 연결 테스트 중...');
        const naverTest = await testNaverApiConnection();
        console.log(`- 결과: ${naverTest.success ? '✅ 성공' : '❌ 실패'}`);
        console.log(`- 메시지: ${naverTest.message}`);
        if (naverTest.data) {
            console.log(`- 샘플 데이터: ${JSON.stringify(naverTest.data)}`);
        }
    } else {
        console.log('⚠️ 네이버 API 키가 설정되지 않아 연결 테스트를 건너뜁니다.');
    }
}

checkEnv().catch(err => {
    console.error('❌ 진단 중 에러 발생:', err);
});
