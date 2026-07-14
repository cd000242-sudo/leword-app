function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const searchAdModule = require('../naver-searchad-api');
const { EnvironmentManager } = require('../environment-manager');
const environmentManager = EnvironmentManager.getInstance() as any;
const originalGetConfig = environmentManager.getConfig;
const originalSearchAdMeasure = searchAdModule.getNaverSearchAdKeywordVolume;
const measuredAtMs = Date.parse('2026-07-15T00:55:00.000Z');
let receivedOptions: any = null;

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
    measuredAtMs,
    searchVolumeBindingVersion: 'keyword-keyed-v2',
  }));
};

function cleanup(): void {
  environmentManager.getConfig = originalGetConfig;
  searchAdModule.getNaverSearchAdKeywordVolume = originalSearchAdMeasure;
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
      && rows[0]?.searchVolumeMeasuredAt === '2026-07-15T00:55:00.000Z',
    JSON.stringify(rows),
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
