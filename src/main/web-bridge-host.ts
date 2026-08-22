/**
 * 웹 브리지 호스트 — electron 쪽 의존을 모아 브리지를 띄운다.
 *
 * 어드민 작업자 호출은 이 PC 의 `gh` CLI 인증을 그대로 쓴다(사장님 전용
 * "자동 연동" — 토큰이 브라우저·페이지 어디에도 안 나간다). 방문자 PC 에는
 * gh 인증이 없으므로 해당 경로는 자연히 실패 안내만 낸다.
 */

import { app } from 'electron';
import { execFile } from 'child_process';
import { startWebBridge } from './web-bridge';
import { forgeLaneInsights } from './lane-insights-service';
import { analyzeKeywordDemand } from './keyword-demand-service';
import { detectAgent } from '../utils/agent-cli/detect';

const WORKER_REPO = 'cd000242-sudo/leword-app';
const WORKER_FILE = 'agent-worker.yml';

function gh(args: string[], timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').slice(0, 200);
        reject(new Error(detail.includes('not logged') || detail.includes('auth')
          ? 'gh 로그인이 없습니다 — 이 PC 가 관리자 PC 가 맞는지 확인하세요.'
          : detail || 'gh 실행 실패'));
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

async function workerStatus(): Promise<unknown> {
  const out = await gh(['api', `repos/${WORKER_REPO}/actions/workflows/${WORKER_FILE}/runs?per_page=1`]);
  const run = (JSON.parse(out).workflow_runs || [])[0] || null;
  return run
    ? { status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url }
    : { status: 'no-runs' };
}

async function workerDispatchTest(): Promise<unknown> {
  await gh(['api', '-X', 'POST', `repos/${WORKER_REPO}/actions/workflows/${WORKER_FILE}/dispatches`,
    '-f', 'ref=main', '-f', 'inputs[mode]=test',
    '-f', 'inputs[prompt]=어드민(자동 연동)에서 보낸 테스트다. 한 문장으로 응답해라.']);
  return { dispatched: true };
}

export function startWebBridgeHost(): void {
  try {
    startWebBridge({
      appVersion: app.getVersion(),
      getAgentStatuses: async () => {
        const providers = ['claude', 'codex', 'gemini', 'grok'] as const;
        const statuses = await Promise.all(providers.map(async (provider) => {
          try {
            const s = await detectAgent(provider);
            /*
             * 사용량 표시(사장님 2026-08-20 "연동된 에이전트 전부 사용량 보이게,
             * 할당량 없으면 없음이라고"): 네 CLI 모두 사용량 API 가 없다
             * (실측 — codex --help 전수, gemini/grok 인증 파일에 사용량 필드 없음).
             * 지어내지 않는다. 아래는 **플랜**만 다룬다.
             *
             * 클로드는 detectAgent 가 이미 구독 유형을 실측해 둔다(subscriptionType,
             * 예: "max"). 그걸 안 쓰고 코덱스만 따로 파싱하느라 **있는 사실을 버리고
             * 있었다** — 화면이 "구독 확인됨"까지밖에 못 썼다
             * (사장님 지적 2026-08-22 "플랜과 사용량 확인이 잘돼야 한다",
             *  하네스 scripts/agent-wiring-audit.js 로 확인).
             * 그록·제미나이는 CLI 가 플랜을 안 알려 준다 — 빈 값 그대로 두고
             * 화면이 "플랜 미제공"이라고 말한다. 지어내지 않는다.
             */
            let plan = String(s.subscriptionType || '').trim();
            if (!plan && provider === 'codex' && s.loggedIn) {
              try {
                const { readFile } = await import('node:fs/promises');
                const { homedir } = await import('node:os');
                const { join } = await import('node:path');
                const auth = JSON.parse(await readFile(join(homedir(), '.codex', 'auth.json'), 'utf8'));
                const idToken = String(auth?.tokens?.id_token || '');
                const payload = JSON.parse(Buffer.from(idToken.split('.')[1] || '', 'base64').toString('utf8'));
                plan = String(payload['https://api.openai.com/auth']?.chatgpt_plan_type || '');
              } catch { /* 플랜을 못 읽으면 빈 값 — 없음으로 표시된다 */ }
            }
            return { provider, installed: s.installed, loggedIn: s.loggedIn, available: s.available, detail: s.detail || '', plan };
          } catch {
            return { provider, installed: false, loggedIn: false, available: false, detail: '감지 실패' };
          }
        }));
        return statuses;
      },
      forgeInsights: (keyword) => forgeLaneInsights(keyword),
      analyzeDemand: (keyword, light) => analyzeKeywordDemand(keyword, { light }),
      trend30: async (keyword) => {
        const { EnvironmentManager } = await import('../utils/environment-manager');
        const { analyzeKeywordTrend } = await import('../utils/trend-type-classifier');
        const env = EnvironmentManager.getInstance().getConfig();
        const config = {
          clientId: env.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
          clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
        };
        if (!config.clientId) return { success: false, error: 'Naver API 키 없음' };
        return { success: true, ...(await analyzeKeywordTrend(keyword, config)) };
      },
      /*
       * 지식인 답변 초안(사장님 확정 2026-08-20) — 답변 교리를 프롬프트에 박아
       * 본인 구독으로 생성한다. 게시는 안 한다: 초안만 돌려주고 사용자가 직접
       * 하나씩 단다(자동화는 효과 실측 후 결정).
       */
      kinAnswer: async ({ title, body, withLink, blogUrl, provider }) => {
        const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
        const { runClaude } = await import('../utils/agent-cli/claudeRunner');
        const { runCodex } = await import('../utils/agent-cli/codexRunner');
        const { runGemini } = await import('../utils/agent-cli/geminiRunner');
        const { runGrok } = await import('../utils/agent-cli/grokRunner');
        const prompt = [
          '너는 네이버 지식인에서 답변을 다는 평범한 사람이다. 아래 질문에 답해라.',
          '',
          `질문 제목: ${title}`,
          ...(body ? [`질문 내용: ${body}`] : []),
          '',
          '규칙 — 하나라도 어기면 실패다:',
          '- AI 가 쓴 티가 0 이어야 한다: 목록·번호·헤더·굵은 글씨 금지, 인사·자기소개 금지,',
          '  "도움이 되셨길 바랍니다"류 맺음말 금지. 아는 사람이 말해 주듯 문단 1~2개.',
          '- 깔끔·담백·정확: 질문이 물은 것만 답한다. 장황하면 실패.',
          '- 모르는 것을 지어내지 마라. 확실한 것만 쓰고, 불확실한 부분은 빼라.',
          '- 말하듯 쓴다: ~돼요/~합니다 혼용, "생각보다 금방 됩니다" 같은 체감 표현 허용.',
          withLink
            ? `- 답변 끝에 이 주소를 사람 말투 한 문장으로 자연스럽게 붙여라: ${blogUrl}`
              + ' (예: "절차 정리해 둔 글이 있어서 남깁니다: …"). 광고 문구 금지.'
            : '- 링크·홍보 문구를 넣지 마라.',
          '',
          '답변 본문만 출력해라 — 따옴표·머리말 없이.',
        ].join('\n');
        /*
         * 사용자가 고른 엔진 하나만 쓴다(사장님 확정 2026-08-20 "선택해서 연동하고
         * 쓰는 건데 폴백은 그다음 문제"). 고르지 않았을 때만 순서대로 시도한다.
         */
        const chain = [
          { provider: 'claude' as const, run: runClaude },
          { provider: 'codex' as const, run: runCodex },
          { provider: 'gemini' as const, run: runGemini },
          { provider: 'grok' as const, run: runGrok },
        ];
        const picked = provider ? chain.filter((item) => item.provider === provider) : chain;
        const run = await runWithAnyAgent(prompt, picked.length > 0 ? picked : chain, { timeoutMs: 90_000 });
        return { answer: String(run.reply || '').trim(), provider: run.provider };
      },
      /*
       * 글감 추론 — 사이트의 유튜브 글감·레이더 카드가 이 경로로 넘어온다.
       * 문장은 앱이 만든다(post-ideas-prompt.ts). 브리지는 재료만 받는다.
       * 사용자가 고른 엔진 하나만 쓰고, 안 골랐을 때만 순서대로 시도한다 —
       * 지식인 답변과 같은 규칙이다(사장님 확정 2026-08-20).
       */
      postIdeas: async ({ kind, keyword, context, title, body, provider }) => {
        const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
        const { runClaude } = await import('../utils/agent-cli/claudeRunner');
        const { runCodex } = await import('../utils/agent-cli/codexRunner');
        const { runGemini } = await import('../utils/agent-cli/geminiRunner');
        const { runGrok } = await import('../utils/agent-cli/grokRunner');
        const { buildPostIdeasPrompt, parsePostIdeas } = await import('../utils/post-ideas-prompt');
        const prompt = buildPostIdeasPrompt(kind === 'kin'
          ? { kind: 'kin', title, body }
          : { kind: 'keyword', keyword, context });
        const chain = [
          { provider: 'claude' as const, run: runClaude },
          { provider: 'codex' as const, run: runCodex },
          { provider: 'gemini' as const, run: runGemini },
          { provider: 'grok' as const, run: runGrok },
        ];
        const picked = provider ? chain.filter((item) => item.provider === provider) : chain;
        const run = await runWithAnyAgent(prompt, picked.length > 0 ? picked : chain, { timeoutMs: 120_000 });
        const ideas = parsePostIdeas(String(run.reply || ''));
        return { ideas, provider: run.provider };
      },
      /*
       * CLI 로그인 시작 — 사이트 버튼이 이 PC 의 CLI 로그인을 띄운다.
       * OAuth URL 은 메인 프로세스에서만 열고(loginUrl.ts 규칙) 브라우저로도
       * 보내지 않는다. 사이트에는 "시작됨/이미 로그인됨"만 알린다.
       */
      agentLogin: async (provider: string, switchAccount = false) => {
        const { installAgent, loginAgent, logoutAgent } = await import('../utils/agent-cli/installer');
        const { detectAgent } = await import('../utils/agent-cli/detect');
        const { shell } = await import('electron');
        const { isAllowedAgentLoginUrl } = await import('../utils/agent-cli/loginUrl');
        const target = provider as 'claude' | 'codex' | 'gemini' | 'grok';
        /*
         * 계정 바꾸기 — 로그아웃부터 한다.
         *
         * loginAgent 는 이미 로그인돼 있으면 'already_authenticated' 로 즉시
         * 끝난다(installer.ts). 그래서 [다시 로그인]을 눌러도 "이미 로그인돼
         * 있습니다"만 뜨고 계정이 안 바뀌었다(사장님 실측 2026-08-20).
         * 다른 플랜의 계정으로 갈아타려면 기존 자격증명을 먼저 지워야 한다.
         */
        if (switchAccount) {
          try {
            await logoutAgent(target);
          } catch (error) {
            // 로그아웃이 실패해도 로그인은 시도한다 — 이미 안 돼 있을 수도 있다.
            console.warn('[WEB-BRIDGE] 계정 바꾸기 로그아웃 실패(로그인은 계속):', error);
          }
        }
        /*
         * 미설치면 설치부터 한다(사장님 요구 2026-08-20 "버튼 한 번에 자동
         * 설치"). installAgent 는 앱에 이미 있었고 배선만 없었다. npm 설치가
         * 1~2분 걸리므로 아래 8초 경주는 'installing' 을 먼저 돌려주고,
         * 설치→로그인은 뒤에서 이어진다 — 사이트는 [상태 확인]으로 본다.
         */
        let installing = false;
        const detected = await detectAgent(target, { forceRefresh: true }).catch(() => null);
        if (!detected?.installed) installing = true;
        let opened = false;
        const finished = (async () => {
          if (installing) await installAgent(target);
          return loginAgent(target, {
          onLoginUrl: (url) => {
            if (!isAllowedAgentLoginUrl(target, url)) return;
            opened = true;
            void shell.openExternal(url);
          },
          });
        })();
        /*
         * 로그인은 사람이 브라우저에서 끝내야 해서 오래 걸린다. 8초만 기다려
         * "이미 로그인됨"인지 "브라우저 열림"인지 알려 주고, 나머지는 상태
         * 조회(/status)로 확인하게 한다 — 웹 요청을 몇 분씩 붙잡지 않는다.
         */
        const raced = await Promise.race([
          finished.then((status) => ({ done: true, status })).catch((error: unknown) => ({
            done: true,
            error: error instanceof Error ? error.message : String(error),
          })),
          new Promise((resolve) => { setTimeout(() => resolve({ done: false }), 8000); }),
        ]) as { done: boolean; status?: { loggedIn?: boolean; loginAction?: string }; error?: string };
        if (raced.done && raced.status) {
          return { state: raced.status.loginAction === 'already_authenticated' ? 'already' : 'done', loggedIn: Boolean(raced.status.loggedIn) };
        }
        if (raced.done && raced.error) return { state: 'failed', message: raced.error.slice(0, 200) };
        if (installing) return { state: 'installing' };
        return { state: opened ? 'browser-opened' : 'starting' };
      },
      adminWorker: {
        status: workerStatus,
        dispatchTest: workerDispatchTest,
      },
    });
  } catch (error) {
    console.error('[WEB-BRIDGE] 시작 실패(앱 동작에는 영향 없음):', error);
  }
}
