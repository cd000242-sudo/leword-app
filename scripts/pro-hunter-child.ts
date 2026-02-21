import { huntProTrafficKeywords } from '../src/utils/pro-traffic-keyword-hunter';

async function main() {
  // stdout은 러너가 JSON만 파싱하므로, 로그는 stderr로 보낸다.
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  console.log = (...args: any[]) => console.error(...args);
  console.info = (...args: any[]) => console.error(...args);
  console.warn = (...args: any[]) => console.error(...args);

  let wroteOutput = false;
  const watchdogMs = 230000;
  const watchdog = setTimeout(() => {
    if (wroteOutput) return;
    try {
      process.stdout.write(JSON.stringify({
        success: false,
        category: (process.argv.slice(2)[0] || 'all'),
        error: `child watchdog timeout (${watchdogMs}ms)`
      }));
    } finally {
      process.exit(124);
    }
  }, watchdogMs);

  const args = process.argv.slice(2);
  const category = args[0] || 'all';
  const explosionMode = args.includes('--explosion');
  const forceRefresh = args.includes('--refresh');
  const modeArg = args.find(a => a.startsWith('--mode='));
  const mode = (modeArg ? modeArg.split('=')[1] : 'realtime') as 'realtime' | 'category' | 'season';

  const countArg = args.find(a => a.startsWith('--count='));
  const count = countArg ? Number(countArg.split('=')[1]) : 20;

  console.error(`[CHILD] start category=${category} mode=${mode} explosion=${explosionMode} count=${count}`);

  const result = await huntProTrafficKeywords({
    mode,
    category,
    explosionMode,
    count,
    forceRefresh,
    includeSeasonKeywords: true,
    targetRookie: true
  });

  console.error(`[CHILD] done category=${category} keywords=${result?.keywords?.length || 0}`);

  const minimalKeywords = Array.isArray(result?.keywords)
    ? result.keywords.map((k: any) => ({
        keyword: k?.keyword,
        grade: k?.grade,
        searchVolume: k?.searchVolume,
        documentCount: k?.documentCount,
        goldenRatio: k?.goldenRatio,
        source: k?.source,
      }))
    : [];

  wroteOutput = true;
  clearTimeout(watchdog);
  process.stdout.write(JSON.stringify({
    success: true,
    category,
    mode,
    explosionMode,
    count,
    summary: result.summary,
    keywords: minimalKeywords
  }));

  // 타임아웃된 비동기 작업(네트워크/브라우저 등)이 이벤트 루프를 붙잡는 경우가 있어
  // 러너에서는 결과 출력 후 강제 종료로 "멈춤"을 방지한다.
  setImmediate(() => process.exit(0));
}

main().catch((err: any) => {
  console.error(`[CHILD] error: ${err?.message || String(err)}`);
  process.stdout.write(JSON.stringify({
    success: false,
    error: err?.message || String(err)
  }));
  process.exit(1);
});
