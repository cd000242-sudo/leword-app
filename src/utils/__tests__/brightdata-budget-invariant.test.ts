import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 세 레인의 브라이트데이터 예산이 합쳐서 20달러를 못 넘게 잠근다.
 *
 * ── 1차(2026-09-11): 몫 쪼개기 ──
 * 거버너의 FREE_CEILING 은 **장부 파일 하나의 total** 에 적용된다. 그런데 레인마다 장부가
 * 따로다(golden·briefs·issue) — 셋이 각자 "나는 무료 5,000이 있다"고 믿었다.
 * 계정 무료는 월 5,000 하나뿐이라, 고치기 전 최악이 유료 19,000콜 = $28.50 이었다.
 * 그래서 무료 몫을 3,800 + 900 + 300 = 5,000 으로 쪼갰다.
 *
 * ── 2차(2026-09-12): 합계로 본다 ──
 * 쪼개기는 총액은 맞췄지만 **노는 레인의 몫을 바쁜 레인이 못 썼다**(9월 실측: issue 가
 * 281콜만 쓰고 1,019콜을 놀렸다). 세 숫자가 따로 놀아 한쪽만 고치면 합이 조용히 틀어지기도 했다.
 * 이제 거버너가 이웃 장부까지 **읽어** 합계로 상한을 본다(LEWORD_BRIGHTDATA_QUOTA_PEER_FILES).
 * 쓰기는 제 장부에만 한다 — 동시에 도는 레인이 서로를 덮지 않게(under-count = 유료 유출).
 *
 * 그래서 세 레인이 **같은 숫자**를 쓴다. 그 숫자가 계정 전체의 상한이다.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const read = (name: string) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', `${name}.yml`), 'utf8');

/** 1,000콜당 달러. 워크플로 주석에 적힌 실측 단가. */
const RATE_PER_1000 = 1.5;
/** 브라이트데이터 계정의 월 무료 — 하나뿐이다. */
const ACCOUNT_FREE = 5_000;
/** 사장님 한도(2026-09-07 "20달러만 안 넘으면 된다"). */
const BUDGET_USD = 20;

const LANES = ['preemption-board', 'topic-briefs', 'issue-niche-board'] as const;

function envOf(workflow: string, key: string): number | null {
  const m = new RegExp('LEWORD_BRIGHTDATA_' + key + ":\\s*'(\\d+)'").exec(workflow);
  return m ? Number(m[1]) : null;
}

function peersOf(workflow: string): string[] {
  const m = /LEWORD_BRIGHTDATA_QUOTA_PEER_FILES:([^\r\n]+)/.exec(workflow);
  return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
}

function ownLedgerOf(workflow: string): string {
  const m = /LEWORD_BRIGHTDATA_QUOTA_STATE_FILE:([^\r\n]+)/.exec(workflow);
  return m ? m[1].trim() : '';
}

/** 경로에서 파일 이름만 — 레포·체크아웃 경로가 달라도 같은 장부인지 알아본다. */
const baseName = (p: string) => p.split('/').pop() || p;

describe('세 레인이 같은 상한을 본다 — 합계로 막기 때문이다', () => {
  it('무료 상한이 세 레인 모두 계정 무료와 같다', () => {
    for (const name of LANES) {
      expect(envOf(read(name), 'FREE_CEILING'), `${name} 의 무료 상한`).toBe(ACCOUNT_FREE);
    }
  });

  it('유료 상한도 세 레인이 같다 — 다르면 어느 쪽이 진짜인지 알 수 없다', () => {
    const paid = LANES.map((n) => envOf(read(n), 'PAID_OVERAGE'));
    for (const [i, v] of paid.entries()) {
      expect(v, `${LANES[i]} 에 PAID_OVERAGE 가 없다`).not.toBeNull();
    }
    expect(new Set(paid).size, `레인마다 다르다: ${paid.join(' / ')}`).toBe(1);
  });

  it('계정 전체가 쓸 수 있는 유료분이 20달러 안이다', () => {
    const paid = envOf(read(LANES[0]), 'PAID_OVERAGE')!;
    const usd = (paid * RATE_PER_1000) / 1000;
    expect(usd, `유료 ${paid}콜 = $${usd.toFixed(2)}`).toBeLessThanOrEqual(BUDGET_USD);
  });
});

describe('한 레인이 예산을 다 먹지 못한다', () => {
  it('레인마다 기능 상한이 있다 — 없으면 계정 상한까지 혼자 쓴다', () => {
    for (const name of LANES) {
      const caps = /LEWORD_BRIGHTDATA_FEATURE_CAPS:\s*'([^']+)'/.exec(read(name));
      expect(caps, `${name} 에 FEATURE_CAPS 가 없다`).not.toBeNull();
      const parsed = JSON.parse(caps![1]);
      expect(Object.keys(parsed).length, `${name} 의 기능 상한이 비었다`).toBeGreaterThan(0);
    }
  });

  it('기능 상한을 다 합쳐도 계정 상한을 안 넘는다 — 넘으면 상한이 거짓말이 된다', () => {
    let sum = 0;
    for (const name of LANES) {
      const caps = JSON.parse((/LEWORD_BRIGHTDATA_FEATURE_CAPS:\s*'([^']+)'/.exec(read(name)) || [])[1]);
      for (const v of Object.values(caps)) sum += Number(v);
    }
    const hard = ACCOUNT_FREE + envOf(read(LANES[0]), 'PAID_OVERAGE')!;
    expect(sum, `기능 상한 합 ${sum} > 계정 상한 ${hard}`).toBeLessThanOrEqual(hard);
  });
});

describe('합계로 보려면 이웃 장부를 실제로 읽어야 한다', () => {
  it('레인마다 제 장부가 따로다 — 같은 파일을 동시에 쓰면 서로를 덮는다', () => {
    const own = LANES.map((n) => ownLedgerOf(read(n)));
    for (const [i, p] of own.entries()) expect(p, `${LANES[i]} 에 장부 경로가 없다`).not.toBe('');
    expect(new Set(own.map(baseName)).size).toBe(3);
  });

  it('레인마다 나머지 둘을 이웃으로 가리킨다 — 하나라도 빠지면 그만큼 더 쓴다', () => {
    const own = LANES.map((n) => baseName(ownLedgerOf(read(n))));
    for (const [i, name] of LANES.entries()) {
      const peers = peersOf(read(name)).map(baseName);
      expect(peers.length, `${name} 에 이웃 장부가 없다`).toBe(2);
      const expected = own.filter((_, j) => j !== i).sort();
      expect(peers.slice().sort(), `${name} 의 이웃이 틀렸다`).toEqual(expected);
      expect(peers, `${name} 이 제 장부를 이웃으로 센다 — 두 번 세면 일찍 막힌다`).not.toContain(own[i]);
    }
  });

  it('선점 보드는 BD 단계 앞에서 이웃 장부를 받아 둔다 — 발행용 체크아웃은 잡 맨 뒤에 있다', () => {
    const wf = read('preemption-board');
    const checkout = wf.indexOf('이웃 장부 읽기용 체크아웃');
    const bd = wf.indexOf('자리 판정 (Bright Data)');
    expect(checkout, '이웃 장부 체크아웃 스텝이 없다').toBeGreaterThan(-1);
    expect(checkout, '체크아웃이 BD 단계보다 뒤에 있다 — 그러면 이웃을 0 으로 읽는다').toBeLessThan(bd);
    // 그 체크아웃이 받아 둔 경로를 실제로 이웃으로 가리키는지
    for (const p of peersOf(wf)) expect(p).toContain('quota-peers/');
  });
});
