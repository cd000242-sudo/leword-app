/**
 * 홈판 신호 서비스 — 브리지 경로가 부르는 흐름(목록 · 상세 · 수집 · AI 보강 · 제목 · 이미지 · 원고 · 발행 · 성과 · 설정).
 *
 * AI 는 사용자가 누른 요청에서만 돈다(구독 에이전트 체인). 결과는 근거 해시로 캐시해 같은 근거면 다시 부르지 않는다.
 * 목록 · 상세는 저장된 계산본만 읽는다. electron 에 기대지 않는다 — 저장소 · 실행기 · 시계를 주입받는다.
 */
import { AgentCliError } from '../../utils/agent-cli/types';
import { latestEntry, summarizeCalibration } from '../../utils/homefeed/calibration';
import { applyPromptRefine, buildPromptRefinePrompt, buildStoryReviewPrompt, parseStoryReview } from '../../utils/homefeed/ai-materials';
import { buildDraftPrompt, draftMaterialsOf, DRAFT_PROBLEM_LABEL, validateDraft } from '../../utils/homefeed/draft';
import { normalizeHomefeedSettings } from '../../utils/homefeed/settings';
import {
  buildTitlePrompt, buildTitleVisualPairs, classifyTitle, parseTitleCandidates, pickTopStops, titleCheckContextOf, titleMaterialsOf,
} from '../../utils/homefeed/titles';
import {
  HOMEFEED_CHECKPOINTS,
  type HomefeedAspectRatio,
  type HomefeedAssets,
  type HomefeedImageRecord,
  type HomefeedPost,
  type HomefeedStory,
} from '../../utils/homefeed/types';
import { AI_IMAGE_LABEL } from '../../utils/homefeed/visual';
import { HomefeedRequestError, type HomefeedBridgeDeps } from './bridge-routes';
import type { HomefeedStore } from './store';

export interface HomefeedServiceDeps {
  store: HomefeedStore;
  runtime(): { running: boolean; lastRunAt: string | null; lastError: string | null; lastDurationMs: number | null; nextRunAt: string | null };
  runCycle(): Promise<unknown>;
  applySchedule(): void;
  runAgent(prompt: string, options: { provider: string; timeoutMs: number; validate?: (reply: string) => void }): Promise<{ reply: string; provider: string }>;
  generateImage(input: { description: string; aspectRatio: string }): Promise<{ data: Buffer; mime: string; width: number | null; height: number | null }>;
  now(): number;
  newId(): string;
}

const HISTORY_MS = 7 * 3_600_000;
const MIN_DRAFT_CHARS = 300;

function tally(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
}

export function storySummary(story: HomefeedStory, assets: HomefeedAssets) {
  return {
    id: story.id,
    issueKey: story.issueKey,
    keyword: story.keyword,
    category: story.category,
    capturedAt: story.capturedAt,
    window: story.window,
    status: story.status,
    anchor: story.anchor,
    delta: story.delta,
    deltaReason: story.deltaReason,
    signals: story.signals,
    tensions: story.tensions.map(({ type, matched }) => ({ type, matched })),
    funGap: story.funGap.map(({ flag, note }) => ({ flag, note })),
    alternativeAngles: story.alternativeAngles.map((angle) => angle.label),
    payoffCount: story.payoffLayers.length,
    noSearchPassed: story.noSearch.passed,
    tellable: story.tellability.passed ? story.tellability.sentence : null,
    firstCard: { headline1: story.firstCard.headline1, headline2: story.firstCard.headline2, hook: story.firstCard.hook, possible: story.firstCard.possible },
    visualStrategy: story.visual.strategy,
    thumbnail: {
      type: story.thumbnail.type,
      readiness: story.thumbnail.readiness,
      heroImageUrl: story.thumbnail.heroImage.kind === 'real' ? story.thumbnail.heroImage.imageUrl : null,
    },
    risks: story.risks,
    progress: { titles: Boolean(assets.titles), selected: Boolean(assets.selection), drafts: assets.drafts.length, images: assets.images.length },
  };
}

