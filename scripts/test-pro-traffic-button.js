// PRO 트래픽 버튼 수동 검증 스크립트
// Usage: node scripts/test-pro-traffic-button.js
const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  console.log('▶ Electron 앱 기동 중...');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
  });

  // 첫 번째 윈도우 (라이선스 창일 수 있음 → 키워드 마스터 창 대기)
  let page = await app.firstWindow();
  console.log('  첫 윈도우 title:', await page.title().catch(() => '?'));

  // 키워드 마스터 창 자동 열림 대기 (최대 25초)
  let keywordWindow = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 25000) {
    const wins = app.windows();
    for (const w of wins) {
      try {
        const url = w.url();
        if (url.includes('keyword-master.html')) {
          keywordWindow = w;
          break;
        }
      } catch {}
    }
    if (keywordWindow) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!keywordWindow) {
    console.error('❌ 키워드 마스터 창을 찾을 수 없음. 라이선스 화면일 가능성.');
    console.log('  현재 창 목록:');
    for (const w of app.windows()) {
      console.log('   -', await w.url().catch(() => '?'));
    }
    await app.close();
    process.exit(1);
  }

  console.log('✅ 키워드 마스터 창 발견');
  page = keywordWindow;

  // 콘솔 메시지 수집
  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    consoleMessages.push(`[pageerror] ${err.message}`);
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('▶ openProTrafficModal 정의 확인');
  const fnState = await page.evaluate(() => ({
    fnDefined: typeof window.openProTrafficModal === 'function',
    categoriesDefined: typeof PRO_TRAFFIC_CATEGORIES !== 'undefined',
  })).catch((e) => ({ error: e.message }));
  console.log('  결과:', fnState);

  console.log('▶ PRO 트래픽 버튼 클릭');
  const clickResult = await page.evaluate(() => {
    try {
      window.openProTrafficModal();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message, stack: (err.stack || '').slice(0, 500) };
    }
  });
  console.log('  결과:', clickResult);

  await page.waitForTimeout(1500);

  // 모달 존재 확인
  const modalState = await page.evaluate(() => {
    const m = document.getElementById('proTrafficModal');
    if (!m) return { exists: false };
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    return {
      exists: true,
      display: cs.display,
      visibility: cs.visibility,
      zIndex: cs.zIndex,
      width: r.width,
      height: r.height,
      top: r.top,
    };
  });
  console.log('  모달 상태:', modalState);

  console.log('\n=== 콘솔 로그 (최근 30개) ===');
  for (const m of consoleMessages.slice(-30)) {
    console.log(' ', m);
  }

  // 검증
  const passed =
    clickResult.success &&
    modalState.exists &&
    modalState.display !== 'none' &&
    modalState.width > 0;

  console.log('\n' + (passed ? '✅ PASS' : '❌ FAIL'));

  await app.close();
  process.exit(passed ? 0 : 2);
})().catch((e) => {
  console.error('💥 예외:', e);
  process.exit(3);
});
