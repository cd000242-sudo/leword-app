// Naver SearchAd API 직접 호출 진단
// 어떤 키워드가 통과/실패하는지 확인 — life_tips 헌트 0개의 진짜 원인 격리
const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
  });

  // 메인 stdout 캡처 (네트워크 에러 보려면)
  const errors = [];
  try {
    const proc = app.process();
    if (proc?.stdout) {
      proc.stdout.on('data', (d) => {
        const s = String(d);
        const sLower = s.toLowerCase();
        if (sLower.includes('searchad') || sLower.includes('search-volume') ||
            s.includes('SEARCHAD') || s.includes('DEBUG') || s.includes('휴리스틱') ||
            s.includes('429') || s.includes('401') || s.includes('403') ||
            sLower.includes('error') || s.includes('실패')) {
          for (const line of s.split('\n').filter(l => l.trim())) {
            errors.push(`[stdout] ${line}`);
          }
        }
      });
    }
    if (proc?.stderr) {
      proc.stderr.on('data', (d) => {
        const s = String(d).trim();
        if (s && !s.includes('cache_util_win') && !s.includes('disk_cache')) {
          errors.push(`[stderr] ${s}`);
        }
      });
    }
  } catch {}

  let page = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 30000) {
    for (const w of app.windows()) {
      try {
        if ((w.url() || '').includes('keyword-master.html')) { page = w; break; }
      } catch {}
    }
    if (page) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!page) { console.error('❌ 창 없음'); await app.close(); process.exit(1); }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // 키워드 5개 진단 (analyze-keyword-competition 사용)
  const testKeywords = [
    '다이어트',         // 범용 흔한 키워드 (반드시 데이터 있어야 함)
    '곰팡이 제거',       // life_tips 단순
    '결로 방지 방법',     // life_tips 3단어
    '동파 방지',         // life_tips 시즌
    '난방비 절약',       // life_tips 시즌
  ];

  console.log('▶ 키워드별 Naver API 진단 (analyze-keyword-competition)');
  for (const kw of testKeywords) {
    const r = await page.evaluate(async (k) => {
      try {
        const result = await window.electronAPI.invoke('analyze-keyword-competition', k);
        return {
          ok: true,
          success: result?.success,
          error: result?.error,
          searchVolume: result?.data?.searchVolume,
          documentCount: result?.data?.documentCount,
          competitionScore: result?.data?.competitionScore,
        };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }, kw);
    console.log(`  "${kw}":`, JSON.stringify(r).slice(0, 300));
    await page.waitForTimeout(500);
  }

  console.log('\n=== 에러/경고 로그 ===');
  for (const e of errors.slice(-30)) console.log(' ', e);

  await app.close();
})().catch(e => { console.error('💥', e); process.exit(3); });
