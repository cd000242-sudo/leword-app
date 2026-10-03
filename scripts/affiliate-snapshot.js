'use strict';

function currentCaptureFiles(manifest, site, now = Date.now()) {
  if (!['toss', 'brandconnect'].includes(site)) return [];
  const age = now - Date.parse(manifest?.generatedAt);
  const capture = manifest?.sites?.[site];
  if (!/^[a-zA-Z0-9-]+$/.test(manifest?.runId || '') || !Number.isFinite(age)
      || age < -300000 || age > 86400000 || capture?.maybeLoggedOut) return [];
  const prefix = `${manifest.runId}/${site}/`;
  return (Array.isArray(capture?.capturedFiles) ? capture.capturedFiles : []).filter((file) => typeof file === 'string'
    && file.startsWith(prefix) && /^\d+\.json$/.test(file.slice(prefix.length)));
}

/** Inventory size and paid measurement budget are separate. Never truncate a fresh capture to the API budget. */
function prepareCampaignInventory(items, { collectedAt, keywordOf, limit = 24 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 160) throw new Error('limit must be an integer from 1 to 160');
  const inventory = [], targetIndexes = [], seen = new Set();
  const measuredFields = ['searchVolume', 'documentCount', 'serpTop', 'keywordEvidence', 'needKeyword', 'needVolume',
    'needDocs', 'needRatio', 'needSerpTop', 'slots', 'seat', 'brief', 'aiTitle', 'recommendation', 'shoppingClicked',
    'shoppingCategory', 'derivedAt', 'perSaleWon'];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    const key = raw.productId ? `id:${raw.productId}` : `name:${raw.name.replace(/\s+/g, '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fresh = { ...raw, keyword: String(keywordOf(raw.name) || ''), collectedAt };
    for (const field of measuredFields) delete fresh[field];
    if (fresh.keyword && !fresh.issuedOnly && targetIndexes.length < limit) targetIndexes.push(inventory.length);
    inventory.push(fresh);
  }
  return { items: inventory, targetIndexes, targets: targetIndexes.map(index => ({ ...inventory[index] })) };
}

/** Only the selected fresh rows can receive this run's measurements; unmeasured rows stay unmeasured. */
function applyCampaignAnalysis(plan, measured) {
  const result = plan.items.map(item => ({ ...item }));
  for (let i = 0; i < plan.targetIndexes.length; i++) {
    const index = plan.targetIndexes[i], row = measured?.[i];
    if (!row || row.name !== result[index].name || row.keyword !== result[index].keyword) continue;
    result[index] = { ...result[index], ...row, collectedAt: result[index].collectedAt };
  }
  return result;
}

/** Failed/stale platforms and link-management-only rows must not receive fresh evidence timestamps. */
function freshCampaignItems(snapshot, now = Date.now()) {
  return Object.values(snapshot?.sites || {}).flatMap(site => {
    const age = now - Date.parse(site?.collectedAt);
    if (site?.status !== 'ready' || !Number.isFinite(age) || age < -300000 || age > 48 * 3600000) return [];
    return (Array.isArray(site.items) ? site.items : []).filter(item => item && !item.issuedOnly);
  });
}

function mergeCampaignSnapshots(previous, incoming, checkedAt) {
  const sites = { ...(previous?.sites || {}) };
  for (const [id, next] of Object.entries(incoming)) {
    const prior = sites[id];
    const before = prior?.items?.length || 0;
    const count = next.items?.length || 0;
    const age = Date.parse(checkedAt) - Date.parse(next.collectedAt);
    const validDate = Number.isFinite(age) && age >= -300000 && age <= 86400000;
    const incomplete = count > 0 && before > 0 && count < before * 0.5;
    const success = validDate && count > 0 && !incomplete && (!next.status || next.status === 'ready');
    sites[id] = success ? { ...next, status: 'ready', checkedAt } : {
      ...(prior || { label: next.label || id, items: [] }),
      collectedAt: prior?.collectedAt || previous?.collectedAt || null,
      checkedAt,
      status: incomplete ? 'incomplete' : (next.status && next.status !== 'ready' ? next.status : 'collection-failed'),
    };
  }
  // 한 플랫폼의 성공 시각을 다른 플랫폼에 전파하지 않는다.
  const normalized = Object.fromEntries(Object.entries(sites).map(([id, site]) => [id, {
    ...site, collectedAt: site.collectedAt || previous?.collectedAt || null,
  }]));
  const dates = Object.values(normalized).map((site) => site.collectedAt).filter((date) => Number.isFinite(Date.parse(date))).sort();
  return { collectedAt: dates.at(-1) || null, checkedAt, sites: normalized };
}

module.exports = { currentCaptureFiles, mergeCampaignSnapshots, prepareCampaignInventory, applyCampaignAnalysis, freshCampaignItems };
