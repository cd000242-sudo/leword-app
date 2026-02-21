/**
 * 🔥 트래픽 폭발 키워드 헌터 테스트
 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });


 */

const path = require('path');
const fs = require('fs');

async function testTrafficExplosionHunter() {
  console.log('\n' + '🔥'.repeat(30));
  console.log('🔥 트래픽 폭발 키워드 헌터 테스트');
  console.log('🔥'.repeat(30) + '\n');
  
  // 설정 로드
  const configPaths = [
    path.join(process.env.APPDATA, 'blogger-admin-panel', 'config.json'),
    path.join(process.env.APPDATA, 'blogger-gpt-cli', 'config.json'),
  ];
  
  let config = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`[CONFIG] 설정 파일 발견: ${configPath}`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  }
  
  if (!config) {
    throw new Error('config.json 파일을 찾을 수 없습니다.');
  }
  
  console.log('\n[API 키 확인]');
  console.log(`- Access License: ${config.naverSearchAdAccessLicense?.substring(0, 20)}...`);
  console.log(`- Secret Key: ${config.naverSearchAdSecretKey?.substring(0, 15)}...`);
  console.log(`- Customer ID: ${config.naverSearchAdCustomerId}`);
  
  // TrafficExplosionHunter 로드
  const { TrafficExplosionHunter } = require('./dist/utils/traffic-explosion-hunter.js');
  
  console.log('\n[TrafficExplosionHunter 인스턴스 생성]');
  const hunter = new TrafficExplosionHunter({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId
  });
  
  console.log('\n[헌팅 시작 - 정책자금/지원금 롱테일 꿀통 키워드 찾기]');
  
  const startTime = Date.now();
  
  // 구체적인 시드 키워드 지정 (정책/지원금 + 롱테일)
  const result = await hunter.huntTrafficExplosionKeywords({
    seedKeywords: [
      '민생지원금', '상생페이백', '청년월세지원', '전기차보조금',
      '출산지원금', '육아휴직급여', '근로장려금', '에너지바우처',
      '청년도약계좌', '신혼부부전세대출', '디딤돌대출',
      '연말정산', '건강보험료', '퇴직금계산'
    ],
    useRealtimeTrend: false,  // 실시간 트렌드 OFF (정확한 시드 키워드 사용)
    expansionDepth: 1,
    targetCount: 20,
    minSearchVolume: 50,  // 더 낮은 검색량도 허용 (틈새 키워드 발굴)
    minGoldenRatio: 2
  });
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 최종 결과');
  console.log('='.repeat(60));
  console.log(`- 분석된 키워드: ${result.totalAnalyzed}개`);
  console.log(`- 발견된 황금 키워드: ${result.totalFound}개`);
  console.log(`- 소요 시간: ${(duration / 1000).toFixed(1)}초`);
  console.log(`- 전략: ${result.strategy}`);
  
  if (result.keywords.length > 0) {
    console.log('\n' + '🏆'.repeat(20));
    console.log('🏆 TOP 10 트래픽 폭발 키워드');
    console.log('🏆'.repeat(20) + '\n');
    
    result.keywords.slice(0, 10).forEach((kw, i) => {
      console.log(`${i + 1}. [${kw.rank}] ${kw.keyword}`);
      console.log(`   점수: ${kw.trafficExplosionScore} | 검색량: ${kw.searchVolume?.toLocaleString()} | 문서수: ${kw.documentCount?.toLocaleString()}`);
      console.log(`   황금비율: ${kw.goldenRatio?.toFixed(1)} | 경쟁: ${kw.competition} | 상위노출: ${kw.topExposurePotential}%`);
      console.log(`   CPC점수: ${kw.cpcScore} | 수익화: ${kw.monetizationPotential}`);
      console.log(`   📝 ${kw.recommendation}`);
      console.log('');
    });
    
    console.log('\n✅ 테스트 성공!');
  } else {
    console.log('\n⚠️ 키워드를 찾지 못했습니다.');
  }
  
  return result;
}

testTrafficExplosionHunter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ 테스트 실패:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

