const fs = require('fs');
const path = require('path');
const {
  collectMobileUiReleaseGate,
} = require('../../../scripts/mobile-ui-release-gate');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..', '..', '..');
const screenSource = fs.readFileSync(
  path.join(root, 'apps', 'mobile', 'src', 'screens', 'MobileHunterScreen.tsx'),
  'utf8',
);

const report = collectMobileUiReleaseGate();

assert('mobile UI release gate passes current mobile app',
  report.ok === true
    && report.summary.failedRequired === 0
    && report.checks.some((item: any) => item.name === 'Mobile source does not import browser automation' && item.ok)
    && report.checks.some((item: any) => item.name === 'Mobile exposes every core LEWORD hunter mode' && item.ok)
    && report.checks.some((item: any) => item.name === 'Mobile shows immediate loading feedback' && item.ok)
    && report.checks.some((item: any) => item.name === 'Mobile result cards show PC-grade measured metrics' && item.ok));

assert('mobile UI release gate records release evidence',
  report.evidence.appName === 'LEWORD'
    && report.evidence.hunterModes.includes('golden')
    && report.evidence.hunterModes.includes('pro')
    && report.evidence.categories.includes('policy')
    && report.evidence.categories.includes('celebrity')
    && report.evidence.touchMinHeights.every((height: number) => height >= 36));

const regressed = collectMobileUiReleaseGate({
  screenSource: screenSource.replace(/progressPulse/g, 'removedPulse'),
});

assert('mobile UI release gate fails when loading feedback regresses',
  regressed.ok === false
    && regressed.blockers.some((item: any) => item.name === 'Mobile shows immediate loading feedback'));

assert('mobile UI release gate does not expose secret-like values',
  !JSON.stringify(report).includes('ghp_')
    && !JSON.stringify(report).includes('Bearer mobile-user-token'));

console.log('[mobile-ui-release-gate.test] passed');

export {};
