/**
 * 검색광고 API suggestions 풀 활용 검증
 * 5 시드 → suggestions 호출 → sv>0 자연 키워드 / SSS+SS 후보 수
 */
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const OUT = path.join(__dirname, '..', 'tmp-suggestions.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== 검색광고 suggestions 풀 활용 검증 ===\n');

  const { getNaverSearchAdKeywordSuggestions } = await import('../src/utils/naver-searchad-api');

  const SEED_SAMPLES = [
    '5월 결혼식 하객룩',
    '병원비 환급금 조회',
    '어버이날 선물',
    '어린이날 선물',
    '종합소득세 환급',
  ];

  let totalRaw = 0;
  let totalSvPositive = 0;
  let sssCount = 0;
  let ssCount = 0;
  const sssExamples: string[] = [];
  const ssExamples: string[] = [];

  for (const seed of SEED_SAMPLES) {
    const suggestions = await getNaverSearchAdKeywordSuggestions(
      { accessLicense: config.naverSearchAdAccessLicense, secretKey: config.naverSearchAdSecretKey, customerId: config.naverSearchAdCustomerId },
      seed,
      200
    );
    const svPositive = suggestions.filter(s => s.totalSearchVolume > 0);
    log(`[${seed}] suggestions ${suggestions.length}개, sv>0 ${svPositive.length}개`);
    log(`  상위 5: ${svPositive.slice(0, 5).map(s => `${s.keyword}(${s.totalSearchVolume})`).join(' | ')}`);
    totalRaw += suggestions.length;
    totalSvPositive += svPositive.length;

    // sv ≥ 500 + 자연 키워드 = SSS+SS 잠재 후보 (dc 측정 전)
    for (const s of svPositive) {
      if (s.totalSearchVolume >= 500 && s.totalSearchVolume <= 30000) {
        // 단순 longtail check (2+ token)
        const tokens = s.keyword.split(/\s+/).filter(Boolean).length;
        // 띄어쓰기 없으면 한국어 합성어 — 일부 SS 후보
        if (tokens >= 2 || s.keyword.length >= 6) {
          if (s.totalSearchVolume >= 1000) {
            sssCount++;
            if (sssExamples.length < 10) sssExamples.push(`${s.keyword}(${s.totalSearchVolume})`);
          } else {
            ssCount++;
            if (ssExamples.length < 10) ssExamples.push(`${s.keyword}(${s.totalSearchVolume})`);
          }
        }
      }
    }
    await new Promise(r => setTimeout(r, 700));
  }

  log('\n=== 요약 ===');
  log(`5 시드 → suggestions ${totalRaw}개 (시드당 평균 ${Math.round(totalRaw / SEED_SAMPLES.length)}개)`);
  log(`sv>0 유효: ${totalSvPositive}개 (${Math.round(totalSvPositive / totalRaw * 100)}%)`);
  log(`SSS 잠재 후보 (sv≥1000 + longtail): ${sssCount}개`);
  log(`SS 잠재 후보 (sv 500~1000 + longtail): ${ssCount}개`);
  log('');
  log(`SSS 예시: ${sssExamples.slice(0, 5).join(' / ')}`);
  log(`SS 예시: ${ssExamples.slice(0, 5).join(' / ')}`);
  log('');
  log('현재 rich-feed-builder 는 이 풀을 활용 안 함 — wire 하면 SSS+SS 폭증 가능');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
