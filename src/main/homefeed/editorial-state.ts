import type { HomefeedAssets, HomefeedStory } from '../../utils/homefeed/types';
import type { EditorialSelectInput, EditorialSelection, EditorialView } from '../../utils/homefeed/editorial-types';
import { EDITORIAL_VERSION } from '../../utils/homefeed/editorial-types';
import { HomefeedRequestError } from './bridge-routes';

export function editorialView(story: HomefeedStory, assets: HomefeedAssets, publicMode = false): EditorialView {
  const saved = assets.editorial ?? null;
  const allowed = publicMode && saved?.revision !== assets.publicEditorialRevision ? null : saved;
  const brief = publicMode && allowed ? { ...allowed,
    sources: allowed.sources.map((source) => ({ ...source, text: '' })),
    facts: allowed.facts.map((fact) => ({ ...fact, supports: fact.supports.map((support) => ({ ...support, excerpt: support.excerpt.slice(0, 400) })) })),
  } : allowed;
  const stale = Boolean(brief && (brief.evidenceRevision !== story.evidenceHash || brief.version !== EDITORIAL_VERSION));
  const failure = !publicMode && assets.editorialFailure?.evidenceRevision === story.evidenceHash ? assets.editorialFailure : null;
  const selection = !publicMode ? assets.editorialSelection ?? null : null;
  const evidence = story.evidence.find((row) => row.title && row.url);
  return {
    state: stale ? 'stale' : brief ? brief.readiness : failure ? 'failed' : 'unprepared',
    evidenceRevision: story.evidenceHash,
    summary: brief && !stale ? brief.summary : evidence?.description || evidence?.title || story.keyword,
    sourceTitle: evidence?.title ?? '',
    sourceUrl: evidence?.url ?? null,
    brief,
    selection,
    error: failure?.message ?? null,
    shared: Boolean(assets.publicEditorialRevision),
    ...(publicMode ? { public: true } : {}),
  };
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008]/u.test(value)) {
    throw new HomefeedRequestError(400, `${field} 형식을 확인해 주세요(최대 ${max}자).`);
  }
  return value.trim();
}

/** IPC도 웹과 같은 검증을 통과한다. 프런트엔드의 비활성화 버튼은 권한 경계가 아니다. */
export function validateEditorialSelection(story: HomefeedStory, assets: HomefeedAssets, input: EditorialSelectInput, now: string): EditorialSelection {
  const brief = assets.editorial;
  if (!brief || brief.readiness !== 'ready' || !brief.review.passed) throw new HomefeedRequestError(409, '근거를 확인한 작성안을 먼저 준비해 주세요.');
  if (brief.version !== EDITORIAL_VERSION || input.evidenceRevision !== story.evidenceHash || brief.evidenceRevision !== story.evidenceHash || input.briefRevision !== brief.revision) {
    throw new HomefeedRequestError(409, '근거 또는 작성안이 바뀌었습니다. 새로고침 후 관점을 다시 확인해 주세요.');
  }
  const revision = assets.editorialSelection?.revision ?? 0;
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== revision) throw new HomefeedRequestError(409, '다른 화면에서 선택을 변경했습니다. 새로고침해 주세요.');
  const angle = brief.angles.find((row) => row.id === input.angleId);
  if (!angle) throw new HomefeedRequestError(400, '이 작성안에 없는 관점입니다.');
  const title = requiredText(input.title, '제목', 80);
  const line1 = requiredText(input.card?.line1, '첫 카드 문구', 80);
  if (typeof input.card?.line2 !== 'string' || input.card.line2.length > 80) throw new HomefeedRequestError(400, '두 번째 카드 문구는 80자 이내로 적어 주세요.');
  const imageId = input.imageId === null || input.imageId === '' ? null : input.imageId;
  if (imageId !== null && (typeof imageId !== 'string' || !brief.sources.some((source) => source.id === imageId && /^https?:\/\//i.test(source.imageUrl || ''))
    && !assets.images.some((image) => image.id === imageId))) {
    throw new HomefeedRequestError(400, '이 소재에 없는 이미지입니다.');
  }
  return { revision: revision + 1, briefRevision: brief.revision, evidenceRevision: story.evidenceHash,
    angleId: angle.id, title, card: { line1, line2: input.card.line2.trim() }, imageId, selectedAt: now };
}
