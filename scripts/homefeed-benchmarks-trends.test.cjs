const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./homefeed-benchmarks-core.cjs');
const { buildTrends, titleStats, writingGuide } = require('./homefeed-benchmarks-trends.cjs');

/*
 * 홈판 흐름 요약(2026-10-06) — 사장님 "홈판에 뜬 것들과 고수 블로거들을 어떻게 썼고 우리는 어떻게 써야 하는지 ·
 * 오늘의 자주 뜨는 홈판 주제". 수집기가 공개 판(trends)에 싣고 사이트 · 앱이 그린다.
 */
const now = '2026-10-06T09:00:00.000Z';
const hoursAgo = (h) => new Date(Date.parse(now) - h * 3600000).toISOString();
const post = (id, title, extra = {}) => ({ sourceId: id, platform: 'naver-blog', name: `블로그${id}`, topic: null, title, url: `https://blog.naver.com/${id}/${title.length}`, publishedAt: hoursAgo(2), capturedAt: now, ...extra });

test('제목 모양을 센다 — 길이 분위 · 따옴표 · 말줄임 · 물음표 · 숫자 · 구어 어미', () => {
  const stats = titleStats([
    '"이건 몰랐다" 타이어 공기압 겨울에 떨어지는 이유',
    '엔진오일 5천km마다 갈아야 할까?',
    '전기차 보조금 끝나기 전에… 지금 사야 하나요',
    '세차 이렇게 하면 망합니다',
  ]);
  assert.equal(stats.count, 4);
  assert.equal(stats.quoteStart, 25);
  assert.equal(stats.ellipsis, 25);
  assert.equal(stats.question, 25);
  assert.equal(stats.number, 25);
  assert.equal(stats.colloquial, 25);
  assert.ok(stats.length.p25 <= stats.length.median && stats.length.median <= stats.length.p75);
});

test('"우리는 이렇게" 는 센 비율을 옮긴다 — 지어낸 효과 · 확률이 없다', () => {
  const guide = writingGuide({ count: 100, length: { median: 40, p25: 34, p75: 47 }, quoteStart: 39, ellipsis: 27, question: 27, exclaim: 10, number: 58, colloquial: 4 });
  const text = guide.join('\n');
  assert.match(text, /34~47자/);
  assert.match(text, /39%/);
  assert.match(text, /4%뿐/);
  assert.doesNotMatch(text, /확률|노출 보장|조회수가 오른다/);
  assert.deepEqual(writingGuide({ count: 0 }), []);
});

test('최근 24시간 글로 분야별 글 · 채널 수와 여러 채널이 다룬 소재를 센다', () => {
  const posts = [
    post('a', '현대 투싼 신차 실물 공개'), post('b', '투싼 2027 신차 실내 바뀐 점'), post('c', '쏘렌토 하이브리드 계약 취소'),
    post('d', '나는솔로 30기 영수 근황', { topic: '방송 이슈' }),
    post('e', '오래된 글', { publishedAt: hoursAgo(40) }),
  ];
  const candidates = [
    { keyword: '투싼 신형', title: '현대 투싼 신차 실물 공개', category: '자동차·IT', sources: [{ id: 'a' }, { id: 'b' }], homeTitles: ['투싼 이거 보고 계약 미뤘다'] },
    { keyword: '나는솔로 영수', title: '나는솔로 30기 영수 근황', category: '문화·연예', sources: [{ id: 'd' }], homeTitles: [] },
  ];
  const trends = buildTrends(posts, candidates, now, core.category);
  assert.equal(trends.posts, 4, '40시간 전 글은 빠진다');
  assert.equal(trends.categories[0].category, '자동차·IT');
  assert.equal(trends.categories[0].channels, 3);
  assert.deepEqual(trends.categories[0].stories.map((s) => s.keyword), ['투싼 신형']);
  assert.equal(trends.topStories.length, 1, '채널 1곳 소재는 "여러 채널"이 아니다');
  assert.equal(trends.topStories[0].homeTitle, '투싼 이거 보고 계약 미뤘다');
  assert.equal(trends.writing.stats.count, 4);
  assert.ok(trends.writing.guide.length >= 3);
});

test('예시 제목은 서로 다른 블로그에서 — 한 블로그 도배 금지', () => {
  const posts = [post('a', '투싼 하나'), post('a', '투싼 둘 신형'), post('a', '투싼 셋 실물'), post('b', '투싼 넷 계약')];
  const trends = buildTrends(posts, [], now, core.category);
  const names = trends.categories[0].examples.map((e) => e.name);
  assert.deepEqual(names, ['블로그a', '블로그b']);
});

test('판에 trends 가 실린다', () => {
  const results = [{ id: 'a', status: 'ok', posts: [post('a', '현대 투싼 신형 실물 공개', { summary: '요약' })] }];
  const payload = core.buildPayload(results, now, null, []);
  assert.equal(payload.trends.posts, 1);
  assert.equal(payload.trends.windowHours, 24);
});
