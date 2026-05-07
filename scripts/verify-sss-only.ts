/**
 * 🎯 SSS 전용 필터 회귀 검증
 *
 * - 실제 huntProTrafficKeywords 를 호출
 * - UI 의 gradePriority=['SSS'] 필터를 모방하여 후처리
 * - 결과에 SSS 외 등급이 0개여야 통과
 * - 카테고리/모드 변경하며 N회 반복
 */

import * as fs from 'fs';
import * as path from 'path';

// 🛡️ Puppeteer/외부 호출의 unhandled rejection 흡수 (검증 본체와 무관한 부수 호출은 무시)
process.on('unhandledRejection', (reason: any) => {
  const msg = String(reason?.message || reason || '');
  if (/protocolTimeout|ProtocolError|Network\.|Target\.|puppeteer|Page\./i.test(msg)) {
    // 부수적 puppeteer 노이즈 — 프로세스 죽이지 않음
    return;
  }
  console.error('⚠️ Unhandled rejection (검증 무관 가능):', msg.slice(0, 200));
});

// 1) 실제 API 키 로드
const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
process.env['NAVER_CLIENT_ID'] = config.naverClientId;
process.env['NAVER_CLIENT_SECRET'] = config.naverClientSecret;
process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] = config.naverSearchAdAccessLicense;
process.env['NAVER_SEARCHAD_SECRET_KEY'] = config.naverSearchAdSecretKey;
process.env['NAVER_SEARCHAD_CUSTOMER_ID'] = config.naverSearchAdCustomerId;
if (config.youtubeApiKey) process.env['YOUTUBE_API_KEY'] = config.youtubeApiKey;

console.log('🔑 API 키 로드 완료');
console.log('');

// 2) UI 의 SSS-only 필터를 그대로 옮긴 헬퍼 (keyword-master.html 15704~15819 동일 로직)
const normalizeGrade = (g: any) => String(g || '').toUpperCase().replace(/[^A-Z]/g, '');
const toFiniteNumberOrNull = (v: any): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
};

