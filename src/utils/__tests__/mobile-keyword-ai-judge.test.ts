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

const crossDomainCollision = applyKeywordAiJudge(
  measuredMetric('최저임금 격차 1290원 다음감독 후보', 'policy', 12800, 38200, 420),
  { now },
) as any;
assert.strictEqual(crossDomainCollision.aiJudge?.verdict, 'exclude');
assert.strictEqual(crossDomainCollision.aiJudge?.rejectReason, 'cross-domain-intent-collision');
assert.strictEqual(crossDomainCollision.grade, 'C');

const dialoguePaymentCollision = applyKeywordAiJudge(
  measuredMetric('정례대화지급일', 'policy', 830, 2840, 2),
  { now },
) as any;
assert.strictEqual(dialoguePaymentCollision.aiJudge?.verdict, 'exclude');
assert.strictEqual(dialoguePaymentCollision.aiJudge?.rejectReason, 'over-expanded-intent-chain');
assert.strictEqual(dialoguePaymentCollision.grade, 'C');

const articleTitleSource = applyKeywordAiJudge(
  measuredMetric('보도참고자료 고유가 피해지원금 신청·지급 마감 결과 7.3.', 'policy', 1200, 3200, 11),
  { now },
) as any;
assert.strictEqual(articleTitleSource.aiJudge?.verdict, 'exclude');
assert.strictEqual(articleTitleSource.aiJudge?.rejectReason, 'article-title-not-keyword');
assert.strictEqual(articleTitleSource.grade, 'C');

const cultureCardBalance = applyKeywordAiJudge(
  {
    ...measuredMetric('문화누리카드 잔액조회', 'policy', 640, 2000, 229),
    source: 'persistent-measured-golden-cache',
    intent: 'local-benefit-usage-need',
    evidence: ['naver-autocomplete', 'beginner-monetizable-need'],
  },
  { now },
) as any;
assert.strictEqual(cultureCardBalance.aiJudge?.verdict, 'publish');
assert.ok(cultureCardBalance.aiJudge?.reasons.includes('beginner-monetizable-hidden-need'));
assert.ok(isUltimateGoldenKeywordCandidate(cultureCardBalance, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 78,
  minTotalSearchVolume: 300,
  maxDocumentCount: 15000,
  minGoldenRatio: 2,
}));

const jejuRentalInsurance = applyKeywordAiJudge(
  {
    ...measuredMetric('제주 렌터카 완전자차 보험 비교', 'travel_domestic', 1510, 8240, 420),
    source: 'persistent-measured-golden-cache',
    intent: 'travel-booking-risk-comparison',
    evidence: ['naver-autocomplete', 'summer-travel-demand'],
  },
  { now },
) as any;
assert.strictEqual(jejuRentalInsurance.aiJudge?.verdict, 'publish');
assert.ok(isUltimateGoldenKeywordCandidate(jejuRentalInsurance, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 78,
  minTotalSearchVolume: 300,
  maxDocumentCount: 15000,
  minGoldenRatio: 2,
}));

const hongCoachHeadNews = applyKeywordAiJudge(
  {
    ...measuredMetric('홍명보 감독 사퇴', 'sports', 8000, 32000, 900),
    source: 'persistent-measured-golden-cache',
    intent: 'headline-news-only',
    evidence: ['live-golden'],
  },
  { now },
) as any;
assert.strictEqual(hongCoachHeadNews.aiJudge?.verdict, 'exclude');
assert.strictEqual(hongCoachHeadNews.grade, 'C');

const hongCoachFollowup = applyKeywordAiJudge(
  {
    ...measuredMetric('홍명보 감독 다음 감독 후보', 'sports', 2100, 18400, 860),
    source: 'persistent-measured-golden-cache',
    intent: 'sports-follow-up-question',
    evidence: ['live-golden', 'follow-up-intent'],
  },
  { now },
) as any;
assert.strictEqual(hongCoachFollowup.aiJudge?.verdict, 'publish');
assert.ok(hongCoachFollowup.aiJudge?.reasons.includes('beginner-monetizable-hidden-need'));

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

const productLookupNoise = applyKeywordAiJudge(
  {
    ...measuredMetric('\uCC28\uB7C9\uC6A9\uCCAD\uC18C\uAE30\uCD94\uCC9C\uC870\uD68C', 'electronics', 1200, 5400, 25),
    source: 'server-measured-shopping-connect-prewarm',
    intent: 'commerce-entry-measured-need',
    evidence: ['server-24h-measured-prewarm', 'pc-shopping-connect'],
  },
  { now },
) as any;
assert.strictEqual(productLookupNoise.aiJudge?.verdict, 'exclude');
assert.strictEqual(productLookupNoise.aiJudge?.rejectReason, 'synthetic-no-effect-keyword-combo');
assert.strictEqual(isUltimateGoldenKeywordCandidate(productLookupNoise, {
  now,
  requirePcMobileSplit: true,
  requireMeasurementProvenance: true,
  minAiScore: 78,
  minTotalSearchVolume: 300,
  maxDocumentCount: 15000,
  minGoldenRatio: 2,
}), false);

const temporalProductNoise = applyKeywordAiJudge(
  {
    ...measuredMetric('\uC774\uBC88\uC8FC\uCC28\uB7C9\uC6A9\uCCAD\uC18C\uAE30 \uC804\uAE30\uC694\uAE08', 'electronics', 900, 3100, 12),
    source: 'server-measured-shopping-connect-prewarm',
    intent: 'commerce-entry-measured-need',
    evidence: ['server-24h-measured-prewarm', 'pc-shopping-connect'],
  },
  { now },
) as any;
assert.strictEqual(temporalProductNoise.aiJudge?.verdict, 'exclude');
assert.strictEqual(temporalProductNoise.aiJudge?.rejectReason, 'synthetic-no-effect-keyword-combo');

const redOceanReview = applyKeywordAiJudge(
  measuredMetric('\uC81C\uC8FC \uB80C\uD130\uCE74 \uCD94\uCC9C \uD6C4\uAE30', 'travel_domestic', 240, 2270, 15000),
  { now },
) as any;
assert.strictEqual(redOceanReview.aiJudge?.verdict, 'exclude');
assert.strictEqual(redOceanReview.grade, 'C');
assert.strictEqual(redOceanReview.aiJudge?.rejectReason, 'document-count-exceeds-search-demand');

console.log('[mobile-keyword-ai-judge.test] passed');
