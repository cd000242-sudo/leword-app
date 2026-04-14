/**
 * 🔥 네이버 지식인 황금질문 헌터 v5.0 - 확실히 작동하는 버전!
 * 
 * ✅ v5.0 핵심 개선:
 * 1. 디버그 모드 - 스크린샷 + HTML 저장으로 문제 파악
 * 2. 다중 선택자 - 네이버 구조 변경에도 대응
 * 3. 충분한 대기 시간 - JS 렌더링 완료 보장
 * 4. 상세 로깅 - 어디서 실패하는지 정확히 파악
 * 5. 폴백 메커니즘 - 하나 실패해도 다른 방법으로 시도
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { gradeQuestion, type KinSignals } from './naver-kin-golden-config';

puppeteer.use(StealthPlugin());

// ============================================================
// 🔧 설정
// ============================================================

const DEBUG_MODE = true; // 디버그 모드 ON
const DEBUG_DIR = './debug-screenshots';
const WAIT_TIME = 3000; // 페이지 로딩 대기 (3초)

// 디버그 디렉토리 생성
if (DEBUG_MODE && !fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// ============================================================
// 📋 인터페이스
// ============================================================

export interface GoldenQuestion {
  title: string;
  url: string;
  questionId: string;
  category: string;
  viewCount: number;
  answerCount: number;
  likeCount: number;
  publishedDate: string;
  daysAgo: number;
  hasExternalLinks: boolean;
  externalLinkCount: number;
  linkTypes: string[];
  isAdopted: boolean;
  isExpertOnly: boolean;
  goldenScore: number;
  goldenGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';
  goldenReason: string;
  estimatedDailyTraffic: string;
  trafficPotential: 'very_high' | 'high' | 'medium' | 'low';
  recommendAction: string;
  urgency: '🔥 지금 바로!' | '⏰ 오늘 중' | '📅 이번 주';
  priority: number;
  questionAge: {
    createdAt: string;
    hoursAgo: number;
    freshness: 'just_now' | 'today' | 'this_week' | 'older';
    freshnessScore: number;
  };
  askerInfo: {
    adoptionRate: number;
    isFrequentAdopter: boolean;
    adopterScore: number;
  };
  answerAnalysis: {
    quality: 'none' | 'poor' | 'medium' | 'good' | 'excellent';
    avgLength: number;
    hasDetailedAnswer: boolean;
    weakness: string;
    opportunityScore: number;
  };
  crawledAt: string;
  isRealData: boolean;
}

export interface GoldenHuntResult {
  goldenQuestions: GoldenQuestion[];
  stats: {
    totalCrawled: number;
    goldenFound: number;
    sssCount: number;
    ssCount: number;
    sCount: number;
    avgViewCount: number;
    avgAnswerCount: number;
  };
  categories: string[];
  timestamp: string;
  crawlTime: number;
}

// ============================================================
// 🌐 브라우저 관리
// ============================================================

let browserInstance: Browser | null = null;

// 중앙화된 Chrome 찾기 사용
import { getPuppeteerLaunchOptions } from './chrome-finder';

async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    try { 
      await browserInstance.version(); 
      return browserInstance; 
    } catch { 
      browserInstance = null; 
    }
  }
  
  console.log('[BROWSER] 🌐 브라우저 시작...');
  
  const launchOptions = getPuppeteerLaunchOptions({
    headless: 'new',
    args: ['--lang=ko-KR']
  });
  
  browserInstance = await puppeteer.launch({
    ...launchOptions,
    defaultViewport: { width: 1920, height: 1080 }
  }) as Browser;
  
  console.log('[BROWSER] ✅ 브라우저 시작 완료!');
  return browserInstance;
}

async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  // 이미지는 로드하되, 폰트/미디어만 차단 (디버깅 위해)
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
  }
}

// ============================================================
// 🔍 디버그 헬퍼
// ============================================================

async function debugSaveScreenshot(page: Page, name: string): Promise<void> {
  if (!DEBUG_MODE) return;
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = path.join(DEBUG_DIR, `${name}-${timestamp}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[DEBUG] 📸 스크린샷 저장: ${filepath}`);
  } catch (err) {
    console.log(`[DEBUG] ⚠️ 스크린샷 실패`);
  }
}

async function debugSaveHtml(page: Page, name: string): Promise<void> {
  if (!DEBUG_MODE) return;
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = path.join(DEBUG_DIR, `${name}-${timestamp}.html`);
    const html = await page.content();
    fs.writeFileSync(filepath, html, 'utf-8');
    console.log(`[DEBUG] 📄 HTML 저장: ${filepath}`);
  } catch (err) {
    console.log(`[DEBUG] ⚠️ HTML 저장 실패`);
  }
}

// ============================================================
// 🎯 다중 선택자 크롤링 (핵심!)
// ============================================================

interface RawQuestion {
  title: string;
  url: string;
  questionId: string;
  viewCount: number;
  answerCount: number;
  category: string;
  hoursAgo: number;
  timeGroup: string;
}

/**
 * 🔥 핵심: 다중 선택자로 질문 목록 추출
 * 네이버가 구조를 바꿔도 여러 패턴으로 시도
 */
