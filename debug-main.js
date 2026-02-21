const p = require('puppeteer-extra');
const s = require('puppeteer-extra-plugin-stealth');
p.use(s());

(async () => {
  const browser = await p.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  console.log('메인 페이지 접속...');
  await page.goto('https://kin.naver.com/', { 
    waitUntil: 'networkidle2', 
    timeout: 30000 
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // 많이 본 Q&A 영역의 상위 5개 질문
  const urls = await page.evaluate(() => {
    // 많이 본 Q&A 섹션 찾기
    const sections = document.querySelectorAll('section, div.section, div[class*="popular"], div[class*="hot"]');
    let popularLinks = [];
    
    // 모든 Q&A 링크 가져오기
    const allLinks = Array.from(document.querySelectorAll('a[href*="qna/detail"]'));
    popularLinks = allLinks.slice(0, 10).map(a => ({
      title: a.textContent?.trim().substring(0, 50),
      url: 'https://kin.naver.com' + a.getAttribute('href')
    }));
    
    return popularLinks;
  });
  
  console.log('\n메인 페이지 상위 10개 질문:');
  urls.forEach((u, i) => console.log((i+1) + '. ' + u.title));
  
  // 각 상세 페이지 조회수 확인
  console.log('\n상세 페이지 조회수:');
  for (let i = 0; i < Math.min(5, urls.length); i++) {
    const u = urls[i];
    try {
      await page.goto(u.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));
      
      const viewCount = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
        return m ? parseInt(m[1].replace(/,/g, '')) : 0;
      });
      
      console.log('  ' + u.title.substring(0, 30) + '... -> 조회수: ' + viewCount.toLocaleString());
    } catch (e) {
      console.log('  ' + u.title.substring(0, 30) + '... -> 에러: ' + e.message);
    }
  }
  
  await browser.close();
})().catch(console.error).finally(() => process.exit());






