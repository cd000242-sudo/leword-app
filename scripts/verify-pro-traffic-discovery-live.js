// Live verification for PRO Traffic Hunter discovery-first behavior.
// Usage:
//   node scripts/verify-pro-traffic-discovery-live.js life_tips --count=100
//   node scripts/verify-pro-traffic-discovery-live.js life_tips,policy,it --count=100 --mode=category
//   node scripts/verify-pro-traffic-discovery-live.js all --count=100 --mode=realtime
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const categoriesArg = (argv[0] || 'life_tips').trim();
const categories = categoriesArg.split(',').map(s => s.trim()).filter(Boolean);
const countArg = argv.find(a => a.startsWith('--count='));
const count = countArg ? Math.max(5, Math.min(200, Number(countArg.split('=')[1]) || 100)) : 100;
const timeoutArg = argv.find(a => a.startsWith('--timeoutMs='));
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 540000;
const modeArg = argv.find(a => a.startsWith('--mode='));
const mode = modeArg ? String(modeArg.split('=')[1] || 'category') : 'category';

function gradeOf(k) {
  return String(k && k.grade || '후보').toUpperCase().replace(/[^A-Z가-힣]/g, '') || '후보';
}

function summarize(keywords) {
  const gradeCount = {};
  for (const k of keywords) {
    const g = gradeOf(k);
    gradeCount[g] = (gradeCount[g] || 0) + 1;
  }
  const warningCount = keywords.filter(k => Array.isArray(k.hunterWarnings) && k.hunterWarnings.length > 0).length;
  const metricCount = keywords.filter(k => typeof k.searchVolume === 'number' && typeof k.documentCount === 'number').length;
  const top = keywords.slice(0, 10).map(k => ({
    keyword: k.keyword,
    grade: k.grade || '후보',
    searchVolume: k.searchVolume,
    documentCount: k.documentCount,
    goldenRatio: k.goldenRatio,
    warnings: k.hunterWarnings || [],
    candidateTier: k.hunterCandidateTier || null,
  }));
  return { count: keywords.length, gradeCount, warningCount, metricCount, top };
}

function strictGoldenAudit(keywords) {
  const allowedGrades = new Set(['SSS', 'SS', 'S']);
  const lowGradeKeywords = keywords
    .filter(k => !allowedGrades.has(gradeOf(k)))
    .map(k => ({
      keyword: k.keyword,
      grade: k.grade || '후보',
      searchVolume: k.searchVolume,
      documentCount: k.documentCount,
      goldenRatio: k.goldenRatio,
    }));
  return {
    allowedGrades: Array.from(allowedGrades),
    lowGradeCount: lowGradeKeywords.length,
    lowGradeKeywords: lowGradeKeywords.slice(0, 20),
    sssCount: keywords.filter(k => gradeOf(k) === 'SSS').length,
    ssCount: keywords.filter(k => gradeOf(k) === 'SS').length,
    sCount: keywords.filter(k => gradeOf(k) === 'S').length,
  };
}

