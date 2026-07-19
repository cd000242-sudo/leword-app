/**
 * surge-emergence-tracker 회귀 — 자동완성 신규 진입 감지(스냅샷 diff).
 *
 * 고정하는 계약:
 * 1. 콜드스타트(기준선 없음)는 기록만 하고 fresh 를 반환하지 않는다(첫 사이클 전량 오탐 방지)
 * 2. 기준선 이후 처음 보는 제안어만 fresh, 재관측은 fresh 아님
 * 3. isRecentNewEntry: firstSeenAt 이 48h 창 안일 때만 true
 * 4. 스냅샷 파일 왕복 + 만료/상한 정리
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SurgeEmergenceTracker } from '../../mobile/surge-emergence-tracker';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`[surge-emergence-tracker.test] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

let passed = 0;
const ok = (name: string, condition: boolean, detail?: string) => {
  assert(name, condition, detail);
  passed += 1;
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-surge-emergence-'));
const file = path.join(tmpDir, 'surge-emergence-tracker-test.json');
fs.rmSync(file, { force: true });

let nowMs = Date.parse('2026-07-10T09:00:00.000Z');
const now = () => new Date(nowMs);

const tracker = new SurgeEmergenceTracker({ file, now });
const cold = tracker.observe(['김부장 기본정보', '김부장 등장인물']);
ok('cold start collects a baseline without fresh hits', cold.coldStart === true && cold.fresh.length === 0);

nowMs += 60 * 60 * 1000;
const second = tracker.observe(['김부장 기본정보', '김부장 결말', '김부장 시청률']);
ok('only never-seen suggestions are fresh after the baseline',
  second.coldStart === false
    && second.fresh.length === 2
    && second.fresh.includes('김부장 결말')
    && second.fresh.includes('김부장 시청률'),
  JSON.stringify(second));

const third = tracker.observe(['김부장 결말']);
ok('re-observed suggestions are not fresh again', third.fresh.length === 0);

ok('recent first-seen suggestions are tagged as new entries',
  tracker.isRecentNewEntry('김부장 결말')
    && tracker.isRecentNewEntry('김부장  결말')
    && !tracker.isRecentNewEntry('관측된 적 없는 키워드'));

nowMs += 49 * 60 * 60 * 1000;
ok('new-entry tag expires after the 48h window', !tracker.isRecentNewEntry('김부장 결말'));

const reloaded = new SurgeEmergenceTracker({ file, now });
const reloadedObserve = reloaded.observe(['김부장 기본정보', '신규 스냅샷 키워드']);
ok('snapshot survives a file round-trip (no cold start, diff still works)',
  reloadedObserve.coldStart === false
    && reloadedObserve.fresh.length === 1
    && reloadedObserve.fresh[0] === '신규 스냅샷 키워드');

const capFile = path.join(tmpDir, 'surge-emergence-cap-test.json');
fs.rmSync(capFile, { force: true });
let capNowMs = Date.parse('2026-07-10T09:00:00.000Z');
const capTracker = new SurgeEmergenceTracker({ file: capFile, now: () => new Date(capNowMs), maxEntries: 5 });
capTracker.observe(['a나비', 'b나비', 'c나비', 'd나비']);
capNowMs += 60_000;
capTracker.observe(['e나비', 'f나비', 'g나비']);
const capRaw = JSON.parse(fs.readFileSync(capFile, 'utf8'));
ok('entry cap evicts the oldest observations', Object.keys(capRaw.seen).length === 5, String(Object.keys(capRaw.seen).length));

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`[surge-emergence-tracker.test] passed: ${passed} / failed: 0`);
