/**
 * 사이트 '내 블로그' 브리지의 electron 쪽 의존 — 네이버 로그인 창 핸들러와 내 블로그 체급 기록을 잇는다(2026-09-30).
 * 라우터(my-blog-bridge-routes)는 순수하게 두고, 여기서만 앱 모듈을 만진다.
 */
import { app } from 'electron';
import type { MyBlogBridgeDeps } from './my-blog-bridge-routes';
import { advisorFetch, naverSessionStatus, openAdvisorWindow } from './handlers/naver-session';
import { readBlogClassForView } from './handlers/blog-class';
import { readAdvisorAutopsyHistory, readAdvisorDailyView, readDailyRecords } from './handlers/advisor-daily';
import { autopsyFacts } from '../utils/advisor/autopsy-history';
import { runAssistant } from './assistant-service';
import { readTodayPlan } from './handlers/advisor-today';
import { advisorDailySyncView, todayPlanSyncView } from '../utils/advisor/sync-view';

export function createMyBlogBridgeDeps(): MyBlogBridgeDeps {
  return {
    // 창구 직접 호출은 개발판에서만 — 설치판은 아예 넘기지 않아 경로가 404 다.
    ...(app.isPackaged ? {} : { advisorFetch }),
    sessionStatus: async () => {
      const status = await naverSessionStatus();
      // 기록 파일 경로·창구 목록은 사이트로 넘기지 않는다.
      return {
        loggedIn: status.loggedIn,
        windowOpen: status.windowOpen,
        capturedToday: status.capturedToday,
        endpointCount: status.endpoints.length,
      };
    },
    openLogin: async () => { openAdvisorWindow(); },
    blogClassGet: async () => readBlogClassForView(),
    // 사이트 동기화 재료 — 채널 id·글 id·창구 목록을 뺀 판(sync-view)만 넘긴다.
    // 여러 날 기록을 함께 넘긴다 — 사이트 벤치마크 판이 '홈판 유입을 받은 내 글'을 여러 날에서 모은다(2026-10-01).
    advisorDailyGet: async () => advisorDailySyncView(readAdvisorDailyView().latest, readDailyRecords(), autopsyFacts(readAdvisorAutopsyHistory(), new Date())),
    todayPlanGet: async () => todayPlanSyncView(readTodayPlan()),
    // 글 한 편 유입 설계실 — 화면에 그릴 값만 줄인 요약(초안 본문 · 상위 제목 제외, 최근 20개).
    postPlansGet: async () => require('./handlers/post-plan').readPostPlansForSync(),
    // LEWORD 비서 — 앱 화면과 같은 실행 함수(사용자 본인 구독, 클로드는 Sonnet).
    assistantChat: (input) => runAssistant(input),
  };
}
