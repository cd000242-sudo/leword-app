/**
 * v2.49.25 SSS+SS 결과 수 시뮬레이션
 *
 * 실제 buildRichFeed 의 핵심 path 단순화:
 *   1. 시드: 5월 시즌 30개 (seasonal-calendar) — buildRichFeed 와 동일
 *   2. v2.49.25 suggestions 풀 wire: 시드 15개 × 80 suggestion = 자연 키워드 풀 ~1200개
 *   3. sv 측정 (suggestions 응답에 이미 포함)
 *   4. dc 측정 (네이버 블로그 API, sv ≥ 200 만)
 *   5. calculateGrade 시뮬레이션 (rich-feed-builder 게이트와 동일)
 *   6. SSS+SS 카테고리별 분포 보고
 *
 * 실제 buildRichFeed 와 차이:
 *   - 30 소스 (wikipedia-ko, theqoo, dcinside 등) base seed 누락 → 본 시뮬레이션은 시즌만
 *   - 즉 실제 발굴 결과는 본 시뮬레이션 + 30 소스 효과
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const OUT = path.join(__dirname, '..', 'tmp-yield.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

const NAVER_CONFIG = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };
const SEARCHAD_CONFIG = {
  accessLicense: config.naverSearchAdAccessLicense,
  secretKey: config.naverSearchAdSecretKey,
  customerId: config.naverSearchAdCustomerId,
};

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== v2.49.25 SSS+SS 결과 수 시뮬레이션 ===\n');

  // 1. 시드 — 5월 시즌 30개 (실제 seasonal-calendar 와 동일)
  const SEEDS = [
    '종합소득세 환급', '종소세 환급', '종소세 신고',
    '환급금 조회 홈택스', '환급금 조회 토스', '환급금 조회 삼쩜삼',
    '병원비 환급금 조회', '연말정산 환급금 조회',
    '어린이날 선물', '어린이날 행사', '어린이날 데이트',
    '어버이날 선물', '어버이날 카네이션', '어버이날 편지',
    '가정의 달 행사', '가정의 달 선물',
    '스승의날 선물', '스승의날 카드',
    '5월 가볼만한 곳', '5월 한정 이벤트',
    '근로장려금 신청', '자녀장려금 신청',
    '석가탄신일', '부처님오신날',
    '5월 결혼식 하객룩', '5월 야외 결혼식',
    '봄 여행 추천', '국내 여행지',
    '4대보험 환급', '건강보험 환급금 조회',
  ];

  // 2. v2.49.25: suggestions 호출 (시드 15개 cap × 80)
  log(`Step 1: suggestions 풀 확장 (시드 15 × 80)...`);
  const { getNaverSearchAdKeywordSuggestions } = await import('../src/utils/naver-searchad-api');

  const SEED_CAP = 15;
  const candidates: Array<{ kw: string; sv: number; cpc: number | null }> = [];
  const seen = new Set<string>();
  const seedsUsed = SEEDS.slice(0, SEED_CAP);
  let totalSuggested = 0;

  for (const seed of seedsUsed) {
    try {
      const suggestions = await getNaverSearchAdKeywordSuggestions(SEARCHAD_CONFIG, seed, 80);
      totalSuggested += suggestions.length;
      for (const sg of suggestions) {
        if (!sg.keyword || seen.has(sg.keyword)) continue;
        if (sg.totalSearchVolume < 100) continue;
        if (!/[가-힣]/.test(sg.keyword)) continue;
        seen.add(sg.keyword);
        candidates.push({ kw: sg.keyword, sv: sg.totalSearchVolume, cpc: sg.monthlyAveCpc ?? null });
      }
    } catch (e: any) {
      log(`  ⚠️ "${seed}" 실패: ${e?.message}`);
    }
    await new Promise(r => setTimeout(r, 600));
  }
  log(`  → suggestions ${totalSuggested}개 raw, sv≥100 + 한국어 유효 ${candidates.length}개`);

  // 3. dc 측정 — sv 200~30000 만 (rich-feed-builder calculateGrade 게이트)
  const dcTargets = candidates.filter(c => c.sv >= 200 && c.sv <= 30000);
  log(`Step 2: dc 측정 (sv 200~30K, ${dcTargets.length}개)...`);

  const { getNaverKeywordSearchVolumeSeparate } = await import('../src/utils/naver-datalab-api');
  const t0 = Date.now();
  const sigs = await getNaverKeywordSearchVolumeSeparate(
    NAVER_CONFIG,
    dcTargets.map(c => c.kw),
    { includeDocumentCount: true }
  );
  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`  → dc 측정 완료 (${elapsed}s)`);

  // 4. calculateGrade 시뮬레이션 (rich-feed-builder line 681-686 과 동일)
  type Row = { kw: string; sv: number; dc: number; ratio: number; grade: string };
  const rows: Row[] = [];

  for (const sig of sigs) {
    const sv = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
    const dc = typeof sig.documentCount === 'number' && sig.documentCount > 0 ? sig.documentCount : 0;
    if (sv < 200 || sv > 30000 || dc === 0 || dc > 12000) continue;
    const ratio = sv / dc;
    // v2.49.24 commercial gate
    const tokens = sig.keyword.trim().split(/\s+/).filter(Boolean).length;
    const commercialPattern = /추천|후기|리뷰|가격|순위|비교|할인|구매|차이|브랜드|선물|코디/;
    const commercial = commercialPattern.test(sig.keyword);

    let grade = '';
    if (ratio >= 1.7) grade = 'SSS';
    else if (commercial && ratio >= (tokens >= 2 ? 1.2 : 1.3)) grade = 'SSS';
    else if (ratio >= 4 && dc <= 8000) grade = 'SSS';
    else if (commercial && dc <= 5000 && ratio >= 1) grade = 'SSS';
    // SS
    else if (ratio >= 5 && dc <= 15000 && sv >= 500) grade = 'SS';
    else if (commercial && dc <= 8000 && sv >= 300 && ratio >= 2) grade = 'SS';
    else if (ratio >= 3 && dc <= 5000 && sv >= 200) grade = 'SS';
    else if (ratio < 1) grade = 'redOcean';
    else grade = 'sub-SS';

    if (grade === 'SSS' || grade === 'SS') {
      rows.push({ kw: sig.keyword, sv, dc, ratio, grade });
    }
  }

  // 5. 분포 보고
  const sssRows = rows.filter(r => r.grade === 'SSS').sort((a, b) => b.sv - a.sv);
  const ssRows = rows.filter(r => r.grade === 'SS').sort((a, b) => b.sv - a.sv);

  log('');
  log(`=== 결과 분포 ===`);
  log(`SSS: ${sssRows.length}건`);
  log(`SS: ${ssRows.length}건`);
  log(`합계: ${rows.length}건`);
  log('');

  log(`=== SSS 후보 상위 15 ===`);
  for (const r of sssRows.slice(0, 15)) {
    log(`  ${r.kw.padEnd(30)} sv=${String(r.sv).padStart(6)}  dc=${String(r.dc).padStart(6)}  ratio=${r.ratio.toFixed(2)}`);
  }
  log('');

  log(`=== SS 후보 상위 10 ===`);
  for (const r of ssRows.slice(0, 10)) {
    log(`  ${r.kw.padEnd(30)} sv=${String(r.sv).padStart(6)}  dc=${String(r.dc).padStart(6)}  ratio=${r.ratio.toFixed(2)}`);
  }
  log('');

  log(`=== 요약 ===`);
  log(`시즌 시드 ${SEEDS.length} → suggestions ${totalSuggested} → 유효 ${candidates.length} → dc 측정 ${dcTargets.length} → SSS+SS ${rows.length}`);
  log(`(실제 buildRichFeed 는 30 소스 base seed 추가 → 결과 더 많음)`);
}

main().catch(e => { console.error('FATAL:', e?.message || e, e?.stack); process.exit(1); });
