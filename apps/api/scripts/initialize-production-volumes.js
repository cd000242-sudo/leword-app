'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const NODE_UID = 1000;
const NODE_GID = 1000;
const MAX_REVIEW_ARTIFACT_BYTES = 512 * 1024;
const MAX_LIVE_GOLDEN_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_HOME_KEYWORD_BRIEFING_BYTES = 1024 * 1024;
const MAX_SEARCHAD_ACCOUNT_POOL_BYTES = 1024 * 1024;
const MAX_QUOTA_STATE_BYTES = 1024 * 1024;
const LIVE_GOLDEN_FILES = [
  'live-golden-board.json',
  'live-golden-probe-queue.json',
  'live-golden-worker-heartbeat.json',
];
const REVIEW_FILES = [
  'live-golden-human-review.json',
  'live-golden-review-cohort.json',
  'live-golden-phase2-entry-certificate.json',
];
const REVIEW_AUDIT_DIRECTORY = 'live-golden-review-cohort.json.audit';
const LIVE_GOLDEN_ROLLBACK_MARKER_SUFFIX = '.rollback-baseline.sha256';
const HOME_KEYWORD_BRIEFING_FILE = 'home-keyword-briefing.json';
const HOME_KEYWORD_BRIEFING_FORMULA_VERSION = 'search-volume-divided-by-documents-plus-one-v1';

function lstatIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertNotSymbolicLink(filePath, label) {
  const stat = lstatIfPresent(filePath);
  if (stat && stat.isSymbolicLink()) {
    throw new Error(`${label} is a symbolic link: ${filePath}`);
  }
  return stat;
}

function assertRegularFile(filePath, label, maxBytes = MAX_REVIEW_ARTIFACT_BYTES) {
  const stat = assertNotSymbolicLink(filePath, label);
  if (!stat || !stat.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes: ${filePath}`);
  }
  return stat;
}

function assertDirectory(filePath, label) {
  const stat = assertNotSymbolicLink(filePath, label);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${filePath}`);
  }
  return stat;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readBoundedFile(filePath, label, maxBytes = MAX_REVIEW_ARTIFACT_BYTES) {
  assertRegularFile(filePath, label, maxBytes);
  const body = fs.readFileSync(filePath);
  if (body.length > maxBytes) {
    throw new Error(`${label} changed while being read: ${filePath}`);
  }
  return body;
}

function parseJsonObject(body, label) {
  let parsed;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return parsed;
}

function quotaCount(value, label) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} is not a non-negative safe integer`);
  }
  return count;
}

function quotaTimestamp(value, label) {
  const timestamp = Number(value || 0);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error(`${label} is not a non-negative safe integer timestamp`);
  }
  return timestamp;
}

function normalizeSearchAdQuotaState(body, label) {
  const parsed = parseJsonObject(body, label);
  if (parsed.schemaVersion !== 'searchad-quota-v1') {
    throw new Error(`${label} has an unsupported SearchAd quota schema`);
  }
  const date = String(parsed.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${label} has an invalid SearchAd quota date`);
  }
  if (!parsed.byAccount || typeof parsed.byAccount !== 'object' || Array.isArray(parsed.byAccount)) {
    throw new Error(`${label} has an invalid SearchAd account map`);
  }
  const byAccount = {};
  for (const [accountId, value] of Object.entries(parsed.byAccount)) {
    if (!accountId) throw new Error(`${label} has an empty SearchAd account id`);
    byAccount[accountId] = quotaCount(value, `${label} account ${accountId}`);
  }
  return { schemaVersion: 'searchad-quota-v1', date, byAccount };
}

function mergeSearchAdQuotaStates(left, right) {
  if (left.date !== right.date) return left.date > right.date ? left : right;
  const byAccount = {};
  for (const accountId of new Set([...Object.keys(left.byAccount), ...Object.keys(right.byAccount)])) {
    byAccount[accountId] = Math.max(left.byAccount[accountId] || 0, right.byAccount[accountId] || 0);
  }
  return { schemaVersion: 'searchad-quota-v1', date: left.date, byAccount };
}

