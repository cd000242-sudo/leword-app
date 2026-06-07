const fs = require('fs');
const path = require('path');

require('ts-node/register/transpile-only');

const {
  MOBILE_PC_PARITY_SLA,
} = require('../src/mobile/contracts');

const DEFAULT_JOB_TIMEOUT_MS = 180000;
const root = path.join(__dirname, '..');

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function resolveOut(outPath) {
  if (!outPath) return null;
  return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
}

function writeJson(value, outPath) {
  const resolved = resolveOut(outPath);
  if (!resolved) return null;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

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

async function timed(label, operation) {
  const startedAt = Date.now();
  const value = await operation();
  return {
    label,
    elapsedMs: Date.now() - startedAt,
    value,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function check(name, ok, detail, severity = 'required') {
  return { name, ok: !!ok, detail, severity };
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.ok).length,
    failedRequired: checks.filter((item) => !item.ok && item.severity === 'required').length,
    failedRecommended: checks.filter((item) => !item.ok && item.severity !== 'required').length,
  };
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function pollJobForPerformance(baseUrl, accessToken, jobId, options) {
  const startedAt = Date.now();
  let firstProgressMs = null;
  let lastJob = null;

  while (Date.now() - startedAt <= options.timeoutMs) {
    const response = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: buildHeaders(accessToken),
    });
    const payload = await readJsonResponse(response, 'job poll');
    const job = payload.job;
    lastJob = job;

    const progress = finiteNumber(job?.progressPercent);
    if (firstProgressMs === null && (progress !== null && progress > 0 || job?.state === 'completed')) {
      firstProgressMs = Date.now() - startedAt;
    }

    if (job && ['completed', 'failed', 'cancelled'].includes(job.state)) {
      return {
        job,
        firstProgressMs,
        terminalMs: Date.now() - startedAt,
      };
    }

    await sleep(options.pollIntervalMs);
  }

  throw Object.assign(new Error(`mobile API performance job timed out: ${jobId}`), {
    lastJob,
    firstProgressMs,
  });
}

