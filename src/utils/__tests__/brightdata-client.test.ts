import {
  buildBrightDataPayload,
  interpretBrightDataResponse,
  brightDataFetch,
  type BrightDataTransport,
} from '../brightdata-client';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

// ── 페이로드 ─────────────────────────────────────────────────────────
// data_format:'html' 이 빠지면 네이버는 파서가 없어 x-brd-error(502)로 빈 본문이
// 온다(HTTP 는 200이라 조용히 실패한다). 이 한 줄이 이 모듈의 존재 이유라
// 회귀로 못 박는다.
{
  const payload = JSON.parse(buildBrightDataPayload('https://search.naver.com/x', 'zone7'));
  assert('페이로드에 data_format=html 이 있다', payload.data_format === 'html', JSON.stringify(payload));
  assert('페이로드에 zone 이 실린다', payload.zone === 'zone7');
  assert('페이로드에 url 이 실린다', payload.url === 'https://search.naver.com/x');
  assert('format 은 raw', payload.format === 'raw');
}

// ── 응답 해석 ────────────────────────────────────────────────────────
{
  const good = interpretBrightDataResponse({
    body: 'x'.repeat(5000),
    headers: { 'x-brd-status-code': '200' },
  });
  assert('정상 응답은 ok', good.ok === true, JSON.stringify(good));

  // HTTP 200 인데 x-brd-error 가 실려오는 조용한 실패를 반드시 잡아야 한다.
  const brdErr = interpretBrightDataResponse({
    body: 'x'.repeat(5000),
    headers: { 'x-brd-error': 'parser_not_found', 'x-brd-status-code': '502' },
  });
  assert('x-brd-error 가 있으면 ok 가 아니다', brdErr.ok === false, JSON.stringify(brdErr));
  assert('x-brd-error 사유가 보존된다', String(brdErr.error).includes('parser_not_found'));

  // 본문이 너무 짧으면 차단 페이지/빈 응답이다.
  const tiny = interpretBrightDataResponse({ body: 'short', headers: {} });
  assert('본문이 짧으면 ok 가 아니다', tiny.ok === false, JSON.stringify(tiny));
}

// ── 쿼터 게이트 ──────────────────────────────────────────────────────
// 거버너가 거부하면 네트워크를 아예 건드리면 안 된다. 여기가 새면 무료 한도를
// 넘겨 유료로 조용히 빠져나간다.
void (async () => {
  {
    let called = 0;
    const transport: BrightDataTransport = async () => {
      called++;
      return { body: 'x'.repeat(5000), headers: {} };
    };
    const res = await brightDataFetch('https://example.test/a', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: false, granted: 0, reason: 'month cap reached' }),
      record: () => undefined,
    });
    assert('쿼터 거부 시 네트워크를 부르지 않는다', called === 0, `called=${called}`);
    assert('쿼터 거부는 quotaBlocked 로 표시된다', res.quotaBlocked === true, JSON.stringify(res));
    assert('쿼터 거부 시 ok 가 아니다', res.ok === false);
  }

  // 성공했을 때만 사용량을 확정한다.
  {
    let recorded = -1;
    const transport: BrightDataTransport = async () => ({ body: 'x'.repeat(5000), headers: {} });
    await brightDataFetch('https://example.test/b', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: (_f, n) => { recorded = n; },
    });
    assert('성공하면 사용량 1건을 확정한다', recorded === 1, `recorded=${recorded}`);
  }

  // 실패한 호출도 Bright Data 는 과금·차감한다. 안 세면 한도를 넘긴다.
  {
    let recorded = -1;
    const transport: BrightDataTransport = async () => ({
      body: '', headers: { 'x-brd-error': 'timeout' },
    });
    const res = await brightDataFetch('https://example.test/c', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: (_f, n) => { recorded = n; },
    });
    assert('실패해도 사용량은 확정된다', recorded === 1, `recorded=${recorded}`);
    assert('실패는 ok=false 로 온다', res.ok === false);
  }

  // ── 속도 제한 재시도 ───────────────────────────────────────────────
  // 2026-08-17 회차 전멸의 원인. 189건 중 96건이 "exceeded the allowed rate
  // limits" 로 죽어 보드가 0행이 됐다. 이건 한도 소진이 아니라 **초당 속도**라
  // 잠깐 쉬었다 다시 부르면 통과한다.
  {
    let calls = 0;
    const transport: BrightDataTransport = async () => {
      calls++;
      if (calls < 3) {
        return { body: '', headers: { 'x-brd-error': 'Your account exceeded the allowed rate limits. Reduce requests rate and try again' } };
      }
      return { body: 'x'.repeat(5000), headers: {} };
    };
    const res = await brightDataFetch('https://example.test/rate', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: () => undefined,
      retryDelayMs: 1,
    });
    assert('속도 제한이면 재시도해서 살려낸다', res.ok === true, JSON.stringify({ calls, res: res.error }));
    assert('재시도가 실제로 일어났다', calls === 3, `calls=${calls}`);
  }

  // BD 는 속도 제한 응답에 "You will not be charged" 라고 명시한다.
  // 그걸 차감하면 쓰지도 않은 크레딧이 장부에서 사라진다.
  {
    let recorded = 0;
    const transport: BrightDataTransport = async () => ({
      body: '', headers: { 'x-brd-error': 'Your account exceeded the allowed rate limits. You will not be charged for this request.' },
    });
    const res = await brightDataFetch('https://example.test/rate2', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: (_f, n) => { recorded += n; },
      retryDelayMs: 1,
      maxRetries: 2,
    });
    assert('속도 제한은 사용량에서 차감하지 않는다', recorded === 0, `recorded=${recorded}`);
    assert('재시도를 다 써도 실패는 실패다', res.ok === false);
    assert('속도 제한 사유가 보존된다', String(res.error).toLowerCase().includes('rate limit'), String(res.error));
  }

  // 속도 제한이 아닌 실패는 예전처럼 즉시 포기하고 차감한다(재시도해도 안 된다).
  {
    let calls = 0;
    let recorded = 0;
    const transport: BrightDataTransport = async () => {
      calls++;
      return { body: '', headers: { 'x-brd-error': 'parser_not_found' } };
    };
    await brightDataFetch('https://example.test/parse', 'golden', {
      token: 't',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: (_f, n) => { recorded += n; },
      retryDelayMs: 1,
    });
    assert('일반 실패는 재시도하지 않는다', calls === 1, `calls=${calls}`);
    assert('일반 실패는 사용량을 차감한다', recorded === 1, `recorded=${recorded}`);
  }

  // 토큰이 없으면 네트워크를 부르지 않고 즉시 실패해야 한다.
  {
    let called = 0;
    const transport: BrightDataTransport = async () => { called++; return { body: '', headers: {} }; };
    const res = await brightDataFetch('https://example.test/d', 'golden', {
      token: '',
      transport,
      reserve: () => ({ allowed: true, granted: 1 }),
      record: () => undefined,
    });
    assert('토큰이 없으면 네트워크를 안 부른다', called === 0, `called=${called}`);
    assert('토큰 없음은 ok=false', res.ok === false, JSON.stringify(res));
  }

  console.log(`\n[brightdata-client.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
})();
