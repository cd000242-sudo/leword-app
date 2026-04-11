// LEWORD 독립 앱 - 메인 프로세스
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// EPIPE 에러 방지 (stdout/stderr 닫힌 후 write 시도 시)
process.stdout?.on?.('error', (err: any) => { if (err?.code === 'EPIPE') return; });
process.stderr?.on?.('error', (err: any) => { if (err?.code === 'EPIPE') return; });
// File API polyfill for Electron (undici 호환성)
if (typeof globalThis.File === 'undefined') {
  // Blob polyfill 먼저
  if (typeof globalThis.Blob === 'undefined') {
    (globalThis as any).Blob = class Blob {
      constructor(public parts: any[] = [], public options: any = {}) { }
      get size() { return 0; }
      get type() { return this.options.type || ''; }
      slice() { return new Blob(); }
      stream() { return null; }
      text() { return Promise.resolve(''); }
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    };
  }

  // File polyfill
  (globalThis as any).File = class File extends (globalThis as any).Blob {
    private _name: string;
    constructor(parts: any[], name: string, options: any = {}) {
      super(parts, options);
      this._name = name;
    }
    get name() { return this._name; }
    get lastModified() { return Date.now(); }
  };
}

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { setupKeywordMasterHandlers } from './main/keywordMasterIpcHandlers';
import { setupPremiumHandlers } from './main/premiumFeatures';
import * as licenseManager from './utils/licenseManager';
import { checkInternetConnection, startNetworkMonitoring } from './utils/network-checker';
import { findChromePath, isChromeAvailable } from './utils/chrome-finder';

// 네트워크 모니터링 정리 함수
let stopNetworkMonitoring: (() => void) | null = null;

// userData 경로 설정 (admin-panel과 동일한 경로 사용)
function initAppPaths() {
  // admin-panel과 동일한 경로 사용 (라이선스 및 설정 공유)
  const fixed = path.join(app.getPath('appData'), 'blogger-admin-panel');
  app.setName('blogger-admin-panel');
  app.setPath('userData', fixed);
  try {
    fs.mkdirSync(fixed, { recursive: true });
    // license 디렉토리도 생성
    const licenseDir = path.join(fixed, 'license');
    fs.mkdirSync(licenseDir, { recursive: true });
  } catch { }
  console.log('[LEWORD] userData =', app.getPath('userData'));
  console.log('[LEWORD] License path =', path.join(app.getPath('userData'), 'license', 'license.json'));
}

let keywordWindow: BrowserWindow | null = null;