function normalizeOpenApiQuotaState(body, label) {
  const parsed = parseJsonObject(body, label);
  if (parsed.schemaVersion !== 1) {
    throw new Error(`${label} has an unsupported Naver OpenAPI quota schema`);
  }
  const savedAtMs = Date.parse(String(parsed.savedAt || '')) || 0;
  const blockedUntilByKey = {};
  const rawBlocked = parsed.blockedUntilByKey || {};
  if (typeof rawBlocked !== 'object' || Array.isArray(rawBlocked)) {
    throw new Error(`${label} has an invalid Naver OpenAPI credential map`);
  }
  for (const [credentialKey, value] of Object.entries(rawBlocked)) {
    if (!credentialKey) throw new Error(`${label} has an empty Naver OpenAPI credential key`);
    blockedUntilByKey[credentialKey] = quotaTimestamp(
      value,
      `${label} credential ${credentialKey}`,
    );
  }
  return {
    schemaVersion: 1,
    savedAtMs,
    legacyBlockedUntil: quotaTimestamp(parsed.legacyBlockedUntil, `${label} legacy cooldown`),
    blockedUntilByKey,
  };
}

function mergeOpenApiQuotaStates(left, right) {
  const blockedUntilByKey = {};
  for (const credentialKey of new Set([
    ...Object.keys(left.blockedUntilByKey),
    ...Object.keys(right.blockedUntilByKey),
  ])) {
    blockedUntilByKey[credentialKey] = Math.max(
      left.blockedUntilByKey[credentialKey] || 0,
      right.blockedUntilByKey[credentialKey] || 0,
    );
  }
  return {
    schemaVersion: 1,
    savedAtMs: Math.max(left.savedAtMs, right.savedAtMs),
    legacyBlockedUntil: Math.max(left.legacyBlockedUntil, right.legacyBlockedUntil),
    blockedUntilByKey,
  };
}

function serializeQuotaState(name, state) {
  if (name === 'naver-openapi-quota-state.json') {
    return Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      savedAt: state.savedAtMs > 0 ? new Date(state.savedAtMs).toISOString() : '',
      legacyBlockedUntil: state.legacyBlockedUntil,
      blockedUntilByKey: state.blockedUntilByKey,
    }, null, 2)}\n`, 'utf8');
  }
  return Buffer.from(`${JSON.stringify(state)}\n`, 'utf8');
}

function mergeQuotaStateBodies(name, sourceBody, targetBody) {
  if (name === 'searchad-quota-state.json') {
    return serializeQuotaState(name, mergeSearchAdQuotaStates(
      normalizeSearchAdQuotaState(sourceBody, 'legacy SearchAd quota state'),
      normalizeSearchAdQuotaState(targetBody, 'shared SearchAd quota state'),
    ));
  }
  if (name === 'naver-openapi-quota-state.json') {
    return serializeQuotaState(name, mergeOpenApiQuotaStates(
      normalizeOpenApiQuotaState(sourceBody, 'legacy Naver OpenAPI quota state'),
      normalizeOpenApiQuotaState(targetBody, 'shared Naver OpenAPI quota state'),
    ));
  }
  throw new Error(`unsupported quota state artifact: ${name}`);
}

function writeReplaceAtomic(target, body, mode = 0o600) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.migration`);
  if (lstatIfPresent(temporary)) {
    throw new Error(`migration temp already exists: ${temporary}`);
  }
  const targetStat = assertNotSymbolicLink(target, 'migration target');
  if (targetStat && !targetStat.isFile()) {
    throw new Error(`migration target is not a regular file: ${target}`);
  }

  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(descriptor, body);
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }

  try {
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    // Retain a failed temp so a later run cannot guess whether replacement was
    // durable. The legacy source remains untouched for rollback recovery.
    throw error;
  }
}

function writeQuotaStateIfChanged(target, body) {
  const stat = assertNotSymbolicLink(target, 'quota state target');
  if (!stat) {
    writeExclusiveAtomic(target, body);
    return;
  }
  const existing = readBoundedFile(target, 'quota state target', MAX_QUOTA_STATE_BYTES);
  if (!existing.equals(body)) writeReplaceAtomic(target, body);
}

function synchronizeQuotaStateArtifact(dataRoot, quotaRoot, name, mode) {
  const source = path.join(dataRoot, name);
  const target = path.join(quotaRoot, name);
  const sourceStat = assertNotSymbolicLink(source, 'legacy quota state');
  const targetStat = assertNotSymbolicLink(target, 'shared quota state');
  if (sourceStat && (!sourceStat.isFile() || sourceStat.size > MAX_QUOTA_STATE_BYTES)) {
    throw new Error(`legacy quota state is invalid: ${source}`);
  }
  if (targetStat && (!targetStat.isFile() || targetStat.size > MAX_QUOTA_STATE_BYTES)) {
    throw new Error(`shared quota state is invalid: ${target}`);
  }
  if (!sourceStat && !targetStat) return;

  const sourceBody = sourceStat
    ? readBoundedFile(source, 'legacy quota state', MAX_QUOTA_STATE_BYTES)
    : null;
  const targetBody = targetStat
    ? readBoundedFile(target, 'shared quota state', MAX_QUOTA_STATE_BYTES)
    : null;
  let mergedBody;
  if (sourceBody && targetBody) {
    mergedBody = mergeQuotaStateBodies(name, sourceBody, targetBody);
  } else if (sourceBody) {
    // Validate before copying a ledger that controls physical API usage.
    mergedBody = mergeQuotaStateBodies(name, sourceBody, sourceBody);
  } else {
    mergedBody = mergeQuotaStateBodies(name, targetBody, targetBody);
  }

  writeQuotaStateIfChanged(target, mergedBody);
  if (mode === 'rollback') writeQuotaStateIfChanged(source, mergedBody);
}

