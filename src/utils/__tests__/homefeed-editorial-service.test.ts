import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHomefeedService, storySummary } from '../../main/homefeed/service';
import { createHomefeedStore } from '../../main/homefeed/store';
import { publicStoryDetail } from '../../main/homefeed/public-detail';
import { buildHomefeedPublicPayload } from '../homefeed/publish';
import { buildStories } from '../homefeed/engine';
import { editorialContent, editorialSource } from './homefeed-editorial-fixtures';
import { at, issue, ledger, sample, settings, snapshot } from './homefeed-fixtures';
import type { EditorialSelectInput } from '../homefeed/editorial-types';

let dir: string;
let store: ReturnType<typeof createHomefeedStore>;
let service: ReturnType<typeof createHomefeedService>;
let runAgent: ReturnType<typeof vi.fn>;
let replies: string[];
let serial: number;
const source = () => ({ ...editorialSource(), imageUrl: 'https://img.example.com/gondola.jpg' });
const current = () => store.readStories().stories[0];
const assets = () => store.readAssets(current().issueKey);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-editorial-service-'));
  store = createHomefeedStore(dir);
  const news = source();
  const shot = snapshot(at(40), [issue('남산 곤돌라 2심 패소', { samples: [sample(news.title, { url: news.url, description: news.text, image: news.imageUrl })], category: 'policy' })]);
  store.writeStories(buildStories({ history: [shot], state: ledger([]), settings: settings(), computedAt: at(40) }));
  replies = [];
  serial = 0;
  runAgent = vi.fn(async () => ({ reply: replies.shift() ?? '', provider: 'test' }));
  service = createHomefeedService({ store, runAgent: runAgent as any, enrichSources: async () => [source()],
    now: () => Date.parse(at(45)), newId: () => `id${++serial}`, generateImage: vi.fn(), runCycle: vi.fn(), applySchedule: vi.fn(),
    runtime: () => ({ running: false, lastRunAt: null, lastError: null, lastDurationMs: null, nextRunAt: null }) });
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

async function prepare() {
  replies.push(JSON.stringify(editorialContent()), JSON.stringify({ passed: true, issues: [] }));
  return await service.brief({ id: current().id, evidenceRevision: current().evidenceHash }) as any;
}
function selection(overrides: Partial<EditorialSelectInput> = {}): EditorialSelectInput {
  const brief = assets().editorial!;
  const angle = brief.angles[0];
  return { id: current().id, briefRevision: brief.revision, evidenceRevision: current().evidenceHash,
    expectedRevision: assets().editorialSelection?.revision ?? 0, angleId: angle.id, title: angle.suggestedTitle,
    card: angle.firstCard, imageId: 'source-one', ...overrides };
}

