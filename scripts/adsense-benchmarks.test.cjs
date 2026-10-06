// 애드센스 고수 벤치마크 수집 · 묶기(2026-10-07). 홈판 벤치마크와 같은 틀, 출처는 티스토리 · 워드프레스.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./adsense-benchmarks-core.cjs');

const NOW = '2026-10-07T03:00:00.000Z';
const src = (id, host, over = {}) => ({ id, name: id + ' 블로그', url: `https://${host}`, feedUrl: `https://${host}/rss`, platform: 'tistory', category: '정부지원금·복지', grade: 'S', score: 100, weekPosts: 5, adsense: true, ...over });
const SOURCES = [src('a', 'a.tistory.com'), src('b', 'b.tistory.com', { grade: 'A' }), src('c', 'c.com', { platform: 'wordpress', category: '금융·재테크' })];

test('등록된 도메인 · https 만 받는다(허용목록 밖 · http · 포트 · 계정 차단)', () => {
  const allow = core.buildAllowlist(SOURCES);
  assert.equal(core.assertFeedUrl('https://a.tistory.com/rss', allow).hostname, 'a.tistory.com');
  assert.equal(core.assertFeedUrl('https://www.c.com/feed', allow).hostname, 'www.c.com', 'www 붙은 같은 도메인은 같은 출처');
  for (const bad of ['http://a.tistory.com/rss', 'https://evil.com/rss', 'https://a.tistory.com:8443/rss', 'https://u:p@a.tistory.com/rss', 'https://x.tistory.com/rss']) {
    assert.throws(() => core.assertFeedUrl(bad, allow), /Blocked/, bad);
  }
});

const rss = (items) => `<?xml version="1.0"?><rss><channel><title>채널</title>${items.map((i) => `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${i.d}</pubDate><description><![CDATA[<p>본문 ${i.t}</p>]]></description></item>`).join('')}</channel></rss>`;
const atom = (items) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>아톰</title>${items.map((i) => `<entry><title>${i.t}</title><link rel="alternate" href="${i.l}"/><published>${i.d}</published></entry>`).join('')}</feed>`;

test('RSS · Atom 을 읽고 그 블로그 도메인 밖 링크는 버린다', () => {
  const r = core.parseFeed(rss([
    { t: '청년도약계좌 해지 조건과 불이익', l: 'https://a.tistory.com/123', d: 'Tue, 6 Oct 2026 10:00:00 +0900' },
    { t: '광고 글', l: 'https://spam.example/1', d: 'Tue, 6 Oct 2026 10:00:00 +0900' },
  ]), SOURCES[0], NOW);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, 'https://a.tistory.com/123');
  assert.equal(r.posts[0].publishedAt, '2026-10-06T01:00:00.000Z');
  const a = core.parseFeed(atom([{ t: '근로장려금 지급일 확인', l: 'https://www.c.com/geunro', d: '2026-10-05T09:00:00Z' }]), SOURCES[2], NOW);
  assert.equal(a.posts.length, 1);
  assert.equal(a.posts[0].sourceId, 'c');
});

const post = (sourceId, title, url, publishedAt = '2026-10-06T01:00:00.000Z') => ({ sourceId, title, url, publishedAt, capturedAt: NOW });

test('두 블로그가 같은 소재를 다루면 한 카드 ★ · 공통어만 겹치면 묶지 않는다 · 7일 지난 글은 뺀다', () => {
  const posts = [
    post('a', '청년도약계좌 중도해지 조건 총정리 2026', 'https://a.tistory.com/1'),
    post('b', '청년도약계좌 중도해지 불이익 얼마나', 'https://b.tistory.com/9'),
    post('a', '2026 근로장려금 신청 방법 총정리', 'https://a.tistory.com/2'),
    post('c', '2026 에너지바우처 신청 방법 총정리', 'https://www.c.com/3'),
    post('c', '청년도약계좌 중도해지 예전 글', 'https://www.c.com/old', '2026-09-20T01:00:00.000Z'),
  ];
  const board = core.buildBoard([{ id: 'a', status: 'ok', posts: posts.filter((p) => p.sourceId === 'a') }, { id: 'b', status: 'ok', posts: posts.filter((p) => p.sourceId === 'b') }, { id: 'c', status: 'ok', posts: posts.filter((p) => p.sourceId === 'c') }], SOURCES, NOW);
  const youth = board.candidates.find((c) => c.title.includes('청년도약계좌'));
  assert.equal(youth.recommended, false, '두 블로그는 아직 ★ 아님(3곳부터)');
  assert.equal(youth.sources.length, 2, '7일 지난 글은 묶음에 안 들어간다');
  const separate = board.candidates.filter((c) => /근로장려금|에너지바우처/.test(c.title));
  assert.equal(separate.length, 2, "'신청 방법 총정리 2026'만 겹친 두 글은 다른 소재");
  assert.ok(separate.every((c) => !c.recommended));
  assert.equal(board.candidates[0].title.includes('청년도약계좌'), true, '여러 블로그 소재가 앞에 선다');
  assert.ok(!JSON.stringify(board).includes('ca-pub'));
});

test('카드 상한 · 고수 제목 모양 통계 · 수집 실패 출처는 판에 상태로만', () => {
  const many = Array.from({ length: 30 }, (_, i) => post('a', `서로다른소재${i} 제목${i} 키워드${i}`, `https://a.tistory.com/${i}`));
  const board = core.buildBoard([{ id: 'a', status: 'ok', posts: many }, { id: 'b', status: 'error', error: 'HTTP 403', posts: [] }], SOURCES, NOW, { maxCards: 10 });
  assert.equal(board.candidates.length, 10);
  assert.equal(board.okCount, 1);
  assert.equal(board.sources.find((s) => s.id === 'b').status, 'error');
  const shape = core.titleShape([post('a', '2026 청년도약계좌 해지하면 얼마 손해일까?', 'u1'), post('a', '근로장려금 지급일 [정리]', 'u2')]);
  assert.equal(shape.count, 2);
  assert.equal(shape.yearPct, 50);
  assert.equal(shape.questionPct, 50);
  assert.equal(shape.bracketPct, 50);
});

