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
