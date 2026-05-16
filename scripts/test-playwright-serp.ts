// Playwright 폴백 실제 동작 검증
import { chromium } from 'playwright';
import { findSystemChrome } from '../src/utils/chrome-finder';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: findSystemChrome(),
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  console.log('✅ Playwright 브라우저 시작');

  const queries = ['고유가 피해지원금', '부모급여 신청', '소상공인 지원금'];
  for (const q of queries) {
    const t0 = Date.now();
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      locale: 'ko-KR',
    });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const page = await ctx.newPage();
    const url = `https://m.search.naver.com/search.naver?where=view&query=${encodeURIComponent(q)}`;
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    const html = await page.content();
    await ctx.close();
    const blogLinks = (html.match(/blog\.naver\.com\/[^/]+\/\d+/g) || []).length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${q}] status=${r?.status()} bytes=${html.length} blog 링크=${blogLinks} (${elapsed}s)`);
  }
  await browser.close();
  process.exit(0);
})();
