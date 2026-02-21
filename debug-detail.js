const fs = require('fs');
const p = require('puppeteer-extra');
const s = require('puppeteer-extra-plugin-stealth');
p.use(s());

(async () => {
  const browser = await p.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 카테고리 페이지에서 첫 번째 질문 URL 가져오기
  console.log('카테고리 페이지 접속...');
  await page.goto('https://kin.naver.com/qna/list.naver?dirId=1&sort=vcount', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  await new Promise(r => setTimeout(r, 2000));
  
  const firstUrl = await page.evaluate(() => {
    const link = document.querySelector('a[href*="qna/detail"]');
    return link ? 'https://kin.naver.com' + link.getAttribute('href') : null;
  });
  
  if (!firstUrl) {
    console.log('질문 URL을 찾지 못함');
    await browser.close();
    return;
  }
  
  console.log('첫 번째 질문 URL:', firstUrl);
  
  // 상세 페이지 접속
  console.log('상세 페이지 접속...');
  await page.goto(firstUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // HTML 저장
  const html = await page.content();
  fs.writeFileSync('debug-detail-page.html', html);
  console.log('HTML 저장: debug-detail-page.html (' + html.length + ' bytes)');
  
  // 텍스트에서 조회수 찾기
  const text = await page.evaluate(() => document.body.innerText);
  console.log('\n=== 조회 키워드 검색 ===');
  
  const lines = text.split('\n').filter(l => l.includes('조회'));
  console.log('조회 포함 라인 수:', lines.length);
  lines.slice(0, 10).forEach((l, i) => console.log(i + ':', l.substring(0, 100)));
  
  // 패턴 매칭 테스트
  console.log('\n=== 패턴 매칭 테스트 ===');
  const patterns = [
    /조회[수]?\s*[:\s]*([0-9,]+)/,
    /조회\s*([0-9,]+)/,
    /([0-9,]+)\s*조회/
  ];
  
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      console.log('패턴 ' + p + ' 매치:', m[1]);
    }
  }
  
  await browser.close();
})().catch(console.error).finally(() => process.exit());






