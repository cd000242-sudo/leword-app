/**
 * Phase 0 — 지식인 황금질문 크롤링 벤치마크
 *
 * 목적: SSS 승급 작업 전 베이스라인 성능 측정
 * 측정: getPopularQnA() 5회 반복, 벽시계 시간 + RSS 메모리 증분
 * 출력: baseline/bench.json + 콘솔 p50/p95/avg
 *
 * 실행: npx ts-node scripts/bench-kin.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPopularQnA, closeBrowser } from '../src/utils/naver-kin-golden-hunter-v3';

interface RunResult {
  run: number;
  wallMs: number;
  rssBeforeMb: number;
  rssAfterMb: number;
  rssDeltaMb: number;
  totalCrawled: number;
  goldenFound: number;
  sssCount: number;
  ssCount: number;
  sCount: number;
  error?: string;
}

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  const RUNS = 5;
  const results: RunResult[] = [];

  console.log(`[BENCH] 지식인 크롤링 벤치마크 시작 — ${RUNS}회 반복`);
  console.log(`[BENCH] 대상: getPopularQnA() (무료, 메인+조회순 30개)\n`);

  for (let i = 1; i <= RUNS; i++) {
    const rssBefore = process.memoryUsage().rss;
    const t0 = Date.now();
    const run: RunResult = {
      run: i,
      wallMs: 0,
      rssBeforeMb: mb(rssBefore),
      rssAfterMb: 0,
      rssDeltaMb: 0,
      totalCrawled: 0,
      goldenFound: 0,
      sssCount: 0,
      ssCount: 0,
      sCount: 0,
    };

    try {
      console.log(`[BENCH] Run ${i}/${RUNS} 시작...`);
      const result = await getPopularQnA();
      run.wallMs = Date.now() - t0;
      run.totalCrawled = result.stats?.totalCrawled ?? 0;
      run.goldenFound = result.stats?.goldenFound ?? 0;
      run.sssCount = result.stats?.sssCount ?? 0;
      run.ssCount = result.stats?.ssCount ?? 0;
      run.sCount = result.stats?.sCount ?? 0;
      console.log(
        `[BENCH] Run ${i} 완료 — ${run.wallMs}ms, 크롤 ${run.totalCrawled}개, 황금 ${run.goldenFound}개 (SSS ${run.sssCount} / SS ${run.ssCount} / S ${run.sCount})`
      );
    } catch (e: any) {
      run.wallMs = Date.now() - t0;
      run.error = e?.message ?? String(e);
      console.error(`[BENCH] Run ${i} 실패 (${run.wallMs}ms):`, run.error);
    }

    const rssAfter = process.memoryUsage().rss;
    run.rssAfterMb = mb(rssAfter);
    run.rssDeltaMb = mb(rssAfter - rssBefore);
    results.push(run);

    if (i < RUNS) {
      console.log(`[BENCH] 다음 run까지 3초 대기...\n`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  await closeBrowser();

  const okRuns = results.filter((r) => !r.error);
  const times = okRuns.map((r) => r.wallMs).sort((a, b) => a - b);
  const summary = {
    runs: RUNS,
    successful: okRuns.length,
    failed: results.length - okRuns.length,
    wallMs: {
      min: times[0] ?? 0,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times[times.length - 1] ?? 0,
      avg: okRuns.length ? Math.round(times.reduce((a, b) => a + b, 0) / okRuns.length) : 0,
    },
    avgCrawled: okRuns.length
      ? Math.round(okRuns.reduce((a, b) => a + b.totalCrawled, 0) / okRuns.length)
      : 0,
    avgGolden: okRuns.length
      ? Math.round(okRuns.reduce((a, b) => a + b.goldenFound, 0) / okRuns.length)
      : 0,
    avgRssDeltaMb: okRuns.length
      ? Math.round((okRuns.reduce((a, b) => a + b.rssDeltaMb, 0) / okRuns.length) * 10) / 10
      : 0,
    timestamp: new Date().toISOString(),
  };

  const output = { summary, results };
  const outPath = path.resolve(__dirname, '..', 'baseline', 'bench.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('[BENCH] 요약');
  console.log('='.repeat(60));
  console.log(`성공/실패: ${summary.successful}/${summary.failed}`);
  console.log(`벽시계(ms): min=${summary.wallMs.min} p50=${summary.wallMs.p50} p95=${summary.wallMs.p95} max=${summary.wallMs.max} avg=${summary.wallMs.avg}`);
  console.log(`평균 크롤/황금: ${summary.avgCrawled}/${summary.avgGolden}`);
  console.log(`평균 RSS 증가: ${summary.avgRssDeltaMb} MB`);
  console.log(`\n결과 저장: ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[BENCH] 치명적 오류:', e);
    process.exit(1);
  });
