import {
  CANONICAL_DOCUMENT_COUNT_QUERY_MODE,
  documentCountQueryForMode,
  selectDocumentCountMeasurement,
} from '../measure-dc';

function assert(name: string, condition: boolean, detail = ''): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

assert(
  'the product-wide document count definition is broad Naver Blog search',
  CANONICAL_DOCUMENT_COUNT_QUERY_MODE === 'broad',
);
assert(
  'canonical document count sends the original normalized keyword without exact quotes',
  documentCountQueryForMode('  에어컨   이전설치 비용  ', CANONICAL_DOCUMENT_COUNT_QUERY_MODE)
    === '에어컨 이전설치 비용',
);
assert(
  'exact phrase remains an explicitly labeled secondary query only',
  documentCountQueryForMode('에어컨 이전설치 비용', 'exact-phrase')
    === '"에어컨 이전설치 비용"',
);

for (const quoted of [
  '"alpha  beta"',
  '“alpha  beta”',
  '„alpha  beta‟',
  '«alpha  beta»',
  '＂alpha  beta＂',
]) {
  assert(
    `broad query strips every supported quote operator: ${quoted}`,
    documentCountQueryForMode(quoted, 'broad') === 'alpha beta',
  );
  assert(
    `exact query wraps normalized text exactly once: ${quoted}`,
    documentCountQueryForMode(quoted, 'exact-phrase') === '"alpha beta"',
  );
}

const measuredAt = '2026-07-18T00:00:00.000Z';
const apiWins = selectDocumentCountMeasurement(120, 9_900, 'broad', measuredAt);
assert(
  'Naver OpenAPI total wins even when HTML scraping differs greatly',
  apiWins?.dc === 120 && apiWins.source === 'naver-api' && apiWins.queryMode === 'broad',
);

const zeroApiWins = selectDocumentCountMeasurement(0, 350, 'broad', measuredAt);
assert(
  'an explicit OpenAPI zero is a valid measured total',
  zeroApiWins?.dc === 0 && zeroApiWins.source === 'naver-api',
);

const scrapeIsSecondary = selectDocumentCountMeasurement(null, 350, 'broad', measuredAt);
assert(
  'scraping remains a secondary diagnostic value only',
  scrapeIsSecondary?.source === 'scrape' && scrapeIsSecondary.confidence === 'medium',
);
assert(
  'an API total without its source measurement timestamp fails closed',
  selectDocumentCountMeasurement(120, null, 'broad') === null,
);

console.log('[document-count-policy.test] passed');
