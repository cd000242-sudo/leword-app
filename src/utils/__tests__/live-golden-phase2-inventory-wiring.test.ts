import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 2 인벤토리가 **실제로 스냅샷에 실리는지** 지킨다.
 *
 * 왜 따로 두나: 계약(contracts.ts)에 `inventory?:` 필드는 2026-08 부터 있었는데
 * 아무도 채우지 않아 늘 undefined 였다. 모듈(live-golden-inventory.ts)도, 그 모듈의
 * 단위 테스트도 있었지만 **부르는 곳이 없어서** 앱에는 한 줄도 안 갔다.
 * 판정 로직이 맞는지는 live-golden-phase2-inventory.test 가 보고, 여기서는
 * "연결"만 본다 — 끊어지면 단위 테스트는 계속 초록인 채 기능만 사라지기 때문이다.
 */

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const source = (...segments: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');

const radar = source('mobile', 'live-golden-radar.ts');
const contracts = source('mobile', 'contracts.ts');
const inventory = source('mobile', 'live-golden-inventory.ts');

assert(
  'radar imports the Phase 2 inventory builder',
  /import\s*\{\s*buildLiveGoldenPhase2Inventory\s*\}\s*from\s*'\.\/live-golden-inventory'/.test(radar),
);

assert(
  'radar snapshot fills the inventory field from the builder',
  /inventory:\s*buildLiveGoldenPhase2Inventory\(\{/.test(radar),
);

assert(
  'inventory is built from the same rows the snapshot publishes',
  /inventory:\s*buildLiveGoldenPhase2Inventory\(\{[\s\S]{0,400}?verified:\s*markedVerifiedSupply/.test(radar)
    && /inventory:\s*buildLiveGoldenPhase2Inventory\(\{[\s\S]{0,400}?board:\s*markedBoard/.test(radar),
);

assert(
  'inventory uses the radar clock so tests can pin time',
  /inventory:\s*buildLiveGoldenPhase2Inventory\(\{[\s\S]{0,400}?now:\s*this\.now\(\)/.test(radar),
);

assert(
  'the snapshot contract still declares the inventory field',
  /inventory\?:\s*MobileLiveGoldenInventorySnapshot;/.test(contracts),
);

/*
 * 서버가 정한 판정을 클라이언트가 다시 계산하면 앱 버전마다 답이 갈린다.
 * 그래서 화면이 그대로 쓰는 값(상태 이름·사유·근거)은 모듈이 만들어 내보내야 한다.
 */
assert(
  'the inventory ships a server-owned view model the client renders verbatim',
  /contractVersion:\s*'phase2-inventory-v1'/.test(inventory)
    && /display:/.test(inventory)
    && /reasonCode/.test(inventory),
);

console.log('[live-golden-phase2-inventory-wiring.test] passed');
process.exit(0);
