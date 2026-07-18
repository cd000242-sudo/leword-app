import { richRowsFromLiveGoldenSnapshot } from '../../main/handlers/source-signals';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const documentCountMeasuredAt = '2026-07-17T00:10:00.000Z';
const searchVolumeMeasuredAt = '2026-07-17T00:09:00.000Z';
const rows = richRowsFromLiveGoldenSnapshot({
  board: [{
    rank: 1,
    keyword: '제주 렌터카 가격 비교',
    category: 'travel_domestic',
    grade: 'SSS',
    totalSearchVolume: 8_400,
    documentCount: 320,
    goldenRatio: 26.25,
    source: 'server-live-golden',
    evidence: ['naver-openapi-broad'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeMeasuredAt,
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    documentCountMeasuredAt,
    isDocumentCountEstimated: false,
  }],
});

assert('source-signals adapter maps the server board row', rows.length === 1, JSON.stringify(rows));
assert(
  'source-signals adapter preserves document scope and both measurement timestamps',
  rows[0]?.documentCountSource === 'naver-api'
    && rows[0]?.documentCountConfidence === 'high'
    && rows[0]?.documentCountQueryMode === 'broad'
    && rows[0]?.documentCountMeasuredAt === documentCountMeasuredAt
    && rows[0]?.searchVolumeMeasuredAt === searchVolumeMeasuredAt
    && rows[0]?.isDocumentCountEstimated === false
    && rows[0]?.isSearchVolumeEstimated === false
    && rows[0]?.dcEstimated === false
    && rows[0]?.svEstimated === false,
  JSON.stringify(rows[0]),
);

console.log('[live-golden-source-signals-provenance.test] passed');
process.exit(0);
