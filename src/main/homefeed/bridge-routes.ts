/**
 * 홈판 신호 브리지 경로 — /v1/bridge/homefeed/* (127.0.0.1 · 허용 출처는 web-bridge 가 이미 거른다).
 *
 * 다른 브리지 경로와 같은 원칙이다: **재료만 받는다.** 스토리 id · 고른 제목 id · 설정 값 · 발행 주소 · 성과 숫자뿐이고,
 * 프롬프트 문장은 앱이 만든다. 이미지 설명(사용자가 고친 프롬프트)만 예외로 받되, 실행기가 '그림 설명'으로만 감싸고
 * 길이를 자르며 읽기 전용 샌드박스에서 돈다(codexImageRunner).
 * 목록(stories)은 저장된 계산본을 읽기만 한다 — 그리는 요청마다 AI · 이미지 API 를 부르지 않는다.
 * electron 에 기대지 않는다(web-bridge 와 같이 vitest 로 그대로 검증).
 *
 * 404 는 '없는 경로'에만 쓴다 — 사이트는 404 를 "앱이 구버전"으로 읽는다. 지금 계산본에 없는 스토리 · 제목 · 이미지는 410 이다.
 */
import type http from 'http';
import { HOMEFEED_ASPECT_RATIOS, HOMEFEED_CHECKPOINTS, type HomefeedCheckpoint } from '../../utils/homefeed/types';
import type { EditorialBriefInput, EditorialSelectInput } from '../../utils/homefeed/editorial-types';

export const HOMEFEED_ROUTE_PREFIX = '/v1/bridge/homefeed/';

export class HomefeedRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HomefeedRequestError';
  }
}

export interface HomefeedPerformanceInput {
  postId: string;
  checkpoint: HomefeedCheckpoint;
  totalViews: number | null;
  searchViews: number | null;
  recommendViews: number | null;
  feedSeen: boolean | null;
  referrerNote: string;
}

export interface HomefeedBridgeDeps {
  stories(): Promise<unknown>;
  story(input: { id: string }): Promise<unknown>;
  collect(): Promise<unknown>;
  brief(input: EditorialBriefInput): Promise<unknown>;
  selectEditorial(input: EditorialSelectInput): Promise<unknown>;
  shareEditorial(input: { id: string; briefRevision: string; share: boolean }): Promise<unknown>;
  review(input: { id: string; provider: string; force: boolean }): Promise<unknown>;
  titles(input: { id: string; provider: string; force: boolean }): Promise<unknown>;
  visual(input: { id: string; provider: string; refine: boolean }): Promise<unknown>;
  select(input: { id: string; titleId: string; pairId: string }): Promise<unknown>;
  draft(input: { id: string; provider?: string; briefRevision?: string; selectionRevision?: number }): Promise<unknown>;
  image(input: { id: string; promptId: string; prompt: string; aspectRatio: string }): Promise<unknown>;
  imageFile(id: string): Promise<{ mime: string; data: Buffer } | null>;
  publish(input: { id: string; postUrl: string; publishedAt: string; titleId: string }): Promise<unknown>;
  performance(input: HomefeedPerformanceInput): Promise<unknown>;
  calibration(): Promise<unknown>;
  settings(patch: Record<string, unknown> | null): Promise<unknown>;
}

export interface HomefeedRouteHelpers {
  readBody(req: http.IncomingMessage): Promise<string>;
  json(res: http.ServerResponse, code: number, payload: unknown): void;
}

const PROVIDERS = ['claude', 'codex', 'gemini', 'grok'];
const ID_RE = /^[^\s/\\<>"'`]{1,240}$/u;
const ASSET_ID_RE = /^[a-z0-9-]{3,64}$/;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function provider(value: unknown): string {
  const wanted = text(value, 20);
  return PROVIDERS.includes(wanted) ? wanted : '';
}

function storyId(value: unknown): string {
  const id = text(value, 240);
  if (!ID_RE.test(id)) throw new HomefeedRequestError(400, '스토리 id 가 비었거나 형식이 올바르지 않습니다.');
  return id;
}

function count(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1_000_000_000) throw new HomefeedRequestError(400, '조회수는 0 이상의 정수로 적어 주세요(모르면 비워 두세요).');
  return number;
}

async function parseBody(req: http.IncomingMessage, helpers: HomefeedRouteHelpers): Promise<Record<string, unknown>> {
  const raw = await helpers.readBody(req);
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HomefeedRequestError(400, '본문이 JSON 이 아닙니다.');
  }
}

