/**
 * 포스트 추출 디버깅
 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);


 */

import puppeteer from 'puppeteer';

async function debugExtraction() {
  console.log('='.repeat(60));
  console.log('🔍 포스트 추출 디버깅');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  
  const keyword = '서울맛집';
  const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  
  console.log(`\n검색 URL: ${searchUrl}\n`);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 디버깅
  const debug = await page.evaluate(() => {
    const result: any = {
      allBlogLinks: [],
      postLinks: [],
      titleLinks: [],
    };
    
    // 1. 모든 블로그 링크
    const allLinks = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
    result.totalBlogLinks = allLinks.length;
    
    allLinks.forEach((link, i) => {
      if (i < 20) {
        result.allBlogLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
          isPostPattern: /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(link.href),
        });
      }
    });
    
    // 2. 포스트 패턴 링크만
    const postLinks = allLinks.filter(l => /blog\.naver\.com\/[^\/]+\/\d{6,}/.test(l.href));
    result.postLinksCount = postLinks.length;
    
    postLinks.forEach((link, i) => {
      if (i < 15) {
        result.postLinks.push({
          index: i + 1,
          href: link.href,
          text: (link.textContent || '').trim().substring(0, 80),
          className: link.className.substring(0, 60),
        });
      }
    });
    
    // 3. 제목 클래스 링크
    const titleSelectors = [
      'a.fds-comps-right-image-text-title',
      'a[class*="text-title"]',
      'a.main_title',
      'a.title_link',
    ];
    
    for (const selector of titleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        result.titleSelector = selector;
        result.titleLinksCount = elements.length;
        
        Array.from(elements).slice(0, 10).forEach((el, i) => {
          const a = el as HTMLAnchorElement;
          result.titleLinks.push({
            index: i + 1,
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80),
            isBlogPost: /blog\.naver\.com\/[^\/]+\/\d+/.test(a.href),
          });
        });
        break;
      }
    }
    
    return result;
  });
  
  // 결과 출력
  console.log('\n📊 분석 결과:');
  console.log(`총 블로그 링크: ${debug.totalBlogLinks}개`);
  console.log(`포스트 패턴 링크: ${debug.postLinksCount}개`);
  console.log(`제목 셀렉터: ${debug.titleSelector || '없음'}`);
  console.log(`제목 링크: ${debug.titleLinksCount || 0}개`);
  
  console.log('\n\n📝 모든 블로그 링크 (처음 20개):');
  console.log('-'.repeat(50));
  debug.allBlogLinks.forEach((link: any) => {
    const mark = link.isPostPattern ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
    console.log(`   클래스: ${link.className}`);
  });
  
  console.log('\n\n🎯 포스트 패턴 링크:');
  console.log('-'.repeat(50));
  debug.postLinks.forEach((link: any) => {
    console.log(`${link.index}. ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  console.log('\n\n🏷️ 제목 링크:');
  console.log('-'.repeat(50));
  debug.titleLinks.forEach((link: any) => {
    const mark = link.isBlogPost ? '✅' : '❌';
    console.log(`${link.index}. ${mark} ${link.href.substring(0, 70)}`);
    console.log(`   텍스트: ${link.text.substring(0, 50)}`);
  });
  
  await browser.close();
  
  console.log('\n\n' + '='.repeat(60));
  console.log('분석 완료!');
  console.log('='.repeat(60));
}

debugExtraction().catch(console.error);

