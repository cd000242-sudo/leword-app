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

module.exports = { currentCaptureFiles, mergeCampaignSnapshots };
