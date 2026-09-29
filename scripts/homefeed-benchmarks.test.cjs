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
test('old articles and sponsorship cannot receive a recommendation star', () => {
  assert.equal(core.buildCandidates([post({ publishedAt: '2026-06-13T10:00:00Z' })], now)[0].status, 'stale');
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
