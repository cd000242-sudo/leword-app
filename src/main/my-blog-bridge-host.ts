/**
 * 사이트 '내 블로그' 브리지의 electron 쪽 의존 — 네이버 로그인 창 핸들러와 내 블로그 체급 기록을 잇는다(2026-09-30).
 * 라우터(my-blog-bridge-routes)는 순수하게 두고, 여기서만 앱 모듈을 만진다.
 */
import type { MyBlogBridgeDeps } from './my-blog-bridge-routes';
import { naverSessionStatus, openAdvisorWindow } from './handlers/naver-session';
import { readBlogClassForView } from './handlers/blog-class';

export function createMyBlogBridgeDeps(): MyBlogBridgeDeps {
  return {
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
  };
}
