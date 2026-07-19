function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const searchAdModule = require('../naver-searchad-api');
const naverBlogModule = require('../naver-blog-api');
const { EnvironmentManager } = require('../environment-manager');
const environmentManager = EnvironmentManager.getInstance() as any;
const originalGetConfig = environmentManager.getConfig;
const originalSearchAdMeasure = searchAdModule.getNaverSearchAdKeywordVolume;
const originalDocumentMeasure = naverBlogModule.getNaverBlogDocumentCount;
const originalDocumentCacheMeasurement = naverBlogModule.peekCachedNaverBlogDocumentCountMeasurement;
const measuredAtMs = Date.parse('2026-07-15T00:55:00.000Z');
const documentMeasuredAt = '2026-07-15T00:56:00.000Z';
let receivedOptions: any = null;
let receivedDocumentKeyword = '';

environmentManager.getConfig = () => ({
  naverSearchAdAccessLicense: 'force-fresh-access-license',
  naverSearchAdSecretKey: 'force-fresh-secret-key',
  naverSearchAdCustomerId: '1000001',
});
searchAdModule.getNaverSearchAdKeywordVolume = async (
  _config: unknown,
  keywords: string[],
  options: unknown,
) => {
  receivedOptions = options;
  return keywords.map((keyword) => ({
    keyword,
    pcSearchVolume: 1_000,
    mobileSearchVolume: 5_400,
    totalSearchVolume: 6_400,
    monthlyAveCpc: 260,
    svEstimated: false,
    measuredAtMs,
    searchVolumeBindingVersion: 'keyword-keyed-v2',
  }));
};
naverBlogModule.getNaverBlogDocumentCount = async (keyword: string) => {
  receivedDocumentKeyword = keyword;
  return 321;
};
naverBlogModule.peekCachedNaverBlogDocumentCountMeasurement = () => ({
  total: 321,
  measuredAtMs: Date.parse(documentMeasuredAt),
  measuredAt: documentMeasuredAt,
});

function cleanup(): void {
  environmentManager.getConfig = originalGetConfig;
  searchAdModule.getNaverSearchAdKeywordVolume = originalSearchAdMeasure;
  naverBlogModule.getNaverBlogDocumentCount = originalDocumentMeasure;
  naverBlogModule.peekCachedNaverBlogDocumentCountMeasurement = originalDocumentCacheMeasurement;
}

async function run(): Promise<void> {
  // This repo carries an ignored legacy naver-datalab-api.js beside the TS
  // source, so require the TS module explicitly to exercise the build input.
  const { getNaverKeywordSearchVolumeSeparate } = require('../naver-datalab-api.ts');
  const rows = await getNaverKeywordSearchVolumeSeparate(
    { clientId: 'client', clientSecret: 'secret' },
    ['원룸 청소 업체 가격'],
    { includeDocumentCount: false, forceFresh: true },
  );
  assert(
    'datalab forwards forceFresh to the SearchAd cache boundary',
    receivedOptions?.forceFresh === true,
    JSON.stringify(receivedOptions),
  );
  assert(
    'datalab preserves exact-key binding marker and actual measurement time',
    rows.length === 1
      && rows[0]?.keyword === '원룸 청소 업체 가격'
      && rows[0]?.pcSearchVolume === 1_000
      && rows[0]?.mobileSearchVolume === 5_400
      && rows[0]?.searchVolumeBindingVersion === 'keyword-keyed-v2'
      && rows[0]?.searchVolumeMeasuredAt === '2026-07-15T00:55:00.000Z'
      && rows[0]?.searchVolumeSource === 'searchad'
      && rows[0]?.searchVolumeConfidence === 'high'
      && rows[0]?.isSearchVolumeEstimated === false,
    JSON.stringify(rows),
  );

  const rowsWithDocuments = await getNaverKeywordSearchVolumeSeparate(
    { clientId: 'client', clientSecret: 'secret' },
    ['원룸 청소 업체 가격'],
    { includeDocumentCount: true, forceFresh: true },
  );
  assert(
    'datalab preserves canonical broad Blog OpenAPI provenance and its original measurement time',
    rowsWithDocuments.length === 1
      && rowsWithDocuments[0]?.documentCount === 321
      && rowsWithDocuments[0]?.documentCountSource === 'naver-api'
      && rowsWithDocuments[0]?.documentCountConfidence === 'high'
      && rowsWithDocuments[0]?.documentCountQueryMode === 'broad'
      && rowsWithDocuments[0]?.documentCountQueryKey
        === naverBlogModule.naverBlogDocumentCountQueryKey('\uC6D0\uB8F8 \uCCAD\uC18C \uC5C5\uCCB4 \uAC00\uACA9')
      && rowsWithDocuments[0]?.documentCountMeasuredAt === documentMeasuredAt
      && rowsWithDocuments[0]?.isDocumentCountEstimated === false,
    JSON.stringify(rowsWithDocuments),
  );

  receivedDocumentKeyword = '';
  const quotedRows = await getNaverKeywordSearchVolumeSeparate(
    { clientId: 'client', clientSecret: 'secret' },
    ['"canonical broad keyword"'],
    { includeDocumentCount: true, forceFresh: true },
  );
  assert(
    'datalab removes exact-phrase quotes before declaring canonical broad scope',
    receivedDocumentKeyword === 'canonical broad keyword'
      && quotedRows[0]?.documentCountQueryKey
        === naverBlogModule.naverBlogDocumentCountQueryKey('canonical broad keyword'),
    JSON.stringify({ receivedDocumentKeyword, quotedRows }),
  );
}

run()
  .then(() => console.log('[naver-datalab-force-fresh-provenance.test] passed'))
  .finally(cleanup)
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
