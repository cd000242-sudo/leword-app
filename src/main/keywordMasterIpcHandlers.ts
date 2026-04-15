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
import { startRefreshScheduler } from './key-wizard/refresh-scheduler';
import { startLifecycleTracker } from '../utils/pro-hunter-v12/lifecycle-tracker';
import { startRankTracker } from '../utils/pro-hunter-v12/rank-tracker';
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
    'search-suffix-keywords'
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
  startRefreshScheduler();
  startLifecycleTracker();
  startRankTracker();

  // v4.0: 17개 소스 부트스트랩 + 백그라운드 헬스체크 시작
  try {
    bootstrapSources();
    startAutoHealthCheck(30 * 60_000);
    console.log('[KEYWORD-MASTER] v4.0 소스 부트스트랩 + 헬스체크 시작');
  } catch (e: any) {
    console.error('[KEYWORD-MASTER] v4.0 부트스트랩 실패:', e?.message);
  }

  console.log('[KEYWORD-MASTER] IPC 핸들러 등록 완료');
  console.log('[KEYWORD-MASTER] ✅ 모든 핸들러 등록 완료');
}
