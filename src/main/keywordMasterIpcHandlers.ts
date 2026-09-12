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
import { setupLaneInsightsHandlers } from './handlers/lane-insights';
import { setupAgentCliHandlers } from './handlers/agent-cli-handlers';
import { setupSeatMeasureHandlers } from './handlers/seat-measure';
import { setupSeatWatchHandlers, startSeatWatchScheduler, stopSeatWatchScheduler } from './handlers/seat-watch';
import { setupBlogClassHandlers } from './handlers/blog-class';
import { setupGoldenWritingKitHandlers } from './handlers/golden-writing-kit';
import { setupTopicBriefsLocalHandlers, startTopicBriefsScheduler, stopTopicBriefsScheduler } from './handlers/topic-briefs-local';
import { setupPreemptionBoardHandlers } from './handlers/preemption-board';
import { setupDailyPickHandlers } from './handlers/daily-pick';
import { setupRealtimeNicheHandlers, stopRealtimeNicheScheduler } from './handlers/realtime-niche';
import { setupTrendImportHandlers } from './handlers/trend-import';
import { startCiWatchdog, stopCiWatchdog, setupCiWatchdogHandlers } from './handlers/ci-watchdog';
import { startWebBridgeHost } from './web-bridge-host';
import { startRefreshScheduler, stopRefreshScheduler } from './key-wizard/refresh-scheduler';
import { startLifecycleTracker, stopLifecycleTracker } from '../utils/pro-hunter-v12/lifecycle-tracker';
import { startRankTracker, stopRankTracker } from '../utils/pro-hunter-v12/rank-tracker';
import { startPrecrawler, stopPrecrawler } from '../utils/pro-hunter-v12/precrawler';
import { startSurgeScanner, stopSurgeScanner } from '../utils/pro-hunter-v12/trend-surge-detector';
import { startAutoHuntingScheduler, stopAutoHuntingScheduler } from '../utils/pro-hunter-v12/auto-hunting-scheduler';
import { bootstrapSources } from '../utils/sources/source-bootstrap';
import { startAutoHealthCheck, stopAutoHealthCheck } from '../utils/sources/health-checker';

// 중복 호출 방지 플래그
let handlersSetup = false;
let currentBackgroundWorkersEnabled = false;

function readBackgroundWorkerPreference(): boolean {
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
}

function startBackgroundWorkers(): void {
  startRefreshScheduler();
  startLifecycleTracker();
  startRankTracker();
  startPrecrawler();
  startSurgeScanner();
  startAutoHuntingScheduler();
  try {
    bootstrapSources();
    startAutoHealthCheck(30 * 60_000);
    console.log('[KEYWORD-MASTER] v4.0 ?뚯뒪 遺?몄뒪?몃옪 + ?ъ뒪泥댄겕 ?쒖옉');
  } catch (e: any) {
    console.error('[KEYWORD-MASTER] v4.0 遺?몄뒪?몃옪 ?ㅽ뙣:', e?.message);
  }
}

/*
 * 성능 우선 모드가 멈추는 것 — **예전 워커만.**
 *
 * 전에는 자리 감시·오늘의 글감·실시간 틈새까지 한 덩어리로 같이 멈췄다.
 * 그런데 enableBackgroundWorkers 는 기본값이 false 이고 사장님 config.json 에는
 * 그 값이 아예 없다 → 앱이 늘 성능 우선 모드로 켜졌다 → **자동 회차가 하나도 안 돌았다.**
 * 사장님이 앱을 계속 켜 두시는 이유가 "알아서 돌아라"인데 그 뜻이 통째로 지워지고 있었다
 * (실측 2026-09-11: 틈새 되살리기 로그가 뜨고 직후 여기서 꺼졌다).
 *
 * 사장님 결정(2026-09-11) "내 판(자리·글감·틈새)만 돌게".
 * 이 셋은 각자 화면에 on/off 스위치가 있다 — 끄고 싶으면 거기서 끈다.
 * 예전 자동사냥·급등스캔·프리크롤러와 한 덩어리로 묶지 않는다.
 * (앱을 닫을 때는 아래 stopMyLaneSchedulers 로 같이 멈춘다 — 타이머를 남기지 않는다.)
 */
function stopBackgroundWorkers(): void {
  stopAutoHealthCheck();
  stopAutoHuntingScheduler();
  stopSurgeScanner();
  stopPrecrawler();
  stopRankTracker();
  stopLifecycleTracker();
  stopRefreshScheduler();
}

/** 앱을 닫을 때 내 판 타이머도 같이 멈춘다 — 성능 모드와는 무관하다. */
export function stopMyLaneSchedulers(): void {
  stopSeatWatchScheduler();
  stopRealtimeNicheScheduler();
  stopTopicBriefsScheduler();
  /*
   * 회차 감시견도 여기에 둔다. 이건 **빠진 회차를 깨우라고 만든 안전장치**인데
   * 성능 우선 모드에 같이 꺼져 있었다 — 안전장치를 안전장치 스위치로 끈 꼴이다.
   * 실측 2026-09-11: 낮 글감 3틱이 전부 안 떴는데 아무도 안 깨웠다.
   * 20분마다 발행본을 한 번 읽는 게 전부라 PC 부하도 사실상 없다.
   */
  stopCiWatchdog();
}

