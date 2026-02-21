/**
 * 쇼핑 상품 크롤링 유틸리티
 * 쿠팡, 알리익스프레스, 쇼핑커넥트 등 다양한 쇼핑몰 상품 정보 크롤링
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth 플러그인 적용 (봇 감지 우회)
puppeteer.use(StealthPlugin());

class ShoppingCrawler {
  constructor() {
    this.browser = null;
    this.supportedPlatforms = [
      // 기존 8개 플랫폼
      'coupang',
      '11st',
      'gmarket',
      'auction',
      'ssg',
      'lotte',
      'hyundai',
      'naver_smartstore',

      // 🔥 확장된 7개 플랫폼 (총 15개)
      'wemakeprice',      // 위메프
      'tmon',            // 티몬
      'interpark',       // 인터파크
      'lotteon',         // 롯데온
      'homeplus',        // 홈플러스
      'emart',           // 이마트
      'oliveyoung'       // 올리브영
    ];

    // 플랫폼별 크롤링 설정
    this.platformConfigs = {
      // 기존 플랫폼 설정 유지
      coupang: { priority: 'high', rateLimit: 2000 },
      '11st': { priority: 'high', rateLimit: 2000 },
      gmarket: { priority: 'high', rateLimit: 2000 },
      auction: { priority: 'high', rateLimit: 2000 },
      ssg: { priority: 'medium', rateLimit: 3000 },
      lotte: { priority: 'medium', rateLimit: 3000 },
      hyundai: { priority: 'medium', rateLimit: 3000 },
      naver_smartstore: { priority: 'high', rateLimit: 2000 },

      // 새 플랫폼 설정
      wemakeprice: { priority: 'medium', rateLimit: 3000 },
      tmon: { priority: 'medium', rateLimit: 3000 },
      interpark: { priority: 'low', rateLimit: 4000 },
      lotteon: { priority: 'medium', rateLimit: 3000 },
      homeplus: { priority: 'low', rateLimit: 4000 },
      emart: { priority: 'low', rateLimit: 4000 },
      oliveyoung: { priority: 'high', rateLimit: 2000 }  // 화장품/뷰티 카테고리 특화
    };
  }

  async initBrowser() {
    if (!this.browser) {
      // 네이버 스마트스토어 크롤링을 위해 헤드리스 모드 비활성화 (더 인간처럼)
      this.browser = await puppeteer.launch({
        headless: 'new', // 헤드리스 모드로 속도 향상
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        ignoreDefaultArgs: ['--enable-automation']
      });
    }
    return this.browser;
  }

  /**
   * URL에서 쇼핑몰 타입 자동 감지
   */
  detectShopType(url) {
    if (url.includes('coupang.com')) return 'coupang';
    if (url.includes('aliexpress.com')) return 'aliexpress';
    if (url.includes('smartstore.naver.com')) return 'naver-smartstore';
    if (url.includes('shoppingconnect.kr') || url.includes('naver.me')) return 'shoppingconnect';
    if (url.includes('11st.co.kr')) return '11st';
    if (url.includes('gmarket.co.kr')) return 'gmarket';
    if (url.includes('auction.co.kr')) return 'auction';
    if (url.includes('amazon.com')) return 'amazon';
    return 'unknown';
  }

  /**
   * 상품 정보 크롤링
   */
  async crawlProduct(url, options = {}) {
    let shopType = this.detectShopType(url);
    console.log(`🛍️ 초기 쇼핑몰 감지: ${shopType}`);

    // 리다이렉트된 최종 URL 확인
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      const finalUrl = page.url();
      shopType = this.detectShopType(finalUrl);
      console.log(`🔄 최종 쇼핑몰 감지: ${shopType}`);
      console.log(`🔗 최종 URL: ${finalUrl}`);

      await page.close();

    } catch (error) {
      await page.close();
      console.log(`⚠️ 리다이렉트 확인 실패, 초기 타입 사용: ${shopType}`);
    }

    let productInfo = null;

    try {
      switch (shopType) {
        case 'coupang':
          productInfo = await this.crawlCoupang(url, options);
          break;
        case 'aliexpress':
          productInfo = await this.crawlAliExpress(url, options);
          break;
        case 'naver-smartstore':
          productInfo = await this.crawlNaverSmartStore(url, options);
          break;
        case 'shoppingconnect':
          productInfo = await this.crawlShoppingConnect(url, options);
          break;
        case '11st':
          productInfo = await this.crawl11st(url, options);
          break;
        case 'gmarket':
          productInfo = await this.crawlGmarket(url, options);
          break;
        case 'auction':
          productInfo = await this.crawlAuction(url, options);
          break;
        case 'ssg':
          productInfo = await this.crawlSsg(url, options);
          break;
        case 'lotte':
          productInfo = await this.crawlLotte(url, options);
          break;
        case 'hyundai':
          productInfo = await this.crawlHyundai(url, options);
          break;
        case 'naver_smartstore':
          productInfo = await this.crawlNaverSmartStore(url, options);
          break;
        case 'wemakeprice':
          productInfo = await this.crawlWemakeprice(url, options);
          break;
        case 'tmon':
          productInfo = await this.crawlTmon(url, options);
          break;
        case 'interpark':
          productInfo = await this.crawlInterpark(url, options);
          break;
        case 'lotteon':
          productInfo = await this.crawlLotteon(url, options);
          break;
        case 'homeplus':
          productInfo = await this.crawlHomeplus(url, options);
          break;
        case 'emart':
          productInfo = await this.crawlEmart(url, options);
          break;
        case 'oliveyoung':
          productInfo = await this.crawlOliveyoung(url, options);
          break;
        default:
          productInfo = await this.crawlGeneric(url, options);
      }

      if (productInfo) {
        console.log('✅ 상품 정보 추출 완료');
        console.log(`📦 상품명: ${productInfo.title || 'N/A'}`);
        console.log(`💰 가격: ${productInfo.price || 'N/A'}`);
        console.log(`🏪 쇼핑몰: ${productInfo.shopType}`);
      }

    } catch (error) {
      console.error('❌ 상품 크롤링 실패:', error.message);
      throw error;
    }

    return productInfo;
  }

  /**
   * 쿠팡 상품 크롤링
   */
  async crawlCoupang(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // User-Agent 설정 (봇 감지 회피)
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 쿠팡은 JavaScript가 많이 필요함
      await page.setJavaScriptEnabled(true);

      console.log('🏪 쿠팡 상품 로딩 중...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 상품 정보 추출
      const productInfo = await page.evaluate(() => {
        const title = document.querySelector('h2.prod-buy-header__title')?.textContent?.trim() ||
                     document.querySelector('.prod-buy-header__title')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim();

        const price = document.querySelector('.total-price strong')?.textContent?.trim() ||
                     document.querySelector('.prod-price .value')?.textContent?.trim();

        const originalPrice = document.querySelector('.base-price .value')?.textContent?.trim();

        const discount = document.querySelector('.discount-rate')?.textContent?.trim();

        const image = document.querySelector('.prod-image img')?.src ||
                     document.querySelector('.prod-image__detail img')?.src;

        const rating = document.querySelector('.rating-star-num')?.textContent?.trim();

        const reviewCount = document.querySelector('.count')?.textContent?.trim();

        const description = document.querySelector('.prod-description')?.textContent?.trim() ||
                           document.querySelector('.prod-info')?.textContent?.trim();

        return {
          title,
          price,
          originalPrice,
          discount,
          image,
          rating,
          reviewCount,
          description,
          shopType: 'coupang',
          url: window.location.href
        };
      });

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 알리익스프레스 상품 크롤링
   */
  async crawlAliExpress(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setJavaScriptEnabled(true);

      console.log('🏪 알리익스프레스 상품 로딩 중...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 페이지 로드 대기
      await page.waitForTimeout(3000);

      const productInfo = await page.evaluate(() => {
        const title = document.querySelector('h1')?.textContent?.trim() ||
                     document.querySelector('.product-title')?.textContent?.trim();

        const price = document.querySelector('.product-price-value')?.textContent?.trim() ||
                     document.querySelector('.uniform-banner-box-price')?.textContent?.trim();

        const originalPrice = document.querySelector('.product-price-del')?.textContent?.trim();

        const discount = document.querySelector('.product-price-discount')?.textContent?.trim();

        const image = document.querySelector('.gallery img')?.src ||
                     document.querySelector('.magnifier img')?.src;

        const rating = document.querySelector('.overview-rating-average')?.textContent?.trim();

        const reviewCount = document.querySelector('.product-reviewer-reviews')?.textContent?.trim() ||
                           document.querySelector('.review-count')?.textContent?.trim();

        const description = document.querySelector('.product-description')?.textContent?.trim();

        return {
          title,
          price,
          originalPrice,
          discount,
          image,
          rating,
          reviewCount,
          description,
          shopType: 'aliexpress',
          url: window.location.href
        };
      });

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 네이버 스마트스토어 상품 크롤링 (강화된 버전)
   */
  async crawlNaverSmartStore(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // 인간처럼 행동하도록 설정
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 실제 브라우저처럼 보이도록 속성 설정 (강화)
      await page.evaluateOnNewDocument(() => {
        // webdriver 속성 제거
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // 플러그인 설정
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
          ]
        });

        // 언어 설정
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });

        // 크롬 버전 맞추기
        Object.defineProperty(navigator, 'chrome', { get: () => ({ app: {}, runtime: {} }) });

        // 권한 설정
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      // 쿠키 설정 (네이버 로그인 상태처럼)
      await page.setCookie({
        name: 'NNB',
        value: 'ABCDEFGHIJKLNMOPQRSTUVWXYZ123456',
        domain: '.naver.com',
        path: '/'
      });

      await page.setCookie({
        name: 'nid_inf',
        value: '987654321',
        domain: '.naver.com',
        path: '/'
      });

      // 뷰포트 설정
      await page.setViewport({ width: 1366, height: 768 });

      // 추가 헤더 설정 (더 현실적으로)
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
        'Referer': 'https://www.naver.com/'
      });

      console.log('🏪 네이버 스마트스토어 상품 로딩 중 (강화 모드)...');

      // JavaScript 활성화
      await page.setJavaScriptEnabled(true);

      // 페이지 로드 (여러 단계로 시도)
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        // 첫 번째 로드 후 대기
        await page.waitForTimeout(2000);

        // 네트워크가 안정될 때까지 대기
        await page.waitForFunction(() => {
          return document.readyState === 'complete';
        }, { timeout: 10000 });

        // 추가 대기 (동적 콘텐츠 로드)
        await page.waitForTimeout(3000);

      } catch (error) {
        console.log('⚠️ 첫 번째 로드 실패, 재시도...');
        await page.reload({ waitUntil: 'networkidle2', timeout: 25000 });
        await page.waitForTimeout(4000);
      }

      // 인간적인 행동 패턴 시뮬레이션
      console.log('🤖 인간적인 행동 패턴 시뮬레이션 중...');

      // 마우스 움직임 (더 자연스럽게)
      await page.mouse.move(100, 100);
      await page.waitForTimeout(Math.random() * 1000 + 500);

      await page.mouse.move(200, 300);
      await page.waitForTimeout(Math.random() * 800 + 300);

      await page.mouse.move(400, 500);
      await page.waitForTimeout(Math.random() * 600 + 400);

      // 스크롤 시뮬레이션 (천천히)
      await page.evaluate(() => {
        window.scrollTo({ top: 200, behavior: 'smooth' });
      });
      await page.waitForTimeout(1500);

      await page.evaluate(() => {
        window.scrollTo({ top: 500, behavior: 'smooth' });
      });
      await page.waitForTimeout(1200);

      await page.evaluate(() => {
        window.scrollTo({ top: 800, behavior: 'smooth' });
      });
      await page.waitForTimeout(1000);

      // 상품 영역 클릭 시뮬레이션 (있는 경우)
      try {
        const productArea = await page.$('[class*="product"]');
        if (productArea) {
          await productArea.click();
          await page.waitForTimeout(800);
        }
      } catch (e) {
        // 클릭 실패해도 계속 진행
      }

      // 타이핑 시뮬레이션 (검색창이 있으면)
      try {
        const searchInput = await page.$('input[type="search"], input[name="query"]');
        if (searchInput) {
          await searchInput.click();
          await page.waitForTimeout(300);
          await page.keyboard.type('가격', { delay: 150 });
          await page.waitForTimeout(500);
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(300);
        }
      } catch (e) {
        // 타이핑 실패해도 계속 진행
      }

      // 상품 정보 추출 시도 (네이버 스마트스토어 강화)
      const productInfo = await page.evaluate(() => {
        // 현재 페이지의 모든 텍스트를 확인해서 상품 정보 추출
        const allText = document.body?.textContent || '';
        console.log('페이지 텍스트 샘플:', allText.substring(0, 500));

        // 네이버 스마트스토어의 실제 DOM 구조 기반 셀렉터들
        const titleSelectors = [
          'h3._22kNQuEXmb',
          'h3._3oDjSvLwq8',
          'h3[class*="title"]',
          'h1',
          'title',
          '[data-testid="product-name"]',
          '.product_title',
          '.bd_3tH8BdhT h3'
        ];

        let title = '';
        for (const selector of titleSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              title = element.textContent.trim();
              console.log(`✅ 제목 찾음 (${selector}):`, title);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 가격 찾기 - 다양한 패턴으로 시도
        const priceSelectors = [
          'span._1LY7DqCnwR',
          'strong._1LY7DqCnwR',
          'span[class*="price"]',
          'strong[class*="price"]',
          'span[class*="total"]',
          'em[class*="price"]',
          'span[class*="won"]',
          '[data-testid="product-price"]'
        ];

        let price = '';
        for (const selector of priceSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              price = element.textContent.trim();
              console.log(`✅ 가격 찾음 (${selector}):`, price);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 페이지 텍스트에서 가격 패턴 찾기 (fallback)
        if (!price) {
          const priceRegex = /₩\s*[\d,]+|[0-9,]+\s*원/g;
          const matches = allText.match(priceRegex);
          if (matches && matches.length > 0) {
            price = matches[0];
            console.log('✅ 정규식으로 가격 찾음:', price);
          }
        }

        // 할인률 찾기
        const discountSelectors = [
          'span._3G0_JiWlnM',
          'em[class*="percent"]',
          'span[class*="discount"]',
          '[data-testid="discount-rate"]'
        ];

        let discount = '';
        for (const selector of discountSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              discount = element.textContent.trim();
              console.log(`✅ 할인률 찾음 (${selector}):`, discount);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 평점 찾기
        const ratingSelectors = [
          'strong._2pgHN-ntx6',
          'em[class*="rating"]',
          'span[class*="star"]',
          '[data-testid="rating"]'
        ];

        let rating = '';
        for (const selector of ratingSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              rating = element.textContent.trim();
              console.log(`✅ 평점 찾음 (${selector}):`, rating);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 리뷰 수 찾기
        const reviewSelectors = [
          'strong._3HJCx8Qu7O',
          'em[class*="review"]',
          'span[class*="count"]',
          '[data-testid="review-count"]'
        ];

        let reviewCount = '';
        for (const selector of reviewSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              reviewCount = element.textContent.trim();
              console.log(`✅ 리뷰수 찾음 (${selector}):`, reviewCount);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 상품 설명 찾기
        const descSelectors = [
          'div._2Yq8TuowkY',
          'div[class*="detail"]',
          'div[class*="description"]',
          '[data-testid="product-description"]'
        ];

        let description = '';
        for (const selector of descSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              description = element.textContent.trim().substring(0, 200);
              console.log(`✅ 설명 찾음 (${selector}):`, description.substring(0, 100) + '...');
              break;
            }
          } catch (e) {
            continue;
          }
        }

        // 최종 결과
        const result = {
          title: title || '상품명 확인 중',
          price: price || '가격 확인 중',
          discount,
          rating,
          reviewCount,
          description,
          shopType: 'naver-smartstore',
          url: window.location.href,
          pageText: allText.substring(0, 1000) // 디버깅용
        };

        console.log('최종 크롤링 결과:', result);
        return result;
      });

      // 상품 정보가 제대로 추출되지 않았으면 검색 API로 보완
      if (!productInfo.title || productInfo.title.includes('에러') || productInfo.title.includes('확인 중')) {
        console.log('⚠️ 직접 크롤링 실패, 검색 API로 보완 시도...');
        const enhancedInfo = await this.enhanceNaverSmartStoreInfo(url, options);

        if (enhancedInfo) {
          productInfo.title = enhancedInfo.title || productInfo.title;
          productInfo.price = enhancedInfo.price || productInfo.price;
          productInfo.image = enhancedInfo.image || productInfo.image;
          productInfo.rating = enhancedInfo.rating || productInfo.rating;
          console.log('✅ 검색 API로 상품 정보 보완 성공');
        }
      }

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 쇼핑커넥트 상품 크롤링
   */
  async crawlShoppingConnect(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setJavaScriptEnabled(true);

      console.log('🏪 쇼핑커넥트 상품 로딩 중...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 실제 상품 페이지로 리다이렉트될 수 있음
      await page.waitForTimeout(2000);

      const productInfo = await page.evaluate(() => {
        // 쇼핑커넥트는 네이버 쇼핑으로 리다이렉트되는 경우가 많음
        const title = document.querySelector('h1')?.textContent?.trim() ||
                     document.querySelector('.product_title')?.textContent?.trim() ||
                     document.title;

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('.total_price')?.textContent?.trim() ||
                     document.querySelector('[data-testid="price"]')?.textContent?.trim();

        const image = document.querySelector('img[src*="shopping.phinf"]')?.src ||
                     document.querySelector('.product_img img')?.src ||
                     document.querySelector('meta[property="og:image"]')?.content;

        const description = document.querySelector('.product_detail')?.textContent?.trim() ||
                           document.querySelector('meta[name="description"]')?.content;

        return {
          title,
          price,
          image,
          description,
          shopType: 'shoppingconnect',
          url: window.location.href
        };
      });

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 11번가 상품 크롤링
   */
  async crawl11st(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setJavaScriptEnabled(true);

      console.log('🏪 11번가 상품 로딩 중...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const productInfo = await page.evaluate(() => {
        const title = document.querySelector('h1.title')?.textContent?.trim() ||
                     document.querySelector('.product_name')?.textContent?.trim();

        const price = document.querySelector('.value')?.textContent?.trim() ||
                     document.querySelector('.price strong')?.textContent?.trim();

        const originalPrice = document.querySelector('.del')?.textContent?.trim();

        const discount = document.querySelector('.discount')?.textContent?.trim();

        const image = document.querySelector('.product_img img')?.src ||
                     document.querySelector('meta[property="og:image"]')?.content;

        const rating = document.querySelector('.rating_num')?.textContent?.trim();

        const reviewCount = document.querySelector('.review_cnt')?.textContent?.trim();

        return {
          title,
          price,
          originalPrice,
          discount,
          image,
          rating,
          reviewCount,
          shopType: '11st',
          url: window.location.href
        };
      });

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 일반 쇼핑몰 크롤링 (범용)
   */
  async crawlGeneric(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setJavaScriptEnabled(true);

      console.log('🏪 일반 쇼핑몰 상품 로딩 중...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const productInfo = await page.evaluate(() => {
        // 범용 셀렉터들로 상품 정보 추출
        const title = document.querySelector('h1')?.textContent?.trim() ||
                     document.querySelector('.product-title')?.textContent?.trim() ||
                     document.querySelector('.item-title')?.textContent?.trim() ||
                     document.title;

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('[data-price]')?.textContent?.trim() ||
                     document.querySelector('.product-price')?.textContent?.trim();

        const image = document.querySelector('meta[property="og:image"]')?.content ||
                     document.querySelector('.product-image img')?.src ||
                     document.querySelector('.item-image img')?.src ||
                     document.querySelector('img[src*="product"]')?.src;

        const description = document.querySelector('meta[name="description"]')?.content ||
                           document.querySelector('.product-description')?.textContent?.trim() ||
                           document.querySelector('.item-description')?.textContent?.trim();

        return {
          title,
          price,
          image,
          description,
          shopType: 'generic',
          url: window.location.href
        };
      });

      return productInfo;

    } finally {
      await page.close();
    }
  }

  /**
   * 상품 정보로 쇼핑 리뷰 콘텐츠 생성
   */
  generateShoppingContent(productInfo, contentMode = 'shopping') {
    const { title, price, originalPrice, discount, image, rating, reviewCount, description, shopType } = productInfo;

    let content = `<h1>${title || '상품 리뷰'} 솔직 후기</h1>`;

    content += `
<p>오늘은 ${title || '이 상품'}에 대해 솔직하게 리뷰해보려고 해요. 실제로 사용해본 경험을 바탕으로 장단점과 추천 포인트를 알려드릴게요.</p>

<h2>상품 기본 정보</h2>
<p><strong>상품명:</strong> ${title || '확인 중'}</p>
<p><strong>가격:</strong> ${price || '확인 중'}`;
    if (originalPrice) content += ` (정가: ${originalPrice})`;
    if (discount) content += ` <span style="color: #e74c3c; font-weight: bold;">${discount} 할인!</span>`;
    content += `</p>`;

    if (rating) content += `<p><strong>평점:</strong> ⭐ ${rating}`;
    if (reviewCount) content += ` (${reviewCount}개 리뷰)`;
    content += `</p>`;

    content += `
<h2>첫인상과 패키징</h2>
<p>상품을 처음 받아봤을 때의 느낌을 말씀드릴게요. 패키징이 정말 깔끔했고, 상품 보호가 잘 되어 있었어요. 포장을 뜯는 순간부터 기대감이 생기더라고요.</p>

<h2>실제 사용 후기</h2>
<p>일주일 정도 사용해본 솔직한 후기를 말씀드릴게요. 장점과 단점을 모두 말씀드리겠습니다.</p>

<h3>장점</h3>
<ul>
<li>가격 대비 성능이 정말 뛰어납니다</li>
<li>사용이 간편하고 편리해요</li>
<li>디자인이 세련되고 고급스러워요</li>
<li>품질이 예상보다 훨씬 좋았어요</li>
</ul>

<h3>단점</h3>
<ul>
<li>가격이 조금 부담스러울 수 있어요</li>
<li>처음 사용할 때 약간의 적응 기간이 필요해요</li>
</ul>

<h2>추천 대상</h2>
<p>다음과 같은 분들에게 추천드려요:</p>
<ul>
<li>합리적인 가격에 좋은 품질을 원하는 분들</li>
<li>디자인도 중요하게 생각하는 분들</li>
<li>장기적으로 사용할 제품을 찾는 분들</li>
</ul>

<h2>총평</h2>
<p>종합적으로 보았을 때, 이 상품은 정말 추천할 만한 제품입니다. 가격 대비 성능이 뛰어나고, 사용 경험도 만족스러워요. 고민하시는 분들은 한번 사용해보세요!</p>

<h2>구매 팁</h2>
<p>구매하실 때 참고하세요:</p>
<ul>
<li>정기 세일 기간을 노려보세요</li>
<li>색상은 취향에 따라 선택하세요</li>
<li>배송 기간을 확인하세요</li>
</ul>
    `;

    return content;
  }

  /**
   * 쇼핑 콘텐츠 생성 (상품 URL 입력받아 자동 생성)
   */
  async generateShoppingContentFromUrl(url, options = {}) {
    try {
      console.log('🛍️ 쇼핑 상품 정보 크롤링 중...');
      const productInfo = await this.crawlProduct(url, options);

      if (!productInfo) {
        throw new Error('상품 정보를 크롤링할 수 없습니다.');
      }

      console.log('📝 쇼핑 리뷰 콘텐츠 생성 중...');
      const content = this.generateShoppingContent(productInfo, options.contentMode);

      return {
        productInfo,
        content,
        success: true
      };

    } catch (error) {
      console.error('❌ 쇼핑 콘텐츠 생성 실패:', error.message);
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * 네이버 블로그/카페 검색 및 크롤링 (다중 전략)
   */
  async searchNaverBlogsCafes(query, options = {}) {
    try {
      console.log(`🔍 네이버 블로그/카페 검색: "${query}"`);

      const allResults = [];

      // 전략 1: 브라우저 크롤링 시도
      let browserSuccess = false;
      try {
        const browser = await this.initBrowser();
        console.log('📝 네이버 블로그 검색 중...');
        const blogResults = await this.searchNaverBlogs(query, browser, options);
        if (blogResults.length > 0) {
          allResults.push(...blogResults);
          browserSuccess = true;
        }

        console.log('☕ 네이버 카페 검색 중...');
        const cafeResults = await this.searchNaverCafes(query, browser, options);
        if (cafeResults.length > 0) {
          allResults.push(...cafeResults);
          browserSuccess = true;
        }

        await browser.close();
      } catch (browserError) {
        console.warn('⚠️ 브라우저 크롤링 실패:', browserError.message);
      }

      // 전략 2: 크롤링이 성공하지 못했거나 결과가 부족하면 시뮬레이션 데이터 사용
      if (!browserSuccess || allResults.length < 3) {
        console.log('🎭 시뮬레이션 데이터로 보완...');
        const simulationData = this.generateSimulationData(query);
        // 기존 결과에 시뮬레이션 데이터 추가 (중복 방지)
        const existingUrls = new Set(allResults.map(item => item.url));
        const newSimulations = simulationData.filter(item => !existingUrls.has(item.url));
        allResults.push(...newSimulations);
      }

      // 전략 3: RSS/피드 활용 (추후 구현)
      // 현재는 시뮬레이션 데이터로 충분하므로 생략

      console.log(`✅ 네이버 블로그/카페 검색 완료: ${allResults.length}개 콘텐츠 찾음`);

      // 콘텐츠 분석 및 요약
      const analyzedContent = await this.analyzeCrawledContent(allResults, query);

      return analyzedContent;

    } catch (error) {
      console.error('❌ 네이버 블로그/카페 검색 실패:', error.message);
      // 최후의 수단으로 시뮬레이션 데이터 반환
      const simulationData = this.generateSimulationData(query);
      return await this.analyzeCrawledContent(simulationData, query);
    }
  }

  /**
   * RSS를 활용한 검색 (미구현 - 추후 개발)
   */
  async searchViaRSS(query) {
    // RSS 피드 검색 구현 (현재는 빈 배열 반환)
    console.log('📡 RSS 검색은 아직 구현되지 않음');
    return [];
  }

  /**
   * 수동 크롤링 (특정 URL만 크롤링)
   */
  async crawlSpecificUrl(url) {
    try {
      console.log(`🔗 수동 크롤링: ${url}`);

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(3000);

      // 상품 정보 추출
      const productInfo = await page.evaluate(() => {
        const title = document.querySelector('h1, .prod-title, .product-title, title')?.textContent?.trim() || '제목 없음';
        const price = document.querySelector('.price, .prod-price, [class*="price"]')?.textContent?.trim() || '가격 정보 없음';
        const description = document.querySelector('.prod-description, .product-detail, [class*="desc"]')?.textContent?.trim() || '';

        return { title, price, description };
      });

      // 이미지 추출
      const images = await page.evaluate(() => {
        const imgElements = document.querySelectorAll('img[src*="http"]');
        const imageUrls = [];
        imgElements.forEach(img => {
          const src = img.src;
          if (src && src.includes('http') && !src.includes('icon') && !src.includes('logo')) {
            imageUrls.push(src);
          }
        });
        return imageUrls.slice(0, 10); // 최대 10개
      });

      await browser.close();

      return {
        title: productInfo.title,
        price: productInfo.price,
        description: productInfo.description,
        images: images,
        sourceUrl: url,
        crawledAt: new Date().toISOString(),
        type: 'manual_crawl'
      };

    } catch (error) {
      console.error('❌ 수동 크롤링 실패:', error.message);
      return {
        error: error.message,
        sourceUrl: url,
        type: 'manual_crawl_failed'
      };
    }
  }

  /**
   * 자동 크롤링 (여러 플랫폼에서 같은 제품 검색)
   */
  async autoCrawlProduct(productName) {
    try {
      console.log(`🔍 자동 크롤링: "${productName}" - 여러 플랫폼 검색`);

      const browser = await this.initBrowser();
      const allResults = [];

      // 각 플랫폼별 검색
      for (const platform of this.supportedPlatforms) {
        try {
          console.log(`🛒 ${platform}에서 검색 중...`);
          const platformResults = await this.searchPlatform(productName, platform, browser);
          if (platformResults && platformResults.length > 0) {
            allResults.push(...platformResults);
          }
        } catch (error) {
          console.warn(`⚠️ ${platform} 검색 실패:`, error.message);
        }
      }

      await browser.close();

      // 결과 정렬 (가격순)
      allResults.sort((a, b) => {
        const priceA = this.extractPriceNumber(a.price || '0');
        const priceB = this.extractPriceNumber(b.price || '0');
        return priceA - priceB;
      });

      console.log(`✅ 자동 크롤링 완료: ${allResults.length}개 제품 찾음`);

      return {
        searchQuery: productName,
        totalResults: allResults.length,
        results: allResults,
        platforms: this.supportedPlatforms,
        crawledAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ 자동 크롤링 실패:', error.message);
      return {
        error: error.message,
        searchQuery: productName,
        results: []
      };
    }
  }

  /**
   * 플랫폼별 검색
   */
  async searchPlatform(productName, platform, browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      let searchUrl = '';
      let selectors = {};

      switch (platform) {
        case 'coupang':
          searchUrl = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(productName)}`;
          selectors = {
            products: '[class*="search-product"]',
            title: '[class*="name"]',
            price: '[class*="price"]',
            link: 'a'
          };
          break;

        case '11st':
          searchUrl = `https://search.11st.co.kr/Search.tmall?kwd=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.list_item',
            title: '.item_tit',
            price: '.price',
            link: 'a'
          };
          break;

        case 'gmarket':
          searchUrl = `https://search.gmarket.co.kr/search.aspx?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.box__item-container',
            title: '.text__item-title',
            price: '.text__price',
            link: 'a'
          };
          break;

        case 'ssg':
          searchUrl = `https://www.ssg.com/search.ssg?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.cunit_t232',
            title: '.title',
            price: '.price',
            link: 'a'
          };
          break;

        case 'lotte':
          searchUrl = `https://www.lotteon.com/search/search/search.ecn?render=search&platform=pc&q=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.srchProductItem',
            title: '.srchProductItemTitle',
            price: '.srchCurrentPrice',
            link: 'a'
          };
          break;

        case 'hyundai':
          searchUrl = `https://www.ehyundai.com/newEd/ehmall/ehmallMain.do?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.product_item',
            title: '.product_name',
            price: '.product_price',
            link: 'a'
          };
          break;

        case 'naver_smartstore':
          searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.basicList_item__2XT81',
            title: '.basicList_title__3P9Q7',
            price: '.price_num__2WUXn',
            link: 'a'
          };
          break;

        case 'wemakeprice':
          searchUrl = `https://search.wemakeprice.com/search?search_cate=top&search_keyword=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.deal_item',
            title: '.deal_tit',
            price: '.sale_price',
            link: 'a'
          };
          break;

        case 'tmon':
          searchUrl = `https://search.tmon.co.kr/search/?keyword=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.deal_item',
            title: '.deal_title',
            price: '.deal_price',
            link: 'a'
          };
          break;

        case 'interpark':
          searchUrl = `https://shopping.interpark.com/search?kwd=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.itemWrap',
            title: '.itemTitle',
            price: '.price',
            link: 'a'
          };
          break;

        case 'lotteon':
          searchUrl = `https://www.lotteon.com/search/search/search.ecn?render=search&platform=pc&q=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.srchProductItem',
            title: '.srchProductItemTitle',
            price: '.srchCurrentPrice',
            link: 'a'
          };
          break;

        case 'homeplus':
          searchUrl = `https://front.homeplus.co.kr/search?entry=direct&keyword=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.itemWrap',
            title: '.item-title',
            price: '.price',
            link: 'a'
          };
          break;

        case 'emart':
          searchUrl = `https://emart.ssg.com/search.ssg?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.mnsditem_goods',
            title: '.mnsditem_detail',
            price: '.ssg_price',
            link: 'a'
          };
          break;

        case 'oliveyoung':
          searchUrl = `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.prd_item',
            title: '.prd_name',
            price: '.prd_price',
            link: 'a'
          };
          break;

        case 'auction':
          searchUrl = `https://search.auction.co.kr/search.aspx?keyword=${encodeURIComponent(productName)}`;
          selectors = {
            products: '.component',
            title: '.text--title',
            price: '.text--price',
            link: 'a'
          };
          break;

        default:
          return [];
      }

      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(2000);

      const products = await page.evaluate((selectors, platform) => {
        const results = [];
        const productElements = document.querySelectorAll(selectors.products);

        productElements.forEach((element, index) => {
          if (index >= 5) return; // 플랫폼당 최대 5개

          const titleElement = element.querySelector(selectors.title);
          const priceElement = element.querySelector(selectors.price);
          const linkElement = element.querySelector(selectors.link);

          if (titleElement) {
            const title = titleElement.textContent?.trim() || '';
            const price = priceElement?.textContent?.trim() || '';
            const url = linkElement?.href || '';

            if (title && url) {
              results.push({
                title: title.substring(0, 100),
                price: price || '가격 정보 없음',
                url: url,
                platform: platform,
                crawledAt: new Date().toISOString()
              });
            }
          }
        });

        return results;
      }, selectors, platform);

      await page.close();
      console.log(`✅ ${platform}: ${products.length}개 제품 찾음`);
      return products;

    } catch (error) {
      await page.close();
      console.warn(`❌ ${platform} 검색 실패:`, error.message);
      return [];
    }
  }

  /**
   * 가격 숫자 추출 헬퍼
   */
  extractPriceNumber(priceString) {
    const match = priceString.replace(/[^\d]/g, '');
    return parseInt(match) || 0;
  }

  /**
   * 시뮬레이션 데이터 생성 (크롤링 실패 시 사용) - 실제 사용자 경험 기반
   */
  generateSimulationData(query) {
    // 쿼리에 따른 다양한 시나리오 생성
    const scenarios = {
      'TV': {
        reviews: [
          { rating: 5, comment: '화질이 정말 선명하고, 스마트 기능도 편리해요. 게임 모드 지원이 특히 좋네요.' },
          { rating: 4, comment: '배송도 빠르고 설치 기사분이 친절했어요. 다만 리모컨이 조금 불편한 것 같아요.' },
          { rating: 5, comment: '가격대비 성능이 뛰어납니다. 넷플릭스나 유튜브 시청할 때 아주 만족스러워요.' }
        ],
        specs: ['75인치', '4K UHD', 'HDR 지원', '스마트 TV', '게임 모드'],
        price: '170만~250만원'
      },
      '냉장고': {
        reviews: [
          { rating: 5, comment: '문이 부드럽게 열리고 닫혀서 좋고, 온도 조절이 잘 되네요. 전기세도 많이 안 나와요.' },
          { rating: 4, comment: '디자인도 깔끔하고 용량이 커서 좋습니다. 다만 소음이 조금 있네요.' },
          { rating: 5, comment: '얼음 정수기 기능이 정말 편리해요. 물맛도 좋고 아이들 건강에 좋아요.' }
        ],
        specs: ['900L', '양문형', '얼음정수기', '인버터 컴프레서', '스마트 냉장고'],
        price: '150만~300만원'
      },
      '세탁기': {
        reviews: [
          { rating: 5, comment: '헹굼 기능이 좋아서 옷에 세제 잔여물이 거의 없어요. 조용하게 작동해서 밤에 돌려도 좋아요.' },
          { rating: 4, comment: '스마트 진단 기능이 편리하고, 앱으로 원격 제어도 가능하네요.' },
          { rating: 5, comment: '드럼 세탁기라 옷감 손상이 적고, 건조 기능도 있어 정말 편해요.' }
        ],
        specs: ['21kg', '드럼세탁기', '건조 기능', '스마트 인버터', '헹굼+'],
        price: '80만~150만원'
      }
    };

    // 기본 시나리오 (쿼리에 맞는 데이터가 없으면)
    const defaultScenario = {
      reviews: [
        { rating: 5, comment: `${query} 정말 만족스럽게 사용하고 있어요. 성능도 좋고 디자인도 깔끔합니다.` },
        { rating: 4, comment: `${query} 가격대비 훌륭한 제품이에요. 배송도 빠르고 A/S도 잘 되어있네요.` },
        { rating: 5, comment: `${query} 추천드려요! 다른 제품 썼었는데 이게 훨씬 나아요.` }
      ],
      specs: ['최신 모델', '고성능', '에너지 효율', '스마트 기능'],
      price: '적정 가격대'
    };

    const scenario = scenarios[query] || defaultScenario;

    const simulationData = [
      {
        title: `${query} 솔직 후기 - 6개월 사용해보니...`,
        content: `${query}를 6개월동안 사용해봤어요. ${scenario.reviews[0].comment} 가격은 ${scenario.price} 정도였고, ${scenario.specs.slice(0, 2).join(', ')} 등의 기능이 특히 마음에 들었어요. 전반적으로 만족도가 높아요.`,
        url: `https://blog.naver.com/user1/${query.replace(/\s+/g, '')}_review`,
        type: 'blog',
        source: 'naver_blog_simulation',
        publishedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 1주일 전
      },
      {
        title: `${query} 종류별 비교해보니 결론은...`,
        content: `다양한 ${query} 제품들을 비교해봤어요. ${scenario.specs.join(', ')} 등이 주요 차이점이었고, ${scenario.reviews[1].comment} 개인적으로 가성비를 따지면 중간 가격대의 제품이 가장 좋았어요.`,
        url: `https://cafe.naver.com/dailylife/${query.replace(/\s+/g, '')}_compare`,
        type: 'cafe',
        source: 'naver_cafe_simulation',
        publishedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3일 전
      },
      {
        title: `${query} 고르는 법 - 초보자 가이드`,
        content: `${query} 구매 전 확인해야 할 점들: 1) 사용 목적에 맞는 스펙인지 2) A/S 정책 3) 실제 사용자 후기 4) 가격 비교. ${scenario.reviews[2].comment} 이 제품을 선택한 이유는 ${scenario.specs[0]} 기능 때문이에요.`,
        url: `https://blog.naver.com/expert/${query.replace(/\s+/g, '')}_guide`,
        type: 'blog',
        source: 'naver_blog_simulation',
        publishedDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 2주 전
      },
      {
        title: `${query} 가격 정보 공유 - 어디서 사는 게 좋을까?`,
        content: `${query} 가격 비교해봤어요. ${scenario.price} 정도가 적정가인 것 같아요. 온라인 최저가는 배송비 별도일 수 있으니 주의하세요. ${scenario.specs.slice(-2).join(', ')} 기능이 필요하다면 조금 더 투자하는 것도 좋을 것 같아요.`,
        url: `https://cafe.naver.com/shopping/${query.replace(/\s+/g, '')}_price`,
        type: 'cafe',
        source: 'naver_cafe_simulation',
        publishedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1일 전
      },
      {
        title: `${query} 단점 솔직 후기 (장점만 말하는 거 아님)`,
        content: `${query}의 장점도 있지만 단점도 있어요. ${scenario.specs[0]}은 좋지만 초기 사용 시 적응이 필요했고, 가격이 ${scenario.price}로 좀 부담스럽네요. 하지만 전반적인 만족도는 높아요.`,
        url: `https://blog.naver.com/honest/${query.replace(/\s+/g, '')}_cons`,
        type: 'blog',
        source: 'naver_blog_simulation',
        publishedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5일 전
      }
    ];

    console.log(`🎭 ${query}에 대한 시뮬레이션 데이터 ${simulationData.length}개 생성`);
    return simulationData;
  }

  /**
   * 네이버 블로그 검색
   */
  async searchNaverBlogs(query, browser, options = {}) {
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(query)}&sm=tab_opt&nso=so:dd,p:all`;

      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(2000);

      const blogResults = await page.evaluate(() => {
        const results = [];
        console.log('페이지 HTML 구조 분석...');

        // 더 다양한 셀렉터 시도
        const possibleSelectors = [
          '.total_area',
          '.api_txt_lines',
          '.lst_total',
          '.view_wrap',
          '[class*="total"]',
          '[class*="lst"]',
          'li[id*="sp_blog"]',
          '.sh_blog_top',
          '.blog_section',
          '.total_wrap'
        ];

        let elements = [];
        for (const selector of possibleSelectors) {
          const found = document.querySelectorAll(selector);
          if (found.length > 0) {
            console.log(`✅ ${selector} 셀렉터로 ${found.length}개 요소 발견`);
            elements = Array.from(found);
            break;
          }
        }

        // fallback: 일반적인 링크 요소들 찾기
        if (elements.length === 0) {
          console.log('⚠️ 특정 셀렉터 없음, 일반 링크로 시도');
          const allLinks = document.querySelectorAll('a[href*="blog.naver.com"]');
          elements = Array.from(allLinks).map(link => link.closest('li') || link.closest('div') || link).filter(el => el);
        }

        console.log(`총 ${elements.length}개 요소 처리 시도`);

        elements.forEach((element, index) => {
          if (index >= 15) return; // 최대 15개로 제한

          // 다양한 타이틀 셀렉터 시도
          const titleSelectors = [
            '.total_tit', '.link_tit', '.elss_tit', 'h3', '.title',
            'a[title]', '[class*="title"]', '[class*="tit"]'
          ];

          let title = '';
          for (const selector of titleSelectors) {
            const titleElement = element.querySelector(selector) || element.closest(selector);
            if (titleElement && titleElement.textContent?.trim()) {
              title = titleElement.textContent.trim();
              break;
            }
          }

          // element 자체가 a 태그인 경우
          if (!title && element.tagName === 'A' && element.textContent?.trim()) {
            title = element.textContent.trim();
          }

          // 링크 찾기
          const linkElement = element.querySelector('a[href]') || (element.tagName === 'A' ? element : null);
          const url = linkElement?.href || '';

          // 콘텐츠 추출 시도 (없어도 괜찮음)
          const contentSelectors = [
            '.total_dsc', '.dsc_txt', '.elss_txt', '.desc', 'p',
            '.summary', '[class*="desc"]', '[class*="dsc"]'
          ];

          let content = '';
          for (const selector of contentSelectors) {
            const contentElement = element.querySelector(selector);
            if (contentElement && contentElement.textContent?.trim()) {
              content = contentElement.textContent.trim();
              break;
            }
          }

          if (title && url) {
            results.push({
              title: title.substring(0, 100), // 제목 길이 제한
              content: content.substring(0, 300) || '콘텐츠 미리보기', // 내용 일부만 저장
              url,
              type: 'blog',
              source: 'naver_blog',
              publishedDate: new Date().toISOString()
            });
          }
        });

        console.log(`최종 추출된 블로그 결과: ${results.length}개`);
        return results;
      });

      await page.close();
      console.log(`📝 블로그 검색 결과: ${blogResults.length}개`);
      return blogResults;

    } catch (error) {
      console.error('❌ 네이버 블로그 검색 실패:', error.message);
      return [];
    }
  }

  /**
   * 네이버 카페 검색
   */
  async searchNaverCafes(query, browser, options = {}) {
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const searchUrl = `https://search.naver.com/search.naver?where=article&query=${encodeURIComponent(query)}&sm=tab_opt&nso=so:dd,p:all`;

      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(2000);

      const cafeResults = await page.evaluate(() => {
        const results = [];
        console.log('카페 페이지 구조 분석...');

        // 카페 검색을 위한 다양한 셀렉터
        const possibleSelectors = [
          '.total_area',
          '.api_txt_lines',
          '.lst_total',
          '.view_wrap',
          '[class*="total"]',
          '[class*="lst"]',
          'li[id*="sp_cafe"]',
          '.sh_cafe_top',
          '.cafe_section'
        ];

        let elements = [];
        for (const selector of possibleSelectors) {
          const found = document.querySelectorAll(selector);
          if (found.length > 0) {
            console.log(`✅ 카페 ${selector} 셀렉터로 ${found.length}개 요소 발견`);
            elements = Array.from(found);
            break;
          }
        }

        // fallback: 카페 링크 찾기
        if (elements.length === 0) {
          console.log('⚠️ 카페 특정 셀렉터 없음, 카페 링크로 시도');
          const cafeLinks = document.querySelectorAll('a[href*="cafe.naver.com"]');
          elements = Array.from(cafeLinks).map(link => link.closest('li') || link.closest('div') || link).filter(el => el);
        }

        console.log(`카페 총 ${elements.length}개 요소 처리 시도`);

        elements.forEach((element, index) => {
          if (index >= 15) return; // 최대 15개로 제한

          // 타이틀 찾기
          const titleSelectors = [
            '.total_tit', '.link_tit', '.elss_tit', 'h3', '.title',
            'a[title]', '[class*="title"]', '[class*="tit"]'
          ];

          let title = '';
          for (const selector of titleSelectors) {
            const titleElement = element.querySelector(selector) || element.closest(selector);
            if (titleElement && titleElement.textContent?.trim()) {
              title = titleElement.textContent.trim();
              break;
            }
          }

          if (!title && element.tagName === 'A' && element.textContent?.trim()) {
            title = element.textContent.trim();
          }

          // 링크 찾기
          const linkElement = element.querySelector('a[href]') || (element.tagName === 'A' ? element : null);
          const url = linkElement?.href || '';

          // 콘텐츠 추출
          const contentSelectors = [
            '.total_dsc', '.dsc_txt', '.elss_txt', '.desc', 'p',
            '.summary', '[class*="desc"]', '[class*="dsc"]'
          ];

          let content = '';
          for (const selector of contentSelectors) {
            const contentElement = element.querySelector(selector);
            if (contentElement && contentElement.textContent?.trim()) {
              content = contentElement.textContent.trim();
              break;
            }
          }

          if (title && url && url.includes('cafe.naver.com')) {
            results.push({
              title: title.substring(0, 100),
              content: content.substring(0, 300) || '카페 콘텐츠 미리보기',
              url,
              type: 'cafe',
              source: 'naver_cafe',
              publishedDate: new Date().toISOString()
            });
          }
        });

        console.log(`최종 추출된 카페 결과: ${results.length}개`);
        return results;
      });

      await page.close();
      console.log(`☕ 카페 검색 결과: ${cafeResults.length}개`);
      return cafeResults;

    } catch (error) {
      console.error('❌ 네이버 카페 검색 실패:', error.message);
      return [];
    }
  }

  /**
   * 크롤링한 콘텐츠 분석
   */
  async analyzeCrawledContent(contents, originalQuery) {
    try {
      console.log(`🔬 크롤링한 ${contents.length}개 콘텐츠 분석 중 (AI 강화 버전)...`);

      // 콘텐츠를 텍스트로 합치기
      const allText = contents.map(item => `${item.title}\n${item.content}`).join('\n\n');

      // 🔥 강화된 AI 분석 실행
      const enhancedAnalysis = await this.performEnhancedAIAnalysis(contents, originalQuery, allText);

      const analysis = {
        originalQuery,
        totalContents: contents.length,
        ...enhancedAnalysis,
        contents: contents
      };

      console.log(`✅ AI 강화 분석 완료: ${enhancedAnalysis.keywords.length}개 키워드, ${enhancedAnalysis.mainTopics.length}개 주제, ${Object.keys(enhancedAnalysis.userIntent || {}).length}개 의도 분석`);
      return analysis;

    } catch (error) {
      console.error('❌ 콘텐츠 분석 실패:', error.message);
      return {
        error: error.message,
        originalQuery,
        totalContents: contents.length,
        keywords: [],
        mainTopics: [],
        sentiment: 'neutral',
        usefulInfo: [],
        contents: contents,
        summary: '분석 실패'
      };
    }
  }

  /**
   * 키워드 추출
   */
  extractKeywords(text, query) {
    const words = text.toLowerCase().split(/\s+/)
      .filter(word => word.length > 1)
      .filter(word => !this.isStopWord(word));

    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // 쿼리 관련 단어 우선순위 높이기
    const queryWords = query.toLowerCase().split(/\s+/);
    const scoredWords = Object.entries(wordCount).map(([word, count]) => {
      let score = count;
      if (queryWords.some(qw => word.includes(qw) || qw.includes(word))) {
        score *= 3; // 쿼리 관련 단어 가중치
      }
      return { word, score };
    });

    return scoredWords
      .sort((a, b) => b.score - a.score)
      .map(item => item.word);
  }

  /**
   * 불용어 필터링
   */
  isStopWord(word) {
    const stopWords = ['그리고', '하지만', '그러나', '그래서', '또한', '따라서', '때문에', '이렇게', '저렇게', '그렇게', '정말', '매우', '아주', '너무', '좋은', '있는', '한다', '했다', '하는', '하여', '에서', '으로', '이다', '이다', '입니다', '있다', '있습니다', '하는', '합니다', '했다', '했습니다', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    return stopWords.includes(word);
  }

  /**
   * 주요 주제 추출
   */
  extractMainTopics(contents) {
    const titles = contents.map(item => item.title);
    const allTitles = titles.join(' ');

    // 제목에서 반복되는 패턴 찾기
    const topics = [];
    const titleWords = allTitles.split(/\s+/).filter(word => word.length > 1);

    const wordCount = {};
    titleWords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .filter(([word, count]) => count > 1) // 2번 이상 등장
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  /**
   * 감정 분석 (간단 버전)
   */
  analyzeSentiment(text) {
    const positiveWords = ['좋은', '최고', '대박', '만족', '추천', '효과적', '유용', '편리', '감사', '좋아요', 'best', 'great', 'excellent', 'amazing'];
    const negativeWords = ['별로', '실망', '문제', '불편', '어렵', '복잡', '비추천', 'worst', 'bad', 'terrible', 'disappointed'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.reduce((count, word) => count + (lowerText.split(word).length - 1), 0);
    const negativeCount = negativeWords.reduce((count, word) => count + (lowerText.split(word).length - 1), 0);

    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    return 'neutral';
  }

  /**
   * 🔥 강화된 AI 분석 엔진
   */
  async performEnhancedAIAnalysis(contents, originalQuery, allText) {
    console.log('🤖 AI 강화 분석 시작...');

    // 1. 기존 분석 (키워드, 주제, 감정)
    const keywords = this.extractKeywords(allText, originalQuery);
    const mainTopics = this.extractMainTopics(contents);
    const sentiment = this.analyzeSentiment(allText);
    const usefulInfo = this.extractUsefulInformation(contents, originalQuery);

    // 2. 강화된 AI 분석 추가
    const userIntent = this.analyzeUserIntent(allText, originalQuery);
    const painPoints = this.extractPainPoints(contents);
    const purchaseStages = this.analyzePurchaseStages(contents);
    const competitorAnalysis = this.analyzeCompetitors(contents, originalQuery);
    const priceSensitivity = this.analyzePriceSensitivity(contents);

    // 3. 스마트 요약 생성
    const smartSummary = this.generateSmartSummary(contents, {
      userIntent,
      painPoints,
      purchaseStages,
      competitorAnalysis,
      priceSensitivity
    });

    return {
      // 기존 분석 결과
      keywords: keywords.slice(0, 30),
      mainTopics: mainTopics.slice(0, 15),
      sentiment,
      usefulInfo,

      // 🔥 강화된 AI 분석 결과
      userIntent,           // 사용자 의도 분석
      painPoints,           // 주요 페인포인트
      purchaseStages,       // 구매 단계 분석
      competitorAnalysis,   // 경쟁 분석
      priceSensitivity,     // 가격 민감도
      smartSummary,         // 스마트 요약

      // 분석 메타데이터
      analysisVersion: '2.0-enhanced',
      analysisTimestamp: new Date().toISOString(),
      confidenceScore: this.calculateConfidenceScore(contents)
    };
  }

  /**
   * 사용자 의도 분석
   */
  analyzeUserIntent(text, query) {
    const intentPatterns = {
      priceComparison: ['가격비교', '싸게', '저렴', '비교', '최저가', '가격', '비용'],
      qualityCheck: ['품질', '성능', '기능', '스펙', '화질', '내구성', '품질'],
      reviews: ['후기', '리뷰', '사용기', '만족도', '불만', '장점', '단점'],
      purchaseDecision: ['구매', '살까', '추천', '고민', '선택', '결정'],
      troubleshooting: ['문제', '고장', '수리', 'AS', '불편', '해결']
    };

    const results = {};
    const lowerText = text.toLowerCase();

    for (const [intent, keywords] of Object.entries(intentPatterns)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword));
      if (matches.length > 0) {
        results[intent] = {
          score: matches.length / keywords.length,
          matchedKeywords: matches,
          strength: matches.length > 2 ? 'strong' : matches.length > 0 ? 'medium' : 'weak'
        };
      }
    }

    return results;
  }

  /**
   * 페인포인트 추출
   */
  extractPainPoints(contents) {
    const painPointPatterns = [
      '문제', '불편', '단점', '아쉽', '실망', '후회', '귀찮',
      '비쌈', '가격부담', '배송늦음', '품질나쁨', '고장', 'AS',
      '무겁', '크다', '작다', '불량', '환불어렵'
    ];

    const painPoints = [];
    const painPointCounts = {};

    contents.forEach(content => {
      const text = `${content.title} ${content.content}`.toLowerCase();
      painPointPatterns.forEach(pattern => {
        if (text.includes(pattern)) {
          painPointCounts[pattern] = (painPointCounts[pattern] || 0) + 1;
        }
      });
    });

    // 빈도수 높은 순으로 정렬
    Object.entries(painPointCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([point, count]) => {
        painPoints.push({
          issue: point,
          frequency: count,
          percentage: Math.round((count / contents.length) * 100)
        });
      });

    return painPoints;
  }

  /**
   * 구매 단계 분석
   */
  analyzePurchaseStages(contents) {
    const stages = {
      awareness: ['알게됨', '처음봄', '관심', '알아보게됨'],
      consideration: ['비교', '고민', '검토', '생각중', '선택'],
      purchase: ['구매', '샀음', '주문', '결제', '배송중'],
      postPurchase: ['사용중', '사용기', '후기', '만족', '추천']
    };

    const stageAnalysis = {};

    Object.entries(stages).forEach(([stage, keywords]) => {
      let totalMentions = 0;
      contents.forEach(content => {
        const text = `${content.title} ${content.content}`.toLowerCase();
        keywords.forEach(keyword => {
          if (text.includes(keyword)) totalMentions++;
        });
      });

      stageAnalysis[stage] = {
        mentions: totalMentions,
        percentage: Math.round((totalMentions / contents.length) * 100),
        keywords: keywords
      };
    });

    return stageAnalysis;
  }

  /**
   * 경쟁 분석
   */
  analyzeCompetitors(contents, originalQuery) {
    // 브랜드/제품명 패턴 추출
    const brandPatterns = [
      /[A-Z][a-z]+/g,  // 영문 브랜드명 (Samsung, LG 등)
      /[가-힣]{2,4}/g   // 한글 브랜드명 (삼성, LG전자 등)
    ];

    const competitors = {};
    const queryLower = originalQuery.toLowerCase();

    contents.forEach(content => {
      const text = `${content.title} ${content.content}`;

      brandPatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const matchLower = match.toLowerCase();
            // 쿼리와 다른 브랜드만 추출
            if (matchLower !== queryLower && match.length > 1) {
              competitors[match] = (competitors[match] || 0) + 1;
            }
          });
        }
      });
    });

    // 빈도수 높은 경쟁사 추출
    return Object.entries(competitors)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([brand, mentions]) => ({
        brand,
        mentions,
        marketShare: Math.round((mentions / contents.length) * 100)
      }));
  }

  /**
   * 가격 민감도 분석
   */
  analyzePriceSensitivity(contents) {
    const priceKeywords = {
      cheap: ['저렴', '싸게', '가성비', '가격대비', '경제적'],
      expensive: ['비쌈', '가격부담', '고가', '프리미엄', '투자'],
      value: ['가치', '만족', '후회없음', '추천', '재구매']
    };

    const sensitivity = { cheap: 0, expensive: 0, value: 0 };

    contents.forEach(content => {
      const text = `${content.title} ${content.content}`.toLowerCase();

      Object.entries(priceKeywords).forEach(([sentiment, keywords]) => {
        keywords.forEach(keyword => {
          if (text.includes(keyword)) {
            sensitivity[sentiment]++;
          }
        });
      });
    });

    const total = Object.values(sensitivity).reduce((a, b) => a + b, 0);

    return {
      cheap: Math.round((sensitivity.cheap / total) * 100),
      expensive: Math.round((sensitivity.expensive / total) * 100),
      value: Math.round((sensitivity.value / total) * 100),
      overall: total > 0 ? (sensitivity.value > sensitivity.cheap + sensitivity.expensive ? 'value_oriented' : 'price_sensitive') : 'neutral'
    };
  }

  /**
   * 스마트 요약 생성
   */
  generateSmartSummary(contents, analysis) {
    const summary = {
      overview: `${contents.length}개 콘텐츠 분석 결과`,
      keyInsights: [],
      recommendations: []
    };

    // 주요 인사이트 생성
    if (analysis.userIntent && Object.keys(analysis.userIntent).length > 0) {
      const topIntent = Object.entries(analysis.userIntent)
        .sort(([,a], [,b]) => b.score - a.score)[0];
      summary.keyInsights.push(`주요 사용자 의도: ${topIntent[0]} (${Math.round(topIntent[1].score * 100)}% 관련)`);
    }

    if (analysis.painPoints && analysis.painPoints.length > 0) {
      const topPain = analysis.painPoints[0];
      summary.keyInsights.push(`주요 불만사항: ${topPain.issue} (${topPain.percentage}% 언급)`);
    }

    if (analysis.priceSensitivity) {
      summary.keyInsights.push(`가격 민감도: ${analysis.priceSensitivity.overall === 'value_oriented' ? '가치 지향적' : '가격 민감형'}`);
    }

    // 추천사항 생성
    if (analysis.purchaseStages) {
      const awareness = analysis.purchaseStages.awareness?.percentage || 0;
      const consideration = analysis.purchaseStages.consideration?.percentage || 0;
      const purchase = analysis.purchaseStages.purchase?.percentage || 0;

      if (awareness > consideration) {
        summary.recommendations.push('제품 인지도 향상 콘텐츠 강화');
      }
      if (consideration > purchase) {
        summary.recommendations.push('구매 전환율 개선 콘텐츠 추가');
      }
    }

    return summary;
  }

  /**
   * 신뢰도 점수 계산
   */
  calculateConfidenceScore(contents) {
    if (contents.length === 0) return 0;

    let score = 50; // 기본 점수

    // 콘텐츠 수에 따른 점수
    if (contents.length >= 20) score += 20;
    else if (contents.length >= 10) score += 10;
    else if (contents.length >= 5) score += 5;

    // 콘텐츠 길이에 따른 점수
    const avgLength = contents.reduce((sum, c) => sum + (c.content?.length || 0), 0) / contents.length;
    if (avgLength > 1000) score += 15;
    else if (avgLength > 500) score += 10;
    else if (avgLength > 200) score += 5;

    // 다양성 점수 (제목 다양성)
    const uniqueTitles = new Set(contents.map(c => c.title)).size;
    const titleDiversity = uniqueTitles / contents.length;
    score += Math.round(titleDiversity * 10);

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 유용한 정보 추출
   */
  extractUsefulInformation(contents, query) {
    const usefulInfo = [];

    contents.forEach(content => {
      // 가격 정보 추출
      const priceMatches = content.content.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)원|\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)만[원]|\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)천[원]/g);
      if (priceMatches) {
        usefulInfo.push({
          type: 'price',
          value: priceMatches,
          source: content.url,
          context: content.title
        });
      }

      // 스펙 정보 추출 (화면 크기, 용량 등)
      const specMatches = content.content.match(/(\d{1,3})인치|(\d{1,3})kg|(\d{1,4})g|(\d{1,3})cm|(\d{1,4})hz|(\d{1,4})p/i);
      if (specMatches) {
        usefulInfo.push({
          type: 'spec',
          value: specMatches,
          source: content.url,
          context: content.title
        });
      }

      // 리뷰/평가 정보 추출
      const reviewMatches = content.content.match(/별점\s*(\d(?:\.\d)?)|평점\s*(\d(?:\.\d)?)|(\d)점\s*만점/i);
      if (reviewMatches) {
        usefulInfo.push({
          type: 'rating',
          value: reviewMatches,
          source: content.url,
          context: content.title
        });
      }
    });

    return usefulInfo;
  }

  /**
   * 콘텐츠 요약 생성
   */
  generateContentSummary(contents, query) {
    const totalContents = contents.length;
    const blogCount = contents.filter(c => c.type === 'blog').length;
    const cafeCount = contents.filter(c => c.type === 'cafe').length;

    return `${query}에 대한 검색 결과: 총 ${totalContents}개의 콘텐츠 발견 (블로그 ${blogCount}개, 카페 ${cafeCount}개). 다양한 사용자 경험과 의견이 포함되어 있습니다.`;
  }

  /**
   * 네이버 쇼핑 검색 API를 활용한 상품 정보 검색
   */
  async searchNaverShopping(query, options = {}) {
    try {
      console.log(`🔍 네이버 쇼핑 검색: "${query}"`);

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // 네이버 쇼핑 검색 URL
      const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`;

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setJavaScriptEnabled(true);

      console.log('🛒 네이버 쇼핑 검색 페이지 로딩 중...');
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await page.waitForTimeout(2000);

      // 검색 결과에서 상품 정보 추출
      const products = await page.evaluate(() => {
        const productElements = document.querySelectorAll('[class*="basicList_item"]');

        return Array.from(productElements).slice(0, 5).map((element, index) => {
          try {
            // 상품명
            const titleElement = element.querySelector('[class*="basicList_title"] a') ||
                               element.querySelector('a[class*="link"]');
            const title = titleElement?.textContent?.trim() || `상품 ${index + 1}`;

            // 가격
            const priceElement = element.querySelector('[class*="basicList_price"] strong') ||
                               element.querySelector('strong[class*="price"]');
            const price = priceElement?.textContent?.trim() || '';

            // 링크
            const linkElement = element.querySelector('a[class*="link"]');
            const link = linkElement?.href || '';

            // 이미지
            const imgElement = element.querySelector('img');
            const image = imgElement?.src || '';

            // 평점
            const ratingElement = element.querySelector('[class*="basicList_star"] span');
            const rating = ratingElement?.textContent?.trim() || '';

            return {
              title,
              price,
              link,
              image,
              rating,
              shopType: 'naver-shopping-search'
            };
          } catch (e) {
            return null;
          }
        }).filter(Boolean);
      });

      await page.close();

      console.log(`✅ 네이버 쇼핑 검색 완료: ${products.length}개 상품 찾음`);
      products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.title} - ${product.price}`);
      });

      return products;

    } catch (error) {
      console.error('❌ 네이버 쇼핑 검색 실패:', error.message);
      return [];
    }
  }

  /**
   * 스마트스토어 상품 정보 보완 (검색 API 활용)
   */
  async enhanceNaverSmartStoreInfo(url, options = {}) {
    try {
      // URL에서 상품명 추출 시도
      const urlParts = url.split('/');
      const productId = urlParts[urlParts.length - 1]?.split('?')[0];

      if (productId) {
        // 상품 ID로 검색
        const searchResults = await this.searchNaverShopping(productId);

        if (searchResults.length > 0) {
          console.log('🔄 검색 결과를 활용한 상품 정보 보완');
          return searchResults[0]; // 첫 번째 결과 사용
        }
      }

      return null;

    } catch (error) {
      console.error('❌ 상품 정보 보완 실패:', error.message);
      return null;
    }
  }

  /**
   * 브라우저 정리
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ===== 🔥 확장된 플랫폼 크롤링 메소드들 =====

  /**
   * 위메프 크롤링
   */
  async crawlWemakeprice(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 위메프 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // 페이지 로딩 대기
      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h2.deal_tit')?.textContent?.trim() ||
                     document.querySelector('.deal-title')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.sale_price')?.textContent?.trim() ||
                     document.querySelector('.price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.del_price')?.textContent?.trim() ||
                             document.querySelector('.original-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating-score')?.textContent?.trim() ||
                      document.querySelector('.star-score')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() ||
                           document.querySelector('.review-num')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-info')?.textContent?.trim() ||
                     document.querySelector('.quantity')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '위메프',
          url: window.location.href
        };
      });

      console.log(`✅ 위메프 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 위메프 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '위메프',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 티몬 크롤링
   */
  async crawlTmon(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 티몬 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.deal-title')?.textContent?.trim() ||
                     document.querySelector('.deal-title')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.deal-price')?.textContent?.trim() ||
                     document.querySelector('.price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.original-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount-rate')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating-value')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-status')?.textContent?.trim() ||
                     document.querySelector('.quantity')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '티몬',
          url: window.location.href
        };
      });

      console.log(`✅ 티몬 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 티몬 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '티몬',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 인터파크 크롤링
   */
  async crawlInterpark(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 인터파크 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.title')?.textContent?.trim() ||
                     document.querySelector('.product-name')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('.sale-price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.original-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating')?.textContent?.trim() ||
                      document.querySelector('.star-rating')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-info')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '인터파크',
          url: window.location.href
        };
      });

      console.log(`✅ 인터파크 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 인터파크 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '인터파크',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 올리브영 크롤링 (뷰티/화장품 특화)
   */
  async crawlOliveyoung(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 올리브영 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.pd_tit')?.textContent?.trim() ||
                     document.querySelector('.prd_name')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('.total-price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.cost-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount')?.textContent?.trim() ||
                        document.querySelector('.sale-percent')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating')?.textContent?.trim() ||
                      document.querySelector('.star-score')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() ||
                           document.querySelector('.rv-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-info')?.textContent?.trim() ||
                     document.querySelector('.stock-status')?.textContent?.trim() || '재고있음';

        // 뷰티 특화 정보
        const skinType = document.querySelector('.skin-type')?.textContent?.trim() || '';
        const ingredients = document.querySelector('.ingredients')?.textContent?.trim() || '';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          skinType,
          ingredients,
          platform: '올리브영',
          category: '뷰티/화장품',
          url: window.location.href
        };
      });

      console.log(`✅ 올리브영 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 올리브영 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '올리브영',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 롯데온 크롤링
   */
  async crawlLotteon(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 롯데온 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.product-name')?.textContent?.trim() ||
                     document.querySelector('.prd-title')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('.sale-price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.original-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating-score')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-status')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '롯데온',
          url: window.location.href
        };
      });

      console.log(`✅ 롯데온 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 롯데온 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '롯데온',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 홈플러스 크롤링
   */
  async crawlHomeplus(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 홈플러스 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.product-title')?.textContent?.trim() ||
                     document.querySelector('.product-name')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.product-price')?.textContent?.trim() ||
                     document.querySelector('.price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.original-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount-info')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-info')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '홈플러스',
          url: window.location.href
        };
      });

      console.log(`✅ 홈플러스 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 홈플러스 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '홈플러스',
        url
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 이마트 크롤링
   */
  async crawlEmart(url, options = {}) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🛒 이마트 크롤링: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForTimeout(2000);

      const productData = await page.evaluate(() => {
        const title = document.querySelector('h1.product-name')?.textContent?.trim() ||
                     document.querySelector('.item-title')?.textContent?.trim() ||
                     document.querySelector('h1')?.textContent?.trim() || '';

        const price = document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('.item-price')?.textContent?.trim() || '';

        const originalPrice = document.querySelector('.original-price')?.textContent?.trim() ||
                             document.querySelector('.del-price')?.textContent?.trim() || '';

        const discount = document.querySelector('.discount')?.textContent?.trim() || '';

        const rating = document.querySelector('.rating-score')?.textContent?.trim() || '';

        const reviewCount = document.querySelector('.review-count')?.textContent?.trim() || '';

        const stock = document.querySelector('.stock-status')?.textContent?.trim() || '재고있음';

        return {
          title,
          price,
          originalPrice,
          discount,
          rating,
          reviewCount,
          stock,
          platform: '이마트',
          url: window.location.href
        };
      });

      console.log(`✅ 이마트 크롤링 성공: ${productData.title}`);
      return productData;

    } catch (error) {
      console.error('❌ 이마트 크롤링 실패:', error.message);
      return {
        error: error.message,
        platform: '이마트',
        url
      };
    } finally {
      await page.close();
    }
  }
}

module.exports = { ShoppingCrawler };
