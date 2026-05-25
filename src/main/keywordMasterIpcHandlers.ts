// 키워드 마스터 IPC 핸들러 오케스트레이터
import { ipcMain } from 'electron';
import { setupWindowHandler } from './handlers/window-handler';
import { setupKeywordDiscoveryHandlers } from './handlers/keyword-discovery';
import { setupKeywordAnalysisHandlers } from './handlers/keyword-analysis';
import { setupPremiumHuntingHandlers } from './handlers/premium-hunting';
import { setupScheduleDashboardHandlers } from './handlers/schedule-dashboard';
import { setupConfigUtilityHandlers } from './handlers/config-utility';
import { setupLicenseHandlers } from './handlers/license-handlers';
import { registerYouTubeAnalysisHandlers } from './handlers/youtube-handlers';
import { setupSourceSignalHandlers } from './handlers/source-signals';
import { setupKeyWizardHandlers } from './handlers/key-wizard';
import { setupKeywordBlueprintHandlers } from './handlers/keyword-blueprint';
import { setupExposureTrackingHandlers } from './handlers/exposure-tracking';
import { startRefreshScheduler } from './key-wizard/refresh-scheduler';
import { startLifecycleTracker } from '../utils/pro-hunter-v12/lifecycle-tracker';
import { startRankTracker } from '../utils/pro-hunter-v12/rank-tracker';
import { startPrecrawler } from '../utils/pro-hunter-v12/precrawler';
import { startSurgeScanner } from '../utils/pro-hunter-v12/trend-surge-detector';
import { startAutoHuntingScheduler } from '../utils/pro-hunter-v12/auto-hunting-scheduler';
import { bootstrapSources } from '../utils/sources/source-bootstrap';
import { startAutoHealthCheck } from '../utils/sources/health-checker';

// 중복 호출 방지 플래그
let handlersSetup = false;

export function setupKeywordMasterHandlers() {
  console.log('[KEYWORD-MASTER] IPC 핸들러 등록 시작');

  // 기존 핸들러 제거 (중복 방지)
  const handlerNames = [
    'open-keyword-master-window',
    'find-golden-keywords',
    'get-realtime-keywords',
    'get-trending-keywords',
    'check-keyword-rank',
    'get-env',
    'save-env',
    'check-api-keys',
    'get-sns-trends',
    'get-google-trend-keywords',
    'get-license-info',
    'register-license',
    'check-premium-access',
    'infinite-keyword-search',
    'export-keywords-to-excel',
    'get-keyword-expansions',
    'search-suffix-keywords',
    'hunt-adsense-keywords',
    'get-adsense-categories'
  ];

  handlerNames.forEach(name => {
    try {
      if (ipcMain.listenerCount(name) > 0) {
        console.log(`[KEYWORD-MASTER] 기존 핸들러 "${name}" 제거 중...`);
        ipcMain.removeHandler(name);
      }
    } catch (e) {
      // 무시 (핸들러가 없을 수 있음)
    }
  });

  handlersSetup = true;

  // 모듈별 핸들러 등록
  setupWindowHandler();
  setupKeywordDiscoveryHandlers();
  setupKeywordAnalysisHandlers();
  setupPremiumHuntingHandlers();
  setupScheduleDashboardHandlers();
  setupConfigUtilityHandlers();
  setupLicenseHandlers();
  registerYouTubeAnalysisHandlers();
  setupSourceSignalHandlers();
  setupKeyWizardHandlers();
  setupKeywordBlueprintHandlers();
  setupExposureTrackingHandlers();

  // v2.42.98: 백그라운드 워커 옵트인 — 기본 OFF (CPU/RAM 성능 우선)
  //   환경설정의 enableBackgroundWorkers=true 일 때만 활성화
  //   사용자 제보: "앱을 사용하면 컴퓨터가 굉장히 느려진다"
  // v2.46.0 F: 한 번의 동기 fs 호출만 (백그라운드 워커 결정 시점에 필수)
  //   이 부분은 콜드 스타트 핫패스라 동기 유지가 단순함. 100ms 미만 안전.
  const enableBg = (() => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const prefFile = path.join(app.getPath('userData'), 'performance-prefs.json');
      if (fs.existsSync(prefFile)) {
        const raw = JSON.parse(fs.readFileSync(prefFile, 'utf8'));
        return raw?.enableBackgroundWorkers === true;
      }
    } catch {}
    return false;
  })();

  if (enableBg) {
    console.log('[PERF] 백그라운드 워커 활성화 (사용자 명시 ON)');
    startRefreshScheduler();
    startLifecycleTracker();
    startRankTracker();
    startPrecrawler();
    startSurgeScanner();
    startAutoHuntingScheduler();
    try {
      bootstrapSources();
      startAutoHealthCheck(30 * 60_000);
      console.log('[KEYWORD-MASTER] v4.0 소스 부트스트랩 + 헬스체크 시작');
    } catch (e: any) {
      console.error('[KEYWORD-MASTER] v4.0 부트스트랩 실패:', e?.message);
    }
  } else {
    console.log('[PERF] ⚡ 백그라운드 워커 OFF (성능 우선 모드) — 환경설정에서 활성화 가능');
  }

  // 성능 토글 IPC (UI에서 환경설정 변경 가능)
  ipcMain.handle('perf-get-bg-pref', () => ({ success: true, enableBackgroundWorkers: enableBg }));
  ipcMain.handle('perf-set-bg-pref', async (_e, p: { enableBackgroundWorkers: boolean }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dir = app.getPath('userData');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const prefFile = path.join(dir, 'performance-prefs.json');
      fs.writeFileSync(prefFile, JSON.stringify({ enableBackgroundWorkers: !!p?.enableBackgroundWorkers }), 'utf8');
      return { success: true, message: '저장됨. 앱 재시작 후 적용.' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  console.log('[KEYWORD-MASTER] IPC 핸들러 등록 완료');
  console.log('[KEYWORD-MASTER] ✅ 모든 핸들러 등록 완료');
}
