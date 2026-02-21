"use strict";
/**
 * 네이버 접속 제한 우회를 위한 Stealth Browser 설정
 * 실제 브라우저처럼 동작하도록 최적화
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomDelay = randomDelay;
exports.getRandomUserAgent = getRandomUserAgent;
exports.setupStealthPage = setupStealthPage;
exports.loadPageWithStealth = loadPageWithStealth;
exports.createStealthBrowser = createStealthBrowser;
const puppeteer = __importStar(require("puppeteer"));
/**
 * 랜덤 딜레이 (봇 감지 회피)
 */
function randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}
/**
 * 실제 브라우저처럼 보이는 User-Agent 목록
 */
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];
/**
 * 랜덤 User-Agent 선택
 */
function getRandomUserAgent() {
    const index = Math.floor(Math.random() * USER_AGENTS.length);
    return USER_AGENTS[index] || USER_AGENTS[0] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}
/**
 * Stealth 브라우저 설정으로 페이지 구성
 */
async function setupStealthPage(page) {
    // 1. User-Agent 설정
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    // 2. 추가 헤더 설정 (실제 브라우저처럼)
    await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    });
    // 3. JavaScript 실행 활성화
    await page.setJavaScriptEnabled(true);
    // 4. 뷰포트 설정 (일반적인 데스크톱 크기)
    await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
    });
    // 5. WebDriver 감지 방지 스크립트 주입
    await page.evaluateOnNewDocument(() => {
        // webdriver 속성 숨기기
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });
        // Chrome 객체 추가
        window.chrome = {
            runtime: {}
        };
        // Permissions API 모킹
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters));
        // Plugins 모킹
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        // Languages 설정
        Object.defineProperty(navigator, 'languages', {
            get: () => ['ko-KR', 'ko', 'en-US', 'en']
        });
    });
    // 6. 쿠키 설정 (네이버 관련)
    await page.setCookie({
        name: 'NID_AUT',
        value: '',
        domain: '.naver.com',
        path: '/'
    });
}
/**
 * Stealth 브라우저로 페이지 로드 (네이버 접속 제한 우회)
 */
async function loadPageWithStealth(page, url, options = {}) {
    const { waitUntil = 'networkidle2', timeout = 60000, retries = 3 } = options;
    // Stealth 설정 적용
    await setupStealthPage(page);
    // 랜덤 딜레이 (첫 접속 전)
    await randomDelay(2000, 4000);
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[STEALTH] 페이지 로드 시도 ${attempt}/${retries}: ${url}`);
            // 페이지 이동
            await page.goto(url, {
                waitUntil,
                timeout
            });
            // 추가 대기 (JavaScript 실행 대기)
            await page.waitForTimeout(3000 + Math.random() * 2000);
            // 에러 페이지 체크
            const pageTitle = await page.title();
            const pageContent = await page.content();
            if (pageTitle.includes('에러') || pageTitle.includes('오류') ||
                pageContent.includes('접속이 불가합니다') ||
                pageContent.includes('동시에 접속하는 이용자 수가 많')) {
                throw new Error('네이버 접속 제한 감지됨');
            }
            console.log(`[STEALTH] ✅ 페이지 로드 성공: ${url}`);
            return;
        }
        catch (error) {
            lastError = error;
            console.warn(`[STEALTH] ⚠️ 페이지 로드 실패 (시도 ${attempt}/${retries}):`, error?.message || error);
            if (attempt < retries) {
                // 재시도 전 더 긴 딜레이
                const delay = 5000 * attempt + Math.random() * 3000;
                console.log(`[STEALTH] ${delay}ms 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // User-Agent 변경
                const newUserAgent = getRandomUserAgent();
                await page.setUserAgent(newUserAgent);
            }
        }
    }
    throw lastError || new Error('페이지 로드 실패');
}
/**
 * Stealth 브라우저 인스턴스 생성
 */
async function createStealthBrowser(options = {}) {
    const { headless = 'new', args = [] } = options;
    const defaultArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
        '--start-maximized'
    ];
    const browser = await puppeteer.launch({
        headless,
        args: [...defaultArgs, ...args],
        ignoreHTTPSErrors: true
    });
    return browser;
}
