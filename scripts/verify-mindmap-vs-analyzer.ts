/**
 * 마인드맵 path vs 키워드 분석기 path sv 일치 검증
 *
 * 사용자 호소: "마인드맵이랑 키워드분석이랑 검색량과 문서수가 상이"
 *
 * Path A: 마인드맵 — getNaverSearchAdKeywordSuggestions (suggestions API)
 *   → keywordList 안의 각 키워드 sv 그대로 사용
 * Path B: 키워드 분석기 — getNaverKeywordSearchVolumeSeparate
 *   → 내부적으로 getNaverSearchAdKeywordVolume (chunkSize=5) 호출
 *
 * 같은 키워드의 sv 가 두 path 에서 일치해야 함.
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const SEARCHAD = { accessLicense: config.naverSearchAdAccessLicense, secretKey: config.naverSearchAdSecretKey, customerId: config.naverSearchAdCustomerId };
const NAVER = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };

const OUT = path.join(__dirname, '..', 'tmp-mindmap-vs-analyzer.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== 마인드맵 vs 키워드 분석기 sv 일치 검증 ===\n');

  // 사용자 화면에서 본 키워드들 (etf 뜻 변형들)
  const TEST_KEYWORDS = ['etf 뜻 쉽게', 'etf 뜻 종류', 'etf 뜻 영어로', 'etf 뜻 디시'];
  const SEED = 'etf 뜻';  // 마인드맵 입력

  // === Path A: 마인드맵 path (suggestions API + raw sv) ===
  const { getNaverSearchAdKeywordSuggestions } = await import('../src/utils/naver-searchad-api');
  log(`Path A: getNaverSearchAdKeywordSuggestions("${SEED}", 200)`);
  const suggestions = await getNaverSearchAdKeywordSuggestions(SEARCHAD, SEED, 200);
  log(`  → 응답 ${suggestions.length}개`);
  log('');

  // 검색 — 우리가 찾는 키워드들
  const pathA: Record<string, { sv: number; pc: number; mo: number }> = {};
  const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s+]+/g, '');
  for (const kw of TEST_KEYWORDS) {
    const target = normalize(kw);
    const match = suggestions.find(s => normalize(s.keyword) === target);
    if (match) {
      pathA[kw] = {
        sv: (match.pcSearchVolume || 0) + (match.mobileSearchVolume || 0),
        pc: match.pcSearchVolume || 0,
        mo: match.mobileSearchVolume || 0,
      };
    } else {
      pathA[kw] = { sv: -1, pc: -1, mo: -1 };
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // === Path B: 키워드 분석기 path ===
  const { getNaverKeywordSearchVolumeSeparate } = await import('../src/utils/naver-datalab-api');
  log(`Path B: getNaverKeywordSearchVolumeSeparate(${TEST_KEYWORDS.length} 키워드)`);
  const sigs = await getNaverKeywordSearchVolumeSeparate(NAVER, TEST_KEYWORDS, { includeDocumentCount: true });
  log(`  → 응답 ${sigs.length}개`);
  log('');

  const pathB: Record<string, { sv: number; pc: number; mo: number; dc: number }> = {};
  for (const sig of sigs) {
    pathB[sig.keyword] = {
      sv: (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0),
      pc: sig.pcSearchVolume || 0,
      mo: sig.mobileSearchVolume || 0,
      dc: sig.documentCount || 0,
    };
  }

  // === 비교 ===
  log('=== 비교 ===\n');
  log('키워드'.padEnd(20) + ' | ' + 'A:마인드맵'.padEnd(20) + ' | ' + 'B:분석기'.padEnd(25) + ' | 일치?');
  log('-'.repeat(85));

  let mismatchCount = 0;
  for (const kw of TEST_KEYWORDS) {
    const a = pathA[kw];
    const b = pathB[kw];
    const aStr = a.sv === -1 ? 'NOT FOUND' : `pc=${a.pc} mo=${a.mo} sv=${a.sv}`;
    const bStr = b ? `pc=${b.pc} mo=${b.mo} sv=${b.sv} dc=${b.dc}` : 'NOT FOUND';
    const match = a.sv === (b?.sv ?? -1);
    if (!match) mismatchCount++;
    log(kw.padEnd(20) + ' | ' + aStr.padEnd(20) + ' | ' + bStr.padEnd(25) + ' | ' + (match ? '✅' : '❌ MISMATCH'));
  }

  log('-'.repeat(85));
  log('');
  if (mismatchCount === 0) {
    log('🎉 100% 일치 — 마인드맵 vs 분석기 sv 동일');
  } else {
    log(`❌ ${mismatchCount}건 mismatch 발견 — 추가 진단 필요`);
  }
}

main().catch(e => { console.error('FATAL:', e?.message || e); process.exit(1); });
