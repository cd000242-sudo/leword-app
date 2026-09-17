/** 요청으로만 실행하는 작성안 생성. 화면 조회·수집 주기에는 AI 호출이 없다. */
import type { HomefeedStory } from '../../utils/homefeed/types';
import { EDITORIAL_VERSION, type EditorialBrief, type EditorialBriefInput, type EditorialSelectInput } from '../../utils/homefeed/editorial-types';
import { buildEditorialPrompt, buildEditorialReviewPrompt, parseEditorialContent, parseEditorialReview, sourceRevision, sourcesFromStory, validateEditorialContent } from '../../utils/homefeed/editorial';
import { shortHash } from '../../utils/homefeed/text';
import type { HomefeedServiceDeps } from './service';
import { HomefeedRequestError } from './bridge-routes';
import { editorialView, validateEditorialSelection } from './editorial-state';

export type FindEditorialStory = (id: string) => { story: HomefeedStory; superseded: boolean };
const pending = new Map<string, Promise<unknown>>();

export function createEditorialActions(deps: HomefeedServiceDeps, findStory: FindEditorialStory) {
  const now = () => new Date(deps.now()).toISOString();

  async function generate(input: EditorialBriefInput) {
    const { story, superseded } = findStory(input.id);
    if (superseded || input.evidenceRevision && input.evidenceRevision !== story.evidenceHash) throw new HomefeedRequestError(409, '근거가 바뀌었습니다. 목록을 새로고침해 주세요.');
    if (!deps.store.readSettings().ai.storyReview) throw new HomefeedRequestError(409, '설정에서 작성안 AI 보강을 켜 주세요.');
    if (!story.evidence.length) throw new HomefeedRequestError(409, '확인할 기사가 없습니다. 먼저 소재를 수집해 주세요.');
    const provider = ['claude', 'codex', 'gemini', 'grok'].includes(input.provider || '') ? input.provider! : '';
    const initial = sourcesFromStory(story);
    const sources = deps.enrichSources ? await deps.enrichSources(initial) : initial;
    const revision = sourceRevision(sources);
    const previous = deps.store.readAssets(story.issueKey).editorial;
    if (!input.force && previous && previous.version === EDITORIAL_VERSION && previous.evidenceRevision === story.evidenceHash && previous.sourceRevision === revision) {
      return { editorial: editorialView(story, deps.store.readAssets(story.issueKey)), cached: true, storyId: story.id };
    }
    let run = await deps.runAgent(buildEditorialPrompt(story, sources), { provider, timeoutMs: 180_000 });
    let parsed = parseEditorialContent(run.reply, sources);
    if (!parsed.content || parsed.problems.length > 0) {
      // JSON이 읽혀도 날짜·인용·필수 근거 오류는 한 번 수정한다. 재시도는 전체 요청당 한 번뿐이다.
      try {
        const retry = await deps.runAgent(buildEditorialPrompt(story, sources, parsed.problems), { provider: run.provider, timeoutMs: 180_000 });
        const checked = parseEditorialContent(retry.reply, sources);
        if (!parsed.content || checked.content && checked.problems.length <= parsed.problems.length) {
          run = retry;
          parsed = checked;
        }
      } catch (error) {
        if (!parsed.content) throw error;
        parsed.problems.push(`작성안 수정 요청 실패: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`);
      }
    }
    if (!parsed.content) throw new HomefeedRequestError(422, `작성안을 읽지 못했습니다: ${parsed.problems.slice(0, 3).join(' · ')}`);
    const content = parsed.content;
    const problems = [...new Set([...parsed.problems, ...validateEditorialContent(content, sources)])];
    let review = { passed: false, issues: ['근거 검토가 완료되지 않았습니다.'] };
    if (problems.length === 0) {
      try {
        const checked = await deps.runAgent(buildEditorialReviewPrompt(content, sources), { provider: run.provider, timeoutMs: 120_000 });
        review = parseEditorialReview(checked.reply);
      } catch (error) {
        review = { passed: false, issues: [`근거 검토 실패: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`] };
      }
    }
    const brief: EditorialBrief = {
      ...content, id: `brief-${deps.newId()}`, version: EDITORIAL_VERSION,
      revision: shortHash({ version: EDITORIAL_VERSION, content, sources: revision, review }, 24),
      evidenceRevision: story.evidenceHash, sourceRevision: revision, sources, createdAt: now(), provider: run.provider,
      readiness: problems.length === 0 && review.passed && content.unresolved.length === 0 ? 'ready' : 'needs_evidence', problems, review,
    };
    const fresh = deps.store.readAssets(story.issueKey);
    const current = deps.store.readStories().stories.find((row) => row.issueKey === story.issueKey) ?? story;
    const history = [brief, ...(fresh.editorial ? [fresh.editorial] : []), ...(fresh.editorialHistory ?? [])]
      .filter((item, index, all) => all.findIndex((row) => row.revision === item.revision) === index).slice(0, 5);
    // 생성 도중 수집 결과가 바뀐 경우 최신 생성물을 밀어내지 않는다.
    const keepReady = brief.readiness !== 'ready' && fresh.editorial?.readiness === 'ready'
      && fresh.editorial.evidenceRevision === story.evidenceHash && fresh.editorial.sourceRevision === revision;
    const replace = !keepReady && (current.evidenceHash === story.evidenceHash || !fresh.editorial || fresh.editorial.evidenceRevision !== current.evidenceHash);
    deps.store.writeAssets({ ...fresh, updatedAt: now(), editorial: replace ? brief : fresh.editorial, editorialHistory: history,
      editorialFailure: keepReady ? { at: now(), evidenceRevision: story.evidenceHash, message: `재작성 검토를 통과하지 못해 이전 작성안을 유지했습니다: ${[...problems, ...review.issues].slice(0, 3).join(' · ')}` } : null });
    return { editorial: editorialView(current, deps.store.readAssets(story.issueKey)), cached: false, storyId: current.id };
  }

  return {
    brief(input: EditorialBriefInput): Promise<unknown> {
      const { story } = findStory(input.id);
      if (input.evidenceRevision && input.evidenceRevision !== story.evidenceHash) return Promise.reject(new HomefeedRequestError(409, '근거가 바뀌었습니다. 목록을 새로고침해 주세요.'));
      const key = `${deps.store.dir}:${story.issueKey}:${story.evidenceHash}`;
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = generate(input).catch((error) => {
        const assets = deps.store.readAssets(story.issueKey);
        deps.store.writeAssets({ ...assets, updatedAt: now(), editorialFailure: {
          at: now(), evidenceRevision: story.evidenceHash, message: String(error instanceof Error ? error.message : error).slice(0, 300),
        } });
        throw error;
      }).finally(() => { pending.delete(key); });
      pending.set(key, promise);
      return promise;
    },

    async selectEditorial(input: EditorialSelectInput) {
      const { story } = findStory(input.id);
      const assets = deps.store.readAssets(story.issueKey);
      const selection = validateEditorialSelection(story, assets, input, now());
      deps.store.writeAssets({ ...assets, updatedAt: now(), editorialSelection: selection });
      return { selection, editorial: editorialView(story, deps.store.readAssets(story.issueKey)), storyId: story.id };
    },
  };
}
