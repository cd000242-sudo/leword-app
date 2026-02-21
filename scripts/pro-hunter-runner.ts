import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

type RunnerResult = {
  success: boolean;
  category: string;
  runIndex?: number;
  mode: string;
  explosionMode: boolean;
  count: number;
  summary?: any;
  keywords?: any[];
  error?: string;
  attempts: number;
  durationMs: number;
};

function runChild(params: {
  category: string;
  mode: 'realtime' | 'category' | 'season';
  explosionMode: boolean;
  count: number;
  timeoutMs: number;
}): Promise<{ ok: boolean; payload: any; durationMs: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const childPath = path.join(__dirname, 'pro-hunter-child.ts');

    const args: string[] = [
      '-r',
      'ts-node/register',
      childPath,
      params.category,
      `--mode=${params.mode}`,
      `--count=${params.count}`
    ];
    if (params.explosionMode) args.push('--explosion');

    const child = spawn(process.execPath, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '';
    let err = '';

    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      const durationMs = Date.now() - started;
      resolve({ ok: false, payload: { success: false, error: 'timeout' }, durationMs, timedOut: true });
    }, params.timeoutMs);

    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });

    child.on('close', () => {
      clearTimeout(t);
      const durationMs = Date.now() - started;
      const text = out.trim() || '';

      try {
        const parsed = text ? JSON.parse(text) : { success: false, error: 'empty output', stderr: err };
        resolve({ ok: !!parsed?.success, payload: { ...parsed, stderr: err }, durationMs, timedOut: false });
      } catch {
        resolve({ ok: false, payload: { success: false, error: 'non-json output', stdout: out, stderr: err }, durationMs, timedOut: false });
      }
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);

  const formatTimestamp = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const categoriesArg = argv.find(a => a.startsWith('--categories='));
  const categories = (categoriesArg ? categoriesArg.split('=')[1] : '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const uiAllCategories = argv.includes('--uiAllCategories');

  const modeArg = argv.find(a => a.startsWith('--mode='));
  const mode = (modeArg ? (modeArg.split('=')[1] as any) : 'realtime') as 'realtime' | 'category' | 'season';

  const explosionMode = argv.includes('--explosion');

  const countArg = argv.find(a => a.startsWith('--count='));
  const count = countArg ? Number(countArg.split('=')[1]) : 20;

  const timeoutArg = argv.find(a => a.startsWith('--timeoutMs='));
  const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 60000;

  const retriesArg = argv.find(a => a.startsWith('--retries='));
  const retries = retriesArg ? Number(retriesArg.split('=')[1]) : 0;

  const repeatArg = argv.find(a => a.startsWith('--repeat='));
  const repeat = repeatArg ? Math.max(1, Number(repeatArg.split('=')[1])) : 1;

  const outArgIndex = argv.findIndex(a => a === '--out' || a.startsWith('--out='));
  let outFile = '';
  if (outArgIndex >= 0) {
    const a = argv[outArgIndex];
    if (a === '--out') {
      outFile = argv[outArgIndex + 1] || '';
    } else {
      outFile = a.split('=')[1] || '';
      if (!outFile && argv[outArgIndex + 1] && !argv[outArgIndex + 1].startsWith('--')) {
        outFile = argv[outArgIndex + 1];
      }
    }
    outFile = String(outFile).trim();
  }

  const UI_ALL_CATEGORIES = [
    // 엔터테인먼트·예술
    'book', 'movie', 'art', 'performance', 'music', 'drama', 'celeb', 'anime', 'broadcast',
    // 생활·노하우·쇼핑
    'daily', 'life_tips', 'parenting', 'pet', 'quotes', 'fashion', 'interior', 'recipe', 'review', 'garden',
    // 취미·여가·여행
    'game', 'sports', 'photo', 'car', 'hobby', 'travel_domestic', 'travel_overseas', 'food',
    // 지식·동향
    'it', 'society', 'health', 'business', 'language', 'education', 'realestate', 'self_development'
  ];

  const defaultCategories = [
    'life_tips',
    'interior',
    'review',
    'recipe',
    'celeb',
    'it',
    'business',
    'sports'
  ];

  const runCategories = categories.length > 0
    ? categories
    : (uiAllCategories ? UI_ALL_CATEGORIES : defaultCategories);

  const results: RunnerResult[] = [];

  for (const category of runCategories) {
    process.stdout.write(`\n== Running category=${category} x${repeat} mode=${mode} explosion=${explosionMode} count=${count} timeoutMs=${timeoutMs} retries=${retries} ==\n`);

    for (let runIndex = 1; runIndex <= repeat; runIndex++) {
      let lastPayload: any = null;
      let attempts = 0;
      const started = Date.now();

      process.stdout.write(`- run ${runIndex}/${repeat}\n`);

      for (let i = 0; i <= retries; i++) {
        attempts++;
        process.stdout.write(`  - attempt ${attempts}/${retries + 1}...\n`);
        const r = await runChild({ category, mode, explosionMode, count, timeoutMs });
        lastPayload = r.payload;

        const n = Array.isArray(lastPayload?.keywords) ? lastPayload.keywords.length : 0;
        const status = r.timedOut ? 'timeout' : (r.ok ? 'ok' : 'fail');
        process.stdout.write(`    -> ${status} keywords=${n} duration=${r.durationMs}ms${lastPayload?.error ? ` error=${lastPayload.error}` : ''}\n`);

        const ok = r.ok && Array.isArray(lastPayload?.keywords) && lastPayload.keywords.length > 0;
        if (ok) {
          break;
        }
      }

      const durationMs = Date.now() - started;
      const lastN = Array.isArray(lastPayload?.keywords) ? lastPayload.keywords.length : 0;
      const success = !!(lastPayload?.success && lastN > 0);

      results.push({
        success,
        category,
        runIndex,
        mode,
        explosionMode,
        count,
        summary: lastPayload?.summary,
        keywords: lastPayload?.keywords,
        error: lastPayload?.error,
        attempts,
        durationMs
      });

      process.stdout.write(`  == Done run ${runIndex}/${repeat} success=${success} keywords=${lastN} attempts=${attempts} total=${durationMs}ms ==\n`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    explosionMode,
    count,
    timeoutMs,
    retries,
    results
  };

  const resolvedOutFile = (() => {
    if (outFile) return outFile;
    const now = new Date();
    const stamp = formatTimestamp(now);

    const explosionLabel = explosionMode ? 'explosion-' : '';
    const modeLabel = mode ? `${mode}-` : '';
    const catLabel = runCategories.length > 0
      ? (runCategories.length === 1 ? runCategories[0] : (uiAllCategories ? 'uiAll' : `subset${runCategories.length}`))
      : 'default';

    const safeCatLabel = String(catLabel).replace(/[^a-z0-9_-]/gi, '_');
    return `pro-run-${explosionLabel}${modeLabel}${safeCatLabel}-repeat${repeat}-${stamp}.json`;
  })();

  const abs = path.isAbsolute(resolvedOutFile) ? resolvedOutFile : path.join(process.cwd(), resolvedOutFile);
  fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`Wrote report to ${abs}\n`);

  // concise stdout
  for (const r of results) {
    const n = r.keywords?.length || 0;
    const runLabel = typeof r.runIndex === 'number' ? `#${r.runIndex}` : '';
    process.stdout.write(`[${r.category}${runLabel}] success=${r.success} keywords=${n} attempts=${r.attempts} time=${r.durationMs}ms${r.error ? ` error=${r.error}` : ''}\n`);
  }

  const fail = results.filter(r => !r.success);
  process.exit(fail.length > 0 ? 2 : 0);
}

main().catch((err: any) => {
  process.stderr.write(String(err?.stack || err?.message || err));
  process.exit(1);
});
