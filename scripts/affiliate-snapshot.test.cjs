const { test } = require('node:test');
const assert = require('node:assert/strict');
const { currentCaptureFiles, mergeCampaignSnapshots, prepareCampaignInventory, applyCampaignAnalysis, freshCampaignItems } = require('./affiliate-snapshot');
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

test('실측 예산 24개와 전체 최신 상품 118개를 분리해 기존 150개 대비 불완전 판정을 피한다', () => {
  const capture = Array.from({ length: 118 }, (_, i) => ({ productId: String(i), name: `상품 ${i}`, price: 1000 + i }));
  const plan = prepareCampaignInventory(capture, { collectedAt: at, keywordOf: name => name, limit: 24 });
  assert.equal(plan.items.length, 118);
  assert.equal(plan.targets.length, 24);
  assert.deepEqual(plan.targetIndexes, Array.from({ length: 24 }, (_, i) => i));
  const items = applyCampaignAnalysis(plan, plan.targets.map(row => ({ ...row, searchVolume: 100, keywordEvidence: [{ measuredAt: at }] })));
  assert.equal(items.filter(row => row.searchVolume === 100).length, 24);
  assert.equal(items[24].searchVolume, undefined);
  assert.equal(items[117].collectedAt, at);
  const previous = { collectedAt: old, sites: { toss: { items: Array.from({ length: 150 }, (_, i) => ({ name: `옛 ${i}` })) } } };
  const merged = mergeCampaignSnapshots(previous, { toss: { collectedAt: at, status: 'ready', items } }, at);
  assert.equal(merged.sites.toss.status, 'ready');
  assert.equal(merged.sites.toss.items.length, 118);
  assert.equal(merged.sites.toss.collectedAt, at);
});

test('동일 상품만 중복 제거하고 같은 검색어인 다른 상품 및 검색어 없는 상품도 보존한다', () => {
  const rows = [{ productId: '1', name: '상품 A' }, { productId: '1', name: '상품 A 중복' },
    { productId: '2', name: '상품 B' }, { name: '기타' }, { name: '기 타' }, { name: '' }];
  const plan = prepareCampaignInventory(rows, { collectedAt: at, keywordOf: name => name.startsWith('상품') ? '공통 검색어' : '', limit: 24 });
  assert.deepEqual(plan.items.map(row => row.name), ['상품 A', '상품 B', '기타']);
  assert.equal(plan.targets.length, 2);
  assert.equal(plan.items[2].keyword, '');
});

test('이번에 실측하지 않은 상품에 이전 검색량·자리·제목 근거를 재사용하지 않는다', () => {
  const rows = [{ name: 'A' }, { name: 'B', collectedAt: old, searchVolume: 999, needVolume: 888,
    keywordEvidence: [{ measuredAt: old }], seat: { measuredAt: old }, brief: { builtAt: old }, aiTitle: { text: '옛 제목' }, recommendation: { status: 'ready' } }];
  const plan = prepareCampaignInventory(rows, { collectedAt: at, keywordOf: name => name, limit: 1 });
  const merged = applyCampaignAnalysis(plan, [{ ...plan.targets[0], searchVolume: 50 }]);
  for (const key of ['searchVolume', 'needVolume', 'keywordEvidence', 'seat', 'brief', 'aiTitle', 'recommendation']) assert.equal(merged[1][key], undefined);
  assert.equal(merged[1].collectedAt, at);
  assert.equal(rows[1].searchVolume, 999);
  assert.equal(plan.items[0].searchVolume, undefined);
});

test('실측 결과가 다른 상품을 가리키거나 예산보다 많아도 대상 밖 상품에 붙이지 않는다', () => {
  const plan = prepareCampaignInventory([{ name: 'A' }, { name: 'B' }], { collectedAt: at, keywordOf: name => name, limit: 1 });
  const result = applyCampaignAnalysis(plan, [{ name: 'B', keyword: 'B', searchVolume: 999 }, { name: 'A', searchVolume: 100 }]);
  assert.equal(result[0].searchVolume, undefined);
  assert.equal(result[1].searchVolume, undefined);
  for (const limit of [0, -1, 1.5, 161, NaN]) assert.throws(() => prepareCampaignInventory([], { collectedAt: at, keywordOf: x => x, limit }));
});

test('실패한 플랫폼은 실측 대상에서 빠지고 이전 상품·수집일·근거일을 유지한다', () => {
  const staleItem = { name: '토스 기존', keywordEvidence: [{ measuredAt: old }] };
  const before = { collectedAt: old, sites: { toss: { collectedAt: old, items: [staleItem] } } };
  const merged = mergeCampaignSnapshots(before, {
    toss: { collectedAt: null, status: 'login-required', items: [] },
    brandconnect: { collectedAt: at, status: 'ready', items: [{ name: '새 상품' }, { name: '관리 링크', issuedOnly: true }] },
  }, at);
  assert.deepEqual(freshCampaignItems(merged, Date.parse(at)).map(row => row.name), ['새 상품']);
  assert.equal(merged.sites.toss.collectedAt, old);
  assert.equal(merged.sites.toss.checkedAt, at);
  assert.equal(merged.sites.toss.items[0].keywordEvidence[0].measuredAt, old);
});

test('오래되거나 미래 또는 잘못된 날짜의 ready 목록도 보강하지 않는다', () => {
  for (const collectedAt of [old, 'invalid', '2026-09-07T00:00:00.000Z', null]) {
    assert.deepEqual(freshCampaignItems({ sites: { toss: { status: 'ready', collectedAt, items: [{ name: 'A' }] } } }, Date.parse(at)), []);
  }
});
