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

const apiWins = selectDocumentCountMeasurement(120, 9_900, 'broad');
assert(
  'Naver OpenAPI total wins even when HTML scraping differs greatly',
  apiWins?.dc === 120 && apiWins.source === 'naver-api' && apiWins.queryMode === 'broad',
);

const zeroApiWins = selectDocumentCountMeasurement(0, 350, 'broad');
assert(
  'an explicit OpenAPI zero is a valid measured total',
  zeroApiWins?.dc === 0 && zeroApiWins.source === 'naver-api',
);

const scrapeIsSecondary = selectDocumentCountMeasurement(null, 350, 'broad');
assert(
  'scraping remains a secondary diagnostic value only',
  scrapeIsSecondary?.source === 'scrape' && scrapeIsSecondary.confidence === 'medium',
);

console.log('[document-count-policy.test] passed');
