import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  decodePostTitle,
  extractBlogId,
  fetchBlogSnapshot,
  parseBlogSnapshot,
  parsePostDate,
  parsePostListPage,
  probeInfluencer,
  summarizeActivity,
  sweepPosts,
  type BlogPostRow,
  type FetchLike,
} from '../blog-class/naver-blog-facts';

/**
 * 픽스처는 2026-09-10 에 blogpeople(네이버 블로그팀 공식 블로그) 에서 **실제로 받은 응답**이다.
 * 지어낸 표본으로 통과시키면 화면이 바뀌었을 때 테스트가 먼저 알려주지 못한다.
 */
const FIXTURES = path.join(__dirname, 'fixtures');
const MBLOG_HTML = fs.readFileSync(path.join(FIXTURES, 'blog-facts-mblog.html'), 'utf8');
const POSTLIST_BODY = fs.readFileSync(path.join(FIXTURES, 'blog-facts-postlist.txt'), 'utf8');

const NOW = Date.parse('2026-09-10T00:00:00Z');

function fakeFetch(routes: Record<string, { status?: number; body?: string }>): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([pattern]) => url.includes(pattern));
    const status = hit?.[1].status ?? (hit ? 200 : 404);
    return { ok: status >= 200 && status < 300, status, text: async () => hit?.[1].body ?? '' };
  };
  return { fetchImpl, calls };
}

describe('블로그 사실 — m.blog 화면', () => {
  it('실제 응답에서 방문자·이웃·글 수·대표 주제를 읽는다', () => {
    const snapshot = parseBlogSnapshot(MBLOG_HTML, 'blogpeople');
    expect(snapshot.todayVisitors).toBe(1217);
    expect(snapshot.subscribers).toBe(1529266);
    expect(snapshot.totalVisitors).toBe(139744068);
    expect(snapshot.postCount).toBe(1336);
    expect(snapshot.declaredTopic).toBe('IT·컴퓨터');
    expect(snapshot.nickName).toBe('네이버 블로그팀');
    expect(snapshot.officialBlog).toBe(true);
    expect(snapshot.powerBlog).toBe(false);
  });

  it('화면을 못 읽으면 0 이 아니라 null 이다 — 방문자 0 과 못 잼은 다른 말이다', () => {
    const snapshot = parseBlogSnapshot('<html><body>점검 중입니다</body></html>', 'someone');
    expect(snapshot.todayVisitors).toBeNull();
    expect(snapshot.subscribers).toBeNull();
    expect(snapshot.declaredTopic).toBeNull();
    expect(snapshot.blogId).toBe('someone');
  });
});

