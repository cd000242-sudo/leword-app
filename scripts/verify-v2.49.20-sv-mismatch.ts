/**
 * v2.49.20 검증 스크립트 — sv mismatch 직접 reproduce + svEstimated 마킹 작동 확인
 *
 * 사용자 보고 케이스:
 *   - 황금키워드 발굴: "환급금 조회 삼쩜삼 오류" sv=23,530 (SSR 등급)
 *   - 키워드 분석기: 같은 키워드 sv=0 (PC<10, 모바일<10)
 *   - 100x 차이 = svEstimated 마킹 누락
 *
 * 검증 목표:
 *   1. 휴리스틱 fallback 발동 시 svEstimated=true 마킹되는지
 *   2. 부모 키워드 (정확 매칭) 의 sv 빌려오는 정확한 수치 reproduce
 *   3. 다른 의심 SSS 들 (병원비/하객룩) 의 실측 vs 추정 확정
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ config.json 없음:', configPath);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
process.env['NAVER_CLIENT_ID'] = config.naverClientId;
process.env['NAVER_CLIENT_SECRET'] = config.naverClientSecret;
process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] = config.naverSearchAdAccessLicense;
process.env['NAVER_SEARCHAD_SECRET_KEY'] = config.naverSearchAdSecretKey;
process.env['NAVER_SEARCHAD_CUSTOMER_ID'] = config.naverSearchAdCustomerId;

const TEST_KEYWORDS = [
  // 사용자가 mismatch 직접 보고한 케이스
  '환급금 조회 삼쩜삼 오류',     // 황금=23,530 / 분석기=0 → 휴리스틱 의심
  '환급금 조회 삼쩜삼',           // 부모 키워드 (휴리스틱이 sv 빌려간 source)
  '삼쩜삼 고객센터',                // 분석기에 보이던 다른 키워드 (sv=10,890 실측)
  // v2.49.19 결과의 의심 SSS
  '병원비 환급금 조회',           // sv=23,270 보고 (의심)
  '5월 결혼식 하객룩',             // sv=8,860 보고 (의심)
  // 정상 SSS (정확 매칭 expected)
  '패리스 잭슨',                    // wikipedia-ko 발견
];

async function main(): Promise<void> {
  console.log('\n=== v2.49.20 sv mismatch reproduce 검증 ===\n');
  console.log(`테스트 키워드 ${TEST_KEYWORDS.length}개\n`);

  const { getNaverSearchAdKeywordVolume } = await import('../src/utils/naver-searchad-api');

  const result = await getNaverSearchAdKeywordVolume({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId,
  }, TEST_KEYWORDS);

  let exactCount = 0;
  let heuristicCount = 0;
  let nullCount = 0;

  for (const r of result) {
    const totalSv = (r.pcSearchVolume || 0) + (r.mobileSearchVolume || 0);
    const isHeuristic = (r as any).svEstimated === true;
    const isNull = r.pcSearchVolume === null && r.mobileSearchVolume === null;

    let status: string;
    if (isHeuristic) {
      status = '⚠️  HEURISTIC (svEstimated=true)';
      heuristicCount++;
    } else if (isNull) {
      status = '❌ NULL (API 응답 없음)';
      nullCount++;
    } else {
      status = '✅ EXACT (실측 매칭)';
      exactCount++;
    }

    console.log(`[${r.keyword}]`);
    console.log(`  PC: ${r.pcSearchVolume ?? 'null'} | Mobile: ${r.mobileSearchVolume ?? 'null'} | Total: ${totalSv}`);
    console.log(`  ${status}`);
    console.log('');
  }

  console.log('=== 요약 ===');
  console.log(`✅ EXACT (정확 매칭): ${exactCount}건`);
  console.log(`⚠️  HEURISTIC (svEstimated=true): ${heuristicCount}건`);
  console.log(`❌ NULL: ${nullCount}건`);
  console.log('');

  // 검증 1: "환급금 조회 삼쩜삼 오류" 가 휴리스틱으로 마킹되어야 함 (사용자 보고 케이스)
  const target1 = result.find(r => r.keyword === '환급금 조회 삼쩜삼 오류');
  const target1Heuristic = (target1 as any)?.svEstimated === true;
  const target1Sv = ((target1?.pcSearchVolume || 0) + (target1?.mobileSearchVolume || 0));
  console.log('=== v2.49.18 svEstimated 마킹 검증 ===');
  if (target1Heuristic) {
    console.log(`✅ "환급금 조회 삼쩜삼 오류" → svEstimated=true 마킹 작동 (sv=${target1Sv})`);
    console.log(`   → rich-feed-builder 가 SSS/SSR 강등 → 가짜 SSR 차단 보장`);
  } else if (target1Sv === 0) {
    console.log(`⚠️  "환급금 조회 삼쩜삼 오류" sv=0 + svEstimated=false`);
    console.log(`   → 휴리스틱 미발동. minVolume filter 가 폐기 → SSS 진입 X (정상)`);
  } else {
    console.log(`❌ "환급금 조회 삼쩜삼 오류" sv=${target1Sv} + svEstimated=false`);
    console.log(`   → 휴리스틱 발동했는데 마킹 누락 = v2.49.18 fix 미작동 = BUG`);
  }
  console.log('');

  // 검증 2: "병원비 환급금 조회" — v2.49.19 결과 의심
  const target2 = result.find(r => r.keyword === '병원비 환급금 조회');
  const target2Heuristic = (target2 as any)?.svEstimated === true;
  const target2Sv = ((target2?.pcSearchVolume || 0) + (target2?.mobileSearchVolume || 0));
  console.log('=== 의심 SSS 케이스 — "병원비 환급금 조회" ===');
  console.log(`  실측 sv = ${target2Sv} | svEstimated = ${target2Heuristic}`);
  if (target2Heuristic) {
    console.log(`  → 휴리스틱 빌려옴. v2.49.20 에서 SS 로 강등될 것 (정상)`);
  } else if (target2Sv > 0) {
    console.log(`  → ✅ 진짜 실측 sv. SSS 자격 정당`);
  } else {
    console.log(`  → sv=0. SSS 로 노출되면 BUG`);
  }
}

main().catch(e => {
  console.error('\n❌ FATAL:', e?.message || e);
  console.error(e?.stack);
  process.exit(1);
});
