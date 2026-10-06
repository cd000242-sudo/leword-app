/**
 * 설계실 3차 — 결과 확인 순수 함수(2026-10-06 사장님 승인 "진행").
 * 발행 글의 3일 · 7일 뒤 실제 순위(블로그탭)와 어드바이저 홈판 유입을 '고를 때 판정' 옆에 남긴다.
 * 네트워크 · 파일 없음. 값은 잰 그대로 — 추정하지 않는다.
 */

export const RESULT_CHECK_DAYS = [3, 7] as const;
const DAY_MS = 86400000;

/** 같은 글 열쇠 — 네이버 블로그는 아이디/글번호(모바일 · PostView · 추적값 무시), 나머지는 호스트+경로. */
function postKey(url: string): string {
  const s = String(url || '').replace(/&amp;/g, '&');
  const pv = s.match(/blogId=([^&#]+)[^#]*?logNo=(\d+)/i);
  if (pv) return `naver:${pv[1].toLowerCase()}/${pv[2]}`;
  const plain = s.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
  if (plain) return `naver:${plain[1].toLowerCase()}/${plain[2]}`;
  try {
    const u = new URL(s);
    return `${u.hostname.replace(/^(www|m)\./, '')}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return s;
  }
}

/**
 * 블로그탭 화면의 data-url 을 나온 순서대로 세어 내 글 순위를 찾는다. 같은 글 반복은 한 번만.
 * blog.naver.com 만 세면 티스토리 같은 외부 결과만큼 순위가 앞당겨진다(실측 2026-08-22 사장님 지적).
 */
export function rankFromBlogTab(html: string, postUrl: string): { rank: number | null; sampled: number } {
  const target = postKey(postUrl);
  const seen: string[] = [];
  for (const match of String(html || '').matchAll(/data-url="([^"]+)"/g)) {
    const key = postKey(match[1]);
    if (!key || seen.includes(key)) continue;
    seen.push(key);
  }
  const index = seen.indexOf(target);
  return { rank: index >= 0 ? index + 1 : null, sampled: seen.length };
}

/** 지금 잴 차례인 날(3 · 7) — 등록 뒤 그 날수가 지났고 아직 안 잰 날. */
export function dueResultChecks(result: { registeredAt: string; checks: Array<{ day: number }> }, now: number): number[] {
  const start = Date.parse(result.registeredAt);
  if (!Number.isFinite(start)) return [];
  const done = new Set((result.checks || []).map((c) => c.day));
  const due = RESULT_CHECK_DAYS.filter((day) => now - start >= day * DAY_MS && !done.has(day));
  // 7일이 지났는데 3일을 못 쟀으면 3일은 건너뛴다 — 지금 재면 3일 값이 아니다.
  return due.length > 1 ? [due[due.length - 1]] : [...due];
}

export function logNoOf(postUrl: string): string | null {
  const s = String(postUrl || '');
  return (s.match(/logNo=(\d+)/i) || s.match(/blog\.naver\.com\/[^/?#]+\/(\d+)/i) || [])[1] || null;
}

/** 어드바이저 글별 기록(latest.posts[].contentId)에서 같은 글의 홈판 유입 수. 못 찾으면 null. */
export function homefeedForPost(latest: any, postUrl: string): { day: string; count: number; views: number | null } | null {
  const logNo = logNoOf(postUrl);
  if (!logNo || !latest || !Array.isArray(latest.posts)) return null;
  // contentId 는 실측(2026-10-06)으로 글 주소 전체("http://blog.naver.com/아이디/글번호")다 — 글 번호만 와도 맞춘다.
  const post = latest.posts.find((p: any) => {
    const id = String(p?.contentId || '');
    return id === logNo || logNoOf(id) === logNo;
  });
  if (!post || !post.homefeed || typeof post.homefeed.count !== 'number') return null;
  return { day: String(latest.day || ''), count: post.homefeed.count, views: typeof post.views === 'number' ? post.views : null };
}
