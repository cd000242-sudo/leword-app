/**
 * 웹 브리지 — leaderspro.kr 웹 화면이 **사용자 PC 의 클로드코드(구독)** 를
 * 쓰게 하는 통로 (사장님 지시 2026-08-17: "API 키 말고 클로드코드를 웹에서").
 *
 *   웹(사이트 UI) → http://127.0.0.1:47615 → 이 브리지 → agentCli(구독 실행) → 응답
 *
 * 실행은 전부 사용자 본인 기기에서 본인 구독으로 일어난다 — 사이트는 화면일
 * 뿐이다. 그래서 약관·비용 문제가 없다.
 *
 * 보안 원칙:
 *   - 127.0.0.1 에만 바인드 — 밖에서 못 들어온다.
 *   - Origin 허용목록 — leaderspro.kr 계열만. 다른 사이트의 브라우저 요청은 403.
 *   - **임의 프롬프트 통로가 아니다** — 키워드 하나를 받아 고정 템플릿 추론
 *     (레인 인사이트)만 수행한다. 브리지가 구독의 오픈 프록시가 되면 안 된다.
 *   - 자격증명을 받지도 저장하지도 않는다.
 *   - Chrome PNA(사설망 접근) 프리플라이트에 Access-Control-Allow-Private-Network
 *     로 응답한다 — 이게 없으면 https 공개 페이지 → 로컬호스트 fetch 가 막힌다.
 *
 * 순수 Node http — electron 무의존이라 vitest 로 그대로 검증한다.
 */

import http from 'http';

export const WEB_BRIDGE_PORT = 47615;

const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://leaderspro.kr',
  'https://www.leaderspro.kr',
  // 로컬 개발·프리뷰
  'http://localhost:5173',
  'http://localhost:4173',
]);

/*
 * 지식인 답변 생성은 질문 전문(최대 3,000자 ≈ 9KB UTF-8)을 싣는다 —
 * 4KB 로는 본문이 잘려 400 이 났을 것이다. 여전히 로컬 왕복의 작은 몸집이다.
 */
const MAX_BODY_BYTES = 32768;

export interface WebBridgeDeps {
  appVersion: string;
  /** 3사 CLI 상태(설치·로그인·가용) — detectAgent 묶음. */
  getAgentStatuses: () => Promise<unknown>;
  /** 고정 템플릿 추론(레인 인사이트). 임의 프롬프트는 받지 않는다. */
  forgeInsights: (keyword: string) => Promise<unknown>;
  /** 마인드맵·수요 분석. light=연쇄용 경량(AI 1콜). 없으면 경로가 안 열린다. */
  analyzeDemand?: (keyword: string, light?: boolean) => Promise<unknown>;
  /** 30일 트렌드(데이터랩 실측). 없으면 그 경로는 열리지 않는다. */
  trend30?: (keyword: string) => Promise<unknown>;
  /**
   * 지식인 답변 생성(사장님 확정 2026-08-20) — 고정 템플릿(답변 교리)에 질문을
   * 끼워 본인 구독으로 돌린다. 임의 프롬프트 통로가 아닌 것은 다른 경로와 같다.
   * 게시는 하지 않는다 — 초안 텍스트만 돌려주고 사용자가 직접 단다.
   */
  kinAnswer?: (input: {
    title: string; body: string; withLink: boolean; blogUrl: string;
    /** 사용자가 고른 엔진. 빈 값이면 순서대로 시도한다. */
    provider?: string;
  }) => Promise<unknown>;
  /**
   * CLI 로그인 시작(사장님 지시 2026-08-20 "나머지도 버튼으로 바로 연동") —
   * 코덱스·제미나이·그록은 OAuth 리다이렉트가 이 PC 로 오므로 사이트가 직접
   * 받을 수 없다. 앱이 CLI 로그인을 띄우고 브라우저를 여는 것이 유일한 길이다.
   * 결과는 상태(로그인 여부)로만 돌려준다 — 자격증명은 앱 밖으로 안 나간다.
   */
  agentLogin?: (provider: string) => Promise<unknown>;
  /**
   * 어드민 작업자(사장님 전용 UX: "토큰도 알아서, 자동 연동").
   * 브리지가 이 PC 의 gh 인증으로 GitHub 를 대신 부른다 — 토큰이 브라우저에
   * 갈 일이 없다. 방문자 PC 에는 gh 인증이 없으므로 그냥 실패할 뿐이다.
   */
  adminWorker?: {
    status: () => Promise<unknown>;
    dispatchTest: () => Promise<unknown>;
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, code: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

export function createWebBridge(deps: WebBridgeDeps): http.Server {
  return http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || '');

    /*
     * Origin 이 있는데 허용목록 밖이면 CORS 헤더 없이 403 — 남의 사이트가
     * 방문자 브라우저를 통해 이 브리지를 부리는 것을 막는다.
     * Origin 이 없는 요청(로컬 도구·curl)은 같은 기기 사용자의 것이므로 허용.
     */
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      json(res, 403, { ok: false, error: '허용되지 않은 출처입니다.' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      // Chrome PNA — 공개 https 페이지가 로컬호스트에 접근할 때 요구한다.
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && req.url === '/v1/bridge/status') {
        const agents = await deps.getAgentStatuses();
        json(res, 200, { ok: true, app: 'leword', version: deps.appVersion, agents });
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/bridge/ai-subs') {
        let keyword = '';
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}');
          keyword = String(parsed?.keyword || '').trim();
        } catch {
          json(res, 400, { ok: false, error: '본문이 JSON 이 아닙니다.' });
          return;
        }
        if (!keyword || keyword.length > 60) {
          json(res, 400, { ok: false, error: '키워드가 비었거나 너무 깁니다.' });
          return;
        }
        const result = await deps.forgeInsights(keyword);
        json(res, 200, { ok: true, result });
        return;
      }

