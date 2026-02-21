const p = require('puppeteer-extra');
const s = require('puppeteer-extra-plugin-stealth');
p.use(s());

(async () => {
  const browser = await p.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  console.log('카테고리 페이지 접속 (조회순)...');
  await page.goto('https://kin.naver.com/qna/list.naver?dirId=1&sort=vcount', { 
    waitUntil: 'networkidle2', 
    timeout: 30000 
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // 상위 5개 질문의 상세 페이지 조회수 확인
  const urls = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="qna/detail"]'));
    return links.slice(0, 5).map(a => ({
      title: a.textContent?.trim().substring(0, 40),
      url: 'https://kin.naver.com' + a.getAttribute('href')
    }));
  });
  
  console.log('\n상위 5개 질문:');
  urls.forEach((u, i) => console.log((i+1) + '. ' + u.title));
  
  // 각 상세 페이지 조회수 확인
  console.log('\n상세 페이지 조회수:');
  for (const u of urls) {
    try {
      await page.goto(u.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));
      
      const viewCount = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
        return m ? parseInt(m[1].replace(/,/g, '')) : 0;
      });
      
      console.log('  ' + u.title + ' -> 조회수: ' + viewCount.toLocaleString());
    } catch (e) {
      console.log('  ' + u.title + ' -> 에러');
    }
  }
  
  await browser.close();
})().catch(console.error).finally(() => process.exit());






