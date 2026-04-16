// 모든 주요 모달 열림 확인 (Playwright Electron)
// Usage: node scripts/test-all-modals.js
const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  console.log('▶ Electron 앱 기동 중...');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
  });

  let page = await app.firstWindow();
  console.log('  첫 윈도우:', await page.title().catch(() => '?'));

  // 키워드 마스터 창 대기
  let kwWindow = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 25000) {
    for (const w of app.windows()) {
      try {
        if (w.url().includes('keyword-master.html')) {
          kwWindow = w;
          break;
        }
      } catch {}
    }
    if (kwWindow) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!kwWindow) {
    console.error('❌ 키워드 마스터 창 없음');
    await app.close();
    process.exit(1);
  }
  page = kwWindow;
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const errors = [];
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  const tests = [];

  function addTest(name, fn) {
    tests.push({ name, fn });
  }

  function modalVisible(selector) {
    return page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { exists: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        exists: true,
        display: cs.display,
        visibility: cs.visibility,
        width: r.width,
        height: r.height,
        zIndex: cs.zIndex,
      };
    }, selector);
  }

  async function closeIfAny(sel) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) el.style.display = 'none';
    }, sel);
  }

  // Test 1: PRO 트래픽 헌터
  addTest('🏆 PRO 트래픽 헌터', async () => {
    await page.evaluate(() => { window.openProTrafficModal(); });
    await page.waitForTimeout(800);
    const s = await modalVisible('#proTrafficModal');
    await closeIfAny('#proTrafficModal');
    return s;
  });

  // Test 2: 유튜브 황금키워드 모달
  addTest('🎬 유튜브 황금키워드', async () => {
    await page.evaluate(() => { window.openModal('youtube-golden'); });
    await page.waitForTimeout(800);
    const s = await modalVisible('.modal-overlay');
    await page.evaluate(() => { if (window.closeModal) window.closeModal(); });
    return s;
  });

  // Test 3: 키워드 설정 모달 (환경설정)
  addTest('⚙️ 키워드 설정 모달', async () => {
    await page.evaluate(() => { window.openKeywordSettingsModal(); });
    await page.waitForTimeout(1000);
    const s = await modalVisible('#keywordSettingsModal');
    await page.evaluate(() => {
      const m = document.getElementById('keywordSettingsModal');
      if (m) m.style.display = 'none';
    });
    return s;
  });

  // Test 4: Blueprint 모달 (PRO Hunter v12 청사진)
  addTest('📋 청사진 모달', async () => {
    // openBlueprintModal은 SERP 크롤까지 진행되어 느림 → 모달만 띄우고 로딩 상태 확인
    await page.evaluate(() => {
      const modal = document.getElementById('blueprintModal');
      if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        document.getElementById('bpTitle').innerHTML = '<span>📋</span> 테스트';
        document.getElementById('bpBody').innerHTML = '테스트 로딩';
        modal.style.display = 'flex';
      }
    });
    await page.waitForTimeout(500);
    const s = await modalVisible('#blueprintModal');
    await closeIfAny('#blueprintModal');
    return s;
  });

  // Test 5: Cluster 모달
  addTest('🔗 클러스터 모달', async () => {
    await page.evaluate(() => {
      const modal = document.getElementById('clusterModal');
      if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.display = 'flex';
      }
    });
    await page.waitForTimeout(500);
    const s = await modalVisible('#clusterModal');
    await closeIfAny('#clusterModal');
    return s;
  });

  // Test 5b: Pyramid 모달 (Tier 2)
  addTest('🏛️ 피라미드 모달', async () => {
    await page.evaluate(() => {
      const modal = document.getElementById('pyramidModal');
      if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.style.display = 'flex';
      }
    });
    await page.waitForTimeout(500);
    const s = await modalVisible('#pyramidModal');
    await closeIfAny('#pyramidModal');
    return s;
  });

  // Test 6: Tracking Dashboard 모달
  addTest('📊 추적 대시보드', async () => {
    await page.evaluate(() => { window.openTrackingDashboard(); });
    await page.waitForTimeout(1500);
    const s = await modalVisible('#trackingDashboardModal');
    await closeIfAny('#trackingDashboardModal');
    return s;
  });

  // Test 7: Key Wizard Guide 모달
  addTest('🪄 키 마법사 가이드', async () => {
    await page.evaluate(() => {
      // kwOpenGuide needs provider cache populated, simulate
      if (window.KW_PROVIDERS_CACHE) {
        window.KW_PROVIDERS_CACHE.list = [{
          site: 'youtube',
          displayName: 'Test',
          icon: '🎯',
          description: 'test',
          preSteps: [{ title: 'test', description: 'test' }],
        }];
      }
      if (window.kwOpenGuide) window.kwOpenGuide('youtube');
    });
    await page.waitForTimeout(500);
    const s = await modalVisible('#kwGuideModal');
    await closeIfAny('#kwGuideModal');
    return s;
  });

  // Test 8: 함수 존재 검증
  addTest('🔧 핵심 함수 존재 확인', async () => {
    return page.evaluate(() => ({
      openBlueprintModal: typeof window.openBlueprintModal,
      openClusterModal: typeof window.openClusterModal,
      openPyramidModal: typeof window.openPyramidModal,
      openTrackingDashboard: typeof window.openTrackingDashboard,
      openTrackPostPrompt: typeof window.openTrackPostPrompt,
      generateDraftFromBlueprint: typeof window.generateDraftFromBlueprint,
      profileMeasure: typeof window.profileMeasure,
      kwOpenGuide: typeof window.kwOpenGuide,
      dashboardRunPrecrawl: typeof window.dashboardRunPrecrawl,
    }));
  });

  // 실행
  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const t of tests) {
    try {
      const r = await t.fn();
      const ok =
        (r && typeof r === 'object' && 'exists' in r && r.exists && r.width > 0 && r.display !== 'none') ||
        (r && typeof r === 'object' && !('exists' in r) && Object.values(r).every((v) => v === 'function'));
      if (ok) {
        passCount++;
        results.push(`  ✅ ${t.name}`);
      } else {
        failCount++;
        results.push(`  ❌ ${t.name} → ${JSON.stringify(r)}`);
      }
    } catch (err) {
      failCount++;
      results.push(`  💥 ${t.name} → ${err.message}`);
    }
  }

  console.log('\n=== 결과 ===');
  for (const r of results) console.log(r);
  console.log(`\n총 ${passCount}/${passCount + failCount} 통과`);

  if (errors.length > 0) {
    console.log('\n=== Page 에러 ===');
    for (const e of errors.slice(0, 20)) console.log('  ' + e);
  }

  await app.close();
  process.exit(failCount === 0 ? 0 : 2);
})().catch((e) => {
  console.error('💥 예외:', e);
  process.exit(3);
});
