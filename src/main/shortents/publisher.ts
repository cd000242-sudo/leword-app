/**
 * 숏텐츠 급상승 공개본 자동 발행(2026-10-29) — 홈판 상위 이력 발행기와 같은 방식.
 *
 * 레포 주인 계정 gh 가 로그인된 PC 에서만 사이트 레포(cd000242-sudo/naver)의 spa/public/data/shortents-rising.json 을 갱신한다.
 * 다른 PC 는 건너뛴다. 원격이 더 최근 창이면 덮지 않고, 내용이 같으면(builtAt 제외) 커밋하지 않고, 빈 회차로 덮지 않는다.
 */
import { defaultIsOwner, readRemoteJson, runGh, type GhRunner } from '../github-contents';
import { SHORTENTS_PUBLIC_PATH, type ShortentsPublicPayload } from '../../utils/shortents/public-file';

const ENDPOINT = `repos/cd000242-sudo/naver/contents/${SHORTENTS_PUBLIC_PATH}`;

export type ShortentsPublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface ShortentsPublisherDependencies {
  isOwner?: () => Promise<boolean>;
  /** Test seam; production always uses the fixed GitHub endpoint and local gh authentication. */
  gh?: GhRunner;
}

const withoutBuiltAt = (p: ShortentsPublicPayload) => JSON.stringify({ ...p, builtAt: '' });

export async function publishShortentsRising(
  payload: ShortentsPublicPayload | null,
  deps: ShortentsPublisherDependencies = {},
): Promise<ShortentsPublicationResult> {
  try {
    if (!(await (deps.isOwner || defaultIsOwner)())) return { status: 'skipped', reason: 'not_owner_pc' };
  } catch { return { status: 'skipped', reason: 'not_owner_pc' }; }
  if (!payload || !payload.topics.length) return { status: 'skipped', reason: 'empty_window' };
  const gh = deps.gh || runGh;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await readRemoteJson<ShortentsPublicPayload>(gh, ENDPOINT);
      const remoteAt = Date.parse(remote.payload?.latest?.publishTime || '');
      const incomingAt = Date.parse(payload.latest.publishTime);
      if (Number.isFinite(remoteAt) && Number.isFinite(incomingAt) && remoteAt > incomingAt) return { status: 'skipped', reason: 'newer_remote' };
      if (remote.payload && withoutBuiltAt(remote.payload) === withoutBuiltAt(payload)) return { status: 'skipped', reason: 'already_published' };
      const content = Buffer.from(JSON.stringify(payload, null, 1) + '\n').toString('base64');
      try {
        await gh(['api', '--hostname', 'github.com', '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: `chore(shortents): 숏텐츠 급상승 갱신 ${payload.latest.publishTime} (토픽 ${payload.topics.length})`,
          branch: 'main', content, ...(remote.sha ? { sha: remote.sha } : {}),
        }));
        return { status: 'published', reason: 'shortents_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}
