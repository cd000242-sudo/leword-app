const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./homefeed-benchmarks-core.cjs');
const now = '2026-09-28T14:00:00.000Z';
const source = { id: 'sample', platform: 'naver-blog', name: '표본', url: 'https://blog.naver.com/sample' };
const post = (extra = {}) => ({ ...source, sourceId: source.id, title: '서울 장기전세 만기 확인', url: 'https://blog.naver.com/sample/123', summary: '서울 장기전세 20년 만기를 앞두고 확인할 내용입니다.', publishedAt: now, capturedAt: now, eventAt: null, metrics: { views: null, likes: null, comments: null }, ...extra });

test('only exact public platform HTTPS hosts and safe paths are fetched', () => {
  for (const url of ['http://rss.blog.naver.com/a.xml', 'https://127.0.0.1/a', 'https://rss.blog.naver.com.evil.test/a', 'https://user:pass@rss.blog.naver.com/a.xml', 'https://rss.blog.naver.com:8443/a.xml', 'https://www.youtube.com/redirect?q=http://localhost']) assert.throws(() => core.assertFetchUrl(url));
  assert.equal(core.assertFetchUrl('https://rss.blog.naver.com/sample.xml').hostname, 'rss.blog.naver.com');
});
test('redirect validation stops before requesting an outside host', async () => {
  let count = 0;
  await assert.rejects(core.fetchText('https://rss.blog.naver.com/sample.xml', { fetchImpl: async () => { count++; return new Response('', { status: 302, headers: { location: 'https://localhost/private' } }); } }));
  assert.equal(count, 1);
});
test('untrusted HTML is plain text and JSON safe for embedding', () => {
  assert.equal(core.plainText('<script>alert(1)</script><b>제목</b>'), '제목');
  assert.ok(!core.serialize({ value: '</script><script>alert(1)</script>' }).includes('<'));
});
test('invalid and future publication dates remain unknown', () => {
  assert.equal(core.validDate('nonsense', now), null);
  assert.equal(core.validDate('2030-01-01', now), null);
  const candidate = core.buildCandidates([post({ publishedAt: null })], now)[0];
  assert.equal(candidate.publishedAt, null);
  assert.equal(candidate.status, 'verify');
  assert.equal(candidate.recommended, false);
});
test('first observations never manufacture reaction growth', () => {
  assert.equal(core.reactionGrowth(post({ metrics: { views: 900 } }), null), null);
  assert.equal(core.reactionGrowth(post({ metrics: { views: 900 } }), post({ capturedAt: now, metrics: { views: 200 } })), null);
});
test('same original syndicated by channels is one discovery, not independent evidence', () => {
  const result = core.buildCandidates([post(), post({ sourceId: 'other', url: 'https://blog.naver.com/other/456' })], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].recommended, false);
  assert.ok(result[0].flags.includes('possible-syndication'));
});
test('old images reposted today do not become a current event', () => {
  const result = core.buildCandidates([post({ title: '241026 아이브 안유진 사진 모음' })], now)[0];
  assert.equal(result.status, 'stale');
  assert.equal(result.eventAt, null);
  assert.ok(result.flags.includes('recycled-material'));
});
/*
 * 2026-09-30 사장님: "벤치마킹을 그렇게 많이 줬는데 이거밖에 없다는 게 말이 안 되잖아".
 * 실측: 판 30장이 전부 채널 1곳짜리였다. '디올과 원영의 만남' 과 '디올원영 어떤데?' 처럼 같은 소재도
 * 조사(의)·붙여쓰기 때문에 겹치는 낱말 0으로 갈렸고, 블로그 RSS 엔 반응 수치가 없어 추천이 0이었다.
 */
