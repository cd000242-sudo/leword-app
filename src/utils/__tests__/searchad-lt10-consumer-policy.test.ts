import * as fs from 'fs';
import * as path from 'path';
import { exactSearchAdTotal } from '../naver-searchad-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

assert(
  'a flagged <10 device range has no exact total even when the other device is known',
  exactSearchAdTotal({
    pcSearchVolume: null,
    mobileSearchVolume: 400,
    pcSearchVolumeLt10: true,
  }) === null,
);

assert(
  'a raw SearchAd <10 token also fails closed without relying on a downstream flag',
  exactSearchAdTotal({ monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: 400 }) === null,
);

assert(
  'one-sided and estimated SearchAd measurements have no exact total',
  exactSearchAdTotal({ pcSearchVolume: null, mobileSearchVolume: 400 }) === null
    && exactSearchAdTotal({ pcSearchVolume: 20, mobileSearchVolume: 400, svEstimated: true }) === null,
);

assert(
  'an actual numeric zero remains an exact device count',
  exactSearchAdTotal({ pcSearchVolume: 0, mobileSearchVolume: 300 }) === 300,
);

const sourceFiles = [
  'pro-traffic-keyword-hunter.ts',
  'traffic-explosion-hunter.ts',
  path.join('pro-hunter-v12', 'lifecycle-tracker.ts'),
  'related-keyword-fallback.ts',
];
for (const relative of sourceFiles) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  assert(
    `${relative} delegates SearchAd totals to the fail-closed range policy`,
    source.includes('exactSearchAdTotal('),
  );
}

console.log('[searchad-lt10-consumer-policy.test] passed');
