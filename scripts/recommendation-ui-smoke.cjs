'use strict';
// Local preview only. Isolated fixture login; no production authentication or external API calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('leaderspro.leword.session.v1', JSON.stringify({
    userId: 'local-ui-fixture', expiresAt: null, licenseType: 'test', savedAt: new Date().toISOString(),
  })));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5127') return route.continue();
    if (route.request().resourceType() === 'script') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Isolated UI test — external calls disabled' }) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5127/leword?tab=affiliate');
    await page.getByRole('tab', { name: '네이버 브랜드커넥트', exact: true }).click();
    await page.getByRole('group', { name: '추천 근거 상태' }).waitFor();
    const research = page.getByRole('button', { name: /^추가 조사/ });
    await research.click();
    const brief = page.getByRole('button', { name: /작성 근거·본문 구성 보기/ }).first();
    // When all products pass/exclude, inspect the corresponding state instead.
    if (await brief.count() === 0) await page.getByRole('button', { name: /^추천 제외/ }).click();
    await page.getByRole('button', { name: /작성 근거·본문 구성 보기/ }).first().click();
    await page.getByText('확인된 공식 제품 자료', { exact: true }).first().waitFor();
    assert.equal(await page.getByText(/제목만 맞추면|이 말로 쓰면 뚫립니다/).count(), 0);
    await page.screenshot({ path: path.resolve('tmp/recommendation-affiliate-ui.png') });
    await page.goto('http://127.0.0.1:5127/leword?tab=issue');
    await page.getByRole('button', { name: /^관찰 · 수요 미확인/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: '오늘의 월드뉴스', exact: true }).count(), 0);
    await page.getByRole('button', { name: /^관찰 · 수요 미확인/ }).click();
    await page.getByText(/작성 추천이 아닙니다/).first().waitFor();
    await page.screenshot({ path: path.resolve('tmp/recommendation-issue-ui.png') });
    assert.deepEqual(errors, [], 'page runtime errors');
    console.log(JSON.stringify({ ok: true, journeys: ['affiliate research -> evidence brief', 'issue recommendations -> demand-unverified observation'], externalCalls: 'blocked', runtimeErrors: errors.length }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
