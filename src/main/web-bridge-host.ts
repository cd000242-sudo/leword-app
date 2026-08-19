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
            return { provider, installed: s.installed, loggedIn: s.loggedIn, available: s.available, detail: s.detail || '' };
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
      kinAnswer: async ({ title, body, withLink, blogUrl }) => {
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
        const run = await runWithAnyAgent(prompt, [
          { provider: 'claude', run: runClaude },
          { provider: 'codex', run: runCodex },
          { provider: 'gemini', run: runGemini },
          { provider: 'grok', run: runGrok },
        ], { timeoutMs: 90_000 });
        return { answer: String(run.reply || '').trim(), provider: run.provider };
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
