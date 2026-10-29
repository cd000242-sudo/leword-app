/**
 * 홈판 상위 이력 자동 발행(2026-10-27 사장님 "남은 것들 수정").
 *
 * 판 수집(CI, homefeed-benchmarks.yml)은 leword-app `data/homefeed-top-blogs.json` 을 읽어 추천 규칙
 * "출처 블로그 상위 이력 1회+ 또는 공감 10+" 를 건다. 이 파일은 사장님 PC 의 어드바이저 기록에서만 나오므로,
 * 어드바이저 하루 수집(05:00 뒤)이 끝날 때마다 앱이 다시 뽑아 GitHub 에 올린다 — 손으로 뽑던 한 번짜리 값이 낡지 않게.
 *
 * 레포 주인 계정으로 gh 가 로그인된 PC(사장님 PC)에서만 돈다. 다른 사용자 PC 는 gh 가 없거나 주인이 아니라 건너뛴다.
 * 원격이 더 최근 날짜까지 담고 있으면(다른 PC 가 먼저 올림) 덮지 않는다. 같은 내용이면 커밋하지 않는다.
 */
import { topBlogsPayload, type HomefeedTopBlogsPayload } from '../utils/advisor/homefeed-top-blogs';
import { defaultIsOwner, readRemoteJson, runGh, type GhRunner } from './github-contents';

const REPO = 'cd000242-sudo/leword-app';
const ENDPOINT = `repos/${REPO}/contents/data/homefeed-top-blogs.json`;
export type TopBlogsPublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface TopBlogsPublisherDependencies {
  /** 주인 PC 판정 — 기본은 ci-watchdog isOwnerPc(gh 로그인 계정). */
  isOwner?: () => Promise<boolean>;
  now?: () => Date;
  /** Test seam; production always uses the fixed GitHub endpoint and local gh authentication. */
  gh?: GhRunner;
}

/** 원격 파일 — 없으면(404) null. */
const readRemote = (gh: GhRunner) => readRemoteJson<HomefeedTopBlogsPayload>(gh, ENDPOINT);

export async function publishHomefeedTopBlogs(dailies: readonly unknown[], deps: TopBlogsPublisherDependencies = {}): Promise<TopBlogsPublicationResult> {
  try {
    if (!(await (deps.isOwner || defaultIsOwner)())) return { status: 'skipped', reason: 'not_owner_pc' };
  } catch { return { status: 'skipped', reason: 'not_owner_pc' }; }
  const incoming = topBlogsPayload(dailies as any[], (deps.now || (() => new Date()))());
  if (!incoming.blogCount) return { status: 'skipped', reason: 'no_homefeed_tops' };
  const gh = deps.gh || runGh;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await readRemote(gh);
      const remoteTo = remote.payload?.window?.to || '';
      if (remoteTo && incoming.window.to && remoteTo > incoming.window.to) return { status: 'skipped', reason: 'newer_remote' };
      if (remote.payload && JSON.stringify(remote.payload.blogs) === JSON.stringify(incoming.blogs)) return { status: 'skipped', reason: 'already_published' };
      const content = Buffer.from(JSON.stringify(incoming, null, 1) + '\n').toString('base64');
      try {
        await gh(['api', '--hostname', 'github.com', '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: `chore(homefeed): 홈판 상위 이력 갱신 ${incoming.window.to} (블로그 ${incoming.blogCount} · 글 ${incoming.postCount})`,
          branch: 'main', content, ...(remote.sha ? { sha: remote.sha } : {}),
        }));
        return { status: 'published', reason: 'top_blogs_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}
