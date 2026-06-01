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

const htmlPath = path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert('keyword analyzer default option is 10',
  /name="keywordLimit"\s+value="10"\s+checked/.test(html),
  'keywordLimit checked value is not 10');

assert('keyword analyzer JS fallback defaults to 10',
  /const\s+limitValue\s*=\s*limitRadio\?\.value\s*\|\|\s*'10'/.test(html),
  'limitValue fallback is not 10');

assert('PRO traffic UI exposes 250 result option',
  /<option\s+value="250"[^>]*>250개/.test(html),
  '250 option missing');

assert('PRO traffic UI clamps requested count to 250',
  /Math\.min\(250,\s*Math\.floor\(countNum\)\)/.test(html),
  'UI clamp is not 250');

console.log(`\n[ui-count-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
