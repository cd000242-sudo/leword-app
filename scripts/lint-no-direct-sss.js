#!/usr/bin/env node
/**
 * Cross-platform version of lint-no-direct-sss.sh.
 * Detects direct SSS grade assignment outside the sanity-gate SSoT.
 */

const fs = require('fs');
const path = require('path');

const strictMode = process.argv.includes('--strict');
const root = path.join(__dirname, '..', 'src');
const directSssRe = /grade\s*=\s*['"]SSS['"]|grade:\s*['"]SSS['"],/;
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !fullPath.endsWith('.ts')) continue;

    const rel = path.relative(path.join(__dirname, '..'), fullPath).replace(/\\/g, '/');
    if (rel === 'src/utils/sanity-gate.ts') continue;
    if (rel.includes('src/utils/__tests__/')) continue;

    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!directSssRe.test(line)) return;
      if (line.includes('applySanity')) return;
      if (line.includes("'SSS' |") || line.includes('"SSS" |')) return;
      violations.push(`${rel}:${idx + 1}:${line.trim()}`);
    });
  }
}

walk(root);

if (violations.length === 0) {
  console.log('✅ Direct SSS 할당 위반 없음 (sanity-gate SSoT 100% 준수)');
  process.exit(0);
}

if (strictMode) {
  console.error(`❌ Direct SSS 할당 발견 (strict mode) — SSoT 우회 위반 ${violations.length}건:`);
  console.error(violations.join('\n'));
  console.error('\n→ src/utils/sanity-gate.ts 의 applySanity(\'SSS\', sanityResult) 경유로 변경 필요');
  process.exit(1);
}

console.warn(`⚠️ Direct SSS 할당 ${violations.length}건 발견 (warning, exit 0):`);
console.warn(violations.join('\n'));
process.exit(0);