function isLifeTipsRelevant(keyword) {
  const text = String(keyword || '').toLowerCase();
  const core = [
    '생활꿀팁', '생활팁', '살림', '자취', '집안', '청소', '빨래', '세탁', '얼룩',
    '곰팡이', '물때', '찌든때', '기름때', '냄새', '수납', '정리수납', '분리수거',
    '재활용', '음식물쓰레기', '동파', '결로', '단열', '월동', '습도', '제습',
    '대청소', '배수구', '하수구', '김장', '난방비', '전기장판', '이불', '침구',
    '패딩', '니트', '옷장', '신발장', '수건', '욕실', '화장실', '주방', '냉장고',
    '보관', '환기', '벌레', '모기', '습기'
  ];
  const excludes = [
    '엑셀', 'pdf', 'erp', '정보관리', '정보관리사', '정보관리기술사', '기술사', '관리사', '자격증', '시험', '고혈압', '혈압', '당뇨',
    '병원', '퇴직금', '연말정산', '대출', '청약', '부동산', '주식', '보험', '지원금',
    '대학교', '학원', '영어', '코딩', '개발', '프로그램', '노션', 'notion', '알레르망', '닥스', '이브자리'
  ];
  const productIntent = ['추천', '가격', '비교', '순위', '후기', '대여', '렌탈', '구매', '세트', '브랜드', '로봇청소기', '청소기', '제습기', '공기청정기'];
  const maintenanceAction = ['방법', '하는법', '청소법', '세탁법', '관리', '필터', '분해', '냄새', '곰팡이', '고장', '에러', '물때', '찌든때', '제거'];
  const action = ['방법', '하는법', '꿀팁', '팁', '비법', '노하우', '제거', '세탁', '빨래', '정리', '수납', '보관', '절약', '예방', '방지', '해결', '관리', '손질', '활용', '응급', '대처', '요령', '비결', '전기요금', '난방비', '가스비', '수도세'];
  const problem = ['얼룩', '곰팡이', '물때', '찌든때', '기름때', '냄새', '동파', '결로', '습도', '습기', '난방비', '전기요금', '가스비', '수도세', '분리수거', '음식물쓰레기', '배수구', '하수구', '벌레', '모기', '환기'];
  const hasAction = action.some(t => text.includes(t.toLowerCase()));
  const hardProductNoun = /(세탁기|청소기|로봇청소기|스팀청소기|제습기|공기청정기|수납장)/i.test(text);
  const shoppingIntent = /(추천|가격|비교|순위|후기|대여|렌탈|구매)/i.test(text);
  return core.some(t => text.includes(t.toLowerCase()))
    && !excludes.some(t => text.includes(t.toLowerCase()))
    && !(hardProductNoun && shoppingIntent)
    && !(hardProductNoun && !maintenanceAction.some(t => text.includes(t.toLowerCase())))
    && (!productIntent.some(t => text.includes(t.toLowerCase())) || hasAction)
    && (problem.some(t => text.includes(t.toLowerCase())) || hasAction);
}

function isPolicyRelevant(keyword) {
  const text = String(keyword || '').toLowerCase();
  const support = [
    '지원금', '지원사업', '지원대상', '지원자격', '보조금', '바우처', '장려금',
    '복지', '급여', '수당', '기초연금', '양육수당', '실업급여', '국민취업지원',
    '청년수당', '에너지바우처', '문화누리카드', '주거급여', '교육급여',
    '소상공인', '출산지원', '육아휴직급여', '근로장려금', '자녀장려금',
    '긴급복지', '의료급여', '감면', '면제', '혜택', '신청', '대상', '자격',
    '지급일', '수급', '정책자금', '전기요금 지원', '난방비 지원'
  ];
  const taxOnly = ['양도소득세', '소득세율', '소득세', '소득공제', '연금저축', '퇴직소득세', '부동산양도', '연차수당', '주휴수당', '야간수당', '계산기', '계산법', '세율표', '원천징수', '종합소득세', '부가세'];
  const hasSupport = support.some(t => text.includes(t.toLowerCase()));
  const explicitSupport = /(지원|지원금|보조금|바우처|장려금|복지|급여|수급|신청|대상|자격|혜택|감면|면제|정책자금)/i.test(text);
  return hasSupport && (!taxOnly.some(t => text.includes(t.toLowerCase())) || explicitSupport);
}

