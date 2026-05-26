/**
 * v2.49.18 svEstimated 마킹 검증 — 실제 batch 호출 + getNaverSearchAdKeywordVolume 함수 사용
 *
 * 시나리오:
 *   - "환급금 조회 삼쩜삼 오류" (실측 sv=0) + "환급금 조회 삼쩜삼" (실측 sv=10) 같은 batch
 *   - 휴리스틱 fallback 이 다른 best 키워드 (예: "병원비환급금조회" sv=23,520) 빌려올 수 있음
 *   - v2.49.18 fix 가 작동하면 svEstimated=true 마킹되어야 함
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

async function main(): Promise<void> {
  const { getNaverSearchAdKeywordVolume } = await import('../src/utils/naver-searchad-api');

  // 사용자 보고 케이스 + 휴리스틱 trigger 후보들 (sv=0 + 공통 토큰 가진 best 풀)
  const BATCH = [
    '환급금 조회 삼쩜삼 오류',     // 실측 sv=0 — 휴리스틱 trigger 후보
    '환급금 조회 삼쩜삼',           // 실측 sv=10 — best 후보
    '삼쩜삼 환급금 조회',           // 어순 변형
    '삼쩜삼 환급금 오류 해결',     // 어순 + 추가 토큰
    '병원비 환급금 조회',           // 실측 sv=23,520 — best 후보 가능성
    '5월 결혼식 하객룩',             // 실측 sv=8,470
    '패리스 잭슨',                    // 실측 sv=8,160
    '의료비 환급 조회',              // sv 모름 — 잠재 best
    '연말정산 환급 조회 방법',     // 추가 trigger 후보
    '건보료 환급 신청',              // 추가
  ];

  console.log(`\n=== v2.49.18 svEstimated 마킹 검증 (batch ${BATCH.length}건) ===\n`);

  const result = await getNaverSearchAdKeywordVolume({
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId,
  }, BATCH);

  let exactCount = 0;
  let heuristicCount = 0;
  let nullCount = 0;

  for (const r of result) {
    const sv = (r.pcSearchVolume || 0) + (r.mobileSearchVolume || 0);
    const isHeuristic = (r as any).svEstimated === true;
    const isNull = r.pcSearchVolume === null && r.mobileSearchVolume === null;

    let label: string;
    if (isHeuristic) {
      label = '⚠️ HEURISTIC (svEstimated=TRUE)';
      heuristicCount++;
    } else if (isNull) {
      label = '❌ NULL (matching failed)';
      nullCount++;
    } else if (sv === 0) {
      label = '➖ EXACT zero (sv<10 실측)';
      exactCount++;
    } else {
      label = '✅ EXACT (실측 매칭)';
      exactCount++;
    }

    console.log(`[${r.keyword}]`);
    console.log(`  PC: ${r.pcSearchVolume ?? 'null'} | Mobile: ${r.mobileSearchVolume ?? 'null'} | Total: ${sv}`);
    console.log(`  ${label}`);
    console.log('');
  }

  console.log('=== 요약 ===');
  console.log(`✅ EXACT: ${exactCount} / ⚠️ HEURISTIC: ${heuristicCount} / ❌ NULL: ${nullCount}`);
  console.log('');

  // 핵심 검증: 사용자 mismatch reproduce + svEstimated 마킹 작동 여부
  const target = result.find(r => r.keyword === '환급금 조회 삼쩜삼 오류');
  if (!target) {
    console.log('❌ "환급금 조회 삼쩜삼 오류" 결과 없음');
    return;
  }
  const targetSv = (target.pcSearchVolume || 0) + (target.mobileSearchVolume || 0);
  const targetHeuristic = (target as any).svEstimated === true;

  console.log('=== v2.49.18 fix 작동 검증 ===');
  if (targetSv === 0 && !targetHeuristic) {
    console.log('✅ 정상 — sv=0 (실측) + svEstimated=false');
    console.log('   → rich-feed-builder 의 minVolume(1~3) 필터가 폐기 → SSR 진입 X');
  } else if (targetSv > 0 && targetHeuristic) {
    console.log(`✅ v2.49.18 fix 작동 — 휴리스틱 sv=${targetSv} 빌려옴 + svEstimated=TRUE 마킹`);
    console.log('   → rich-feed-builder 가 sanity-gate [2] SV_ESTIMATED 로 SSS/SSR 강등 → SS 노출');
  } else if (targetSv > 0 && !targetHeuristic) {
    console.log(`❌ BUG — sv=${targetSv} 부여됐는데 svEstimated=false`);
    console.log('   → 휴리스틱 발동했는데 마킹 누락! v2.49.18 fix 미작동.');
  } else {
    console.log(`⚠️ 예상 외 — sv=${targetSv}, svEstimated=${targetHeuristic}`);
  }
}

main().catch(e => { console.error('FATAL:', e?.message || e); console.error(e?.stack); process.exit(1); });
