const {
  collectMobileStoreAssetsGate,
  pngInfo,
} = require('../../../scripts/mobile-store-assets-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const report = collectMobileStoreAssetsGate();

assert('mobile store assets gate passes current assets', report.ok === true);
assert('mobile store assets gate checks app icon',
  report.checks.some((item: any) => item.name === 'Expo app icon PNG is 1024 square' && item.ok));
assert('mobile store assets gate checks adaptive icon',
  report.checks.some((item: any) => item.name === 'Android adaptive icon foreground PNG is 1024 square' && item.ok));
assert('mobile store assets gate checks splash',
  report.checks.some((item: any) => item.name === 'Expo splash PNG exists' && item.ok));
assert('mobile store assets gate checks feature graphic',
  report.checks.some((item: any) => item.name === 'Google Play feature graphic is 1024x500' && item.ok));
assert('mobile store assets gate checks phone screenshot set',
  report.checks.some((item: any) => item.name === 'Store screenshots are 6.7 inch portrait PNGs' && item.ok));
assert('mobile store assets gate locks phone-only first release',
  report.checks.some((item: any) => item.name === 'iOS first release is phone-only' && item.ok));

const icon = pngInfo('apps/mobile/assets/icon.png');
assert('icon dimensions are parseable from PNG IHDR',
  icon.width === 1024 && icon.height === 1024 && icon.bytes > 1000);

const screenshot = pngInfo('apps/mobile/assets/store/screenshots/01-category-hunt.png');
assert('phone screenshot dimensions match App Store 6.9 accepted portrait size',
  screenshot.width === 1290 && screenshot.height === 2796 && screenshot.bytes > 5000);

console.log('[mobile-store-assets-gate.test] passed');

export {};
