import * as fs from 'fs';
import * as path from 'path';
import {
  calculateAdsenseApprovalProfile,
  buildAdsenseApprovalContentCluster,
  evaluateAdsenseApprovalReadiness,
  evaluateAdsenseKeyword,
  calculateZeroClickRisk,
  classifySearchIntent,
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
assert('승인용 S+는 원본성 각도까지 충분해야 한다',
  approval.originalityScore >= 70 && approval.reasons.includes('원본성 각도 충분'),
  `${approval.originalityScore} ${approval.reasons.join(',')}`);
assert('승인용 제목 후보는 실제 글 발행 각도를 제공한다',
  approval.titleCandidates.length >= 3 && approval.titleCandidates.every(t => t.includes(safeKeyword)),
  approval.titleCandidates.join(' | '));
assert('승인용 S+는 초보자가 바로 시리즈로 발행할 콘텐츠 클러스터를 제공한다',
  approval.contentCluster.length >= 8
    && approval.contentCluster.some(item => item.intent === 'eligibility' && /대상|자격/.test(item.keyword))
    && approval.contentCluster.some(item => item.intent === 'documents' && /서류|준비물/.test(item.keyword))
    && approval.contentCluster.some(item => item.intent === 'mistakes' && /주의사항|실수/.test(item.title)),
  approval.contentCluster.map(item => `${item.intent}:${item.keyword}`).join(' | '));
assert('AdSense approval S+ requires a ready publishing cluster',
  approval.approvalReadiness.ready === true
    && approval.readinessScore >= 75
    && approval.approvalReadiness.missingFamilies.length <= 1
    && approval.reasons.includes('승인용 글감 묶음 충분'),
  JSON.stringify(approval.approvalReadiness));
assert('승인용 클러스터는 글 순서와 고유 제목까지 제공한다',
  approval.contentCluster.every((item, index) =>
    item.order === index + 1
    && item.title.includes(item.keyword)
    && item.angle.length >= 8
  ),
  JSON.stringify(approval.contentCluster));

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

const thinCopyKeyword = '아이유 나이 프로필';
const thinCopyApproval = calculateAdsenseApprovalProfile({
  keyword: thinCopyKeyword,
  category: 'all',
  searchVolume: 2400,
  documentCount: 600,
  dataSource: 'naver-api',
  infoIntentScore: 88,
  safety: 'safe',
  ymylRisk: 'low',
  writable: true,
  adsenseEligibility: evaluateAdsenseEligibility({
    keyword: thinCopyKeyword,
    ymylRisk: 'low',
    safety: 'safe',
    dataConfidence: 'high',
  }),
  zeroClickRisk: calculateZeroClickRisk(thinCopyKeyword),
  crossValidation: verifiedCross,
});
assert('단답/프로필/복붙형 주제는 실측 수치가 좋아도 승인 S/S+로 승격하지 않는다',
  !['S+', 'S'].includes(thinCopyApproval.grade)
    && thinCopyApproval.originalityScore < 45
    && thinCopyApproval.contentCluster.length <= 3
    && thinCopyApproval.approvalReadiness.ready === false
    && thinCopyApproval.risks.includes('원본성 낮음: 단답/프로필/복붙형 주제'),
  `${thinCopyApproval.grade} ${thinCopyApproval.score} ${thinCopyApproval.originalityScore} cluster=${thinCopyApproval.contentCluster.length} ${thinCopyApproval.risks.join(',')}`);

const directCluster = buildAdsenseApprovalContentCluster('근로장려금 신청', 'subsidy', 10);
assert('승인용 클러스터 빌더는 신청형 정책 키워드를 10개 글감으로 확장한다',
  directCluster.length === 10
    && directCluster[0].intent === 'overview'
    && directCluster.some(item => /지급일/.test(item.keyword))
    && directCluster.some(item => /FAQ/.test(item.angle)),
  directCluster.map(item => `${item.order}:${item.keyword}:${item.angle}`).join(' | '));
const reviewCluster = buildAdsenseApprovalContentCluster('공기청정기 추천 비교', 'review', 10);
assert('Review-style approval clusters are expanded beyond thin five-item templates',
  reviewCluster.length >= 8
    && evaluateAdsenseApprovalReadiness(reviewCluster).ready === true,
  reviewCluster.map(item => `${item.intent}:${item.keyword}`).join(' | '));
const shallowCluster = directCluster.filter(item => ['overview', 'faq', 'comparison'].includes(item.intent));
assert('Approval readiness rejects shallow clusters without action/evidence/followup coverage',
  evaluateAdsenseApprovalReadiness(shallowCluster).ready === false
    && evaluateAdsenseApprovalReadiness(shallowCluster).score < 65,
  JSON.stringify(evaluateAdsenseApprovalReadiness(shallowCluster)));

const transactionalKeyword = '아이폰 17 가격 할인 구매 비교';
const transactionalApproval = calculateAdsenseApprovalProfile({
  keyword: transactionalKeyword,
  category: 'smartphone',
  searchVolume: 2400,
  documentCount: 600,
  dataSource: 'naver-api',
  infoIntentScore: 92,
  safety: 'safe',
  ymylRisk: 'low',
  writable: true,
  adsenseEligibility: evaluateAdsenseEligibility({
    keyword: transactionalKeyword,
    ymylRisk: 'low',
    safety: 'safe',
    dataConfidence: 'high',
  }),
  zeroClickRisk: calculateZeroClickRisk(transactionalKeyword),
  crossValidation: verifiedCross,
});
assert('거래형 구매 키워드는 수치가 좋아도 승인용 S/S+로 승격하지 않는다',
  classifySearchIntent(transactionalKeyword).primary === 'transactional'
    && !['S+', 'S'].includes(transactionalApproval.grade)
    && transactionalApproval.risks.includes('거래형 의도: 승인용보다 구매/쇼핑 글감에 가까움'),
  `${classifySearchIntent(transactionalKeyword).primary} ${transactionalApproval.grade} ${transactionalApproval.score} ${transactionalApproval.risks.join(',')}`);

const approvalKeywordData = evaluateAdsenseKeyword({
  keyword: safeKeyword,
  category: 'subsidy',
  searchVolume: 2400,
  documentCount: 600,
  dataSource: 'naver-api',
  realCpc: 300,
});
assert('AdSense 호환 등급/문구도 수익이 아니라 승인등급에서 파생된다',
  approvalKeywordData.grade === 'SSS'
    && approvalKeywordData.approvalGrade === 'S+'
    && /승인\s*S\+/.test(approvalKeywordData.gradeReason)
    && !/(Publisher|RPM|월\s*[0-9,.]+|월수익|실수익|예상수익)/i.test(approvalKeywordData.gradeReason),
  `${approvalKeywordData.grade} ${approvalKeywordData.approvalGrade} ${approvalKeywordData.gradeReason}`);

const highRevenueYmylBait = evaluateAdsenseKeyword({
  keyword: ymylKeyword,
  category: 'loan',
  searchVolume: 6000,
  documentCount: 500,
  dataSource: 'naver-api',
  realCpc: 12000,
});
assert('고CPC/YMYL 키워드는 수익이 커도 승인 호환 등급으로 SSS/SS가 되지 않는다',
  !['SSS', 'SS'].includes(highRevenueYmylBait.grade)
    && !/(Publisher|RPM|월\s*[0-9,.]+|월수익|실수익|예상수익)/i.test(highRevenueYmylBait.gradeReason),
  `${highRevenueYmylBait.grade} ${highRevenueYmylBait.approvalGrade} ${highRevenueYmylBait.gradeReason}`);

const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');
const adsenseEngine = fs.readFileSync(path.join(__dirname, '..', 'adsense-keyword-hunter.ts'), 'utf8');
const premiumHunting = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'premium-hunting.ts'), 'utf8');

