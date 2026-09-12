import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 이웃 장부를 읽어 합계로 상한을 본다 (2026-09-12).
 *
 * 왜(실측) — 장부가 레인마다 따로였다:
 *   선점 app 레포 data/brightdata-quota-state.json · 글감/실검 site 레포의 각자 파일.
 * 셋이 **각자** 무료 5,000 을 세니 합쳐 15,000 까지 '무료'로 통과했다. 계정 무료는 5,000 하나뿐이라
 * 나머지는 조용히 유료로 나갔다.
 *
 * 파일 하나로 합치지 않은 이유: 레인 셋이 동시에 돌 수 있어 같은 파일에 쓰면 서로를 덮는다.
 * under-count 는 유료 유출이라 가장 위험한 방향이다. 그래서 **쓰기는 제 장부에만, 읽기는 이웃까지**.
 *
 * 거버너는 모듈 최상단에서 env 를 읽는다(FREE_CEILING 등). 그래서 테스트마다 모듈을 새로 들인다.
 */
let dir = '';

function ledger(file: string, total: number, feature: string, month: string): string {
  const p = path.join(dir, file);
  fs.writeFileSync(p, JSON.stringify({
    schema: 'brightdata-quota-v1',
    month,
    byAccount: { primary: { total, byFeature: { [feature]: total } } },
  }), 'utf8');
  return p;
}

/** 지금이 속한 KST 달 — 장부는 달이 다르면 이번 달 지출로 안 센다. */
function kstMonth(nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3_600_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function governor(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  // 최상단 상수를 다시 읽게 한다. 쿼리스트링(?x=1)을 붙이면 vite 가 .ts 로 안 보고 파싱에서 죽는다.
  vi.resetModules();
  return import('../brightdata-quota-governor');
}

const KEYS = [
  'LEWORD_BRIGHTDATA_QUOTA_STATE_FILE',
  'LEWORD_BRIGHTDATA_QUOTA_PEER_FILES',
  'LEWORD_BRIGHTDATA_FREE_CEILING',
  'LEWORD_BRIGHTDATA_PAID_OVERAGE',
  'LEWORD_BRIGHTDATA_FEATURE_CAPS',
];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-bd-peer-'));
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 지우기 실패는 무시 */ }
});

describe('상한은 레인 합계로 본다', () => {
  it('이웃이 이미 쓴 만큼 내 몫이 줄어든다 — 이것이 없으면 셋이 각자 5,000 을 쓴다', async () => {
    const now = Date.now();
    const month = kstMonth(now);
    const own = ledger('own.json', 1_000, 'golden', month);
    const peerA = ledger('peer-a.json', 2_500, 'briefs', month);
    const peerB = ledger('peer-b.json', 1_200, 'issue', month);

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: `${peerA},${peerB}`,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
      LEWORD_BRIGHTDATA_PAID_OVERAGE: '0',
    });

    // 합계 4,700 → 무료 5,000 까지 남은 것은 300 뿐이다
    const decision = g.reserveBrightDataRequests('golden', 1_000, { nowMs: now });
    expect(decision.accountUsed).toBe(4_700);
    expect(decision.granted).toBe(300);
    expect(decision.allowed).toBe(false);
  });

  it('이웃을 안 가리키면 제 장부만 본다 — 고치기 전의 모습이다', async () => {
    const now = Date.now();
    const month = kstMonth(now);
    const own = ledger('own.json', 1_000, 'golden', month);
    ledger('peer-a.json', 2_500, 'briefs', month);

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
      LEWORD_BRIGHTDATA_PAID_OVERAGE: '0',
    });
    const decision = g.reserveBrightDataRequests('golden', 1_000, { nowMs: now });
    expect(decision.accountUsed).toBe(1_000);
    expect(decision.granted).toBe(1_000); // 이웃 2,500 을 못 보니 그냥 내준다
  });

  it('스냅샷도 합계로 말한다 — 제 장부만 말하면 로그가 "여유 있다"고 거짓말한다', async () => {
    const now = Date.now();
    const month = kstMonth(now);
    const own = ledger('own.json', 1_000, 'golden', month);
    const peer = ledger('peer-a.json', 2_500, 'briefs', month);

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: peer,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
    });
    const snap = g.brightDataQuotaSnapshot({ nowMs: now });
    expect(snap.used).toBe(3_500);
    expect(snap.ownUsed).toBe(1_000);
    expect(snap.peerUsed).toBe(2_500);
    expect(snap.remainingFree).toBe(1_500);
    expect(snap.byFeature).toEqual({ golden: 1_000, briefs: 2_500 });
  });
});

describe('이웃을 잘못 세지 않는다', () => {
  it('지난달 장부는 이번 달 지출이 아니다', async () => {
    const now = Date.now();
    const own = ledger('own.json', 1_000, 'golden', kstMonth(now));
    const stale = ledger('peer-old.json', 4_000, 'briefs', '2000-01');

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: stale,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
    });
    expect(g.brightDataQuotaSnapshot({ nowMs: now }).used).toBe(1_000);
  });

  it('없는 파일·망가진 파일은 0 으로 친다 — 이웃 하나 때문에 회차가 죽으면 안 된다', async () => {
    const now = Date.now();
    const own = ledger('own.json', 1_000, 'golden', kstMonth(now));
    const broken = path.join(dir, 'broken.json');
    fs.writeFileSync(broken, '{이건 JSON 이 아니다', 'utf8');

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: `${path.join(dir, '없는파일.json')},${broken}`,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
    });
    expect(g.brightDataQuotaSnapshot({ nowMs: now }).used).toBe(1_000);
  });

  it('제 장부를 이웃으로 적어 두어도 두 번 안 센다', async () => {
    const now = Date.now();
    const own = ledger('own.json', 1_000, 'golden', kstMonth(now));

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: own,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
    });
    expect(g.brightDataQuotaSnapshot({ nowMs: now }).used).toBe(1_000);
  });
});

describe('쓰기는 제 장부에만 한다', () => {
  it('기록해도 이웃 파일은 한 글자도 안 바뀐다 — 동시에 도는 레인이 서로를 덮지 않게', async () => {
    const now = Date.now();
    const month = kstMonth(now);
    const own = ledger('own.json', 1_000, 'golden', month);
    const peer = ledger('peer-a.json', 2_500, 'briefs', month);
    const before = fs.readFileSync(peer, 'utf8');

    const g = await governor({
      LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: own,
      LEWORD_BRIGHTDATA_QUOTA_PEER_FILES: peer,
      LEWORD_BRIGHTDATA_FREE_CEILING: '5000',
    });
    g.recordBrightDataRequests('golden', 200, { nowMs: now });

    expect(fs.readFileSync(peer, 'utf8'), '이웃 장부가 바뀌었다').toBe(before);
    expect(JSON.parse(fs.readFileSync(own, 'utf8')).byAccount.primary.total).toBe(1_200);
    expect(g.brightDataQuotaSnapshot({ nowMs: now }).used).toBe(3_700);
  });
});
