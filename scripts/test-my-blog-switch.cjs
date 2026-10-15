/* Real renderer functions with mocked IPC: no network, AI usage or user-data writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const acorn = require('acorn');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '../ui/keyword-master.html'), 'utf8');
function definition(name, declaration = false) {
  const start = declaration ? html.indexOf(`function ${name}(`) : html.search(new RegExp(`window\\.${name} = (?:async )?function`));
  assert(start >= 0, name);
  const expr = declaration ? start : html.indexOf('=', start) + 1;
  const parsed = acorn.parseExpressionAt(html, expr, { ecmaVersion: 'latest' });
  return html.slice(start, parsed.end) + ';';
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const start = html.indexOf('<section class="leword-screen" data-screen="today"');
    await page.setContent('<body style="margin:12px;background:#080d17;font-family:Arial">' + html.slice(start, html.indexOf('</section>', start) + 10));
    await page.evaluate(() => {
      const profile = (id) => ({ blogId: id, measuredAt: '2026-10-15T00:00:00Z', card: { headline: id + ' 분석 결과', lines: [], notices: [] }, recentTitles: [{ title: id + ' 전용 글', publishedOn: '2026-10-14' }], topicProfile: { words: [{ word: id }] } });
      window.fixtures = { alpha: profile('alpha'), beta: profile('beta') };
      window.selected = 'alpha'; window.calls = [];
      window.electronAPI = {
        on: () => () => {},
        invoke: async (channel, payload) => {
          window.calls.push({ channel, payload });
          if (channel === 'blog-class-list') return { success: true, selectedId: window.selected, blogs: Object.values(window.fixtures) };
          if (channel === 'blog-class-select') {
            await new Promise((r) => setTimeout(r, 35));
            if (!window.fixtures[payload.blogId]) return { success: false, error: '없는 블로그' };
            window.selected = payload.blogId;
          }
          if (['blog-class-select', 'blog-class-get'].includes(channel)) return { success: true, record: window.fixtures[window.selected] };
          if (channel === 'daily-pick-get') return { success: true, result: window.selected === 'alpha' ? { builtAt: '2026-10-15T00:00:00Z', picks: [], rejected: [], seconds: 1, message: 'alpha 전용 추천' } : null };
          if (channel === 'advisor-daily-view') return { success: true, latest: null, days: 0 };
          if (channel === 'advisor-today-view') return { success: true, plan: null, running: false };
          throw new Error('Unexpected IPC: ' + channel);
        },
      };
    });
    const core = html.slice(html.indexOf('let dpView ='), html.indexOf('window.dpTrack ='));
    const code = ['blogEnvelopeHtml', 'refreshAdvisorDaily', 'refreshAdvisorToday'].map((n) => definition(n)).join('\n')
      + definition('renderAdvisorDaily', true) + definition('renderAdvisorToday', true) + core;
    await page.addScriptTag({ content: code });
    await page.evaluate(() => window.loadDailyPick());
    assert.match(await page.locator('#dpBlogResult').innerText(), /alpha 분석/);
    assert.match(await page.locator('#dpStatus').innerText(), /alpha 전용 추천/);
    await page.selectOption('#dpBlogSelect', 'beta');
    await page.waitForFunction(() => !window.__mbBusy.select);
    assert.match(await page.locator('#dpBlogResult').innerText(), /beta 분석/);
    assert.match(await page.locator('#mbPosts').innerText(), /beta 전용 글/);
    assert.doesNotMatch(await page.locator('#dpStatus').innerText(), /alpha/);
    assert.equal(await page.locator('#advisorTodayBody').innerText(), '');
    assert.match(await page.locator('#advisorDailyMeta').textContent(), /선택한 블로그/, JSON.stringify(await page.evaluate(() => ({ calls: window.calls, progress: document.getElementById('dpBlogProgress').textContent }))));
    await page.selectOption('#dpBlogSelect', 'alpha');
    await page.waitForFunction(() => !window.__mbBusy.select);
    assert.match(await page.locator('#dpStatus').innerText(), /alpha 전용 추천/);
    await page.evaluate(() => window.loadDailyPick());
    assert.equal(await page.locator('#dpBlogSelect').inputValue(), 'alpha');
    await page.click('#dpBlogAdd');
    assert(await page.locator('#dpBlogInput').isVisible());
    assert.equal(await page.locator('#dpBlogInput').inputValue(), '');
    assert.equal(await page.evaluate(() => window.calls.filter((c) => c.channel === 'blog-class-measure').length), 0);
    await page.evaluate(() => window.selectMyBlog('missing'));
    assert.match(await page.locator('#dpBlogResult').innerText(), /alpha 분석/);
    assert.match(await page.locator('#dpBlogProgress').innerText(), /없는 블로그/);
    assert.match(await page.locator('#dpStatus').innerText(), /alpha 전용 추천/);
    await page.selectOption('#dpBlogSelect', 'beta');
    await page.waitForFunction(() => !window.__mbBusy.select);
    await page.setViewportSize({ width: 600, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, '../.codex-build-cache/my-blog-dropdown.png'), fullPage: false });
    assert.deepEqual(errors, []);
    console.log('PASS: A/B switching, isolated picks and stats, reload, add form, failed selection recovery, 600px layout; no remeasurement.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
