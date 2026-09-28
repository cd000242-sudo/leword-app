import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import * as briefs from '../topic-briefs';
import { tryExtractJson } from '../agent-cli/parse';
import { runWithAnyAgent } from '../agent-cli/runAny';
import { requireJsonArray } from '../agent-cli/replyValidators';
import * as inventory from '../../main/topic-brief-inventory';
import { buildTopicBriefPolicy } from '../topic-brief-policy';

const DAY = new Date('2026-09-13T06:00:00.000Z');
const draft = { title: '가을 건강 관리 준비할 사항', timing: 'NOW', coreKeyword: '가을 건강', keywords: ['가을 건강'], factIds: ['f1'], value: '가을 건강 관리 안내', primaryIntent: '건강 관리', types: ['가이드형'] };
const facts = ['f1', 'f2'].map((id) => ({ id, field: '건강', title: '가을 건강 관리 안내', snippet: '', press: 'example.test', link: `https://example.test/${id}`, publishedAt: '2026-09-12T00:00:00.000Z', dates: [] }));

async function runScript(options: { previousCount?: number; fail?: boolean; noFacts?: boolean; claudeProse?: boolean } = {}) {
  const writes = vi.fn();
  const exit = vi.fn();
  const news = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }));
  const claude = vi.fn(async () => { if (options.claudeProse) return '요청하신 글감은 다음과 같습니다.'; throw new Error('weekly limit'); });
  const codex = vi.fn(async () => { throw new Error('not_installed'); });
  const gemini = vi.fn(async () => { if (options.fail) throw new Error('503 unavailable'); return JSON.stringify([draft]); });
  const previous = options.previousCount == null ? null : { rounds: [{ slot: '아침', builtAt: DAY.toISOString(), briefs: Array.from({length:options.previousCount || 0}, (_, i) => ({...draft,field:'건강',coreKeyword:'기존 검색어 '+i,facts})) }] };
  const mocks: Record<string, unknown> = {
    'ts-node/register/transpile-only': {},
    './load-project-env': { loadProjectEnv() {} },
    fs: { existsSync: () => !!previous, readFileSync: () => JSON.stringify(previous), mkdirSync() {}, writeFileSync: writes },
    path,
    '../src/utils/topic-briefs': { ...briefs, kstToday: (date?: Date) => date ? briefs.kstToday(date) : DAY, BRIEF_FIELDS: [{ field: '건강', queries: ['건강'] }], toFactCards: () => options.noFacts ? [] : facts },
    '../src/utils/naver-api-hub': { naverApiFetch: news },
    '../src/utils/environment-manager': { EnvironmentManager: { getInstance: () => ({ getConfig: () => ({ naverClientId: 'fixture-id', naverClientSecret: 'fixture-secret' }) }) } },
    '../src/utils/agent-cli/defaultChain': { createDefaultAgentChain: () => [{ provider: 'claude', run: claude }, { provider: 'codex', run: codex }, { provider: 'gemini', run: gemini }] },
    '../src/utils/agent-cli/runAny': { runWithAnyAgent },
    '../src/utils/agent-cli/parse': { tryExtractJson },
    // 폴백 체인 답 검사(2026-09-15) — 글감이 JSON 배열이 아니면 다음 엔진으로 넘긴다.
    '../src/utils/agent-cli/replyValidators': { requireJsonArray },
    '../src/utils/naver-searchad-api': {},
    '../src/utils/topic-brief-policy': { buildTopicBriefPolicy: () => buildTopicBriefPolicy({weights:{'지원금·복지':0,'비즈니스·소상공인':0,'경제·금융':0,'생활경제·부동산':0,'주요 이슈':0,'건강':1},mainCategories:['건강']}) },
    '../src/main/topic-brief-inventory': { ...inventory, generateBriefInventory: (options: any) => inventory.generateBriefInventory({...options,goal:1,maxRefillRounds:0}) },
    '../src/main/topic-brief-metrics': { measureBriefDocumentCounts: async (rows: unknown) => rows, measureBriefSearchVolumes: async (rows: unknown) => ({briefs:rows,volumes:new Map(),evidenceByKeyword:new Map()}) },
    '../src/main/topic-brief-pipeline': {
      enrichBriefFacts: async (cards: unknown) => cards,
      reviewTopicBriefs: async (rows: unknown) => rows,
      normalizeBriefBoard: (board: unknown) => board,
    },
  };
  const script = fs.readFileSync(path.resolve(__dirname, '../../../scripts/topic-briefs.js'), 'utf8');
  await vm.runInNewContext(script, {
    require: (name: string) => { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name]; },
    process: { argv: ['node', 'script', '--serp=none', '--carry=previous.json', '--skipIfSlotDone=true'], env: {}, exit },
    console: { log() {}, error() {} },
    setTimeout: (done: () => void) => { done(); return 0; },
  });
  return { writes, exit, news, claude, codex, gemini };
}

describe('오늘의 글감 발행 경로', () => {
  it('이미 게시된 0건 회차를 재시도하고 Gemini가 생성한 글감을 게시한다', async () => {
    const result = await runScript({ previousCount: 0 });
    expect(result.claude).toHaveBeenCalledTimes(2);
    expect(result.codex).toHaveBeenCalledTimes(2);
    expect(result.gemini).toHaveBeenCalledTimes(2);
    expect(result.writes).toHaveBeenCalledOnce();
    expect(JSON.parse(result.writes.mock.calls[0][1]).counts.briefs).toBe(1);
    expect(result.exit).toHaveBeenCalledWith(0);
  });
  it('클로드가 글감 대신 설명문을 내면 다음 엔진의 JSON 글감을 게시한다 — 폴백 체인 답 검사', async () => {
    const result = await runScript({ previousCount: 0, claudeProse: true });
    expect(result.claude).toHaveBeenCalledTimes(2);
    expect(result.gemini).toHaveBeenCalledTimes(2);
    expect(result.writes).toHaveBeenCalledOnce();
    expect(JSON.parse(result.writes.mock.calls[0][1]).counts.briefs).toBe(1);
  });
  it('50개 이상 게시된 회차는 API를 다시 호출하지 않는다', async () => {
    const result = await runScript({ previousCount: 50 });
    expect(result.news).not.toHaveBeenCalled();
    expect(result.gemini).not.toHaveBeenCalled();
    expect(result.writes).not.toHaveBeenCalled();
  });
  it.each([{ fail: true }, { noFacts: true }])('생성할 수 없으면 실패하고 기존 게시본을 덮어쓰지 않는다: %j', async (options) => {
    const result = await runScript(options);
    expect(result.exit).toHaveBeenCalledWith(1);
    expect(result.writes).not.toHaveBeenCalled();
  });
});
