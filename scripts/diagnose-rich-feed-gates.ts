/**
 * Rich Feed 게이트 funnel 진단 스크립트
 *
 * 실제 Naver API 호출 없이, 한국 블로그 키워드의 통계적 분포를 시뮬레이션해
 * rich-feed-builder.ts의 게이트가 어디에서 키워드를 떨어뜨리는지 측정.
 *
 * 실행: npx ts-node scripts/diagnose-rich-feed-gates.ts [N]
 *   N: 시뮬레이션 키워드 수 (기본 1000)
 */

interface SyntheticKeyword {
  keyword: string;
  sv: number;
  dc: number;
  ratio: number;
  score: number;
  commercial: boolean;
  writable: boolean; // 정책상 작성 가능 키워드인지 (대부분 true 가정)
  dcEstimated: boolean;
  newsNoise: boolean;
  celebLike: boolean;
  generic2Token: boolean;
}

// ────────────────────────────────────────────────────────────────────
// 한국 블로그 키워드 통계적 분포 (도메인 지식 기반 추정)
// ────────────────────────────────────────────────────────────────────

function logNormal(median: number, sigma: number): number {
  // log-normal 분포로 키워드 통계의 long-tail 모델링
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}

function generateSyntheticKeyword(idx: number, scenario: 'optimistic' | 'realistic' | 'pessimistic' = 'realistic'): SyntheticKeyword {
  // 시나리오별 분포:
  //   optimistic: sv median 500, dc median 5k (작은 시장)
  //   realistic: sv median 300, dc median 20k (전형적 한국 블로그 saturation)
  //   pessimistic: sv median 200, dc median 50k (red ocean 시장)
  const params = {
    optimistic: { svMed: 500, svSig: 1.8, dcMed: 5000, dcSig: 1.5 },
    realistic:  { svMed: 300, svSig: 1.7, dcMed: 20000, dcSig: 1.4 },
    pessimistic: { svMed: 200, svSig: 1.6, dcMed: 50000, dcSig: 1.3 },
  }[scenario];

  const sv = Math.round(Math.max(0, logNormal(params.svMed, params.svSig)));
  const baseDc = logNormal(params.dcMed, params.dcSig);
  const correlation = sv > 1000 ? 1.5 : sv > 100 ? 1.0 : 0.7;
  const dc = Math.round(Math.max(0, baseDc * correlation));

  const ratio = dc > 0 ? sv / dc * 100 : 0; // 백분율로 (rich-feed-builder 동일)

  // score: ratio·sv·dc 기반 합성 (rich-feed-builder 점수식 단순화)
  const logRatio = Math.log1p(Math.min(ratio, 1000));
  const sd = Math.min(100,
    logRatio >= 5.0 ? 100 :
    logRatio >= 3.0 ? 80 + (logRatio - 3.0) * 10 :
    logRatio >= 1.5 ? 60 + (logRatio - 1.5) * 13 :
    logRatio >= 0.5 ? 40 + (logRatio - 0.5) * 20 :
    logRatio * 80);
  const score = Math.min(100, sd * 0.55 + Math.min(40, sv / 100) + Math.min(20, dc <= 5000 ? 15 : 0));

  // 통계적 비율
  const commercial = Math.random() < 0.30;        // 약 30%가 commercial intent
  const writable = Math.random() < 0.92;          // 약 92%가 writable (단일 토큰 비-celeb 등 제외)
  const dcEstimated = Math.random() < 0.45;       // 한국 환경 dc=null 비율 40~60%
  const newsNoise = Math.random() < 0.05;         // 약 5% (분기/폐지/사망 등 단일 토큰)
  const celebLike = Math.random() < 0.08;         // 약 8% (인명 단일 토큰)
  const generic2Token = Math.random() < 0.10;     // 약 10% (범용 2-token)

  return {
    keyword: `kw-${idx}`,
    sv, dc, ratio, score,
    commercial, writable, dcEstimated, newsNoise, celebLike, generic2Token,
  };
}