function synchronizeQuotaStateArtifacts(dataRoot, quotaRoot, mode = 'forward') {
  if (!['forward', 'rollback'].includes(mode)) {
    throw new Error(`unsupported volume initializer mode: ${mode}`);
  }
  synchronizeQuotaStateArtifact(dataRoot, quotaRoot, 'searchad-quota-state.json', mode);
  synchronizeQuotaStateArtifact(dataRoot, quotaRoot, 'naver-openapi-quota-state.json', mode);
}

function validateLiveGoldenArtifact(name, body, label) {
  const parsed = parseJsonObject(body, label);
  if (name === 'live-golden-board.json' || name === 'live-golden-probe-queue.json') {
    if (parsed.version !== 1 || !Array.isArray(parsed.items) || !Number.isFinite(Date.parse(String(parsed.savedAt || '')))) {
      throw new Error(`${label} has an unsupported ${name} schema`);
    }
    return 'version:1';
  }
  if (name === 'live-golden-worker-heartbeat.json') {
    if (parsed.schemaVersion !== 'live-golden-worker-heartbeat-v1'
      || !['running', 'stopped', 'error'].includes(String(parsed.status || ''))
      || !Number.isFinite(Date.parse(String(parsed.startedAt || '')))
      || !Number.isFinite(Date.parse(String(parsed.updatedAt || '')))) {
      throw new Error(`${label} has an unsupported worker heartbeat schema`);
    }
    return parsed.schemaVersion;
  }
  throw new Error(`unsupported live-golden artifact: ${name}`);
}

function liveGoldenRollbackMarkerPath(goldenRoot, name) {
  return path.join(goldenRoot, `.${name}${LIVE_GOLDEN_ROLLBACK_MARKER_SUFFIX}`);
}

function readLiveGoldenRollbackMarker(goldenRoot, name) {
  const marker = liveGoldenRollbackMarkerPath(goldenRoot, name);
  const stat = assertNotSymbolicLink(marker, 'live-golden rollback baseline marker');
  if (!stat) return '';
  const digest = readBoundedFile(marker, 'live-golden rollback baseline marker').toString('utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`live-golden rollback baseline marker is invalid: ${marker}`);
  }
  return digest;
}

function writeLiveGoldenRollbackMarker(goldenRoot, name, digest) {
  const marker = liveGoldenRollbackMarkerPath(goldenRoot, name);
  const body = Buffer.from(`${digest}\n`, 'utf8');
  if (!lstatIfPresent(marker)) {
    writeExclusiveAtomic(marker, body);
    return;
  }
  const existing = readLiveGoldenRollbackMarker(goldenRoot, name);
  if (existing !== digest) writeReplaceAtomic(marker, body);
}

function consumeLiveGoldenRollbackMarker(goldenRoot, name) {
  const marker = liveGoldenRollbackMarkerPath(goldenRoot, name);
  const stat = assertNotSymbolicLink(marker, 'live-golden rollback baseline marker');
  if (!stat) return;
  if (!stat.isFile()) {
    throw new Error(`live-golden rollback baseline marker is not a regular file: ${marker}`);
  }
  fs.unlinkSync(marker);
  fsyncDirectory(goldenRoot);
}

function migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, name, mode = 'forward') {
  if (!['forward', 'rollback'].includes(mode)) {
    throw new Error(`unsupported live-golden migration mode: ${mode}`);
  }
  const source = path.join(dataRoot, name);
  const target = path.join(goldenRoot, name);
  const sourceStat = assertNotSymbolicLink(source, 'legacy live-golden source');
  const targetStat = assertNotSymbolicLink(target, 'live-golden target');
  if (sourceStat && (!sourceStat.isFile() || sourceStat.size > MAX_LIVE_GOLDEN_ARTIFACT_BYTES)) {
    throw new Error(`legacy live-golden source is invalid: ${source}`);
  }
  if (targetStat && (!targetStat.isFile() || targetStat.size > MAX_LIVE_GOLDEN_ARTIFACT_BYTES)) {
    throw new Error(`live-golden target is invalid: ${target}`);
  }
  if (mode === 'rollback' && !targetStat) {
    throw new Error(`live-golden rollback source is missing: ${target}`);
  }
  const sourceBody = sourceStat
    ? readBoundedFile(source, 'legacy live-golden source', MAX_LIVE_GOLDEN_ARTIFACT_BYTES)
    : null;
  if (sourceBody) validateLiveGoldenArtifact(name, sourceBody, 'legacy live-golden source');
  const targetBody = targetStat
    ? readBoundedFile(target, 'live-golden target', MAX_LIVE_GOLDEN_ARTIFACT_BYTES)
    : null;
  if (targetBody) validateLiveGoldenArtifact(name, targetBody, 'live-golden target');

  if (mode === 'rollback') {
    if (!targetBody) throw new Error(`live-golden rollback source is missing: ${target}`);
    if (!sourceStat) writeExclusiveAtomic(source, targetBody);
    else if (!sourceBody.equals(targetBody)) writeReplaceAtomic(source, targetBody);
    writeLiveGoldenRollbackMarker(goldenRoot, name, sha256(targetBody));
    return;
  }

  const baseline = readLiveGoldenRollbackMarker(goldenRoot, name);
  if (!targetStat) {
    if (baseline) {
      throw new Error(`live-golden target missing while rollback baseline is active: ${name}`);
    }
    if (!sourceBody) return;
    writeExclusiveAtomic(target, sourceBody);
    return;
  }
  // With no active rollback bridge, the named /golden volume is authoritative.
  // Legacy /data may be older forever and mtime must never reverse that choice.
  if (!baseline) return;
  const targetDigest = sha256(targetBody);
  if (targetDigest !== baseline) {
    // A previous forward initializer may have completed the atomic
    // source->target replacement and crashed before unlinking the marker. When
    // both durable artifacts already agree, consuming the old marker is the
    // only idempotent continuation; no state is guessed or overwritten.
    if (sourceBody && sourceBody.equals(targetBody)) {
      consumeLiveGoldenRollbackMarker(goldenRoot, name);
      return;
    }
    throw new Error(`live-golden target changed after rollback bridge: ${name}`);
  }
  if (sourceBody && !sourceBody.equals(targetBody)) writeReplaceAtomic(target, sourceBody);
  consumeLiveGoldenRollbackMarker(goldenRoot, name);
}

function validBriefingText(value, maxLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateHomeKeywordBriefingArtifact(body, label) {
  const parsed = parseJsonObject(body, label);
  if (parsed.formulaVersion !== HOME_KEYWORD_BRIEFING_FORMULA_VERSION
    || parsed.source !== 'admin-image-ocr-reviewed'
    || !Number.isSafeInteger(parsed.revision)
    || parsed.revision < 1
    || typeof parsed.publishedAt !== 'string'
    || !Number.isFinite(Date.parse(parsed.publishedAt))
    || new Date(parsed.publishedAt).toISOString() !== parsed.publishedAt
    || !validBriefingText(parsed.title, 120)
    || !validBriefingText(parsed.author, 60)
    || !validBriefingText(parsed.updatedBy, 80)
    || !Array.isArray(parsed.sourceImages)
    || parsed.sourceImages.length > 12
    || !Array.isArray(parsed.rows)
    || parsed.rows.length < 1
    || parsed.rows.length > 240) {
    throw new Error(`${label} has an unsupported home keyword briefing schema`);
  }

  const sourceImages = [];
  for (const image of parsed.sourceImages) {
    if (!image || typeof image !== 'object' || Array.isArray(image)
      || !validBriefingText(image.name, 160)
      || typeof image.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(image.sha256)
      || !Number.isSafeInteger(image.width)
      || image.width < 1
      || image.width > 32768
      || !Number.isSafeInteger(image.height)
      || image.height < 1
      || image.height > 32768) {
      throw new Error(`${label} has an unsupported home keyword briefing schema`);
    }
    sourceImages.push({
      name: image.name,
      sha256: image.sha256,
      width: image.width,
      height: image.height,
    });
  }

  const rows = [];
  for (const row of parsed.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !validBriefingText(row.keyword, 120)
      || !Number.isSafeInteger(row.searchVolume)
      || row.searchVolume < 1
      || row.searchVolume > 1_000_000_000
      || !Number.isSafeInteger(row.documentCount)
      || row.documentCount < 0
      || row.documentCount > 10_000_000_000) {
      throw new Error(`${label} has an unsupported home keyword briefing schema`);
    }
    const opportunity = Math.round((row.searchVolume / (row.documentCount + 1)) * 100) / 100;
    if (typeof row.opportunity !== 'number'
      || !Number.isFinite(row.opportunity)
      || row.opportunity !== opportunity
      || (row.ocrConfidence !== undefined && (
        typeof row.ocrConfidence !== 'number'
        || !Number.isFinite(row.ocrConfidence)
        || row.ocrConfidence < 0
        || row.ocrConfidence > 100
        || Math.round(row.ocrConfidence * 100) / 100 !== row.ocrConfidence
      ))) {
      throw new Error(`${label} has an unsupported home keyword briefing schema`);
    }
    rows.push({
      keyword: row.keyword,
      searchVolume: row.searchVolume,
      documentCount: row.documentCount,
      opportunity,
      ...(row.ocrConfidence === undefined ? {} : { ocrConfidence: row.ocrConfidence }),
    });
  }

  const canonical = {
    title: parsed.title,
    author: parsed.author,
    publishedAt: parsed.publishedAt,
    revision: parsed.revision,
    formulaVersion: HOME_KEYWORD_BRIEFING_FORMULA_VERSION,
    source: 'admin-image-ocr-reviewed',
    sourceImages,
    rows,
    updatedBy: parsed.updatedBy,
  };
  const expectedSnapshotId = `kb-${sha256(Buffer.from(JSON.stringify(canonical), 'utf8')).slice(0, 16)}`;
  if (parsed.snapshotId !== expectedSnapshotId) {
    throw new Error(`${label} has an unsupported home keyword briefing schema`);
  }
  return HOME_KEYWORD_BRIEFING_FORMULA_VERSION;
}

