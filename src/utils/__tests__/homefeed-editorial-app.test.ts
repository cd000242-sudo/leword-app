import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it, vi } from 'vitest';

const html = fs.readFileSync(path.join(__dirname, '../../../ui/keyword-master.html'), 'utf8');
const source = html.split('/* HOMEFEED_EDITORIAL_START */')[1]?.split('/* HOMEFEED_EDITORIAL_END */')[0] || 'throw new Error("editorial UI missing")';

function harness(api: Record<string, any>) {
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', disabled: false, hidden: false, style: {}, addEventListener: vi.fn(), scrollIntoView: vi.fn(), focus: vi.fn(), querySelectorAll: () => [] });
    return elements.get(id);
  };
  const window: any = { electronAPI: api };
  const context = vm.createContext({ window, document: { getElementById: element }, URL, Set, console });
  new vm.Script(source).runInContext(context);
  return { window, element };
}

const angle = { id: 'angle-1', label: '시설 개장에 미칠 영향', readerQuestion: '판결로 무엇이 달라지나?', difference: '판결 이유와 다음 절차를 구분', sectionIds: ['section-1'], suggestedTitle: '남산 곤돌라 판결, 개장 일정에 어떤 영향을 주나', firstCard: { line1: '남산 곤돌라 2심 패소', line2: '달라질 절차는 무엇인가' } };
function editorial(state = 'ready'): any {
  return { state, evidenceRevision: 'ev-1', summary: '남산 곤돌라 사업이 항소심에서 패소했다.', sourceTitle: '남산 곤돌라 2심 패소', sourceUrl: 'https://news.example/a', error: null,
    brief: { revision: 'brief-1', evidenceRevision: 'ev-1', summary: '남산 곤돌라 사업이 항소심에서 패소했다.', whyNow: '항소심 판결이 보도됐다.', audience: '시설 개장에 관심 있는 시민', recommendedAngleId: 'angle-1', angles: [angle], sections: [{ id: 'section-1', question: '판결 이유는?', answer: '절차 적법성이 쟁점이다.', factIds: ['fact-1'] }], facts: [{ id: 'fact-1', text: '항소심에서도 사업자가 패소했다.', supports: [{ sourceId: 'source-1', excerpt: '항소심 패소' }] }], sources: [{ id: 'source-1', title: '남산 곤돌라 2심 패소', url: 'https://news.example/a', level: 'description', text: '항소심 패소', imageUrl: 'https://news.example/image.jpg' }], unresolved: [], problems: [], review: { passed: true, issues: [] } },
    selection: { revision: 2, briefRevision: 'brief-1', evidenceRevision: 'ev-1', angleId: 'angle-1', title: '저장된 제목', card: { line1: '저장된 첫 줄', line2: '저장된 둘째 줄' }, imageId: 'source-1' } };
}
const story = (id: string, url: string, status = 'NOW', e: any = null): any => ({ id, keyword: id, status: { state: status }, evidence: [{ title: '출처가 있는 사건 기사', url }], firstCard: { headline1: '남산 명동' }, editorial: e || { state: 'unprepared', sourceTitle: '출처가 있는 사건 기사', sourceUrl: url, evidenceRevision: id, brief: null, selection: null } });
const ok = (result: any) => ({ success: true, result });