// ────────────────────────────────────────────────────────────────────
// rich-feed-builder.ts calculateGrade 로직 복제 (수치 게이트만)
// ────────────────────────────────────────────────────────────────────

type Grade = 'SSR' | 'SSS' | 'SS' | 'S' | 'A' | 'B' | '';

interface GradeResult {
  grade: Grade;
  reason: string; // 어디서 grade 결정됐는지
}

type Relaxation = 'strict' | 'medium' | 'loose' | 'very-loose';

function calculateGrade(k: SyntheticKeyword, relaxation: Relaxation = 'strict'): GradeResult {
  const { sv, dc, ratio, score, commercial, writable, dcEstimated, newsNoise, celebLike, generic2Token } = k;

  // 게이트 파라미터 (relaxation level별)
  const G = {
    strict:     { svMin: 1000, svMax: 10000, dcMax: 5000, rGen: 5,   rComm: 3,   rNiche: 2,   redOcean: 1.0 },
    medium:     { svMin: 500,  svMax: 20000, dcMax: 8000, rGen: 3,   rComm: 2,   rNiche: 1.5, redOcean: 1.0 },
    loose:      { svMin: 300,  svMax: 30000, dcMax: 10000, rGen: 2,  rComm: 1.5, rNiche: 1.0, redOcean: 0.8 },
    'very-loose': { svMin: 200, svMax: 50000, dcMax: 15000, rGen: 1.5, rComm: 1.0, rNiche: 0.8, redOcean: 0.5 },
  }[relaxation];

  // Pre-filters
  if (!writable && dc > 100_000) return { grade: '', reason: 'pre:bigword' };
  if (!writable && generic2Token) return { grade: '', reason: 'pre:generic2t' };
  if (newsNoise) return { grade: '', reason: 'pre:newsnoise' };
  if (celebLike && dc > 1000) return { grade: '', reason: 'pre:celeb' };

  // v2.40.6: red ocean 차단 (relaxation별)
  if (dc > 0 && ratio < G.redOcean) return { grade: '', reason: 'pre:redocean' };

  const allowSS = writable;

  // dcEstimated path
  if (dcEstimated) {
    if (commercial && sv >= 1500 && score >= 70 && writable) return { grade: 'SS', reason: 'dcEst:SS-comm' };
    if (sv >= 3000 && score >= 75 && writable) return { grade: 'SS', reason: 'dcEst:SS-bigvol' };
    if (score >= 45 && sv >= 200 && writable) return { grade: 'A', reason: 'dcEst:A' };
    if (score >= 38 && sv >= 100 && writable) return { grade: 'B', reason: 'dcEst:B' };
    return { grade: '', reason: 'dcEst:fail' };
  }

  // SSS direct paths (relaxation별)
  if (writable && !celebLike && dc > 0 && sv >= G.svMin && sv <= G.svMax && dc <= G.dcMax) {
    if (ratio >= G.rGen) return { grade: 'SSS', reason: 'SSS:r-gen' };
    if (commercial && ratio >= G.rComm) return { grade: 'SSS', reason: 'SSS:comm' };
    if (ratio >= G.rGen * 2 && dc <= G.dcMax * 0.6) return { grade: 'SSS', reason: 'SSS:r-high+dc-low' };
    if (commercial && dc <= G.dcMax * 0.3 && ratio >= G.rNiche) return { grade: 'SSS', reason: 'SSS:comm-niche' };
  }

  // SSS via score
  const sssScore = commercial ? 65 : 72;
  const sssRatio = commercial ? G.rComm : G.rGen;
  if (score >= sssScore && sv >= G.svMin && sv <= G.svMax && dc > 0 && dc <= G.dcMax && ratio >= sssRatio && allowSS) {
    return { grade: 'SSS', reason: 'SSS:score' };
  }

  // SS auto promotion
  if (writable && !celebLike && dc > 0) {
    if (ratio >= 5 && dc <= 15000 && sv >= 500) return { grade: 'SS', reason: 'SS:auto-r5' };
    if (commercial && dc <= 8000 && sv >= 300 && ratio >= 2) return { grade: 'SS', reason: 'SS:auto-comm' };
    if (ratio >= 3 && dc <= 5000 && sv >= 200) return { grade: 'SS', reason: 'SS:auto-r3' };
  }

  // SS via score
  const ssScore = commercial ? 58 : 62;
  const ssSv = commercial ? 150 : 250;
  const ssDc = commercial ? 35000 : 25000;
  const ssRatio = commercial ? 1.2 : 1.8;
  if (score >= ssScore && sv >= ssSv && dc > 0 && dc <= ssDc && ratio >= ssRatio && allowSS) {
    return { grade: 'SS', reason: 'SS:score' };
  }

  if (score >= 48 && sv >= 150 && ratio >= 0.5 && writable) return { grade: 'S', reason: 'S:auto' };
  if (score >= 38 && sv >= 100 && writable) return { grade: 'A', reason: 'A:auto' };
  if (score >= 35 && sv >= 50 && writable) return { grade: 'B', reason: 'B:auto' };
  return { grade: '', reason: 'final:fail' };
}