const other = (id, title, extra = {}) => post({ sourceId: id, url: `https://blog.naver.com/${id}/9${id.length}1`, title, summary: `${title} 요약입니다.`, ...extra });
test('조사·붙여쓰기가 달라도 같은 소재는 한 묶음이다', () => {
  const result = core.buildCandidates([other('a', '디올과 원영의 만남 🎀'), other('bb', '🎀 디올원영 어떤데?')], now);
  assert.equal(result.length, 1);
  assert.equal(new Set(result[0].sources.map((s) => s.id)).size, 2);
});
test('날짜·인스타그램 같은 공통어만 겹치면 다른 소재다', () => {
  const result = core.buildCandidates([other('a', '260930 에스파 카리나 (katarinabluu) 인스타그램'), other('bb', '260930 아이브 레이 (reinyourheart) 인스타그램')], now);
  assert.equal(result.length, 2);
});
test('한 낱말만 겹치면 다른 소재다', () => {
  assert.equal(core.buildCandidates([other('a', '디올과 원영의 만남'), other('bb', '기다렸던 디올 현진 등장')], now).length, 2);
});
// 실채널 첫 실행(2026-09-30)에서 잘못 묶였던 세 쌍 — 나라 이름 · 질문 틀 · 숫자 든 말이 겹침으로 세였다.
test('나라 이름 · 질문 틀 · 숫자 든 말만 겹치면 다른 소재다', () => {
  const pairs = [
    ['“일본도 다낭도 아니었다” 추석 해외여행 1위, 중국 한국인들 몰린 곳', '[한국 v 중국] 배준호 역전골 ㄷㄷㄷㄷㄷ'],
    ['죽은 구교환 "72시간 뒤 다시 부활" 예매 1위 영화 부활남 원작과 뭐가 다를까', '최민식X한소희 ‘인턴’, 원작과 뭐가 다를까 한국판'],
    ['🚨윤남노가 2년 동안 서먹했던', '소녀시대 탈퇴 후 12년 만에 마린룩으로 냉면 무대 제시카 그동안 무슨 일이 있었나'],
  ];
  for (const [a, b] of pairs) assert.equal(core.buildCandidates([other('a', a), other('bb', b)], now).length, 2, `${a} / ${b}`);
});
test('채널 두 곳 이상이 이틀 안에 다룬 소재는 반응 수치가 없어도 추천이다', () => {
  const result = core.buildCandidates([other('a', '디올과 원영의 만남 🎀'), other('bb', '🎀 디올원영 어떤데?')], now)[0];
  assert.equal(result.recommended, true);
  assert.equal(result.status, 'review-now');
});
test('채널 한 곳뿐이면 추천이 아니다', () => {
  const result = core.buildCandidates([other('a', '디올과 원영의 만남 🎀')], now)[0];
  assert.equal(result.recommended, false);
  assert.equal(result.status, 'verify');
});
test('많은 채널이 다룬 소재가 앞에 선다', () => {
  const result = core.buildCandidates([
    other('a', '안세영 금메달 포상금 얼마'), other('bb', '안세영 금메달 포상금 공개'),
    other('ccc', '디올과 원영의 만남'), other('dddd', '디올원영 어떤데'), other('eeeee', '원영 디올 행사 사진'),
  ], now);
  assert.equal(result[0].title.includes('원영'), true);
  assert.equal(new Set(result[0].sources.map((s) => s.id)).size, 3);
});
test('30장 상한이 없다 — 최근 48시간 소재는 전부 싣는다', () => {
  const posts = Array.from({ length: 45 }, (_, i) => other(`s${i}`, `가나${i}다 라마${i}바 사아${i}자`));
  assert.equal(core.buildCandidates(posts, now).length, 45);
});
test('48시간이 지난 소재는 싣지 않는다', () => {
  assert.equal(core.buildCandidates([post({ publishedAt: '2026-09-25T10:00:00Z' })], now).length, 0);
});
test('old articles and sponsorship cannot receive a recommendation star', () => {
  assert.equal(core.buildCandidates([post({ publishedAt: '2026-06-13T10:00:00Z' })], now).length, 0);
  const result = core.buildCandidates([post({ summary: '업체로부터 제품을 무상 제공받았습니다.' })], now)[0];
  assert.equal(result.recommended, false);
  assert.ok(result.flags.includes('sponsored'));
});
test('RSS strips active text, does not invent missing dates, rejects foreign links', () => {
  const xml = '<rss><channel><title>표본</title><item><title>안전</title><link>https://blog.naver.com/sample/123</link><description><![CDATA[<b>본문</b><script>bad()</script>]]></description><pubDate>bad</pubDate></item><item><title>위험</title><link>https://evil.test/a</link></item></channel></rss>';
  const posts = core.parseRss(xml, source, now).posts;
  assert.equal(posts.length, 1);
  assert.equal(posts[0].publishedAt, null);
  assert.equal(posts[0].summary, '본문');
});
test('total failure retains last successful timestamp and marks stale', () => {
  const previous = { schemaVersion: 1, generatedAt: '2026-09-27T10:00:00Z', candidates: [{ id: 'saved' }], collectedPostCount: 20 };
  const payload = core.buildPayload([{ ...source, status: 'failed', posts: [], capturedAt: now }], now, previous);
  assert.equal(payload.status, 'stale');
  assert.equal(payload.generatedAt, previous.generatedAt);
  assert.equal(payload.candidates[0].id, 'saved');
  assert.equal(payload.attemptedAt, now);
});
// 2026-10-01 출처 188곳 → 48시간 카드가 1,600장을 넘었다. 판 파일 6MB · 화면은 한 번에 다 못 쓴다.
// 추천은 전부 싣고(앞에 선다) 나머지는 우선순위 순으로 채워 300장까지만 싣는다.
test('카드는 300장까지 — 추천이 먼저 들어간다', () => {
  const posts = Array.from({ length: 340 }, (_, i) => other(`s${i}`, `가나${i}다 라마${i}바 사아${i}자`));
  posts.push(other('x1', '디올과 원영의 만남 🎀'), other('x2', '🎀 디올원영 어떤데?'));
  const result = core.buildCandidates(posts, now);
  assert.equal(result.length, 300);
  assert.equal(result[0].recommended, true);
});
/*
 * 반응 상승(2026-10-01 사장님 "1번 2번 3번 전부"): 블로그 RSS 엔 반응 수치가 없어 증가를 못 쟀다.
 * 네이버 공감 창구(blog.like.naver.com, 여러 글 한 번에)로 매시 공감 수를 재 이전 수집과 비교한다.
 */
