import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isAffiliatePublishingEnabled, publishAppAffiliateSnapshot } from '../../main/affiliate-publisher';

const now = Date.parse('2026-10-03T12:00:00Z');
const stamp = new Date(now).toISOString();
const older = '2026-09-16T08:29:38.614Z';
const sha = 'a'.repeat(40);
const product = (name = '상품') => ({ name, brand: '브랜드', image: 'https://example.com/image.png', url: 'https://example.com/product?token=PRIVATE&id=1', reward: '수수료 5%', price: 10000,
  keyword: '브랜드 상품', searchVolume: 100, documentCount: 70, collectedAt: stamp, token: 'PRIVATE',
  keywordEvidence: [{ query: '브랜드 상품', serpQuery: '브랜드 상품', monthlySearches: 100, documentCount: 70, measuredAt: stamp, source: 'naver-searchad+blog-search', serpTop: { sampled: 10, exact: 1, partial: 2, cookie: 'PRIVATE' }, cookie: 'PRIVATE' }],
  productEvidence: [{ id: 'p1', sourceType: 'official-product', excerpt: '공식 상품의 표시 내용', sourceUrl: 'https://example.com/product', verifiedAt: stamp, privateRaw: 'PRIVATE' }],
  seat: { keyword: '브랜드 상품', openSlot: 1, facing: 0, sampled: 10, verdict: '열림', measuredAt: stamp, secret: 'PRIVATE' },
  brief: { timing: 'NOW', angle: '구매 조건 비교', builtAt: stamp, facts: [{ id: 'f1', title: '공식 안내', link: 'https://example.com/notice', publishedAt: stamp, secret: 'PRIVATE' }], privateRaw: 'PRIVATE' },
  aiTitle: { text: '브랜드 상품 구매 조건 확인', status: 'verified', claims: [{ text: '조건', quote: '구매 조건', evidenceId: 'p1', secret: 'PRIVATE' }], evidenceIds: ['p1'], token: 'PRIVATE' },
});
const lane = (date = stamp, names = ['상품']) => ({ label: '토스', items: names.map(product), collectedAt: date, checkedAt: date, status: 'ready' });
const snapshot = (date = stamp) => ({ collectedAt: date, checkedAt: date, sites: { toss: lane(date), brandconnect: lane(date, ['브랜드 상품']) }, secret: 'PRIVATE' });
const encoded = (value: any, hash = sha) => JSON.stringify({ sha: hash, size: Buffer.byteLength(JSON.stringify(value)), encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
function harness(remote: any = snapshot(older)) {
  const gh = vi.fn(async (args: string[], _input?: string) => args.includes('PUT') ? '{}' : encoded(remote));
  return { gh, deps: { enabled: true, now: () => now, gh } };
}
function written(gh: ReturnType<typeof vi.fn>): any {
  const call = gh.mock.calls.find(([args]) => args.includes('PUT'))!;
  return JSON.parse(Buffer.from(JSON.parse(call[1]!).content, 'base64').toString('utf8'));
}
const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('operator affiliate publication', () => {
  it('requires dedicated explicit operator opt-in, with malformed and ordinary config disabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'affiliate-publisher-')); tempDirs.push(dir);
    expect(isAffiliatePublishingEnabled(dir)).toBe(false);
    fs.mkdirSync(path.join(dir, 'affiliate-local'));
    const config = path.join(dir, 'affiliate-local', 'publish.json');
    for (const value of ['{', '{"enabled":"true"}', '{"enabled":false}', '{"aiProvider":"codex"}']) {
      fs.writeFileSync(config, value); expect(isAffiliatePublishingEnabled(dir)).toBe(false);
    }
    fs.writeFileSync(config, '{"enabled":true}'); expect(isAffiliatePublishingEnabled(dir)).toBe(true);
  });
  it('does not contact GitHub unless explicitly enabled', async () => {
    const { gh, deps } = harness();
    expect(await publishAppAffiliateSnapshot(snapshot(), { ...deps, enabled: false })).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(gh).not.toHaveBeenCalled();
  });
  it('publishes the public schema through stdin to the fixed endpoint, removing private and executable data', async () => {
    const { gh, deps } = harness();
    const raw: any = snapshot();
    raw.sites.private = { items: [{ secret: 'PRIVATE' }] };
    raw.sites.toss.items[0].image = 'javascript:alert(1)';
    expect(await publishAppAffiliateSnapshot(raw, deps)).toMatchObject({ status: 'published' });
    const output = written(gh);
    expect(JSON.stringify(output)).not.toContain('PRIVATE');
    expect(output.sites.toss.items[0]).toMatchObject({ price: 10000, image: '', url: 'https://example.com/product?id=1', searchVolume: 100 });
    expect(output.sites.toss.items[0].keywordEvidence[0]).toMatchObject({ measuredAt: stamp, monthlySearches: 100 });
    expect(output.sites.toss.items[0].aiTitle.claims[0]).toEqual({ text: '조건', evidenceId: 'p1', quote: '구매 조건' });
    const call = gh.mock.calls.find(([args]) => args.includes('PUT'))!;
    expect(call[0]).toContain('repos/cd000242-sudo/naver/contents/spa/public/data/affiliate-campaigns.json');
    expect(call[0]).toContain('github.com');
    expect(call[0].slice(-2)).toEqual(['--input', '-']);
    expect(JSON.parse(call[1]!)).toMatchObject({ sha, branch: 'main' });
  });
  it.each([null, {}, snapshot(older), snapshot('not-a-date'), snapshot('2026-10-04T12:00:00Z'), { sites: { unknown: lane() } }])('rejects invalid or stale input without network access', async raw => {
    const { gh, deps } = harness();
    expect(await publishAppAffiliateSnapshot(raw, deps)).toMatchObject({ reason: 'invalid_or_stale_snapshot' });
    expect(gh).not.toHaveBeenCalled();
  });
  it('retains old products and their collection time on failure while publishing the actual new check', async () => {
    const { gh, deps } = harness();
    const raw = { checkedAt: stamp, sites: { toss: { items: [], collectedAt: null, status: 'login-required' } } };
    expect(await publishAppAffiliateSnapshot(raw, deps)).toMatchObject({ status: 'published' });
    expect(written(gh).sites.toss).toMatchObject({ collectedAt: older, checkedAt: stamp, status: 'login-required' });
    expect(written(gh).sites.toss.items).toHaveLength(1);
    expect(written(gh).collectedAt).toBe(older);
    expect(written(gh).sites.brandconnect.checkedAt).toBe(older);
  });
  it('does not advance the enrichment time when every collection failed', async () => {
    const { gh, deps } = harness({ ...snapshot(older), enrichedAt: older });
    await publishAppAffiliateSnapshot({ enrichedAt: stamp, checkedAt: stamp, sites: { toss: { items: [], status: 'collection-failed' } } }, deps);
    expect(written(gh).enrichedAt).toBe(older);
  });
  it('retains issued-link provenance and omits malformed briefs that the UI cannot render', async () => {
    const { gh, deps } = harness();
    const raw: any = snapshot(); raw.sites.toss.items[0].issuedOnly = true; raw.sites.toss.items[0].brief = {};
    await publishAppAffiliateSnapshot(raw, deps);
    expect(written(gh).sites.toss.items[0].issuedOnly).toBe(true);
    expect(written(gh).sites.toss.items[0].brief).toBeUndefined();
  });
  it('merges platform success and failure independently without transferring freshness', async () => {
    const { gh, deps } = harness();
    const raw = snapshot(); raw.sites.brandconnect.status = 'collection-failed'; raw.sites.brandconnect.items = [];
    await publishAppAffiliateSnapshot(raw, deps);
    expect(written(gh).sites.toss.collectedAt).toBe(stamp);
    expect(written(gh).sites.brandconnect).toMatchObject({ collectedAt: older, checkedAt: stamp, status: 'collection-failed' });
  });
  it('treats a drastically smaller collection as incomplete and preserves prior items', async () => {
    const remote = snapshot(older); remote.sites.toss = lane(older, ['A', 'B', 'C']);
    const { gh, deps } = harness(remote);
    await publishAppAffiliateSnapshot({ sites: { toss: lane() } }, deps);
    expect(written(gh).sites.toss).toMatchObject({ collectedAt: older, checkedAt: stamp, status: 'incomplete' });
    expect(written(gh).sites.toss.items).toHaveLength(3);
  });
  it('preserves newer remote platforms while accepting other platforms', async () => {
    const remote = snapshot(older); remote.sites.toss = lane(new Date(now + 1000).toISOString(), ['newer']);
    const { gh, deps } = harness(remote);
    await publishAppAffiliateSnapshot(snapshot(), deps);
    expect(written(gh).sites.toss.items[0].name).toBe('newer');
    expect(written(gh).sites.brandconnect.collectedAt).toBe(stamp);
  });
  it('will not replay older successful data or overwrite a newer failed check', async () => {
    const remote = snapshot(); remote.sites.toss.status = 'login-required';
    const { gh, deps } = harness(remote);
    expect(await publishAppAffiliateSnapshot(snapshot(new Date(now - 1000).toISOString()), deps)).toMatchObject({ reason: 'newer_remote' });
    expect(gh).toHaveBeenCalledOnce();
  });
  it('replaying the same published snapshot is idempotent', async () => {
    const { gh, deps } = harness();
    await publishAppAffiliateSnapshot(snapshot(), deps);
    const second = harness(written(gh));
    expect(await publishAppAffiliateSnapshot(snapshot(), second.deps)).toMatchObject({ reason: 'already_published' });
    expect(second.gh).toHaveBeenCalledOnce();
  });
  it('reads large files by exact blob SHA and retries a compare-and-swap conflict once', async () => {
    const { gh, deps } = harness(); let puts = 0, reads = 0;
    gh.mockImplementation(async args => {
      if (args.includes('PUT')) { if (++puts === 1) throw Object.assign(new Error('PRIVATE'), { status: 409 }); return '{}'; }
      if (args.some(a => a.includes('/git/blobs/'))) return JSON.stringify(snapshot(older));
      return JSON.stringify({ sha: ++reads === 1 ? sha : 'b'.repeat(40), size: 1200000, encoding: 'none' });
    });
    expect(await publishAppAffiliateSnapshot(snapshot(), deps)).toMatchObject({ status: 'published' });
    expect(puts).toBe(2);
    expect(gh.mock.calls[1][0]).toContain(`repos/cd000242-sudo/naver/git/blobs/${sha}`);
    expect(JSON.parse(gh.mock.calls.at(-1)![1]!)).toMatchObject({ sha: 'b'.repeat(40) });
  });
  it('stops after bounded conflict retries and sanitizes all CLI errors', async () => {
    const { gh, deps } = harness();
    gh.mockImplementation(async args => { if (args.includes('PUT')) throw Object.assign(new Error('PRIVATE token'), { status: 409 }); return encoded(snapshot(older)); });
    expect(await publishAppAffiliateSnapshot(snapshot(), deps)).toEqual({ status: 'failed', reason: 'github_publication_failed' });
    expect(gh.mock.calls.filter(([args]) => args.includes('PUT'))).toHaveLength(2);
  });
  it('fails closed for unreadable remote state and oversized snapshots', async () => {
    const { gh, deps } = harness(); gh.mockRejectedValue(new Error('PRIVATE credentials'));
    expect(await publishAppAffiliateSnapshot(snapshot(), deps)).toMatchObject({ status: 'failed', reason: 'github_publication_failed' });
    gh.mockClear();
    expect(await publishAppAffiliateSnapshot({ ...snapshot(), raw: 'x'.repeat(9 * 1024 * 1024) }, deps)).toMatchObject({ reason: 'invalid_or_stale_snapshot' });
    expect(gh).not.toHaveBeenCalled();
  });
  it.each(['invalid', '2026-10-04T12:00:00Z'])('does not overwrite remote data with invalid or future timestamps', async remoteDate => {
    const { gh, deps } = harness(snapshot(remoteDate));
    expect(await publishAppAffiliateSnapshot(snapshot(), deps)).toMatchObject({ status: 'failed' });
    expect(gh.mock.calls.some(([args]) => args.includes('PUT'))).toBe(false);
  });
});
