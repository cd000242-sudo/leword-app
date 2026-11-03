/**
 * 홈판 상위 이력 블로그(2026-10-27) — 어드바이저 하루 기록에서 블로그별 "홈판 상위에 처음 잡힌 날" 목록을 뽑는다.
 *
 * 25일치 실측에서 홈판 상위를 가른 가장 강한 신호가 블로그 이력이었다(상위 3회+ 블로그 2.93% vs 없음 0.09%).
 * 판 수집(CI)은 이 PC 의 어드바이저 기록을 못 보므로, 앱이 이 꼴로 뽑아 leword-app `data/homefeed-top-blogs.json` 에 올린다.
 * 꼴은 scripts/homefeed-top-blogs.cjs(손으로 뽑을 때 쓰는 CLI)와 같다 — 테스트가 둘을 맞대 잠근다.
 * 남의 공개 글 주소에서 뽑은 블로그 아이디와 날짜뿐이라 개인정보가 없다.
 */
export interface HomefeedTopBlogsPayload {
  generatedAt: string;
  source: 'creator-advisor homefeed top';
  window: { from: string | null; to: string | null };
  blogCount: number;
  postCount: number;
  blogs: Record<string, string[]>;
}

interface DailyLike {
  day?: string;
  homefeedTitles?: { url?: string }[];
  homefeedWeek?: { url?: string; day?: string }[];
}

export const blogOfUrl = (url: string): string | null => (/blog\.naver\.com\/([A-Za-z0-9_-]+)/.exec(String(url || '')) || [])[1]?.toLowerCase() || null;

/** 어드바이저 하루 기록들 → { 블로그: 상위에 처음 잡힌 날 목록(글마다 한 번) } */
export function topBlogsFromDailies(dailies: readonly (DailyLike | null | undefined)[]): Record<string, string[]> {
  const firstDay = new Map<string, string>();
  for (const daily of dailies) {
    if (!daily || typeof daily !== 'object') continue;
    const rows = [
      ...(Array.isArray(daily.homefeedTitles) ? daily.homefeedTitles.map((t) => ({ ...t, day: daily.day })) : []),
      ...(Array.isArray(daily.homefeedWeek) ? daily.homefeedWeek : []),
    ];
    for (const r of rows) {
      // 같은 글이 대소문자 · 모바일 주소로 따로 세지지 않게(블로그 아이디는 대소문자를 가리지 않는다).
      const url = String(r?.url || '').replace(/^http:\/\//, 'https://').replace(/^https:\/\/m\.blog/, 'https://blog').replace(/[?#].*$/, '').toLowerCase();
      const day = String(r?.day || '');
      if (!blogOfUrl(url) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const prev = firstDay.get(url);
      if (!prev || day < prev) firstDay.set(url, day);
    }
  }
  const blogs: Record<string, string[]> = {};
  for (const [url, day] of firstDay) {
    const blog = blogOfUrl(url)!;
    blogs[blog] = [...(blogs[blog] || []), day];
  }
  return Object.fromEntries(Object.entries(blogs).map(([blog, days]) => [blog, [...days].sort()]));
}

export function topBlogsPayload(dailies: readonly (DailyLike | null | undefined)[], now: Date): HomefeedTopBlogsPayload {
  const blogs = topBlogsFromDailies(dailies);
  const days = Object.values(blogs).flat().sort();
  return {
    generatedAt: now.toISOString(),
    source: 'creator-advisor homefeed top',
    window: { from: days[0] || null, to: days.at(-1) || null },
    blogCount: Object.keys(blogs).length,
    postCount: days.length,
    blogs,
  };
}