test('공감 창구 응답에서 글별 공감 합계를 뽑는다', () => {
  const json = { contents: [
    { contentsId: 'lovely0477_224426618920', reactions: [{ reactionType: 'like', count: 23 }, { reactionType: 'thanks', count: 2 }] },
    { contentsId: 'bad', reactions: 'x' },
  ] };
  const likes = core.parseLikes(json);
  assert.equal(likes.get('lovely0477_224426618920'), 25);
  assert.equal(likes.has('bad'), false);
  assert.equal(core.parseLikes(null).size, 0);
  assert.equal(core.likeContentsId('https://blog.naver.com/lovely0477/224426618920'), 'lovely0477_224426618920');
  assert.equal(core.likeContentsId('https://www.youtube.com/watch?v=abcdefghijk'), null);
});
test('공감이 이전 수집보다 5 이상 늘면 채널 한 곳이어도 추천이고, 출처에 증가가 남는다', () => {
  const earlier = '2026-09-28T13:00:00.000Z';
  const current = other('a', '디올과 원영의 만남 🎀', { metrics: { views: null, likes: 30, comments: null } });
  const previous = [{ url: current.url, platform: current.platform, capturedAt: earlier, metrics: { views: null, likes: 12, comments: null } }];
  const card = core.buildCandidates([current], now, previous)[0];
  assert.equal(card.recommended, true);
  assert.equal(card.metrics.reactionGrowth.likes.change, 18);
  assert.equal(card.sources[0].growth.likes.change, 18);
  assert.ok(card.why.some((w) => w.includes('공개 반응이 이전 수집보다 늘었습니다')));
});
test('공감이 조금만 늘면(5 미만) 추천이 아니다', () => {
  const current = other('a', '디올과 원영의 만남 🎀', { metrics: { views: null, likes: 14, comments: null } });
  const previous = [{ url: current.url, platform: current.platform, capturedAt: '2026-09-28T13:00:00.000Z', metrics: { views: null, likes: 12, comments: null } }];
  assert.equal(core.buildCandidates([current], now, previous)[0].recommended, false);
});
test('공감 붙이기 — 24시간 안 블로그 글만, 원본은 그대로, 실패해도 계속', async () => {
  const { withBlogLikes } = require('./homefeed-benchmarks.cjs');
  const fresh = post({ url: 'https://blog.naver.com/sample/111', publishedAt: '2026-09-28T12:00:00.000Z' });
  const old = post({ url: 'https://blog.naver.com/sample/222', publishedAt: '2026-09-26T12:00:00.000Z' });
  const broken = post({ url: 'https://blog.naver.com/sample/333', publishedAt: '2026-09-28T13:00:00.000Z' });
  const results = [{ id: 'sample', status: 'ok', posts: [fresh, old, broken] }];
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    if (url.includes('sample_333')) throw new Error('HTTP 500');
    return JSON.stringify({ contents: [{ contentsId: 'sample_111', reactions: [{ count: 7 }] }] });
  };
  const out = await withBlogLikes(results, now, fetcher);
  assert.equal(asked.length, 2, '48시간 전 글은 묻지 않는다');
  assert.equal(out[0].posts[0].metrics.likes, 7);
  assert.equal(out[0].posts[2].metrics.likes, null, '실패한 글은 빈 칸');
  assert.equal(results[0].posts[0].metrics.likes, null, '원본은 바꾸지 않는다');
});
/*
 * 출처 188곳 첫 실수집(2026-10-01)에서 일반어로 잘못 묶인 실례 — '그랜저'+'정신', '얼굴' 하나로 다른 글이 한 카드가 됐다.
 * 겹친 말 중 구체적인 말(사람 · 제품 · 작품 이름 등)이 하나는 있어야 같은 소재다. 일반어 · 숫자 단위 말은 구체어가 아니다.
 */
