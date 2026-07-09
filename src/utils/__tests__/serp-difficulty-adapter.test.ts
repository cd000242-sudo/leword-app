/**
 * serp-difficulty-adapter.test.ts
 *
 * 실측 SERP 어댑터(../pro-hunter-v12/serp-difficulty-adapter)의 매핑 규칙을 고정(characterization).
 * analyzeSmartBlocks(SmartBlockAnalysis) → SerpDifficultySignal 변환이 결정론적임을 보장.
 */
import {
  adaptSmartBlockAnalysis,
  neutralSerpDifficultySignal,
} from '../pro-hunter-v12/serp-difficulty-adapter';
import type { SmartBlock, SmartBlockAnalysis, SmartBlockType } from '../pro-hunter-v12/smartblock-parser';

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
function analysis(over: Partial<SmartBlockAnalysis>): SmartBlockAnalysis {
  return {
    keyword: 'kw',
    totalBlocks: 0,
    blocks: [],
    blogFriendly: false,
    shoppingDominant: false,
    ysPowerLinkCount: 0,
    topBlockType: null,
    recommendation: '',
    bloggerOpportunityScore: 50,
    ...over,
  };
}

// ── difficultyScore = (100 - opportunity)/10, 0~10 클램프 ──
eq('기회100 → 난이도0', adaptSmartBlockAnalysis(analysis({ bloggerOpportunityScore: 100 })).difficultyScore, 0);
eq('기회50 → 난이도5', adaptSmartBlockAnalysis(analysis({ bloggerOpportunityScore: 50 })).difficultyScore, 5);
eq('기회0 → 난이도10', adaptSmartBlockAnalysis(analysis({ bloggerOpportunityScore: 0 })).difficultyScore, 10);
eq('기회75 → 난이도3(반올림)', adaptSmartBlockAnalysis(analysis({ bloggerOpportunityScore: 75 })).difficultyScore, 3);
eq('기회NaN → 난이도5(중립보정)', adaptSmartBlockAnalysis(analysis({ bloggerOpportunityScore: NaN })).difficultyScore, 5);

// ── hasInfluencer: influencer 블록 존재 ──
eq('인플루언서 블록 → hasInfluencer', adaptSmartBlockAnalysis(analysis({ blocks: [block('influencer', 1, false)] })).hasInfluencer, true);
eq('인플루언서 없음 → false', adaptSmartBlockAnalysis(analysis({ blocks: [block('view', 1, true)] })).hasInfluencer, false);

// ── hasSmartBlock: 상위3 이내 비침투 블록 = 진입장벽 ──
eq('상위 쇼핑(비침투) → hasSmartBlock', adaptSmartBlockAnalysis(analysis({ blocks: [block('shopping', 1, false)] })).hasSmartBlock, true);
eq('상위 블로그(침투가능) → 장벽아님', adaptSmartBlockAnalysis(analysis({ blocks: [block('view', 1, true)] })).hasSmartBlock, false);
eq('비침투지만 4위 → 장벽아님', adaptSmartBlockAnalysis(analysis({ blocks: [block('news', 4, false)] })).hasSmartBlock, false);

// ── hasViewSection = blogFriendly 계승 ──
eq('blogFriendly true → hasViewSection', adaptSmartBlockAnalysis(analysis({ blogFriendly: true })).hasViewSection, true);
eq('blogFriendly false → hasViewSection false', adaptSmartBlockAnalysis(analysis({ blogFriendly: false })).hasViewSection, false);

// ── 부가 실측 신호 전달 ──
const rich = adaptSmartBlockAnalysis(analysis({
  bloggerOpportunityScore: 30, shoppingDominant: true, blogFriendly: false,
  topBlockType: 'shopping', recommendation: '🔴 쇼핑 지배',
  blocks: [block('shopping', 1, false), block('influencer', 2, false)],
}));
eq('shoppingDominant 전달', rich.shoppingDominant, true);
eq('opportunityScore 전달', rich.opportunityScore, 30);
eq('topBlockType 전달', rich.topBlockType, 'shopping');
eq('recommendation 전달', rich.recommendation, '🔴 쇼핑 지배');
eq('measured=true (실측)', rich.measured, true);

// ── 중립 신호: 미측정, 편향 없음 ──
const neu = neutralSerpDifficultySignal();
eq('중립 difficulty 5', neu.difficultyScore, 5);
eq('중립 measured=false', neu.measured, false);
eq('중립 hasSmartBlock false', neu.hasSmartBlock, false);
eq('중립 hasInfluencer false', neu.hasInfluencer, false);

console.log(`\n[serp-difficulty-adapter.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