describe('작성안의 생성·선택·원고 서비스', () => {
  it('조회는 AI를 호출하지 않고 조각 카드를 추천하지 않는다', async () => {
    const list: any = await service.stories();
    const detail: any = await service.story({ id: current().id });
    expect(list.stories[0].firstCard.possible).toBe(false);
    expect(detail.editorial.state).toBe('unprepared');
    expect(detail.editorial.summary).toContain('용도구역');
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('생성 후 독립 검토를 거치고 같은 근거의 결과는 재사용한다', async () => {
    expect((await prepare()).editorial.state).toBe('ready');
    const again: any = await service.brief({ id: current().id });
    expect(again.cached).toBe(true);
    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(runAgent.mock.calls[1][0]).toContain('검토');
  });

  it('같은 이슈의 동시 요청은 한 번 생성한다', async () => {
    replies.push(JSON.stringify(editorialContent()), JSON.stringify({ passed: true, issues: [] }));
    await Promise.all([service.brief({ id: current().id }), service.brief({ id: current().id })]);
    expect(runAgent).toHaveBeenCalledTimes(2);
  });

  it('구조가 맞아도 근거 밖 숫자는 한 번 고친 뒤 의미 검토한다', async () => {
    const invalid = editorialContent();
    invalid.facts[0].text += ' 사업비는 999억원이다.';
    replies.push(JSON.stringify(invalid), JSON.stringify(editorialContent()), JSON.stringify({ passed: true, issues: [] }));
    expect((await service.brief({ id: current().id }) as any).editorial.state).toBe('ready');
    expect(runAgent).toHaveBeenCalledTimes(3);
    expect(runAgent.mock.calls[1][0]).toContain('연결한 근거에 없는 숫자');
  });

  it('수정 결과가 읽히지 않으면 확인이 필요한 최초 작성안을 보존하고 추가 재시도하지 않는다', async () => {
    const incomplete = editorialContent();
    incomplete.unresolved = ['판결의 적용 범위를 더 확인해야 합니다.'];
    replies.push(JSON.stringify(incomplete), 'not-json');
    const result: any = await service.brief({ id: current().id });
    expect(result.editorial.state).toBe('needs_evidence');
    expect(result.editorial.brief.summary).toBe(incomplete.summary);
    expect(runAgent).toHaveBeenCalledTimes(2);
  });

  it('의미 검토 실패를 준비 완료로 바꾸지 않는다', async () => {
    replies.push(JSON.stringify(editorialContent()), JSON.stringify({ passed: false, issues: ['판결 범위를 확대 해석했습니다.'] }));
    expect((await service.brief({ id: current().id }) as any).editorial.state).toBe('needs_evidence');
    await expect(service.selectEditorial(selection())).rejects.toMatchObject({ status: 409 });
  });

  it('선택 전체를 저장하고 재시작 후에도 문구·이미지·버전을 보존한다', async () => {
    await prepare();
    const input = selection({ title: '남산 곤돌라 판결에서 취소된 것은 무엇일까?' });
    await service.selectEditorial(input);
    const reopened = createHomefeedStore(dir).readAssets(current().issueKey);
    expect(reopened.editorialSelection).toMatchObject({ revision: 1, title: input.title, card: input.card, imageId: 'source-one' });
    await expect(service.selectEditorial(input)).rejects.toMatchObject({ status: 409 });
  });

  it('다른 소재의 관점·이미지 또는 잘못된 입력은 IPC 직접 호출에서도 거절한다', async () => {
    await prepare();
    await expect(service.selectEditorial(selection({ angleId: 'not-mine' }))).rejects.toMatchObject({ status: 400 });
    await expect(service.selectEditorial(selection({ imageId: 'not-mine' }))).rejects.toMatchObject({ status: 400 });
    await expect(service.selectEditorial(selection({ card: { line1: '', line2: '' } }))).rejects.toMatchObject({ status: 400 });
  });

  it('근거가 바뀌면 작성안과 선택은 남기되 원고 생성을 차단한다', async () => {
    await prepare();
    await service.selectEditorial(selection());
    const selected = assets().editorialSelection!;
    const file = store.readStories();
    store.writeStories({ ...file, stories: file.stories.map((row) => ({ ...row, evidenceHash: 'changed' })) });
    expect((await service.story({ id: current().id }) as any).editorial.state).toBe('stale');
    await expect(service.draft({ id: current().id, briefRevision: selected.briefRevision, selectionRevision: 1 })).rejects.toMatchObject({ status: 409 });
    expect(assets().editorialSelection?.revision).toBe(1);
  });

  it('원고는 저장한 제목·관점·카드·이미지를 입력으로 받아 별도 검토한다', async () => {
    await prepare();
    await service.selectEditorial(selection());
    const saved = assets().editorialSelection!;
    replies.push(`${saved.title}\n\n${editorialContent().summary}\n\n출처: 연합뉴스 ${source().url}\n[이미지: source-one]`, JSON.stringify({ passed: true, issues: [] }));
    const result: any = await service.draft({ id: current().id, briefRevision: saved.briefRevision, selectionRevision: saved.revision });
    expect(result.draft).toMatchObject({ briefRevision: saved.briefRevision, selectionRevision: 1, problems: [], review: { passed: true } });
    expect(runAgent.mock.calls[2][0]).toContain(saved.card.line2);
    expect(runAgent.mock.calls[2][0]).toContain('source-one');
  });

  it('빈 JSON 재시도가 실패해도 이전 작성안은 보존한다', async () => {
    await prepare();
    const previous = assets().editorial?.revision;
    replies.push('bad', 'bad');
    await expect(service.brief({ id: current().id, force: true })).rejects.toMatchObject({ status: 422 });
    expect(assets().editorial?.revision).toBe(previous);
    expect(assets().editorialFailure?.message).toContain('읽지 못했습니다');
  });

  it('같은 근거에서 재생성 검토가 실패해도 정상 작성안과 선택을 유지한다', async () => {
    await prepare();
    await service.selectEditorial(selection());
    const revision = assets().editorial!.revision;
    replies.push(JSON.stringify(editorialContent()), JSON.stringify({ passed: false, issues: ['근거를 확대 해석했습니다.'] }));
    const result: any = await service.brief({ id: current().id, force: true });
    expect(result.editorial.state).toBe('ready');
    expect(result.editorial.brief.revision).toBe(revision);
    expect(result.editorial.error).toContain('이전 작성안을 유지');
    expect(assets().editorialHistory).toHaveLength(2);
  });

  it('생성 중 수집이 갱신되면 옛 근거 결과를 최신 준비 완료로 표시하지 않는다', async () => {
    let release!: (value: any) => void;
    runAgent.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const generated = service.brief({ id: current().id });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const file = store.readStories();
    store.writeStories({ ...file, stories: file.stories.map((row) => ({ ...row, evidenceHash: 'new-revision' })) });
    replies.push(JSON.stringify({ passed: true, issues: [] }));
    release({ reply: JSON.stringify(editorialContent()), provider: 'test' });
    expect((await generated as any).editorial.state).toBe('stale');
    expect(assets().editorialHistory).toHaveLength(1);
  });

  it('기존 v1 원고와 이미지를 추가 필드 기본값으로 보존한다', () => {
    const old = assets();
    delete old.editorial;
    delete old.editorialSelection;
    old.drafts = [{ id: 'legacy', text: '기존 원고', createdAt: at(0), provider: 'old', titleId: null, problems: [], retried: false, evidenceHash: 'old' }];
    store.writeAssets(old);
    expect(createHomefeedStore(dir).readAssets(current().issueKey)).toMatchObject({ editorial: null, drafts: [{ id: 'legacy', text: '기존 원고' }] });
  });

  it('공개 상세는 개인 작성안·선택·원고를 빼고 출처를 제공한다', async () => {
    await prepare();
    await service.selectEditorial(selection());
    let detail = publicStoryDetail(current(), assets());
    expect(detail.editorial.brief).toBeNull();
    expect(detail.editorial.selection).toBeNull();
    expect(detail.story.evidence[0].url).toBe(source().url);
    await service.shareEditorial({ id: current().id, briefRevision: assets().editorial!.revision, share: true });
    detail = publicStoryDetail(current(), assets());
    expect(detail.editorial.brief?.summary).toBe(editorialContent().summary);
    expect(detail.editorial.brief?.sources[0].text).toBe('');
    expect(storySummary(current(), assets(), true).editorial.brief?.sources[0].text).toBe('');
    const payload = buildHomefeedPublicPayload({ stories: [{ id: current().id }], publicDetails: { [current().id]: { ...detail, assets: { drafts: ['PRIVATE-DRAFT'] } } } }, null, { nowMs: Date.now() });
    expect(JSON.stringify(payload)).not.toContain('PRIVATE-DRAFT');
    expect((payload!.publicDetails[current().id] as any).readOnly).toBe(true);
    await service.shareEditorial({ id: current().id, briefRevision: '', share: false });
    expect(publicStoryDetail(current(), assets()).editorial.brief).toBeNull();
  });
});
