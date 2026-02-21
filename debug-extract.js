const fs = require('fs');
const p = require('puppeteer-extra');
const s = require('puppeteer-extra-plugin-stealth');
p.use(s());

(async () => {
  const browser = await p.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 카테고리 페이지에서 질문 URL들 수집
  console.log('카테고리 페이지 접속...');
  await page.goto('https://kin.naver.com/qna/list.naver?dirId=1&sort=vcount', { 
    waitUntil: 'networkidle2', 
    timeout: 30000 
  });
  await new Promise(r => setTimeout(r, 2000));
  
  const urls = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="qna/detail"]'));
    return links.slice(0, 10).map(a => 'https://kin.naver.com' + a.getAttribute('href'));
  });
  
  console.log('수집된 URL:', urls.length, '개');
  
  // 각 상세 페이지 분석
  console.log('\n상세 페이지 분석:');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log('\n[' + (i+1) + '] ' + url);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));
      
      const result = await page.evaluate(() => {
        const text = document.body.innerText || '';
        
        // 조회수 관련 텍스트 찾기
        const viewLines = text.split('\n').filter(l => l.includes('조회'));
        
        // 패턴 매칭
        let viewCount = 0;
        const patterns = [
          /조회[수]?\s*[:\s]*([0-9,]+)/,
          /조회\s*([0-9,]+)/,
          /([0-9,]+)\s*조회/
        ];
        
        for (const p of patterns) {
          const m = text.match(p);
          if (m) {
            viewCount = parseInt(m[1].replace(/,/g, ''));
            break;
          }
        }
        
        return {
          viewCount,
          viewLines: viewLines.slice(0, 3),
          textLength: text.length
        };
      });
      
      if (result.viewCount > 0) {
        console.log('  ✅ 조회수: ' + result.viewCount);
        successCount++;
      } else {
        console.log('  ❌ 조회수 못 찾음');
        console.log('  조회 관련 텍스트:', result.viewLines);
        failCount++;
        
        // 실패한 경우 HTML 저장
        if (failCount <= 2) {
          const html = await page.content();
          fs.writeFileSync('debug-fail-' + i + '.html', html);
          console.log('  HTML 저장: debug-fail-' + i + '.html');
        }
      }
      
    } catch (e) {
      console.log('  ❌ 에러:', e.message);
      failCount++;
    }
  }
  
  console.log('\n=== 요약 ===');
  console.log('성공:', successCount, '/ 실패:', failCount);
  
  await browser.close();
})().catch(console.error).finally(() => process.exit());