function createKeywordWindow() {
  if (keywordWindow) {
    keywordWindow.focus();
    return;
  }

  // 개발 모드: dist/src/main.js에서 실행됨 -> ../preload.js (dist/preload.js)
  // 프로덕션: resources/app.asar/dist/src/main.js -> ../preload.js
  let preloadPath = path.join(__dirname, '../preload.js');

  // preload.js가 없으면 다른 경로들을 시도
  if (!fs.existsSync(preloadPath)) {
    const alternatives = [
      path.join(__dirname, '../../preload.js'),
      path.join(__dirname, 'preload.js'),
      path.join(process.cwd(), 'dist/preload.js'),
      path.join(app.getAppPath(), 'dist/preload.js'),
    ];

    for (const altPath of alternatives) {
      if (fs.existsSync(altPath)) {
        preloadPath = altPath;
        console.log('[LEWORD] ✅ preload.js 발견:', preloadPath);
        break;
      }
    }
  }

  const htmlPath = path.join(__dirname, '../ui/keyword-master.html');

  console.log('[LEWORD] __dirname:', __dirname);
  console.log('[LEWORD] preloadPath:', preloadPath);
  console.log('[LEWORD] preload exists:', fs.existsSync(preloadPath));
  console.log('[LEWORD] htmlPath:', htmlPath);
  console.log('[LEWORD] html exists:', fs.existsSync(htmlPath));

  if (!fs.existsSync(preloadPath)) {
    console.error('[LEWORD] ❌ preload.js를 찾을 수 없습니다!');
    console.error('[LEWORD] 시도한 경로들:', [
      path.join(__dirname, '../preload.js'),
      path.join(__dirname, '../../preload.js'),
      path.join(__dirname, 'preload.js'),
      path.join(process.cwd(), 'dist/preload.js'),
      path.join(app.getAppPath(), 'dist/preload.js'),
    ]);
  }

  keywordWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'LEWORD - 키워드마스터',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
      webSecurity: true
    },
    backgroundColor: '#667eea',
    show: false,
    frame: true,
    autoHideMenuBar: true
  });

  // console.log('[LEWORD] preload script:', keywordWindow.webContents.getWebPreferences().preload);

  if (fs.existsSync(htmlPath)) {
    keywordWindow.loadFile(htmlPath);
  } else {
    keywordWindow.loadURL('data:text/html,<h1>LEWORD</h1><p>keyword-master.html을 찾을 수 없습니다.</p>');
  }

  // UI 콘솔 로그를 main 프로세스로 전달 (디버그용 - 배포 시 비활성화)
  if (!app.isPackaged) {
    keywordWindow.webContents.on('console-message', (_event, level, message) => {
      const levelStr = ['VERBOSE', 'LOG', 'WARN', 'ERROR'][level] || 'INFO';
      if (process.stdout.writable) {
        process.stdout.write(`[UI-${levelStr}] ${message}\n`);
      }
    });
  }

  keywordWindow.once('ready-to-show', () => {
    keywordWindow?.show();
  });

  keywordWindow.on('closed', () => {
    keywordWindow = null;
  });
}

// 라이선스 인증 함수
// 1개월 코드: 기본 기능 사용 가능
// 3개월 코드: 기본 기능 + 프리미엄 기능 사용 가능
// 기간 만료 시 앱 자동 종료
async function checkLicense(): Promise<boolean> {
  console.log('[LEWORD] 앱 시작 - 라이선스 인증 필수');

  // 개발 모드에서는 인증 없이 시작 (테스트용)
  if (!app.isPackaged) {
    console.log('[LEWORD] Development mode - 인증 건너뜀');
    return true;
  }

  // 저장된 라이선스 확인 (만료 체크만, 자동 인증 안 함)
  const license = await licenseManager.loadLicense();

  if (license && license.isValid) {
    // 저장된 라이선스가 있어도 자동 로그인 안 함 - 항상 로그인창 표시
    if (licenseManager.isLicenseExpired(license)) {
      console.log('[LEWORD] ⚠️ 저장된 라이선스 만료됨');
      // 만료된 경우 라이선스 삭제
      await licenseManager.clearLicense();

      // 만료 알림 표시
      dialog.showMessageBoxSync({
        type: 'warning',
        title: '라이선스 만료',
        message: '라이선스가 만료되었습니다.\n다시 로그인해주세요.',
        buttons: ['확인']
      });
    } else {
      console.log('[LEWORD] 저장된 라이선스 있음 (자동 로그인 비활성화 - 매번 로그인 필요)');
    }
  }

  // 라이선스 인증창 표시 (필수) - 인증될 때까지 반복
  while (true) {
    console.log('[LEWORD] 라이선스 인증창 표시');
    const authResult = await showLicenseInputDialog();

    if (!authResult) {
      console.log('[LEWORD] 라이선스 인증 취소됨');
      // 사용자에게 선택권 제공
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: '💎 LEWORD',
        message: '라이선스 인증이 필요합니다.\n인증 후 LEWORD를 사용할 수 있습니다.',
        buttons: ['다시 인증하기', '앱 종료'],
        defaultId: 0,
        cancelId: 1
      });

      if (choice === 1) {
        // 앱 종료 선택
        console.log('[LEWORD] 사용자가 앱 종료 선택');
        app.quit();
        return false;
      }
      continue; // 다시 인증창 표시
    }

    // 인증 성공 (showLicenseInputDialog에서 이미 검증 및 환영 화면 표시 완료)
    console.log('[LEWORD] ✅ 라이선스 인증 성공:', authResult.plan);
    return true;
  }
}

