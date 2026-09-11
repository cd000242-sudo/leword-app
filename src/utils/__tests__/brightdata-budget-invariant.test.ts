import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 세 레인의 브라이트데이터 예산이 합쳐서 20달러를 못 넘게 잠근다(2026-09-11).
 *
 * 왜(실측): 거버너의 FREE_CEILING(5,000)은 **장부 파일 하나의 total** 에 적용된다.
 * 그런데 레인마다 장부가 따로다(golden·briefs·issue) — 셋이 각자 "나는 무료 5,000이 있다"고 믿었다.
 * 브라이트데이터 계정의 무료는 월 5,000 하나뿐이다.
 *
 * 고치기 전 최악:
 *   golden 무료 5,000 + 유료 9,000 = 14,000
 *   briefs 무료 5,000 + 유료     0 =  5,000   (PAID_OVERAGE 기본값 0)
 *   issue  무료 5,000 + 유료     0 =  5,000
 *   합계 24,000콜 → 진짜 무료 5,000 빼면 유료 19,000 × $1.50/1,000 = **$28.50**
 * 사장님 한도 "20달러만 안 넘으면 된다"(2026-09-07)를 아무것도 안 막는 채로 넘긴다.
 *
 * 장부를 한 파일로 합치는 것이 정공법이지만, 선점 보드는 BD 단계가 사이트 레포 체크아웃보다
 * **먼저** 온다(4시간짜리 잡의 순서를 바꾸는 일이다). 그래서 무료 몫을 레인별로 쪼개
 * 합이 5,000이 되게 하고, 유료 상한을 레인마다 명시한다.
 *
 * 몫은 9월 실측 속도로 나눴다(2026-09-01~11):
 *   golden 월 10,320(주 2회 × 1,200 × 4.3) · briefs 월 2,326 · issue 월 649
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

describe('무료 5,000을 레인끼리 나눠 갖는다', () => {
  it('세 레인의 무료 몫 합이 계정 무료와 정확히 같다', () => {
    const shares = LANES.map((n) => envOf(read(n), 'FREE_CEILING'));
    for (const [i, s] of shares.entries()) {
      expect(s, `${LANES[i]} 에 FREE_CEILING 이 없다 — 그러면 기본 5,000을 혼자 다 갖는다`).not.toBeNull();
    }
    expect(shares.reduce((a, b) => a! + b!, 0)).toBe(ACCOUNT_FREE);
  });
});

describe('유료 합이 한도를 못 넘는다', () => {
  it('세 레인의 유료 상한 합 × 단가가 20달러 안이다', () => {
    const paid = LANES.map((n) => {
      const v = envOf(read(n), 'PAID_OVERAGE');
      // 안 적으면 기본 0 이라 오히려 안전하지만, 명시해야 나중에 읽는 사람이 안 헷갈린다.
      expect(v, `${LANES[n === 'preemption-board' ? 0 : n === 'topic-briefs' ? 1 : 2]}`).not.toBeNull();
      return v!;
    });
    const total = paid.reduce((a, b) => a + b, 0);
    const usd = (total * RATE_PER_1000) / 1000;
    expect(usd, `유료 ${total}콜 = $${usd.toFixed(2)}`).toBeLessThanOrEqual(BUDGET_USD);
  });

  it('레인마다 기능 상한이 그 레인이 쓸 수 있는 양을 넘지 않는다 — 넘으면 상한이 거짓말이 된다', () => {
    for (const name of LANES) {
      const wf = read(name);
      const free = envOf(wf, 'FREE_CEILING')!;
      const paid = envOf(wf, 'PAID_OVERAGE')!;
      const caps = JSON.parse((/LEWORD_BRIGHTDATA_FEATURE_CAPS:\s*'([^']+)'/.exec(wf) || [])[1]);
      for (const [feature, cap] of Object.entries(caps)) {
        expect(Number(cap), `${name} 의 ${feature} 상한 ${cap} > 쓸 수 있는 ${free + paid}`).toBeLessThanOrEqual(free + paid);
      }
    }
  });
});

describe('장부는 레인마다 따로 둔다 — 합칠 때까지', () => {
  it('세 경로가 서로 다르다 — 같은 파일을 동시에 쓰면 커밋이 충돌한다', () => {
    const paths = LANES.map((n) => (/LEWORD_BRIGHTDATA_QUOTA_STATE_FILE:([^\r\n]+)/.exec(read(n)) || [])[1]);
    expect(new Set(paths).size).toBe(3);
  });
});
