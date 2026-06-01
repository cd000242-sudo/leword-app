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

console.log('[kin-hidden-honey-regression] passed');