// ────────────────────────────────────────────────────────────────────
// v2.42.11 promotion gates (현재 ship된 버전)
// ────────────────────────────────────────────────────────────────────

function v2_42_11_promotionEligible(k: SyntheticKeyword, grade: Grade): boolean {
  if (grade !== 'SS' && grade !== 'S' && grade !== 'A') return false;
  return k.dc > 0 && k.dc <= 10000 && k.sv >= 500 && k.sv <= 30000 && k.ratio >= 2.0;
}

function v2_41_2_promotionEligible(k: SyntheticKeyword, grade: Grade): boolean {
  if (grade !== 'SS' && grade !== 'S' && grade !== 'A') return false;
  return k.dc > 0 && k.dc <= 5000 && k.sv >= 1000 && k.sv <= 10000 && k.ratio >= 3.0;
}

// ────────────────────────────────────────────────────────────────────
// 시뮬레이션 실행
// ────────────────────────────────────────────────────────────────────

function runSimulation(N: number) {
  const scenario = (process.argv[3] || 'realistic') as 'optimistic' | 'realistic' | 'pessimistic';
  console.log(`🎯 시나리오: ${scenario}\n`);
  const keywords = Array.from({ length: N }, (_, i) => generateSyntheticKeyword(i, scenario));

  // ── relaxation 비교 (이번 라운드의 핵심) ──
  console.log(`\n🆚 자연 SSS 비율 비교 (relaxation level별):`);
  console.log(`${'level'.padEnd(15)} | SSS  | 자연%  | 게이트 (sv / dc / ratio)`);
  console.log(`${'-'.repeat(80)}`);
  for (const lv of ['strict', 'medium', 'loose', 'very-loose'] as const) {
    let sssCount = 0;
    for (const k of keywords) {
      const r = calculateGrade(k, lv);
      if (r.grade === 'SSS' || r.grade === 'SSR') sssCount++;
    }
    const pct = ((sssCount / N) * 100).toFixed(1);
    const gateDesc = lv === 'strict' ? 'sv 1k-10k / dc<=5k / r>=5(3comm)' :
                     lv === 'medium' ? 'sv 500-20k / dc<=8k / r>=3(2comm)' :
                     lv === 'loose'  ? 'sv 300-30k / dc<=10k / r>=2(1.5comm)' :
                                       'sv 200-50k / dc<=15k / r>=1.5(1comm)';
    console.log(`${lv.padEnd(15)} | ${String(sssCount).padStart(4)} | ${pct.padStart(5)}% | ${gateDesc}`);
  }
  console.log('');

  // 분포 통계
  const dist = {
    sv: { lt100: 0, lt1k: 0, lt10k: 0, lt30k: 0, gte30k: 0 },
    dc: { lt1k: 0, lt5k: 0, lt10k: 0, lt100k: 0, gte100k: 0 },
    ratio: { lt1: 0, lt3: 0, lt5: 0, lt10: 0, gte10: 0 },
  };
  for (const k of keywords) {
    if (k.sv < 100) dist.sv.lt100++;
    else if (k.sv < 1000) dist.sv.lt1k++;
    else if (k.sv < 10000) dist.sv.lt10k++;
    else if (k.sv < 30000) dist.sv.lt30k++;
    else dist.sv.gte30k++;
    if (k.dc < 1000) dist.dc.lt1k++;
    else if (k.dc < 5000) dist.dc.lt5k++;
    else if (k.dc < 10000) dist.dc.lt10k++;
    else if (k.dc < 100000) dist.dc.lt100k++;
    else dist.dc.gte100k++;
    if (k.ratio < 1) dist.ratio.lt1++;
    else if (k.ratio < 3) dist.ratio.lt3++;
    else if (k.ratio < 5) dist.ratio.lt5++;
    else if (k.ratio < 10) dist.ratio.lt10++;
    else dist.ratio.gte10++;
  }

  console.log(`\n📊 시뮬레이션 분포 (N=${N}):`);
  console.log(`  sv: <100=${dist.sv.lt100} | 100-1k=${dist.sv.lt1k} | 1k-10k=${dist.sv.lt10k} | 10k-30k=${dist.sv.lt30k} | 30k+=${dist.sv.gte30k}`);
  console.log(`  dc: <1k=${dist.dc.lt1k} | 1k-5k=${dist.dc.lt5k} | 5k-10k=${dist.dc.lt10k} | 10k-100k=${dist.dc.lt100k} | 100k+=${dist.dc.gte100k}`);
  console.log(`  ratio: <1=${dist.ratio.lt1} | 1-3=${dist.ratio.lt3} | 3-5=${dist.ratio.lt5} | 5-10=${dist.ratio.lt10} | 10+=${dist.ratio.gte10}`);

  // 등급 판정 (현재 strict 기준 — 베이스라인)
  const gradeCount: Record<string, number> = {};
  const reasonCount: Record<string, number> = {};
  for (const k of keywords) {
    const r = calculateGrade(k, 'strict');
    gradeCount[r.grade || '(filtered)'] = (gradeCount[r.grade || '(filtered)'] || 0) + 1;
    reasonCount[r.reason] = (reasonCount[r.reason] || 0) + 1;
    (k as any)._grade = r.grade;
    (k as any)._reason = r.reason;
  }

  console.log(`\n🏆 calculateGrade 결과:`);
  for (const [grade, count] of Object.entries(gradeCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${grade.padEnd(12)}: ${count} (${((count / N) * 100).toFixed(1)}%)`);
  }

  console.log(`\n📋 grade 결정 reason TOP 10:`);
  for (const [reason, count] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${reason.padEnd(20)}: ${count} (${((count / N) * 100).toFixed(1)}%)`);
  }

  // SSS-only 필터
  const sssOnly = keywords.filter((k: any) => k._grade === 'SSS' || k._grade === 'SSR');
  console.log(`\n👑 SSS-only 필터 후: ${sssOnly.length}건 (${((sssOnly.length / N) * 100).toFixed(1)}%)`);

  // promotion 풀
  const v211Pool = keywords.filter((k: any) => v2_42_11_promotionEligible(k, k._grade));
  const v412Pool = keywords.filter((k: any) => v2_41_2_promotionEligible(k, k._grade));
  console.log(`\n🚀 동적 SSS 승격 풀:`);
  console.log(`  v2.41.2 (이전 엄격): ${v412Pool.length}건`);
  console.log(`  v2.42.11 (완화):     ${v211Pool.length}건`);

  // 풀 안에서 게이트별 컷 분석
  const ssOrAbove = keywords.filter((k: any) => ['SS', 'S', 'A'].includes(k._grade));
  console.log(`\n🔬 promotion 풀 funnel (대상=SS/S/A ${ssOrAbove.length}건):`);
  let f = ssOrAbove.length;
  console.log(`  - SS/S/A 등급            : ${f}`);
  f = ssOrAbove.filter(k => k.dc > 0).length;
  console.log(`  - dc>0                   : ${f}`);
  let f2 = ssOrAbove.filter(k => k.dc > 0 && k.dc <= 10000).length;
  console.log(`  - + dc<=10k (v2.42.11)   : ${f2}  (v2.41.2 dc<=5k: ${ssOrAbove.filter(k => k.dc > 0 && k.dc <= 5000).length})`);
  f2 = ssOrAbove.filter(k => k.dc > 0 && k.dc <= 10000 && k.sv >= 500).length;
  console.log(`  - + sv>=500              : ${f2}  (v2.41.2 sv>=1k: ${ssOrAbove.filter(k => k.dc > 0 && k.dc <= 5000 && k.sv >= 1000).length})`);
  f2 = ssOrAbove.filter(k => k.dc > 0 && k.dc <= 10000 && k.sv >= 500 && k.sv <= 30000).length;
  console.log(`  - + sv<=30k              : ${f2}  (v2.41.2 sv<=10k: ${ssOrAbove.filter(k => k.dc > 0 && k.dc <= 5000 && k.sv >= 1000 && k.sv <= 10000).length})`);
  f2 = ssOrAbove.filter(k => k.dc > 0 && k.dc <= 10000 && k.sv >= 500 && k.sv <= 30000 && k.ratio >= 2).length;
  console.log(`  - + ratio>=2 (v2.42.11)  : ${f2}  (v2.41.2 ratio>=3: ${ssOrAbove.filter(k => k.dc > 0 && k.dc <= 5000 && k.sv >= 1000 && k.sv <= 10000 && k.ratio >= 3).length})`);

  // 최종 SSS 수
  const TARGET = Math.max(50, Math.floor(150 * 0.4)); // limit 150 가정
  const naturalSSS = sssOnly.length;
  const need = Math.max(0, TARGET - naturalSSS);
  const v211Promoted = Math.min(need, v211Pool.length);
  const v412Promoted = Math.min(need, v412Pool.length);
  const v211Final = naturalSSS + v211Promoted;
  const v412Final = naturalSSS + v412Promoted;

  console.log(`\n🎯 최종 SSS 수 (target=${TARGET}):`);
  console.log(`  자연 SSS                 : ${naturalSSS}`);
  console.log(`  v2.41.2 (이전): 자연+승격 = ${naturalSSS}+${v412Promoted} = ${v412Final}`);
  console.log(`  v2.42.11 (완화): 자연+승격 = ${naturalSSS}+${v211Promoted} = ${v211Final}`);

  // 최종 진단
  console.log(`\n💡 진단:`);
  if (naturalSSS === 0 && v211Pool.length === 0 && v412Pool.length === 0) {
    console.log(`  ❌ 자연 SSS=0 AND 승격 풀=0 → 0건 발굴 (사용자 신고 패턴!)`);
    console.log(`  → 더 근본적 게이트 완화 필요 (예: 자연 SSS 직승 sv>=500 허용 / dc<=8000 / commercial ratio>=1.5)`);
  } else if (v211Final < TARGET) {
    console.log(`  ⚠️  v2.42.11 적용해도 target(${TARGET}) 미달 (${v211Final}건)`);
    console.log(`  → 추가 완화 검토 필요`);
  } else {
    console.log(`  ✅ v2.42.11 풀 확장으로 target 달성 가능`);
  }
}

const N = parseInt(process.argv[2] || '1000', 10);
console.log(`🧪 Rich Feed 게이트 funnel 진단 — ${N}개 시뮬레이션\n`);
runSimulation(N);
