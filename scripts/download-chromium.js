/**
 * 🔧 Puppeteer Chromium 자동 다운로드 스크립트
 * 
 * npm install 후 자동 실행되어 Chromium을 다운로드합니다.
 */

const path = require('path');
const fs = require('fs');

async function downloadChromium() {
  console.log('\n🔍 Chromium 상태 확인 중...\n');

  try {
    // puppeteer 모듈 로드
    const puppeteer = require('puppeteer');
    
    // executablePath 확인
    const execPath = puppeteer.executablePath();
    
    if (execPath && fs.existsSync(execPath)) {
      console.log('✅ Chromium이 이미 설치되어 있습니다.');
      console.log(`   경로: ${execPath}\n`);
      return;
    }

    console.log('⏳ Chromium 다운로드 중... (이 과정은 시간이 걸릴 수 있습니다)\n');

    // Puppeteer의 내장 다운로드 기능 사용
    const { downloadBrowser } = require('puppeteer/lib/cjs/puppeteer/node/install.js');
    await downloadBrowser();

    console.log('\n✅ Chromium 다운로드 완료!\n');

  } catch (error) {
    // 설치 실패해도 시스템 Chrome으로 대체 가능
    console.log('\n⚠️ Chromium 자동 다운로드 실패');
    console.log('   시스템에 Chrome이 설치되어 있으면 정상 작동합니다.');
    console.log(`   에러: ${error.message}\n`);
  }
}

// 실행
downloadChromium().catch(console.error);






