import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const quotaFile = path.join(process.cwd(), 'tmp', 'searchad-account-pool-integration-quota.json');
fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
fs.rmSync(quotaFile, { force: true });

process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'] = quotaFile;
process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '1';
process.env['LEWORD_SEARCHAD_ACCOUNTS_B64'] = Buffer.from(JSON.stringify([
  {
    customerId: '2000002',
    accessLicense: 'second-access-license-value',
    secretKey: 'second-secret-key-value',
  },
  {
    customerId: '3000003',
    accessLicense: 'third-access-license-value',
    secretKey: 'third-secret-key-value',
  },
]), 'utf8').toString('base64');

const customers: string[] = [];
const originalFetch = global.fetch;
(global as any).fetch = async (url: string, options: any) => {
  customers.push(String(options?.headers?.['X-Customer'] || ''));
  const parsed = new URL(url);
  const hints = String(parsed.searchParams.get('hintKeywords') || '').split(',').filter(Boolean);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      keywordList: hints.map((keyword) => ({
        relKeyword: keyword,
        monthlyPcQcCnt: 100,
        monthlyMobileQcCnt: 900,
        monthlyAveCpc: 500,
        compIdx: 'HIGH',
      })),
    }),
  } as any;
};

async function run(): Promise<void> {
  const { getNaverSearchAdKeywordVolume } = require('../naver-searchad-api');
  const primary = {
    customerId: '1000001',
    accessLicense: 'primary-access-license-value',
    secretKey: 'primary-secret-key-value',
  };
  const rows = await getNaverSearchAdKeywordVolume(
    primary,
    Array.from({ length: 9 }, (_, index) => `poolkeyword${index + 1}`),
    { forceFresh: true, recursive: false },
  );
  assert('volume batches fail over across every available SearchAd account',
    customers.join(',') === '1000001,2000002,3000003',
    customers.join(','));
  assert('every batch remains measured while another account has quota',
    rows.length === 9 && rows.every((item: any) => item.totalSearchVolume === 1000),
    JSON.stringify(rows));

  const callsBeforeExhaustedProbe = customers.length;
  const exhausted = await getNaverSearchAdKeywordVolume(
    primary,
    ['poolkeywordexhausted'],
    { forceFresh: true, recursive: false },
  );
  assert('pool fails closed without an HTTP request after every account reaches its ceiling',
    customers.length === callsBeforeExhaustedProbe
      && exhausted.length === 1
      && exhausted[0]?.totalSearchVolume === null,
    JSON.stringify({ customers, exhausted }));
}

run()
  .then(() => console.log('[searchad-account-pool-integration.test] passed'))
  .finally(() => {
    (global as any).fetch = originalFetch;
    delete process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'];
    delete process.env['LEWORD_SEARCHAD_SOFT_CEILING'];
    delete process.env['LEWORD_SEARCHAD_ACCOUNTS_B64'];
    fs.rmSync(quotaFile, { force: true });
  });

export {};