async function applyBackgroundWorkerPreference(enable: boolean): Promise<{ enabled: boolean }> {
  if (enable) {
    if (!currentBackgroundWorkersEnabled) {
      console.log('[PERF] 諛깃렇?쇱슫???뚯빱 ?쒖꽦??(?ъ슜??紐낆떆 ON)');
      startBackgroundWorkers();
    }
    currentBackgroundWorkersEnabled = true;
  } else {
    stopBackgroundWorkers();
    currentBackgroundWorkersEnabled = false;
    console.log('[PERF] ??諛깃렇?쇱슫???뚯빱 OFF (?깅뒫 ?곗꽑 紐⑤뱶)');
  }
  return { enabled: currentBackgroundWorkersEnabled };
}

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
    'get-adsense-categories',
    'perf-get-bg-pref',
    'perf-set-bg-pref'
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
  setupLaneInsightsHandlers();
  setupAgentCliHandlers();
  // 자리 실측기(앱 전용, 2026-09-08) — 내 PC 브라우저로 네이버 자리를 센다.
  setupSeatMeasureHandlers();
  // 자리 감시(앱 전용, 플랜 A3) — 관심 키워드를 새벽에 다시 재고 열리면 알린다.
  setupSeatWatchHandlers();
  startSeatWatchScheduler();
  // 내 블로그 체급(앱 전용, 2026-09-10) — 내 블로그 사실을 초보자 말로 읽어 준다.
  setupBlogClassHandlers();
  // 글감 한 벌(앱 전용, 2026-09-10) — 발굴 줄을 펴면 제목 후보와 같이 넣을 말이 나온다.
  setupGoldenWritingKitHandlers();
  // 오늘의 글감(앱 전용, 2026-09-10) — 깃허브 예약을 기다리지 않는다. 누르면 이 PC 에서 만든다.
  setupTopicBriefsLocalHandlers();
  startTopicBriefsScheduler();
  // 선점 보드(앱 전용, 2026-09-10) — 발행본을 읽고 자리는 이 PC 로 지금 다시 잰다.
  setupPreemptionBoardHandlers();
  // 오늘 쓸 한 편(앱 전용, 2026-09-11) — 여섯 판 600여 후보를 봉투·자리로 걸러 셋으로.
  setupDailyPickHandlers();
  // 실시간 틈새(앱 전용, 2026-09-10) — 사이트 보드와 같은 판정을 이 PC 브라우저로 상한 없이.
  setupRealtimeNicheHandlers();
  // 트렌드 CSV 들이기(앱 전용, 2026-09-10) — 크리에이터 어드바이저 유입 검색어를 재서 빈자리를 고른다.
  setupTrendImportHandlers();
  // 회차 감시견(2026-09-10, 2026-09-12 에 보드 넷으로 확대) —
  //   깃허브 예약이 빠지면 이 PC 가 대신 워크플로를 깨운다.
  //   실측: 오후 슬롯 3틱이 전부 안 떴고, 선점 보드는 09-11 금요일 틱이 통째로 빠졌다.
  //   틱을 더 늘려도 같은 스케줄러라 나아지지 않는다.
  // 같은 창구로 '지금 갱신'도 연다 — 깨우는 힘이 이 PC 의 gh 로그인이라 사장님만 된다.
  setupCiWatchdogHandlers();
  startCiWatchdog();
  // 웹 ↔ 클로드코드 브리지 — 사이트가 이 PC 의 구독 CLI 를 쓰는 통로(127.0.0.1 전용).
  startWebBridgeHost();

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
  currentBackgroundWorkersEnabled = enableBg;
  if (!enableBg) {
    stopBackgroundWorkers();
  }
  ipcMain.handle('perf-get-bg-pref', () => ({ success: true, enableBackgroundWorkers: currentBackgroundWorkersEnabled }));
  ipcMain.handle('perf-set-bg-pref', async (_e, p: { enableBackgroundWorkers: boolean }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dir = app.getPath('userData');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const prefFile = path.join(dir, 'performance-prefs.json');
      fs.writeFileSync(prefFile, JSON.stringify({ enableBackgroundWorkers: !!p?.enableBackgroundWorkers }), 'utf8');
      const applied = await applyBackgroundWorkerPreference(!!p?.enableBackgroundWorkers);
      return { success: true, enableBackgroundWorkers: applied.enabled, message: '저장됨. 즉시 적용.' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  console.log('[KEYWORD-MASTER] IPC 핸들러 등록 완료');
  console.log('[KEYWORD-MASTER] ✅ 모든 핸들러 등록 완료');
}