test('★ 는 블로그 3곳부터 · 동사 꼴 · 범용 명사만 겹친 글은 묶지 않는다', () => {
  const three = ['a', 'b', 'c'].map((id, i) => post(id, '누리호 5차 발사일정 생중계 시간', `https://${id === 'c' ? 'www.c.com' : id + '.tistory.com'}/n${i}`));
  const loose = [post('a', '장애인연금 부부도 받을 수 있을까', 'https://a.tistory.com/x1'), post('b', '국가장학금 누구나 받을 수 있을까', 'https://b.tistory.com/x2'),
    post('a', '장판 종류 우리 집에 맞는 선택법', 'https://a.tistory.com/x3'), post('b', 'TV 인치별 사이즈 우리 집에 맞는 크기', 'https://b.tistory.com/x4')];
  const all = [...three, ...loose];
  const board = core.buildBoard(['a', 'b', 'c'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  const nuri = board.candidates.find((c) => c.title.includes('누리호'));
  assert.equal(nuri.recommended, true);
  assert.equal(nuri.sources.length, 3);
  for (const word of ['장애인연금', '국가장학금', '장판', 'TV']) assert.equal(board.candidates.filter((c) => c.sources.some((s) => s.title.includes(word))).length, 1, word);
  assert.equal(board.candidates.find((c) => c.title.includes('장애인연금')).sources.length, 1, "'받을 수 있을까'만 겹친 글은 따로");
  assert.equal(board.candidates.find((c) => c.title.includes('장판')).sources.length, 1, "'우리 집에 맞는'만 겹친 글은 따로");
});

test('서비스 공통어(고객센터 · 전화번호 · 설정)만 겹친 다른 회사 · 기능은 묶지 않는다', () => {
  const all = [post('a', '배달의민족 고객센터 전화번호 상담원 연결 총정리', 'https://a.tistory.com/y1'), post('b', '하나카드 고객센터 전화번호 상담원 연결 방법', 'https://b.tistory.com/y2'),
    post('a', '윈도우 11 업그레이드 조직 설정으로 차단될 때', 'https://a.tistory.com/y3'), post('b', '윈도우 11 화면만 끄는 설정', 'https://b.tistory.com/y4')];
  const board = core.buildBoard(['a', 'b'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  assert.equal(board.candidates.length, 4, board.candidates.map((c) => c.sources.length).join(','));
});

test('방화벽이 머리글을 거르면(415) 흔한 형식 머리글로 한 번 더 묻는다', async () => {
  const { collectAll } = require('./adsense-benchmarks.cjs');
  const asked = [];
  const fetcher = async (url, allow, opts) => {
    asked.push(opts && opts.headers ? opts.headers.Accept : 'feed');
    if (!opts) throw new Error('HTTP 415');
    return '<rss><channel><title>t</title><item><title>워드프레스 글 하나</title><link>https://www.c.com/p1</link><pubDate>Tue, 6 Oct 2026 10:00:00 +0900</pubDate></item></channel></rss>';
  };
  const results = await collectAll([SOURCES[2]], NOW, { concurrency: 1, fetcher });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].posts.length, 1);
  assert.deepEqual(asked, ['feed', '*/*']);
});
