'use strict';
// 2026-11-15 — 오늘의 글감 뉴스 수집이 실패해도 [] 로 삼켜 "기사 0 → 근거 카드 0" 만 남았다(실패 6회 연속).
// 여기서 잠그는 것: 실패한 호출은 상태·본문이 기록에 남고, 한도(quota)면 나머지 호출을 멈추며, 비밀값은 기록에 안 나온다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createNewsFetcher, classifyFailure } = require('./topic-briefs-news.cjs');

const SECRET = 'SECRET-VALUE-123';
const KEY_ID = 'KEY-ID-456';
const headers = { 'X-Naver-Client-Id': KEY_ID, 'X-Naver-Client-Secret': SECRET };

const res = (status, body, extraHeaders = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 429 ? 'Too Many Requests' : '',
  headers: { forEach: (cb) => Object.entries(extraHeaders).forEach(([k, v]) => cb(v, k)) },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});
const DAILY = { error: { errorCode: 429, message: '일별 사용량 한도가 초과하였습니다.' } };

function setup(responses, options = {}) {
  const logs = [];
  const sleeps = [];
  const calls = [];
  let i = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  const fetcher = createNewsFetcher({
    fetchFn, headers,
    sleep: async (ms) => { sleeps.push(ms); },
    log: (line) => logs.push(line),
    ...options,
  });
  return { fetcher, logs, sleeps, calls };
}

test('정상 응답은 기사를 돌려주고 실패로 세지 않는다', async () => {
  const { fetcher, logs } = setup([res(200, { items: [{ title: 'a' }, { title: 'b' }] })]);
  const items = await fetcher.newsItems('건강');
  assert.equal(items.length, 2);
  assert.equal(fetcher.failedCalls(), 0);
  assert.equal(fetcher.blocked(), null);
  assert.deepEqual(logs, []);
});

test('빈 기사(HTTP 200 · items [])는 실패가 아니라 빈 응답으로 센다', async () => {
  const { fetcher } = setup([res(200, { items: [] })]);
  assert.deepEqual(await fetcher.newsItems('건강'), []);
  assert.equal(fetcher.failedCalls(), 0);
  assert.match(fetcher.summaryLine(), /빈 응답 1/);
});

test('HTTP 200 인데 items 가 없거나 JSON 이 아니면 실패(본문 형식 이상)로 기록한다', async () => {
  const { fetcher, logs } = setup([res(200, '<html>점검 중</html>')]);
  assert.deepEqual(await fetcher.newsItems('건강'), []);
  assert.equal(fetcher.failedCalls(), 1);
  assert.ok(logs.some((l) => /본문 형식 이상/.test(l) && /점검 중/.test(l)), logs.join('\n'));
});

test('429 + 일별 한도 문구는 재시도 없이 멈춘다 — 상태·본문이 기록에 남고 나머지 호출은 나가지 않는다', async () => {
  const { fetcher, logs, calls, sleeps } = setup([res(429, DAILY, { 'retry-after': '3600' })]);
  assert.deepEqual(await fetcher.newsItems('건강'), []);
  assert.equal(calls.length, 1, '한도는 재시도해도 풀리지 않는다');
  assert.deepEqual(sleeps, []);
  assert.equal(fetcher.blocked().kind, 'quota');
  const text = logs.join('\n');
  assert.match(text, /HTTP 429/);
  assert.match(text, /일별 사용량 한도가 초과하였습니다/);
  assert.match(text, /retry-after=3600/);
  assert.deepEqual(await fetcher.newsItems('경제'), []);
  assert.equal(calls.length, 1, '멈춘 뒤에는 호출하지 않는다');
});

test('429 + 속도 제한 문구는 간격을 두고 다시 시도해 성공하면 기사를 돌려준다', async () => {
  const rate = res(429, { errorMessage: 'Rate limit exceeded. (속도 제한을 초과했습니다.)', errorCode: '012' });
  const { fetcher, calls, sleeps } = setup([rate, res(200, { items: [{ title: 'a' }] })]);
  const items = await fetcher.newsItems('건강');
  assert.equal(items.length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [1500]);
  assert.equal(fetcher.failedCalls(), 0);
  assert.match(fetcher.summaryLine(), /재시도 1/);
});

test('5xx 는 두 번까지 다시 시도하고, 끝내 실패하면 호출 한 건으로 센다', async () => {
  const { fetcher, calls, sleeps } = setup([res(503, 'Service Unavailable')]);
  assert.deepEqual(await fetcher.newsItems('건강'), []);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [1500, 4000]);
  assert.equal(fetcher.failedCalls(), 1);
  assert.equal(fetcher.blocked(), null, '한 건 실패로 멈추지는 않는다');
});