async function extractQuestionsFromPage(page: Page, categoryName: string): Promise<RawQuestion[]> {
  console.log(`[EXTRACT] 🔍 질문 추출 시작 (${categoryName})...`);
  
  const questions = await page.evaluate((catName: string) => {
    const results: any[] = [];
    const seenUrls = new Set<string>();
    
    // ═══════════════════════════════════════════
    // 선택자 패턴 1: 테이블 기반
    // 🔥 네이버 지식인 목록 테이블 구조:
    //   Cell 0: 제목
    //   Cell 1: 카테고리  
    //   Cell 2: UP (좋아요 수)
    //   Cell 3: 답변수
    //   Cell 4: 날짜
    //   ※ 조회수는 목록에 없음! 상세 페이지에서만 볼 수 있음
    // ═══════════════════════════════════════════
    // 🔥 필터: 카테고리/메뉴 이름인지 확인 (대폭 강화!)
    const isNavigationTitle = (title: string): boolean => {
      const navPatterns = [
        // 메뉴/네비게이션
        '로그인', 'Q&A', '질문하기', '답변하기', '더보기', '이전', '다음', '페이지', 
        '검색', '공지', '이벤트', '광고', '목록뷰', '카드뷰', '목록뷰선택됨',
        '지식iN', '지식인', '네이버', 'NAVER', '쥬니버Q&A', '고민Q&A',
        // 카테고리 이름
        '교육', '학문', '교육, 학문', 'IT/테크', 'IT', '테크', '엔터테인먼트', '예술',
        '엔터테인먼트, 예술', '사회', '정치', '사회, 정치', '스포츠', '레저', '스포츠, 레저',
        '생활', '문화', '경제', '금융', '건강', '의료', '과학', '기술', '게임', '쇼핑', 
        '여행', '음식', '취미', '직업', '교통', '지역', '플레이스', '지역&플레이스',
        // 서브카테고리
        '컴퓨터, 하드웨어', '소프트웨어', '운영체제(OS)', '운영체제', 'OS', '프로그래밍',
        '웹사이트 제작', '웹사이트', '인터넷', '전화통신', '통신 네트워크', '통신', '네트워크',
        '방송통신', '컴퓨터 자격증', '자격증', '@네이버사용법', '오픈API', '@스마트폰',
        'IT/컴퓨터', '컴퓨터'
      ];
      
      const t = title.trim();
      const tLower = t.toLowerCase().replace(/\s+/g, '');
      
      // 1. 정확히 메뉴 이름과 일치
      if (navPatterns.some(p => tLower === p.toLowerCase().replace(/\s+/g, ''))) return true;
      
      // 2. 너무 짧은 제목 (최소 10자)
      if (t.length < 10) return true;
      
      // 3. 물음표나 질문 형식이 없고 너무 짧은 경우
      if (t.length < 15 && !t.includes('?') && !/[가-힣]{5,}/.test(t)) return true;
      
      // 4. 카테고리 패턴 (쉼표로 구분된 짧은 단어들)
      if (/^[가-힣A-Za-z\/\s,@]+$/.test(t) && t.length < 20 && !t.includes('?')) return true;
      
      return false;
    };
    
    const tryTablePattern = () => {
      // 🔥 메인 콘텐츠 영역의 질문 목록만! (사이드바 제외)
      const mainContent = document.querySelector('#content, .content_area, main, [role="main"]') || document;
      mainContent.querySelectorAll('table.basic tbody tr, #au_board_list tr, .list_basic tbody tr').forEach(row => {
        // 🔥 docId가 있는 링크만! (실제 질문 링크)
        const link = row.querySelector('a[href*="docId="]');
        if (!link) return;
        
        const href = link.getAttribute('href') || '';
        // 🔥 반드시 docId가 있어야 함!
        if (!href.includes('docId=')) return;
        
        const fullUrl = href.startsWith('http') ? href : 'https://kin.naver.com' + href;
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);
        
        const title = link.textContent?.trim() || '';
        // 🔥 강화된 필터: 짧거나 메뉴 이름 제외
        if (!title || title.length < 8 || isNavigationTitle(title)) return;
        
        const rowText = row.textContent || '';
        let likeCount = 0;  // UP 수
        let answerCount = 0;
        let hoursAgo = 999;  // 🔥 날짜 없으면 999 (필터링됨)
        let dateFound = false;
        
        // 🔥 날짜/시간 추출 (우선순위 순서대로!)
        if (rowText.includes('방금')) { hoursAgo = 0; dateFound = true; }
        else if (rowText.includes('분 전')) {
          const m = rowText.match(/(\d+)\s*분/);
          if (m) { hoursAgo = Math.ceil(parseInt(m[1]) / 60); dateFound = true; }
        } else if (rowText.includes('시간 전')) {
          const m = rowText.match(/(\d+)\s*시간/);
          if (m) { hoursAgo = parseInt(m[1]); dateFound = true; }
        } else if (rowText.includes('일 전')) {
          const m = rowText.match(/(\d+)\s*일/);
          if (m) { hoursAgo = parseInt(m[1]) * 24; dateFound = true; }
        }
        
        // 🔥 날짜 형식 (YYYY.MM.DD 또는 YY.MM.DD)
        if (!dateFound) {
          const dateMatch = rowText.match(/(\d{2,4})[\.\-](\d{1,2})[\.\-](\d{1,2})/);
          if (dateMatch) {
            let year = parseInt(dateMatch[1]);
            if (year < 100) year += 2000;
            const posted = new Date(year, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
            const diffMs = Date.now() - posted.getTime();
            if (diffMs > 0) {
              hoursAgo = Math.floor(diffMs / (1000 * 60 * 60));
              dateFound = true;
            }
          }
        }
        
        // 날짜 못 찾으면 기본값 사용 (상세 페이지에서 다시 확인)
        if (!dateFound) hoursAgo = 24;
        
        // 🔥 테이블 셀에서 직접 추출 (정확!)
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          // Cell 2: "UP X" 형식 (좋아요)
          const upCellText = cells[2]?.textContent?.trim() || '';
          const upMatch = upCellText.match(/UP\s*(\d+)/i);
          if (upMatch) {
            likeCount = parseInt(upMatch[1]);
          }
          
          // Cell 3: 답변수 (순수 숫자)
          const answerCellText = cells[3]?.textContent?.trim() || '';
          // 날짜가 아닌 경우만 (날짜는 . 포함)
          if (!answerCellText.includes('.')) {
            const num = parseInt(answerCellText.replace(/[^0-9]/g, ''));
            if (!isNaN(num) && num < 1000) {
              answerCount = num;
            }
          }
        }
        
        // 텍스트에서 백업 추출
        if (likeCount === 0) {
          const upMatch = rowText.match(/UP\s*(\d+)/i);
          if (upMatch) likeCount = parseInt(upMatch[1]);
        }
        
        const docIdMatch = fullUrl.match(/docId=(\d+)/);
        
        results.push({
          title: title.substring(0, 100),
          url: fullUrl,
          questionId: docIdMatch ? docIdMatch[1] : '',
          viewCount: 0,  // 목록에는 조회수 없음!
          answerCount,
          likeCount,  // 좋아요 수 추가
          category: catName,
          hoursAgo,
          source: 'table'
        });
      });
    };
    
    // ═══════════════════════════════════════════
    // 선택자 패턴 2: 리스트 기반 (신버전?)
    // ═══════════════════════════════════════════
    const tryListPattern = () => {
      document.querySelectorAll('.list_type li, .question_list li, .basic_list li').forEach(li => {
        // 🔥 docId가 있는 링크만!
        const link = li.querySelector('a[href*="docId="]');
        if (!link) return;
        
        const href = link.getAttribute('href') || '';
        // 🔥 반드시 docId가 있어야 함!
        if (!href.includes('docId=')) return;
        
        const fullUrl = href.startsWith('http') ? href : 'https://kin.naver.com' + href;
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);
        
        const title = link.textContent?.trim() || '';
        // 🔥 강화된 필터
        if (!title || title.length < 10 || isNavigationTitle(title)) return;
        
        const liText = li.textContent || '';
        
        // 🔥 핵심: 먼저 시간 추출
        let hoursAgo = 24;
        if (liText.includes('방금')) hoursAgo = 0;
        else if (liText.includes('분 전')) {
          const m = liText.match(/(\d+)\s*분/);
          hoursAgo = m ? Math.ceil(parseInt(m[1]) / 60) : 0;
        } else if (liText.includes('시간 전')) {
          const m = liText.match(/(\d+)\s*시간/);
          hoursAgo = m ? parseInt(m[1]) : 1;
        } else if (liText.includes('일 전')) {
          const m = liText.match(/(\d+)\s*일/);
          hoursAgo = m ? parseInt(m[1]) * 24 : 24;
        } else {
          const dateMatch = liText.match(/(\d{2,4})[\.\-](\d{1,2})[\.\-](\d{1,2})/);
          if (dateMatch) {
            let year = parseInt(dateMatch[1]);
            if (year < 100) year += 2000;
            const posted = new Date(year, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
            hoursAgo = Math.max(0, Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60)));
          }
        }
        
        // 🔥 조회수/답변수는 레이블이 있는 경우만!
        let viewCount = 0;
        let answerCount = 0;
        const viewMatch = liText.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
        const answerMatch = liText.match(/답변[수]?\s*[:\s]*(\d+)/);
        if (viewMatch) viewCount = parseInt(viewMatch[1].replace(/,/g, ''));
        if (answerMatch) answerCount = parseInt(answerMatch[1]);
        
        const docIdMatch = fullUrl.match(/docId=(\d+)/);
        
        results.push({
          title: title.substring(0, 100),
          url: fullUrl,
          questionId: docIdMatch ? docIdMatch[1] : '',
          viewCount,
          answerCount,
          category: catName,
          hoursAgo,
          source: 'list'
        });
      });
    };
    
    // ═══════════════════════════════════════════
    // 선택자 패턴 3: 모든 링크에서 추출 (최후의 수단)
    // ═══════════════════════════════════════════
    const tryAllLinksPattern = () => {
      document.querySelectorAll('a[href*="docId="]').forEach(link => {
        const href = link.getAttribute('href') || '';
        // 🔥 반드시 docId가 있어야 함!
        if (!href.includes('docId=')) return;
        
        const fullUrl = href.startsWith('http') ? href : 'https://kin.naver.com' + href;
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);
        
        const title = link.textContent?.trim() || '';
        // 🔥 강화된 필터
        if (!title || title.length < 10 || isNavigationTitle(title)) return;
        
        const parent = link.closest('li, tr, div, article');
        const parentText = parent?.textContent || '';
        
        // 🔥 먼저 시간 추출
        let hoursAgo = 24;
        if (parentText.includes('방금')) hoursAgo = 0;
        else if (parentText.includes('분 전')) {
          const m = parentText.match(/(\d+)\s*분/);
          hoursAgo = m ? Math.ceil(parseInt(m[1]) / 60) : 0;
        } else if (parentText.includes('시간 전')) {
          const m = parentText.match(/(\d+)\s*시간/);
          hoursAgo = m ? parseInt(m[1]) : 1;
        } else if (parentText.includes('일 전')) {
          const m = parentText.match(/(\d+)\s*일/);
          hoursAgo = m ? parseInt(m[1]) * 24 : 24;
        } else {
          const dateMatch = parentText.match(/(\d{2,4})[\.\-](\d{1,2})[\.\-](\d{1,2})/);
          if (dateMatch) {
            let year = parseInt(dateMatch[1]);
            if (year < 100) year += 2000;
            const posted = new Date(year, parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
            hoursAgo = Math.max(0, Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60)));
          }
        }
        
        // 🔥 조회수/답변수는 레이블이 있는 경우만!
        let viewCount = 0;
        let answerCount = 0;
        const viewMatch = parentText.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
        const answerMatch = parentText.match(/답변[수]?\s*[:\s]*(\d+)/);
        if (viewMatch) viewCount = parseInt(viewMatch[1].replace(/,/g, ''));
        if (answerMatch) answerCount = parseInt(answerMatch[1]);
        
        const docIdMatch = fullUrl.match(/docId=(\d+)/);
        
        results.push({
          title: title.substring(0, 100),
          url: fullUrl,
          questionId: docIdMatch ? docIdMatch[1] : '',
          viewCount,
          answerCount,
          category: catName,
          hoursAgo,
          source: 'allLinks'
        });
      });
    };
    
    // 모든 패턴 실행
    tryTablePattern();
    tryListPattern();
    
    // 결과가 없으면 최후의 수단
    if (results.length === 0) {
      tryAllLinksPattern();
    }
    
    return results;
  }, categoryName);
  
  // 시간 그룹 할당
  const questionsWithGroup = questions.map(q => {
    let timeGroup = '12-24h';
    if (q.hoursAgo <= 3) timeGroup = '0-3h';
    else if (q.hoursAgo <= 6) timeGroup = '3-6h';
    else if (q.hoursAgo <= 12) timeGroup = '6-12h';
    else if (q.hoursAgo <= 24) timeGroup = '12-24h';
    else if (q.hoursAgo <= 72) timeGroup = '1-3d';
    else timeGroup = '3-7d';
    
    return { ...q, timeGroup };
  });
  
  console.log(`[EXTRACT] ✅ ${questionsWithGroup.length}개 추출 완료 (${categoryName})`);
  return questionsWithGroup;
}

