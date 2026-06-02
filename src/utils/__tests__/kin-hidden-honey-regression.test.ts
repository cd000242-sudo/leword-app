import * as fs from 'fs';
import * as path from 'path';

const file = path.join(__dirname, '..', 'naver-kin-golden-hunter-v3.ts');
const text = fs.readFileSync(file, 'utf8');

const start = text.indexOf('export async function getTrendingHiddenQuestions');
const end = text.indexOf('export async function', start + 1);
const block = text.slice(start, end > start ? end : text.length);

function assert(name: string, condition: boolean): void {
  if (!condition) {
    console.error(`[kin-hidden-honey-regression] failed: ${name}`);
    process.exit(1);
  }
}

assert('trending hidden hunter exists', start >= 0);
assert('effective answer count is calculated', /const effAns\s*=/.test(block));
assert('over-answered questions are filtered before scoring', /if\s*\(effAns\s*>\s*3\)\s*continue/.test(block));
assert('stored answer count uses effAns', /answerCount:\s*effAns/.test(block));
assert('detail answer count is not stored directly in trending hidden mode', !/answerCount:\s*detail\.answerCount/.test(block));
assert('freshness resolver preserves real latest time', /resolveKinFreshHoursAgo\(q\.hoursAgo,\s*detail\.hoursAgoFromDetail,\s*24\)/.test(block));
assert('hidden mode does not hardcode every candidate to 24h', !/const\s+finalHoursAgo\s*=\s*24\s*;/.test(block));
assert('latest hidden candidate gate rejects known main-exposed questions', /Boolean\(q\.isMainExposed\)\)\s*return false/.test(text));
assert('latest hidden candidate gate requires a real answer gap',
  /isLatestHiddenHoneyCandidate[\s\S]*hasKinAnswerGap\(\{\s*\.\.\.q,\s*viewsPerHour\s*\}\)/.test(text));
assert('actionable demand gate requires a real answer gap',
  /hasActionableHoneyDemand[\s\S]*hasKinAnswerGap\(\{\s*\.\.\.q,\s*viewsPerHour\s*\}\)/.test(text));
assert('latest hidden sort prioritizes real answer gap score',
  /getLatestHiddenSortScore[\s\S]*getKinAnswerGapScore\(withVelocity\)/.test(text));
assert('latest hidden sort does not force every candidate to isMainExposed false', !/getLatestHiddenSortScore[\s\S]*buildKinSignals\(withVelocity,\s*\{\s*isMainExposed:\s*false\s*\}\)/.test(text));
assert('premium latest hidden final output keeps only actionable SSS/SS/S questions', /filter\(q\s*=>\s*isActionableHoneyResult\(q\)\)/.test(block));
assert('both hidden premium hunters use actionable final output gate',
  (text.match(/filter\(q\s*=>\s*isActionableHoneyResult\(q\)\)/g) || []).length >= 2);
assert('actionable honey result includes a real demand gate',
  /export function hasActionableHoneyDemand/.test(text)
    && /isActionableHoneyResult[\s\S]*hasActionableHoneyDemand\(q\)/.test(text));
assert('extra detail browser acquired by hidden hunters is released',
  (text.match(/if\s*\(detailBrowser\s*!==\s*browser\)\s*\{\s*await releaseBrowser\(detailBrowser\);/g) || []).length >= 2);

console.log('[kin-hidden-honey-regression] passed');
