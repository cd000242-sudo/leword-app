// Step 3: 다른 카테고리들의 다단어 키워드 API 정상 동작 확인
// system-wide fix 검증
const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
  });

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

  // 카테고리별 다단어 대표 키워드
  const testKeywords = [
    { cat: 'electronics', kw: '로봇청소기 추천' },
    { cat: 'electronics', kw: '무선 청소기 비교' },
    { cat: 'health', kw: '영양제 추천' },
    { cat: 'health', kw: '비타민 D' },
    { cat: 'beauty', kw: '선크림 추천' },
    { cat: 'beauty', kw: '아이크림 순위' },
    { cat: 'finance', kw: '적금 금리 비교' },
    { cat: 'realestate', kw: '전세자금대출 조건' },
    { cat: 'fashion', kw: '가을 코디 추천' },
    { cat: 'recipe', kw: '김치찌개 레시피' },
  ];

  console.log('▶ 다단어 키워드 검색량 검증 (system-wide fix 확인)\n');
  let pass = 0;
  let fail = 0;
  const failed = [];
  for (const { cat, kw } of testKeywords) {
    const r = await page.evaluate(async (k) => {
      try {
        const result = await window.electronAPI.invoke('analyze-keyword-competition', k);
        return {
          sv: result?.data?.searchVolume,
          dc: result?.data?.documentCount,
        };
      } catch (e) { return { error: String(e?.message || e) }; }
    }, kw);
    const sv = r.sv ?? 0;
    const ok = sv > 0;
    if (ok) pass++; else { fail++; failed.push(`[${cat}] ${kw}`); }
    console.log(`  ${ok ? '✅' : '❌'} [${cat.padEnd(12)}] "${kw}" → sv=${sv}, dc=${r.dc}`);
    await page.waitForTimeout(500);
  }

  console.log(`\n=== 결과 ===`);
  console.log(`  통과: ${pass}/${testKeywords.length}`);
  console.log(`  실패: ${fail}/${testKeywords.length}`);
  if (failed.length > 0) {
    console.log(`  실패 키워드:`);
    for (const f of failed) console.log(`    - ${f}`);
  }
  const passed = pass >= testKeywords.length * 0.8; // 80%+ 통과 = system-wide fix OK
  console.log('\n' + (passed ? `✅ PASS — system-wide fix 확인 (${pass}/${testKeywords.length})` : `❌ FAIL`));

  await app.close();
  process.exit(passed ? 0 : 2);
})().catch(e => { console.error('💥', e); process.exit(3); });