// ============================================================
// 📊 많이 본 Q&A (메인) - getPopularQnA
// ============================================================

export async function getPopularQnA(): Promise<GoldenHuntResult> {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 [v9.0] 일주일 내 황금 질문 헌팅 (조회수+좋아요+답변수+날짜!)');
  console.log('═'.repeat(60) + '\n');
  
  const browser = await getBrowser();
  const page = await createPage(browser);
  
  const allQuestions: any[] = [];
  const seenUrls = new Set<string>();
  
  // 🔥 인기 카테고리 (더 많이!)
  const categories = [
    { name: 'IT/컴퓨터', dirId: '1' },
    { name: '건강', dirId: '7' },
    { name: '생활', dirId: '8' },
    { name: '쇼핑', dirId: '4' },
    { name: '게임', dirId: '2' },
  ];
  
  try {
    // 🔥 1단계: 네이버 지식인 메인에서 실시간 질문 수집
    console.log('[STEP 1] 📋 실시간 질문 수집 (메인 페이지)...\n');
    
    // 🔥 메인 페이지에서 실시간 질문 크롤링
    const mainUrl = 'https://kin.naver.com/';
    console.log(`[CRAWL] 🔗 지식인 메인 페이지`);
    
    try {
      await page.goto(mainUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));
      
      // 메인 페이지에서 실시간 질문 추출
      const mainQuestions = await page.evaluate(() => {
        const results: any[] = [];
        const seenUrls = new Set<string>();
        
        // 🔥 메인 페이지의 질문 링크들
        document.querySelectorAll('a[href*="docId="]').forEach(link => {
          const href = link.getAttribute('href') || '';
          if (!href.includes('docId=')) return;
          
          const fullUrl = href.startsWith('http') ? href : 'https://kin.naver.com' + href;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);
          
          const title = link.textContent?.trim() || '';
          if (!title || title.length < 10) return;
          
          // 메뉴/카테고리/이벤트 제외
          const badPatterns = [
            '로그인', 'Q&A', '질문하기', '답변하기', '더보기', '카테고리',
            '지식iN CHOiCE', 'CHOiCE', '둘중더', '좋아하는 것은', '이벤트', '투표'
          ];
          if (badPatterns.some(p => title.includes(p))) return;
          
          const docIdMatch = fullUrl.match(/docId=(\d+)/);
          
          results.push({
            title: title.substring(0, 100),
            url: fullUrl,
            questionId: docIdMatch ? docIdMatch[1] : '',
            viewCount: 0,
            answerCount: 0,
            likeCount: 0,
            category: '메인',
            hoursAgo: 24,
            source: 'main'
          });
        });
        
        return results;
      });
      
      mainQuestions.slice(0, 20).forEach(q => {
        if (!seenUrls.has(q.url)) {
          seenUrls.add(q.url);
          allQuestions.push(q);
        }
      });
      
      console.log(`  ✅ 메인 페이지: ${mainQuestions.length}개 발견`);
    } catch (err: any) {
      console.warn(`[KIN] 메인 페이지 크롤 실패 | url=${mainUrl} | error=${err?.message ?? err}`);
    }
    
    // 🔥 카테고리별로도 수집 (보충)
    for (const cat of categories) {
      const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&period=all&sort=date&page=1`;
      console.log(`[CRAWL] 🔗 ${cat.name}`);
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 800));
        
        const questions = await extractQuestionsFromPage(page, cat.name);
        
        questions.slice(0, 5).forEach(q => {
          if (!seenUrls.has(q.url)) {
            seenUrls.add(q.url);
            allQuestions.push({ ...q, category: cat.name });
          }
        });
        
        console.log(`  ✅ ${cat.name}: ${questions.length}개`);
      } catch (err: any) {
        console.warn(`[KIN] 카테고리 크롤 실패 | cat=${cat.name} | url=${url} | error=${err?.message ?? err}`);
      }
    }

    console.log(`\n[STEP 2] 📊 상세 페이지에서 조회수/좋아요/답변수/날짜 크롤링...\n`);
    console.log(`  📋 총 ${allQuestions.length}개 수집됨\n`);
    
    // 🔥 2단계: 상세 페이지에서 조회수/좋아요/답변수/날짜 가져오기 (상위 25개)
    const questionsToDetail = allQuestions.slice(0, 25);
    
    for (let i = 0; i < questionsToDetail.length; i++) {
      const q = questionsToDetail[i];
      console.log(`[DETAIL ${i + 1}/${questionsToDetail.length}] ${q.title.substring(0, 30)}...`);
      
      try {
        await page.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise(r => setTimeout(r, 800));
        
        const detail = await page.evaluate(() => {
          let viewCount = 0;
          let answerCount = 0;
          let likeCount = 0;
          let dateText = '';
          let hoursAgo = 24;
          
          // 🔥 질문 헤더 영역에서만 추출 (더 정확!)
          const questionHeader = document.querySelector('.question_header, .c-heading__content, .endContentsText, #content') as HTMLElement;
          const headerText = questionHeader?.innerText || '';
          const pageText = document.body.innerText || '';
          
          // 조회수
          const viewMatch = pageText.match(/조회[수\s:]*([0-9,]+)/);
          if (viewMatch) viewCount = parseInt(viewMatch[1].replace(/,/g, ''));
          
          // 답변수
          const answerMatch = pageText.match(/답변[수\s:]*(\d+)/);
          if (answerMatch) answerCount = parseInt(answerMatch[1]);
          
          // 좋아요 (공감수)
          const likeMatch = pageText.match(/공감[수\s:]*(\d+)|좋아요[수\s:]*(\d+)|UP\s*(\d+)/i);
          if (likeMatch) likeCount = parseInt(likeMatch[1] || likeMatch[2] || likeMatch[3] || '0');
          
          // 🔥 날짜 추출 - 헤더 영역 우선, 그 다음 전체 페이지
          // 1. 상대적 시간 먼저 확인 (더 정확!)
          if (headerText.includes('방금') || pageText.includes('방금')) { 
            dateText = '방금'; hoursAgo = 0;
          } else if (headerText.includes('분 전') || pageText.includes('분 전')) {
            const m = (headerText + pageText).match(/(\d+)\s*분\s*전/);
            if (m) { dateText = `${m[1]}분 전`; hoursAgo = Math.ceil(parseInt(m[1]) / 60); }
          } else if (headerText.includes('시간 전') || pageText.includes('시간 전')) {
            const m = (headerText + pageText).match(/(\d+)\s*시간\s*전/);
            if (m) { dateText = `${m[1]}시간 전`; hoursAgo = parseInt(m[1]); }
          } else if (headerText.includes('일 전') || pageText.includes('일 전')) {
            const m = (headerText + pageText).match(/(\d+)\s*일\s*전/);
            if (m) { dateText = `${m[1]}일 전`; hoursAgo = parseInt(m[1]) * 24; }
          } else {
            // 2. 작성일 형식 찾기 (헤더에서 우선)
            const dateMatch = headerText.match(/작성일\s*(\d{4})[\.\-](\d{1,2})[\.\-](\d{1,2})/) ||
                              headerText.match(/(\d{4})[\.\-](\d{1,2})[\.\-](\d{1,2})/) ||
                              pageText.match(/작성일\s*(\d{4})[\.\-](\d{1,2})[\.\-](\d{1,2})/);
            if (dateMatch) {
              const year = parseInt(dateMatch[1]);
              const month = parseInt(dateMatch[2]);
              const day = parseInt(dateMatch[3]);
              dateText = `${month}/${day}`;
              const posted = new Date(year, month - 1, day);
              hoursAgo = Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60));
            }
          }
          
          return { viewCount, answerCount, likeCount, dateText, hoursAgo };
        });
        
        q.viewCount = detail.viewCount;
        q.answerCount = detail.answerCount;
        q.likeCount = detail.likeCount;
        q.dateText = detail.dateText;
        q.hoursAgo = detail.hoursAgo;
        
        console.log(`  📊 조회 ${detail.viewCount}, 답변 ${detail.answerCount}, 좋아요 ${detail.likeCount}, 날짜: ${detail.dateText}`);
      } catch (err: any) {
        console.warn(`[KIN] 상세 크롤 실패 | url=${q.url} | title=${q.title?.substring(0, 40)} | error=${err?.message ?? err}`);
      }
    }
    
    console.log(`\n[STEP 3] 🏆 황금 질문 선별...\n`);
    
    // 🔥 일주일 이내 질문 필터 시도
    let weekQuestions = questionsToDetail.filter(q => q.hoursAgo <= 168);
    
    console.log(`  📅 일주일 내 질문: ${weekQuestions.length}개 / 전체 ${questionsToDetail.length}개`);
    
    // 일주일 내 질문이 5개 미만이면 전체 사용 (날짜와 함께 표시)
    if (weekQuestions.length < 5) {
      console.log(`  ⚠️ 일주일 내 질문 부족 → 전체 질문 사용 (날짜 표시)`);
      weekQuestions = questionsToDetail;
    }
    
    // Phase 1: 통합 config 함수로 scoring — 가중치 단일 소스
    const scoredQuestions = weekQuestions.map(q => {
      const signals: KinSignals = {
        viewCount: Number(q.viewCount) || 0,
        answerCount: Number(q.answerCount) || 0,
        hoursAgo: Number(q.hoursAgo) || 999,
        likeCount: Number(q.likeCount) || 0,
        isAdopted: Boolean(q.isAdopted),
      };
      const { score, grade } = gradeQuestion(signals);
      return { ...q, goldScore: score, kinGrade: grade };
    });

    // 점수 높은 순 정렬
    scoredQuestions.sort((a, b) => b.goldScore - a.goldScore);
    
    // 🔥 15개!
    const topQuestions = scoredQuestions.slice(0, 15);
    
    console.log(`[RESULT] ✅ 일주일 내 황금 질문 ${topQuestions.length}개!`);
    topQuestions.forEach((q, i) => {
      console.log(`  ${i + 1}. [${q.dateText}] 조회 ${q.viewCount}, 답변 ${q.answerCount}, 좋아요 ${q.likeCount} | ${q.title.substring(0, 20)}...`);
    });
    
    await page.close();
    
    const goldenQuestions: GoldenQuestion[] = topQuestions.map((q, idx) => {
      // Phase 1: 통합 config가 이미 계산한 score/grade 사용
      const score = (q as any).goldScore ?? 0;
      const grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' = (q as any).kinGrade ?? 'B';
      
      // 🔥 황금 이유 생성
      const timeText = q.hoursAgo <= 1 ? '방금' : 
                       q.hoursAgo <= 6 ? `${q.hoursAgo}시간 전` :
                       q.hoursAgo <= 24 ? '오늘' :
                       q.hoursAgo <= 48 ? '어제' : `${Math.floor(q.hoursAgo / 24)}일 전`;
      
      const answerText = q.answerCount === 0 ? '🔥 답변 없음!' : 
                         q.answerCount === 1 ? '답변 1개' : `답변 ${q.answerCount}개`;
      
      const goldenReason = `👀 조회 ${q.viewCount}회 | ${answerText} | ${timeText}`;
      
      // 🔥 추천 액션
      let recommendAction = '';
      if (q.answerCount === 0 && q.viewCount >= 20) {
        recommendAction = '🔥 지금 바로 답변! 블로그 링크 삽입 최적!';
      } else if (q.answerCount === 0) {
        recommendAction = '💎 답변 기회! 첫 답변자가 되세요!';
      } else if (q.answerCount <= 2) {
        recommendAction = '⚡ 더 좋은 답변으로 노출 기회!';
      } else {
        recommendAction = '📊 경쟁 있음, 퀄리티로 승부!';
      }
      
      // 긴급도
      const urgency = q.answerCount === 0 ? '🔥 지금 바로!' : 
                      q.hoursAgo <= 6 ? '⏰ 오늘 중' : '📅 이번 주';
      
      return {
        title: q.title,
        url: q.url,
        questionId: q.questionId,
        category: q.category,
        viewCount: q.viewCount,
        answerCount: q.answerCount,
        likeCount: q.likeCount || 0,
        publishedDate: q.dateText || timeText,
        daysAgo: Math.floor(q.hoursAgo / 24),
        hasExternalLinks: false,
        externalLinkCount: 0,
        linkTypes: [],
        isAdopted: false,
        isExpertOnly: false,
        goldenScore: score,
        goldenGrade: grade,
        goldenReason,
        estimatedDailyTraffic: q.viewCount >= 50 ? '높음' : q.viewCount >= 20 ? '보통' : '낮음',
        trafficPotential: q.viewCount >= 50 ? 'high' : q.viewCount >= 20 ? 'medium' : 'low',
        recommendAction,
        urgency: urgency as any,
        priority: 100 - idx,
        questionAge: { 
          createdAt: timeText, 
          hoursAgo: q.hoursAgo || 0, 
          freshness: q.hoursAgo <= 6 ? 'just_now' : q.hoursAgo <= 24 ? 'today' : 'this_week',
          freshnessScore: q.hoursAgo <= 6 ? 20 : q.hoursAgo <= 24 ? 15 : 10
        },
        askerInfo: { adoptionRate: 40, isFrequentAdopter: false, adopterScore: 5 },
        answerAnalysis: { 
          quality: q.answerCount === 0 ? 'none' : 'medium',
          avgLength: 0, 
          hasDetailedAnswer: false, 
          weakness: q.answerCount === 0 ? '답변 없음 - 기회!' : '',
          opportunityScore: q.answerCount === 0 ? 30 : 10
        },
        crawledAt: new Date().toISOString(),
        isRealData: true
      };
    });
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    return {
      goldenQuestions,
      stats: {
        totalCrawled: topQuestions.length,
        goldenFound: goldenQuestions.length,
        sssCount: goldenQuestions.filter(q => q.goldenGrade === 'SSS').length,
        ssCount: goldenQuestions.filter(q => q.goldenGrade === 'SS').length,
        sCount: goldenQuestions.filter(q => q.goldenGrade === 'S').length,
        avgViewCount: goldenQuestions.length > 0
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.viewCount, 0) / goldenQuestions.length)
          : 0,
        avgAnswerCount: goldenQuestions.length > 0
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.answerCount, 0) / goldenQuestions.length * 10) / 10
          : 0
      },
      categories: categories.map(c => c.name),
      timestamp: new Date().toISOString(),
      crawlTime
    };

  } catch (error: any) {
    console.error('[ERROR] ❌ 오류:', error.message);
    await page.close();
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  }
}

// ============================================================
// 🔥 급상승 질문 (getRisingQuestions)
// ============================================================

export async function getRisingQuestions(): Promise<GoldenHuntResult> {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('🔥 [v6.0] 급상승 질문 탐지 (고속)');
  console.log('═'.repeat(60));
  console.log('📊 조건: 오늘(24시간 이내) 급상승 중인 질문');
  console.log('═'.repeat(60) + '\n');
  
  const browser = await getBrowser();
  const page = await createPage(browser);
  
  const allQuestions: RawQuestion[] = [];
  const seenUrls = new Set<string>();
  
  // 4개 카테고리만 (빠른 속도)
  const categories = [
    { name: 'IT/컴퓨터', dirId: '1' },
    { name: '게임', dirId: '2' },
    { name: '건강', dirId: '7' },
    { name: '생활', dirId: '8' },
  ];
  
  try {
    // Step 1: 최신순으로 빠르게 수집
    console.log('[STEP 1] 📋 오늘의 질문 수집...\n');
    
    for (const cat of categories) {
      const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=date`;
      console.log(`[CRAWL] 🔗 ${cat.name}`);
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise(r => setTimeout(r, 500));
        
        const questions = await extractQuestionsFromPage(page, cat.name);
        
        // 🔥 24시간 이내만 필터
        let added = 0;
        questions.forEach(q => {
          if (!seenUrls.has(q.url) && q.hoursAgo <= 24) {
            seenUrls.add(q.url);
            allQuestions.push(q);
            added++;
          }
        });
        
        console.log(`  → 24시간 이내: ${added}개`);
        
      } catch (err: any) {
        console.log(`  ❌ 실패`);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\n[STEP 1] ✅ 오늘의 질문 ${allQuestions.length}개!\n`);
    
    if (allQuestions.length === 0) {
      await page.close();
      return {
        goldenQuestions: [],
        stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
        categories: [],
        timestamp: new Date().toISOString(),
        crawlTime: Math.round((Date.now() - startTime) / 1000)
      };
    }
    
    // Step 2: 상세 페이지에서 조회수 확인 (상위 15개)
    console.log('[STEP 2] 🔍 조회수 확인...\n');
    
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    const topN = shuffled.slice(0, 15);
    const withViewCount: any[] = [];
    
    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1920, height: 1080 });
    
    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];
      try {
        await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await new Promise(r => setTimeout(r, 400));
        
        const detail = await detailPage.evaluate(() => {
          const text = document.body.innerText || '';
          let viewCount = 0;
          const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
          if (m) viewCount = parseInt(m[1].replace(/,/g, ''));
          return { viewCount };
        });
        
        // 시간당 조회수 계산 (급상승 점수)
        const hoursAgo = Math.max(q.hoursAgo || 1, 1);
        const viewsPerHour = detail.viewCount / hoursAgo;
        
        withViewCount.push({ 
          ...q, 
          viewCount: detail.viewCount || 0,
          viewsPerHour: Math.round(viewsPerHour)
        });
        
        if ((i + 1) % 5 === 0) console.log(`  📊 ${i + 1}/${topN.length} 완료...`);
      } catch (err) {
        withViewCount.push({ ...q, viewCount: 0, viewsPerHour: 0 });
      }
      await new Promise(r => setTimeout(r, 100));
    }
    
    await detailPage.close();
    await page.close();
    
    // Step 3: 급상승 정렬 (시간당 조회수 높은 순)
    const risingQuestions = withViewCount
      .filter(q => q.viewCount >= 10) // 최소 10 조회
      .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
      .slice(0, 20);
    
    console.log(`\n[STEP 3] 🔥 급상승 ${risingQuestions.length}개!`);
    
    // 결과 포맷팅 — Phase 1 통합 scoring
    const goldenQuestions: GoldenQuestion[] = risingQuestions.map((q, idx) => {
      const signals: KinSignals = {
        viewCount: Number(q.viewCount) || 0,
        answerCount: Number(q.answerCount) || 0,
        hoursAgo: Number(q.hoursAgo) || 999,
        likeCount: 0, // 급상승 탭은 좋아요 미수집
        isAdopted: false,
        viewsPerHour: Number(q.viewsPerHour) || 0,
      };
      const { score, grade } = gradeQuestion(signals);

      let timeText = '방금';
      if (q.hoursAgo > 0 && q.hoursAgo < 24) timeText = `${q.hoursAgo}시간 전`;

      return {
        title: q.title,
        url: q.url,
        questionId: q.questionId || '',
        category: q.category,
        viewCount: q.viewCount,
        answerCount: q.answerCount || 0,
        likeCount: 0,
        publishedDate: timeText,
        daysAgo: 0,
        hasExternalLinks: false,
        externalLinkCount: 0,
        linkTypes: [],
        isAdopted: false,
        isExpertOnly: false,
        goldenScore: score,
        goldenGrade: grade,
        goldenReason: `🔥 ${timeText} | 조회 ${q.viewCount.toLocaleString()} | ${q.viewsPerHour}회/시간`,
        estimatedDailyTraffic: q.viewsPerHour >= 50 ? '🔥 폭발' : '📈 상승',
        trafficPotential: q.viewsPerHour >= 50 ? 'very_high' : 'high',
        recommendAction: `🚀 시간당 ${q.viewsPerHour}회 급상승! 지금 답변!`,
        urgency: '🔥 지금 바로!',
        priority: 100 - idx,
        questionAge: { 
          createdAt: timeText, 
          hoursAgo: q.hoursAgo || 0, 
          freshness: 'today',
          freshnessScore: 30
        },
        askerInfo: { adoptionRate: 40, isFrequentAdopter: false, adopterScore: 5 },
        answerAnalysis: { 
          quality: 'none' as any,
          avgLength: 0, 
          hasDetailedAnswer: false, 
          weakness: '🔥 급상승! 빠른 답변 필요!',
          opportunityScore: 25
        },
        crawledAt: new Date().toISOString(),
        isRealData: true
      };
    });
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ 급상승 질문 탐지 완료!');
    console.log(`  총 수집: ${allQuestions.length}개 | 급상승: ${goldenQuestions.length}개 | ${crawlTime}초`);
    console.log('═'.repeat(60) + '\n');
    
    return {
      goldenQuestions,
      stats: {
        totalCrawled: allQuestions.length,
        goldenFound: goldenQuestions.length,
        sssCount: goldenQuestions.filter(q => q.goldenGrade === 'SSS').length,
        ssCount: goldenQuestions.filter(q => q.goldenGrade === 'SS').length,
        sCount: goldenQuestions.filter(q => q.goldenGrade === 'S').length,
        avgViewCount: goldenQuestions.length > 0 
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.viewCount, 0) / goldenQuestions.length)
          : 0,
        avgAnswerCount: 0
      },
      categories: [...new Set(goldenQuestions.map(q => q.category))],
      timestamp: new Date().toISOString(),
      crawlTime
    };
    
  } catch (error: any) {
    console.error('[ERROR] ❌ 치명적 오류:', error.message);
    await page.close();
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  }
}

// ============================================================
// 💎 숨은 꿀질문 (fullHunt)
// ============================================================

export async function fullHunt(): Promise<GoldenHuntResult> {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('💎 [v6.0] 숨은 꿀질문 탐지 (고속)');
  console.log('═'.repeat(60));
  console.log('📊 최신 질문 중 메인 30위권 밖 숨은 인기글 발굴!');
  console.log('═'.repeat(60) + '\n');
  
  const browser = await getBrowser();
  const page = await createPage(browser);
  
  try {
    // Step 1: 메인 페이지 인기글 수집 (제외 목록)
    console.log('[STEP 1] 📋 메인 "많이 본 Q&A" 수집 (제외 목록)...\n');
    
    const mainPopularUrls = new Set<string>();
    
    console.log('[CRAWL] 🔗 https://kin.naver.com/');
    await page.goto('https://kin.naver.com/', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    await new Promise(r => setTimeout(r, WAIT_TIME));
    
    const mainUrls = await page.evaluate(() => {
      const urls: string[] = [];
      
      const selectors = [
        'a[href*="qna/detail"]',
        '.section_kinup a',
        '.kinup_list a',
        '[class*="popular"] a'
      ];
      
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(link => {
          const href = link.getAttribute('href') || '';
          if (href.includes('qna/detail') || href.includes('docId=')) {
            const fullUrl = href.startsWith('http') ? href : 'https://kin.naver.com' + href;
            urls.push(fullUrl);
          }
        });
      });
      
      return [...new Set(urls)];
    });
    
    mainUrls.forEach(url => mainPopularUrls.add(url));
    console.log(`[STEP 1] 🚫 제외 목록: ${mainPopularUrls.size}개`);
    
    // Step 2: 카테고리별 인기글 수집
    console.log('\n[STEP 2] 📋 카테고리별 숨은 인기글 수집...\n');
    
    // 🔥 카테고리 5개 (빠르게!)
    const categories = [
      { name: 'IT/컴퓨터', dirId: '1' },
      { name: '게임', dirId: '2' },
      { name: '건강', dirId: '7' },
      { name: '생활', dirId: '8' },
      { name: '쇼핑', dirId: '4' },
    ];
    
    const hiddenQuestions: any[] = [];
    
    // 🔥 최신순 + 인기순 (빠르게!)
    for (const cat of categories) {
      for (const sortType of ['date', 'vcount']) {
        const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=${sortType}`;
        
        console.log(`[CRAWL] 🔗 ${cat.name} (${sortType === 'date' ? '최신' : '인기'})`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await new Promise(r => setTimeout(r, 500)); // 빠른 로딩
          
          const questions = await extractQuestionsFromPage(page, cat.name);
          
          let added = 0;
          questions.forEach(q => {
            if (!mainPopularUrls.has(q.url) && !hiddenQuestions.some(h => h.url === q.url)) {
              hiddenQuestions.push(q);
              added++;
            }
          });
          
          console.log(`  → 발견 ${questions.length}개, 숨은 꿀 ${added}개 추가`);
          
        } catch (err: any) {
          console.log(`  ❌ 실패: ${err.message}`);
        }
        
        await new Promise(r => setTimeout(r, 100)); // 초고속
      }
    }
    
    console.log(`\n[STEP 2] ✅ 총 ${hiddenQuestions.length}개 수집!`);
    
    // Step 3: 🔥 조회순 정렬 우선! (점수는 조회수 확인 후 계산)
    console.log('\n[STEP 3] 📊 질문 선별...\n');
    
    // 🔥 랜덤하게 섞어서 다양한 카테고리 질문 선택 (조회수는 상세에서 확인)
    const shuffled = [...hiddenQuestions].sort(() => Math.random() - 0.5);
    const scoredQuestions = shuffled.slice(0, 50);
    
    console.log(`  📊 총 ${hiddenQuestions.length}개 중 ${scoredQuestions.length}개 선별`);
    
    // Step 4: 상위 30개에 대해 상세 페이지에서 실제 조회수 가져오기
    console.log('\n[STEP 4] 🔍 상세 페이지에서 조회수 수집...\n');
    
    const questionsWithViewCount: any[] = [];
    const topN = scoredQuestions.slice(0, 15); // 빠르게 15개
    
    // 🔥 병렬 처리를 위한 새 페이지 생성 (createPage 설정 사용)
    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1920, height: 1080 });
    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];
      
      
      try {
        // 🔥 빠른 로딩 (domcontentloaded + 짧은 대기)
        await detailPage.goto(q.url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 10000 
        });
        await new Promise(r => setTimeout(r, 500)); // 빠른 대기
        
        const detail = await detailPage.evaluate(() => {
          const text = document.body.innerText || '';
          const html = document.body.innerHTML || '';
          
          // 🔥 조회수 추출 - 더 넓은 패턴
          let viewCount = 0;
          const viewPatterns = [
            /조회[수]?\s*[:\s]*([0-9,]+)/,
            /조회\s*([0-9,]+)/,
            /([0-9,]+)\s*조회/,
            /view[s]?\s*[:\s]*([0-9,]+)/i
          ];
          for (const p of viewPatterns) {
            const m = text.match(p);
            if (m) {
              const v = parseInt(m[1].replace(/,/g, ''));
              if (v > viewCount) viewCount = v;
            }
          }
          
          // 좋아요 수
          let likeCount = 0;
          const likeMatch = text.match(/좋아요[:\s]*(\d+)|공감[:\s]*(\d+)|UP\s*(\d+)/i);
          if (likeMatch) likeCount = parseInt(likeMatch[1] || likeMatch[2] || likeMatch[3]);
          
          // 🔥 답변 수 - 정확히 추출
          let answerCount = 0;
          const answerPatterns = [
            /(\d+)개\s*답변/,
            /답변\s*(\d+)/,
            /(\d+)\s*답변/
          ];
          for (const p of answerPatterns) {
            const m = text.match(p);
            if (m) {
              answerCount = parseInt(m[1]);
              break;
            }
          }
          
          // 🔥 채택 여부 확인 - 채택 배지 또는 텍스트
          const isAdopted = 
            html.includes('채택') && (html.includes('채택됨') || html.includes('채택 답변') || html.includes('class="badge_adopted"')) ||
            text.includes('채택됨') || 
            text.includes('지식인의 채택') ||
            document.querySelector('.badge_adopted, .adopted, [class*="adopt"]') !== null;
          
          // 🔥 등록 날짜 추출 (YYYY.MM.DD 형식)
          let publishedDate = '';
          let yearOld = false;
          const datePatterns = [
            /(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/,  // 2015.02.21
            /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/
          ];
          for (const p of datePatterns) {
            const m = text.match(p);
            if (m) {
              const year = parseInt(m[1]);
              const month = parseInt(m[2]);
              const day = parseInt(m[3]);
              publishedDate = `${year}.${String(month).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
              
              // 🔥 1년 이상 지난 질문인지 확인
              const questionDate = new Date(year, month - 1, day);
              const now = new Date();
              const diffDays = Math.floor((now.getTime() - questionDate.getTime()) / (1000 * 60 * 60 * 24));
              yearOld = diffDays > 365;
              break;
            }
          }
          
          return { viewCount, likeCount, answerCount, isAdopted, publishedDate, yearOld };
        });
        
        // 🔥 채택된 질문이나 1년 이상 된 질문은 제외!
        if (detail.isAdopted) {
          console.log(`  ⚠️ 채택됨: ${q.title.substring(0, 30)}...`);
          continue;
        }
        if (detail.yearOld) {
          console.log(`  ⚠️ 오래됨 (${detail.publishedDate}): ${q.title.substring(0, 30)}...`);
          continue;
        }
        
        questionsWithViewCount.push({
          ...q,
          viewCount: detail.viewCount || 0,
          likeCount: detail.likeCount || q.likeCount || 0,
          answerCount: detail.answerCount || q.answerCount || 0,
          isAdopted: detail.isAdopted || false,
          publishedDate: detail.publishedDate || q.publishedDate || '',
          hiddenScore: q.hiddenScore + (detail.viewCount >= 10000 ? 50 : detail.viewCount >= 1000 ? 30 : detail.viewCount >= 100 ? 10 : 0)
        });
        
        
        if ((i + 1) % 5 === 0) {
          console.log(`  📊 ${i + 1}/${topN.length} 완료...`);
        }
        
      } catch (err: any) {
        questionsWithViewCount.push(q);
      }
      
      await new Promise(r => setTimeout(r, 100)); // 빠른 전환
    }
    
    await detailPage.close();
    
    // 🔥 최종 필터링: 조회수 기반 + 실제 질문만
    const navKeywords = ['로그인', 'Q&A', '교육', '학문', 'IT', '테크', '엔터테인먼트', 
      '예술', '사회', '정치', '스포츠', '레저', '생활', '문화', '경제', '금융', 
      '건강', '의료', '게임', '쇼핑', '여행', '지식iN', '네이버', '더보기', '질문하기'];
    
    const isValidQuestion = (q: any) => {
      // 🔥 URL 필터: 실제 질문 페이지만! (docId 필수)
      const url = q.url || '';
      if (!url.includes('docId=')) return false;
      
      // 🔥 숨은 꿀 = 조회수 20 이상 (최신 질문도 포함)
      if (q.viewCount < 20) return false;
      
      // 제목 필터
      const title = q.title || '';
      
      // 너무 짧은 제목 제외
      if (title.length < 12) return false;
      
      // 카테고리/메뉴 이름처럼 보이는 것 제외
      if (navKeywords.some(kw => {
        const t = title.replace(/,\s*$/, '').trim();
        return t === kw || t.endsWith(kw);
      })) return false;
      
      // 콤마로 끝나는 것 제외 (카테고리 리스트)
      if (title.endsWith(',') || title.endsWith(', ')) return false;
      
      // 한글 또는 영문이 최소 8자 이상 있어야 함
      const textContent = title.replace(/[^가-힣a-zA-Z0-9]/g, '');
      if (textContent.length < 8) return false;
      
      return true;
    };
    
    // 유효한 질문만 필터링
    const validQuestions = questionsWithViewCount.filter(isValidQuestion);
    
    // 🔥 조회수 높은 순 정렬 (숨은 인기 질문 우선!)
    validQuestions.sort((a, b) => b.viewCount - a.viewCount);
    
    console.log(`  ✅ 유효 질문: ${validQuestions.length}개`);
    
    await page.close();
    
    const goldenQuestions: GoldenQuestion[] = validQuestions.slice(0, 30).map((q, idx) => {
      // Phase 1: 입력 단계 정규화 (NaN 방어 상향 이동)
      const safeViewCount = Number(q.viewCount) || 0;
      const safeAnswerCount = Number(q.answerCount) || 0;
      const safeLikeCount = Number(q.likeCount) || 0;
      const safeHoursAgo = Number(q.hoursAgo) || 999;

      // 통합 config로 scoring/grading
      const { score: safeScore, grade } = gradeQuestion({
        viewCount: safeViewCount,
        answerCount: safeAnswerCount,
        hoursAgo: safeHoursAgo,
        likeCount: safeLikeCount,
        isAdopted: Boolean(q.isAdopted),
      });
      
      // 🔥 트래픽 표시 (조회수 기반)
      let trafficText = '';
      if (safeViewCount >= 500) trafficText = '🔥 인기';
      else if (safeViewCount >= 200) trafficText = '📈 상승';
      else if (safeViewCount >= 100) trafficText = '💡 주목';
      else trafficText = '💎 발굴';
      
      // 🔥 실제 날짜 표시 (있으면) 또는 트래픽 텍스트
      const displayDate = q.publishedDate && q.publishedDate.includes('.') ? q.publishedDate : trafficText;
      
      // 🔥 추천 메시지 (숨은 인기 질문 기준)
      let reason = '';
      const viewText = `조회 ${safeViewCount.toLocaleString()}`;
      
      // 🔥 채택 여부 및 답변 수에 따른 메시지
      if (q.isAdopted) {
        reason = `⚠️ 채택됨 | ${viewText} | 답변 ${safeAnswerCount}`;
      } else if (safeAnswerCount === 0) {
        if (safeViewCount >= 500) {
          reason = `💎 황금! ${viewText} | 🎯 첫 답변!`;
        } else if (safeViewCount >= 100) {
          reason = `🔥 좋은 기회! ${viewText} | 🎯 첫 답변!`;
        } else {
          reason = `✨ 신규! ${viewText} | 🎯 첫 답변!`;
        }
      } else if (safeAnswerCount <= 3) {
        reason = `📝 경쟁 낮음! ${viewText} | 답변 ${safeAnswerCount}`;
      } else {
        reason = `${viewText} | 답변 ${safeAnswerCount}`;
      }
      
      // 🔥 추천 액션
      let action = '';
      if (q.isAdopted) {
        action = '⚠️ 이미 채택됨 - 다른 질문 추천';
      } else if (safeAnswerCount === 0) {
        action = '🎯 첫 답변 기회! 블로그 링크 포함하세요!';
      } else if (safeLikeCount <= 1) {
        action = '✨ 경쟁 낮음! 좋은 답변으로 채택 노리세요!';
      } else {
        action = '📝 답변 작성으로 노출 확보!';
      }
      
      return {
        title: q.title,
        url: q.url,
        questionId: q.questionId,
        category: q.category,
        viewCount: safeViewCount,
        answerCount: safeAnswerCount,
        likeCount: safeLikeCount,
        publishedDate: displayDate,
        daysAgo: Math.floor(safeHoursAgo / 24),
        hasExternalLinks: false,
        externalLinkCount: 0,
        linkTypes: [],
        isAdopted: q.isAdopted || false,
        isExpertOnly: false,
        goldenScore: safeScore,
        goldenGrade: grade as any,
        goldenReason: reason,
        estimatedDailyTraffic: safeViewCount >= 200 ? '높음' : safeViewCount >= 50 ? '보통' : '성장중',
        trafficPotential: safeViewCount >= 200 ? 'high' : safeViewCount >= 50 ? 'medium' : 'low',
        recommendAction: action,
        urgency: safeHoursAgo <= 24 ? '🔥 지금 바로!' : safeHoursAgo <= 72 ? '⏰ 오늘 중' : '📅 이번 주',
        priority: 100 - idx,
        questionAge: { 
          createdAt: displayDate, 
          hoursAgo: safeHoursAgo, 
          freshness: safeHoursAgo <= 24 ? 'today' : safeHoursAgo <= 72 ? 'this_week' : 'older',
          freshnessScore: safeHoursAgo <= 24 ? 25 : safeHoursAgo <= 72 ? 15 : 5
        },
        askerInfo: { adoptionRate: 40, isFrequentAdopter: false, adopterScore: 5 },
        answerAnalysis: { 
          quality: safeAnswerCount === 0 ? 'none' as const : 'medium' as const,
          avgLength: 0, 
          hasDetailedAnswer: false, 
          weakness: safeAnswerCount === 0 ? '첫 답변 기회!' : '더 좋은 답변 가능',
          opportunityScore: safeAnswerCount === 0 ? 30 : 15
        },
        crawledAt: new Date().toISOString(),
        isRealData: true
      };
    });
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ 숨은 꿀질문 탐지 완료!');
    console.log(`  메인 제외: ${mainPopularUrls.size}개 | 숨은 꿀: ${goldenQuestions.length}개 | ${crawlTime}초`);
    console.log('═'.repeat(60) + '\n');
    
    if (goldenQuestions.length > 0) {
      console.log('[TOP 10 숨은 꿀질문]');
      goldenQuestions.slice(0, 10).forEach((q, i) => {
        console.log(`  ${i+1}. [${q.goldenGrade}] ${q.title.substring(0, 35)}...`);
        console.log(`     조회 ${q.viewCount} | UP ${q.likeCount} | 답변 ${q.answerCount} | ${q.publishedDate}`);
      });
    }
    
    // 결과가 없으면 빈 배열 반환
    if (goldenQuestions.length === 0) {
      console.log('\n⚠️ 조건에 맞는 숨은 꿀질문을 찾지 못했습니다.');
      console.log('  → 최근 일주일 이내, 조회수가 있는 질문이 없을 수 있습니다.\n');
    }
    
    return {
      goldenQuestions,
      stats: {
        totalCrawled: hiddenQuestions.length + mainPopularUrls.size,
        goldenFound: goldenQuestions.length,
        sssCount: goldenQuestions.filter(q => q.goldenGrade === 'SSS').length,
        ssCount: goldenQuestions.filter(q => q.goldenGrade === 'SS').length,
        sCount: goldenQuestions.filter(q => q.goldenGrade === 'S').length,
        avgViewCount: goldenQuestions.length > 0 
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.viewCount, 0) / goldenQuestions.length)
          : 0,
        avgAnswerCount: goldenQuestions.length > 0
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.answerCount, 0) / goldenQuestions.length * 10) / 10
          : 0
      },
      categories: [...new Set(goldenQuestions.map(q => q.category))],
      timestamp: new Date().toISOString(),
      crawlTime
    };
    
  } catch (error: any) {
    console.error('[ERROR] ❌ 치명적 오류:', error.message);
    await page.close();
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  }
}

// ============================================================
// 🔥 지금 뜨는 숨은 질문 (최근 7일 + 높은 조회수) - 3개월 전용
// ============================================================

export async function getTrendingHiddenQuestions(): Promise<GoldenHuntResult> {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('🔥 [v6.0] 지금 뜨는 숨은 질문 탐지');
  console.log('═'.repeat(60));
  console.log('📊 조건: 최근 7일 이내 + 조회수 높음 + 메인 미노출');
  console.log('═'.repeat(60) + '\n');
  
  const browser = await getBrowser();
  const page = await createPage(browser);
  
  const mainPopularUrls = new Set<string>();
  
  // 카테고리 5개
  const categories = [
    { name: 'IT/컴퓨터', dirId: '1' },
    { name: '게임', dirId: '2' },
    { name: '건강', dirId: '7' },
    { name: '생활', dirId: '8' },
    { name: '쇼핑', dirId: '4' },
  ];
  
  try {
    // Step 1: 메인 페이지 제외 목록
    console.log('[STEP 1] 📋 메인 "많이 본 Q&A" 수집 (제외)...\n');
    
    await page.goto('https://kin.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    
    const mainUrls = await page.evaluate(() => {
      const urls: string[] = [];
      document.querySelectorAll('a[href*="qna/detail"]').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href.includes('docId=')) {
          urls.push(href.startsWith('http') ? href : 'https://kin.naver.com' + href);
        }
      });
      return [...new Set(urls)];
    });
    
    mainUrls.forEach(url => mainPopularUrls.add(url));
    console.log(`[STEP 1] 🚫 제외 목록: ${mainPopularUrls.size}개\n`);
    
    // Step 2: 최신순으로 카테고리 수집 (최신 질문 위주)
    console.log('[STEP 2] 📋 최신 질문 수집...\n');
    
    const recentQuestions: any[] = [];
    
    for (const cat of categories) {
      const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=date`;
      console.log(`[CRAWL] 🔗 ${cat.name} (최신순)`);
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise(r => setTimeout(r, 500));
        
        const questions = await extractQuestionsFromPage(page, cat.name);
        
        // 🔥 7일 이내 질문만 필터
        const recent = questions.filter(q => {
          if (mainPopularUrls.has(q.url)) return false;
          return q.hoursAgo <= 168; // 7일 = 168시간
        });
        
        recentQuestions.push(...recent);
        console.log(`  → ${questions.length}개 중 7일 이내: ${recent.length}개`);
        
      } catch (err: any) {
        console.log(`  ❌ 실패: ${err.message?.substring(0, 30)}`);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\n[STEP 2] ✅ 총 ${recentQuestions.length}개 최신 질문!\n`);
    
    if (recentQuestions.length === 0) {
      await page.close();
      return {
        goldenQuestions: [],
        stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
        categories: [],
        timestamp: new Date().toISOString(),
        crawlTime: Math.round((Date.now() - startTime) / 1000)
      };
    }
    
    // Step 3: 상세 페이지에서 조회수 확인 (상위 15개)
    console.log('[STEP 3] 🔍 조회수 확인...\n');
    
    const shuffled = [...recentQuestions].sort(() => Math.random() - 0.5);
    const topN = shuffled.slice(0, 15);
    const withViewCount: any[] = [];
    
    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1920, height: 1080 });
    
    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];
      
      try {
        await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await new Promise(r => setTimeout(r, 400));
        
        const detail = await detailPage.evaluate(() => {
          const text = document.body.innerText || '';
          let viewCount = 0;
          const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
          if (m) viewCount = parseInt(m[1].replace(/,/g, ''));
          return { viewCount };
        });
        
        withViewCount.push({ ...q, viewCount: detail.viewCount || 0 });
        
        if ((i + 1) % 5 === 0) console.log(`  📊 ${i + 1}/${topN.length} 완료...`);
        
      } catch (err) {
        withViewCount.push(q);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    await detailPage.close();
    await page.close();
    
    // Step 4: 결과 필터링 (조회수 50 이상 + 최근 7일)
    const validQuestions = withViewCount
      .filter(q => q.viewCount >= 50 && q.url.includes('docId='))
      .sort((a, b) => b.viewCount - a.viewCount);
    
    console.log(`\n  ✅ 지금 뜨는 숨은 질문: ${validQuestions.length}개\n`);
    
    // 결과 생성
    const goldenQuestions: GoldenQuestion[] = validQuestions.slice(0, 10).map((q, idx) => {
      let grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' = 'B';
      if (q.viewCount >= 1000 && q.answerCount === 0) grade = 'SS';
      else if (q.viewCount >= 500 && q.answerCount <= 1) grade = 'S';
      else if (q.viewCount >= 200) grade = 'A';
      
      const daysAgo = Math.floor(q.hoursAgo / 24);
      const timeText = daysAgo === 0 ? '오늘' : `${daysAgo}일 전`;
      
      return {
        title: q.title,
        url: q.url,
        questionId: q.questionId || '',
        category: q.category,
        viewCount: q.viewCount,
        answerCount: q.answerCount || 0,
        likeCount: q.likeCount || 0,
        publishedDate: timeText,
        daysAgo,
        hasExternalLinks: false,
        externalLinkCount: 0,
        linkTypes: [],
        isAdopted: false,
        isExpertOnly: false,
        goldenScore: q.viewCount,
        goldenGrade: grade,
        goldenReason: `🔥 ${timeText} | 조회 ${q.viewCount.toLocaleString()} | 답변 ${q.answerCount}`,
        estimatedDailyTraffic: q.viewCount >= 500 ? '높음' : q.viewCount >= 100 ? '중간' : '보통',
        trafficPotential: q.viewCount >= 500 ? 'high' : 'medium',
        recommendAction: q.answerCount === 0 ? '🎯 첫 답변 기회!' : '📝 더 좋은 답변으로 경쟁!',
        urgency: daysAgo <= 1 ? '🔥 지금 바로!' : '⏰ 오늘 중',
        priority: 100 - idx,
        questionAge: {
          createdAt: timeText,
          hoursAgo: q.hoursAgo,
          freshness: daysAgo <= 1 ? 'today' : 'this_week',
          freshnessScore: Math.max(0, 100 - daysAgo * 10)
        },
        askerInfo: { adoptionRate: 40, isFrequentAdopter: false, adopterScore: 5 },
        answerAnalysis: {
          quality: q.answerCount === 0 ? 'none' : 'medium',
          avgLength: 0,
          hasDetailedAnswer: false,
          weakness: q.answerCount === 0 ? '답변 없음' : '',
          opportunityScore: q.answerCount === 0 ? 100 : 50
        },
        crawledAt: new Date().toISOString(),
        isRealData: true
      };
    });
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('═'.repeat(60));
    console.log(`✅ 지금 뜨는 숨은 질문 탐지 완료! | ${goldenQuestions.length}개 | ${crawlTime}초`);
    console.log('═'.repeat(60) + '\n');
    
    return {
      goldenQuestions,
      stats: {
        totalCrawled: recentQuestions.length,
        goldenFound: goldenQuestions.length,
        sssCount: 0,
        ssCount: goldenQuestions.filter(q => q.goldenGrade === 'SS').length,
        sCount: goldenQuestions.filter(q => q.goldenGrade === 'S').length,
        avgViewCount: goldenQuestions.length > 0
          ? Math.round(goldenQuestions.reduce((s, q) => s + q.viewCount, 0) / goldenQuestions.length)
          : 0,
        avgAnswerCount: 0
      },
      categories: categories.map(c => c.name),
      timestamp: new Date().toISOString(),
      crawlTime
    };
    
  } catch (error: any) {
    console.error('[ERROR] ❌', error.message);
    await page.close();
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  }
}

// ============================================================
// 호환용 함수들
// ============================================================

export async function freeHunt(): Promise<GoldenHuntResult> {
  return getRisingQuestions();
}

export async function quickHunt(): Promise<GoldenHuntResult> {
  return getRisingQuestions();
}

export async function premiumHunt(): Promise<GoldenHuntResult> {
  return fullHunt();
}

export async function getLatestQuestions(): Promise<GoldenHuntResult> {
  return getRisingQuestions();
}

export async function searchKinQuestions(isPremium: boolean = false): Promise<any> {
  const result = isPremium ? await fullHunt() : await getRisingQuestions();
  
  return {
    goldenQuestions: result.goldenQuestions,
    popularQuestions: result.goldenQuestions.slice(0, 10),
    hiddenGoldenQuestions: result.goldenQuestions,
    timestamp: result.timestamp,
    crawlTime: result.crawlTime,
    stats: {
      totalCrawled: result.stats.totalCrawled,
      totalFound: result.stats.goldenFound,
      goldenCount: result.stats.sssCount + result.stats.ssCount + result.stats.sCount,
      sssCount: result.stats.sssCount,
      ssCount: result.stats.ssCount,
      sCount: result.stats.sCount,
      avgViewCount: result.stats.avgViewCount,
      avgAnswerCount: result.stats.avgAnswerCount
    },
    categories: result.categories,
    success: result.goldenQuestions.length > 0
  };
}

export { closeBrowser as closeKinBrowser };
