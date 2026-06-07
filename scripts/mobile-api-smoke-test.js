const DEFAULT_JOB_TIMEOUT_MS = 180000;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildHeaders(accessToken, extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...extra,
  };
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON response`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status} ${payload?.message || ''}`.trim());
  }
  return payload;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(baseUrl, accessToken, jobId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: buildHeaders(accessToken),
    });
    const payload = await readJsonResponse(response, 'job poll');
    const job = payload.job;
    if (job && ['completed', 'failed', 'cancelled'].includes(job.state)) {
      return job;
    }
    await sleep(1500);
  }
  throw new Error(`mobile API smoke job timed out: ${jobId}`);
}

async function runMobileApiSmokeTest(options = {}) {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl
      || process.env.LEWORD_MOBILE_SMOKE_API_URL
      || process.env.EXPO_PUBLIC_LEWORD_API_URL,
  );
  if (!baseUrl) {
    throw new Error('Set LEWORD_MOBILE_SMOKE_API_URL or EXPO_PUBLIC_LEWORD_API_URL to the deployed LEWORD API URL.');
  }

  const accessToken = options.accessToken
    || process.env.LEWORD_MOBILE_SMOKE_TOKEN
    || process.env.LEWORD_MOBILE_API_TOKEN
    || '';
  const requireRuntimeReady = options.requireRuntimeReady
    ?? (process.env.LEWORD_MOBILE_SMOKE_REQUIRE_RUNTIME_READY !== 'false');
  const runJob = options.runJob
    ?? (process.env.LEWORD_MOBILE_SMOKE_RUN_JOB === 'true');
  const expectMeasured = options.expectMeasured
    ?? (process.env.LEWORD_MOBILE_SMOKE_EXPECT_MEASURED !== 'false');
  const timeoutMs = Number(options.timeoutMs || process.env.LEWORD_MOBILE_SMOKE_TIMEOUT_MS || DEFAULT_JOB_TIMEOUT_MS);
  const keyword = options.keyword || process.env.LEWORD_MOBILE_SMOKE_KEYWORD || 'worker readiness smoke';

  const checks = [];
  const healthResponse = await fetch(`${baseUrl}/health`, { method: 'GET' });
  const health = await readJsonResponse(healthResponse, 'health');
  checks.push({ name: 'health', ok: health.ok === true && health.service === 'leword-api' });
  checks.push({ name: 'endpoint-count', ok: Number(health.endpoints || 0) >= 6 });
  checks.push({ name: 'runtime-readiness-present', ok: !!health.runtime && Array.isArray(health.runtime.checks) });
  if (requireRuntimeReady) {
    checks.push({ name: 'runtime-ready', ok: health.runtime?.ok === true });
  }

  if (accessToken) {
    const notificationsResponse = await fetch(`${baseUrl}/v1/notifications?limit=1`, {
      method: 'GET',
      headers: buildHeaders(accessToken),
    });
    const notifications = await readJsonResponse(notificationsResponse, 'notification inbox');
    checks.push({ name: 'notification-inbox', ok: notifications.ok === true && !!notifications.snapshot });
  } else {
    checks.push({ name: 'notification-inbox', ok: true, skipped: true });
  }

  let job = null;
  if (runJob) {
    const createResponse = await fetch(`${baseUrl}/v1/keywords/analyze`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        keyword,
        maxRelatedCount: 1,
        includeMindmapPreview: false,
      }),
    });
    const created = await readJsonResponse(createResponse, 'keyword analysis job create');
    job = created.job;
    checks.push({ name: 'job-create', ok: created.ok === true && !!job?.id && !!created.links?.events });
    job = await pollJob(baseUrl, accessToken, job.id, timeoutMs);
    checks.push({ name: 'job-terminal', ok: job.state === 'completed' });
    if (expectMeasured) {
      checks.push({ name: 'job-measured', ok: Number(job.result?.summary?.measured || 0) > 0 });
    }
  } else {
    checks.push({ name: 'keyword-analysis-job', ok: true, skipped: true });
  }

  const failed = checks.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    baseUrl,
    generatedAt: new Date().toISOString(),
    checks,
    health: {
      runtime: health.runtime || null,
      jobs: health.jobs || null,
      cache: health.cache || null,
      prewarm: health.prewarm || null,
      push: health.push || null,
    },
    job,
  };

  if (failed.length > 0) {
    throw Object.assign(new Error(`mobile API smoke failed: ${failed.map((item) => item.name).join(', ')}`), { report });
  }

  return report;
}

if (require.main === module) {
  runMobileApiSmokeTest()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      console.log('[mobile-api-smoke-test] passed');
    })
    .catch((err) => {
      console.error(JSON.stringify(err.report || { ok: false, message: err.message }, null, 2));
      console.error(`[mobile-api-smoke-test] failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runMobileApiSmokeTest,
};
