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
import {
  initAutoUpdaterEarly,
  registerUpdaterHandlers,
  setUpdaterLoginWindow,
  isUpdating,
} from './updater';
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

  // 저장된 라이선스 + 자동로그인 시도
  const license = await licenseManager.loadLicense();

  if (license && license.isValid) {
    if (licenseManager.isLicenseExpired(license)) {
      console.log('[LEWORD] ⚠️ 저장된 라이선스 만료됨 — 삭제 후 로그인창으로 진행');
      await licenseManager.clearLicense();
    } else {
      // 🔐 저장된 credential(safeStorage 암호화) 있으면 자동로그인 시도
      console.log('[LEWORD] 저장된 라이선스 있음 — 자동로그인 시도');
      const auto = await licenseManager.autoLogin();
      if (auto.success && auto.license) {
        console.log('[LEWORD] ✅ 자동로그인 성공:', auto.license.licenseType || auto.license.plan);
        return true;
      }
      console.log('[LEWORD] 자동로그인 실패/없음 — 로그인창 진행:', auto.message);
    }
  }

  // 라이선스 인증창 표시 (필수) — 창을 닫으면 바로 종료
  console.log('[LEWORD] 라이선스 인증창 표시');
  const authResult = await showLicenseInputDialog();

  if (!authResult) {
    console.log('[LEWORD] 라이선스 인증 취소됨 — 앱 종료');
    app.quit();
    return false;
  }

  // 인증 성공 (showLicenseInputDialog에서 이미 검증 및 환영 화면 표시 완료)
  console.log('[LEWORD] ✅ 라이선스 인증 성공:', authResult.plan);
  return true;
}

async function showLicenseInputDialog(): Promise<{ success: boolean; plan?: string; message?: string } | null> {
  // 저장된 라이선스에서 아이디 가져오기 (미리 채우기용)
  const savedLicense = await licenseManager.loadLicense();
  const savedUserId = savedLicense?.userId || '';
  const hasRegistered = !!savedUserId; // 이미 등록된 사용자인지

  // 🔐 기억하기 체크박스 + 자동 채움용 저장된 credential
  const savedCreds = await licenseManager.loadCredentials();
  const savedUserPassword = savedCreds?.userPassword || '';
  const rememberByDefault = !!savedCreds;   // credential 저장돼있으면 기본 체크

  return new Promise((resolve) => {
    // TODO: Refactor license window to use a preload script instead of nodeIntegration: true
    const licenseWindow = new BrowserWindow({
      width: 580,
      height: 760,
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

    // 🔥 updater 모듈에 로그인창 참조 등록 — 업데이트 발견 시 hide() 호출용
    setUpdaterLoginWindow(licenseWindow);

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
              <input type="password" id="user-password" placeholder="비밀번호를 입력하세요" value="${savedUserPassword}" />
            </div>

            <div class="input-group">
              <label>라이선스 코드</label>
              <input type="text" id="license-input" class="license-input" placeholder="라이선스 코드 입력 (최대 50자, prefix 자동 제거)" maxlength="50" />
              <div class="info-text">${hasRegistered ? '✅ 이미 등록된 사용자입니다. 비밀번호만 입력하세요!' : '최초 등록 시에만 코드가 필요합니다'}</div>
            </div>

            <label class="remember-row" style="display:flex; align-items:center; gap:10px; margin-top:6px; margin-bottom:14px; cursor:pointer; user-select:none; color:rgba(255,255,255,0.85); font-size:13px;">
              <input type="checkbox" id="remember-me" ${rememberByDefault ? 'checked' : ''} style="width:18px; height:18px; accent-color:#fbbf24; cursor:pointer;" />
              <span>아이디/비밀번호 기억하기 <span style="color:rgba(255,255,255,0.5); font-size:11px;">(다음 실행 시 자동 로그인)</span></span>
            </label>
            <div style="font-size:11px; color:rgba(255,255,255,0.4); margin-top:-8px; margin-bottom:14px; margin-left:28px;">
              🔒 OS 키체인 암호화로 저장됩니다 (Windows DPAPI / macOS Keychain)
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
            // 대문자/영숫자/하이픈만 허용, 50자 제한
            // 실시간 하이픈 포맷팅은 제거 (16자 키만 가정하면 긴 prefix 키를 못 붙임)
            // submit 시 마지막 16자만 취해서 정규 형식으로 변환
            let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
            if (value.length > 50) value = value.slice(0, 50);
            e.target.value = value;
          });
          
          const rememberCheckbox = document.getElementById('remember-me');

          submitBtn.addEventListener('click', () => {
            const userId = userIdInput.value.trim();
            const userPassword = userPasswordInput.value.trim();
            let code = licenseInput.value.trim();
            const rememberCredentials = !!rememberCheckbox?.checked;
            
            if (!userId && !userPassword && !code) {
              error.textContent = '아이디와 비밀번호를 입력해주세요.';
              error.style.display = 'block';
              return;
            }
            
            // 코드 형식 자동 변환 (하이픈 없이 입력해도 됨)
            if (code) {
              // 하이픈/공백 제거 후 대문자, 영숫자 외 제거
              let cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

              // 🔥 16자 초과 시 뒤쪽 16자만 사용 (prefix 자동 제거)
              if (cleanCode.length > 16) cleanCode = cleanCode.slice(-16);

              // 16자리인지 확인
              if (cleanCode.length !== 16 || !/^[A-Z0-9]{16}$/.test(cleanCode)) {
                error.textContent = '라이선스 코드는 16자리 영문/숫자입니다. (prefix 자동 제거됨)';
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
              
              ipcRenderer.send('license:auth', { userId, userPassword, licenseCode: code, rememberCredentials });
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
  // 🔥 네이버 방식: 업데이트 체크와 인증창을 병렬로 실행
  // - 업데이트 체크는 fire-and-forget (블로킹 없음)
  // - 인증창을 즉시 표시 → UX 대기 시간 0
  // - 업데이트 발견 시 updater 모듈이 로그인창을 hide() 하고 진행 창 표시
  // ========================================
  registerUpdaterHandlers();
  try {
    initAutoUpdaterEarly();
  } catch (err: any) {
    console.error('[LEWORD] initAutoUpdaterEarly 실패:', err?.message ?? err);
  }

  if (!(await checkLicense())) {
    // 업데이트 진행 중이면 창 종료 흐름을 건너뜀 — updater 가 재시작 관리
    if (isUpdating()) {
      console.log('[LEWORD] 업데이트 진행 중 — 라이선스 흐름 종료');
      return;
    }
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