async function showLicenseInputDialog(): Promise<{ success: boolean; plan?: string; message?: string } | null> {
  // 저장된 라이선스에서 아이디 가져오기 (미리 채우기용)
  const savedLicense = await licenseManager.loadLicense();
  const savedUserId = savedLicense?.userId || '';
  const hasRegistered = !!savedUserId; // 이미 등록된 사용자인지

  return new Promise((resolve) => {
    // TODO: Refactor license window to use a preload script instead of nodeIntegration: true
    const licenseWindow = new BrowserWindow({
      width: 580,
      height: 720,
      resizable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      center: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const licenseHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>LEWORD 라이선스 인증</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Noto Sans KR', sans-serif;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-app-region: drag;
          }
          
          .container {
            background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
            padding: 44px 48px;
            border-radius: 24px;
            min-width: 480px;
            box-shadow: 
              0 25px 80px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(255, 255, 255, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
            position: relative;
            overflow: hidden;
            -webkit-app-region: no-drag;
          }
          
          .container::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: conic-gradient(from 0deg, transparent, rgba(251, 191, 36, 0.03), transparent 30%);
            animation: rotate 20s linear infinite;
          }
          
          @keyframes rotate {
            100% { transform: rotate(360deg); }
          }
          
          .content {
            position: relative;
            z-index: 1;
          }
          
          .logo-section {
            text-align: center;
            margin-bottom: 32px;
          }
          
          .diamond-icon {
            font-size: 56px;
            display: inline-block;
            animation: sparkle 3s ease-in-out infinite;
            filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5));
          }
          
          @keyframes sparkle {
            0%, 100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5)); }
            50% { transform: scale(1.05) rotate(5deg); filter: drop-shadow(0 0 30px rgba(251, 191, 36, 0.8)); }
          }
          
          .title {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fcd34d 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-top: 12px;
            letter-spacing: 3px;
          }
          
          .subtitle {
            color: rgba(255, 255, 255, 0.6);
            font-size: 13px;
            margin-top: 8px;
            font-weight: 300;
            letter-spacing: 1px;
          }
          
          .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.3), transparent);
            margin: 28px 0;
          }
          
          .input-group {
            margin-bottom: 20px;
          }
          
          label {
            display: block;
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          input {
            width: 100%;
            padding: 16px 20px;
            font-size: 15px;
            font-family: 'Noto Sans KR', sans-serif;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: white;
            transition: all 0.3s ease;
          }
          
          input::placeholder {
            color: rgba(255, 255, 255, 0.3);
          }
          
          input:focus {
            outline: none;
            border-color: #fbbf24;
            background: rgba(251, 191, 36, 0.05);
            box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.1);
          }
          
          .license-input {
            font-family: 'Courier New', monospace;
            letter-spacing: 2px;
            text-align: center;
            font-size: 16px;
          }
          
          .info-text {
            color: rgba(255, 255, 255, 0.4);
            font-size: 11px;
            margin-top: 8px;
            text-align: center;
          }
          
          .error-message {
            color: #f87171;
            font-size: 13px;
            margin-top: 12px;
            padding: 12px 16px;
            background: rgba(248, 113, 113, 0.1);
            border-radius: 8px;
            border-left: 3px solid #f87171;
            display: none;
          }
          
          .submit-btn {
            width: 100%;
            padding: 18px;
            font-size: 16px;
            font-weight: 600;
            font-family: 'Noto Sans KR', sans-serif;
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: #1a1a2e;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            margin-top: 24px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          
          .submit-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            transition: left 0.5s;
          }
          
          .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(251, 191, 36, 0.4);
          }
          
          .submit-btn:hover::before {
            left: 100%;
          }
          
          .submit-btn:active {
            transform: translateY(0);
          }
          
          .close-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 32px;
            height: 32px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 50%;
            color: rgba(255, 255, 255, 0.5);
            font-size: 18px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
          }
          
          .close-btn:hover {
            background: rgba(239, 68, 68, 0.3);
            color: #f87171;
          }
          
          .footer-text {
            text-align: center;
            margin-top: 24px;
            color: rgba(255, 255, 255, 0.3);
            font-size: 11px;
          }
          
          .footer-text a {
            color: #fbbf24;
            text-decoration: none;
          }
          
          .footer-text a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <button class="close-btn" id="close-btn">✕</button>
          
          <div class="content">
            <div class="logo-section">
              <div class="diamond-icon">💎</div>
              <div class="title">LEWORD</div>
              <div class="subtitle">Premium Keyword Master</div>
            </div>
            
            <div class="divider"></div>
            
            <div class="input-group">
              <label>아이디</label>
              <input type="text" id="user-id" placeholder="아이디를 입력하세요" value="${savedUserId}" />
            </div>
            
            <div class="input-group">
              <label>비밀번호</label>
              <input type="password" id="user-password" placeholder="비밀번호를 입력하세요" />
            </div>
            
            <div class="input-group">
              <label>라이선스 코드</label>
              <input type="text" id="license-input" class="license-input" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" />
              <div class="info-text">${hasRegistered ? '✅ 이미 등록된 사용자입니다. 비밀번호만 입력하세요!' : '최초 등록 시에만 코드가 필요합니다'}</div>
            </div>
            
            <div id="error" class="error-message"></div>
            
            <button class="submit-btn" id="submit-btn">
              💎 인증하기
            </button>
            
            <div class="footer-text">
              라이선스 문의: <a href="https://open.kakao.com/o/sPcaslwh" id="kakao-link">카카오톡 오픈채팅</a>
            </div>
          </div>
        </div>
        
        <script>
          const userIdInput = document.getElementById('user-id');
          const userPasswordInput = document.getElementById('user-password');
          const licenseInput = document.getElementById('license-input');
          const submitBtn = document.getElementById('submit-btn');
          const closeBtn = document.getElementById('close-btn');
          const error = document.getElementById('error');
          const kakaoLink = document.getElementById('kakao-link');
          
          kakaoLink.addEventListener('click', (e) => {
            e.preventDefault();
            require('electron').shell.openExternal('https://open.kakao.com/o/sPcaslwh');
          });
          
          closeBtn.addEventListener('click', () => {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('license:close');
          });
          
          licenseInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Z0-9]/g, '').toUpperCase();
            if (value.length > 4) value = value.slice(0,4) + '-' + value.slice(4);
            if (value.length > 9) value = value.slice(0,9) + '-' + value.slice(9);
            if (value.length > 14) value = value.slice(0,14) + '-' + value.slice(14);
            if (value.length > 19) value = value.slice(0,19);
            e.target.value = value;
          });
          
          submitBtn.addEventListener('click', () => {
            const userId = userIdInput.value.trim();
            const userPassword = userPasswordInput.value.trim();
            let code = licenseInput.value.trim();
            
            if (!userId && !userPassword && !code) {
              error.textContent = '아이디와 비밀번호를 입력해주세요.';
              error.style.display = 'block';
              return;
            }
            
            // 코드 형식 자동 변환 (하이픈 없이 입력해도 됨)
            if (code) {
              // 하이픈 제거 후 대문자로 변환
              let cleanCode = code.replace(/-/g, '').toUpperCase();
              
              // 16자리인지 확인
              if (cleanCode.length !== 16 || !/^[A-Z0-9]{16}$/.test(cleanCode)) {
                error.textContent = '라이선스 코드는 16자리 영문/숫자입니다.';
                error.style.display = 'block';
                return;
              }
              
              // 하이픈 추가하여 정규 형식으로 변환
              code = cleanCode.slice(0,4) + '-' + cleanCode.slice(4,8) + '-' + cleanCode.slice(8,12) + '-' + cleanCode.slice(12,16);
            }
            
            error.style.display = 'none';
            submitBtn.textContent = '인증 중...';
            submitBtn.disabled = true;
            
            try {
              console.log('[LICENSE-HTML] 인증 데이터 전송 시작');
              const { ipcRenderer } = require('electron');
              console.log('[LICENSE-HTML] ipcRenderer 로드 성공');
              
              // 인증 결과 수신 리스너 등록
              ipcRenderer.once('license:auth-result', (event, result) => {
                console.log('[LICENSE-HTML] 인증 결과 수신:', result);
                if (result.success) {
                  // 성공 시 환영 화면으로 전환
                  let planName = result.plan === 'unlimited' ? '무제한' : 
                                 result.plan === 'three-months-plus' ? '프리미엄' : '스탠다드';
                  
                  if (result.isUnlimited) {
                    planName = '영구제 ' + planName;
                  }

                  const planIcon = result.plan === 'unlimited' ? '💎' : 
                                   result.plan === 'three-months-plus' ? '👑' : '⭐';
                  
                  const planText = planIcon + ' ' + planName;
                  
                  document.querySelector('.container').innerHTML = 
                    '<div class="content" style="text-align: center;">' +
                      '<div style="font-size: 80px; margin-bottom: 20px; animation: sparkle 1s ease-in-out infinite;">✨</div>' +
                      '<div style="font-family: &#39;Playfair Display&#39;, serif; font-size: 36px; font-weight: 700; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fcd34d 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px;">환영합니다!</div>' +
                      '<div style="color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 32px; line-height: 1.8;">' +
                        '라이선스 인증이 완료되었습니다' +
                      '</div>' +
                      '<div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 16px; padding: 20px; margin-bottom: 32px;">' +
                        '<div style="color: #fbbf24; font-size: 14px; margin-bottom: 8px;">라이선스 유형</div>' +
                        '<div style="color: white; font-size: 24px; font-weight: 700;">' + planText + '</div>' +
                      '</div>' +
                      '<div style="color: rgba(255, 255, 255, 0.5); font-size: 13px; margin-bottom: 24px;">' +
                        '키워드 마스터의 세계에 오신 것을 환영합니다!<br>' +
                        '최고의 키워드로 성공을 향해 함께 달려가요! 🚀' +
                      '</div>' +
                      '<div style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #1a1a2e; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px; display: inline-block;">' +
                        '잠시 후 시작됩니다...' +
                      '</div>' +
                    '</div>';
                  setTimeout(() => {
                    ipcRenderer.send('license:auth-success', result);
                  }, 2000);
                } else {
                  // 실패 시 오류 메시지 표시
                  error.textContent = result.message || '인증에 실패했습니다. 다시 시도해주세요.';
                  error.style.display = 'block';
                  submitBtn.textContent = '💎 인증하기';
                  submitBtn.disabled = false;
                }
              });
              
              ipcRenderer.send('license:auth', { userId, userPassword, licenseCode: code });
              console.log('[LICENSE-HTML] ipcRenderer.send 완료');
            } catch (err) {
              console.error('[LICENSE-HTML] 인증 전송 오류:', err);
              error.textContent = '인증 중 오류가 발생했습니다: ' + err.message;
              error.style.display = 'block';
              submitBtn.textContent = '💎 인증하기';
              submitBtn.disabled = false;
            }
          });
          
          [userIdInput, userPasswordInput, licenseInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') submitBtn.click();
            });
            input.addEventListener('focus', () => {
              error.style.display = 'none';
            });
          });
        </script>
      </body>
      </html>
    `;

    licenseWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(licenseHtml)}`);

    let resolved = false;

    // 인증 요청 핸들러 - 서버에서 검증 후 결과를 창으로 전송
    const authHandler = async (_event: any, authData: any) => {
      console.log('[LICENSE-DIALOG] 인증 요청 수신:', authData ? '있음' : '없음');

      try {
        // 서버에서 인증 검증
        console.log('[LICENSE-DIALOG] 서버 인증 시작...');
        const result = await licenseManager.verifyAndSaveLicense(authData);
        console.log('[LICENSE-DIALOG] 서버 인증 결과:', result);

        // 결과를 인증 창으로 전송
        if (!licenseWindow.isDestroyed()) {
          licenseWindow.webContents.send('license:auth-result', result);
        }
      } catch (error: any) {
        console.error('[LICENSE-DIALOG] 인증 오류:', error);
        if (!licenseWindow.isDestroyed()) {
          licenseWindow.webContents.send('license:auth-result', {
            success: false,
            message: error.message || '서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요.'
          });
        }
      }
    };

    // 인증 성공 핸들러 - 창 닫고 resolve
    const successHandler = (_event: any, result: any) => {
      console.log('[LICENSE-DIALOG] 인증 성공, 창 닫기');
      if (resolved) return;
      resolved = true;

      ipcMain.removeListener('license:auth', authHandler);
      ipcMain.removeListener('license:auth-success', successHandler);

      resolve(result);

      setTimeout(() => {
        if (!licenseWindow.isDestroyed()) {
          licenseWindow.close();
        }
      }, 100);
    };

    // 닫기 버튼 핸들러
    const closeHandler = () => {
      console.log('[LICENSE-DIALOG] 닫기 버튼 클릭');
      if (!licenseWindow.isDestroyed()) {
        licenseWindow.close();
      }
    };

    ipcMain.on('license:auth', authHandler);
    ipcMain.on('license:auth-success', successHandler);
    ipcMain.on('license:close', closeHandler);

    licenseWindow.on('closed', () => {
      console.log('[LICENSE-DIALOG] 창 closed 이벤트, resolved:', resolved);
      ipcMain.removeListener('license:auth', authHandler);
      ipcMain.removeListener('license:auth-success', successHandler);
      ipcMain.removeListener('license:close', closeHandler);
      if (!resolved) {
        resolved = true;
        console.log('[LICENSE-DIALOG] 창이 먼저 닫힘 - null 반환');
        resolve(null);
      }
    });
  });
}

