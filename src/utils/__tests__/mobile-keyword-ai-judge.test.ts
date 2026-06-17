import {
  applyKeywordAiJudge,
  judgeKeywordMetric,
  keywordMeasurementStatus,
} from '../../mobile/keyword-ai-judge';
import type { MobileKeywordMetric } from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function metric(overrides: Partial<MobileKeywordMetric>): MobileKeywordMetric {
  return {
    keyword: '청년도약계좌 신청 방법',
    grade: 'SSS',
    score: 92,
    pcSearchVolume: 320,
    mobileSearchVolume: 1680,
    totalSearchVolume: 2000,
    documentCount: 180,
    goldenRatio: 11.11,
    cpc: 180,
    category: 'policy',
    source: 'fixture-measured',
    intent: 'golden-discovery',
    evidence: ['fixture-searchad-volume', 'fixture-naver-blog-document-count'],
    isMeasured: true,
    ...overrides,
  };
}

(() => {
  const good = metric({});
  const goodJudge = judgeKeywordMetric(good, new Date('2026-06-17T00:00:00.000Z'));
  assert('measured actionable policy keyword is publishable',
    goodJudge.verdict === 'publish'
      && goodJudge.needIntent === 'strong'
      && goodJudge.adsenseValue === 'high',
    JSON.stringify(goodJudge));

  const profile = metric({
    keyword: '전영현 프로필',
    category: 'celeb',
    totalSearchVolume: 9000,
    documentCount: 120,
    goldenRatio: 75,
  });
  const profileJudge = judgeKeywordMetric(profile, new Date('2026-06-17T00:00:00.000Z'));
  assert('thin profile keyword is excluded even with attractive raw metrics',
    profileJudge.verdict === 'exclude'
      && profileJudge.blogAngle === 'thin'
      && profileJudge.rejectReason === 'thin-lookup-or-profile-intent',
    JSON.stringify(profileJudge));

  const synthetic = metric({
    keyword: 'sample golden keyword',
    source: 'server-intent-template',
    evidence: ['estimated fallback'],
  });
  assert('synthetic marker is detected before display',
    keywordMeasurementStatus(synthetic) === 'synthetic-blocked');
  const syntheticJudge = judgeKeywordMetric(synthetic);
  assert('synthetic result is excluded',
    syntheticJudge.verdict === 'exclude'
      && syntheticJudge.rejectReason === 'synthetic-or-estimated-result-blocked',
    JSON.stringify(syntheticJudge));

  const preserved = applyKeywordAiJudge(profile, { downgradeExcluded: false });
  assert('PC engine can attach judge without mutating legacy grade',
    preserved.grade === 'SSS' && preserved.aiJudge?.verdict === 'exclude');

  const downgraded = applyKeywordAiJudge(profile);
  assert('server/live board downgrade removes false SSS status',
    downgraded.grade === 'C' && downgraded.rejectReason === 'thin-lookup-or-profile-intent',
    JSON.stringify(downgraded));

  console.log('[mobile-keyword-ai-judge.test] passed');
  process.exit(0);
})();
