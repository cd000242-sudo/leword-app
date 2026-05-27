/**
 * 5월 시즌 황금키워드 end-to-end 실측 검증
 *
 * 1. seasonal-calendar.ts 의 5월 base seed 31 개 로드
 * 2. expandWithIntentSuffixes 로 longtail 확장
 * 3. getNaverKeywordSearchVolumeSeparate 로 sv + dc 측정
 * 4. SSS 자격 계산 (간략 sanity-gate)
 * 5. SSS 후보에 AI 브리핑 detection 실측
 * 6. 결과 정리
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
process.env['NAVER_CLIENT_ID'] = config.naverClientId;
process.env['NAVER_CLIENT_SECRET'] = config.naverClientSecret;
process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] = config.naverSearchAdAccessLicense;
process.env['NAVER_SEARCHAD_SECRET_KEY'] = config.naverSearchAdSecretKey;
process.env['NAVER_SEARCHAD_CUSTOMER_ID'] = config.naverSearchAdCustomerId;

const NAVER_CONFIG = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };

const OUT = path.join(__dirname, '..', 'tmp-may-season.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== 5월 시즌 황금키워드 end-to-end 실측 ===\n');

  // 1. 시즌 base seed (5월)
  const MAY_SEEDS = [
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
  log(`5월 base seed: ${MAY_SEEDS.length}개`);

  // 2. longtail 확장
  const { expandWithIntentSuffixes } = await import('../src/utils/sources/seasonal-calendar');
  const expanded = expandWithIntentSuffixes(MAY_SEEDS, 16);
  log(`expandWithIntentSuffixes (perSeed=16) → ${expanded.length}개`);
  log('');

  // 3. sv + dc 측정 (250개 cap — API 시간 절약)
  const CAP = Math.min(expanded.length, 250);
  const targets = expanded.slice(0, CAP);
  log(`측정 대상: ${targets.length}개 (cap ${CAP})`);

  const { getNaverKeywordSearchVolumeSeparate } = await import('../src/utils/naver-datalab-api');
  const t0 = Date.now();
  const sigs = await getNaverKeywordSearchVolumeSeparate(NAVER_CONFIG, targets, { includeDocumentCount: true });
  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`측정 완료 (${elapsed}s)`);
  log('');

  // 4. SSS 자격 분석 (간략 sanity-gate)
  type Row = { kw: string; sv: number; dc: number; ratio: number; grade: string; aiDetected?: boolean | null };
  const rows: Row[] = [];
  let svNullCount = 0;
  let dcNullCount = 0;
  let zeroSv = 0;

  for (const s of sigs) {
    const sv = (s.pcSearchVolume || 0) + (s.mobileSearchVolume || 0);
    const dc = typeof s.documentCount === 'number' ? s.documentCount : 0;
    if (s.pcSearchVolume === null && s.mobileSearchVolume === null) svNullCount++;
    if (s.documentCount === null) dcNullCount++;
    if (sv === 0) zeroSv++;
    if (sv === 0 || dc === 0) continue;
    const ratio = sv / dc;
    // 간략 SSS 기준 (rich-feed-builder calculateGrade 핵심 게이트)
    let grade = '';
    if (ratio < 1) grade = 'redOcean';
    else if (sv >= 500 && dc <= 5000 && ratio >= 5) grade = 'SSS';
    else if (sv >= 300 && dc <= 8000 && ratio >= 2) grade = 'SS';
    else if (sv >= 100 && ratio >= 1.5) grade = 'S';
    else if (sv >= 50) grade = 'A';
    else grade = '';
    rows.push({ kw: s.keyword, sv, dc, ratio, grade });
  }

  log(`API 응답 분석:`);
  log(`  - sv=null (매칭 실패): ${svNullCount}/${sigs.length}`);
  log(`  - dc=null: ${dcNullCount}/${sigs.length}`);
  log(`  - sv=0 (실측 거의 무검색): ${zeroSv}`);
  log(`  - sv>0 + dc>0 유효 측정: ${rows.length}`);
  log('');

  // grade 분포
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.grade] = (dist[r.grade] || 0) + 1;
  log(`grade 분포:`);
  for (const g of ['SSS', 'SS', 'S', 'A', 'redOcean', '']) {
    if (dist[g]) log(`  ${g || '(B/미달)'}: ${dist[g]}`);
  }
  log('');

  // SSS 후보 출력
  const sssRows = rows.filter(r => r.grade === 'SSS').sort((a, b) => b.sv - a.sv);
  log(`=== SSS 후보 (${sssRows.length}건) ===`);
  for (const r of sssRows.slice(0, 20)) {
    log(`  ${r.kw.padEnd(35)} sv=${String(r.sv).padStart(6)}  dc=${String(r.dc).padStart(6)}  ratio=${r.ratio.toFixed(2)}`);
  }
  log('');

  const ssRows = rows.filter(r => r.grade === 'SS').sort((a, b) => b.sv - a.sv);
  log(`=== SS 후보 상위 10 (${ssRows.length}건 중) ===`);
  for (const r of ssRows.slice(0, 10)) {
    log(`  ${r.kw.padEnd(35)} sv=${String(r.sv).padStart(6)}  dc=${String(r.dc).padStart(6)}  ratio=${r.ratio.toFixed(2)}`);
  }
  log('');

  // 5. AI 브리핑 detection — SSS+SS 상위 15개에만
  const aiTargets = [...sssRows, ...ssRows].slice(0, 15);
  if (aiTargets.length === 0) {
    log('⚠️ AI detection 대상 0건 — 시즌 키워드 자체에서 SSS/SS 미발견');
  } else {
    log(`=== AI 브리핑 detection (상위 ${aiTargets.length}건) ===`);
    const { detectAiBriefingBatch } = await import('../src/utils/ai-briefing-detector');
    const detMap = await detectAiBriefingBatch(aiTargets.map(r => r.kw), 5);
    let occupied = 0, clean = 0, unknown = 0;
    for (const r of aiTargets) {
      const det = detMap.get(r.kw);
      r.aiDetected = det;
      let icon: string;
      if (det === true) { icon = '🤖 AI 점령'; occupied++; }
      else if (det === false) { icon = '✓ 미점령 (블로그 기회)'; clean++; }
      else { icon = '? 미확정'; unknown++; }
      log(`  ${r.kw.padEnd(35)} ${r.grade.padEnd(3)} sv=${String(r.sv).padStart(5)} ${icon}`);
    }
    log('');
    log(`AI 점령 분포: 점령 ${occupied} / 미점령 ${clean} / 미확정 ${unknown}`);
    log(`→ rich-feed-builder 가 점령 ${occupied}건 자동 SS 강등 처리`);
    log(`→ 미점령 ${clean}건이 최종 SSS/SS 노출`);
  }

  log('\n=== 요약 ===');
  log(`시드 ${MAY_SEEDS.length} → longtail ${expanded.length} → 측정 ${targets.length} → 유효 ${rows.length} → SSS ${sssRows.length} / SS ${ssRows.length}`);
}

main().catch(e => { console.error('FATAL:', e?.message || e, e?.stack); process.exit(1); });
