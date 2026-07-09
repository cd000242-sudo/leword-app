/**
 * deep-serp-enricher.test.ts
 *
 * 상위N 실측 SERP 심층패스 오케스트레이터(../pro-hunter-v12/deep-serp-enricher)의
 * 오케스트레이션(topN 제한·dedup·graceful 폴백)과 적용 로직을 mock analyzer 로 고정.
 * puppeteer/네트워크 없이 결정론적으로 검증.
 */
import {
  enrichKeywordsWithDeepSerp,
  applySerpDifficulty,
  DEEP_SERP_MAX_TOP_N,
} from '../pro-hunter-v12/deep-serp-enricher';
import type { SmartBlock, SmartBlockAnalysis, SmartBlockType } from '../pro-hunter-v12/smartblock-parser';
import { neutralSerpDifficultySignal } from '../pro-hunter-v12/serp-difficulty-adapter';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  assert(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

function block(type: SmartBlockType, position: number, canPenetrate: boolean): SmartBlock {
  return { type, displayName: type, position, itemCount: 3, hasAd: false, dominance: 40, canPenetrate, strategy: '' };
}
function analysisFor(kw: string, opportunity: number, over: Partial<SmartBlockAnalysis> = {}): SmartBlockAnalysis {
  return {
    keyword: kw, totalBlocks: 1, blocks: [block('view', 1, true)], blogFriendly: true,
    shoppingDominant: false, ysPowerLinkCount: 0, topBlockType: 'view', recommendation: '',
    bloggerOpportunityScore: opportunity, ...over,
  };
}

async function run() {
  // ── topN 제한: 15개 입력, topN 3 → 3개만 분석 ──
  const kws15 = Array.from({ length: 15 }, (_, i) => `kw${i}`);
  let calls = 0;
  const map3 = await enrichKeywordsWithDeepSerp(kws15, {
    topN: 3, concurrency: 2,
    analyzer: async (kw) => { calls++; return analysisFor(kw, 80); },
  });
  eq('topN=3 → 3개만 분석', map3.size, 3);
  eq('analyzer 3회만 호출', calls, 3);
  eq('kw0 measured', map3.get('kw0')?.measured, true);
  eq('kw0 난이도(기회80→2)', map3.get('kw0')?.difficultyScore, 2);
  eq('kw3 미분석(undefined)', map3.get('kw3'), undefined);

  // ── 상한 클램프: topN 999 → DEEP_SERP_MAX_TOP_N 초과 안 함 ──
  const kws50 = Array.from({ length: 50 }, (_, i) => `k${i}`);
  const mapCap = await enrichKeywordsWithDeepSerp(kws50, { topN: 999, analyzer: async (kw) => analysisFor(kw, 50) });
  eq('topN 상한 클램프', mapCap.size, DEEP_SERP_MAX_TOP_N);

  // ── dedup: 중복 키워드는 한 번만 ──
  let dupCalls = 0;
  const mapDup = await enrichKeywordsWithDeepSerp(['a', 'a', 'b', '  ', 'b', 'c'], {
    topN: 10, analyzer: async (kw) => { dupCalls++; return analysisFor(kw, 60); },
  });
  eq('dedup 후 3개', mapDup.size, 3);
  eq('dedup analyzer 3회', dupCalls, 3);

  // ── graceful 폴백: analyzer throw → 중립(measured:false) ──
  const mapFail = await enrichKeywordsWithDeepSerp(['x', 'y'], {
    topN: 10,
    analyzer: async (kw) => { if (kw === 'x') throw new Error('boom'); return analysisFor(kw, 90); },
  });
  eq('실패 키워드 중립 폴백', mapFail.get('x')?.measured, false);
  eq('실패 키워드 난이도 5(중립)', mapFail.get('x')?.difficultyScore, 5);
  eq('성공 키워드 measured', mapFail.get('y')?.measured, true);

  // ── 빈 입력 ──
  const empty = await enrichKeywordsWithDeepSerp([], { analyzer: async (kw) => analysisFor(kw, 50) });
  eq('빈 입력 → 빈 맵', empty.size, 0);

  // ── applySerpDifficulty: measured=false 는 base 유지 + winnable 보류 ──
  const neutralApplied = applySerpDifficulty({ id: 1 }, neutralSerpDifficultySignal(), 80);
  eq('미측정 → base 경쟁도 유지', neutralApplied.serpAdjustedCompetition, 80);
  eq('미측정 → winnable 보류(false)', neutralApplied.winnable, false);

  // ── applySerpDifficulty: 블로그친화 저난이도 → winnable + 감점 ──
  const easy = adaptOK({ opportunity: 90, blogFriendly: true });
  const easyApplied = applySerpDifficulty({ id: 2 }, easy, 90);
  // 난이도 1 → serpPenalty 4, barrier 0 → 90-4=86
  eq('저난이도 경쟁도 90-4=86', easyApplied.serpAdjustedCompetition, 86);
  eq('저난이도 winnable', easyApplied.winnable, true);

  // ── applySerpDifficulty: 쇼핑 지배 → 강한 감점 + winnable 아님 ──
  const shop = adaptOK({ opportunity: 20, blogFriendly: false, shoppingDominant: true, topBlocks: [block('shopping', 1, false)] });
  const shopApplied = applySerpDifficulty({ id: 3 }, shop, 90);
  // 난이도 8 → 32 + shoppingDominant 25 = 57 감점 → 90-57=33
  eq('쇼핑지배 경쟁도 90-57=33', shopApplied.serpAdjustedCompetition, 33);
  eq('쇼핑지배 winnable 아님', shopApplied.winnable, false);

  console.log(`\n[deep-serp-enricher.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
}

// 어댑터를 거친 measured=true 신호 생성 헬퍼
function adaptOK(opts: { opportunity: number; blogFriendly: boolean; shoppingDominant?: boolean; topBlocks?: SmartBlock[] }) {
  const { adaptSmartBlockAnalysis } = require('../pro-hunter-v12/serp-difficulty-adapter');
  return adaptSmartBlockAnalysis(analysisFor('kw', opts.opportunity, {
    blogFriendly: opts.blogFriendly,
    shoppingDominant: opts.shoppingDominant ?? false,
    blocks: opts.topBlocks ?? [block('view', 1, true)],
  }));
}

run();
