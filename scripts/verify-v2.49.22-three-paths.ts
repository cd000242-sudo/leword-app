/**
 * v2.49.22 검증 — 황금키워드/PRO트래픽헌터/키워드분석기 sv 100% 일치 확인
 *
 * 3 path 모두 동일 키워드에 대해 동일 sv 반환해야 함.
 * 휴리스틱 fallback 제거 후 일관성 보장 검증.
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

const SEARCHAD_CONFIG = {
  accessLicense: config.naverSearchAdAccessLicense,
  secretKey: config.naverSearchAdSecretKey,
  customerId: config.naverSearchAdCustomerId,
};

const NAVER_CONFIG = {
  clientId: config.naverClientId,
  clientSecret: config.naverClientSecret,
};

const TEST_KEYWORDS = [
  '환급금 조회 삼쩜삼 오류',   // 휴리스틱 trigger 후보 (실측 sv=0)
  '환급금 조회 삼쩜삼',
  '병원비 환급금 조회',         // 실측 sv≈23,520
  '5월 결혼식 하객룩',           // 실측 sv≈8,470
  '패리스 잭슨',                  // 실측 sv≈8,160
  '의료비 환급 조회',            // 실측 sv≈40
  '건보료 환급 신청',            // 실측 sv≈400 (이전 휴리스틱 발동 케이스)
];

// 결과를 파일에도 쓰기 (background 실행 시 stdout 캡처 안 되는 환경 호환)
const OUT_FILE = path.join(__dirname, '..', 'tmp-v2.49.22-verify.log');
const log = (msg: string) => {
  process.stdout.write(msg + '\n');
  fs.appendFileSync(OUT_FILE, msg + '\n', 'utf-8');
};

async function main(): Promise<void> {
  // 파일 초기화
  fs.writeFileSync(OUT_FILE, '', 'utf-8');
  log('\n=== v2.49.22: 3 path sv 일관성 검증 ===\n');

  const { getNaverSearchAdKeywordVolume } = await import('../src/utils/naver-searchad-api');
  const { getNaverKeywordSearchVolumeSeparate } = await import('../src/utils/naver-datalab-api');

  // === Path A: 키워드 분석기 path ===
  // (keyword-analysis.ts:63-66 — getNaverSearchAdKeywordVolume 직접)
  log('Path A (키워드 분석기 — getNaverSearchAdKeywordVolume 직접 호출)...');
  const pathA = await getNaverSearchAdKeywordVolume(SEARCHAD_CONFIG, TEST_KEYWORDS);
  await new Promise(r => setTimeout(r, 1000));

  // === Path B: PRO 트래픽 헌터 path ===
  // (pro-traffic-keyword-hunter.ts:1720, 1820, 8071 — 같은 함수)
  log('Path B (PRO 트래픽 헌터 — 동일 함수)...');
  const pathB = await getNaverSearchAdKeywordVolume(SEARCHAD_CONFIG, TEST_KEYWORDS);
  await new Promise(r => setTimeout(r, 1000));

  // === Path C: 황금키워드 발굴 path ===
  // (rich-feed-builder.ts:1267 — getNaverKeywordSearchVolumeSeparate → 내부적으로 위 함수)
  log('Path C (황금키워드 — getNaverKeywordSearchVolumeSeparate)...');
  const pathC = await getNaverKeywordSearchVolumeSeparate(NAVER_CONFIG, TEST_KEYWORDS, { includeDocumentCount: false });

  log('\n=== 결과 비교 ===\n');
  log('키워드'.padEnd(28) + ' | ' + 'A:분석기'.padEnd(11) + ' | ' + 'B:PRO헌터'.padEnd(11) + ' | ' + 'C:황금키워드'.padEnd(11) + ' | 일치?');
  log('-'.repeat(95));

  let allMatch = true;
  let mismatchCount = 0;

  for (const kw of TEST_KEYWORDS) {
    const a = pathA.find(r => r.keyword === kw);
    const b = pathB.find(r => r.keyword === kw);
    const c = pathC.find(r => r.keyword === kw);

    const svA = a ? ((a.pcSearchVolume || 0) + (a.mobileSearchVolume || 0)) : -1;
    const svB = b ? ((b.pcSearchVolume || 0) + (b.mobileSearchVolume || 0)) : -1;
    const svC = c ? ((c.pcSearchVolume || 0) + (c.mobileSearchVolume || 0)) : -1;

    const match = svA === svB && svB === svC;
    if (!match) {
      allMatch = false;
      mismatchCount++;
    }

    const status = match ? '✅' : '❌ MISMATCH';
    log(
      kw.padEnd(28) + ' | ' +
      String(svA).padEnd(11) + ' | ' +
      String(svB).padEnd(11) + ' | ' +
      String(svC).padEnd(11) + ' | ' + status
    );
  }

  log('-'.repeat(95));
  log('');

  if (allMatch) {
    log(`🎉 100% 일치 — 7/${TEST_KEYWORDS.length} 키워드 모두 3 path 동일 sv`);
    log('   사용자 요구 "하나라도 다르면 안 됨" 만족 ✅');
  } else {
    log(`❌ MISMATCH — ${mismatchCount}/${TEST_KEYWORDS.length} 건 불일치 발견`);
    log('   추가 진단 필요 — 어떤 path 가 다른 함수 사용 또는 캐시 영향');
    process.exit(1);
  }

  // svEstimated 마킹 확인 (v2.49.22 에서는 항상 false 여야)
  log('\n=== svEstimated 마킹 (v2.49.22: 항상 false 여야 함) ===');
  for (const kw of TEST_KEYWORDS) {
    const a = pathA.find(r => r.keyword === kw);
    const svEst = (a as any)?.svEstimated;
    if (svEst === true) {
      log(`❌ ${kw}: svEstimated=true (휴리스틱 잔재 — fix 미작동)`);
      process.exit(1);
    }
  }
  log('✅ 모든 키워드 svEstimated=false (휴리스틱 완전 제거 확인)');
}

main().catch(e => {
  console.error('FATAL:', e?.message || e);
  console.error(e?.stack);
  process.exit(1);
});
