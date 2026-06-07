/**
 * pattern-generator-domain-intents.test.ts
 *
 * Domain discovery must generate intent patterns that match the user's writing
 * target. Sports issue seeds should produce schedule/broadcast/ticketing terms,
 * not only shopping-style recommendation patterns.
 */

import { generateQueryPatterns } from '../pattern-generator';
import { splitKeywordSemantically } from '../semantic-splitter';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const sportsPatterns = generateQueryPatterns(splitKeywordSemantically('KBO 올스타전'), []);
const sportsText = sportsPatterns.join('|');
assert(
  'sports seeds generate live issue intents',
  /중계|경기일정|티켓팅 일정|라인업|하이라이트|티켓 예매/.test(sportsText),
  sportsPatterns.slice(0, 30).join('|')
);
assert(
  'sports seeds avoid shopping-only intent drift',
  sportsPatterns.slice(0, 12).every(pattern => !/최저가|렌탈|대여|성분|부작용/.test(pattern)),
  sportsPatterns.slice(0, 20).join('|')
);

const policyPatterns = generateQueryPatterns(splitKeywordSemantically('청년 지원금'), []);
assert(
  'policy seeds still generate application intents',
  policyPatterns.some(pattern => /신청방법|자격|대상|정책브리핑/.test(pattern)),
  policyPatterns.slice(0, 20).join('|')
);

console.log(`\n[pattern-generator-domain-intents.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