export function createHomefeedService(deps: HomefeedServiceDeps): HomefeedBridgeDeps {
  const iso = () => new Date(deps.now()).toISOString();

  const findStory = (id: string): { story: HomefeedStory; superseded: boolean } => {
    const file = deps.store.readStories();
    const exact = file.stories.find((story) => story.id === id);
    if (exact) return { story: exact, superseded: false };
    const issueKey = id.split(':')[0];
    const same = file.stories.find((story) => story.issueKey === issueKey);
    if (same) return { story: same, superseded: true };
    throw new HomefeedRequestError(410, '이 스토리는 최신 계산본에 없습니다 — 목록을 새로고침해 주세요.');
  };

  const currentPrompts = (story: HomefeedStory, assets: HomefeedAssets) => (
    assets.visual && assets.visual.evidenceHash === story.evidenceHash ? assets.visual.prompts : story.aiPrompts
  );

  return {
    async stories() {
      const settings = deps.store.readSettings();
      const file = deps.store.readStories();
      return {
        settings: { enabled: settings.enabled, snapshotIntervalMinutes: settings.snapshotIntervalMinutes, imageProvider: settings.imageProvider, ai: settings.ai },
        runtime: deps.runtime(),
        computedAt: file.computedAt,
        snapshotAt: file.snapshotAt,
        historySnapshots: file.snapshotCount,
        storedSnapshots: deps.store.countSnapshots(),
        sources: Object.values(deps.store.readSources().sources),
        counts: {
          status: tally(file.stories.map((story) => story.status.state)),
          window: tally(file.stories.map((story) => story.window.state)),
        },
        stories: file.stories.map((story) => storySummary(story, deps.store.readAssets(story.issueKey))),
      };
    },

    async story({ id }) {
      const { story, superseded } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      const latestAt = deps.store.latestSnapshotAt();
      const history = latestAt ? deps.store.listSnapshots(Date.parse(latestAt) - HISTORY_MS) : [];
      const timeline = history.map((snapshot) => {
        const issue = snapshot.issues.find((row) => row.issueKey === story.issueKey) ?? null;
        return {
          capturedAt: snapshot.capturedAt,
          present: Boolean(issue),
          rank: issue ? issue.ranks['signal.bz'] ?? null : null,
          sourceCount: issue ? Object.values(issue.ranks).filter((value) => typeof value === 'number').length : null,
          newsTotal: issue ? issue.newsTotal : null,
          blogDocCount: issue ? issue.blogDocCount : null,
          sampleN: issue ? issue.samples.length : null,
        };
      });
      const fresh = (hash: string | undefined) => hash === story.evidenceHash;
      return {
        story,
        superseded,
        timeline,
        assets: {
          review: assets.review ? { ...assets.review, stale: !fresh(assets.review.evidenceHash) } : null,
          titles: assets.titles ? { ...assets.titles, stale: !fresh(assets.titles.evidenceHash) } : null,
          prompts: currentPrompts(story, assets),
          promptsRefinedBy: assets.visual && fresh(assets.visual.evidenceHash) ? assets.visual.refinedBy : null,
          selection: assets.selection,
          drafts: assets.drafts,
          images: assets.images,
        },
      };
    },

    async collect() {
      return deps.runCycle();
    },

    async review({ id, provider, force }) {
      if (!deps.store.readSettings().ai.storyReview) throw new HomefeedRequestError(409, '관리자 설정에서 스토리 AI 보강이 꺼져 있습니다.');
      const { story, superseded } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      if (!force && assets.review && assets.review.evidenceHash === story.evidenceHash) return { review: assets.review, cached: true, storyId: story.id, superseded };
      if (story.evidence.length === 0) throw new HomefeedRequestError(409, '근거 기사가 없어 AI 보강을 하지 않습니다.');
      const run = await deps.runAgent(buildStoryReviewPrompt(story), {
        provider,
        timeoutMs: 120_000,
        validate: (reply) => { if (!parseStoryReview(reply, story.evidence.length)) throw new Error('검토 결과를 읽지 못했습니다'); },
      });
      const parsed = parseStoryReview(run.reply, story.evidence.length) ?? { tensions: [], funGap: [], risks: [] };
      const review = { provider: run.provider, createdAt: iso(), evidenceHash: story.evidenceHash, ...parsed };
      deps.store.writeAssets({ ...deps.store.readAssets(story.issueKey), updatedAt: iso(), review });
      return { review, cached: false, storyId: story.id, superseded };
    },

    async titles({ id, provider, force }) {
      const settings = deps.store.readSettings();
      if (!settings.ai.title) throw new HomefeedRequestError(409, '관리자 설정에서 제목 AI 가 꺼져 있습니다.');
      const { story, superseded } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      if (!force && assets.titles && assets.titles.evidenceHash === story.evidenceHash) return { ...assets.titles, cached: true, storyId: story.id, superseded };
      const ctx = titleCheckContextOf(story);
      const run = await deps.runAgent(buildTitlePrompt(titleMaterialsOf(story)), {
        provider,
        timeoutMs: 180_000,
        validate: (reply) => { if (parseTitleCandidates(reply).length < 6) throw new Error('제목 후보를 6개 이상 읽지 못했습니다'); },
      });
      const candidates = parseTitleCandidates(run.reply).map((raw) => classifyTitle(raw, ctx));
      const top = pickTopStops(candidates, 3);
      const titles = {
        evidenceHash: story.evidenceHash,
        provider: run.provider,
        createdAt: iso(),
        candidates,
        top: top.map((candidate) => candidate.id),
        pairs: buildTitleVisualPairs(story, top, settings.thumbnailTextMaxChars),
      };
      deps.store.writeAssets({ ...deps.store.readAssets(story.issueKey), updatedAt: iso(), titles });
      return { ...titles, cached: false, storyId: story.id, superseded };
    },

    async visual({ id, provider, refine }) {
      const settings = deps.store.readSettings();
      const { story, superseded } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      let prompts = currentPrompts(story, assets);
      let refinedBy = assets.visual && assets.visual.evidenceHash === story.evidenceHash ? assets.visual.refinedBy : null;
      if (refine) {
        if (!settings.ai.visualPrompt) throw new HomefeedRequestError(409, '관리자 설정에서 이미지 프롬프트 AI 가 꺼져 있습니다.');
        const base = story.aiPrompts;
        const run = await deps.runAgent(buildPromptRefinePrompt(story, base), {
          provider,
          timeoutMs: 120_000,
          validate: (reply) => { if (!applyPromptRefine(base, reply, 'check')) throw new Error('다듬은 프롬프트를 읽지 못했습니다'); },
        });
        prompts = applyPromptRefine(base, run.reply, run.provider) ?? base;
        refinedBy = run.provider;
        deps.store.writeAssets({ ...deps.store.readAssets(story.issueKey), updatedAt: iso(), visual: { evidenceHash: story.evidenceHash, createdAt: iso(), refinedBy, prompts } });
      }
      return {
        storyId: story.id,
        superseded,
        decision: story.visual,
        realImages: story.realImages,
        prompts,
        refinedBy,
        thumbnail: story.thumbnail,
        firstCard: story.firstCard,
        imageProvider: settings.imageProvider,
        aiLabel: AI_IMAGE_LABEL,
        images: assets.images,
      };
    },

    async select({ id, titleId, pairId }) {
      const { story } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      const candidate = assets.titles?.candidates.find((row) => row.id === titleId);
      if (!candidate) throw new HomefeedRequestError(410, '제목 후보를 찾지 못했습니다 — [제목 만들기]를 다시 눌러 주세요.');
      if (candidate.verdict === 'OVER') throw new HomefeedRequestError(409, '과장(OVER) 판정 제목은 고를 수 없습니다.');
      const pair = pairId ? assets.titles?.pairs.find((row) => row.id === pairId) ?? null : null;
      if (pairId && !pair) throw new HomefeedRequestError(410, '제목-이미지 조합을 찾지 못했습니다.');
      const selection = { storyId: story.id, titleId, pairId: pair ? pair.id : null, selectedAt: iso() };
      deps.store.writeAssets({ ...assets, updatedAt: iso(), selection });
      return { selection, title: candidate.title, verdict: candidate.verdict, pair };
    },

    async draft({ id, provider }) {
      if (!deps.store.readSettings().ai.draft) throw new HomefeedRequestError(409, '관리자 설정에서 원고 AI 가 꺼져 있습니다.');
      const { story, superseded } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      const titles = assets.titles;
      if (!titles || titles.candidates.length === 0) throw new HomefeedRequestError(409, '먼저 [제목 만들기]로 제목 후보를 만드세요.');
      const chosenId = assets.selection?.titleId ?? titles.top[0];
      const candidate = titles.candidates.find((row) => row.id === chosenId);
      if (!candidate) throw new HomefeedRequestError(409, 'STOP 제목이 없습니다 — 제목을 직접 고르거나 [제목 다시 만들기]를 눌러 주세요.');
      if (candidate.verdict === 'OVER') throw new HomefeedRequestError(409, '과장(OVER) 판정 제목으로는 원고를 만들지 않습니다.');
      const pair = titles.pairs.find((row) => row.id === assets.selection?.pairId) ?? titles.pairs.find((row) => row.titleId === candidate.id) ?? null;
      const materials = draftMaterialsOf(story, candidate.title, pair);
      const longEnough = (reply: string) => { if (reply.trim().length < MIN_DRAFT_CHARS) throw new Error('원고가 너무 짧습니다'); };

      const first = await deps.runAgent(buildDraftPrompt(materials), { provider, timeoutMs: 240_000, validate: longEnough });
      let text = first.reply.trim();
      let used = first.provider;
      let problems = validateDraft(text, materials);
      let retried = false;
      if (problems.length > 0) {
        retried = true;
        const labels = problems.map((problem) => DRAFT_PROBLEM_LABEL[problem] ?? problem);
        const second = await deps.runAgent(buildDraftPrompt(materials, labels), { provider: used, timeoutMs: 240_000, validate: longEnough }).catch(() => null);
        if (second) {
          const again = validateDraft(second.reply, materials);
          if (again.length <= problems.length) {
            text = second.reply.trim();
            used = second.provider;
            problems = again;
          }
        }
      }
      const record = { id: `d-${deps.newId()}`, createdAt: iso(), provider: used, titleId: candidate.id, text, problems, retried, evidenceHash: story.evidenceHash };
      const fresh = deps.store.readAssets(story.issueKey);
      deps.store.writeAssets({ ...fresh, updatedAt: iso(), drafts: [record, ...fresh.drafts].slice(0, 5) });
      return { draft: record, problemLabels: problems.map((problem) => DRAFT_PROBLEM_LABEL[problem] ?? problem), storyId: story.id, superseded };
    },

    async image({ id, promptId, prompt, aspectRatio }) {
      const settings = deps.store.readSettings();
      const { story } = findStory(id);
      const plan = currentPrompts(story, deps.store.readAssets(story.issueKey)).find((row) => row.id === promptId);
      if (!plan) throw new HomefeedRequestError(410, '프롬프트를 찾지 못했습니다.');
      const description = prompt || plan.finalPromptEn;
      if (settings.imageProvider !== 'codex-builtin') {
        return { status: 'disabled', message: '이미지 생성이 꺼져 있습니다 — 관리자 설정에서 "코덱스 구독으로 생성"을 켜거나 프롬프트를 복사해 쓰세요.', prompt: description };
      }
      try {
        const generated = await deps.generateImage({ description, aspectRatio });
        const record: HomefeedImageRecord = {
          id: `img-${deps.newId()}`,
          storyId: story.id,
          promptId,
          createdAt: iso(),
          provider: 'codex-builtin',
          aspectRatio: aspectRatio as HomefeedAspectRatio,
          promptKo: plan.finalPromptKo,
          promptEn: description,
          mime: generated.mime,
          bytes: generated.data.length,
          width: generated.width,
          height: generated.height,
          aiGenerated: true,
          label: AI_IMAGE_LABEL,
        };
        deps.store.saveImage(record, generated.data);
        const fresh = deps.store.readAssets(story.issueKey);
        deps.store.writeAssets({ ...fresh, updatedAt: iso(), images: [record, ...fresh.images].slice(0, 12) });
        return { status: 'ok', image: record };
      } catch (error) {
        if (error instanceof AgentCliError) return { status: 'failed', code: error.code, message: error.message };
        throw error;
      }
    },

    async imageFile(id) {
      const found = deps.store.readImage(id);
      return found ? { mime: found.record.mime, data: found.data } : null;
    },

    async publish({ id, postUrl, publishedAt, titleId }) {
      const { story } = findStory(id);
      const assets = deps.store.readAssets(story.issueKey);
      const chosenId = titleId || assets.selection?.titleId || '';
      const candidate = assets.titles?.candidates.find((row) => row.id === chosenId) ?? null;
      const pair = assets.titles?.pairs.find((row) => row.id === assets.selection?.pairId)
        ?? (candidate ? assets.titles?.pairs.find((row) => row.titleId === candidate.id) : undefined)
        ?? null;
      const file = deps.store.readPosts();
      const existing = file.posts.find((row) => row.postUrl === postUrl);
      const post: HomefeedPost = {
        id: existing?.id ?? `post-${deps.newId()}`,
        storyId: story.id,
        issueKey: story.issueKey,
        keyword: story.keyword,
        title: candidate?.title ?? '',
        titleId: candidate?.id ?? null,
        triggerType: candidate?.triggerType ?? null,
        storyPattern: story.tensions[0]?.type ?? null,
        visualStrategy: pair?.visualStrategy ?? story.visual.strategy,
        thumbnailType: story.thumbnail.type,
        thumbnailHasText: (pair ? pair.thumbnailCopy.length : story.thumbnail.textOverlay.length) > 0,
        postUrl,
        publishedAt,
        recordedAt: iso(),
        atPublish: {
          window: story.window.state,
          status: story.status.state,
          ageMinutes: story.signals.ageMinutes,
          sourceCountNow: story.signals.sourceCountNow,
          cloneRatio: story.signals.cloneRatio,
        },
      };
      deps.store.writePosts({ ...file, posts: [post, ...file.posts.filter((row) => row.postUrl !== postUrl)].slice(0, 500) });
      return { post };
    },

    async performance(input) {
      if (!deps.store.readPosts().posts.some((post) => post.id === input.postId)) throw new HomefeedRequestError(410, '발행 기록을 찾지 못했습니다.');
      const file = deps.store.readPerformance();
      const entry = { ...input, recordedAt: iso() };
      deps.store.writePerformance({ ...file, entries: [...file.entries, entry].slice(-5000) });
      return { entry };
    },

    async calibration() {
      const settings = deps.store.readSettings();
      const posts = deps.store.readPosts().posts;
      const entries = deps.store.readPerformance().entries;
      return {
        summary: summarizeCalibration(posts, entries, settings),
        posts: posts.map((post) => ({
          ...post,
          checkpoints: Object.fromEntries(HOMEFEED_CHECKPOINTS.map((checkpoint) => [checkpoint, latestEntry(entries, post.id, checkpoint)])),
        })),
      };
    },

    async settings(patch) {
      const current = deps.store.readSettings();
      if (!patch) return { settings: current };
      const next = normalizeHomefeedSettings({ ...patch, updatedAt: iso() }, current);
      deps.store.writeSettings(next);
      deps.applySchedule();
      const startedCollection = !current.enabled && next.enabled;
      if (startedCollection) void Promise.resolve(deps.runCycle()).catch(() => { /* 회차 실패는 runtime.lastError 로 보인다 */ });
      return { settings: next, startedCollection };
    },
  };
}
