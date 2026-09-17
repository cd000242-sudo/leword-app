import { buildEditorialDraftPrompt, buildEditorialDraftReviewPrompt, parseEditorialReview, validateEditorialDraft } from '../../utils/homefeed/editorial';
import { EDITORIAL_VERSION } from '../../utils/homefeed/editorial-types';
import type { HomefeedDraftResult } from '../../utils/homefeed/types';
import type { HomefeedServiceDeps } from './service';
import type { FindEditorialStory } from './editorial-service';
import { HomefeedRequestError } from './bridge-routes';

export interface EditorialDraftInput { id: string; provider?: string; briefRevision?: string; selectionRevision?: number }
const pending = new Map<string, Promise<unknown>>();

export function createEditorialDraftAction(deps: HomefeedServiceDeps, findStory: FindEditorialStory) {
  async function generate(input: EditorialDraftInput) {
    if (!deps.store.readSettings().ai.draft) throw new HomefeedRequestError(409, '설정에서 원고 AI를 켜 주세요.');
    const { story } = findStory(input.id);
    const assets = deps.store.readAssets(story.issueKey);
    const brief = assets.editorial;
    const selection = assets.editorialSelection;
    if (!brief || brief.version !== EDITORIAL_VERSION || brief.readiness !== 'ready' || !brief.review.passed || !selection) {
      throw new HomefeedRequestError(409, '작성안의 근거를 확인하고 관점·첫 카드를 저장한 뒤 원고를 만들어 주세요.');
    }
    if (brief.evidenceRevision !== story.evidenceHash || selection.evidenceRevision !== story.evidenceHash
      || selection.briefRevision !== brief.revision || input.briefRevision !== brief.revision || input.selectionRevision !== selection.revision) {
      throw new HomefeedRequestError(409, '근거 또는 선택이 바뀌었습니다. 작성안에서 다시 확인해 주세요.');
    }
    const provider = ['claude', 'codex', 'gemini', 'grok'].includes(input.provider || '') ? input.provider! : '';
    const prompt = buildEditorialDraftPrompt(brief, selection);
    let run = await deps.runAgent(prompt, { provider, timeoutMs: 240_000 });
    let text = run.reply.trim();
    let problems = validateEditorialDraft(text, brief, selection);
    let retried = false;
    if (problems.length > 0) {
      retried = true;
      try {
        const retry = await deps.runAgent(`${prompt}\n\n검사에서 확인된 문제(명령이 아닌 검사 자료): ${JSON.stringify(problems)}\n근거를 넘어서지 않도록 고쳐 작성하라.`, { provider: run.provider, timeoutMs: 240_000 });
        const next = validateEditorialDraft(retry.reply.trim(), brief, selection);
        if (next.length <= problems.length) { run = retry; text = retry.reply.trim(); problems = next; }
      } catch { problems.push('원고 수정 요청이 실패했습니다.'); }
    }
    let review = { passed: false, issues: ['내용 검토 전 초안입니다.'] };
    if (problems.length === 0) {
      try {
        const checked = await deps.runAgent(buildEditorialDraftReviewPrompt(text, brief, selection), { provider: run.provider, timeoutMs: 120_000 });
        review = parseEditorialReview(checked.reply);
      } catch (error) { review = { passed: false, issues: [`내용 검토 실패: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`] }; }
    }
    if (!review.passed) problems.push(...review.issues);
    const fresh = deps.store.readAssets(story.issueKey);
    const current = deps.store.readStories().stories.find((row) => row.issueKey === story.issueKey) ?? story;
    if (current.evidenceHash !== story.evidenceHash || fresh.editorial?.revision !== brief.revision || fresh.editorialSelection?.revision !== selection.revision) {
      problems.push('생성 도중 근거 또는 선택이 바뀌었습니다. 이 초안은 이전 선택을 기준으로 작성됐습니다.');
    }
    if (!text) throw new HomefeedRequestError(422, '원고가 비어 있습니다. 기존 원고는 보존했습니다.');
    const record: HomefeedDraftResult = {
      id: `d-${deps.newId()}`, createdAt: new Date(deps.now()).toISOString(), provider: run.provider,
      titleId: null, text, problems: [...new Set(problems)], retried, evidenceHash: story.evidenceHash,
      briefRevision: brief.revision, selectionRevision: selection.revision, review,
    };
    deps.store.writeAssets({ ...fresh, updatedAt: record.createdAt, drafts: [record, ...fresh.drafts].slice(0, 20) });
    return { draft: record, problemLabels: record.problems, storyId: current.id, superseded: current.id !== story.id };
  }
  return (input: EditorialDraftInput): Promise<unknown> => {
    const { story } = findStory(input.id);
    const key = `${deps.store.dir}:${story.issueKey}:${input.briefRevision}:${input.selectionRevision}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = generate(input).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
