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
import { sanitizeAssistantInput, type AssistantInput } from '../utils/assistant/assistant-prompt';
import { describeAssistantFailure } from '../utils/assistant/assistant-failure';
import { getEngineCooldown } from '../utils/agent-cli/engineHealth';

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
  /**
   * 어드바이저 창구 직접 호출(개발판 전용, 2026-09-30) — 로그인 세션으로 `/api/v6` 아래 상대경로를 부른다.
   * 39개 창구가 무엇을 주는지 실측하는 용도라 설치판(호스트가 안 넘김)엔 없다. 출처 붙은 요청은 거절한다.
   */
  advisorFetch?: (pathAndQuery: string, extraHeaders?: Record<string, string>) => Promise<{ status: number; body: string }>;
  /**
   * 사이트 동기화용(플랜 B, 2026-09-30) — 어드바이저 하루 요약(계정 필드 없음)과 '오늘 쓸 글 10' 판.
   * 사이트가 이걸 비밀번호 유도 키로 잠가 워커에 올린다. 없으면 null(안 잰 것도 정상).
   */
  advisorDailyGet?: () => Promise<unknown | null>;
  todayPlanGet?: () => Promise<unknown | null>;
  /**
   * LEWORD 비서(2026-10-01) — 대화와 화면 자료만 받는다. 규칙 · 설명서는 앱이 붙인다(임의 프롬프트 통로가 아니다).
   * 사용자 본인 구독(Claude Sonnet → Codex → agy)으로 돈다. 없으면 경로가 404.
   */
  assistantChat?: (input: AssistantInput) => Promise<{ answer: string; escalate: boolean; provider: string }>;
}

/** 대화 본문 상한 — 10턴 × 1,500자 + 화면 자료 3,000자에 넉넉히. */
const ASSISTANT_BODY_LIMIT = 64 * 1024;

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('too-large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/** 어드바이저 상대경로만 — 절대 URL·상위 경로 탈출은 거절. */
function isAdvisorPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('..');
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
  const parsed = new URL(url, 'http://127.0.0.1');
  const route = `${req.method} ${parsed.pathname.slice(MY_BLOG_ROUTE_PREFIX.length)}`;
  try {
    if (route === 'GET advisor') {
      if (!deps.advisorFetch) { io.json(res, 404, { ok: false, error: '개발판에서만 쓰는 경로입니다.' }); return true; }
      if (origin) { io.json(res, 403, { ok: false, error: '이 PC 안에서만 부를 수 있습니다.' }); return true; }
      const target = parsed.searchParams.get('p') || '';
      if (!isAdvisorPath(target)) { io.json(res, 400, { ok: false, error: '창구는 / 로 시작하는 상대경로만 됩니다.' }); return true; }
      // h: 실측 대조용 추가 헤더(JSON). 개발판·이 PC 안에서만 닿는 경로라 사유도 그대로 보여 준다.
      let extra: Record<string, string> = {};
      try { extra = JSON.parse(parsed.searchParams.get('h') || '{}'); } catch { /* 없는 셈 */ }
      try {
        io.json(res, 200, { ok: true, result: await deps.advisorFetch(target, extra) });
      } catch (error: any) {
        io.json(res, 502, { ok: false, error: String(error?.message || error) });
      }
      return true;
    }
    if (route === 'GET session') { io.json(res, 200, { ok: true, result: await deps.sessionStatus() }); return true; }
    if (route === 'POST session/open') { await deps.openLogin(); io.json(res, 200, { ok: true, result: { opened: true } }); return true; }
    // result 를 null 로 주면 사이트 bridgeCall 이 오류로 읽는다 — 안 잰 상태도 정상이라 record 로 감싼다.
    if (route === 'GET class') { io.json(res, 200, { ok: true, result: { record: await deps.blogClassGet() } }); return true; }
    // 동기화 재료 — 기능이 없는 빌드면 404(사이트는 '앱 구버전'으로 읽는다). 없는 기록은 null 로 감싼다.
    if (route === 'GET advisor-daily') {
      if (!deps.advisorDailyGet) { io.json(res, 404, { ok: false, error: '이 버전엔 없는 경로입니다.' }); return true; }
      io.json(res, 200, { ok: true, result: { record: await deps.advisorDailyGet() } });
      return true;
    }
    if (route === 'GET today-plan') {
      if (!deps.todayPlanGet) { io.json(res, 404, { ok: false, error: '이 버전엔 없는 경로입니다.' }); return true; }
      io.json(res, 200, { ok: true, result: { plan: await deps.todayPlanGet() } });
      return true;
    }
    if (route === 'POST assistant') {
      if (!deps.assistantChat) { io.json(res, 404, { ok: false, error: '이 버전엔 없는 경로입니다.' }); return true; }
      let raw: unknown;
      try { raw = await readJsonBody(req, ASSISTANT_BODY_LIMIT); } catch { io.json(res, 400, { ok: false, error: '대화 본문을 읽지 못했습니다.' }); return true; }
      const input = sanitizeAssistantInput(raw);
      if ('error' in input) { io.json(res, 400, { ok: false, error: input.error }); return true; }
      try {
        io.json(res, 200, { ok: true, result: await deps.assistantChat(input) });
      } catch (error) {
        // 엔진 실패 사유엔 경로 · 계정 정보가 섞일 수 있다 — 원인 코드(한도 · 로그인 · 설치)만 옮긴다(2026-10-06).
        io.json(res, 502, { ok: false, error: describeAssistantFailure(error, (p) => getEngineCooldown(p as any)?.reason ?? null) });
      }
      return true;
    }
    io.json(res, 404, { ok: false, error: '지원하지 않는 내 블로그 경로입니다.' });
  } catch {
    // 앱 쪽 오류엔 파일 경로가 실릴 수 있다 — 사유는 넘기지 않는다.
    io.json(res, 503, { ok: false, error: '앱에서 내 블로그 상태를 읽지 못했습니다.' });
  }
  return true;
}
