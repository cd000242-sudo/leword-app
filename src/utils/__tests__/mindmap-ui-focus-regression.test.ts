import * as fs from 'fs';
import * as path from 'path';

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

const ui = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');

assert('related keyword modal has a front/focus helper',
  /window\.ensureRelatedKeywordModalFront\s*=\s*function/.test(ui)
    && /modal\.style\.zIndex\s*=\s*'2147483000'/.test(ui)
    && /modal\.focus\(\{ preventScroll: true \}\)/.test(ui),
  'mindmap modal can open behind existing overlays');

assert('mindmap open path brings the modal to the front after launch',
  /window\.lewordOpenMindmapForSeed[\s\S]{0,900}window\.openRelatedKeywordModal\(\);[\s\S]{0,220}window\.ensureRelatedKeywordModalFront\?\.\(\)/.test(ui),
  'seed-to-mindmap path does not refocus the modal');

assert('existing completed mindmap modal is restored to front',
  /existingModal && existingModal\.dataset\.completed === 'true'[\s\S]{0,260}window\.ensureRelatedKeywordModalFront\?\.\(existingModal\)/.test(ui),
  'restored minimized result can remain behind');

console.log(`\n[mindmap-ui-focus-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
