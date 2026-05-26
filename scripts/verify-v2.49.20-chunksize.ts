/**
 * chunkSize 별 keywordList 응답 수 측정 — 최적 chunkSize 찾기
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

function processed(k: string): string {
  let p = k.replace(/['"]/g, '').replace(/[&<>]/g, '').replace(/[^\w\s가-힣]/g, '').trim().replace(/\s+/g, '');
  if (p.length > 15) p = p.substring(0, 15).trim();
  return p;
}

async function call(hint: string): Promise<{ listSize: number; status: number; httpStatus?: number; error?: string }> {
  const timestamp = String(Date.now());
  const uri = '/keywordstool';
  const sig = sign('GET', uri, timestamp, config.naverSearchAdSecretKey);
  const params = new URLSearchParams();
  params.append('hintKeywords', hint);
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
    return { listSize: -1, status: resp.status, error: text.slice(0, 200) };
  }
  const data = await resp.json() as any;
  return { listSize: (data.keywordList || []).length, status: resp.status };
}

async function main(): Promise<void> {
  const TEST_KW = [
    '환급금조회삼쩜삼오류',
    '환급금조회삼쩜삼',
    '삼쩜삼환급금조회',
    '삼쩜삼환급금오류해결',
    '병원비환급금조회',
    '5월결혼식하객룩',
    '패리스잭슨',
    '의료비환급조회',
    '연말정산환급조회방법',
    '건보료환급신청',
  ];

  // 1, 2, 3, 5, 7, 10 개씩 chunkSize 테스트
  const sizes = [1, 2, 3, 5, 7, 10];
  for (const size of sizes) {
    const hint = TEST_KW.slice(0, size).join(',');
    const r = await call(hint);
    console.log(`chunkSize=${size}: keywordList=${r.listSize} ${r.error ? '| ERROR: ' + r.error : ''}`);
    await new Promise(r => setTimeout(r, 800));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
