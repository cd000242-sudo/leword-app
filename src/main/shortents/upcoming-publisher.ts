/**
 * 곧 뜰 숏텐츠 후보 공개본 자동 발행(2026-10-30) — 숏텐츠 급상승 발행기와 같은 방식.
 *
 * 레포 주인 계정 gh 가 로그인된 PC 에서만 사이트 레포의 spa/public/data/shortents-upcoming.json 을 갱신한다.
 * 원격이 더 최근이면 덮지 않고, 내용이 같으면(builtAt 제외) 커밋하지 않고, 측정 실패 회차(null)로 덮지 않는다.
 */
import { defaultIsOwner, readRemoteJson, runGh, type GhRunner } from '../github-contents';
import { UPCOMING_PUBLIC_PATH, type UpcomingPublicPayload } from '../../utils/shortents/upcoming-public';

const ENDPOINT = `repos/cd000242-sudo/naver/contents/${UPCOMING_PUBLIC_PATH}`;

export type UpcomingPublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface UpcomingPublisherDependencies {
  isOwner?: () => Promise<boolean>;
  gh?: GhRunner;
}

const withoutBuiltAt = (p: UpcomingPublicPayload) => JSON.stringify({ ...p, builtAt: '' });

export async function publishShortentsUpcoming(
  payload: UpcomingPublicPayload | null,
  deps: UpcomingPublisherDependencies = {},
): Promise<UpcomingPublicationResult> {
  try {
    if (!(await (deps.isOwner || defaultIsOwner)())) return { status: 'skipped', reason: 'not_owner_pc' };
  } catch { return { status: 'skipped', reason: 'not_owner_pc' }; }
  if (!payload) return { status: 'skipped', reason: 'nothing_measured' };
  const gh = deps.gh || runGh;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await readRemoteJson<UpcomingPublicPayload>(gh, ENDPOINT);
      const remoteAt = Date.parse(remote.payload?.builtAt || '');
      if (Number.isFinite(remoteAt) && remoteAt > Date.parse(payload.builtAt)) return { status: 'skipped', reason: 'newer_remote' };
      if (remote.payload && withoutBuiltAt(remote.payload) === withoutBuiltAt(payload)) return { status: 'skipped', reason: 'already_published' };
      const content = Buffer.from(JSON.stringify(payload, null, 1) + '\n').toString('base64');
      try {
        await gh(['api', '--hostname', 'github.com', '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: `chore(shortents): 곧 뜰 숏텐츠 후보 갱신 ${payload.builtAt} (후보 ${payload.candidates.length})`,
          branch: 'main', content, ...(remote.sha ? { sha: remote.sha } : {}),
        }));
        return { status: 'published', reason: 'upcoming_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}
