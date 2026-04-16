// 실 키워드 end-to-end 테스트 (PRO Hunter v12 전체 파이프라인)
// Usage: node scripts/test-real-keywords.js
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

// 3개 대표 키워드 (난이도/시즌성/카테고리 다양성)
const TEST_KEYWORDS = [
  { keyword: '현관문 결로 방지', category: '생활꿀팁', type: 'seasonal_longtail' },
  { keyword: '홈트레이닝 초보', category: '건강', type: 'competitive_evergreen' },
  { keyword: '자취 원룸 수납', category: '인테리어', type: 'niche_lifestyle' },
];

const RESULT_PATH = path.join(__dirname, '..', 'test-results', `real-kw-${Date.now()}.json`);

(async () => {
  if (!fs.existsSync(path.dirname(RESULT_PATH))) {
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  }

  console.log('▶ Electron 앱 기동...');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
  });

  // 메인 프로세스 stdout+stderr 캡처 (V12 로그 확인용)
  const mainLogs = [];
  try {
    const proc = app.process();
    if (proc && proc.stdout) {
      proc.stdout.on('data', (data) => {
        const text = data.toString();
        if (/\[V12\]|\[SURGE\]|검색량|searchad/i.test(text)) {
          mainLogs.push('[stdout] ' + text.trim());
        }
      });
    }
    if (proc && proc.stderr) {
      proc.stderr.on('data', (data) => {
        const text = data.toString();
        if (/\[V12\]|\[SURGE\]|검색량|searchad|error|fail/i.test(text)) {
          mainLogs.push('[stderr] ' + text.trim());
        }
      });
    }
  } catch (err) {
    console.warn('메인 로그 캡처 실패:', err.message);
  }

  // 키워드 마스터 창 대기
  let page = null;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    for (const w of app.windows()) {
      try {
        if (w.url().includes('keyword-master.html')) {
          page = w;
          break;
        }
      } catch {}
    }
    if (page) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!page) {
    console.error('❌ 키워드 마스터 창 미발견');
    await app.close();
    process.exit(1);
  }

  console.log('✅ 창 발견');
  await page.waitForLoadState('domcontentloaded');
  page.setDefaultTimeout(120000); // 120초 (SERP 크롤 + API 다중 호출)
  await page.waitForTimeout(3000);

  // 콘솔 로그 수집 (main 프로세스 로그도 보고 싶으면 electron stdout 필요)
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[V12]') || text.includes('[BLUEPRINT]') || text.includes('error')) {
      logs.push(`[${msg.type()}] ${text}`);
    }
  });

  const results = [];

  for (const test of TEST_KEYWORDS) {
    console.log(`\n▶ 키워드: "${test.keyword}" (${test.type})`);
    const startTime = Date.now();

    try {
      // timeout 120초 (검색광고 5개 변형 + SERP + smartblock + google 병렬)
      const result = await page.evaluate(async (kw) => {
        if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
          return { error: 'electronAPI 미초기화' };
        }
        try {
          const r = await window.electronAPI.invoke('generate-keyword-blueprint', {
            keyword: kw,
            force: true,
          });
          return r;
        } catch (err) {
          return { error: String(err && err.message || err) };
        }
      }, test.keyword);

      const duration = Date.now() - startTime;
      console.log(`  완료: ${(duration / 1000).toFixed(1)}s`);

      if (result && result.success) {
        const bp = result.blueprint || {};
        const pred = result.prediction || {};
        const sb = result.smartBlocks || {};
        const an = result.analysis || {};
        console.log(
          `  예상 순위: ${pred.rankRange || '?'} / 신뢰도: ${pred.confidence || '?'} / 난이도: ${pred.difficultyScore || '?'}`
        );
        console.log(
          `  스마트블록 기회: ${sb.bloggerOpportunityScore || '?'}/100 (${sb.totalBlocks || 0}개 블록)`
        );
        console.log(`  SERP 분석: ${an.postCount || 0}개 / 평균 ${an.avgWordCount || 0}단어`);
        console.log(`  추천 제목: ${bp.strategicTitle || '없음'}`);
        console.log(`  청사진 source: ${bp.source || '?'}`);
      } else {
        console.log(`  ❌ 실패: ${result && result.error || '알 수 없음'}`);
      }

      results.push({
        ...test,
        durationMs: duration,
        result,
      });
    } catch (err) {
      console.log(`  💥 예외: ${err.message}`);
      results.push({ ...test, error: err.message });
    }

    // 다음 키워드 전에 잠깐 쉬기 (API 부하)
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 결과 저장
  console.log('\n=== V12 메인 로그 (마지막 30개) ===');
  for (const line of mainLogs.slice(-30)) console.log('  ' + line);

  const output = {
    testedAt: new Date().toISOString(),
    totalKeywords: TEST_KEYWORDS.length,
    results,
    logs: logs.slice(-100),
    mainLogs: mainLogs.slice(-100),
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✅ 결과 저장: ${RESULT_PATH}`);

  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error('💥 예외:', e);
  process.exit(3);
});