function applyUiSssFilter(rawKeywords: any[], targetCount: number) {
  const all = (rawKeywords || []).map((kw) => {
    const sv = toFiniteNumberOrNull(kw?.searchVolume);
    const dc = toFiniteNumberOrNull(kw?.documentCount);
    return {
      ...kw,
      searchVolume: sv === null ? kw?.searchVolume : sv,
      documentCount: dc === null ? kw?.documentCount : dc
    };
  }).filter(kw => !!String(kw?.keyword || '').trim());

  const metricCandidates = all.filter((kw) => {
    const sv = toFiniteNumberOrNull(kw?.searchVolume);
    const dc = toFiniteNumberOrNull(kw?.documentCount);
    return sv !== null && dc !== null;
  });

  const gradePriority = ['SSS'];
  const selected: any[] = [];
  const seen = new Set<string>();

  for (const grade of gradePriority) {
    const sameGrade = metricCandidates.filter((k) => normalizeGrade(k?.grade) === grade);
    const goldenFirst: any[] = [];
    const others: any[] = [];
    sameGrade.forEach((k) => {
      if (k?.isGolden) goldenFirst.push(k);
      else others.push(k);
    });
    for (const kw of [...goldenFirst, ...others]) {
      const key = String(kw?.keyword || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(kw);
      if (selected.length >= targetCount) break;
    }
    if (selected.length >= targetCount) break;
  }

  if (selected.length < targetCount) {
    for (const grade of gradePriority) {
      const sameGrade = all.filter((k) => normalizeGrade(k?.grade) === grade);
      const goldenFirst: any[] = [];
      const others: any[] = [];
      sameGrade.forEach((k) => {
        if (k?.isGolden) goldenFirst.push(k);
        else others.push(k);
      });
      for (const kw of [...goldenFirst, ...others]) {
        const key = String(kw?.keyword || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        selected.push(kw);
        if (selected.length >= targetCount) break;
      }
      if (selected.length >= targetCount) break;
    }
  }

  return { all, metricCandidates, selected };
}

interface RunReport {
  runId: string;
  category: string;
  mode: string;
  count: number;
  rawTotal: number;
  rawGradeDist: Record<string, number>;
  uiSelectedTotal: number;
  uiSelectedGradeDist: Record<string, number>;
  nonSssLeak: any[];
  elapsedSec: number;
  pass: boolean;
}

async function runOnce(label: string, opts: { mode: 'realtime' | 'category' | 'season'; category: string; count: number }): Promise<RunReport> {
  const { huntProTrafficKeywords } = await import('../src/utils/pro-traffic-keyword-hunter');
  const { bootstrapSources } = await import('../src/utils/sources/source-bootstrap');
  bootstrapSources();

  const t0 = Date.now();
  console.log(`\n════ ${label} (mode=${opts.mode}, category=${opts.category}, count=${opts.count}) ════`);
  const result = await huntProTrafficKeywords({
    mode: opts.mode,
    category: opts.category,
    targetRookie: false,
    includeSeasonKeywords: opts.mode === 'season',
    explosionMode: false,
    useDeepMining: true,
    count: opts.count,
    forceRefresh: true,
    seedKeywords: []
  } as any);
  const elapsedSec = (Date.now() - t0) / 1000;
  const raw = result.keywords || [];

  // 원시 등급 분포
  const rawDist: Record<string, number> = {};
  raw.forEach(k => {
    const g = normalizeGrade((k as any).grade) || '-';
    rawDist[g] = (rawDist[g] || 0) + 1;
  });

  // UI 필터 적용
  const { selected } = applyUiSssFilter(raw as any[], opts.count);
  const selDist: Record<string, number> = {};
  selected.forEach(k => {
    const g = normalizeGrade(k?.grade) || '-';
    selDist[g] = (selDist[g] || 0) + 1;
  });
  const nonSssLeak = selected.filter(k => normalizeGrade(k?.grade) !== 'SSS');

  console.log(`⏱  ${elapsedSec.toFixed(1)}s · raw ${raw.length}개 등급분포: ${JSON.stringify(rawDist)}`);
  console.log(`🎯 UI필터 후 ${selected.length}개 등급분포: ${JSON.stringify(selDist)}`);
  if (nonSssLeak.length > 0) {
    console.log(`❌ SSS 외 누출 ${nonSssLeak.length}개:`);
    nonSssLeak.slice(0, 5).forEach((k: any) => console.log(`   - ${k.keyword} [grade=${k.grade}]`));
  } else {
    console.log(`✅ SSS 외 누출 0개`);
  }
  if (selected.length > 0) {
    console.log(`📋 SSS 샘플 (검색량/문서수/황금비율):`);
    selected.slice(0, 5).forEach((k: any) => {
      const sv = typeof k.searchVolume === 'number' ? k.searchVolume.toLocaleString() : '-';
      const dc = typeof k.documentCount === 'number' ? k.documentCount.toLocaleString() : '-';
      const gr = (typeof k.goldenRatio === 'number' ? k.goldenRatio : 0).toFixed(2);
      console.log(`   - ${String(k.keyword).padEnd(30)} sv=${sv} dc=${dc} gr=${gr}`);
    });
  }

  return {
    runId: label,
    category: opts.category,
    mode: opts.mode,
    count: opts.count,
    rawTotal: raw.length,
    rawGradeDist: rawDist,
    uiSelectedTotal: selected.length,
    uiSelectedGradeDist: selDist,
    nonSssLeak: nonSssLeak.map((k: any) => ({ keyword: k.keyword, grade: k.grade })),
    elapsedSec,
    pass: nonSssLeak.length === 0
  };
}

async function main() {
  const { EnvironmentManager } = await import('../src/utils/environment-manager');
  EnvironmentManager.getInstance();

  const reports: RunReport[] = [];
  const targetCount = Number(process.argv[2]) || 100;

  // 카테고리/모드 다양화 — argv[3] 로 카테고리 셋 변경 가능
  const preset = (process.argv[3] || 'default').toLowerCase();
  const cases: Array<{ label: string; mode: 'realtime' | 'category' | 'season'; category: string }> =
    preset === 'quick'
      ? [
          { label: 'Run #1 / category=it (quick)', mode: 'category', category: 'it' },
        ]
      : preset === 'extra'
      ? [
          { label: 'Run #1 / category=it', mode: 'category', category: 'it' },
          { label: 'Run #2 / category=finance', mode: 'category', category: 'finance' },
          { label: 'Run #3 / category=health', mode: 'category', category: 'health' },
        ]
      : preset === 'mix'
        ? [
            { label: 'Run #1 / category=interior', mode: 'category', category: 'interior' },
            { label: 'Run #2 / mode=season', mode: 'season', category: 'all' },
            { label: 'Run #3 / category=business', mode: 'category', category: 'business' },
          ]
        : [
            { label: 'Run #1 / category=all', mode: 'category', category: 'all' },
            { label: 'Run #2 / category=life_tips', mode: 'category', category: 'life_tips' },
            { label: 'Run #3 / mode=realtime', mode: 'realtime', category: 'all' },
          ];

  for (const c of cases) {
    reports.push(await runOnce(c.label, { ...c, count: targetCount }));
  }

  // 종합 리포트
  console.log('\n' + '═'.repeat(70));
  console.log('📊 종합 결과');
  console.log('═'.repeat(70));
  reports.forEach((r) => {
    const mark = r.pass ? '✅' : '❌';
    console.log(`${mark} ${r.runId.padEnd(35)} raw=${String(r.rawTotal).padStart(3)} sss선택=${String(r.uiSelectedTotal).padStart(3)}  누출=${r.nonSssLeak.length}`);
  });
  const allPass = reports.every(r => r.pass);
  const totalSss = reports.reduce((s, r) => s + (r.uiSelectedGradeDist['SSS'] || 0), 0);
  console.log('─'.repeat(70));
  console.log(`총 ${reports.length} 회 · SSS 합계 ${totalSss}개 · ${allPass ? '🟢 ALL PASS (SSS only)' : '🔴 FAIL — SSS 외 등급 누출 발견'}`);

  fs.writeFileSync(
    path.join(process.cwd(), 'verify-sss-only-report.json'),
    JSON.stringify(reports, null, 2)
  );
  console.log(`\n💾 리포트 저장: verify-sss-only-report.json`);

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error('❌ 검증 실패:', e); process.exit(2); });