async function route(req: http.IncomingMessage, res: http.ServerResponse, deps: HomefeedBridgeDeps, helpers: HomefeedRouteHelpers): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const name = url.pathname.slice(HOMEFEED_ROUTE_PREFIX.length);
  const ok = (result: unknown) => helpers.json(res, 200, { ok: true, result });

  if (req.method === 'GET' && name === 'stories') return ok(await deps.stories());
  if (req.method === 'GET' && name === 'calibration') return ok(await deps.calibration());
  if (req.method === 'GET' && name === 'settings') return ok(await deps.settings(null));

  if (req.method === 'GET' && name === 'image-file') {
    const id = text(url.searchParams.get('id'), 64);
    if (!ASSET_ID_RE.test(id)) throw new HomefeedRequestError(400, '이미지 id 형식이 올바르지 않습니다.');
    const file = await deps.imageFile(id);
    if (!file) throw new HomefeedRequestError(410, '이미지를 찾지 못했습니다.');
    res.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': String(file.data.length), 'Cache-Control': 'no-store' });
    res.end(file.data);
    return;
  }

  if (req.method !== 'POST') throw new HomefeedRequestError(404, '없는 경로입니다.');
  const body = await parseBody(req, helpers);

  switch (name) {
    case 'story':
      return ok(await deps.story({ id: storyId(body.id) }));
    case 'collect':
      return ok(await deps.collect());
    case 'review':
      return ok(await deps.review({ id: storyId(body.id), provider: provider(body.provider), force: body.force === true }));
    case 'brief':
      return ok(await deps.brief({ id: storyId(body.id), provider: provider(body.provider), force: body.force === true, evidenceRevision: text(body.evidenceRevision, 64) }));
    case 'select-editorial':
      return ok(await deps.selectEditorial({ ...body, id: storyId(body.id) } as unknown as EditorialSelectInput));
    case 'share-editorial':
      return ok(await deps.shareEditorial({ id: storyId(body.id), briefRevision: text(body.briefRevision, 64), share: body.share as boolean }));
    case 'titles':
      return ok(await deps.titles({ id: storyId(body.id), provider: provider(body.provider), force: body.force === true }));
    case 'visual':
      return ok(await deps.visual({ id: storyId(body.id), provider: provider(body.provider), refine: body.refine === true }));
    case 'select': {
      const titleId = text(body.titleId, 64);
      const pairId = text(body.pairId, 64);
      if (!ASSET_ID_RE.test(titleId) || (pairId && !ASSET_ID_RE.test(pairId))) throw new HomefeedRequestError(400, '고른 제목 · 조합 id 형식이 올바르지 않습니다.');
      return ok(await deps.select({ id: storyId(body.id), titleId, pairId }));
    }
    case 'draft':
      return ok(await deps.draft({ id: storyId(body.id), provider: provider(body.provider), briefRevision: text(body.briefRevision, 64), selectionRevision: body.selectionRevision as number }));
    case 'image': {
      const promptId = text(body.promptId, 64);
      if (!ASSET_ID_RE.test(promptId)) throw new HomefeedRequestError(400, '프롬프트 id 형식이 올바르지 않습니다.');
      const aspectRatio = HOMEFEED_ASPECT_RATIOS.find((ratio) => ratio === body.aspectRatio) ?? '16:9';
      return ok(await deps.image({ id: storyId(body.id), promptId, prompt: text(body.prompt, 1500), aspectRatio }));
    }
    case 'publish': {
      const postUrl = text(body.postUrl, 500);
      let parsed: URL;
      try { parsed = new URL(postUrl); } catch { throw new HomefeedRequestError(400, '발행한 글 주소(https)를 넣어 주세요.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new HomefeedRequestError(400, '발행한 글 주소는 https 로 시작해야 합니다.');
      const publishedAt = text(body.publishedAt, 40);
      if (!Number.isFinite(Date.parse(publishedAt))) throw new HomefeedRequestError(400, '발행 시각 형식이 올바르지 않습니다.');
      const titleId = text(body.titleId, 64);
      if (titleId && !ASSET_ID_RE.test(titleId)) throw new HomefeedRequestError(400, '제목 id 형식이 올바르지 않습니다.');
      return ok(await deps.publish({ id: storyId(body.id), postUrl: parsed.toString(), publishedAt: new Date(publishedAt).toISOString(), titleId }));
    }
    case 'performance': {
      const postId = text(body.postId, 64);
      if (!ASSET_ID_RE.test(postId)) throw new HomefeedRequestError(400, '발행 기록 id 형식이 올바르지 않습니다.');
      const checkpoint = HOMEFEED_CHECKPOINTS.find((value) => value === body.checkpoint);
      if (!checkpoint) throw new HomefeedRequestError(400, '체크포인트는 30m · 2h · 6h · 24h 중 하나입니다.');
      return ok(await deps.performance({
        postId,
        checkpoint,
        totalViews: count(body.totalViews),
        searchViews: count(body.searchViews),
        recommendViews: count(body.recommendViews),
        feedSeen: typeof body.feedSeen === 'boolean' ? body.feedSeen : null,
        referrerNote: text(body.referrerNote, 200),
      }));
    }
    case 'settings': {
      const patch = body.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HomefeedRequestError(400, '바꿀 설정(patch)이 비었습니다.');
      return ok(await deps.settings(patch as Record<string, unknown>));
    }
    default:
      throw new HomefeedRequestError(404, '없는 경로입니다.');
  }
}

export async function handleHomefeedRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: HomefeedBridgeDeps,
  helpers: HomefeedRouteHelpers,
): Promise<void> {
  try {
    await route(req, res, deps, helpers);
  } catch (error) {
    if (error instanceof HomefeedRequestError) {
      helpers.json(res, error.status, { ok: false, error: error.message });
      return;
    }
    throw error;
  }
}
