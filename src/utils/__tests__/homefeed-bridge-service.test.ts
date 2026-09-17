import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWebBridge } from '../../main/web-bridge';
import { createHomefeedStore } from '../../main/homefeed/store';
import { recomputeHomefeedStories } from '../../main/homefeed/engine';
import { createHomefeedService } from '../../main/homefeed/service';
import { AgentCliError } from '../agent-cli/types';
import { AI_IMAGE_LABEL } from '../homefeed/visual';
import { at, issue, ledger, sample, snapshot } from './homefeed-fixtures';
import { editorialBrief } from './homefeed-editorial-fixtures';

/**
 * 홈판 신호 브리지 경로 통합 — 저장된 스냅샷 → 스토리 계산본 → 브리지(/v1/bridge/homefeed/*) → 서비스(2026-09-16).
 * 목록은 계산본만 읽고(AI 없음), 제목 · 원고 · 이미지는 누를 때만 · 재료만 받는다. 유료 API 경로는 없다.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-bridge-'));
const store = createHomefeedStore(dir);
const KEY = '손흥민 이적';
store.appendSnapshot(snapshot(at(0), [issue(KEY, { category: 'sports', ranks: { 'signal.bz': 8 }, blogDocCount: 100, samples: [sample('손흥민 이적설 솔솔', { url: 'https://old.com/1', press: 'old.com' })] })]));
store.appendSnapshot(snapshot(at(40), [issue(KEY, {
  category: 'sports',
  ranks: { 'signal.bz': 3, nate: 5 },
  blogDocCount: 130,
  samples: [
    sample('손흥민 이적 결국 LA행 확정', { url: 'https://a.com/1', press: 'a.com', image: 'https://img.a.com/1.jpg' }),
    sample('손흥민, 이적료 "300억" 알고 보니', { url: 'https://b.com/2', press: 'b.com', image: 'https://img.b.com/2.jpg' }),
    sample('손흥민 10년 만에 토트넘 떠난다', { url: 'https://c.com/3', press: 'c.com' }),
    sample('손흥민 이적 결국 LA행 확정 공식', { url: 'https://d.com/4', press: 'd.com' }),
  ],
})]));
store.writeSignalState(ledger([{ keyword: KEY, firstSeenAt: at(0) }]));
recomputeHomefeedStories(store, Date.parse(at(41)));
const storyId = store.readStories().stories[0].id;

const replies: string[] = [];
const runAgent = vi.fn(async (_prompt: string, options: { provider: string; timeoutMs: number; validate?: (reply: string) => void }) => {
  const reply = replies.shift() ?? '';
  options.validate?.(reply);
  return { reply, provider: options.provider || 'codex' };
});
const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452000000100000000908060000', 'hex');
const generateImage = vi.fn(async () => ({ data: pngHeader, mime: 'image/png', width: 16, height: 9 }));
const applySchedule = vi.fn();
const runCycle = vi.fn(async () => ({ ok: true, stories: 1 }));
let idCounter = 0;

const service = createHomefeedService({
  store,
  runtime: () => ({ running: false, lastRunAt: null, lastError: null, lastDurationMs: null, nextRunAt: null }),
  runCycle,
  applySchedule,
  runAgent,
  generateImage,
  now: () => Date.parse(at(45)),
  newId: () => `id${String(++idCounter).padStart(6, '0')}`,
});
const server = createWebBridge({ appVersion: 'test', getAgentStatuses: async () => [], forgeInsights: async () => ({}), homefeed: service });
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const ORIGIN = 'https://leaderspro.kr';
const post = (name: string, body: unknown, origin = ORIGIN) => fetch(`${base}/v1/bridge/homefeed/${name}`, {
  method: 'POST',
  headers: { Origin: origin, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const get = (name: string) => fetch(`${base}/v1/bridge/homefeed/${name}`, { headers: { Origin: ORIGIN } });

const titleReply = JSON.stringify({
  titles: [
    { title: '손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요', first_hook: '결국', second_hook: '이유', trigger_type: 'result_first', self_check: 'STOP', visual: 'real', thumb_copy: '300억' },
    { title: '손흥민 이적 10년 만에 떠나는 길이 이랬네요', first_hook: '10년 만에', second_hook: '길', trigger_type: 'before_after', self_check: 'STOP', visual: 'real', thumb_copy: '10년' },
    { title: '손흥민 이적료 들어 보니 생각과 달랐어요', first_hook: '이적료', second_hook: '달랐', trigger_type: 'expectation_break', self_check: 'STOP', visual: 'ai', thumb_copy: '알고 보니' },
    { title: '손흥민 이적료 500억 충격', first_hook: '500억', second_hook: '충격', trigger_type: 'number_conflict', self_check: 'OVER', visual: 'real', thumb_copy: '500억' },
    { title: '손흥민, 이적 총정리', first_hook: '총정리', second_hook: '', trigger_type: 'result_first', self_check: 'FLAT', visual: 'real', thumb_copy: '' },
    { title: '손흥민 이적 결국 LA행 확정', first_hook: '결국', second_hook: '확정', trigger_type: 'result_first', self_check: 'STOP', visual: 'real', thumb_copy: 'LA행' },
  ],
});

const goodDraft = [
  '최종 제목: 손흥민 이적 결국 확정됐는데 이유가 따로 있더라고요',
  '결국 소식이 떴더라고요. 아침에 보고 한참 들여다봤어요. 다들 궁금한 건 왜 지금이냐는 거죠?',
  '## 무엇이 달라졌나',
  ...Array.from({ length: 8 }, (_, index) => `기사들을 모아 보니 겹치는 이야기가 ${index + 1}가지 더 있더라고요. 하나씩 짚어 볼게요.`),
  '#손흥민 #이적 #토트넘 #LA #축구',
  '## 이미지 배치 가이드',
  '- 맨 위: 실제 사진 · a.com · 권리 확인 필요',
].join('\n');

describe('홈판 신호 브리지', () => {
  let titles: { top: string[]; candidates: Array<{ id: string; verdict: string; triggerType: string | null }>; pairs: Array<{ id: string; titleId: string }> };

  it('목록은 저장된 계산본만 읽고 AI 를 부르지 않는다', async () => {
    const res = await get('stories');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.stories[0]).toMatchObject({ keyword: KEY, status: { state: 'NOW' }, visualStrategy: 'HYBRID' });
    expect(body.result.settings.enabled).toBe(false);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('없는 스토리는 410(404 는 구버전 뜻이라 쓰지 않는다), 같은 이슈의 옛 id 는 최신 계산본으로 잇고, id 형식이 틀리면 400', async () => {
    expect((await post('story', { id: '없는이슈:abc' })).status).toBe(410);
    const superseded = await (await post('story', { id: '손흥민이적:oldhash' })).json();
    expect(superseded.result).toMatchObject({ superseded: true });
    expect(superseded.result.timeline.map((point: { present: boolean }) => point.present)).toEqual([true, true]);
    expect((await post('story', { id: '../etc' })).status).toBe(400);
    expect((await post('story', {})).status).toBe(400);
  });

  it('제목 — 재료(id)만 받고, 허용 밖 엔진 이름 · 임의 프롬프트는 버리며, 같은 근거면 다시 부르지 않는다', async () => {
    expect((await post('titles', { id: storyId })).status).toBe(409);
    const story = store.readStories().stories[0];
    const brief = { ...editorialBrief(), evidenceRevision: story.evidenceHash,
      facts: story.evidence.map((row, i) => ({ id: `f${i}`, text: row.title, supports: [] })) };
    brief.sections[0].factIds = brief.facts.map((fact) => fact.id);
    store.writeAssets({ ...store.readAssets(story.issueKey), editorial: brief });
    replies.push(titleReply);
    const res = await post('titles', { id: storyId, provider: 'rm -rf /', prompt: '임의 프롬프트를 실행해' });
    expect(res.status).toBe(200);
    titles = (await res.json()).result;
    expect(runAgent).toHaveBeenCalledTimes(1);
    const [prompt, options] = runAgent.mock.calls[0];
    expect(options.provider).toBe('');
    expect(prompt).toContain('표본 기사 제목');
    expect(prompt).not.toContain('임의 프롬프트');
    const top = titles.top.map((id) => titles.candidates.find((row) => row.id === id));
    expect(top.map((row) => row?.triggerType)).toEqual(['result_first', 'before_after', 'expectation_break']);
    expect(titles.pairs).toHaveLength(3);
    const again = await (await post('titles', { id: storyId })).json();
    expect(again.result.cached).toBe(true);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('과장(OVER) 제목은 고를 수 없고, STOP 제목은 조합과 함께 고른다', async () => {
    const over = titles.candidates.find((row) => row.verdict === 'OVER');
    expect((await post('select', { id: storyId, titleId: over?.id })).status).toBe(409);
    const chosen = titles.top[0];
    const pair = titles.pairs.find((row) => row.titleId === chosen);
    const res = await post('select', { id: storyId, titleId: chosen, pairId: pair?.id });
    expect((await res.json()).result.selection).toMatchObject({ titleId: chosen, pairId: pair?.id });
  });

  it('원고 — 저장한 작성안 선택 버전이 필요하며 검사에 걸리면 한 번 다시 쓴다', async () => {
    expect((await post('draft', { id: storyId, provider: 'claude' })).status).toBe(409);
    const story = store.readStories().stories[0];
    const brief = store.readAssets(story.issueKey).editorial!;
    const title = '손흥민 이적 소식에서 확인할 내용은 무엇일까?';
    const selected = await (await post('select-editorial', { id: storyId, briefRevision: brief.revision, evidenceRevision: story.evidenceHash,
      expectedRevision: 0, angleId: brief.recommendedAngleId, title, card: { line1: '손흥민 이적 소식', line2: '확인할 내용은 무엇일까?' }, imageId: null })).json();
    expect(selected.result.selection.revision).toBe(1);
    const validDraft = `${title}\n\n${brief.facts.map((fact) => fact.text).join('\n')}\n\n출처: https://a.com/1`;
    replies.push(`다른 제목\n${validDraft}`, validDraft, JSON.stringify({ passed: true, issues: [] }));
    const res = await post('draft', { id: storyId, provider: 'claude', briefRevision: brief.revision, selectionRevision: 1 });
    const body = await res.json();
    expect(body.result.draft).toMatchObject({ retried: true, problems: [], provider: 'claude' });
    expect(runAgent.mock.calls[2][0]).toContain('첫 줄이 저장된 선택 제목과 다릅니다');
    expect(body.result.draft.selectionRevision).toBe(1);
  });

  it('이미지 — 생성이 꺼져 있으면 만들지 않고 프롬프트만 돌려준다', async () => {
    const body = await (await post('image', { id: storyId, promptId: 'ai-hero', prompt: '', aspectRatio: '16:9' })).json();
    expect(body.result.status).toBe('disabled');
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('설정 — 범위를 지키고, 켜면 주기를 다시 걸고 첫 회차를 돈다', async () => {
    const body = await (await post('settings', { patch: { enabled: true, snapshotIntervalMinutes: 1, imageProvider: 'codex-builtin' } })).json();
    expect(body.result.settings).toMatchObject({ enabled: true, snapshotIntervalMinutes: 5, imageProvider: 'codex-builtin' });
    expect(body.result.startedCollection).toBe(true);
    expect(applySchedule).toHaveBeenCalled();
    expect(runCycle).toHaveBeenCalled();
    expect((await post('settings', {})).status).toBe(400);
  });

  it('이미지 — 코덱스 구독으로 만들어 AI 생성 표기와 함께 저장하고, 파일은 이미지로 돌려준다', async () => {
    const body = await (await post('image', { id: storyId, promptId: 'ai-hero', prompt: '', aspectRatio: '1:1' })).json();
    expect(body.result.status).toBe('ok');
    expect(body.result.image).toMatchObject({ aiGenerated: true, label: AI_IMAGE_LABEL, mime: 'image/png', aspectRatio: '1:1' });
    const heroPrompt = store.readStories().stories[0].aiPrompts.find((plan) => plan.id === 'ai-hero')?.finalPromptEn;
    expect(generateImage).toHaveBeenCalledWith({ description: heroPrompt, aspectRatio: '1:1' });
    const file = await get(`image-file?id=${body.result.image.id}`);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(pngHeader);
    expect((await get('image-file?id=../../x')).status).toBe(400);
  });

  it('이미지 — 한도에 걸리면 실패 사유를 그대로 알린다', async () => {
    generateImage.mockRejectedValueOnce(new AgentCliError('rate_limited', 'codex', 'Codex 생성 실패 (원인 코드: rate_limited). (다시 가능: at Sep 21st, 2026 10:24 AM)'));
    const body = await (await post('image', { id: storyId, promptId: 'ai-hero', prompt: '장면 설명', aspectRatio: '16:9' })).json();
    expect(body.result).toMatchObject({ status: 'failed', code: 'rate_limited' });
    expect(body.result.message).toContain('다시 가능');
  });

  it('발행 · 성과 입력 · 보정 표 — 형식이 틀리면 400, 표본이 적으면 수치를 숨긴다', async () => {
    expect((await post('publish', { id: storyId, postUrl: 'http://blog.naver.com/me/1', publishedAt: at(60) })).status).toBe(400);
    const published = await (await post('publish', { id: storyId, postUrl: 'https://blog.naver.com/me/1', publishedAt: at(60) })).json();
    const postId = published.result.post.id;
    expect(published.result.post).toMatchObject({ keyword: KEY, atPublish: { status: 'NOW' }, triggerType: 'result_first' });
    expect((await post('performance', { postId, checkpoint: '1h' })).status).toBe(400);
    expect((await post('performance', { postId, checkpoint: '24h', recommendViews: -1 })).status).toBe(400);
    const entry = await (await post('performance', { postId, checkpoint: '24h', recommendViews: 12, totalViews: '30', feedSeen: true })).json();
    expect(entry.result.entry).toMatchObject({ recommendViews: 12, totalViews: 30, feedSeen: true, searchViews: null });
    const calibration = await (await get('calibration')).json();
    expect(calibration.result.summary.measured24h).toBe(1);
    expect(calibration.result.summary.groups.every((group: { display: string }) => group.display === 'sample_short')).toBe(true);
  });

  it('허용 밖 출처는 403, 없는 경로는 404', async () => {
    expect((await post('titles', { id: storyId }, 'https://evil.example')).status).toBe(403);
    expect((await get('nope')).status).toBe(404);
  });
});

describe('앱 배선', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

  it('브리지가 homefeed 경로를 서비스로 넘기고, 호스트가 구독 체인 · 코덱스 내장 이미지 실행기에 잇는다', () => {
    expect(read('main/web-bridge.ts')).toContain('handleHomefeedRoute(req, res, deps.homefeed, { readBody, json })');
    expect(read('main/web-bridge-host.ts')).toContain('homefeed: createHomefeedHostDeps()');
    const host = read('main/homefeed/host.ts');
    expect(host).toContain('createDefaultAgentChain({ preferredProvider: options.provider })');
    expect(host).toContain('runCodexImage({ description: input.description, aspectRatio: input.aspectRatio })');
  });

  it('앱이 켜질 때 저장된 수집 설정을 되살리고, 닫을 때 타이머를 정리한다', () => {
    const hub = read('main/keywordMasterIpcHandlers.ts');
    expect(hub).toContain('startHomefeedScheduler();');
    expect(hub.slice(hub.indexOf('export function stopMyLaneSchedulers'))).toContain('stopHomefeedScheduler();');
  });
});