describe('블로그 사실 — 글 목록', () => {
  it('pagingHtml 의 잘못된 이스케이프 때문에 통째로 실패하지 않는다', () => {
    // 응답 안 pagingHtml 은 class=\'…\' 처럼 JSON 이 아닌 이스케이프를 담는다. 날것 그대로면 JSON.parse 가 죽는다.
    expect(() => JSON.parse(POSTLIST_BODY)).toThrow();
    const page = parsePostListPage(POSTLIST_BODY, NOW);
    expect(page.posts).toHaveLength(30);
    expect(page.totalCount).toBe(1336);
    expect(page.countPerPage).toBe(30);
    expect(page.blogNo).toBe('46400079');
  });

  it('제목의 URL 인코딩과 HTML 엔티티를 두 겹 다 벗긴다', () => {
    const page = parsePostListPage(POSTLIST_BODY, NOW);
    expect(page.posts[0].title).toBe('[블로그 있어요!] 이재성의 질주');
    // 실제 픽스처에 &lt; &gt; 가 인코딩되어 들어 있는 글
    const angled = page.posts.find((post) => post.title.includes('고스트밴드'));
    expect(angled?.title).toContain('<고스트밴드>');
    expect(decodePostTitle('%26%2339%3B%EB%AA%A8%EB%91%90%26%2339%3B')).toBe("'모두'");
  });

  it('발행일·댓글 수·검색 허용을 읽는다', () => {
    const page = parsePostListPage(POSTLIST_BODY, NOW);
    expect(page.posts[0].publishedOn).toBe('2026-09-07');
    expect(page.posts[0].commentCount).toBe(423);
    expect(page.posts[0].searchable).toBe(true);
    expect(page.posts[0].blocked).toBe(false);
  });

  it('빈 댓글 칸은 0 이 아니라 null 이다', () => {
    const page = parsePostListPage(POSTLIST_BODY, NOW);
    const blank = page.posts.find((post) => post.commentCount === null);
    expect(blank).toBeUndefined(); // 이 픽스처는 전부 댓글 수가 있다
    const body = JSON.stringify({ postList: [{ logNo: '1', title: 'a', addDate: '2026. 9. 1.', commentCount: '' }] });
    expect(parsePostListPage(body, NOW).posts[0].commentCount).toBeNull();
  });

  it('망가진 응답은 빈 목록으로 돌려준다 — 던지지 않는다', () => {
    const page = parsePostListPage('<html>로그인이 필요합니다</html>', NOW);
    expect(page.posts).toEqual([]);
    expect(page.ok).toBe(false);
  });

  it("네이버 장애 응답을 '글 0개'로 읽지 않는다", () => {
    // 실측(2026-09-10 bakas): 목록 창구가 이 봉투를 돌려줄 때가 있다. 빈 목록으로 삼키면 화면이 거짓말을 한다.
    const outage = '{"resultCode":"E","resultMessage":"일시적으로 목록보기 기능에 장애가 발생하였습니다."}';
    const page = parsePostListPage(outage, NOW);
    expect(page.ok).toBe(false);
    expect(page.message).toContain('장애');
    expect(page.posts).toEqual([]);
    expect(page.totalCount).toBeNull();
  });

  it('정상 응답은 ok 로 표시한다', () => {
    expect(parsePostListPage(POSTLIST_BODY, NOW).ok).toBe(true);
  });

  it('시각만 오는 오늘 글은 오늘 날짜로 읽는다', () => {
    expect(parsePostDate('2026. 9. 7.')).toBe('2026-09-07');
    expect(parsePostDate('2026. 12. 25.')).toBe('2026-12-25');
    expect(parsePostDate('14:22', NOW)).toBe('2026-09-10');
    expect(parsePostDate('알 수 없음', NOW)).toBeNull();
  });
});

describe('활동 사실', () => {
  const post = (publishedOn: string | null, extra: Partial<BlogPostRow> = {}): BlogPostRow => ({
    logNo: publishedOn ?? 'x', title: 't', publishedOn, categoryNo: '1', commentCount: 0,
    searchable: true, blocked: false, ...extra,
  });

  it('최근 30·90일 글 수와 발행 간격 중앙값을 센다', () => {
    const activity = summarizeActivity([
      post('2026-09-09'), post('2026-09-07'), post('2026-09-01'),
      post('2026-07-15'), post('2025-01-02'),
    ], NOW);
    expect(activity.totalPosts).toBe(5);
    expect(activity.recent30).toBe(3);
    expect(activity.recent90).toBe(4);
    expect(activity.oldestPostOn).toBe('2025-01-02');
    expect(activity.newestPostOn).toBe('2026-09-09');
    expect(activity.medianGapDays).toBe(27); // 간격 2·6·48·559 의 중앙값 = (6+48)/2
  });

  it('검색 허용·차단 글을 따로 센다', () => {
    const activity = summarizeActivity([
      post('2026-09-09'), post('2026-09-08', { searchable: false }), post('2026-09-07', { blocked: true }),
    ], NOW);
    expect(activity.searchableCount).toBe(2);
    expect(activity.blockedCount).toBe(1);
  });

  it('날짜를 못 읽은 글은 기간 계산에서 빼되 총 글 수에는 남긴다', () => {
    const activity = summarizeActivity([post('2026-09-09'), post(null)], NOW);
    expect(activity.totalPosts).toBe(2);
    expect(activity.recent30).toBe(1);
    expect(activity.medianGapDays).toBeNull();
  });

  it('글이 없으면 기간 값은 null 이다', () => {
    const activity = summarizeActivity([], NOW);
    expect(activity.oldestPostOn).toBeNull();
    expect(activity.monthsRunning).toBeNull();
    expect(activity.medianGapDays).toBeNull();
  });

  it('실제 픽스처 30개로 돌려도 값이 나온다', () => {
    const activity = summarizeActivity(parsePostListPage(POSTLIST_BODY, NOW).posts, NOW);
    expect(activity.totalPosts).toBe(30);
    expect(activity.searchableCount).toBe(30);
    expect(activity.blockedCount).toBe(0);
    expect(activity.newestPostOn).toBe('2026-09-07');
    expect(activity.medianGapDays).toBeGreaterThan(0);
  });
});