// 앱 초기화
app.whenReady().then(async () => {
  initAppPaths();

  // ========================================
  // 🌐 네트워크 및 Chrome 상태 확인
  // ========================================
  console.log('[LEWORD] 시스템 상태 확인 중...');

  // 1. Chrome/Chromium 상태 확인
  const chromePath = findChromePath();
  if (chromePath) {
    console.log('[LEWORD] ✅ Chrome/Chromium 발견:', chromePath);
  } else {
    console.log('[LEWORD] ⚠️ Chrome이 없지만 Puppeteer 번들 Chromium으로 대체 시도');
  }

  // 2. 네트워크 연결 확인
  const isOnline = await checkInternetConnection();
  if (isOnline) {
    console.log('[LEWORD] ✅ 인터넷 연결 확인됨');
  } else {
    console.log('[LEWORD] ⚠️ 인터넷 연결 없음 - 일부 기능이 제한될 수 있습니다');
    // 오프라인이어도 앱 실행은 허용 (캐시된 데이터 사용 가능)
  }

  // 3. 네트워크 모니터링 시작
  stopNetworkMonitoring = startNetworkMonitoring((online) => {
    console.log(`[LEWORD] 네트워크 상태 변경: ${online ? '온라인' : '오프라인'}`);
    // UI에 알림 전송 (필요시)
    if (keywordWindow && !keywordWindow.isDestroyed()) {
      keywordWindow.webContents.send('network-status-changed', online);
    }
  }, 60000); // 1분마다 체크

  // ========================================
  // 라이선스 인증 확인
  // ========================================
  if (!(await checkLicense())) {
    console.log('[LEWORD] 라이선스 인증 실패, 앱 종료');
    return;
  }

  // 기본 IPC 핸들러 설정 (open-link, open-external)
  ipcMain.handle('open-link', async (_event, href: string) => {
    try {
      await shell.openExternal(href);
      return true;
    } catch (error) {
      console.error('[MAIN] open-link 오류:', error);
      return false;
    }
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch (error) {
      console.error('[MAIN] open-external 오류:', error);
      return false;
    }
  });

  // IPC 핸들러 설정
  setupKeywordMasterHandlers();
  setupPremiumHandlers();

  // 키워드 마스터 창 열기
  createKeywordWindow();

  // ========================================
  // 자동 업데이트 설정
  // ========================================
  if (app.isPackaged) {
    setupAutoUpdater();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createKeywordWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 네트워크 모니터링 정리
  if (stopNetworkMonitoring) {
    stopNetworkMonitoring();
    stopNetworkMonitoring = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ========================================
// 자동 업데이트 (프리미엄 커스텀 UI)
// ========================================
let updateWindow: BrowserWindow | null = null;

function showUpdateWindow(version: string, mode: 'downloading' | 'ready'): BrowserWindow {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-mode', mode, version);
    return updateWindow;
  }

  updateWindow = new BrowserWindow({
    width: 460,
    height: 340,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: true,
    },
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Noto Sans KR', sans-serif;
    background: transparent;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; padding: 20px;
    -webkit-app-region: drag;
  }
  .container {
    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
    padding: 40px 44px;
    border-radius: 24px;
    min-width: 400px;
    box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1),
                inset 0 1px 0 rgba(255,255,255,0.1);
    position: relative; overflow: hidden;
    -webkit-app-region: no-drag;
  }
  .container::before {
    content: ''; position: absolute; top: -50%; left: -50%;
    width: 200%; height: 200%;
    background: conic-gradient(from 0deg, transparent, rgba(251,191,36,0.03), transparent 30%);
    animation: rotate 20s linear infinite;
  }
  @keyframes rotate { 100% { transform: rotate(360deg); } }
  
  .content { position: relative; z-index: 1; text-align: center; }
  
  .icon { font-size: 48px; margin-bottom: 16px; display: inline-block;
    animation: pulse 2s ease-in-out infinite;
    filter: drop-shadow(0 0 20px rgba(251,191,36,0.5));
  }
  @keyframes pulse {
    0%,100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(251,191,36,0.5)); }
    50% { transform: scale(1.08); filter: drop-shadow(0 0 30px rgba(251,191,36,0.8)); }
  }
  
  .title {
    font-family: &#39;Playfair Display&#39;, serif;
    font-size: 22px; font-weight: 700; color: #ffffff;
    margin-bottom: 6px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .version {
    font-size: 14px; color: rgba(255,255,255,0.5);
    margin-bottom: 24px; font-weight: 300;
  }
  .status-text {
    font-size: 14px; color: rgba(255,255,255,0.7);
    margin-bottom: 16px; min-height: 20px;
    transition: all 0.3s ease;
  }
  
  /* Progress bar */
  .progress-container {
    width: 100%; height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px; overflow: hidden;
    margin-bottom: 28px;
  }
  .progress-bar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #fbbf24, #f59e0b, #d97706);
    border-radius: 3px;
    transition: width 0.3s ease;
    box-shadow: 0 0 12px rgba(251,191,36,0.4);
  }
  .progress-bar.indeterminate {
    width: 30% !important;
    animation: indeterminate 1.5s ease-in-out infinite;
  }
  @keyframes indeterminate {
    0% { margin-left: 0; }
    50% { margin-left: 70%; }
    100% { margin-left: 0; }
  }
  
  /* Buttons */
  .btn-group { display: flex; gap: 12px; justify-content: center; }
  .btn {
    padding: 12px 28px; border: none; border-radius: 12px;
    font-family: 'Noto Sans KR', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.3s ease;
    letter-spacing: 0.3px;
  }
  .btn-primary {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1a1a2e;
    box-shadow: 0 4px 20px rgba(251,191,36,0.3);
  }
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 28px rgba(251,191,36,0.5);
  }
  .btn-secondary {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.6);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .btn-secondary:hover {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.9);
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
  
  /* Success state */
  .ready .icon { animation: none; }
  .ready .progress-bar {
    width: 100% !important; animation: none;
    background: linear-gradient(90deg, #34d399, #10b981);
    box-shadow: 0 0 12px rgba(52,211,153,0.4);
  }
  
  /* Hidden */
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="container">
  <div class="content" id="content">
    <div class="icon" id="icon">✨</div>
    <div class="title">LEWORD 업데이트</div>
    <div class="version" id="versionLabel">v${version} 발견</div>
    <div class="status-text" id="statusText">업데이트를 다운로드하고 있습니다...</div>
    <div class="progress-container">
      <div class="progress-bar indeterminate" id="progressBar"></div>
    </div>
    <div class="btn-group" id="downloadingButtons">
      <button class="btn btn-secondary" onclick="closeLater()">나중에</button>
    </div>
    <div class="btn-group hidden" id="readyButtons">
      <button class="btn btn-secondary" onclick="closeLater()">나중에</button>
      <button class="btn btn-primary" onclick="restart()">🔄 지금 재시작</button>
    </div>
  </div>
</div>
<script>
  const { ipcRenderer } = require('electron');
  const progressBar = document.getElementById('progressBar');
  const statusText = document.getElementById('statusText');
  const versionLabel = document.getElementById('versionLabel');
  const icon = document.getElementById('icon');
  const content = document.getElementById('content');
  const downloadingButtons = document.getElementById('downloadingButtons');
  const readyButtons = document.getElementById('readyButtons');

  function setReady(ver) {
    content.classList.add('ready');
    icon.textContent = '🎉';
    versionLabel.textContent = 'v' + ver + ' 준비 완료';
    statusText.textContent = '재시작하면 업데이트가 적용됩니다.';
    downloadingButtons.classList.add('hidden');
    readyButtons.classList.remove('hidden');
  }

  ipcRenderer.on('update-progress', (e, percent) => {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = Math.round(percent) + '%';
    statusText.textContent = '다운로드 중... ' + Math.round(percent) + '%';
  });

  ipcRenderer.on('update-mode', (e, m, ver) => {
    if (m === 'ready') setReady(ver);
  });

  // Initial mode check
  if ('${mode}' === 'ready') setReady('${version}');

  function closeLater() {
    ipcRenderer.send('update:close');
  }
  function restart() {
    ipcRenderer.send('update:restart');
  }
</script>
</body></html>`;

  updateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  ipcMain.once('update:close', () => {
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.close();
      updateWindow = null;
    }
  });

  ipcMain.once('update:restart', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
    ipcMain.removeAllListeners('update:close');
    ipcMain.removeAllListeners('update:restart');
  });

  return updateWindow;
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (...args: any[]) => console.log('[AUTO-UPDATE]', ...args),
    warn: (...args: any[]) => console.warn('[AUTO-UPDATE]', ...args),
    error: (...args: any[]) => console.error('[AUTO-UPDATE]', ...args),
    debug: (...args: any[]) => console.log('[AUTO-UPDATE:DEBUG]', ...args),
  } as any;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AUTO-UPDATE] 업데이트 확인 중...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AUTO-UPDATE] 업데이트 발견:', info.version);
    // 자동으로 다운로드 시작 & 프리미엄 UI 표시
    showUpdateWindow(info.version, 'downloading');
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AUTO-UPDATE] 최신 버전입니다.');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AUTO-UPDATE] 다운로드: ${Math.round(progress.percent)}%`);
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send('update-progress', progress.percent);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AUTO-UPDATE] 다운로드 완료:', info.version);
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send('update-mode', 'ready', info.version);
    } else {
      showUpdateWindow(info.version, 'ready');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AUTO-UPDATE] 오류:', err.message);
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.close();
      updateWindow = null;
    }
  });

  // 앱 시작 후 5초 뒤 업데이트 확인 (UI가 먼저 뜨도록)
  setTimeout(() => {
    console.log('[AUTO-UPDATE] 업데이트 확인 시작');
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AUTO-UPDATE] 확인 실패:', err.message);
    });
  }, 5000);
}