assert('AdSense UI는 실측 검색량+문서수만 고정한다',
  /id="adsenseRequireReal"\s+checked\s+disabled/.test(html)
    && /const\s+requireRealData\s*=\s*true/.test(html),
  'real-data-only UI guard missing');
assert('AdSense 기본 정렬은 수익이 아니라 승인 적합도다',
  /<option\s+value="approval"\s+selected>✅ 승인 적합도<\/option>/.test(html)
    && /minApprovalScore:\s*typeof\s+options\?\.minApprovalScore/.test(premiumHunting),
  'approval-first defaults missing');
assert('AdSense UI는 원본성/글감 확장성을 승인 기준으로 노출한다',
  /원본성/.test(html) && /글감 확장성/.test(html),
  'originality copy missing');
assert('AdSense UI final output keeps measured approval-grade candidates only',
  /const\s+approvalGradeRank\s*=\s*\{[^}]*'S\+'\s*:\s*4[^}]*S\s*:\s*3[^}]*A\s*:\s*2/s.test(html)
    && /const\s+minApprovalGrade\s*=/.test(html)
    && /const\s+isRealMeasuredApproval\s*=/.test(html)
    && /dataSource\s*!==\s*'estimated'/.test(html)
    && /approvalProfile\?\.measured\s*!==\s*false/.test(html)
    && /approvalProfile\?\.approvalReadiness/.test(html)
    && /readiness\.score/.test(html)
    && /approvalScore\s*<\s*minApprovalScore/.test(html)
    && /valueGate\?\.isKilled/.test(html),
  'final measured approval gate missing');
assert('AdSense UI 카드에는 수익형 gradeReason을 직접 노출하지 않는다',
  !/\$\{kw\.gradeReason\}/.test(html)
    && /approvalReason/.test(html)
    && /approvalRisk/.test(html),
  'revenue gradeReason still rendered');
assert('AdSense backend final filter enforces publishing-cluster readiness',
  /const\s+readiness\s*=\s*k\.approvalProfile\?\.approvalReadiness/.test(adsenseEngine)
    && /!readiness\s*\|\|\s*!readiness\.ready/.test(adsenseEngine)
    && /\(readiness\.score\s*\|\|\s*0\)\s*<\s*65/.test(adsenseEngine),
  'backend readiness gate missing');

console.log(`\n[adsense-approval-purpose.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