function homeKeywordBriefingRollbackMarkerPath(briefingRoot, name) {
  return path.join(briefingRoot, `.${name}${LIVE_GOLDEN_ROLLBACK_MARKER_SUFFIX}`);
}

function readHomeKeywordBriefingRollbackMarker(briefingRoot, name) {
  const marker = homeKeywordBriefingRollbackMarkerPath(briefingRoot, name);
  const stat = assertNotSymbolicLink(marker, 'home keyword briefing rollback baseline marker');
  if (!stat) return '';
  const digest = readBoundedFile(
    marker,
    'home keyword briefing rollback baseline marker',
  ).toString('utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`home keyword briefing rollback baseline marker is invalid: ${marker}`);
  }
  return digest;
}

function writeHomeKeywordBriefingRollbackMarker(briefingRoot, name, digest) {
  const marker = homeKeywordBriefingRollbackMarkerPath(briefingRoot, name);
  const body = Buffer.from(`${digest}\n`, 'utf8');
  if (!lstatIfPresent(marker)) {
    writeExclusiveAtomic(marker, body);
    return;
  }
  const existing = readHomeKeywordBriefingRollbackMarker(briefingRoot, name);
  if (existing !== digest) writeReplaceAtomic(marker, body);
}

function consumeHomeKeywordBriefingRollbackMarker(briefingRoot, name) {
  const marker = homeKeywordBriefingRollbackMarkerPath(briefingRoot, name);
  const stat = assertNotSymbolicLink(marker, 'home keyword briefing rollback baseline marker');
  if (!stat) return;
  if (!stat.isFile()) {
    throw new Error(`home keyword briefing rollback baseline marker is not a regular file: ${marker}`);
  }
  fs.unlinkSync(marker);
  fsyncDirectory(briefingRoot);
}

