const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const {
  initializeProductionVolumes,
  migrateLatestLiveGoldenArtifact,
  synchronizeQuotaStateArtifacts,
  migrateSearchAdAccountPool,
  migrateReviewArtifact,
  migrateReviewAuditDirectory,
  migrateHomeKeywordBriefingArtifact,
} = require('../../../apps/api/scripts/initialize-production-volumes');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function expectFailure(name: string, action: () => void, pattern: RegExp): void {
  let message = '';
  try {
    action();
  } catch (error: any) {
    message = String(error?.message || error);
  }
  assert(name, pattern.test(message), message || 'operation unexpectedly succeeded');
}

function liveGoldenBoardBody(tag: string, savedAt = '2026-07-18T01:00:00.000Z'): string {
  return `${JSON.stringify({
    version: 1,
    boardUpdatedAt: savedAt,
    savedAt,
    items: [{ keyword: tag }],
  })}\n`;
}

function liveGoldenProbeBody(tag: string, savedAt = '2026-07-18T01:00:00.000Z'): string {
  return `${JSON.stringify({ version: 1, savedAt, items: [{ keyword: tag }] })}\n`;
}

function liveGoldenHeartbeatBody(tag: string, updatedAt = '2026-07-18T01:00:00.000Z'): string {
  return `${JSON.stringify({
    schemaVersion: 'live-golden-worker-heartbeat-v1',
    status: 'running',
    pid: 1,
    startedAt: '2026-07-18T00:00:00.000Z',
    updatedAt,
    boardCount: 1,
    boardTarget: 60,
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    lastMessage: tag,
  })}\n`;
}

function homeKeywordBriefingBody(
  tag: string,
  revision = 1,
  publishedAt = '2026-07-18T01:00:00.000Z',
): string {
  const canonical = {
    title: `reviewed briefing ${tag}`,
    author: 'human-reviewer',
    publishedAt,
    revision,
    formulaVersion: 'search-volume-divided-by-documents-plus-one-v1',
    source: 'admin-image-ocr-reviewed',
    sourceImages: [],
    rows: [{
      keyword: tag,
      searchVolume: 1000,
      documentCount: 99,
      opportunity: 10,
      ocrConfidence: 99.5,
    }],
    updatedBy: 'admin',
  };
  const snapshotId = `kb-${crypto.createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 16)}`;
  return `${JSON.stringify({ snapshotId, ...canonical })}\n`;
}

const root = path.join(__dirname, '..', '..', '..');
const composeText = fs.readFileSync(
  path.join(root, 'apps', 'api', 'docker-compose.production.yml'),
  'utf8',
);
const compose = yaml.load(composeText) as any;
const initializer = compose?.services?.['leword-volume-init'];
const renderedCommand = [
  ...(Array.isArray(initializer?.entrypoint) ? initializer.entrypoint : []),
  ...(Array.isArray(initializer?.command) ? initializer.command : []),
];
assert('compose renders a variable-free initializer command',
  renderedCommand.join(' ') === 'node /app/apps/api/scripts/initialize-production-volumes.js'
    && !renderedCommand.join(' ').includes('$'),
  JSON.stringify(renderedCommand));
assert('initializer remains secret-free and one-shot',
  initializer?.user === '0:0'
    && initializer?.restart === 'no'
    && initializer?.network_mode === 'none'
    && !initializer?.env_file
    && initializer?.read_only === true);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-volume-init-'));
const dataRoot = path.join(fixtureRoot, 'data');
const goldenRoot = path.join(fixtureRoot, 'golden');
const reviewRoot = path.join(fixtureRoot, 'review');
const briefingRoot = path.join(fixtureRoot, 'briefing');
const searchAdRoot = path.join(fixtureRoot, 'searchad');
const quotaRoot = path.join(fixtureRoot, 'quota');
fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(goldenRoot, { recursive: true });
fs.mkdirSync(reviewRoot, { recursive: true });
fs.mkdirSync(briefingRoot, { recursive: true });
fs.mkdirSync(searchAdRoot, { recursive: true });
fs.mkdirSync(quotaRoot, { recursive: true });