async function runMobileApiPerformanceSmoke(options = {}) {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl
      || process.env.LEWORD_MOBILE_PERF_API_URL
      || process.env.LEWORD_MOBILE_SMOKE_API_URL
      || process.env.EXPO_PUBLIC_LEWORD_API_URL,
  );
  if (!baseUrl) {
    throw new Error('Set LEWORD_MOBILE_PERF_API_URL, LEWORD_MOBILE_SMOKE_API_URL, or EXPO_PUBLIC_LEWORD_API_URL.');
  }

  const accessToken = options.accessToken
    || process.env.LEWORD_MOBILE_PERF_TOKEN
    || process.env.LEWORD_MOBILE_SMOKE_TOKEN
    || process.env.LEWORD_MOBILE_API_TOKEN
    || '';
  const runJob = options.runJob
    ?? (process.env.LEWORD_MOBILE_PERF_RUN_JOB !== 'false');
  const expectMeasured = options.expectMeasured
    ?? (process.env.LEWORD_MOBILE_PERF_EXPECT_MEASURED !== 'false');
  const keyword = options.keyword || process.env.LEWORD_MOBILE_PERF_KEYWORD || '근로장려금';
  const timeoutMs = Number(options.timeoutMs || process.env.LEWORD_MOBILE_PERF_TIMEOUT_MS || DEFAULT_JOB_TIMEOUT_MS);
  const pollIntervalMs = Number(options.pollIntervalMs || process.env.LEWORD_MOBILE_PERF_POLL_INTERVAL_MS || 1000);
  const budgets = {
    healthP95: Number(options.budgets?.healthP95 || process.env.LEWORD_MOBILE_PERF_HEALTH_P95_MS || MOBILE_PC_PARITY_SLA.latencyBudgetsMs.jobAcceptedP95),
    notificationP95: Number(options.budgets?.notificationP95 || process.env.LEWORD_MOBILE_PERF_NOTIFICATION_P95_MS || MOBILE_PC_PARITY_SLA.latencyBudgetsMs.jobAcceptedP95),
    jobAcceptedP95: Number(options.budgets?.jobAcceptedP95 || process.env.LEWORD_MOBILE_PERF_JOB_ACCEPTED_P95_MS || MOBILE_PC_PARITY_SLA.latencyBudgetsMs.jobAcceptedP95),
    firstProgressP95: Number(options.budgets?.firstProgressP95 || process.env.LEWORD_MOBILE_PERF_FIRST_PROGRESS_P95_MS || MOBILE_PC_PARITY_SLA.latencyBudgetsMs.firstProgressP95),
    terminalP95: Number(options.budgets?.terminalP95 || process.env.LEWORD_MOBILE_PERF_TERMINAL_P95_MS || MOBILE_PC_PARITY_SLA.latencyBudgetsMs.mindmapFirstPageP95),
  };

  const healthTiming = await timed('health', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
    return readJsonResponse(response, 'health');
  });
  const health = healthTiming.value;

  let notificationTiming = null;
  if (accessToken) {
    notificationTiming = await timed('notification-inbox', async () => {
      const response = await fetch(`${baseUrl}/v1/notifications?limit=1`, {
        method: 'GET',
        headers: buildHeaders(accessToken),
      });
      return readJsonResponse(response, 'notification inbox');
    });
  }

  let jobCreateTiming = null;
  let jobPerformance = null;
  let job = null;
  if (runJob) {
    jobCreateTiming = await timed('keyword-analysis-create', async () => {
      const response = await fetch(`${baseUrl}/v1/keywords/analyze`, {
        method: 'POST',
        headers: buildHeaders(accessToken),
        body: JSON.stringify({
          keyword,
          maxRelatedCount: 1,
          includeMindmapPreview: false,
        }),
      });
      return readJsonResponse(response, 'keyword analysis job create');
    });
    const createdJob = jobCreateTiming.value.job;
    jobPerformance = await pollJobForPerformance(baseUrl, accessToken, createdJob.id, {
      timeoutMs,
      pollIntervalMs,
    });
    job = jobPerformance.job;
  }

  const checks = [
    check('health responds within SLA',
      healthTiming.elapsedMs <= budgets.healthP95,
      `${healthTiming.elapsedMs}ms <= ${budgets.healthP95}ms`),
    check('health exposes PC parity SLA',
      !!health.parity && health.parity.devicePolicy?.heavyBrowserAutomation === 'server-only',
      'health.parity must expose server-only mobile policy'),
    check('runtime readiness is present',
      !!health.runtime && Array.isArray(health.runtime.checks),
      'health.runtime must expose production worker readiness'),
    check('notification inbox responds within SLA',
      !notificationTiming || notificationTiming.elapsedMs <= budgets.notificationP95,
      notificationTiming ? `${notificationTiming.elapsedMs}ms <= ${budgets.notificationP95}ms` : 'skipped without access token',
      notificationTiming ? 'required' : 'recommended'),
  ];

  if (runJob) {
    checks.push(
      check('keyword job accepted within SLA',
        jobCreateTiming.elapsedMs <= budgets.jobAcceptedP95,
        `${jobCreateTiming.elapsedMs}ms <= ${budgets.jobAcceptedP95}ms`),
      check('keyword job first progress within SLA',
        jobPerformance.firstProgressMs !== null && jobPerformance.firstProgressMs <= budgets.firstProgressP95,
        `${jobPerformance.firstProgressMs}ms <= ${budgets.firstProgressP95}ms`),
      check('keyword job terminal state is completed',
        job.state === 'completed',
        `state=${job.state}`),
      check('keyword job terminal within first-page SLA',
        jobPerformance.terminalMs <= budgets.terminalP95,
        `${jobPerformance.terminalMs}ms <= ${budgets.terminalP95}ms`,
        'recommended'),
    );
    if (expectMeasured) {
      checks.push(check('keyword job returns measured PC metrics',
        Number(job.result?.summary?.measured || 0) > 0
          && (job.result?.keywords || []).some((item) => item.isMeasured === true),
        'requires measured search volume/document metrics from server-side PC path'));
    }
  } else {
    checks.push(check('keyword performance job skipped', true, 'set LEWORD_MOBILE_PERF_RUN_JOB=true to verify job latency', 'recommended'));
  }

  const summary = summarize(checks);
  return {
    generatedAt: new Date().toISOString(),
    ok: summary.failedRequired === 0,
    baseUrl,
    keyword: runJob ? keyword : null,
    budgets,
    summary,
    checks,
    blockers: checks.filter((item) => !item.ok),
    timings: {
      healthMs: healthTiming.elapsedMs,
      notificationMs: notificationTiming?.elapsedMs ?? null,
      jobAcceptedMs: jobCreateTiming?.elapsedMs ?? null,
      firstProgressMs: jobPerformance?.firstProgressMs ?? null,
      terminalMs: jobPerformance?.terminalMs ?? null,
    },
    health: {
      runtime: health.runtime || null,
      jobs: health.jobs || null,
      cache: health.cache || null,
      prewarm: health.prewarm || null,
      parity: health.parity || null,
    },
    job,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  runMobileApiPerformanceSmoke({ argv })
    .then((report) => {
      const written = writeJson(report, readArg(argv, '--out', ''));
      console.log(JSON.stringify({ ...report, written }, null, 2));
      process.exit(argv.includes('--strict') && !report.ok ? 1 : 0);
    })
    .catch((err) => {
      console.error(JSON.stringify(err.report || { ok: false, message: err.message }, null, 2));
      console.error(`[mobile-api-performance-smoke] failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runMobileApiPerformanceSmoke,
};
