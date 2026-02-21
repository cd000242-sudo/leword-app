/**
 * 검색량 차이 디버깅 테스트
 */

const { EnvironmentManager } = require('./dist/utils/environment-manager');
const { getNaverSearchAdKeywordVolume } = require('./dist/utils/naver-searchad-api');

async function testSearchVolume() {
  try {
    console.log('=== 검색량 테스트 시작 ===\n');
    
    // 환경 변수 로드
    const envManager = EnvironmentManager.getInstance();
    const env = envManager.getConfig();
    
    console.log('API 키 확인:');
    console.log('- Access License:', env.naverSearchAdAccessLicense ? '설정됨' : '없음');
    console.log('- Secret Key:', env.naverSearchAdSecretKey ? '설정됨' : '없음');
    console.log('- Customer ID:', env.naverSearchAdCustomerId || '없음');
    console.log('');
    
    if (!env.naverSearchAdAccessLicense || !env.naverSearchAdSecretKey) {
      console.error('❌ 검색광고 API 키가 설정되지 않았습니다.');
      return;
    }
    
    const config = {
      accessLicense: env.naverSearchAdAccessLicense,
      secretKey: env.naverSearchAdSecretKey,
      customerId: env.naverSearchAdCustomerId
    };
    
    console.log('=== "박나래" 키워드 검색량 조회 ===\n');
    
    const result = await getNaverSearchAdKeywordVolume(config, ['박나래']);
    
    console.log('\n=== 결과 ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result && result.length > 0) {
      const data = result[0];
      console.log('\n=== 요약 ===');
      console.log(`키워드: ${data.keyword}`);
      console.log(`PC 검색량: ${data.pcSearchVolume?.toLocaleString() || 0}`);
      console.log(`모바일 검색량: ${data.mobileSearchVolume?.toLocaleString() || 0}`);
      console.log(`총 검색량: ${data.totalSearchVolume?.toLocaleString() || 0}`);
      console.log(`monthlyPcQcCnt: ${data.monthlyPcQcCnt?.toLocaleString() || 0}`);
      console.log(`monthlyMobileQcCnt: ${data.monthlyMobileQcCnt?.toLocaleString() || 0}`);
    }
    
  } catch (error) {
    console.error('오류:', error);
  }
}

testSearchVolume();



