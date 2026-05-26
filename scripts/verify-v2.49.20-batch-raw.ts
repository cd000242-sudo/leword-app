/**
 * 함수가 NULL 반환 — chunk=10 hintKeywords 결합 시 API 응답 직접 확인
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

function sign(method: string, uri: string, timestamp: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function buildProcessedKeyword(cleanKeyword: string): string {
  let p = cleanKeyword
    .replace(/['"]/g, '')
    .replace(/[&<>]/g, '')
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '');
  if (!p || p.length === 0) p = cleanKeyword.trim();
  if (p.length > 15) p = p.substring(0, 15).trim();
  return p;
}

async function main(): Promise<void> {
  const BATCH = [
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

  const processed = BATCH.map(k => buildProcessedKeyword(k));
  console.log('Processed keywords:', processed);
  const hintKeywordsValue = processed.join(',');
  console.log('hintKeywords param:', hintKeywordsValue);
  console.log('');

  const timestamp = String(Date.now());
  const uri = '/keywordstool';
  const sig = sign('GET', uri, timestamp, config.naverSearchAdSecretKey);
  const params = new URLSearchParams();
  params.append('hintKeywords', hintKeywordsValue);
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

  if (!resp.ok) {
    const text = await resp.text();
    console.log(`HTTP ${resp.status}: ${text.slice(0, 1000)}`);
    return;
  }

  const data = await resp.json() as any;
  const list = data.keywordList || [];
  console.log(`total relKeywords in response: ${list.length}`);
  console.log('');

  // 각 요청 키워드의 정확 매칭 시도
  const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s+]+/g, '');
  console.log('=== 매칭 시도 (normalize 기반) ===\n');
  for (let i = 0; i < BATCH.length; i++) {
    const orig = BATCH[i];
    const proc = processed[i];
    const target = normalize(orig);
    const exact = list.find((it: any) => normalize(it.relKeyword) === target);
    if (exact) {
      console.log(`✅ [${orig}] (proc="${proc}") → ${exact.relKeyword} | pc=${exact.monthlyPcQcCnt} mo=${exact.monthlyMobileQcCnt}`);
    } else {
      // 포함 매칭
      const inclusion = list.find((it: any) => {
        const rel = normalize(it.relKeyword);
        return rel.includes(target) || target.includes(rel);
      });
      if (inclusion) {
        console.log(`🔸 [${orig}] inclusion → ${inclusion.relKeyword} | pc=${inclusion.monthlyPcQcCnt} mo=${inclusion.monthlyMobileQcCnt}`);
      } else {
        console.log(`❌ [${orig}] NO MATCH in list of ${list.length}`);
      }
    }
  }

  console.log('\n=== keywordList 상위 15개 ===');
  list.slice(0, 15).forEach((it: any, idx: number) => {
    console.log(`  ${idx + 1}. ${it.relKeyword} (pc=${it.monthlyPcQcCnt}, mo=${it.monthlyMobileQcCnt})`);
  });
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
