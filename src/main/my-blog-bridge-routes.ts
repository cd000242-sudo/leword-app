/**
 * 사이트 '내 블로그' 탭이 부르는 브리지 — /v1/bridge/my-blog/* (C 0단계 사이트 반영, 2026-09-30).
 *
 * 사이트는 화면일 뿐이다. 네이버 로그인·어드바이저 창구 실측·내 블로그 체급 기록은 전부 이 PC 앱에 있고,
 * 사이트는 그 상태를 읽고 [로그인 창 열기]만 부탁한다. 측정(분 단위)은 여기서 시작하지 않는다 —
 * 진행 이벤트를 렌더러로 보내는 구조라 앱 화면에서 누르게 안내한다.
 *
 * 넘기지 않는 것: 기록 파일 경로·창구 목록(probeFile·endpoints). 사이트가 알 이유가 없다.
 */
import type { IncomingMessage, ServerResponse } from 'http';

export const MY_BLOG_ROUTE_PREFIX = '/v1/bridge/my-blog/';

export interface MyBlogSessionView {
  loggedIn: boolean;
  windowOpen: boolean;
  /** 오늘 잡힌 어드바이저 요청 줄 수. */
  capturedToday: number;
  /** 오늘 잡힌 창구(메서드+경로) 종류 수. */
  endpointCount: number;
}

export interface MyBlogBridgeDeps {
  sessionStatus: () => Promise<MyBlogSessionView>;
  openLogin: () => Promise<void>;
  /** 앱이 마지막으로 잰 내 블로그 기록(렌더러용 판). 안 쟀으면 null. */
  blogClassGet: () => Promise<unknown | null>;
}

type Io = {
  json: (res: ServerResponse, code: number, value: unknown) => void;
  siteOriginAllowed: (origin: string) => boolean;
};

export async function handleMyBlogRoute(req: IncomingMessage, res: ServerResponse, deps: MyBlogBridgeDeps, io: Io): Promise<boolean> {
  const url = String(req.url || '');
  if (!url.startsWith(MY_BLOG_ROUTE_PREFIX)) return false;
  res.setHeader('Cache-Control', 'no-store');
  const origin = String(req.headers.origin || '');
  if (origin && !io.siteOriginAllowed(origin)) { io.json(res, 403, { ok: false, error: '사이트에서만 읽을 수 있습니다.' }); return true; }
  const route = `${req.method} ${url.slice(MY_BLOG_ROUTE_PREFIX.length)}`;
  try {
    if (route === 'GET session') { io.json(res, 200, { ok: true, result: await deps.sessionStatus() }); return true; }
    if (route === 'POST session/open') { await deps.openLogin(); io.json(res, 200, { ok: true, result: { opened: true } }); return true; }
    // result 를 null 로 주면 사이트 bridgeCall 이 오류로 읽는다 — 안 잰 상태도 정상이라 record 로 감싼다.
    if (route === 'GET class') { io.json(res, 200, { ok: true, result: { record: await deps.blogClassGet() } }); return true; }
    io.json(res, 404, { ok: false, error: '지원하지 않는 내 블로그 경로입니다.' });
  } catch {
    // 앱 쪽 오류엔 파일 경로가 실릴 수 있다 — 사유는 넘기지 않는다.
    io.json(res, 503, { ok: false, error: '앱에서 내 블로그 상태를 읽지 못했습니다.' });
  }
  return true;
}