describe('블로그 아이디 뽑기', () => {
  it('여러 모양의 주소에서 아이디만 뽑는다', () => {
    expect(extractBlogId('https://blog.naver.com/blogpeople')).toBe('blogpeople');
    expect(extractBlogId('https://m.blog.naver.com/blogpeople/224403581125')).toBe('blogpeople');
    expect(extractBlogId('https://blog.naver.com/PostView.naver?blogId=blogpeople&logNo=1')).toBe('blogpeople');
    expect(extractBlogId('blogpeople')).toBe('blogpeople');
    expect(extractBlogId('https://example.com/글')).toBeNull();
    expect(extractBlogId('')).toBeNull();
  });
});

describe('창구를 실제로 실행한다', () => {
  it('블로그 사실을 모바일 화면에서 받아 온다', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'm.blog.naver.com/blogpeople': { body: MBLOG_HTML } });
    const snapshot = await fetchBlogSnapshot('blogpeople', fetchImpl);
    expect(snapshot?.todayVisitors).toBe(1217);
    expect(calls[0]).toContain('m.blog.naver.com/blogpeople');
  });

  it('화면이 안 열리면 null 이다', async () => {
    const { fetchImpl } = fakeFetch({ 'm.blog.naver.com/nobody': { status: 404 } });
    expect(await fetchBlogSnapshot('nobody', fetchImpl)).toBeNull();
  });

  it('원하는 개수만큼만 받고 멈춘다 — 1,336개 블로그에서 50개만', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'PostTitleListAsync': { body: POSTLIST_BODY } });
    const swept = await sweepPosts('blogpeople', fetchImpl, { limit: 50, sleepImpl: async () => {} }, NOW);
    expect(swept.posts).toHaveLength(50);
    expect(swept.totalCount).toBe(1336);
    // 1·2 페이지 + 개설일용 마지막 페이지 한 장 = 3회. 45회가 아니다.
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('currentPage=45');
  });

  it('개설일은 마지막 페이지에서 가져온다', async () => {
    const oldBody = JSON.stringify({
      postList: [{ logNo: '1', title: '%EC%B2%AB%EA%B8%80', addDate: '2010. 3. 24.', searchYn: 'true' }],
      totalCount: '1336', countPerPage: '30', blog: { blogNo: '46400079' },
    });
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      const body = url.includes('currentPage=45') ? oldBody : POSTLIST_BODY;
      return { ok: true, status: 200, text: async () => body };
    };
    const swept = await sweepPosts('blogpeople', fetchImpl, { limit: 30, sleepImpl: async () => {} }, NOW);
    expect(swept.oldest?.publishedOn).toBe('2010-03-24');
    expect(swept.posts).toHaveLength(30);
  });

  it('첫 장을 못 읽으면 더 받지 않고 못 읽었다고 알린다', async () => {
    const outage = '{"resultCode":"E","resultMessage":"일시적으로 목록보기 기능에 장애가 발생하였습니다."}';
    const { fetchImpl, calls } = fakeFetch({ 'PostTitleListAsync': { body: outage } });
    const swept = await sweepPosts('bakas', fetchImpl, { limit: 50, sleepImpl: async () => {} }, NOW);
    expect(swept.ok).toBe(false);
    expect(swept.message).toContain('장애');
    expect(swept.posts).toEqual([]);
    expect(calls).toHaveLength(1); // 헛되이 45장을 더 받지 않는다
  });

  it('인플루언서 판별 — 200 이면 맞고 404 면 아니고 그 밖은 모른다', async () => {
    const yes = fakeFetch({ 'in.naver.com/bakas': { status: 200 } });
    expect(await probeInfluencer('bakas', yes.fetchImpl)).toBe(true);
    const no = fakeFetch({ 'in.naver.com/blogpeople': { status: 404 } });
    expect(await probeInfluencer('blogpeople', no.fetchImpl)).toBe(false);
    const maybe = fakeFetch({ 'in.naver.com/x': { status: 500 } });
    expect(await probeInfluencer('x', maybe.fetchImpl)).toBeNull();
    const broken: FetchLike = async () => { throw new Error('네트워크 끊김'); };
    expect(await probeInfluencer('x', broken)).toBeNull();
  });
});
