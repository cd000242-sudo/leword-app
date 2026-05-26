/**
 * raw response 진단 — 검색광고 API 가 실제 무엇을 반환하는지
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const configPath = path.join(process.env['APPDATA'] || '', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

function signature(method: string, uri: string, timestamp: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${uri}`;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}

async function call(hintKeywords: string): Promise<any> {
  const timestamp = String(Date.now());
  const uri = '/keywordstool';
  const sig = signature('GET', uri, timestamp, config.naverSearchAdSecretKey);
  const params = new URLSearchParams();
  params.append('hintKeywords', hintKeywords);
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
    return { error: `HTTP ${resp.status}: ${text.slice(0, 500)}` };
  }
  return await resp.json();
}

async function main(): Promise<void> {
  const tests = [
    '환급금조회삼쩜삼오류',     // 공백 제거 (네이버 API normalize)
    '환급금 조회 삼쩜삼 오류',
    '환급금조회삼쩜삼',
    '환급금 조회 삼쩜삼',
    '삼쩜삼고객센터',
    '병원비환급금조회',
    '5월결혼식하객룩',
    '패리스잭슨',
  ];

  for (const kw of tests) {
    const r = await call(kw);
    if (r.error) {
      console.log(`[${kw}] ERROR: ${r.error}\n`);
      continue;
    }
    const list = r.keywordList || [];
    console.log(`[${kw}]`);
    console.log(`  total relKeywords: ${list.length}`);
    if (list.length === 0) {
      console.log(`  ❌ keywordList 비어있음`);
    } else {
      // 정확 매칭 + 상위 5개
      const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s+]+/g, '');
      const target = norm(kw);
      const exact = list.find((it: any) => norm(it.relKeyword) === target);
      console.log(`  exact match: ${exact ? `pc=${exact.monthlyPcQcCnt} mo=${exact.monthlyMobileQcCnt}` : 'NONE'}`);
      console.log(`  상위 5 rel:`, list.slice(0, 5).map((it: any) => `${it.relKeyword}(pc=${it.monthlyPcQcCnt},mo=${it.monthlyMobileQcCnt})`).join(' | '));
    }
    console.log('');
    await new Promise(r => setTimeout(r, 700));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
