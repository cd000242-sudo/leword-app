const {
  byteLength,
  charLength,
  collectMobileStoreListingGate,
  isProductionHttpsUrl,
} = require('../../../scripts/mobile-store-listing-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const report = collectMobileStoreListingGate();

assert('store listing gate passes current metadata', report.ok === true);
assert('store listing gate checks Google app name limit',
  report.checks.some((item: any) => item.name === 'Google Play app name is within 30 characters' && item.ok));
assert('store listing gate checks Google short description limit',
  report.checks.some((item: any) => item.name === 'Google Play short description is within 80 characters' && item.ok));
assert('store listing gate checks Apple keyword byte limit',
  report.checks.some((item: any) => item.name === 'Apple keywords are within 100 bytes' && item.ok));
assert('store listing gate checks reviewer instructions',
  report.checks.some((item: any) => item.name === 'Reviewer instructions are actionable' && item.ok));
assert('store listing gate blocks guarantee claims',
  report.checks.some((item: any) => item.name === 'Store listing avoids guarantee claims' && item.ok));
assert('store listing gate has no required blockers',
  report.summary.failedRequired === 0);

assert('production URL checker accepts app domain',
  isProductionHttpsUrl('https://leword.app/privacy') === true);
assert('production URL checker rejects placeholder domain',
  isProductionHttpsUrl('https://leword.example/privacy') === false);
assert('charLength counts Korean text by characters',
  charLength('모바일 키워드 분석') === 10);
assert('byteLength counts Korean text by UTF-8 bytes',
  byteLength('키워드') === 9);

console.log('[mobile-store-listing-gate.test] passed');

export {};
