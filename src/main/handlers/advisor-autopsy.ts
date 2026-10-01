/**
 * 0명 글 부검 재료 수집(앱 전용, 2026-10-01) — 하루 수집기가 끝난 뒤 이어서 돈다.
 *
 * 1) 지난 14일 중 없는 날의 내 조회 순위 · 전체 홈판 상위(어드바이저, 로그인 세션 — 날마다 최대 2요청)
 * 2) 내 최근 글 목록(공개 창구, 로그인 불필요)
 * 3) 발행 시각을 모르는 내 글 · 홈판 글의 공개 글 화면(한 번 재면 끝 — 회차당 상한)
 * 결과는 userData/advisor-daily/autopsy-history.json 하나. 판정은 사이트가 한다(utils/advisor/autopsy-history.ts 머리말).
 * 비용 0. 실패해도 하루 기록은 이미 저장된 뒤라 그대로 둔다.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  AUTOPSY_DAYS,
  emptyHistory,
  historyProbes,
  kstDayOf,
  mergeHistory,
  parsePostPageTime,
  seedFromRecords,
  timeTargets,
  type AutopsyHistory,
  type AutopsyMyPost,
} from '../../utils/advisor/autopsy-history';
import type { AdvisorDailyContext, AdvisorProbeSpec } from '../../utils/advisor/daily-plan';
import { localDay } from '../../utils/advisor/daily-plan';
import type { AdvisorDailyRecord, AdvisorProbeResult } from '../../utils/advisor/daily-summary';
import { sweepPosts, type FetchLike } from '../../utils/blog-class/naver-blog-facts';

const FILE = 'autopsy-history.json';
/** 내 글 목록은 최근 150개까지 — 하루 10개씩 써도 14일이 들어간다. */
const MY_POST_LIMIT = 150;
/** 회차당 글 화면 시각 조회 상한. 300ms 간격이면 1분 남짓. */
const TIME_FETCH_CAP = 200;
const TIME_FETCH_GAP_MS = 300;
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export function readAutopsyHistory(dir: string): AutopsyHistory {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
    return parsed?.schemaVersion === 1 ? { ...emptyHistory(), ...parsed } : emptyHistory();
  } catch {
    return emptyHistory();
  }
}

function writeAutopsyHistory(dir: string, history: AutopsyHistory): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(history), 'utf8');
  fs.renameSync(temp, file);
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** 공개 글 화면에서 발행 시각 하나. 못 읽으면 null. */
async function fetchPostTime(url: string, fetchImpl: FetchLike, nowMs: number): Promise<{ at: string; approx: boolean } | null> {
  const m = url.match(/^https:\/\/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)$/);
  if (!m) return null;
  try {
    const res = await fetchImpl(`https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}`, { headers: { 'User-Agent': DESKTOP_UA } });
    return res.ok ? parsePostPageTime(await res.text(), nowMs) : null;
  } catch {
    return null;
  }
}

/** 공개 목록 → 부검 기간 안의 내 글(날짜 모르는 최근 글 포함). 못 읽으면 null(앞 목록 유지). */
async function readMyPosts(blogId: string, fetchImpl: FetchLike, now: Date): Promise<AutopsyMyPost[] | null> {
  const swept = await sweepPosts(blogId, fetchImpl, { limit: MY_POST_LIMIT, includeOldest: false });
  if (!swept.ok) return null;
  const floor = localDay(new Date(now.getTime() - AUTOPSY_DAYS * 24 * 3600 * 1000));
  return swept.posts
    .filter((p) => !p.publishedOn || p.publishedOn >= floor)
    .map((p) => ({ logNo: p.logNo, title: p.title, url: `https://blog.naver.com/${blogId}/${p.logNo}`, publishedOn: p.publishedOn, searchable: p.searchable, blocked: p.blocked }));
}

export interface AutopsyCollectDeps {
  dir: string;
  ctx: AdvisorDailyContext;
  /** 하루 수집기의 창구 호출기(간격 · 오류 처리 포함)를 그대로 받는다. */
  probe: (specs: readonly AdvisorProbeSpec[]) => Promise<Record<string, AdvisorProbeResult>>;
  fetchImpl?: FetchLike;
  /** 쌓인 하루 기록 — 이미 가진 날은 다시 부르지 않는다. */
  records?: readonly AdvisorDailyRecord[];
}

export async function collectAutopsyHistory(deps: AutopsyCollectDeps): Promise<AutopsyHistory> {
  const { dir, ctx } = deps;
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);
  const nowMs = ctx.now.getTime();
  const before = seedFromRecords(readAutopsyHistory(dir), deps.records ?? []);
  const merged = mergeHistory(before, await deps.probe(historyProbes(ctx, before)), ctx.now);
  const myPosts = (await readMyPosts(ctx.channelId, fetchImpl, ctx.now)) ?? merged.myPosts;
  const withPosts: AutopsyHistory = { ...merged, myPosts };

  const postTimes: Record<string, string> = { ...withPosts.postTimes };
  const approx: Record<string, string> = {};
  for (const url of timeTargets(withPosts, TIME_FETCH_CAP)) {
    const time = await fetchPostTime(url, fetchImpl, nowMs);
    if (time && !time.approx) postTimes[url] = time.at;
    else if (time) approx[url] = time.at;
    await sleep(TIME_FETCH_GAP_MS);
  }
  // 정확한 시각을 알면 날짜도 그 시각의 KST 날짜로 — 목록의 'HH:MM'(오늘 글) · 'N시간 전'은 날짜가 비거나 어긋난다.
  const finalPosts = myPosts.map((p) => {
    const at = postTimes[p.url] ?? approx[p.url];
    return at ? { ...p, publishedOn: kstDayOf(at), ...(postTimes[p.url] ? {} : { approxAt: at }) } : p;
  });
  const next: AutopsyHistory = { ...withPosts, postTimes, myPosts: finalPosts };
  writeAutopsyHistory(dir, next);
  const timed = finalPosts.filter((p) => postTimes[p.url]).length;
  console.log(`[ADVISOR-AUTOPSY] 기록 ${Object.keys(next.days).length}일 · 내 글 ${finalPosts.length}(시각 ${timed}) · 시각 저장 ${Object.keys(postTimes).length}`);
  return next;
}
