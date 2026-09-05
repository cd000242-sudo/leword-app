const { test } = require('node:test');
const assert = require('node:assert/strict');
const { currentCaptureFiles, mergeCampaignSnapshots } = require('./affiliate-snapshot');
const at = '2026-09-06T00:00:00.000Z';
const old = '2026-08-21T00:00:00.000Z';
test('현재 실행의 성공한 파일만 파싱하고 오래된 덤프와 경로 이탈을 막는다', () => {
  const manifest = { runId: 'run-1', generatedAt: at, sites: { brandconnect: {
    capturedFiles: ['run-1/brandconnect/001.json', '../private.json', 'old/001.json', '/absolute.json'],
  } } };
  assert.deepEqual(currentCaptureFiles(manifest, 'brandconnect', Date.parse(at)), ['run-1/brandconnect/001.json']);
  assert.deepEqual(currentCaptureFiles({ ...manifest, generatedAt: old }, 'brandconnect', Date.parse(at)), []);
  assert.deepEqual(currentCaptureFiles(null, 'brandconnect'), []);
  assert.deepEqual(currentCaptureFiles(manifest, '../private', Date.parse(at)), []);
  assert.deepEqual(currentCaptureFiles({ ...manifest, sites: { brandconnect: { capturedFiles: 'not-a-list' } } }, 'brandconnect', Date.parse(at)), []);
  assert.deepEqual(currentCaptureFiles({ ...manifest, sites: { brandconnect: { ...manifest.sites.brandconnect, maybeLoggedOut: true } } }, 'brandconnect', Date.parse(at)), []);
});
test('토스 실패는 브랜드커넥트 갱신을 막지 않으며 실패분 날짜는 유지한다', () => {
  const before = { collectedAt: old, sites: { toss: { items: [{ name: '토스' }] }, brandconnect: { items: [{ name: '옛 상품' }] } } };
  const after = mergeCampaignSnapshots(before, { brandconnect: { collectedAt: at, items: [{ name: '새 상품' }] }, toss: { status: 'login-required', items: [] } }, at);
  assert.equal(after.sites.toss.collectedAt, old);
  assert.equal(after.sites.toss.status, 'login-required');
  assert.equal(after.sites.brandconnect.collectedAt, at);
  assert.equal(after.sites.brandconnect.items[0].name, '새 상품');
  assert.equal(before.sites.brandconnect.items[0].name, '옛 상품');
});
test('일부 응답 누락이나 빈 목록으로 정상 목록을 덮어쓰지 않는다', () => {
  const before = { collectedAt: old, sites: { brandconnect: { items: Array.from({ length: 6 }, (_, i) => ({ name: String(i) })) } } };
  const after = mergeCampaignSnapshots(before, { brandconnect: { collectedAt: at, items: [{ name: '일부' }] } }, at);
  assert.equal(after.sites.brandconnect.items.length, 6);
  assert.equal(after.sites.brandconnect.collectedAt, old);
  assert.equal(after.sites.brandconnect.status, 'incomplete');
  assert.equal(mergeCampaignSnapshots(before, { brandconnect: { items: [] } }, at).collectedAt, old);
});
test('분석 후 0건이 된 ready 응답도 갱신 성공으로 표시하지 않는다', () => {
  const previous = { collectedAt: old, sites: { brandconnect: { items: [{ name: '기존 상품' }] } } };
  const result = mergeCampaignSnapshots(previous, { brandconnect: { status: 'ready', collectedAt: at, items: [] } }, at);
  assert.equal(result.sites.brandconnect.status, 'collection-failed');
  assert.equal(result.sites.brandconnect.collectedAt, old);
  assert.equal(result.sites.brandconnect.items[0].name, '기존 상품');
});