async function findKeywordPage(app) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    for (const w of app.windows()) {
      try {
        if ((w.url() || '').includes('keyword-master.html')) return w;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

(async () => {
  const outDir = path.join(__dirname, '..', 'test-results', 'pro-traffic-discovery-live');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`▶ PRO Traffic discovery live verification: mode=${mode} categories=${categories.join(',')} count=${count}`);

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    timeout: 60000,
    env: { ...process.env, NODE_ENV: 'development', LEWORD_E2E_SKIP_SINGLE_INSTANCE: '1' },
  });

  const page = await findKeywordPage(app);
  if (!page) {
    await app.close().catch(() => {});
    throw new Error('keyword-master.html window not found');
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const apiOk = await page.evaluate(() => ({
    hasApi: typeof window.electronAPI !== 'undefined',
    hasInvoke: typeof window.electronAPI?.invoke === 'function',
  }));
  if (!apiOk.hasInvoke) {
    await app.close().catch(() => {});
    throw new Error('window.electronAPI.invoke unavailable');
  }

  const reports = [];
  for (const category of categories) {
    const startedAt = Date.now();
    console.log(`\n[${category}] invoking hunt-pro-traffic-keywords...`);
    const result = await page.evaluate(async ({ category, count, timeoutMs, mode }) => {
      return await Promise.race([
        window.electronAPI.invoke('hunt-pro-traffic-keywords', {
          mode,
          category,
          count,
          targetRookie: true,
          includeSeasonKeywords: true,
          explosionMode: false,
          discoveryFirst: false,
          strictGates: false,
          enhanceWithAdsenseGates: false,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
      ]).catch(err => ({ success: false, error: String(err && err.message || err), keywords: [] }));
    }, { category, count, timeoutMs, mode });

    const elapsedMs = Date.now() - startedAt;
    const keywords = Array.isArray(result && result.keywords) ? result.keywords : [];
    const summary = summarize(keywords);
    const strictAudit = strictGoldenAudit(keywords);
    const relevantCount = category === 'life_tips'
      ? keywords.filter(k => isLifeTipsRelevant(k.keyword)).length
      : (category === 'policy'
        ? keywords.filter(k => isPolicyRelevant(k.keyword)).length
        : keywords.length);
    const pass = result && result.success === true
      && result.discoveryFirst === false
      && result.candidateMode === 'strict-golden'
      && summary.count >= count
      && summary.metricCount >= Math.min(20, summary.count)
      && strictAudit.lowGradeCount === 0
      && Object.keys(summary.gradeCount).length > 0
      && relevantCount >= Math.ceil(summary.count * 0.8);

    const report = {
      category,
      mode,
      requestedCount: count,
      elapsedMs,
      success: !!(result && result.success),
      error: result && result.error || null,
      discoveryFirst: result && result.discoveryFirst,
      candidateMode: result && result.candidateMode,
      summary,
      strictAudit,
      relevantCount,
      rawSummary: result && result.summary || null,
      pass,
    };
    reports.push(report);

    console.log(`  success=${report.success} pass=${pass} count=${summary.count}/${count} metric=${summary.metricCount} relevant=${relevantCount}/${summary.count} lowGrade=${strictAudit.lowGradeCount} warnings=${summary.warningCount} elapsed=${Math.round(elapsedMs / 1000)}s`);
    console.log(`  grades=${JSON.stringify(summary.gradeCount)}`);
    for (const [i, k] of summary.top.entries()) {
      console.log(`  ${String(i + 1).padStart(2)}. [${k.grade}] ${k.keyword} sv=${k.searchVolume ?? '-'} dc=${k.documentCount ?? '-'} gr=${typeof k.goldenRatio === 'number' ? k.goldenRatio.toFixed(2) : '-'}`);
    }
  }

  await app.close().catch(() => {});

  const outFile = path.join(outDir, `report-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), count, reports }, null, 2), 'utf8');
  console.log(`\nWrote ${outFile}`);

  const failed = reports.filter(r => !r.pass);
  if (failed.length > 0) {
    console.log(`❌ FAIL ${failed.length}/${reports.length}`);
    process.exit(2);
  }
  console.log(`✅ PASS ${reports.length}/${reports.length}`);
  process.exit(0);
})().catch((err) => {
  console.error('💥', err && err.stack || err);
  process.exit(3);
});
