/* Real renderer login flow in Chrome, with account-scoped mocked IPC. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const acorn = require('acorn');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '../ui/keyword-master.html'), 'utf8');
function definition(name) {
  const start = html.search(new RegExp(`window\\.${name} = (?:async )?function`));
  assert(start >= 0, name);
  const parsed = acorn.parseExpressionAt(html, html.indexOf('=', start) + 1, { ecmaVersion: 'latest' });
  return html.slice(start, parsed.end) + ';';
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<body style="background:#080d17"><div id="naverSessionState"></div><button id="advisorDailyRunBtn">지금 수집</button></body>');
    await page.evaluate(() => {
      window.__myBlogRecord = { blogId: 'alpha', topic: '스타·연예' };
      window.__mbViewVersion = 1; window.calls = []; window.toasts = [];
      window.authStatus = { loggedIn: false, windowOpen: false };
      window.showToast = (...args) => window.toasts.push(args);
      window.refreshAdvisorDaily = async () => {};
      window.mbSetBusy = (key, value) => { window.__mbBusy ||= {}; window.__mbBusy[key] = value; };
      window.electronAPI = { invoke: async (channel, payload) => {
        window.calls.push({ channel, payload });
        if (channel === 'naver-session-status') {
          if (window.delayAuth) await new Promise((resolve) => { window.resolveAuth = resolve; });
          return window.authError ? { success: false, error: '연결 실패' } : { success: true, status: { ...window.authStatus, endpoints: [] } };
        }
        if (channel === 'naver-session-open') { window.authStatus.windowOpen = true; return { success: true }; }
        // An in-progress job deliberately avoids the unrelated six-minute today-plan polling.
        if (channel === 'advisor-daily-run-now') return { success: false, skipped: true, reason: '이미 수집 중' };
        throw new Error('Unexpected IPC ' + channel);
      } };
    });
    await page.addScriptTag({ content: ['cancelNaverLoginFlow', 'promptNaverLogin', 'checkNaverLoginCompletion', 'refreshNaverSession', 'openNaverAdvisor', 'runAdvisorDailyNow'].map(definition).join('\n') });
    await page.evaluate(() => window.refreshNaverSession());
    assert(await page.locator('#naverLoginDialog').isVisible());
    assert.match(await page.locator('#naverLoginAccount').innerText(), /스타·연예 · alpha/);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.channel === 'advisor-daily-run-now').length), 0);
    await page.click('#naverLoginLater');
    await page.evaluate(() => window.refreshNaverSession());
    assert.equal(await page.locator('#naverLoginDialog').count(), 0, 'dismissal survives passive refresh');
    await page.evaluate(() => window.runAdvisorDailyNow());
    assert(await page.locator('#naverLoginDialog').isVisible(), 'explicit collection asks again before collecting');
    await page.click('#naverLoginStart');
    await page.waitForFunction(() => window.__naverLoginFlow?.timer);
    assert.equal(await page.locator('#naverLoginDialog').count(), 0);
    assert.match(await page.locator('#naverSessionState').innerText(), /alpha 계정/);
    await page.evaluate(async () => {
      const flow = window.__naverLoginFlow;
      clearTimeout(flow.timer);
      window.authStatus.loggedIn = true;
      await window.checkNaverLoginCompletion(flow);
      await window.checkNaverLoginCompletion(flow);
    });
    await page.waitForFunction(() => window.calls.some(c => c.channel === 'advisor-daily-run-now'));
    assert.deepEqual(await page.evaluate(() => window.calls.filter(c => c.channel === 'advisor-daily-run-now').map(c => c.payload.blogId)), ['alpha'], 'one verified collection');
    await page.evaluate(async () => {
      window.authStatus = { loggedIn: false, windowOpen: false };
      await window.openNaverAdvisor();
    });
    await page.waitForFunction(() => window.__naverLoginFlow?.timer);
    await page.evaluate(async () => {
      const flow = window.__naverLoginFlow; clearTimeout(flow.timer);
      window.authStatus.windowOpen = false;
      await window.checkNaverLoginCompletion(flow);
    });
    assert.equal(await page.evaluate(() => window.__naverLoginFlow), null);
    assert.match(await page.locator('#naverSessionState').innerText(), /미완료/);
    // A late status reply must not prompt for or collect the previous account.
    await page.evaluate(() => { window.delayAuth = true; void window.refreshNaverSession(); });
    await page.waitForFunction(() => window.resolveAuth);
    await page.evaluate(() => {
      window.__myBlogRecord = { blogId: 'beta', topic: '자동차' }; window.__mbViewVersion++;
      window.resolveAuth(); window.delayAuth = false;
    });
    await page.evaluate(() => window.refreshNaverSession());
    assert.match(await page.locator('#naverLoginAccount').innerText(), /자동차 · beta/);
    await page.click('#naverLoginLater');
    await page.evaluate(async () => { window.authError = true; await window.runAdvisorDailyNow(); });
    assert.equal(await page.locator('#naverLoginDialog').count(), 0, 'network failure is not a logout');
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.channel === 'advisor-daily-run-now').length), 1);
    await page.evaluate(async () => {
      window.authError = false; window.authStatus.loggedIn = true;
      await window.refreshNaverSession();
    });
    assert.equal(await page.locator('#naverLoginDialog').count(), 0, 'verified account needs no prompt');
    await page.evaluate(async () => { window.authStatus.loggedIn = false; await window.openNaverAdvisor(); });
    await page.waitForFunction(() => window.__naverLoginFlow?.timer);
    await page.evaluate(() => {
      clearTimeout(window.__naverLoginFlow.timer); window.delayAuth = true;
      window.resolveAuth = null;
      void window.checkNaverLoginCompletion(window.__naverLoginFlow);
    });
    await page.waitForFunction(() => window.resolveAuth);
    await page.evaluate(() => {
      window.cancelNaverLoginFlow(); window.__mbViewVersion++;
      window.__myBlogRecord = { blogId: 'alpha' };
      window.authStatus.loggedIn = true; window.resolveAuth(); window.delayAuth = false;
    });
    await page.evaluate(() => window.refreshNaverSession());
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.channel === 'advisor-daily-run-now').length), 1, 'pending login from old selection cannot collect');
    assert.deepEqual(errors, []);
    console.log('PASS: login prompt, dismissal, manual gate, verified continuation, cancellation, account switch, network failure');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
