/**
 * browser-process-regression.test.ts
 *
 * CPU/zombie-process regressions are usually caused by direct browser launches
 * bypassing the central Patchright-first browserPool. Keep active TS crawlers
 * on the pool path so quit cleanup can close them as one unit.
 */

import * as fs from 'fs';
import * as path from 'path';

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

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');
}

function listTsFiles(dir: string): string[] {
  const full = path.join(__dirname, '..', '..', '..', dir);
  const out: string[] = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const p = path.join(full, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(path.join(dir, entry.name)));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const pool = read('src/utils/puppeteer-pool.ts');
const main = read('src/main.ts');
const cleaner = read('src/utils/chrome-zombie-cleaner.ts');
const serpCrawler = read('src/utils/serp-crawler.ts');
const daumRealtime = read('src/utils/daum-realtime-api.ts');

assert('browser pool prefers patchright before playwright',
  pool.indexOf("await import('patchright')") >= 0
    && pool.indexOf("await import('playwright')") > pool.indexOf("await import('patchright')"),
  'patchright is not first');

assert('active SERP crawler uses browserPool instead of direct Playwright singleton',
  !/from ['"]playwright['"]/.test(serpCrawler)
    && /browserPool\.acquire\(\)/.test(serpCrawler)
    && /browserPool\.release\(browser\)/.test(serpCrawler),
  'serp-crawler bypasses browserPool');

assert('Daum realtime crawler uses browserPool instead of direct Playwright singleton',
  !/from ['"]playwright['"]/.test(daumRealtime)
    && /browserPool\.acquire\(\)/.test(daumRealtime)
    && /browserPool\.release\(browser\)/.test(daumRealtime),
  'daum realtime bypasses browserPool');

const directPlaywrightImports = listTsFiles('src')
  .filter(file => !file.includes(`${path.sep}__tests__${path.sep}`))
  .filter(file => /from ['"]playwright['"]/.test(fs.readFileSync(file, 'utf8')));
assert('active TS source has no direct playwright imports',
  directPlaywrightImports.length === 0,
  directPlaywrightImports.map(file => path.relative(path.join(__dirname, '..', '..', '..'), file)).join(', '));

assert('quit path destroys browserPool and then cleans LEWORD chromium zombies',
  /browserPool\.destroy\(\)/.test(main)
    && /cleanupChromeZombies\(3000\)/.test(main)
    && /cleanupChromeZombiesSync\(1500\)/.test(main),
  'quit cleanup is not wired');

assert('chrome zombie cleaner only targets LEWORD chromium path',
  /\*leword\*chromium\*/i.test(cleaner)
    && /Get-Process chrome/.test(cleaner)
    && /Where-Object \{ \$_.Path/.test(cleaner),
  'cleaner may target user Chrome or miss bundled Chromium');

console.log(`\n[browser-process-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