describe('홈판 작성안 앱 동작', () => {
  it('구버전 단어조각은 추천 카드로 노출하지 않고 출처와 준비 전 상태를 보인다', async () => {
    const old = story('남산', 'https://news.example/a'); delete old.editorial;
    const api = { homefeedStories: vi.fn(async () => ok({ stories: [old] })), homefeedBrief: vi.fn() };
    const h = harness(api); await h.window.loadHomefeedBoard();
    expect(h.element('homefeedBody').innerHTML).toContain('작성안 준비 전');
    expect(h.element('homefeedBody').innerHTML).toContain('출처가 있는 사건 기사');
    expect(h.element('homefeedBody').innerHTML).not.toContain('남산 명동');
    expect(api.homefeedBrief).not.toHaveBeenCalled();
  });

  it('후보 생성은 최대 3건이며 같은 기사 중복과 제외 후보를 건너뛰고 순차 실행한다', async () => {
    const stories = [story('a', 'https://news.example/1'), story('duplicate', 'https://news.example/1'), story('drop', 'https://news.example/2', 'DROP'), story('b', 'https://news.example/3'), story('c', 'https://news.example/4'), story('d', 'https://news.example/5')];
    let running = 0; let maxRunning = 0;
    const api = { homefeedStories: vi.fn(async () => ok({ stories })), homefeedBrief: vi.fn(async (input) => { running++; maxRunning = Math.max(maxRunning, running); await Promise.resolve(); running--; return ok({ editorial: editorial(), storyId: input.id }); }) };
    const h = harness(api); await h.window.loadHomefeedBoard(); await h.window.homefeedBatchBriefs();
    expect(api.homefeedBrief.mock.calls.map(([input]) => input.id)).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
  });

  it('재열람은 선택 문구·이미지를 복원하며, 수정본 저장이 성공한 다음 그 버전으로 원고를 요청한다', async () => {
    const e = editorial(); const calls: string[] = [];
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: {} })), homefeedSelectEditorial: vi.fn(async (input) => { calls.push('save'); return ok({ editorial: { ...e, selection: { ...input, revision: 3 } }, selection: { ...input, revision: 3 } }); }), homefeedDraft: vi.fn(async () => { calls.push('draft'); return ok({ draft: { text: '완성 원고' } }); }) };
    const h = harness(api); await h.window.homefeedOpenStory('a');
    expect(h.element('homefeedDetail').innerHTML).toContain('저장된 제목');
    expect(h.element('homefeedDetail').innerHTML).toContain('저장된 첫 줄');
    for (const [id, value] of Object.entries({ homefeedAngle: 'angle-1', homefeedTitle: '수정한 제목', homefeedCard1: '수정한 첫 줄', homefeedCard2: '수정한 둘째 줄', homefeedImage: 'source-1' })) h.element(id).value = value;
    await h.window.homefeedGenerateDraft();
    expect(calls).toEqual(['save', 'draft']);
    expect(api.homefeedSelectEditorial).toHaveBeenCalledWith(expect.objectContaining({ title: '수정한 제목', card: { line1: '수정한 첫 줄', line2: '수정한 둘째 줄' }, expectedRevision: 2, imageId: 'source-1' }));
    expect(api.homefeedDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', briefRevision: 'brief-1', selectionRevision: 3 }));
    expect(h.element('homefeedDraftOutput').textContent).toContain('완성 원고');
  });

  it.each(['stale', 'needs_evidence', 'failed', 'unprepared'])('%s 작성안에서는 원고를 만들지 않는다', async (state) => {
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', 'https://news.example/a'), editorial: editorial(state), assets: {} })), homefeedSelectEditorial: vi.fn(), homefeedDraft: vi.fn() };
    const h = harness(api); await h.window.homefeedOpenStory('a'); await h.window.homefeedGenerateDraft();
    expect(api.homefeedSelectEditorial).not.toHaveBeenCalled(); expect(api.homefeedDraft).not.toHaveBeenCalled();
  });

  it('선택 저장 실패 시 원고 생성 요청을 보내지 않는다', async () => {
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', 'https://news.example/a'), editorial: editorial(), assets: {} })), homefeedSelectEditorial: vi.fn(async () => ({ success: false, error: '다른 화면에서 선택이 변경되었습니다' })), homefeedDraft: vi.fn() };
    const h = harness(api); await h.window.homefeedOpenStory('a');
    for (const [id, value] of Object.entries({ homefeedAngle: 'angle-1', homefeedTitle: '제목', homefeedCard1: '첫 줄', homefeedCard2: '둘째 줄', homefeedImage: '' })) h.element(id).value = value;
    await h.window.homefeedGenerateDraft();
    expect(api.homefeedDraft).not.toHaveBeenCalled(); expect(h.element('homefeedDetailStatus').textContent).toContain('다른 화면');
  });

  it('기사 문구를 탈출하며 실행 가능한 URL을 링크나 이미지에 넣지 않는다', async () => {
    const e = editorial(); e.summary = '<img src=x onerror=alert(1)>'; e.sourceUrl = 'javascript:alert(1)'; e.brief.sources[0].url = 'javascript:alert(1)'; e.brief.sources[0].imageUrl = 'data:text/html,evil';
    const api = { homefeedStories: vi.fn(async () => ok({ stories: [story('a', '', 'NOW', e)] })), homefeedStory: vi.fn(async () => ok({ story: story('a', ''), editorial: e, assets: {} })) };
    const h = harness(api); await h.window.loadHomefeedBoard(); await h.window.homefeedOpenStory('a');
    expect(h.element('homefeedBody').innerHTML).toContain('&lt;img');
    expect(h.element('homefeedDetail').innerHTML).not.toContain('href="javascript:');
    expect(h.element('homefeedDetail').innerHTML).not.toContain('src="data:');
  });

  it('개인 작성안은 자동 공개하지 않고 명시적 동작으로만 공개 파일 포함을 요청한다', async () => {
    const e = editorial();
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: {} })), homefeedShareEditorial: vi.fn(async (input) => ok({ editorial: { ...e, shared: input.share }, shared: input.share, publishResult: { written: 'C:/site/public/data/homefeed-stories.json', reason: null } })) };
    const h = harness(api); await h.window.homefeedOpenStory('a');
    expect(api.homefeedShareEditorial).not.toHaveBeenCalled();
    await h.window.homefeedShareEditorial();
    expect(api.homefeedShareEditorial).toHaveBeenCalledWith({ id: 'a', briefRevision: 'brief-1', share: true });
    expect(h.element('homefeedDetailStatus').textContent).toContain('배포 후');
    await h.window.homefeedShareEditorial();
    expect(api.homefeedShareEditorial).toHaveBeenLastCalledWith({ id: 'a', briefRevision: 'brief-1', share: false });
  });

  it('근거가 변경된 작성안은 신규 공유를 차단하지만 이전 공개 지정은 해제할 수 있다', async () => {
    const e = { ...editorial('stale'), shared: true };
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: {} })), homefeedShareEditorial: vi.fn(async () => ok({ editorial: { ...e, shared: false }, shared: false, publishResult: { written: 'C:/site/public/data/homefeed-stories.json', reason: null } })) };
    const h = harness(api); await h.window.homefeedOpenStory('a'); await h.window.homefeedShareEditorial(); await h.window.homefeedShareEditorial();
    expect(api.homefeedShareEditorial).toHaveBeenCalledTimes(1);
    expect(api.homefeedShareEditorial).toHaveBeenCalledWith({ id: 'a', briefRevision: 'brief-1', share: false });
  });

  it('다른 화면의 선택 변경 뒤 목록을 새로고침하면 최신 선택 버전으로 저장한다', async () => {
    let current = editorial();
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', current.sourceUrl), editorial: current, assets: {} })), homefeedStories: vi.fn(async () => ok({ stories: [story('a', current.sourceUrl, 'NOW', current)] })), homefeedSelectEditorial: vi.fn(async (input) => ok({ editorial: { ...current, selection: { ...input, revision: 4 } }, selection: { ...input, revision: 4 } })) };
    const h = harness(api); await h.window.loadHomefeedBoard(); await h.window.homefeedOpenStory('a');
    current = { ...current, selection: { ...current.selection, revision: 3, title: '다른 화면에서 저장한 제목' } };
    await h.window.loadHomefeedBoard();
    expect(h.element('homefeedDetail').innerHTML).toContain('다른 화면에서 저장한 제목');
    for (const [id, value] of Object.entries({ homefeedAngle: 'angle-1', homefeedTitle: current.selection.title, homefeedCard1: '첫 줄', homefeedCard2: '둘째 줄', homefeedImage: '' })) h.element(id).value = value;
    await h.window.homefeedSaveEditorial();
    expect(api.homefeedSelectEditorial).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 3 }));
  });

  it('제목·카드를 새로 저장하면 이전 원고를 최신 선택 원고라고 표시하지 않는다', async () => {
    const e = editorial();
    const api = { homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: { drafts: [{ id: 'draft-1', text: '이전 제목의 원고', briefRevision: 'brief-1', selectionRevision: 2, problems: [] }] } })), homefeedSelectEditorial: vi.fn(async (input) => ok({ editorial: { ...e, selection: { ...input, revision: 3 } }, selection: { ...input, revision: 3 } })) };
    const h = harness(api); await h.window.homefeedOpenStory('a');
    expect(h.element('homefeedDraftStatus').textContent).toContain('현재 선택');
    for (const [id, value] of Object.entries({ homefeedAngle: 'angle-1', homefeedTitle: '변경한 제목', homefeedCard1: '변경한 첫 줄', homefeedCard2: '둘째 줄', homefeedImage: '' })) h.element(id).value = value;
    await h.window.homefeedSaveEditorial();
    expect(h.element('homefeedDraftStatus').textContent).toContain('이전 작성안 또는 선택');
    expect(h.element('homefeedDraftOutput').textContent).toBe('이전 제목의 원고');
  });

  it('의미 검토만 실패한 작성안도 구체적인 확인 사유를 보여준다', async () => {
    const e = editorial('needs_evidence'); e.brief.review = { passed: false, issues: ['인용한 발언의 화자가 기사와 다릅니다.'] };
    const h = harness({ homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: {} })) });
    await h.window.homefeedOpenStory('a');
    expect(h.element('homefeedDetail').innerHTML).toContain('인용한 발언의 화자가 기사와 다릅니다.');
  });

  it('공개 파일을 저장하지 못한 경우 배포 준비 성공으로 안내하지 않는다', async () => {
    const e = editorial();
    const h = harness({ homefeedStory: vi.fn(async () => ok({ story: story('a', e.sourceUrl), editorial: e, assets: {} })), homefeedShareEditorial: vi.fn(async () => ok({ editorial: { ...e, shared: true }, shared: true, publishResult: { written: null, reason: '사이트 폴더가 설정되지 않았습니다.' } })) });
    await h.window.homefeedOpenStory('a'); await h.window.homefeedShareEditorial();
    expect(h.element('homefeedDetailStatus').textContent).toContain('사이트 폴더가 설정되지 않았습니다.');
    expect(h.element('homefeedDetailStatus').textContent).not.toContain('공개 파일에 작성안을 포함했습니다.');
  });
});