test('일반어로만 · 구체어 하나로만 겹치면 다른 소재다(188곳 실수집 오묶음)', () => {
  const pairs = [
    ['그랜저 계약 취소각? 정신 차리고 바뀐 디자인 BMW 알피나.', '"드디어 정신차렷나" 실물 공개에 그랜저 취소합니다'],
    ['공룡 얼굴 복원도 근황.jpg', '요즘 2030 여자들이 목숨건다는 동안 얼굴 포인트'],
    ['한채영 미모는 회춘했는데... 아쉬운 패션 스타일 근황', '순간 ‘지디인 줄’.. 살 붙고 확 달라진 연예인 공항패션'],
    ['전지현 맞아? 민낯→란제리룩 반전 생로랑 패션 스타일', '쌩얼로 등장... 레전드 찍은 오늘자 전지현 공항 패션'],
  ];
  for (const [a, b] of pairs) assert.equal(core.buildCandidates([other('a', a), other('bb', b)], now).length, 2, `${a} / ${b}`);
});
test('구체어가 둘 겹치면 일반어가 섞여도 같은 소재다', () => {
  const pairs = [
    ['전지현 생로랑 파리 패션쇼 착장 공개', '쌩얼로 등장... 전지현 생로랑 공항 패션'],
    ['왜 슬슬 기어나와... 제발 유행 안 됐으면 하는 2000년대 패션', '패션은 돌고 돈다지만... 제발 다시 유행 안했으면 하는 2000년대 룩'],
  ];
  for (const [a, b] of pairs) assert.equal(core.buildCandidates([other('a', a), other('bb', b)], now).length, 1, `${a} / ${b}`);
});

test('유튜브 RSS 는 404 · 500 이 섞여 온다(2026-10-01 실측: 같은 주소가 404 → 200 → 404) — 세 번까지 다시 받는다', async () => {
  const { collect } = require('./homefeed-benchmarks.cjs');
  const yt = { id: 'Behind_Master', platform: 'youtube', url: 'https://www.youtube.com/@Behind_Master' };
  const rss = '<feed><title>리스팩트 이진호</title><entry><title>영상 하나</title><link href="https://www.youtube.com/watch?v=abcdefghijk"/><published>2026-09-28T10:00:00+00:00</published></entry></feed>';
  let rssCalls = 0;
  const flaky = async (url) => {
    if (!url.includes('feeds/videos.xml')) return '<script>{"externalId":"UCbp1HhKUDmeI6enMXUxtgrg"}</script>';
    rssCalls += 1;
    if (rssCalls < 3) throw new Error('HTTP 404');
    return rss;
  };
  const ok = await collect(yt, now, flaky);
  assert.equal(ok.status, 'ok');
  assert.equal(rssCalls, 3);
  rssCalls = -10; // 계속 실패하면 세 번에서 멈추고 실패로 적는다
  const failed = await collect(yt, now, async (url) => { if (!url.includes('feeds/videos.xml')) return '{"externalId":"UCbp1HhKUDmeI6enMXUxtgrg"}'; rssCalls += 1; throw new Error('HTTP 404'); });
  assert.equal(failed.status, 'failed');
  assert.equal(rssCalls, -7);
});