function migrateHomeKeywordBriefingArtifact(
  dataRoot,
  briefingRoot,
  name = HOME_KEYWORD_BRIEFING_FILE,
  mode = 'forward',
) {
  if (!['forward', 'rollback'].includes(mode)) {
    throw new Error(`unsupported home keyword briefing migration mode: ${mode}`);
  }
  const source = path.join(dataRoot, name);
  const target = path.join(briefingRoot, name);
  const sourceStat = assertNotSymbolicLink(source, 'legacy home keyword briefing source');
  const targetStat = assertNotSymbolicLink(target, 'home keyword briefing target');
  if (sourceStat && (!sourceStat.isFile() || sourceStat.size > MAX_HOME_KEYWORD_BRIEFING_BYTES)) {
    throw new Error(`legacy home keyword briefing source is invalid: ${source}`);
  }
  if (targetStat && (!targetStat.isFile() || targetStat.size > MAX_HOME_KEYWORD_BRIEFING_BYTES)) {
    throw new Error(`home keyword briefing target is invalid: ${target}`);
  }
  if (!sourceStat && !targetStat) return;

  const targetBody = targetStat
    ? readBoundedFile(target, 'home keyword briefing target', MAX_HOME_KEYWORD_BRIEFING_BYTES)
    : null;
  if (targetBody) validateHomeKeywordBriefingArtifact(targetBody, 'home keyword briefing target');

  if (mode === 'rollback') {
    if (!targetBody) {
      throw new Error(`home keyword briefing rollback source is missing: ${target}`);
    }
    const sourceBody = sourceStat
      ? readBoundedFile(source, 'legacy home keyword briefing source', MAX_HOME_KEYWORD_BRIEFING_BYTES)
      : null;
    if (sourceBody) {
      validateHomeKeywordBriefingArtifact(sourceBody, 'legacy home keyword briefing source');
    }
    if (!sourceBody) writeExclusiveAtomic(source, targetBody);
    else if (!sourceBody.equals(targetBody)) writeReplaceAtomic(source, targetBody);
    writeHomeKeywordBriefingRollbackMarker(briefingRoot, name, sha256(targetBody));
    return;
  }

  const baseline = readHomeKeywordBriefingRollbackMarker(briefingRoot, name);
  if (!targetBody) {
    if (baseline) {
      throw new Error(`home keyword briefing target missing while rollback baseline is active: ${name}`);
    }
    const sourceBody = readBoundedFile(
      source,
      'legacy home keyword briefing source',
      MAX_HOME_KEYWORD_BRIEFING_BYTES,
    );
    validateHomeKeywordBriefingArtifact(sourceBody, 'legacy home keyword briefing source');
    writeExclusiveAtomic(target, sourceBody);
    return;
  }
  // Outside an active rollback bridge the dedicated /briefing volume is the
  // single source of truth. The legacy /data copy may remain stale forever.
  if (!baseline) return;
  const sourceBody = sourceStat
    ? readBoundedFile(source, 'legacy home keyword briefing source', MAX_HOME_KEYWORD_BRIEFING_BYTES)
    : null;
  if (!sourceBody) {
    throw new Error(`legacy home keyword briefing missing while rollback baseline is active: ${name}`);
  }
  validateHomeKeywordBriefingArtifact(sourceBody, 'legacy home keyword briefing source');
  const targetDigest = sha256(targetBody);
  if (targetDigest !== baseline) {
    if (sourceBody.equals(targetBody)) {
      consumeHomeKeywordBriefingRollbackMarker(briefingRoot, name);
      return;
    }
    throw new Error(`home keyword briefing target changed after rollback bridge: ${name}`);
  }
  if (!sourceBody.equals(targetBody)) writeReplaceAtomic(target, sourceBody);
  consumeHomeKeywordBriefingRollbackMarker(briefingRoot, name);
}

