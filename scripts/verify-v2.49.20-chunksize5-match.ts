/**
 * chunkSize=5 에서 정확 매칭 성공률 검증
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

function sign(method: string, uri: string, timestamp: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(`${timestamp}.${method}.${uri}`).digest('base64');
}

function processed(k: string): string {
  let p = k.replace(/['"]/g, '').replace(/[&<>]/g, '').replace(/[^\w\s가-힣]/g, '').trim().replace(/\s+/g, '');
  if (p.length > 15) p = p.substring(0, 15).trim();
  return p;
}

async function callBatch(keywords: string[]): Promise<any[]> {
  const timestamp = String(Date.now());
  const uri = '/keywordstool';
  const sig = sign('GET', uri, timestamp, config.naverSearchAdSecretKey);
  const params = new URLSearchParams();
  params.append('hintKeywords', keywords.map(processed).join(','));
  params.append('showDetail', '1');
  const customerId = config.naverSearchAdCustomerId || config.naverSearchAdAccessLicense.split(':')[0];
  const resp = await fetch(`https://api.searchad.naver.com${uri}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': config.naverSearchAdAccessLicense,
      'X-Signature': sig,
      'X-Customer': customerId,
    },
  });
  if (!resp.ok) return [];
  const data = await resp.json() as any;
  return data.keywordList || [];
}

const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s+]+/g, '');

async function main(): Promise<void> {
  const ALL_KW = [
    '환급금 조회 삼쩜삼 오류',
    '환급금 조회 삼쩜삼',
    '삼쩜삼 환급금 조회',
    '삼쩜삼 환급금 오류 해결',
    '병원비 환급금 조회',
    '5월 결혼식 하객룩',
    '패리스 잭슨',
    '의료비 환급 조회',
    '연말정산 환급 조회 방법',
    '건보료 환급 신청',
  ];

  // chunkSize=5 로 2 batch 실행 (5+5)
  console.log('=== chunkSize=5 매칭 검증 ===\n');
  let totalMatched = 0;
  let totalNotMatched = 0;

  for (let i = 0; i < ALL_KW.length; i += 5) {
    const batch = ALL_KW.slice(i, i + 5);
    const list = await callBatch(batch);
    console.log(`\nBatch ${Math.floor(i / 5) + 1} (${batch.length} hints) → keywordList ${list.length}개`);
    for (const kw of batch) {
      const target = normalize(kw);
      const exact = list.find((it: any) => normalize(it.relKeyword) === target);
      if (exact) {
        const sv = (typeof exact.monthlyPcQcCnt === 'number' ? exact.monthlyPcQcCnt : 0) + (typeof exact.monthlyMobileQcCnt === 'number' ? exact.monthlyMobileQcCnt : 0);
        console.log(`  ✅ [${kw}] sv=${sv} (pc=${exact.monthlyPcQcCnt}, mo=${exact.monthlyMobileQcCnt})`);
        totalMatched++;
      } else {
        console.log(`  ❌ [${kw}] NO EXACT match`);
        totalNotMatched++;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n=== 요약 ===`);
  console.log(`✅ 정확 매칭: ${totalMatched} / 전체 ${ALL_KW.length} = ${Math.round(totalMatched / ALL_KW.length * 100)}%`);
  console.log(`❌ 매칭 실패: ${totalNotMatched}`);

  // chunkSize=3 도 비교
  console.log('\n\n=== chunkSize=3 비교 ===');
  let m3 = 0, n3 = 0;
  for (let i = 0; i < ALL_KW.length; i += 3) {
    const batch = ALL_KW.slice(i, i + 3);
    const list = await callBatch(batch);
    for (const kw of batch) {
      const target = normalize(kw);
      const exact = list.find((it: any) => normalize(it.relKeyword) === target);
      if (exact) m3++; else n3++;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`✅ chunkSize=3 정확 매칭: ${m3} / ${ALL_KW.length} = ${Math.round(m3 / ALL_KW.length * 100)}%`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
