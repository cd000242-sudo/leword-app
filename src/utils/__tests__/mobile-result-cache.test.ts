import { strict as assert } from 'assert';
import { InMemoryMobileResultCache } from '../../mobile/result-cache';
import type { MobileKeywordResult } from '../../mobile/contracts';

function result(keywords: MobileKeywordResult['keywords']): MobileKeywordResult {
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: keywords.filter((item) => item.grade === 'SSS').length,
      measured: keywords.filter((item) => item.isMeasured).length,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
}

const cache = new InMemoryMobileResultCache();
cache.set('golden-discovery', { categoryId: 'policy', targetCount: 30 }, result([
  {
    keyword: '2026 제헌절 공휴일',
    grade: 'SSS',
    score: 99,
    pcSearchVolume: 0,
    mobileSearchVolume: 0,
    totalSearchVolume: 287800,
    documentCount: 3680,
    goldenRatio: 78.21,
    cpc: null,
    category: 'policy',
    source: 'pc-direct-golden-keyword-miner',
    intent: 'Informational',
    evidence: ['measured'],
    isMeasured: true,
    aiJudge: {
      verdict: 'exclude',
      score: 20,
      confidence: 0.9,
      needIntent: 'weak',
      blogAngle: 'thin',
      shoppingIntent: 'low',
      adsenseValue: 'low',
      freshnessRisk: 'high',
      spamRisk: 'medium',
      reasons: ['low conversion date lookup'],
      model: 'rule-judge-v1',
      checkedAt: '2026-06-21T00:00:00.000Z',
    },
  },
]));

assert.equal(
  cache.get('golden-discovery', { categoryId: 'policy', targetCount: 30 }),
  undefined,
  'AI-excluded golden-discovery rows must not be cached',
);

cache.set('shopping-connect', { targetCount: 30 }, result([
  {
    keyword: '백팩 추천',
    grade: 'C',
    score: 20,
    pcSearchVolume: 700,
    mobileSearchVolume: 2090,
    totalSearchVolume: 2790,
    documentCount: 751936,
    goldenRatio: 0,
    cpc: null,
    category: 'shopping',
    source: 'pc-shopping-connect',
    intent: 'category',
    evidence: ['measured'],
    isMeasured: true,
    aiJudge: {
      verdict: 'publish',
      score: 80,
      confidence: 0.9,
      needIntent: 'medium',
      blogAngle: 'actionable',
      shoppingIntent: 'medium',
      adsenseValue: 'medium',
      freshnessRisk: 'low',
      spamRisk: 'low',
      reasons: ['fixture'],
      model: 'rule-judge-v1',
      checkedAt: '2026-06-21T00:00:00.000Z',
    },
    publishDecision: {
      verdict: 'exclude',
      score: 12,
      label: '제외',
      reasons: ['document count too high'],
      cautions: ['문서수가 너무 많음'],
      nextAction: '다른 후보를 발굴',
      titleAngles: [],
      clusterKeywords: [],
    },
  },
]));

assert.equal(
  cache.get('shopping-connect', { targetCount: 30 }),
  undefined,
  'publishDecision-excluded shopping rows must not satisfy daily prewarm cache minimums',
);

console.log('[mobile-result-cache.test] passed');
