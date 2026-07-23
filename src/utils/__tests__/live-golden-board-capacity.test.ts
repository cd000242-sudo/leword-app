/**
 * 보드 정원 확대(64 → 240)를 실제 운영 풀로 검증한다.
 *
 * 배경: 표시 상한이 64에 고정돼 자격 있는 SSS 가 잘려 나가고 있었다. 정원을 키우되
 * "SSS 가 모자라면 SS/S/A 로 대신 채우는" 다층 노출로 번지면 안 된다. 그래서
 * SSS 레인만 boardTarget 을 따라 넓어지고, 비-SSS 보충 레인은 절대 상한에 묶여 있다.
 *
 * 합성 픽스처는 실측 증빙 게이트(15개 검사)를 통과하지 못해 0건만 나온다 —
 * 무의미한 통과를 피하려고 운영 보드 스냅샷을 픽스처로 쓴다.
 */
import * as fs from 'fs';
import * as path from 'path';
import { __liveGoldenRadarTestInternals as internals } from '../../mobile/live-golden-radar';

let failures = 0;

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok - ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL - ${name}${detail ? ` :: ${detail}` : ''}`);
}

const fixturePath = path.join(__dirname, 'fixtures', 'live-golden-board-pool.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  savedAt: string;
  items: Array<Record<string, unknown>>;
};
const now = new Date(fixture.savedAt);
const pool = fixture.items;

const selectLiveBoardItems = internals?.selectLiveBoardItems;
const isMeasuredSssBoardCandidate = internals?.isMeasuredSssBoardCandidate;

assert('보드 선정 훅이 노출되어 있다',
  typeof selectLiveBoardItems === 'function' && typeof isMeasuredSssBoardCandidate === 'function');

if (typeof selectLiveBoardItems === 'function' && typeof isMeasuredSssBoardCandidate === 'function') {
  const eligible = pool.filter((item) => isMeasuredSssBoardCandidate(item as never, now));

  // 픽스처 자체가 비어 있으면 아래 단언이 공허하게 통과한다 — 먼저 막는다.
  assert('픽스처에 표시 자격 SSS 가 실제로 존재한다',
    eligible.length >= 20,
    `표시 자격 ${eligible.length}건 — 픽스처가 낡았거나 게이트가 과도하게 좁아졌다`);

  const at64 = selectLiveBoardItems(pool as never[], 64, now) as Array<Record<string, unknown>>;
  const at240 = selectLiveBoardItems(pool as never[], 240, now) as Array<Record<string, unknown>>;

  assert('보드가 실제로 채워진다(공허한 통과 방지)',
    at64.length >= 20,
    `target=64 에서 ${at64.length}건`);

  assert('정원을 키우면 표시량이 줄지 않는다',
    at240.length >= at64.length,
    `target=64 -> ${at64.length}건, target=240 -> ${at240.length}건`);

  const nonSssAt240 = at240.filter((item) => item.grade !== 'SSS').length;
  const nonSssAt64 = at64.filter((item) => item.grade !== 'SSS').length;

  assert('정원 확대가 비-SSS 노출을 늘리지 않는다 — 다층 노출 방벽',
    nonSssAt240 <= Math.max(nonSssAt64, 4),
    `target=64 비-SSS ${nonSssAt64}건 -> target=240 비-SSS ${nonSssAt240}건`);

  assert('확대분은 SSS 로만 채워진다',
    (at240.length - at64.length) === 0 || nonSssAt240 === nonSssAt64,
    `증가 ${at240.length - at64.length}건 중 비-SSS 증가 ${nonSssAt240 - nonSssAt64}건`);
}

if (failures > 0) {
  console.error(`[live-golden-board-capacity.test] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('[live-golden-board-capacity.test] passed');
process.exit(0);
