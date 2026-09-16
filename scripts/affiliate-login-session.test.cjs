const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAffiliateLoginUrl, continueAuthenticatedPage } = require('./affiliate-login-session');

test('로그인 페이지를 URL로 구분한다', () => {
  assert.equal(isAffiliateLoginUrl('https://nid.naver.com/nidlogin.login'), true);
  assert.equal(isAffiliateLoginUrl('https://brandconnect.naver.com/123/affiliate/products'), false);
  assert.equal(isAffiliateLoginUrl('https://brandconnect.naver.com/?next=/login'), false);
  assert.equal(isAffiliateLoginUrl('https://business.toss.im/account/auth'), true);
  assert.equal(isAffiliateLoginUrl('https://sharelink.toss.im/login'), true);
});
test('브라우저 안의 인증 대기 조건도 실제 주소 변화로 판정한다', async () => {
  const vm = require('node:vm');
  const target = 'https://brandconnect.naver.com/123/affiliate/products';
  await continueAuthenticatedPage({
    url: () => 'https://nid.naver.com/nidlogin.login',
    waitForFunction: async (predicate, options) => {
      assert.equal(options.timeout, 5000);
      for (const [href, expected] of [
        ['https://nid.naver.com/nidlogin.login', false],
        ['https://business.toss.im/account/auth', false],
        ['https://sharelink.toss.im/login', false],
        [target, true],
      ]) {
        assert.equal(vm.runInNewContext(`(${predicate.toString()})()`, { URL, window: { location: { href } } }), expected);
      }
    },
    goto: async (url) => assert.equal(url, target),
  }, target, { timeoutMs: 5000 });
});
test('로그인 후 브라우저를 닫지 않고 같은 페이지에서 상품 수집을 이어간다', async () => {
  const calls = [];
  let url = 'https://nid.naver.com/nidlogin.login';
  const page = {
    url: () => url,
    waitForFunction: async () => { calls.push('login'); url = 'https://brandconnect.naver.com/'; },
    goto: async (target) => { calls.push(target); url = target; },
    close: async () => { throw new Error('인증 세션을 닫으면 안 됨'); },
  };
  await continueAuthenticatedPage(page, 'https://brandconnect.naver.com/123/affiliate/products');
  assert.deepEqual(calls, ['login', 'https://brandconnect.naver.com/123/affiliate/products']);
});
test('이미 인증된 페이지는 다시 로그인시키지 않는다', async () => {
  await continueAuthenticatedPage({ url: () => 'https://brandconnect.naver.com/123/affiliate/products' }, 'https://brandconnect.naver.com/123/affiliate/products');
});
test('인증 시간초과를 성공으로 처리하지 않는다', async () => {
  await assert.rejects(continueAuthenticatedPage({ url: () => 'https://nid.naver.com/nidlogin.login', waitForFunction: async () => { throw new Error('timeout'); } }, 'https://brandconnect.naver.com/'), /timeout/);
});
test('자동 로그인 명령도 로그인 창을 닫지 않는 통합 수집 흐름을 사용한다', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require('node:path').join(__dirname, 'affiliate-refresh.js'), 'utf8');
  assert.match(source, /autoLogin \|\| hasFlag\('interactive'\)/);
  assert.match(source, /interactive \? \['--interactive'\]/);
  assert.doesNotMatch(source, /run\('affiliate-campaigns.js', \['--login'/);
  const collector = fs.readFileSync(require('node:path').join(__dirname, 'affiliate-campaigns.js'), 'utf8');
  assert.match(collector, /'--restore-last-session'/);
});
