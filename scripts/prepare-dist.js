/**
 * 배포 전 초기화 스크립트
 * - API 키 초기화
 * - 라이선스 정보 초기화
 * - 캐시 파일 삭제
 * - 개발환경 설정 제거
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔧 배포 전 초기화 시작...\n');

// 프로젝트 루트 경로
const projectRoot = path.join(__dirname, '..');

// 1. dist 폴더의 config.json이 있다면 삭제 (빌드 후 생성될 수 있음)
const distConfigPath = path.join(projectRoot, 'dist', 'config.json');
if (fs.existsSync(distConfigPath)) {
  fs.unlinkSync(distConfigPath);
  console.log('✅ dist/config.json 삭제됨');
}

// 2. ui 폴더의 config.json 삭제 (사용자 설정 제거)
const uiConfigPath = path.join(projectRoot, 'ui', 'config.json');
if (fs.existsSync(uiConfigPath)) {
  fs.unlinkSync(uiConfigPath);
  console.log('✅ ui/config.json 삭제됨');
}

// 3. AppData의 leword-app 폴더에서 설정 파일 삭제 (개발환경 설정 제거)
const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const lewordAppDataPath = path.join(appDataPath, 'leword-app');
const bloggerAdminPath = path.join(appDataPath, 'blogger-admin-panel');

// leword-app 폴더 정리
if (fs.existsSync(lewordAppDataPath)) {
  const filesToDelete = ['config.json', 'license.json', 'cache.json'];
  for (const file of filesToDelete) {
    const filePath = path.join(lewordAppDataPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ AppData/leword-app/${file} 삭제됨`);
    }
  }
}

// leword 폴더 정리 (Electron 앱 userData 경로)
const lewordPath = path.join(appDataPath, 'leword');
if (fs.existsSync(lewordPath)) {
  const filesToDelete = ['config.json', 'license.json', 'cache.json'];
  for (const file of filesToDelete) {
    const filePath = path.join(lewordPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ AppData/leword/${file} 삭제됨`);
    }
  }
  // license 폴더도 삭제
  const licensePath = path.join(lewordPath, 'license');
  if (fs.existsSync(licensePath)) {
    fs.rmSync(licensePath, { recursive: true, force: true });
    console.log('✅ AppData/leword/license 폴더 삭제됨');
  }
}

// blogger-admin-panel 폴더 정리
if (fs.existsSync(bloggerAdminPath)) {
  const filesToDelete = ['config.json', 'license.json', 'cache.json'];
  for (const file of filesToDelete) {
    const filePath = path.join(bloggerAdminPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ AppData/blogger-admin-panel/${file} 삭제됨`);
    }
  }
}

// 4. 빈 config.json 생성 (배포 시 사용자가 직접 설정하도록)
const emptyConfig = {
  openaiApiKey: '',
  geminiApiKey: '',
  pexelsApiKey: '',
  dalleApiKey: '',
  naverClientId: '',
  naverClientSecret: '',
  naverSearchAdAccessLicense: '',
  naverSearchAdSecretKey: '',
  naverSearchAdCustomerId: '',
  googleApiKey: '',
  googleCseKey: '',
  googleCseId: '',
  googleCseCx: '',
  youtubeApiKey: '',
  massCrawlingEnabled: false,
  maxConcurrentRequests: 5,
  maxResultsPerSource: 100,
  enableFullContentCrawling: false
};

// ui 폴더에 빈 default-config.json 생성
const defaultConfigPath = path.join(projectRoot, 'ui', 'default-config.json');
fs.writeFileSync(defaultConfigPath, JSON.stringify(emptyConfig, null, 2), 'utf-8');
console.log('✅ ui/default-config.json 생성됨 (빈 API 키)');

// 5. 테스트 파일들 삭제
const testFiles = [
  'test-crawler.ts',
  'test-policy-briefing.ts',
  'test-free-features.ts',
  'test-realtime-trend.ts',
  'test-naver-trend.ts',
  'test-pro-traffic.js'
];

testFiles.forEach(file => {
  const filePath = path.join(projectRoot, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`✅ ${file} 삭제됨`);
  }
});

// 6. .env 파일이 있다면 배포에 포함되지 않도록 확인
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  console.log('⚠️ .env 파일이 존재합니다. 배포에 포함되지 않는지 확인하세요.');
}

// 7. package.json의 build 설정에서 민감한 파일 제외 확인
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

if (packageJson.build && packageJson.build.files) {
  console.log('\n📦 빌드에 포함되는 파일:');
  packageJson.build.files.forEach(f => console.log(`   - ${f}`));
}

// 8. release 폴더 정리 (삭제 실패 시 무시)
const releasePath = path.join(projectRoot, 'release');
if (fs.existsSync(releasePath)) {
  console.log('\n🗑️ 기존 release 폴더 삭제 시도...');
  try {
    fs.rmSync(releasePath, { recursive: true, force: true });
    console.log('✅ release 폴더 삭제됨');
  } catch (err) {
    console.log('⚠️ release 폴더 삭제 실패 (사용 중일 수 있음). 계속 진행합니다.');
  }
}

// 9. Chromium 번들 복사 (v2.44.0)
//   ~/.cache/puppeteer/chrome/{ver}/chrome-win64/ → resources/chromium/
//   사용자 PC에 Chrome/Chromium이 없거나 백신이 시스템 chrome.exe spawn을 차단해도
//   앱 내장 Chromium으로 puppeteer 동작 보장.
console.log('\n🌐 Chromium 번들 준비...');

const platform = process.platform;
const chromiumDest = path.join(projectRoot, 'resources', 'chromium');
const execName = platform === 'win32'
  ? 'chrome.exe'
  : platform === 'darwin'
    ? path.join('Chromium.app', 'Contents', 'MacOS', 'Chromium')
    : 'chrome';

function findPuppeteerChromiumSrc() {
  try {
    const puppeteer = require('puppeteer');
    if (typeof puppeteer.executablePath === 'function') {
      const execPath = puppeteer.executablePath();
      if (execPath && fs.existsSync(execPath)) {
        // chrome-win64 또는 chrome-mac 폴더(실행파일의 최상위 디렉토리) 반환
        // win32: dirname(chrome.exe) = chrome-win64
        // darwin: dirname^4(...MacOS/Chromium) = chrome-mac
        if (platform === 'win32') return path.dirname(execPath);
        if (platform === 'darwin') {
          // .../chrome-mac/Chromium.app/Contents/MacOS/Chromium → .../chrome-mac
          return path.resolve(execPath, '..', '..', '..', '..');
        }
        return path.dirname(execPath);
      }
    }
  } catch (e) {
    console.warn('   ⚠️ puppeteer require 실패:', e.message);
  }
  return null;
}

let chromiumSrc = findPuppeteerChromiumSrc();
if (!chromiumSrc) {
  console.log('   ⏳ Puppeteer Chromium 미발견 → download-chromium.js 실행');
  const { execSync } = require('child_process');
  try {
    execSync('node scripts/download-chromium.js', { cwd: projectRoot, stdio: 'inherit' });
    chromiumSrc = findPuppeteerChromiumSrc();
  } catch (err) {
    console.error('   ❌ Chromium 자동 다운로드 실패:', err.message);
  }
}

if (!chromiumSrc) {
  console.error('\n❌ Chromium을 찾을 수 없습니다. 다음 중 하나를 실행하세요:');
  console.error('   1. npm install (postinstall이 Chromium 다운로드)');
  console.error('   2. node scripts/download-chromium.js (수동)');
  console.error('   3. node node_modules/puppeteer/install.js (직접)\n');
  process.exit(1);
}

// 기존 resources/chromium 정리 후 복사
if (fs.existsSync(chromiumDest)) {
  console.log('   🧹 기존 resources/chromium 정리');
  fs.rmSync(chromiumDest, { recursive: true, force: true });
}
fs.mkdirSync(chromiumDest, { recursive: true });

console.log(`   📦 복사 시작...`);
console.log(`      원본: ${chromiumSrc}`);
console.log(`      대상: ${chromiumDest}`);
const copyStart = Date.now();
fs.cpSync(chromiumSrc, chromiumDest, { recursive: true });
const copyMs = Date.now() - copyStart;

// 검증 — 실행 파일 존재 확인
const destExe = path.join(chromiumDest, execName);
if (!fs.existsSync(destExe)) {
  console.error(`   ❌ 복사 검증 실패: ${destExe} 없음`);
  console.error('   chromiumSrc 구조 확인 필요');
  process.exit(1);
}

// 크기 출력
const stat = fs.statSync(destExe);
const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Chromium 번들 완료 — chrome.exe: ${sizeMb} MB, 복사 ${(copyMs / 1000).toFixed(1)}s`);
console.log('   ℹ️  설치 파일 크기 +200~300MB');

// 10. 라이선스 초기화 확인 메시지
console.log('\n📋 배포 전 체크리스트:');
console.log('   ✓ API 키 초기화 완료');
console.log('   ✓ 라이선스 파일 삭제 완료');
console.log('   ✓ 테스트 파일 삭제 완료');
console.log('   ✓ 기본 설정 파일 생성 완료');

console.log('\n✨ 배포 전 초기화 완료!\n');
console.log('다음 명령어로 배포 패키지를 생성하세요:');
console.log('  npm run dist:win\n');