test('네트워크 예외도 사유가 기록에 남고 다시 시도한다', async () => {
  const { fetcher, logs, calls } = setup([new Error('fetch failed: ECONNRESET'), res(200, { items: [{ title: 'a' }] })]);
  const items = await fetcher.newsItems('건강');
  assert.equal(items.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(fetcher.failedCalls(), 0);
  assert.ok(logs.some((l) => /ECONNRESET/.test(l)), '재시도로 살아도 첫 실패 사유는 남긴다');
});

test('인증 오류(401·403)는 재시도 없이 멈춘다', async () => {
  const { fetcher, calls } = setup([res(401, { errorMessage: 'Not Authorized', errorCode: '024' })]);
  await fetcher.newsItems('건강');
  assert.equal(calls.length, 1);
  assert.equal(fetcher.blocked().kind, 'auth');
});

test('연달아 5건 실패하면 멈춘다 — 성공 한 건이 끼면 세기를 처음부터 한다', async () => {
  const fail = res(400, { errorMessage: 'bad request', errorCode: 'SE01' });
  const { fetcher } = setup([fail, fail, fail, fail, res(200, { items: [{ title: 'a' }] }), fail, fail, fail, fail, fail]);
  for (let n = 0; n < 9; n += 1) await fetcher.newsItems(`q${n}`);
  assert.equal(fetcher.blocked(), null, '성공이 끼어 4연속에서 끊겼다');
  await fetcher.newsItems('q9');
  assert.equal(fetcher.blocked().kind, 'repeated');
});

test('같은 실패는 앞 3건만 자세히 적는다 — 기록이 71줄로 불어나지 않는다', async () => {
  const fail = res(400, { errorMessage: 'bad request', errorCode: 'SE01' });
  const { fetcher, logs } = setup([fail]);
  for (let n = 0; n < 4; n += 1) await fetcher.newsItems(`q${n}`);
  assert.equal(logs.filter((l) => /HTTP 400/.test(l)).length, 3, logs.join('\n'));
  assert.equal(fetcher.failedCalls(), 4);
});

test('기록에 키·시크릿이 나오지 않는다', async () => {
  const { fetcher, logs } = setup([res(429, DAILY), res(401, 'nope')]);
  await fetcher.newsItems('건강');
  const all = [...logs, fetcher.summaryLine(), fetcher.diagnosis()].join('\n');
  assert.ok(!all.includes(SECRET) && !all.includes(KEY_ID), all);
});

test('요청에는 인증 헤더를 그대로 실어 보낸다', async () => {
  const { fetcher, calls } = setup([res(200, { items: [] })]);
  await fetcher.newsItems('건강 뉴스');
  assert.equal(calls[0].init.headers['X-Naver-Client-Secret'], SECRET);
  assert.match(calls[0].url, /news\.json\?query=%EA%B1%B4%EA%B0%95%20%EB%89%B4%EC%8A%A4&display=50&sort=date$/);
});

test('진단 문장 — 전부 한도면 상태와 본문, 전부 빈 응답이면 그렇게, 호출이 없으면 빈 글', async () => {
  const quota = setup([res(429, DAILY)]);
  await quota.fetcher.newsItems('건강');
  assert.match(quota.fetcher.diagnosis(), /HTTP 429/);
  assert.match(quota.fetcher.diagnosis(), /일별 사용량 한도/);

  const empty = setup([res(200, { items: [] })]);
  await empty.fetcher.newsItems('건강');
  assert.match(empty.fetcher.diagnosis(), /기사가 0건/);

  assert.equal(setup([res(200, { items: [] })]).fetcher.diagnosis(), '');
});

test('classifyFailure — 한도·속도·인증·서버·기타를 가른다', () => {
  assert.equal(classifyFailure(429, JSON.stringify(DAILY)).kind, 'quota');
  assert.equal(classifyFailure(429, 'Quota exceeded errorCode 010').kind, 'quota');
  assert.equal(classifyFailure(429, 'Rate limit exceeded errorCode 012').kind, 'rate');
  assert.equal(classifyFailure(429, '').kind, 'rate', '문구가 없는 429 는 한 번 다시 시도해 본다');
  assert.equal(classifyFailure(401, '').kind, 'auth');
  assert.equal(classifyFailure(403, '').kind, 'auth');
  assert.equal(classifyFailure(502, '').kind, 'server');
  assert.equal(classifyFailure(400, '').kind, 'client');
  assert.equal(classifyFailure(404, '').kind, 'client');
});

test('스크립트가 실패를 다시 삼키지 않는다 — 수집기를 쓰고, 조용한 catch 가 없다', () => {
  const script = fs.readFileSync(path.join(__dirname, 'topic-briefs.js'), 'utf8');
  assert.match(script, /createNewsFetcher/);
  assert.doesNotMatch(script, /catch\s*\{\s*return \[\];\s*\}/);
  assert.doesNotMatch(script, /if \(!res\.ok\) return \[\];/);
});
