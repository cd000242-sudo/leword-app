// headless false + desktop SERP 확인
import { chromium } from 'playwright';
import { findSystemChrome } from '../src/utils/chrome-finder';

(async () => {
  for (const config of [
    { name: 'mobile + headless false', headless: false, url: 'https://m.search.naver.com/search.naver?where=view&query=고유가%20피해지원금' },
    { name: 'desktop + headless true', headless: true, url: 'https://search.naver.com/search.naver?where=blog&query=고유가%20피해지원금' },
    { name: 'desktop + headless false', headless: false, url: 'https://search.naver.com/search.naver?where=blog&query=고유가%20피해지원금' },
  ]) {
    console.log(`\n=== ${config.name} ===`);
    const browser = await chromium.launch({
      headless: config.headless,
      executablePath: findSystemChrome(),
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: config.url.includes('m.') ?
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile' :
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.url.includes('m.') ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      locale: 'ko-KR',
    });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const page = await ctx.newPage();
    try {
      const r = await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
      const html = await page.content();
      const blogLinks = (html.match(/blog\.naver\.com\/[^/"\s]+\/\d+/g) || []).length;
      console.log(`status=${r?.status()} bytes=${html.length} blog=${blogLinks}`);
    } catch (e: any) {
      console.log(`err: ${e.message}`);
    }
    await browser.close();
  }
  process.exit(0);
})();
