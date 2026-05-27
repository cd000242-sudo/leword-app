/**
 * Playwright probe — datalab.naver.com/shoppingInsight 페이지의 카테고리별
 * top 인기 키워드 API endpoint + payload 캡처
 *
 * 목표: 정확한 endpoint + Form data + headers 알아내서 LEWORD 통합
 */
import * as path from 'path';
import * as fs from 'fs';
import { chromium, Request, Response } from 'playwright';

const OUT = path.join(__dirname, '..', 'tmp-datalab-probe.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

interface CapturedCall {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
  status?: number;
  responseBody?: string;
}

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== datalab.naver.com/shoppingInsight Playwright probe ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // 네트워크 캡처 — datalab 도메인의 POST 요청만
  const calls: CapturedCall[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (!url.includes('datalab.naver.com')) return;
    if (req.method() !== 'POST') return;
    calls.push({
      url,
      method: req.method(),
      postData: req.postData(),
      headers: req.headers(),
    });
  });
  page.on('response', async (resp: Response) => {
    const url = resp.url();
    if (!url.includes('datalab.naver.com')) return;
    if (resp.request().method() !== 'POST') return;
    const idx = calls.findIndex(c => c.url === url && !c.status);
    if (idx >= 0) {
      calls[idx].status = resp.status();
      try {
        const text = await resp.text();
        calls[idx].responseBody = text.slice(0, 2000);
      } catch {
        calls[idx].responseBody = '(read failed)';
      }
    }
  });

  log('1. shoppingInsight 메인 페이지 진입...');
  await page.goto('https://datalab.naver.com/shoppingInsight/sCategory.naver', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  log(`   초기 진입 후 POST 호출 ${calls.length}건 캡처`);

  log('');
  log('2. 카테고리 선택 + 조회 버튼 클릭 시도...');
  try {
    // 카테고리 1뎁스 선택 (예: 패션의류)
    // 페이지 구조 모름 → 가능한 셀렉터 시도
    const selectors = [
      'button[data-cid="50000000"]', // 패션의류
      '.select_btn',
      'button.btn_submit',
      'a[onclick*="getCategoryKeyword"]',
      'button[type="submit"]',
    ];
    for (const sel of selectors) {
      const els = await page.$$(sel);
      log(`   selector "${sel}" — ${els.length}개 매칭`);
    }

    // 조회 버튼 (네이버 datalab 공통 패턴)
    const lookup = await page.$('a[role="button"]:has-text("조회")');
    if (lookup) {
      await lookup.click();
      await page.waitForTimeout(3000);
      log(`   조회 클릭 후 POST 호출 ${calls.length}건`);
    } else {
      log('   조회 버튼 못 찾음');
    }
  } catch (e: any) {
    log(`   조회 시도 실패: ${e?.message}`);
  }

  log('');
  log('3. 캡처된 POST 호출 분석:');
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    log(`\n[${i + 1}] ${c.method} ${c.url}`);
    log(`    status: ${c.status || '?'}`);
    log(`    postData: ${c.postData?.slice(0, 300) || '(none)'}`);
    log(`    response (snippet): ${(c.responseBody || '').slice(0, 400)}`);
  }

  // HTML 분석 — 카테고리 ID 추출
  log('');
  log('4. 카테고리 ID 추출 (HTML 파싱)...');
  try {
    const html = await page.content();
    // 일반적 패턴 — data-cid="\d+" 또는 cid: "\d+"
    const cidMatches = Array.from(html.matchAll(/data-cid="(\d{8})"/g)).slice(0, 20);
    log(`   data-cid 매칭 ${cidMatches.length}건`);
    for (const m of cidMatches.slice(0, 10)) log(`     - ${m[1]}`);

    // 또는 categoryParam 안 cid
    const cidJson = Array.from(html.matchAll(/cid["':\s]+["']?(\d{8})/g)).slice(0, 20);
    log(`   JSON cid 매칭 ${cidJson.length}건`);
  } catch (e: any) {
    log(`   HTML 파싱 실패: ${e?.message}`);
  }

  await browser.close();
  log('\n=== probe 완료 ===');
}

main().catch(e => { console.error('FATAL:', e?.message || e, e?.stack); process.exit(1); });
