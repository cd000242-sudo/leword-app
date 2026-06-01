import * as fs from 'fs';
import * as path from 'path';
import {
  calculateAdsenseApprovalProfile,
  calculateZeroClickRisk,
  evaluateAdsenseEligibility,
  type CrossValidationResult,
} from '../adsense-keyword-hunter';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const verifiedCross: CrossValidationResult = {
  level: 'verified',
  score: 6,
  signals: {
    naverApi: true,
    naverSuggest: true,
    proCrossSource: true,
    wikiPageView: true,
    googleTrends: true,
    youtubeResults: true,
  },
  summary: 'verified',
};

const safeKeyword = '소상공인 지원금 신청 서류 체크리스트';
const safeEligibility = evaluateAdsenseEligibility({
  keyword: safeKeyword,
  ymylRisk: 'low',
  safety: 'safe',
  dataConfidence: 'high',
});
const approval = calculateAdsenseApprovalProfile({
  keyword: safeKeyword,
  category: 'subsidy',
  searchVolume: 2400,
  documentCount: 600,
  dataSource: 'naver-api',
  infoIntentScore: 92,
  safety: 'safe',
  ymylRisk: 'low',
  writable: true,
  adsenseEligibility: safeEligibility,
  zeroClickRisk: calculateZeroClickRisk(safeKeyword),
  crossValidation: verifiedCross,
});

assert('승인용 S+는 실측 안전 정보형 글감에서만 나온다',
  approval.grade === 'S+' && approval.measured && approval.score >= 85,
  `${approval.grade} ${approval.score} ${approval.summary}`);
assert('승인용 제목 후보는 실제 글 발행 각도를 제공한다',
  approval.titleCandidates.length >= 3 && approval.titleCandidates.every(t => t.includes(safeKeyword)),
  approval.titleCandidates.join(' | '));

const estimated = calculateAdsenseApprovalProfile({
  keyword: safeKeyword,
  category: 'subsidy',
  searchVolume: 2400,
  documentCount: 600,
  dataSource: 'estimated',
  infoIntentScore: 92,
  safety: 'safe',
  ymylRisk: 'low',
  writable: true,
  adsenseEligibility: safeEligibility,
  zeroClickRisk: calculateZeroClickRisk(safeKeyword),
  crossValidation: verifiedCross,
});
assert('추정 데이터는 승인 핵심 후보로 승격하지 않는다',
  estimated.grade === 'B' && estimated.score <= 55 && estimated.risks.includes('실측 검색량+문서수 미확보'),
  `${estimated.grade} ${estimated.score} ${estimated.risks.join(',')}`);

const bigKeyword = calculateAdsenseApprovalProfile({
  keyword: '지원금 신청 방법',
  category: 'subsidy',
  searchVolume: 52000,
  documentCount: 1200,
  dataSource: 'naver-api',
  infoIntentScore: 90,
  safety: 'safe',
  ymylRisk: 'low',
  writable: true,
  adsenseEligibility: evaluateAdsenseEligibility({
    keyword: '지원금 신청 방법',
    ymylRisk: 'low',
    safety: 'safe',
    dataConfidence: 'high',
  }),
  zeroClickRisk: calculateZeroClickRisk('지원금 신청 방법'),
  crossValidation: verifiedCross,
});
assert('너무 큰 키워드는 승인용 S+로 보지 않는다',
  bigKeyword.grade !== 'S+' && bigKeyword.risks.some(r => r.includes('너무 큰 키워드')),
  `${bigKeyword.grade} ${bigKeyword.score} ${bigKeyword.risks.join(',')}`);

const ymylKeyword = '대출 한도 계산기 비교 방법';
const ymylApproval = calculateAdsenseApprovalProfile({
  keyword: ymylKeyword,
  category: 'loan',
  searchVolume: 2000,
  documentCount: 500,
  dataSource: 'naver-api',
  infoIntentScore: 90,
  safety: 'caution',
  ymylRisk: 'high',
  writable: true,
  adsenseEligibility: evaluateAdsenseEligibility({
    keyword: ymylKeyword,
    ymylRisk: 'high',
    safety: 'caution',
    dataConfidence: 'high',
  }),
  zeroClickRisk: calculateZeroClickRisk(ymylKeyword),
  crossValidation: verifiedCross,
});
assert('YMYL 고위험은 수치가 좋아도 승인 S/S+로 승격하지 않는다',
  !['S+', 'S'].includes(ymylApproval.grade) && ymylApproval.score <= 52,
  `${ymylApproval.grade} ${ymylApproval.score}`);

const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const premiumHunting = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'premium-hunting.ts'), 'utf8');

assert('AdSense UI는 실측 검색량+문서수만 고정한다',
  /id="adsenseRequireReal"\s+checked\s+disabled/.test(html)
    && /const\s+requireRealData\s*=\s*true/.test(html),
  'real-data-only UI guard missing');
assert('AdSense 기본 정렬은 수익이 아니라 승인 적합도다',
  /<option\s+value="approval"\s+selected>✅ 승인 적합도<\/option>/.test(html)
    && /minApprovalScore:\s*typeof\s+options\?\.minApprovalScore/.test(premiumHunting),
  'approval-first defaults missing');

console.log(`\n[adsense-approval-purpose.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
