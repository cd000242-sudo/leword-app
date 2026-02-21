const p = require('puppeteer-extra');
const s = require('puppeteer-extra-plugin-stealth');
p.use(s());

(async () => {
  const browser = await p.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 많이 본 Q&A 전체보기 페이지 시도
  console.log('많이 본 Q&A 전체보기 시도...');
  
  const urls = [
    'https://kin.naver.com/qna/list.naver?sort=vcount',
    'https://kin.naver.com/best/pop.naver',
    'https://kin.naver.com/',
  ];
  
  for (const url of urls) {
    console.log('\nURL:', url);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1000));
      
      const count = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="qna/detail"]').length;
      });
      console.log('질문 링크 수:', count);
    } catch (e) {
      console.log('에러:', e.message);
    }
  }
  
  await browser.close();
})().catch(console.error).finally(() => process.exit());