try {
  const legacyBoardBody = liveGoldenBoardBody('legacy');
  const legacyProbeBody = liveGoldenProbeBody('legacy');
  const legacyHeartbeatBody = liveGoldenHeartbeatBody('legacy');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-human-review.json'), '{"legacy":true}\n');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-review-cohort.json'), '{"cohort":"legacy"}\n');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-phase2-entry-certificate.json'), '{"eligible":false}\n');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-board.json'), legacyBoardBody);
  fs.writeFileSync(path.join(dataRoot, 'live-golden-probe-queue.json'), legacyProbeBody);
  fs.writeFileSync(path.join(dataRoot, 'live-golden-worker-heartbeat.json'), legacyHeartbeatBody);
  fs.writeFileSync(path.join(dataRoot, 'mobile-cache.json'), '{"buyerScopedCache":true}\n');
  const legacyBriefingBody = homeKeywordBriefingBody('legacy-reviewed');
  fs.writeFileSync(path.join(dataRoot, 'home-keyword-briefing.json'), legacyBriefingBody);
  fs.writeFileSync(path.join(dataRoot, 'searchad-accounts.json'), '[{"customerId":"legacy"}]\n');
  fs.writeFileSync(path.join(dataRoot, 'searchad-quota-state.json'), JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: '2026-07-18',
    byAccount: { primary: 120 },
  }));
  fs.writeFileSync(path.join(dataRoot, 'naver-openapi-quota-state.json'), JSON.stringify({
    schemaVersion: 1,
    savedAt: '2026-07-18T01:00:00.000Z',
    legacyBlockedUntil: 0,
    blockedUntilByKey: { primary: 1784336400000 },
  }));
  const legacyAudit = path.join(dataRoot, 'live-golden-review-cohort.json.audit');
  fs.mkdirSync(legacyAudit);
  fs.writeFileSync(path.join(legacyAudit, 'failed-a.json'), '{"failed":"a"}\n');

  initializeProductionVolumes({
    dataRoot,
    goldenRoot,
    reviewRoot,
    briefingRoot,
    searchAdRoot,
    quotaRoot,
    manageOwnership: false,
  });
  assert('legacy review files migrate to the dedicated volume',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json'), 'utf8') === '{"cohort":"legacy"}\n'
      && fs.readFileSync(path.join(reviewRoot, 'live-golden-phase2-entry-certificate.json'), 'utf8') === '{"eligible":false}\n');
  assert('failed-review tombstones migrate with the cohort',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json.audit', 'failed-a.json'), 'utf8') === '{"failed":"a"}\n');
  assert('only live-golden operational state migrates out of the API-private data volume',
    fs.readFileSync(path.join(goldenRoot, 'live-golden-board.json'), 'utf8') === legacyBoardBody
      && fs.readFileSync(path.join(goldenRoot, 'live-golden-probe-queue.json'), 'utf8') === legacyProbeBody
      && fs.readFileSync(path.join(goldenRoot, 'live-golden-worker-heartbeat.json'), 'utf8') === legacyHeartbeatBody
      && !fs.existsSync(path.join(goldenRoot, 'mobile-cache.json'))
      && fs.existsSync(path.join(dataRoot, 'live-golden-board.json')),
    'API cache/commerce stays private and every legacy source remains available for rollback');
  assert('human-reviewed home briefing migrates to its own least-privilege volume',
    fs.readFileSync(path.join(briefingRoot, 'home-keyword-briefing.json'), 'utf8') === legacyBriefingBody
      && fs.existsSync(path.join(dataRoot, 'home-keyword-briefing.json'))
      && !fs.existsSync(path.join(goldenRoot, 'home-keyword-briefing.json'))
      && !fs.existsSync(path.join(reviewRoot, 'home-keyword-briefing.json')),
    'worker input must not require mounting API-private /data or mix with review decisions');
  assert('optional SearchAd account pool is copied without deleting the rollback source',
    fs.readFileSync(path.join(searchAdRoot, 'searchad-accounts.json'), 'utf8') === '[{"customerId":"legacy"}]\n'
      && fs.existsSync(path.join(dataRoot, 'searchad-accounts.json')));
  assert('quota ledgers migrate to a dedicated shared volume without deleting rollback sources',
    JSON.parse(fs.readFileSync(path.join(quotaRoot, 'searchad-quota-state.json'), 'utf8')).byAccount.primary === 120
      && JSON.parse(fs.readFileSync(path.join(quotaRoot, 'naver-openapi-quota-state.json'), 'utf8')).blockedUntilByKey.primary === 1784336400000
      && fs.existsSync(path.join(dataRoot, 'searchad-quota-state.json'))
      && fs.existsSync(path.join(dataRoot, 'naver-openapi-quota-state.json')));

  fs.writeFileSync(path.join(quotaRoot, 'searchad-quota-state.json'), JSON.stringify({
    schemaVersion: 'searchad-quota-v1',
    date: '2026-07-18',
    byAccount: { primary: 175, secondary: 9 },
  }));
  fs.writeFileSync(path.join(quotaRoot, 'naver-openapi-quota-state.json'), JSON.stringify({
    schemaVersion: 1,
    savedAt: '2026-07-18T02:00:00.000Z',
    legacyBlockedUntil: 1784338200000,
    blockedUntilByKey: { secondary: 1784339100000 },
  }));
  synchronizeQuotaStateArtifacts(dataRoot, quotaRoot, 'rollback');
  const rolledBackSearchAdQuota = JSON.parse(
    fs.readFileSync(path.join(dataRoot, 'searchad-quota-state.json'), 'utf8'),
  );
  const rolledBackOpenApiQuota = JSON.parse(
    fs.readFileSync(path.join(dataRoot, 'naver-openapi-quota-state.json'), 'utf8'),
  );
  assert('rollback exports the monotonic SearchAd ledger without resetting either account',
    rolledBackSearchAdQuota.byAccount.primary === 175
      && rolledBackSearchAdQuota.byAccount.secondary === 9
      && JSON.parse(fs.readFileSync(path.join(quotaRoot, 'searchad-quota-state.json'), 'utf8')).byAccount.primary === 175);
  assert('rollback preserves every active Naver OpenAPI cooldown',
    rolledBackOpenApiQuota.legacyBlockedUntil === 1784338200000
      && rolledBackOpenApiQuota.blockedUntilByKey.primary === 1784336400000
      && rolledBackOpenApiQuota.blockedUntilByKey.secondary === 1784339100000);

  fs.writeFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json'), '{"cohort":"new-authoritative"}\n');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-review-cohort.json'), '{"cohort":"rollback-old"}\n');
  fs.writeFileSync(path.join(legacyAudit, 'failed-b.json'), '{"failed":"b"}\n');
  expectFailure('a rollback-modified legacy review file conflicts instead of being silently discarded', () => {
    initializeProductionVolumes({
      dataRoot,
      goldenRoot,
      reviewRoot,
      briefingRoot,
      searchAdRoot,
      quotaRoot,
      manageOwnership: false,
    });
  }, /legacy review source changed after migration/);
  assert('file collision failure leaves the new review target intact',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json'), 'utf8') === '{"cohort":"new-authoritative"}\n');
  fs.writeFileSync(path.join(dataRoot, 'live-golden-review-cohort.json'), '{"cohort":"legacy"}\n');
  initializeProductionVolumes({
    dataRoot,
    goldenRoot,
    reviewRoot,
    briefingRoot,
    searchAdRoot,
    quotaRoot,
    manageOwnership: false,
  });
  assert('valid new review file stays authoritative while legacy matches its recorded baseline',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json'), 'utf8') === '{"cohort":"new-authoritative"}\n');
  assert('rollback-created audit tombstones merge forward without loss',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json.audit', 'failed-b.json'), 'utf8') === '{"failed":"b"}\n');

  const goldenBoardSource = path.join(dataRoot, 'live-golden-board.json');
  const goldenBoardTarget = path.join(goldenRoot, 'live-golden-board.json');
  const newBoardBody = liveGoldenBoardBody('new-authoritative', '2026-07-18T02:00:00.000Z');
  const newProbeBody = liveGoldenProbeBody('new-authoritative', '2026-07-18T02:00:00.000Z');
  const newHeartbeatBody = liveGoldenHeartbeatBody('new-authoritative', '2026-07-18T02:00:00.000Z');
  fs.writeFileSync(goldenBoardTarget, newBoardBody);
  fs.writeFileSync(path.join(goldenRoot, 'live-golden-probe-queue.json'), newProbeBody);
  fs.writeFileSync(path.join(goldenRoot, 'live-golden-worker-heartbeat.json'), newHeartbeatBody);
  fs.writeFileSync(path.join(reviewRoot, 'live-golden-phase2-entry-certificate.json'), '{"eligible":true,"schema":"phase2-v2"}\n');
  fs.writeFileSync(
    path.join(reviewRoot, 'live-golden-review-cohort.json.audit', 'phase2-only-tombstone.json'),
    '{"schema":"phase2-v2","failed":true}\n',
  );
  initializeProductionVolumes({
    dataRoot,
    goldenRoot,
    reviewRoot,
    briefingRoot,
    searchAdRoot,
    quotaRoot,
    mode: 'rollback',
    manageOwnership: false,
  });
  const goldenBoardRollbackMarker = path.join(
    goldenRoot,
    '.live-golden-board.json.rollback-baseline.sha256',
  );
  assert('rollback atomically bridges only old-image-compatible golden operational state',
    fs.readFileSync(goldenBoardSource, 'utf8') === newBoardBody
      && fs.readFileSync(path.join(dataRoot, 'live-golden-probe-queue.json'), 'utf8') === newProbeBody
      && fs.readFileSync(path.join(dataRoot, 'live-golden-worker-heartbeat.json'), 'utf8') === newHeartbeatBody
      && fs.existsSync(goldenBoardRollbackMarker));
  assert('rollback leaves Phase 2 review evidence authoritative on the dedicated review volume',
    fs.readFileSync(path.join(reviewRoot, 'live-golden-review-cohort.json'), 'utf8') === '{"cohort":"new-authoritative"}\n'
      && fs.readFileSync(path.join(reviewRoot, 'live-golden-phase2-entry-certificate.json'), 'utf8') === '{"eligible":true,"schema":"phase2-v2"}\n'
      && fs.readFileSync(path.join(dataRoot, 'live-golden-phase2-entry-certificate.json'), 'utf8') === '{"eligible":false}\n'
      && fs.existsSync(path.join(reviewRoot, 'live-golden-review-cohort.json.audit', 'phase2-only-tombstone.json'))
      && !fs.existsSync(path.join(legacyAudit, 'phase2-only-tombstone.json')));

  const briefingSource = path.join(dataRoot, 'home-keyword-briefing.json');
  const briefingTarget = path.join(briefingRoot, 'home-keyword-briefing.json');
  const newBriefingBody = homeKeywordBriefingBody(
    'new-reviewed-authoritative',
    2,
    '2026-07-18T02:00:00.000Z',
  );
  fs.writeFileSync(briefingTarget, newBriefingBody);
  initializeProductionVolumes({
    dataRoot,
    goldenRoot,
    reviewRoot,
    briefingRoot,
    searchAdRoot,
    quotaRoot,
    mode: 'rollback',
    manageOwnership: false,
  });
  const briefingRollbackMarker = path.join(
    briefingRoot,
    '.home-keyword-briefing.json.rollback-baseline.sha256',
  );
  assert('rollback atomically bridges the reviewed briefing for the old API/worker image',
    fs.readFileSync(briefingSource, 'utf8') === newBriefingBody
      && fs.readFileSync(briefingTarget, 'utf8') === newBriefingBody
      && fs.existsSync(briefingRollbackMarker));

  const changedBriefingTarget = homeKeywordBriefingBody(
    'changed-new-target',
    3,
    '2026-07-18T03:00:00.000Z',
  );
  const staleBriefingSource = homeKeywordBriefingBody(
    'stale-old-source',
    2,
    '2026-07-18T02:30:00.000Z',
  );
  fs.writeFileSync(briefingTarget, changedBriefingTarget);
  fs.writeFileSync(briefingSource, staleBriefingSource);
  expectFailure('a divergent target cannot be overwritten while a briefing rollback marker is active', () => {
    migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
  }, /briefing target changed after rollback bridge/);
  assert('briefing bridge conflict retains both originals and its recovery marker',
    fs.readFileSync(briefingTarget, 'utf8') === changedBriefingTarget
      && fs.readFileSync(briefingSource, 'utf8') === staleBriefingSource
      && fs.existsSync(briefingRollbackMarker));

  fs.writeFileSync(briefingTarget, newBriefingBody);
  migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot, 'home-keyword-briefing.json', 'rollback');
  const rollbackAdvancedBriefing = homeKeywordBriefingBody(
    'old-worker-advanced',
    3,
    '2026-07-18T04:00:00.000Z',
  );
  fs.writeFileSync(briefingSource, rollbackAdvancedBriefing);
  migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
  assert('forward init imports only the marker-bound old-image briefing advance',
    fs.readFileSync(briefingTarget, 'utf8') === rollbackAdvancedBriefing
      && !fs.existsSync(briefingRollbackMarker));

  migrateHomeKeywordBriefingArtifact(
    dataRoot,
    briefingRoot,
    'home-keyword-briefing.json',
    'rollback',
  );
  const crashReconciledBriefing = homeKeywordBriefingBody(
    'reconciled-before-marker-consume',
    4,
    '2026-07-18T04:30:00.000Z',
  );
  fs.writeFileSync(briefingSource, crashReconciledBriefing);
  // Emulate a crash after the forward atomic replacement but before the
  // rollback marker unlink/fsync completed.
  fs.writeFileSync(briefingTarget, crashReconciledBriefing);
  migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
  assert('briefing forward restart idempotently completes a post-replace marker crash',
    fs.readFileSync(briefingTarget, 'utf8') === crashReconciledBriefing
      && fs.readFileSync(briefingSource, 'utf8') === crashReconciledBriefing
      && !fs.existsSync(briefingRollbackMarker));

  const laterDedicatedBriefing = homeKeywordBriefingBody(
    'dedicated-volume-authoritative',
    5,
    '2026-07-18T05:00:00.000Z',
  );
  fs.writeFileSync(briefingTarget, laterDedicatedBriefing);
  migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
  assert('ordinary forward deploy keeps the dedicated briefing volume authoritative',
    fs.readFileSync(briefingTarget, 'utf8') === laterDedicatedBriefing
      && fs.readFileSync(briefingSource, 'utf8') === crashReconciledBriefing);

  migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot, 'home-keyword-briefing.json', 'rollback');
  const incompatibleBriefing = `${JSON.stringify({
    snapshotId: 'kb-0000000000000000',
    formulaVersion: 'future-formula-v2',
    revision: 6,
    publishedAt: '2026-07-18T06:00:00.000Z',
    rows: [],
  })}\n`;
  fs.writeFileSync(briefingSource, incompatibleBriefing);
  expectFailure('unsupported old-image briefing schemas fail closed during forward recovery', () => {
    migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
  }, /unsupported home keyword briefing schema/);
  assert('briefing schema conflict preserves both durable artifacts',
    fs.readFileSync(briefingTarget, 'utf8') === laterDedicatedBriefing
      && fs.readFileSync(briefingSource, 'utf8') === incompatibleBriefing
      && fs.existsSync(briefingRollbackMarker));

  const postBridgeTargetBody = liveGoldenBoardBody('post-bridge-target', '2026-07-18T03:00:00.000Z');
  const staleRollbackBody = liveGoldenBoardBody('stale-rollback-source', '2026-07-18T01:30:00.000Z');
  fs.writeFileSync(goldenBoardTarget, postBridgeTargetBody);
  fs.writeFileSync(goldenBoardSource, staleRollbackBody);
  const futureMtime = new Date(Date.now() + 60_000);
  fs.utimesSync(goldenBoardSource, futureMtime, futureMtime);
  expectFailure('mtime alone cannot let stale rollback state overwrite a changed golden target', () => {
    migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json');
  }, /target changed after rollback bridge/);
  assert('golden target survives a divergent stale rollback source unchanged',
    fs.readFileSync(goldenBoardTarget, 'utf8') === postBridgeTargetBody
      && fs.readFileSync(goldenBoardSource, 'utf8') === staleRollbackBody
      && fs.existsSync(goldenBoardRollbackMarker));

  fs.writeFileSync(goldenBoardTarget, newBoardBody);
  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json', 'rollback');
  const rollbackAdvancedBody = liveGoldenBoardBody('rollback-advanced', '2026-07-18T04:00:00.000Z');
  fs.writeFileSync(goldenBoardSource, rollbackAdvancedBody);
  const olderMtime = new Date(Date.now() - 60_000);
  fs.utimesSync(goldenBoardSource, olderMtime, olderMtime);
  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json');
  assert('valid state advanced by the old worker after rollback is reconciled from the digest baseline, not mtime',
    fs.readFileSync(goldenBoardTarget, 'utf8') === rollbackAdvancedBody
      && fs.existsSync(goldenBoardSource)
      && !fs.existsSync(goldenBoardRollbackMarker));

  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json', 'rollback');
  const crashReconciledBody = liveGoldenBoardBody('rollback-reconciled-before-marker-consume', '2026-07-18T04:15:00.000Z');
  fs.writeFileSync(goldenBoardSource, crashReconciledBody);
  // Emulate a process crash after the atomic source->target replacement but
  // before the rollback marker unlink/fsync completed.
  fs.writeFileSync(goldenBoardTarget, crashReconciledBody);
  assert('crash fixture retains the pre-reconcile marker after target replacement',
    fs.existsSync(goldenBoardRollbackMarker));
  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json');
  assert('forward restart idempotently consumes a marker when target already equals the rollback source',
    fs.readFileSync(goldenBoardTarget, 'utf8') === crashReconciledBody
      && fs.readFileSync(goldenBoardSource, 'utf8') === crashReconciledBody
      && !fs.existsSync(goldenBoardRollbackMarker));

  const repeatedForwardBody = liveGoldenBoardBody('normal-forward-authoritative', '2026-07-18T04:30:00.000Z');
  fs.writeFileSync(goldenBoardTarget, repeatedForwardBody);
  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json');
  assert('normal repeated forward deploy keeps /golden authoritative after the rollback marker is consumed',
    fs.readFileSync(goldenBoardTarget, 'utf8') === repeatedForwardBody
      && fs.readFileSync(goldenBoardSource, 'utf8') === crashReconciledBody);

  migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json', 'rollback');
  const incompatibleSourceBody = `${JSON.stringify({
    version: 2,
    savedAt: '2026-07-18T05:00:00.000Z',
    items: [],
  })}\n`;
  fs.writeFileSync(goldenBoardSource, incompatibleSourceBody);
  expectFailure('new/old live-golden schema conflicts fail closed before either original is replaced', () => {
    migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, 'live-golden-board.json');
  }, /unsupported live-golden-board\.json schema/);
  assert('schema conflict preserves both originals for explicit recovery',
    fs.readFileSync(goldenBoardTarget, 'utf8') === repeatedForwardBody
      && fs.readFileSync(goldenBoardSource, 'utf8') === incompatibleSourceBody);

  fs.writeFileSync(path.join(dataRoot, 'searchad-accounts.json'), '[{"customerId":"changed-only-in-legacy"}]\n');
  expectFailure('divergent SearchAd credential copies fail closed instead of choosing a secret', () => {
    migrateSearchAdAccountPool(dataRoot, searchAdRoot, 'searchad-accounts.json');
  }, /SearchAd account pool conflict/);
  assert('SearchAd conflict retains both copies for explicit operator recovery',
    fs.existsSync(path.join(dataRoot, 'searchad-accounts.json'))
      && fs.readFileSync(path.join(searchAdRoot, 'searchad-accounts.json'), 'utf8') === '[{"customerId":"legacy"}]\n');

  fs.writeFileSync(path.join(legacyAudit, 'failed-a.json'), '{"failed":"conflict"}\n');
  expectFailure('divergent audit tombstones fail closed', () => {
    migrateReviewAuditDirectory(dataRoot, reviewRoot, 'live-golden-review-cohort.json.audit');
  }, /audit artifact conflict/);

  const tempName = 'preexisting-temp.json';
  fs.writeFileSync(path.join(dataRoot, tempName), '{}');
  fs.writeFileSync(path.join(reviewRoot, `.${tempName}.migration`), 'partial');
  expectFailure('pre-existing migration temp fails closed', () => {
    migrateReviewArtifact(dataRoot, reviewRoot, tempName);
  }, /migration temp already exists/);

  const symlinkTarget = path.join(fixtureRoot, 'symlink-target');
  fs.mkdirSync(symlinkTarget);
  let symlinkCreated = false;
  try {
    fs.symlinkSync(symlinkTarget, path.join(dataRoot, 'broken-link.audit'), 'junction');
    symlinkCreated = true;
  } catch (error: any) {
    if (error?.code !== 'EPERM') throw error;
  }
  if (symlinkCreated) {
    expectFailure('symbolic-link review sources fail closed', () => {
      migrateReviewAuditDirectory(dataRoot, reviewRoot, 'broken-link.audit');
    }, /symbolic link/);
  }

  const linkedReviewDirectory = path.join(fixtureRoot, 'linked-review-directory');
  fs.mkdirSync(linkedReviewDirectory);
  let targetSymlinkCreated = false;
  try {
    fs.symlinkSync(
      linkedReviewDirectory,
      path.join(reviewRoot, 'linked-target.audit'),
      'junction',
    );
    targetSymlinkCreated = true;
  } catch (error: any) {
    if (error?.code !== 'EPERM') throw error;
  }
  if (targetSymlinkCreated) {
    expectFailure('symbolic-link review targets fail closed', () => {
      migrateReviewAuditDirectory(dataRoot, reviewRoot, 'linked-target.audit');
    }, /symbolic link/);
  }

  let danglingSymlinkCreated = false;
  try {
    fs.symlinkSync(
      path.join(fixtureRoot, 'missing-target.json'),
      path.join(dataRoot, 'dangling-source.json'),
      'file',
    );
    danglingSymlinkCreated = true;
  } catch (error: any) {
    if (error?.code !== 'EPERM') throw error;
  }
  if (danglingSymlinkCreated) {
    expectFailure('broken symbolic-link review sources fail closed', () => {
      migrateReviewArtifact(dataRoot, reviewRoot, 'dangling-source.json');
    }, /symbolic link/);
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('[production-volume-initializer.test] passed');

export {};
