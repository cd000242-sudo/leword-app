// 키워드 마스터 창 핸들러
import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';


export function setupWindowHandler(): void {
  ipcMain.handle('open-keyword-master-window', async () => {
    try {
      // preload.js 경로 찾기 (메인 윈도우와 동일한 로직)
      const preloadPathList = [
        path.join(__dirname, 'preload.js'),           // dist/preload.js (컴파일된 경우)
        path.join(__dirname, '..', 'electron', 'preload.js'), // electron/preload.js (소스에서 실행)
        path.join(process.cwd(), 'electron', 'preload.js'),    // 프로젝트 루트 기준 electron/preload.js
        path.join(process.cwd(), 'dist', 'preload.js'),       // 프로젝트 루트 기준 dist/preload.js
        path.join(__dirname, '../preload.js'),                // dist/main에서 상위로
        path.join(__dirname, '../../preload.js'),             // dist/src/main -> dist/preload.js (Correct for compiled structure)
      ];

      const preloadPath = preloadPathList.find(p => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });

      if (!preloadPath) {
        console.warn('[KEYWORD-MASTER] preload.js를 찾을 수 없습니다. 일부 기능이 작동하지 않을 수 있습니다.');
        console.warn('[KEYWORD-MASTER] 시도한 경로:', preloadPathList);
      } else {
        console.log('[KEYWORD-MASTER] ✅ preload.js 경로:', preloadPath);
      }

      const keywordWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        title: 'LEWORD - 키워드마스터',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath || path.join(__dirname, '../preload.js'),
          sandbox: false,  // preload 스크립트가 정상 작동하도록
          webSecurity: true
        },
        backgroundColor: '#667eea',
        show: false,
        frame: true,
        autoHideMenuBar: true
      });

      const htmlPath = path.join(__dirname, '../../ui/keyword-master.html');
      if (fs.existsSync(htmlPath)) {
        keywordWindow.loadFile(htmlPath);
      } else {
        // fallback 경로들 시도
        const fallbackPaths = [
          path.join(process.cwd(), 'ui/keyword-master.html'),
          path.join(__dirname, '../ui/keyword-master.html')
        ];

        let loaded = false;
        for (const p of fallbackPaths) {
          if (fs.existsSync(p)) {
            keywordWindow.loadFile(p);
            loaded = true;
            break;
          }
        }

        if (!loaded) {
          throw new Error('keyword-master.html 파일을 찾을 수 없습니다');
        }
      }

      keywordWindow.once('ready-to-show', () => {
        keywordWindow.show();
        keywordWindow.focus();
      });

      // Electron Security Warning 필터링
      keywordWindow.webContents.on('console-message', (event, level, message) => {
        if (typeof message === 'string' && (
          message.includes('Electron Security Warning') ||
          message.includes('Content-Security-Policy') ||
          message.includes('Insecure Content-Security-Policy')
        )) {
          event.preventDefault();
          return;
        }
      });

      keywordWindow.on('closed', () => {
        console.log('[KEYWORD-MASTER] 키워드 마스터 창 닫힘');
      });

      return { success: true };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 창 열기 실패:', error);
      return { success: false, error: error.message };
    }
  });
}
