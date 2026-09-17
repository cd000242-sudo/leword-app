/**
 * 홈판 신호 브리지 호스트 배선 — 브리지를 띄울 때는 가볍게, 처음 불릴 때 스케줄러 · 에이전트 체인 · 이미지 실행기를 싣는다.
 */
import { randomUUID } from 'crypto';
import type { HomefeedBridgeDeps } from './bridge-routes';

export function createHomefeedHostDeps(): HomefeedBridgeDeps {
  let service: HomefeedBridgeDeps | null = null;

  const load = async (): Promise<HomefeedBridgeDeps> => {
    if (service) return service;
    const scheduler = await import('./scheduler');
    const { createHomefeedService } = await import('./service');
    const { enrichEditorialSources } = await import('./article-reader');
    const { publishHomefeedPublicFile } = await import('./publish-file');
    const { runWithAnyAgent } = await import('../../utils/agent-cli/runAny');
    const { createDefaultAgentChain } = await import('../../utils/agent-cli/defaultChain');
    const { runCodexImage } = await import('../../utils/agent-cli/codexImageRunner');
    const { recordEngineFailure } = await import('../../utils/agent-cli/engineHealth');
    const { AgentCliError } = await import('../../utils/agent-cli/types');
    service = createHomefeedService({
      store: scheduler.homefeedStore(),
      runtime: scheduler.homefeedRuntime,
      runCycle: () => scheduler.runHomefeedCycle('manual'),
      applySchedule: scheduler.applyHomefeedSchedule,
      runAgent: async (prompt, options) => {
        // 고른 엔진을 먼저 쓰고, 실패하면 공통 순서로 나머지를 시도한다(다른 브리지 경로와 같다).
        const run = await runWithAnyAgent(prompt, createDefaultAgentChain({ preferredProvider: options.provider }), {
          timeoutMs: options.timeoutMs,
          validate: options.validate,
        });
        return { reply: String(run.reply || ''), provider: run.provider };
      },
      generateImage: async (input) => {
        try {
          return await runCodexImage({ description: input.description, aspectRatio: input.aspectRatio });
        } catch (error) {
          // 같은 코덱스 계정이다 — 한도에 걸렸으면 글 생성 체인도 코덱스를 잠시 쉬게 한다.
          if (error instanceof AgentCliError) recordEngineFailure('codex', error.code, `${error.message}\n${error.detail ?? ''}`);
          throw error;
        }
      },
      now: () => Date.now(),
      newId: () => randomUUID().replace(/-/g, '').slice(0, 16),
      enrichSources: (sources) => enrichEditorialSources(sources),
      publishPublic: () => publishHomefeedPublicFile(scheduler.homefeedStore()),
    });
    return service;
  };

  return {
    stories: async () => (await load()).stories(),
    story: async (input) => (await load()).story(input),
    collect: async () => (await load()).collect(),
    brief: async (input) => (await load()).brief(input),
    selectEditorial: async (input) => (await load()).selectEditorial(input),
    shareEditorial: async (input) => (await load()).shareEditorial(input),
    review: async (input) => (await load()).review(input),
    titles: async (input) => (await load()).titles(input),
    visual: async (input) => (await load()).visual(input),
    select: async (input) => (await load()).select(input),
    draft: async (input) => (await load()).draft(input),
    image: async (input) => (await load()).image(input),
    imageFile: async (id) => (await load()).imageFile(id),
    publish: async (input) => (await load()).publish(input),
    performance: async (input) => (await load()).performance(input),
    calibration: async () => (await load()).calibration(),
    settings: async (patch) => (await load()).settings(patch),
  };
}