      /*
       * 마인드맵 — 사이트에서도 앱과 같은 두뇌를 쓴다.
       *
       * 지금까지 웹의 "마인드맵 확장키워드"는 /leword 소개로 보내는 링크였다.
       * 앱 기능이라 웹에서는 못 돌린다고 적어 뒀는데, 브리지가 생긴 뒤로는
       * 그 전제가 사라졌다 — 사용자 PC 의 앱이 켜져 있으면 본인 구독으로
       * 돌릴 수 있다. 실측 확장어 + "왜 검색하나"를 그대로 돌려준다.
       */
      if (deps.analyzeDemand && req.method === 'POST' && req.url === '/v1/bridge/mindmap') {
        let keyword = '';
        let light = false;
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}');
          keyword = String(parsed?.keyword || '').trim();
          light = parsed?.light === true;
        } catch {
          json(res, 400, { ok: false, error: '본문이 JSON 이 아닙니다.' });
          return;
        }
        if (!keyword || keyword.length > 60) {
          json(res, 400, { ok: false, error: '키워드가 비었거나 너무 깁니다.' });
          return;
        }
        json(res, 200, { ok: true, result: await deps.analyzeDemand(keyword, light) });
        return;
      }

      /*
       * 30일 트렌드 — 앱의 그래프와 같은 실측(데이터랩)을 웹에도 준다.
       * "앱은 되는데 웹은 안 되고 이러면 안 된다"(사장님, 2026-08-18).
       */
      if (deps.trend30 && req.method === 'POST' && req.url === '/v1/bridge/trend') {
        let keyword = '';
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}');
          keyword = String(parsed?.keyword || '').trim();
        } catch {
          json(res, 400, { ok: false, error: '본문이 JSON 이 아닙니다.' });
          return;
        }
        if (!keyword || keyword.length > 60) {
          json(res, 400, { ok: false, error: '키워드가 비었거나 너무 깁니다.' });
          return;
        }
        json(res, 200, { ok: true, result: await deps.trend30(keyword) });
        return;
      }

      if (deps.kinAnswer && req.method === 'POST' && req.url === '/v1/bridge/kin-answer') {
        let title = '';
        let body = '';
        let withLink = false;
        let blogUrl = '';
        let provider = '';
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}');
          title = String(parsed?.title || '').trim().slice(0, 200);
          body = String(parsed?.body || '').trim().slice(0, 4000);
          withLink = parsed?.withLink === true;
          blogUrl = String(parsed?.blogUrl || '').trim().slice(0, 300);
          // 허용목록 밖 값은 버린다 — 임의 문자열이 실행 경로로 흘러가지 않게.
          const wanted = String(parsed?.provider || '').trim();
          provider = ['claude', 'codex', 'gemini', 'grok'].includes(wanted) ? wanted : '';
        } catch {
          json(res, 400, { ok: false, error: '본문이 JSON 이 아닙니다.' });
          return;
        }
        if (!title) {
          json(res, 400, { ok: false, error: '질문 제목이 비었습니다.' });
          return;
        }
        if (withLink && !blogUrl) {
          json(res, 400, { ok: false, error: '링크 추가를 켰는데 글 주소가 비었습니다.' });
          return;
        }
        json(res, 200, { ok: true, result: await deps.kinAnswer({ title, body, withLink, blogUrl, provider }) });
        return;
      }

      if (deps.agentLogin && req.method === 'POST' && req.url === '/v1/bridge/agent-login') {
        let provider = '';
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}');
          provider = String(parsed?.provider || '').trim();
        } catch {
          json(res, 400, { ok: false, error: '본문이 JSON 이 아닙니다.' });
          return;
        }
        // 허용목록 밖 문자열이 셸로 흘러가지 않게 여기서 못박는다.
        if (!['claude', 'codex', 'gemini', 'grok'].includes(provider)) {
          json(res, 400, { ok: false, error: '알 수 없는 제공자입니다.' });
          return;
        }
        json(res, 200, { ok: true, result: await deps.agentLogin(provider) });
        return;
      }

      if (deps.adminWorker && req.method === 'GET' && req.url === '/v1/bridge/admin/worker-status') {
        json(res, 200, { ok: true, result: await deps.adminWorker.status() });
        return;
      }

      if (deps.adminWorker && req.method === 'POST' && req.url === '/v1/bridge/admin/worker-test') {
        json(res, 200, { ok: true, result: await deps.adminWorker.dispatchTest() });
        return;
      }

      json(res, 404, { ok: false, error: '없는 경로입니다.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      json(res, 500, { ok: false, error: message.slice(0, 200) });
    }
  });
}

/** 127.0.0.1 전용으로 연다. 이미 떠 있으면(다른 창) 조용히 물러난다. */
export function startWebBridge(deps: WebBridgeDeps): http.Server {
  const server = createWebBridge(deps);
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.log('[WEB-BRIDGE] 이미 실행 중 — 이 창은 브리지를 띄우지 않는다.');
      return;
    }
    console.error('[WEB-BRIDGE] 서버 오류:', error.message);
  });
  server.listen(WEB_BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[WEB-BRIDGE] 웹 ↔ 클로드코드 브리지 대기 중 — 127.0.0.1:${WEB_BRIDGE_PORT}`);
  });
  return server;
}
