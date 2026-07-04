import assert from 'assert';
import {
  applyKeywordAiJudge,
  isUltimateGoldenKeywordCandidate,
} from '../../mobile/keyword-ai-judge';

function measuredMetric(keyword: string, category: string, pc: number, mobile: number, documentCount: number) {
  const totalSearchVolume = pc + mobile;
  const goldenRatio = Number((totalSearchVolume / documentCount).toFixed(2));
  return {
    keyword,
    grade: 'SSS' as const,
    score: 100,
    pcSearchVolume: pc,
    mobileSearchVolume: mobile,
    totalSearchVolume,
    documentCount,
    goldenRatio,
    cpc: 0,
    category,
    source: 'test',
    intent: 'test',
    evidence: ['test'],
    isMeasured: true,
    searchVolumeSource: 'searchad' as const,
    searchVolumeConfidence: 'high' as const,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api' as const,
    documentCountConfidence: 'high' as const,
    isDocumentCountEstimated: false,
  };
}

const now = new Date('2026-06-22T09:00:00+09:00');

const calculatorNeed = applyKeywordAiJudge(
  measuredMetric('주휴수당계산기', 'policy', 16500, 71100, 12230),
  { now },
) as any;
assert.strictEqual(calculatorNeed.aiJudge?.verdict, 'publish');
assert.strictEqual(calculatorNeed.aiJudge?.needIntent, 'strong');
assert.strictEqual(calculatorNeed.aiJudge?.adsenseValue, 'high');
assert.ok(isUltimateGoldenKeywordCandidate(calculatorNeed, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 98,
  minTotalSearchVolume: 300,
  maxDocumentCount: 30000,
  minGoldenRatio: 2,
}));

const bareTravel = applyKeywordAiJudge(
  measuredMetric('백운계곡캠핑장', 'travel_domestic', 780, 3890, 1314),
  { now },
) as any;
assert.notStrictEqual(bareTravel.aiJudge?.needIntent, 'strong');
assert.strictEqual(isUltimateGoldenKeywordCandidate(bareTravel, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 98,
  minTotalSearchVolume: 300,
  maxDocumentCount: 15000,
  minGoldenRatio: 2,
}), false);

const bareProduct = applyKeywordAiJudge(
  measuredMetric('위닉스창문형에어컨', 'electronics', 1850, 9130, 3575),
  { now },
) as any;
assert.notStrictEqual(bareProduct.aiJudge?.needIntent, 'strong');
assert.strictEqual(isUltimateGoldenKeywordCandidate(bareProduct, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 98,
  minTotalSearchVolume: 300,
  maxDocumentCount: 15000,
  minGoldenRatio: 2,
}), false);

const youtubeVideoBridge = applyKeywordAiJudge(
  {
    ...measuredMetric('\uC81C\uC2B5\uAE30\uC21C\uC704', 'youtube', 920, 4180, 640),
    source: 'server-measured-youtube-prewarm',
    intent: 'youtube-shorts-cross-measured-need',
    evidence: ['server-24h-measured-prewarm', 'pc-youtube-video-bridge'],
  },
  { now },
) as any;
assert.strictEqual(youtubeVideoBridge.aiJudge?.verdict, 'publish');
assert.strictEqual(youtubeVideoBridge.aiJudge?.needIntent, 'strong');
assert.strictEqual(youtubeVideoBridge.aiJudge?.blogAngle, 'actionable');
assert.strictEqual(youtubeVideoBridge.aiJudge?.adsenseValue, 'high');

const shoppingBuyerIntent = applyKeywordAiJudge(
  {
    ...measuredMetric('\uC704\uB2C9\uC2A4\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8', 'electronics', 1830, 9160, 3575),
    source: 'server-measured-shopping-connect-prewarm',
    intent: 'commerce-entry-measured-need',
    evidence: ['server-24h-measured-prewarm', 'pc-shopping-connect'],
  },
  { now },
) as any;
assert.strictEqual(shoppingBuyerIntent.aiJudge?.verdict, 'publish');
assert.strictEqual(shoppingBuyerIntent.aiJudge?.needIntent, 'strong');
assert.strictEqual(shoppingBuyerIntent.aiJudge?.shoppingIntent, 'high');
assert.strictEqual(shoppingBuyerIntent.aiJudge?.adsenseValue, 'high');

const redOceanReview = applyKeywordAiJudge(
  measuredMetric('\uC81C\uC8FC \uB80C\uD130\uCE74 \uCD94\uCC9C \uD6C4\uAE30', 'travel_domestic', 240, 2270, 15000),
  { now },
) as any;
assert.strictEqual(redOceanReview.aiJudge?.verdict, 'exclude');
assert.strictEqual(redOceanReview.grade, 'C');
assert.strictEqual(redOceanReview.aiJudge?.rejectReason, 'document-count-exceeds-search-demand');

console.log('[mobile-keyword-ai-judge.test] passed');
