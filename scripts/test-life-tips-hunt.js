// Stage 1 검증: PRO 트래픽 헌터 — 카테고리='life_tips' 결과 검증
// Usage: node scripts/test-life-tips-hunt.js
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const HUNT_TIMEOUT_MS = 360000; // 6분

(async () => {
  console.log('▶ Electron 앱 기동 중...');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  // 메인 프로세스 stdout/stderr 캡처 (PRO-TRAFFIC 로그 보려면 필수)
  const mainLogs = [];
  try {
    const proc = app.process();
    if (proc?.stdout) {
      proc.stdout.on('data', (d) => {
        const lines = String(d).split('\n').filter(l => l.trim());
        for (const l of lines) {
          if (l.includes('PRO-TRAFFIC') || l.includes('LIFE_TIPS') || l.includes('life_tips') ||
              l.includes('METRICS') || l.includes('NAVER-SEARCHAD') || l.includes('SEARCH-VOLUME') ||
              l.includes('재호출') || l.includes('회복')) {
            mainLogs.push(`[stdout] ${l}`);
          }
        }
      });
    }
    if (proc?.stderr) {
      proc.stderr.on('data', (d) => {
        const s = String(d).trim();
        if (s && !s.includes('cache_util_win') && !s.includes('disk_cache')) {
          mainLogs.push(`[stderr] ${s}`);
        }
      });
    }
  } catch (e) {
    console.warn('  메인 stdout 캡처 실패:', e.message);
  }

  // keyword-master 창 대기
  let page = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 30000) {
    for (const w of app.windows()) {
      try {
        const url = w.url();
        if (url.includes('keyword-master.html')) { page = w; break; }
      } catch {}
    }
    if (page) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!page) {
    console.error('❌ keyword-master 창 못 찾음');
    for (const w of app.windows()) {
      console.log('   -', await w.url().catch(() => '?'));
    }
    await app.close();
    process.exit(1);
  }
  console.log('✅ keyword-master 창 발견');

  // 콘솔 로그 수집 (PRO-TRAFFIC 관련만)
  const proLogs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('PRO-TRAFFIC') || t.includes('LIFE_TIPS') || t.includes('life_tips')) {
      proLogs.push(`[${msg.type()}] ${t}`);
    }
  });
  page.on('pageerror', (err) => proLogs.push(`[pageerror] ${err.message}`));

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // window.electronAPI.invoke 가용 확인
  const apiCheck = await page.evaluate(() => ({
    hasApi: typeof window.electronAPI !== 'undefined',
    hasInvoke: typeof window.electronAPI?.invoke === 'function',
  }));
  console.log('  electronAPI:', apiCheck);
  if (!apiCheck.hasInvoke) {
    console.error('❌ electronAPI.invoke 사용 불가');
    await app.close();
    process.exit(1);
  }

  console.log(`▶ hunt-pro-traffic-keywords 호출 중 (mode=category, category=life_tips, count=20)...`);
  console.log(`  ⏱ 최대 ${HUNT_TIMEOUT_MS / 1000}초 대기`);

  const startedAt = Date.now();
  const result = await page.evaluate(async (timeoutMs) => {
    return await Promise.race([
      window.electronAPI.invoke('hunt-pro-traffic-keywords', {
        mode: 'category',
        category: 'life_tips',
        count: 20,
        targetRookie: true,
        includeSeasonKeywords: true,
        explosionMode: false,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]).catch(err => ({ success: false, error: String(err?.message || err), keywords: [] }));
  }, HUNT_TIMEOUT_MS);
  const elapsedMs = Date.now() - startedAt;

  console.log(`\n=== 결과 (${(elapsedMs / 1000).toFixed(1)}초 소요) ===`);
  console.log('  success:', result.success);
  console.log('  error:', result.error || '(없음)');
  console.log('  keywords.length:', result.keywords?.length || 0);
  console.log('  summary:', JSON.stringify(result.summary || {}, null, 2));

  const keywords = Array.isArray(result.keywords) ? result.keywords : [];
  if (keywords.length > 0) {
    console.log(`\n=== 상위 20개 키워드 ===`);
    keywords.slice(0, 20).forEach((k, i) => {
      const kw = k.keyword || '?';
      const sv = k.searchVolume ?? 'null';
      const dc = k.documentCount ?? 'null';
      const gr = typeof k.goldenRatio === 'number' ? k.goldenRatio.toFixed(2) : '?';
      const gd = k.grade || '?';
      console.log(`  ${(i + 1).toString().padStart(2)}. [${gd}] ${kw} (sv=${sv}, dc=${dc}, gr=${gr})`);
    });

    // 등급 분포
    const gradeCount = {};
    keywords.forEach(k => { gradeCount[k.grade || '?'] = (gradeCount[k.grade || '?'] || 0) + 1; });
    console.log('\n  등급 분포:', gradeCount);

    // 카테고리 매칭 휴리스틱: life_tips 토큰 포함 여부
    const lifeTipsTokens = ['청소', '빨래', '세탁', '곰팡이', '냄새', '수납', '정리', '동파', '결로', '난방',
      '습도', '제습', '환기', '대청소', '김장', '월동', '단열', '곰팡이', '음식물', '보관', '꿀팁', '노하우'];
    const matched = keywords.filter(k => {
      const s = String(k.keyword || '');
      return lifeTipsTokens.some(t => s.includes(t));
    });
    console.log(`  카테고리 휴리스틱 매칭: ${matched.length}/${keywords.length} (${((matched.length / keywords.length) * 100).toFixed(0)}%)`);
  }

  // 로그 저장
  const logPath = path.join(__dirname, '..', 'test-results', `life-tips-hunt-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify({
    elapsedMs,
    result,
    proLogs: proLogs.slice(-100),
    mainLogs: mainLogs.slice(-200),
  }, null, 2));
  console.log(`\n  로그 저장: ${logPath}`);

  console.log(`\n=== PRO-TRAFFIC 관련 로그 (마지막 30) ===`);
  for (const m of proLogs.slice(-30)) console.log(' ', m);

  // 판정
  const passed = result.success === true && keywords.length >= 5;
  console.log('\n' + (passed ? `✅ PASS — ${keywords.length}개 키워드` : `❌ FAIL — ${keywords.length}개 키워드`));

  await app.close();
  process.exit(passed ? 0 : 2);
})().catch((e) => {
  console.error('💥 예외:', e);
  process.exit(3);
});