function migrateSearchAdAccountPool(dataRoot, searchAdRoot, name = 'searchad-accounts.json') {
  const source = path.join(dataRoot, name);
  const target = path.join(searchAdRoot, name);
  const sourceStat = assertNotSymbolicLink(source, 'legacy SearchAd account pool');
  const targetStat = assertNotSymbolicLink(target, 'SearchAd account pool target');
  if (sourceStat && (!sourceStat.isFile() || sourceStat.size > MAX_SEARCHAD_ACCOUNT_POOL_BYTES)) {
    throw new Error(`legacy SearchAd account pool is invalid: ${source}`);
  }
  if (targetStat && (!targetStat.isFile() || targetStat.size > MAX_SEARCHAD_ACCOUNT_POOL_BYTES)) {
    throw new Error(`SearchAd account pool target is invalid: ${target}`);
  }
  if (!sourceStat) return;
  const sourceBody = readBoundedFile(
    source,
    'legacy SearchAd account pool',
    MAX_SEARCHAD_ACCOUNT_POOL_BYTES,
  );
  if (!targetStat) {
    writeExclusiveAtomic(target, sourceBody);
    return;
  }
  const targetBody = readBoundedFile(
    target,
    'SearchAd account pool target',
    MAX_SEARCHAD_ACCOUNT_POOL_BYTES,
  );
  if (!sourceBody.equals(targetBody)) {
    throw new Error(`SearchAd account pool conflict: ${name}`);
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function writeExclusiveAtomic(target, body, mode = 0o600) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.migration`);
  if (lstatIfPresent(temporary)) {
    throw new Error(`migration temp already exists: ${temporary}`);
  }
  if (lstatIfPresent(target)) {
    throw new Error(`migration target already exists: ${target}`);
  }

  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(descriptor, body);
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }

  try {
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    // A retained temp is deliberate: the next run must fail closed instead of
    // guessing whether a partial migration is trustworthy.
    throw error;
  }
}

function markerPath(reviewRoot, name) {
  return path.join(reviewRoot, `.${name}.legacy-baseline.sha256`);
}

function readBaselineMarker(filePath) {
  const stat = assertNotSymbolicLink(filePath, 'legacy baseline marker');
  if (!stat) return '';
  const value = readBoundedFile(filePath, 'legacy baseline marker').toString('utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`legacy baseline marker is invalid: ${filePath}`);
  }
  return value;
}

function createBaselineMarker(reviewRoot, name, digest) {
  const marker = markerPath(reviewRoot, name);
  const existing = readBaselineMarker(marker);
  if (existing) {
    if (existing !== digest) throw new Error(`legacy baseline marker conflict: ${marker}`);
    return;
  }
  writeExclusiveAtomic(marker, Buffer.from(`${digest}\n`, 'utf8'));
}

function migrateReviewArtifact(dataRoot, reviewRoot, name) {
  const source = path.join(dataRoot, name);
  const target = path.join(reviewRoot, name);
  const temporary = path.join(reviewRoot, `.${name}.migration`);
  const sourceStat = assertNotSymbolicLink(source, 'legacy review source');
  const targetStat = assertNotSymbolicLink(target, 'review target');
  if (lstatIfPresent(temporary)) {
    throw new Error(`migration temp already exists: ${temporary}`);
  }
  if (sourceStat && !sourceStat.isFile()) {
    throw new Error(`legacy review source is not a regular file: ${source}`);
  }
  if (targetStat && !targetStat.isFile()) {
    throw new Error(`review target is not a regular file: ${target}`);
  }

  if (targetStat) {
    const targetBody = readBoundedFile(target, 'review target');
    if (!sourceStat) return;
    const sourceBody = readBoundedFile(source, 'legacy review source');
    const sourceDigest = sha256(sourceBody);
    const baseline = readBaselineMarker(markerPath(reviewRoot, name));
    if (!baseline) {
      if (!sourceBody.equals(targetBody)) {
        throw new Error(`legacy/new review artifact conflict without baseline: ${name}`);
      }
      createBaselineMarker(reviewRoot, name, sourceDigest);
      return;
    }
    if (baseline !== sourceDigest) {
      throw new Error(`legacy review source changed after migration: ${name}`);
    }
    // The /review target is authoritative after the one-time migration when
    // the legacy source still matches the recorded baseline.
    return;
  }
  if (!sourceStat) return;

  const sourceBody = readBoundedFile(source, 'legacy review source');
  writeExclusiveAtomic(target, sourceBody);
  createBaselineMarker(reviewRoot, name, sha256(sourceBody));
}

function readAuditDirectory(directory, label) {
  assertDirectory(directory, label);
  const artifacts = new Map();
  for (const name of fs.readdirSync(directory)) {
    if (name.endsWith('.migration')) {
      throw new Error(`migration temp already exists: ${path.join(directory, name)}`);
    }
    const artifactPath = path.join(directory, name);
    const body = readBoundedFile(artifactPath, `${label} artifact`);
    artifacts.set(name, body);
  }
  return artifacts;
}

function migrateReviewAuditDirectory(dataRoot, reviewRoot, name) {
  const source = path.join(dataRoot, name);
  const target = path.join(reviewRoot, name);
  const sourceStat = assertNotSymbolicLink(source, 'legacy review audit source');
  const targetStat = assertNotSymbolicLink(target, 'review audit target');
  if (sourceStat && !sourceStat.isDirectory()) {
    throw new Error(`legacy review audit source is not a directory: ${source}`);
  }
  if (targetStat && !targetStat.isDirectory()) {
    throw new Error(`review audit target is not a directory: ${target}`);
  }
  if (!sourceStat) {
    if (targetStat) readAuditDirectory(target, 'review audit target');
    return;
  }

  const sourceArtifacts = readAuditDirectory(source, 'legacy review audit source');
  if (!targetStat) {
    fs.mkdirSync(target, { mode: 0o700 });
    fsyncDirectory(reviewRoot);
  }
  const targetArtifacts = readAuditDirectory(target, 'review audit target');
  for (const [artifactName, sourceBody] of sourceArtifacts) {
    const existing = targetArtifacts.get(artifactName);
    if (existing) {
      if (!existing.equals(sourceBody)) {
        throw new Error(`audit artifact conflict: ${artifactName}`);
      }
      continue;
    }
    writeExclusiveAtomic(path.join(target, artifactName), sourceBody);
  }
}

function chownTreeNoFollow(target, uid, gid) {
  const stat = assertNotSymbolicLink(target, 'volume entry');
  if (!stat) throw new Error(`volume entry is missing: ${target}`);
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new Error(`unsupported volume entry: ${target}`);
  }
  fs.chownSync(target, uid, gid);
  fs.chmodSync(target, stat.isDirectory() ? 0o700 : 0o600);
  if (!stat.isDirectory()) return;
  for (const name of fs.readdirSync(target)) {
    chownTreeNoFollow(path.join(target, name), uid, gid);
  }
}

function verifyOwnedWritableRoot(root, uid, gid) {
  const stat = assertDirectory(root, 'volume root');
  if (stat.uid !== uid || stat.gid !== gid || (stat.mode & 0o777) !== 0o700) {
    throw new Error(`volume root is not private and owned by ${uid}:${gid}: ${root}`);
  }
}

function initializeProductionVolumes(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || '/data');
  const goldenRoot = path.resolve(options.goldenRoot || '/golden');
  const reviewRoot = path.resolve(options.reviewRoot || '/review');
  const briefingRoot = path.resolve(options.briefingRoot || '/briefing');
  const searchAdRoot = path.resolve(options.searchAdRoot || '/searchad');
  const quotaRoot = path.resolve(options.quotaRoot || '/quota');
  const mode = String(options.mode || process.env.LEWORD_VOLUME_INIT_MODE || 'forward');
  const manageOwnership = options.manageOwnership !== false;
  assertDirectory(dataRoot, 'data volume root');
  assertDirectory(goldenRoot, 'live-golden volume root');
  assertDirectory(reviewRoot, 'review volume root');
  assertDirectory(briefingRoot, 'home keyword briefing volume root');
  assertDirectory(searchAdRoot, 'SearchAd account volume root');
  assertDirectory(quotaRoot, 'measurement quota volume root');
  if (new Set([dataRoot, goldenRoot, reviewRoot, briefingRoot, searchAdRoot, quotaRoot]).size !== 6) {
    throw new Error('production data, live-golden, review, briefing, SearchAd, and quota roots must be distinct');
  }

  if (mode === 'forward') {
    for (const name of REVIEW_FILES) {
      migrateReviewArtifact(dataRoot, reviewRoot, name);
    }
    migrateReviewAuditDirectory(dataRoot, reviewRoot, REVIEW_AUDIT_DIRECTORY);
    for (const name of LIVE_GOLDEN_FILES) {
      migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, name);
    }
    migrateHomeKeywordBriefingArtifact(dataRoot, briefingRoot);
    migrateSearchAdAccountPool(dataRoot, searchAdRoot);
  } else {
    for (const name of LIVE_GOLDEN_FILES) {
      migrateLatestLiveGoldenArtifact(dataRoot, goldenRoot, name, 'rollback');
    }
    migrateHomeKeywordBriefingArtifact(
      dataRoot,
      briefingRoot,
      HOME_KEYWORD_BRIEFING_FILE,
      'rollback',
    );
  }
  synchronizeQuotaStateArtifacts(dataRoot, quotaRoot, mode);

  if (manageOwnership) {
    chownTreeNoFollow(dataRoot, NODE_UID, NODE_GID);
    chownTreeNoFollow(goldenRoot, NODE_UID, NODE_GID);
    chownTreeNoFollow(reviewRoot, NODE_UID, NODE_GID);
    chownTreeNoFollow(briefingRoot, NODE_UID, NODE_GID);
    chownTreeNoFollow(searchAdRoot, NODE_UID, NODE_GID);
    chownTreeNoFollow(quotaRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(dataRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(goldenRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(reviewRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(briefingRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(searchAdRoot, NODE_UID, NODE_GID);
    verifyOwnedWritableRoot(quotaRoot, NODE_UID, NODE_GID);
  }
}

function main() {
  try {
    initializeProductionVolumes();
    process.stdout.write('[volume-init] production volumes ready\n');
  } catch (error) {
    process.stderr.write(`[volume-init] ${String(error && error.message ? error.message : error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  initializeProductionVolumes,
  migrateLatestLiveGoldenArtifact,
  synchronizeQuotaStateArtifacts,
  migrateSearchAdAccountPool,
  migrateReviewArtifact,
  migrateReviewAuditDirectory,
  migrateHomeKeywordBriefingArtifact,
};
