import { buildMobileApiStatusSnapshot } from '../../mobile/api-status';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const env = {
  naverClientId: 'client-id-123456',
  naverClientSecret: 'client-secret-raw-value',
  naverSearchAdAccessLicense: 'searchad-license-raw-value',
  naverSearchAdSecretKey: '',
  naverSearchAdCustomerId: '',
  youtubeApiKey: '',
};

const snapshot = buildMobileApiStatusSnapshot({
  apiBaseUrl: 'http://192.168.0.10:34983',
  env,
  now: () => new Date('2026-06-06T00:00:00.000Z'),
});

assert('api status keeps PC API base url', snapshot.apiBaseUrl === 'http://192.168.0.10:34983');
assert('api status has stable timestamp', snapshot.updatedAt === '2026-06-06T00:00:00.000Z');

const openApi = snapshot.items.find((item) => item.id === 'naver-openapi');
assert('naver open api item exists', !!openApi);
assert('naver open api is ready with id and secret', openApi?.status === 'ready', openApi?.status);
assert('naver open api explains document count impact',
  openApi?.affects.includes('document-count') === true);

const searchAd = snapshot.items.find((item) => item.id === 'naver-searchad');
assert('searchad item exists', !!searchAd);
assert('searchad is partial when license exists but secret/customer are missing',
  searchAd?.status === 'partial', searchAd?.status);
assert('searchad reports missing secret key',
  searchAd?.missingKeys.includes('naverSearchAdSecretKey') === true);
assert('searchad reports missing customer id',
  searchAd?.missingKeys.includes('naverSearchAdCustomerId') === true);
assert('searchad explains search volume impact',
  searchAd?.affects.includes('search-volume') === true);

const youtube = snapshot.items.find((item) => item.id === 'youtube');
assert('youtube item exists', !!youtube);
assert('youtube is missing when api key is empty', youtube?.status === 'missing', youtube?.status);

assert('summary counts all diagnostic items',
  snapshot.summary.total === snapshot.items.length && snapshot.summary.total >= 5);
assert('overall status becomes partial when at least one required source is partial',
  snapshot.overallStatus === 'partial', snapshot.overallStatus);

const serialized = JSON.stringify(snapshot);
assert('diagnostic snapshot does not leak raw client secret',
  !serialized.includes('client-secret-raw-value'));
assert('diagnostic snapshot does not leak raw searchad license',
  !serialized.includes('searchad-license-raw-value'));
assert('diagnostic snapshot only exposes key lengths',
  serialized.includes('"length":23') || serialized.includes('"length":26'));

console.log('[mobile-api-status] passed');
