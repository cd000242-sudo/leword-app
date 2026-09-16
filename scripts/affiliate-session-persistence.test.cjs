const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');

// 사용자 프로필/계정을 사용하지 않는 로컬 합성 세션 테스트.
test('세션 복원 실행 옵션은 브라우저 재시작 후 세션 쿠키를 보존한다', {
  skip: process.env.AFFILIATE_BROWSER_TESTS !== '1', timeout: 90000,
}, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'affiliate-session-test-'));
  const server = http.createServer((req, res) => {
    if (req.url === '/set') res.setHeader('Set-Cookie', 'affiliate_probe=ok; Path=/; HttpOnly');
    res.end((req.headers.cookie || '').includes('affiliate_probe=ok') ? 'preserved' : 'missing');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const launch = () => puppeteer.launch({ headless: false, userDataDir: profile,
      args: ['--restore-last-session', '--start-minimized'] });
    browser = await launch();
    await (await browser.newPage()).goto(`${origin}/set`);
    await browser.close();
    browser = await launch();
    const page = await browser.newPage();
    await page.goto(`${origin}/check`);
    assert.equal(await page.evaluate(() => document.body.textContent), 'preserved');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
