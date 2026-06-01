import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', '..', '..');

const files = [
  'src/main/handlers/premium-hunting.ts',
  'src/main/handlers/keyword-analysis.ts',
  'src/main/handlers/keyword-discovery.ts',
  'src/utils/keyword-competition/blogdex-estimator.ts',
  'src/utils/keyword-competition/keyword-recommender.ts',
  'src/utils/timing-golden-finder.ts',
  'src/utils/traffic-explosion-hunter.ts',
  'src/utils/pro-traffic-keyword-hunter.ts',
  'src/utils/sources/rich-feed-builder.ts',
  'src/utils/sources/category-seed-catalog.ts',
];

const forbidden = [
  { label: 'fake rank', re: /rank:\s*Math\./ },
  { label: 'fake total results', re: /totalResults:\s*Math\./ },
  { label: 'fake CTR', re: /estimatedCTR:\s*\(?Math\./ },
  { label: 'random growth rate', re: /growthRate\s*=\s*[^;\n]*Math\.random/ },
  { label: 'random CPC', re: /estimatedCPC\s*=\s*[^;\n]*Math\.random/ },
  { label: 'random exposure potential', re: /topExposurePotential\s*=\s*[^;\n]*Math\.random/ },
  { label: 'random recommendation score', re: /estimatedScore\s*\+=\s*[^;\n]*Math\.random/ },
  { label: 'random volume estimate', re: /(searchVolume|publishVolume):\s*[^,\n]*Math\.random/ },
  { label: 'random score field', re: /(score|confidence|wordCount):\s*[^,\n]*Math\.random/ },
  { label: 'index-based SSS', re: /index\s*[<=>][^;\n]*['"]SSS['"]/ },
];

const violations: string[] = [];

for (const rel of files) {
  const abs = path.join(root, rel);
  const text = fs.readFileSync(abs, 'utf8');
  for (const rule of forbidden) {
    if (rule.re.test(text)) {
      violations.push(`${rel}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('[deterministic-scoring-regression] failed');
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}

console.log('[deterministic-scoring-regression] passed');
