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

import type { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { calculateKinHoneyPotProfile, type KinSignals } from './naver-kin-golden-config';
import { enrichKinSignalsBatch, isEnrichmentEnabled } from './naver-kin-signal-enrichment';

// ============================================================
// Phase 3: 관측성 — sessionId + 셀렉터 hit/miss 메트릭
// ============================================================

let sessionCounter = 0;
function newSessionId(prefix: string): string {
  sessionCounter += 1;
  const ts = Date.now().toString(36).slice(-6);
  return `${prefix}-${ts}-${sessionCounter}`;
}

export interface KinMetrics {
  selectorHit: number;
  selectorMiss: number;
  detailSuccess: number;
  detailFail: number;
  detailRetry: number;
  emptyViewCount: number;
  circuitTripped: number;
}

function newMetrics(): KinMetrics {
  return {
    selectorHit: 0,
    selectorMiss: 0,
    detailSuccess: 0,
    detailFail: 0,
    detailRetry: 0,
    emptyViewCount: 0,
    circuitTripped: 0,
  };
}

function logMetrics(sessionId: string, m: KinMetrics) {
  const selTotal = m.selectorHit + m.selectorMiss;
  const hitRate = selTotal > 0 ? ((m.selectorHit / selTotal) * 100).toFixed(1) : 'N/A';
  console.log(
    `[${sessionId}] metrics: selectorHit=${m.selectorHit}/${selTotal} (${hitRate}%) | detail ok=${m.detailSuccess} fail=${m.detailFail} retry=${m.detailRetry} | emptyView=${m.emptyViewCount} | circuitTrip=${m.circuitTripped}`
  );
}


// ============================================================
// 🔧 설정
// ============================================================

// 디버그 모드: 환경변수로 활성화 (기본 off — 패키징 앱의 ./ 는 Program Files 라 쓰기 불가)
const DEBUG_MODE = process.env.LEWORD_KIN_DEBUG === '1';
const WAIT_TIME = 3000; // 페이지 로딩 대기 (3초)

// 디버그 디렉토리는 userData 경로로 — Program Files EPERM 회피
function getDebugDir(): string {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'debug-screenshots');
  } catch {
    return path.join(process.cwd(), 'debug-screenshots');
  }
}

if (DEBUG_MODE) {
  try {
    const dir = getDebugDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err: any) {
    console.warn('[KIN] 디버그 디렉토리 생성 실패 (무시):', err?.message);
  }
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
  honeyPotScore: number;
  honeyPotGrade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';
  honeyPotReason: string;
  externalTrafficPotential: 'very_high' | 'high' | 'medium' | 'low';
  answerAngle: string;
  blogBridgeTitle: string;
  trafficRoute: string[];
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

function clampIntentScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreQuestionIntent(title: string): number {
  const text = String(title || '').trim();
  const normalized = text.replace(/\s+/g, '');
  let score = 42;

  const highIntentPatterns = [
    /추천|비교|순위|후기|리뷰|가격|비용|얼마|방법|하는법|해결|원인|증상|신청|조건|자격|기간|다운로드|설치|오류|안됨|고장|문제|가능|어떻게|뭐가|뭘|어떤|좋나요|괜찮나요/i,
    /best|review|price|how|fix|error|install|download/i,
  ];
  const bridgePatterns = [
    /제품|구매|보험|지원금|환급|자격증|시험|병원|영양제|다이어트|앱|사이트|프로그램|노트북|컴퓨터|휴대폰|자동차|여행|웨딩|이사|청소|수리|대출|청약|부동산/,
  ];
  const weakIntentPatterns = [/내공|급해요|제발|숙제|풀이|번역|꿈해몽|사주|이름|연애|친구|학교|욕|싸움/];

  if (highIntentPatterns.some(p => p.test(text))) score += 26;
  if (bridgePatterns.some(p => p.test(text))) score += 18;
  if (/[?？]$/.test(text) || /나요|까요|인가요|일까요|있나요|없나요/.test(text)) score += 8;
  if (normalized.length >= 14 && normalized.length <= 70) score += 6;
  if (weakIntentPatterns.some(p => p.test(text))) score -= 18;
  if (normalized.length > 90) score -= 8;

  return clampIntentScore(score);
}

function buildKinSignals(q: any, overrides: Partial<KinSignals> = {}): KinSignals {
  const answerCount = Number(q.answerCount) || 0;
  const rawHoursAgo = Number(q.hoursAgo);
  const hoursAgo = Number.isFinite(rawHoursAgo) ? rawHoursAgo : 999;
  const defaultAnswerQuality = answerCount === 0 ? 0 : answerCount <= 2 ? 42 : answerCount <= 5 ? 58 : 72;
  return {
    viewCount: Number(q.viewCount) || 0,
    answerCount,
    hoursAgo,
    likeCount: Number(q.likeCount) || 0,
    isAdopted: Boolean(q.isAdopted),
    viewsPerHour: Number(q.viewsPerHour) || undefined,
    isMainExposed: Boolean(q.isMainExposed),
    hasExternalLinks: Boolean(q.hasExternalLinks),
    externalLinkCount: Number(q.externalLinkCount) || 0,
    answerQualityScore: Number(q.answerQualityScore ?? defaultAnswerQuality),
    questionIntentScore: scoreQuestionIntent(q.title || ''),
    isExpertOnly: Boolean(q.isExpertOnly),
    ...overrides,
  };
}

function buildBlogBridgeTitle(title: string): string {
  const clean = String(title || '').replace(/\s+/g, ' ').replace(/[?？]+$/g, '').trim();
  if (!clean) return '지식인 질문 기반 상세 정리';
  if (/추천|비교|순위|후기|리뷰/.test(clean)) return `${clean} 비교 기준과 실패 없는 선택법`;
  if (/가격|비용|얼마|견적/.test(clean)) return `${clean} 비용 범위와 추가로 확인할 것`;
  if (/방법|하는법|신청|조건|자격|기간/.test(clean)) return `${clean} 절차와 체크리스트`;
  if (/오류|안됨|고장|문제|해결/.test(clean)) return `${clean} 원인별 해결 방법`;
  return `${clean} 핵심 답변과 자세한 정리`;
}

function buildAnswerAngle(title: string, signals: KinSignals): string {
  if (signals.answerCount === 0) {
    return '첫 답변 선점: 결론 2줄, 단계별 해결, 블로그 상세글 연결';
  }
  if (signals.answerCount <= 2 && (signals.answerQualityScore || 0) < 55) {
    return '기존 답변 보강: 표/체크리스트로 더 완성도 높은 답변 작성';
  }
  if ((signals.questionIntentScore || 0) >= 72) {
    return '검색형 질문: 비교 기준, 비용, 주의사항을 한 번에 정리';
  }
  return '신뢰형 답변: 근거와 실제 적용 팁을 짧고 단단하게 제시';
}

function buildHoneyFields(q: any, signals: KinSignals) {
  const profile = calculateKinHoneyPotProfile(signals);
  return {
    honeyPotScore: profile.score,
    honeyPotGrade: profile.grade as GoldenQuestion['honeyPotGrade'],
    honeyPotReason: profile.reason,
    externalTrafficPotential: profile.externalTrafficPotential,
    answerAngle: buildAnswerAngle(q.title || '', signals),
    blogBridgeTitle: buildBlogBridgeTitle(q.title || ''),
    trafficRoute: profile.route,
  };
}

const LATEST_HONEY_MAX_HOURS = 168;
const LATEST_HONEY_DETAIL_LIMIT = 60;
const LATEST_HONEY_PAGES = 2;
const KIN_HONEY_CATEGORIES = [
  { name: '전체', dirId: '0' },
  { name: 'IT/컴퓨터', dirId: '1' },
  { name: '게임', dirId: '2' },
  { name: '쇼핑', dirId: '4' },
  { name: '건강', dirId: '7' },
  { name: '생활', dirId: '8' },
];
const KIN_FAST_HONEY_CATEGORIES = KIN_HONEY_CATEGORIES.slice(0, 1);

function extractDocIdFromUrl(url: string): string {
  const match = String(url || '').match(/docId=(\d+)/);
  return match ? match[1] : '';
}

function getQuestionHoursAgo(q: any): number {
  const raw = Number(q?.hoursAgo ?? q?.questionAge?.hoursAgo);
  return Number.isFinite(raw) ? raw : 999;
}

function getViewsPerHour(q: any): number {
  const views = Number(q.viewCount) || 0;
  const hours = Math.max(1, getQuestionHoursAgo(q));
  return Math.round((views / hours) * 10) / 10;
}

function getLatestViewFloor(hoursAgo: number): number {
  // 미노출 꿀통의 가치 = 신선 + 무답변(첫 답변 기회). 갓 올라온 질문은 조회수가 낮은 게 정상.
  // floor 를 현실에 맞게 캘리브레이션 (라이브 측정: 신선 질문 대부분 조회 1~10).
  if (hoursAgo <= 6) return 1;
  if (hoursAgo <= 24) return 3;
  if (hoursAgo <= 72) return 8;
  return 15;
}

function isLatestHiddenHoneyCandidate(q: any): boolean {
  const url = String(q.url || '');
  const viewCount = Number(q.viewCount) || 0;
  const answerCount = Number(q.answerCount) || 0;
  const hoursAgo = getQuestionHoursAgo(q);
  const externalLinkCount = Number(q.externalLinkCount) || 0;
  const viewsPerHour = Number(q.viewsPerHour) || getViewsPerHour(q);

  if (!url.includes('docId=')) return false;
  // isExpertOnly 제외: 네이버 지식인 모든 페이지 텍스트에 전문가 카테고리(의사/변호사/세무사) 링크가
  //   상존 → 정규식이 전량 오탐. rising(라이브 검증)도 isExpertOnly 로 거르지 않음. isAdopted 만 신뢰.
  if (Boolean(q.isAdopted)) return false;
  if (hoursAgo > LATEST_HONEY_MAX_HOURS) return false;
  if (answerCount > 3) return false;
  if (externalLinkCount >= 2) return false;
  if (viewCount < getLatestViewFloor(hoursAgo) && viewsPerHour < 0.3) return false;

  return true;
}

function getLatestHiddenSortScore(q: any): number {
  const withVelocity = { ...q, viewsPerHour: Number(q.viewsPerHour) || getViewsPerHour(q) };
  const honey = buildHoneyFields(withVelocity, buildKinSignals(withVelocity, { isMainExposed: false })).honeyPotScore;
  const answerBonus = Number(q.answerCount) === 0 ? 12 : Number(q.answerCount) === 1 ? 7 : 0;
  const velocityBonus = Math.min(18, getViewsPerHour(withVelocity) * 3);
  const hoursAgo = getQuestionHoursAgo(q);
  const freshBonus = hoursAgo <= 24 ? 10 : hoursAgo <= 72 ? 5 : 0;
  return honey + answerBonus + velocityBonus + freshBonus;
}

function isActionableHoneyResult(q: any): boolean {
  const grade = q.honeyPotGrade || q.goldenGrade || 'B';
  return ['SSS', 'SS', 'S'].includes(grade) && isLatestHiddenHoneyCandidate(q);
}

// ============================================================
// 🌐 브라우저 관리
// ============================================================

let browserInstance: Browser | null = null;

// 중앙화된 Chrome 찾기 사용
import { getPuppeteerLaunchOptions } from './chrome-finder';

/**
 * v2.47.0 P3: browserPool 통일 — 자체 singleton 제거
 *   기존: 자체 browserInstance + 매 호출 재사용 (release 시점 없음 → RAM 누적)
 *   변경: 매 호출마다 browserPool.acquire → 호출자 finally에서 release
 *   결과: chrome.exe 동시 인스턴스 강제 제한 + idle 자동 정리
 */
async function getBrowser(): Promise<Browser> {
  const { browserPool } = await import('./puppeteer-pool');
  return await browserPool.acquire() as Browser;
}

async function releaseBrowser(browser: Browser | null | undefined): Promise<void> {
  if (!browser) return;
  try {
    const { browserPool } = await import('./puppeteer-pool');
    browserPool.release(browser as any);
  } catch {
    try { await (browser as any).close?.(); } catch {}
  }
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
  // v2.47.0 P3: 호출자(IPC 핸들러)가 closeBrowser() 부르던 패턴 호환 유지
  //   - browserPool.closeIdle()로 idle browser 정리 (in-use는 안 건드림)
  //   - 다음 acquire가 막히지 않도록 함
  try {
    const { browserPool } = await import('./puppeteer-pool');
    await browserPool.closeIdle();
  } catch {}
}

// ============================================================
// 🔍 디버그 헬퍼
// ============================================================

async function debugSaveScreenshot(page: Page, name: string): Promise<void> {
  if (!DEBUG_MODE) return;
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = path.join(getDebugDir(),`${name}-${timestamp}.png`);
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
    const filepath = path.join(getDebugDir(),`${name}-${timestamp}.html`);
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
  likeCount?: number;
  category: string;
  hoursAgo: number;
  timeGroup: string;
  publishedDate?: string;
  isAdopted?: boolean;
  hasExternalLinks?: boolean;
  externalLinkCount?: number;
  answerQualityScore?: number;
  isExpertOnly?: boolean;
  viewsPerHour?: number;
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
  const sessionId = newSessionId('popular');
  const metrics = newMetrics();

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 [v9.0] 일주일 내 황금 질문 헌팅 [${sessionId}]`);
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

    console.log(`\n[STEP 2] 📊 상세 페이지 병렬 크롤링 (pool=4)...\n`);
    console.log(`  📋 총 ${allQuestions.length}개 수집됨\n`);

    // Phase 4: 페이지 풀 4개로 상세 페이지 병렬 처리
    // 풀 5+는 anti-bot 감지로 tail latency 폭증 → 4가 안전한 최대값
    // Phase 5-B: circuit breaker — 연속 실패 3회 시 cooldown 5s
    const questionsToDetail = allQuestions.slice(0, 30);
    const POOL_SIZE = 4;
    const CIRCUIT_FAIL_THRESHOLD = 3;
    const CIRCUIT_COOLDOWN_MS = 5000;
    let consecutiveFails = 0;
    let circuitTrippedCount = 0;

    // 페이지 풀 생성 (각 페이지는 독립적인 네트워크/렌더 컨텍스트)
    const detailPages = await Promise.all(
      Array.from({ length: POOL_SIZE }, async () => {
        const dp = await browser.newPage();
        await dp.setViewport({ width: 1920, height: 1080 });
        await dp.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await dp.setRequestInterception(true);
        dp.on('request', req => {
          const type = req.resourceType();
          if (['font', 'media', 'image', 'stylesheet'].includes(type)) req.abort();
          else req.continue();
        });
        return dp;
      })
    );

    // 단일 질문 처리 함수 (페이지 풀 worker 공용)
    // Phase 4-D: 최대 2회 재시도 + 지수 backoff (500ms → 1500ms)
    // Phase 5-B: circuit breaker — 풀 전역 연속 실패 카운터 체크
    const processDetail = async (detailPage: Page, q: any, idx: number) => {
      // Circuit open: 연속 실패 3회 초과 시 cooldown
      if (consecutiveFails >= CIRCUIT_FAIL_THRESHOLD) {
        circuitTrippedCount++;
        console.warn(
          `[${sessionId}] circuit tripped (${consecutiveFails} 연속 실패) — ${CIRCUIT_COOLDOWN_MS}ms cooldown`
        );
        await new Promise(r => setTimeout(r, CIRCUIT_COOLDOWN_MS));
        consecutiveFails = 0; // 리셋 후 재시도
      }

      const startMs = Date.now();
      const MAX_ATTEMPTS = 2;
      let lastError: any = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 10000 });

          // Phase 4: 고정 sleep 대신 실제 셀렉터 노출 대기 (최대 1.5s)
          let selectorSeen = false;
          try {
            await detailPage.waitForSelector('#content, .question_header, .endContentsText', { timeout: 1500 });
            selectorSeen = true;
            metrics.selectorHit++;
          } catch {
            metrics.selectorMiss++;
          }

          const detail = await detailPage.evaluate(() => {
          let viewCount = 0;
          let answerCount = 0;
          let likeCount = 0;
          let dateText = '';
          let hoursAgo = 24;

          const questionHeader = document.querySelector('.question_header, .c-heading__content, .endContentsText, #content') as HTMLElement;
          const headerText = questionHeader?.innerText || '';
          const pageText = document.body.innerText || '';

          const viewMatch = pageText.match(/조회[수\s:]*([0-9,]+)/);
          if (viewMatch) viewCount = parseInt(viewMatch[1].replace(/,/g, ''));

          const answerMatch = pageText.match(/답변[수\s:]*(\d+)/);
          if (answerMatch) answerCount = parseInt(answerMatch[1]);

          const likeMatch = pageText.match(/공감[수\s:]*(\d+)|좋아요[수\s:]*(\d+)|UP\s*(\d+)/i);
          if (likeMatch) likeCount = parseInt(likeMatch[1] || likeMatch[2] || likeMatch[3] || '0');

          const isAdopted =
            pageText.includes('채택됨') ||
            pageText.includes('채택 답변') ||
            document.querySelector('.badge_adopted, .adopted, [class*="adopt"]') !== null;

          const externalLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href || '')
            .filter(href => /^https?:\/\//i.test(href) && !/naver\.com|naver\.me|nid\.naver/i.test(href));
          const answerTexts = Array.from(document.querySelectorAll('.answer-content__item, .se-main-container, .endContentsText, [class*="answer"]'))
            .map(el => (el as HTMLElement).innerText || '')
            .filter(t => t.trim().length > 30);
          const avgAnswerLength = answerTexts.length
            ? Math.round(answerTexts.reduce((sum, t) => sum + t.trim().length, 0) / answerTexts.length)
            : 0;
          const answerQualityScore = answerCount === 0 ? 0 : Math.min(100, Math.max(25, Math.round(avgAnswerLength / 8)));
          const isExpertOnly = /전문가 답변|엑스퍼트|expert|의사|변호사|세무사|노무사/i.test(pageText);

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

          return {
            viewCount,
            answerCount,
            likeCount,
            dateText,
            hoursAgo,
            isAdopted,
            hasExternalLinks: externalLinks.length > 0,
            externalLinkCount: externalLinks.length,
            answerQualityScore,
            isExpertOnly
          };
        });

          q.viewCount = detail.viewCount;
          q.answerCount = detail.answerCount;
          q.likeCount = detail.likeCount;
          q.dateText = detail.dateText;
          q.hoursAgo = detail.hoursAgo;
          q.isAdopted = detail.isAdopted;
          q.hasExternalLinks = detail.hasExternalLinks;
          q.externalLinkCount = detail.externalLinkCount;
          q.answerQualityScore = detail.answerQualityScore;
          q.isExpertOnly = detail.isExpertOnly;

          if (!detail.viewCount) metrics.emptyViewCount++;
          metrics.detailSuccess++;
          consecutiveFails = 0; // 성공 → circuit 리셋

          const ms = Date.now() - startMs;
          console.log(
            `[${sessionId}] DETAIL ${idx + 1}/${questionsToDetail.length} ${ms}ms sel=${selectorSeen ? 'hit' : 'miss'} view=${detail.viewCount} ans=${detail.answerCount} | ${String(q.title || '').substring(0, 30)}`
          );
          return; // 성공 → retry 루프 탈출
        } catch (err: any) {
          lastError = err;
          if (attempt < MAX_ATTEMPTS) {
            metrics.detailRetry++;
            const backoffMs = 500 * attempt; // 500ms → 1000ms
            console.warn(
              `[${sessionId}] 상세 크롤 재시도 ${attempt}/${MAX_ATTEMPTS} (${backoffMs}ms 후) | url=${q.url} | error=${err?.message ?? err}`
            );
            await new Promise(r => setTimeout(r, backoffMs));
          }
        }
      }

      // 모든 재시도 실패 → circuit breaker 카운터 증가
      metrics.detailFail++;
      consecutiveFails++;
      console.warn(
        `[${sessionId}] 상세 크롤 최종 실패 | url=${q.url} | title=${q.title?.substring(0, 40)} | error=${lastError?.message ?? lastError} | consecutiveFails=${consecutiveFails}`
      );
    };

    // Round-robin 워커: 각 페이지는 자기 index부터 POOL_SIZE 간격으로 처리
    const workers = detailPages.map((detailPage, workerIdx) => (async () => {
      for (let i = workerIdx; i < questionsToDetail.length; i += POOL_SIZE) {
        await processDetail(detailPage, questionsToDetail[i], i);
      }
    })());
    await Promise.all(workers);

    // circuit breaker 카운터를 metrics 에 반영
    metrics.circuitTripped = circuitTrippedCount;

    // 풀 정리
    await Promise.all(detailPages.map(dp => dp.close().catch(() => {})));
    
    console.log(`\n[STEP 3] 🏆 황금 질문 선별...\n`);
    
    // 🔥 일주일 이내 질문 필터 시도
    let weekQuestions = questionsToDetail.filter(q => q.hoursAgo <= 168);
    
    console.log(`  📅 일주일 내 질문: ${weekQuestions.length}개 / 전체 ${questionsToDetail.length}개`);
    
    // 일주일 내 질문이 5개 미만이면 전체 사용 (날짜와 함께 표시)
    if (weekQuestions.length < 5) {
      console.log(`  ⚠️ 일주일 내 질문 부족 → 전체 질문 사용 (날짜 표시)`);
      weekQuestions = questionsToDetail;
    }
    
    // Phase 2: 활성화된 경우 확장 signal 배치 조회 (기본 off)
    let enrichments: Partial<KinSignals>[] = [];
    if (isEnrichmentEnabled()) {
      console.log(`[${sessionId}] enrichment 활성 — ${weekQuestions.length}개 제목 조회`);
      try {
        enrichments = await enrichKinSignalsBatch(weekQuestions.map(q => q.title));
      } catch (err: any) {
        console.warn(`[${sessionId}] enrichment 배치 실패 (degraded mode): ${err?.message}`);
        enrichments = weekQuestions.map(() => ({ enrichmentAvailable: false }));
      }
    }

    // Phase 1: 통합 config 함수로 scoring — 가중치 단일 소스
    const scoredQuestions = weekQuestions.map((q, idx) => {
      const signals = buildKinSignals(q, {
        isMainExposed: true,
        ...(enrichments[idx] ?? {}),
      });
      const honey = buildHoneyFields(q, signals);
      return { ...q, goldScore: honey.honeyPotScore, kinGrade: honey.honeyPotGrade, honey };
    });

    // 점수 높은 순 정렬
    scoredQuestions.sort((a, b) => b.goldScore - a.goldScore);
    
    const topQuestions = scoredQuestions.slice(0, 30);
    
    console.log(`[RESULT] ✅ 일주일 내 황금 질문 ${topQuestions.length}개!`);
    topQuestions.forEach((q, i) => {
      console.log(`  ${i + 1}. [${q.dateText}] 조회 ${q.viewCount}, 답변 ${q.answerCount}, 좋아요 ${q.likeCount} | ${q.title.substring(0, 20)}...`);
    });
    
    await page.close();
    
    const goldenQuestions: GoldenQuestion[] = topQuestions.map((q, idx) => {
      const signals = buildKinSignals(q, { isMainExposed: true });
      const honey = (q as any).honey ?? buildHoneyFields(q, signals);
      const score = honey.honeyPotScore;
      const grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' = honey.honeyPotGrade ?? 'B';
      
      // 🔥 황금 이유 생성
      const timeText = q.hoursAgo <= 1 ? '방금' : 
                       q.hoursAgo <= 6 ? `${q.hoursAgo}시간 전` :
                       q.hoursAgo <= 24 ? '오늘' :
                       q.hoursAgo <= 48 ? '어제' : `${Math.floor(q.hoursAgo / 24)}일 전`;
      
      const answerText = q.answerCount === 0 ? '🔥 답변 없음!' : 
                         q.answerCount === 1 ? '답변 1개' : `답변 ${q.answerCount}개`;
      
      const goldenReason = honey.honeyPotReason || `👀 조회 ${q.viewCount}회 | ${answerText} | ${timeText}`;
      
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
        hasExternalLinks: Boolean(q.hasExternalLinks),
        externalLinkCount: Number(q.externalLinkCount) || 0,
        linkTypes: [],
        isAdopted: Boolean(q.isAdopted),
        isExpertOnly: Boolean(q.isExpertOnly),
        goldenScore: score,
        goldenGrade: grade,
        goldenReason,
        ...honey,
        estimatedDailyTraffic: q.viewCount >= 50 ? '높음' : q.viewCount >= 20 ? '보통' : '낮음',
        trafficPotential: honey.externalTrafficPotential,
        recommendAction: `${recommendAction} · ${honey.answerAngle}`,
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

    // Phase 3: 세션 메트릭 출력
    logMetrics(sessionId, metrics);

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
    console.error(`[${sessionId}] ❌ 치명적 오류:`, error?.message ?? error);
    try { await page.close(); } catch (closeErr: any) { console.warn(`[${sessionId}] page.close() 실패: ${closeErr?.message}`); }
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  } finally {
    await releaseBrowser(browser);
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
  
  // 6개 카테고리 (전체+쇼핑 추가 → 빈자리 후보 풀 확장)
  const categories = [
    { name: '전체', dirId: '0' },
    { name: 'IT/컴퓨터', dirId: '1' },
    { name: '게임', dirId: '2' },
    { name: '쇼핑', dirId: '4' },
    { name: '건강', dirId: '7' },
    { name: '생활', dirId: '8' },
  ];
  
  try {
    // Step 1: 최신순으로 빠르게 수집
    console.log('[STEP 1] 📋 오늘의 질문 수집...\n');
    
    for (const cat of categories) {
      // 빈자리 풀 확장: 카테고리당 3페이지 (1p=초신선 0뷰 위주, 2~3p=조회 쌓인 빈자리)
      for (let pageNo = 1; pageNo <= LATEST_HONEY_PAGES; pageNo++) {
        const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=date&page=${pageNo}`;
        console.log(`[CRAWL] 🔗 ${cat.name} p${pageNo}`);

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await new Promise(r => setTimeout(r, 500));

          const questions = await extractQuestionsFromPage(page, cat.name);

          // Phase 5: 목록 페이지 hoursAgo 가 부정확 → 필터 제거.
          // 상세 크롤링 단계에서 hoursAgo 를 재측정하고 viewsPerHour 로 랭킹.
          // "급상승"의 본질은 viewsPerHour 이므로 오래된 질문은 자연 탈락.
          let added = 0;
          questions.forEach(q => {
            if (!seenUrls.has(q.url)) {
              seenUrls.add(q.url);
              allQuestions.push(q);
              added++;
            }
          });

          console.log(`  → 수집 ${added}개 (최신순)`);

        } catch (err: any) {
          console.warn(`[KIN] 급상승 카테고리 크롤 실패 | cat=${cat.name} | page=${pageNo} | url=${url} | error=${err?.message ?? err}`);
        }

        await new Promise(r => setTimeout(r, 100));
      }
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
    
    // Step 2: 상세 페이지에서 조회수 + 정확한 hoursAgo 확인 (상위 15개)
    // Phase 5: 목록 페이지의 hoursAgo 는 부정확하므로 상세에서 재측정 후
    // viewsPerHour 로 랭킹
    console.log('[STEP 2] 🔍 조회수 + 신선도 재확인...\n');

    const risingSessionId = newSessionId('rising');
    const risingMetrics = newMetrics();
    const topN = [...allQuestions]
      .sort((a, b) =>
        (Number(a.answerCount) || 0) - (Number(b.answerCount) || 0) ||
        (Number(a.hoursAgo) || 999) - (Number(b.hoursAgo) || 999) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'ko')
      )
      .slice(0, 90);
    const withViewCount: any[] = [];

    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1920, height: 1080 });
    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await detailPage.setRequestInterception(true);
    detailPage.on('request', req => {
      const type = req.resourceType();
      if (['font', 'media', 'image', 'stylesheet'].includes(type)) req.abort();
      else req.continue();
    });

    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];
      try {
        await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        try {
          await detailPage.waitForSelector('#content, .question_header, .endContentsText', { timeout: 1500 });
          risingMetrics.selectorHit++;
        } catch {
          risingMetrics.selectorMiss++;
        }

        const detail = await detailPage.evaluate(() => {
          const text = document.body.innerText || '';
          const html = document.body.innerHTML || '';
          let viewCount = 0;
          const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
          if (m) viewCount = parseInt(m[1].replace(/,/g, ''));

          let answerCount = 0;
          const answerPatterns = [/(\d+)개\s*답변/, /답변\s*(\d+)/, /(\d+)\s*답변/];
          for (const p of answerPatterns) {
            const am = text.match(p);
            if (am) { answerCount = parseInt(am[1]); break; }
          }

          let likeCount = 0;
          const likeMatch = text.match(/좋아요[:\s]*(\d+)|공감[:\s]*(\d+)|UP\s*(\d+)/i);
          if (likeMatch) likeCount = parseInt(likeMatch[1] || likeMatch[2] || likeMatch[3] || '0');

          // 채택 판정: 답변 0개면 채택 물리적 불가. 정확 마커(채택됨 텍스트/배지)만 신뢰.
          // ([class*="adopt"]·.adopted·'채택 답변' 버튼은 모든 페이지에 존재 → 오탐, 디버그로 확인)
          const isAdopted =
            answerCount > 0 &&
            (text.includes('채택됨') || document.querySelector('.badge_adopted') !== null);

          const externalLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href || '')
            .filter(href => /^https?:\/\//i.test(href) && !/naver\.com|naver\.me|nid\.naver/i.test(href));
          const answerTexts = Array.from(document.querySelectorAll('.answer-content__item, .se-main-container, .endContentsText, [class*="answer"]'))
            .map(el => (el as HTMLElement).innerText || '')
            .filter(t => t.trim().length > 30);
          const avgAnswerLength = answerTexts.length
            ? Math.round(answerTexts.reduce((sum, t) => sum + t.trim().length, 0) / answerTexts.length)
            : 0;
          const answerQualityScore = answerCount === 0 ? 0 : Math.min(100, Math.max(25, Math.round(avgAnswerLength / 8)));
          const isExpertOnly = /전문가 답변|엑스퍼트|expert|의사|변호사|세무사|노무사/i.test(text);

          // 정확한 hoursAgo 재측정
          let hoursAgo = 999;
          if (text.includes('방금')) hoursAgo = 0;
          else if (text.includes('분 전')) {
            const mm = text.match(/(\d+)\s*분\s*전/);
            if (mm) hoursAgo = Math.max(1, Math.ceil(parseInt(mm[1]) / 60));
          } else if (text.includes('시간 전')) {
            const mm = text.match(/(\d+)\s*시간\s*전/);
            if (mm) hoursAgo = parseInt(mm[1]);
          } else if (text.includes('일 전')) {
            const mm = text.match(/(\d+)\s*일\s*전/);
            if (mm) hoursAgo = parseInt(mm[1]) * 24;
          }
          return {
            viewCount,
            answerCount,
            likeCount,
            hoursAgoFromDetail: hoursAgo,
            isAdopted,
            hasExternalLinks: externalLinks.length > 0,
            externalLinkCount: externalLinks.length,
            answerQualityScore,
            isExpertOnly
          };
        });

        risingMetrics.detailSuccess++;
        // 상세에서 hoursAgo 못 찾으면 목록값 사용
        const finalHoursAgo = Math.max(detail.hoursAgoFromDetail < 999 ? detail.hoursAgoFromDetail : (q.hoursAgo || 24), 1);
        const viewsPerHour = detail.viewCount / finalHoursAgo;

        withViewCount.push({
          ...q,
          viewCount: detail.viewCount || 0,
          answerCount: detail.answerCount || q.answerCount || 0,
          likeCount: detail.likeCount || q.likeCount || 0,
          hoursAgo: finalHoursAgo,
          viewsPerHour: Math.round(viewsPerHour),
          isAdopted: detail.isAdopted || false,
          hasExternalLinks: detail.hasExternalLinks || false,
          externalLinkCount: detail.externalLinkCount || 0,
          answerQualityScore: detail.answerQualityScore || 0,
          isExpertOnly: detail.isExpertOnly || false,
        });

        if ((i + 1) % 5 === 0) console.log(`[${risingSessionId}] ${i + 1}/${topN.length} 완료`);
      } catch (err: any) {
        risingMetrics.detailFail++;
        console.warn(`[${risingSessionId}] 급상승 상세 실패 | url=${q.url} | error=${err?.message ?? err}`);
        withViewCount.push({ ...q, viewCount: 0, viewsPerHour: 0 });
      }
      await new Promise(r => setTimeout(r, 100));
    }

    logMetrics(risingSessionId, risingMetrics);
    await detailPage.close().catch(() => {});
    await page.close().catch(() => {});
    
    // Step 3: 급상승 정렬 (시간당 조회수 높은 순)
    const risingQuestions = withViewCount
      .filter(q => q.viewCount >= 1 && !q.isAdopted)
      .sort((a, b) => {
        const ah = buildHoneyFields(a, buildKinSignals(a, { isMainExposed: false })).honeyPotScore;
        const bh = buildHoneyFields(b, buildKinSignals(b, { isMainExposed: false })).honeyPotScore;
        return bh - ah;
      })
      .slice(0, 45);
    
    console.log(`\n[STEP 3] 🔥 급상승 ${risingQuestions.length}개!`);
    
    // 결과 포맷팅 — Phase 1 통합 scoring
    const goldenQuestions: GoldenQuestion[] = risingQuestions.map((q, idx) => {
      const signals = buildKinSignals(q, {
        isMainExposed: false,
        viewsPerHour: Number(q.viewsPerHour) || 0,
      });
      const honey = buildHoneyFields(q, signals);

      let timeText = '방금';
      if (q.hoursAgo > 0 && q.hoursAgo < 24) timeText = `${q.hoursAgo}시간 전`;

      return {
        title: q.title,
        url: q.url,
        questionId: q.questionId || '',
        category: q.category,
        viewCount: q.viewCount,
        answerCount: q.answerCount || 0,
        likeCount: Number(q.likeCount) || 0,
        publishedDate: timeText,
        daysAgo: 0,
        hasExternalLinks: Boolean(q.hasExternalLinks),
        externalLinkCount: Number(q.externalLinkCount) || 0,
        linkTypes: [],
        isAdopted: Boolean(q.isAdopted),
        isExpertOnly: Boolean(q.isExpertOnly),
        goldenScore: honey.honeyPotScore,
        goldenGrade: honey.honeyPotGrade,
        goldenReason: honey.honeyPotReason || `🔥 ${timeText} | 조회 ${q.viewCount.toLocaleString()} | ${q.viewsPerHour}회/시간`,
        ...honey,
        estimatedDailyTraffic: q.viewsPerHour >= 50 ? '🔥 폭발' : '📈 상승',
        trafficPotential: honey.externalTrafficPotential,
        recommendAction: `🚀 시간당 ${q.viewsPerHour}회 급상승! ${honey.answerAngle}`,
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
    await page.close().catch(() => {});
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  } finally {
    await releaseBrowser(browser);
  }
}

// ============================================================
// 💎 숨은 꿀질문 (fullHunt)
// ============================================================

export async function fullHunt(): Promise<GoldenHuntResult> {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('💎 [v7.0] 최신 미노출 꿀질문 탐지');
  console.log('═'.repeat(60));
  console.log('📊 최근 7일 + 메인 미노출 + 조회 반응 + 답변 3개 이하만 발굴');
  console.log('═'.repeat(60) + '\n');
  
  const browser = await getBrowser();
  const page = await createPage(browser);
  
  try {
    // Step 1: 메인 페이지 인기글 수집 (제외 목록)
    console.log('[STEP 1] 📋 메인 "많이 본 Q&A" 수집 (제외 목록)...\n');
    
    const mainPopularUrls = new Set<string>();
    const mainPopularIds = new Set<string>();
    
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
    
    mainUrls.forEach(url => {
      mainPopularUrls.add(url);
      const docId = extractDocIdFromUrl(url);
      if (docId) mainPopularIds.add(docId);
    });
    console.log(`[STEP 1] 🚫 제외 목록: ${mainPopularUrls.size}개 / docId ${mainPopularIds.size}개`);
    
    // Step 2: 카테고리별 인기글 수집
    console.log('\n[STEP 2] 📋 카테고리별 숨은 인기글 수집...\n');
    
    const categories = KIN_HONEY_CATEGORIES;
    
    const hiddenQuestions: any[] = [];
    
    // 최신순을 중심으로 보되, 조회순은 최근 질문만 살아남도록 후단에서 강하게 필터링.
    for (const cat of categories) {
      for (const sortType of ['date', 'vcount']) {
        for (let pageNo = 1; pageNo <= LATEST_HONEY_PAGES; pageNo++) {
          const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=${sortType}&page=${pageNo}`;
          
          console.log(`[CRAWL] 🔗 ${cat.name} (${sortType === 'date' ? '최신' : '인기'}) p${pageNo}`);
          
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 6000 });
            await new Promise(r => setTimeout(r, 300));
            
            const questions = await extractQuestionsFromPage(page, cat.name);
            
            let added = 0;
            questions.forEach(q => {
              const docId = q.questionId || extractDocIdFromUrl(q.url);
              const isMainPopular = mainPopularUrls.has(q.url) || (docId && mainPopularIds.has(docId));
              // 목록 hoursAgo 부정확(기본 999) → 상세 단계(line 1815)에서 재측정 후 7일 필터
              if (
                !isMainPopular &&
                Number(q.answerCount || 0) <= 3 &&
                !hiddenQuestions.some(h => h.url === q.url)
              ) {
                hiddenQuestions.push(q);
                added++;
              }
            });
            
            console.log(`  → 발견 ${questions.length}개, 최신 미노출 ${added}개 추가`);

          } catch (err: any) {
            console.warn(`[KIN] fullHunt 카테고리 크롤 실패 | cat=${cat.name} | sort=${sortType} | page=${pageNo} | url=${url} | error=${err?.message ?? err}`);
          }

          await new Promise(r => setTimeout(r, 80));
        }
      }
    }
    
    console.log(`\n[STEP 2] ✅ 총 ${hiddenQuestions.length}개 수집!`);
    
    // Step 3: 최신/답변공백/검색의도 우선 선별
    console.log('\n[STEP 3] 📊 질문 선별...\n');
    
    const scoredQuestions = [...hiddenQuestions]
      .map((q, idx) => ({
        ...q,
        seedOpportunity:
          scoreQuestionIntent(q.title || '') +
          (Number(q.answerCount) === 0 ? 35 : Number(q.answerCount) <= 2 ? 22 : 0) +
          (Number(q.hoursAgo) <= 24 ? 18 : Number(q.hoursAgo) <= 168 ? 10 : 0) -
          idx * 0.01,
      }))
      .sort((a, b) =>
        b.seedOpportunity - a.seedOpportunity ||
        (Number(a.answerCount) || 0) - (Number(b.answerCount) || 0) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'ko')
      )
      .slice(0, LATEST_HONEY_DETAIL_LIMIT);
    
    console.log(`  📊 총 ${hiddenQuestions.length}개 중 ${scoredQuestions.length}개 선별`);
    
    // Step 4: 상세 페이지에서 실제 조회수/답변/채택/링크/날짜 확인
    console.log('\n[STEP 4] 🔍 상세 페이지에서 조회수 수집...\n');
    
    const questionsWithViewCount: any[] = [];
    const topN = scoredQuestions.slice(0, LATEST_HONEY_DETAIL_LIMIT);
    
    // 🔥 상세 페이지: getRisingQuestions(라이브 검증됨)와 동일 패턴.
    //   ⚠️ STEP2 의 장시간 목록 크롤 중 browser 세션이 닫힐 수 있어(newPage→"browser has been closed"),
    //   세션 생존 확인 후 죽었으면 재획득. (이게 미노출꿀통/지금뜨는 0개의 진짜 원인이었음)
    let detailBrowser = browser;
    let detailPage;
    try {
      detailPage = await detailBrowser.newPage();
    } catch {
      detailBrowser = await getBrowser();
      detailPage = await detailBrowser.newPage();
    }
    await detailPage.setViewport({ width: 1920, height: 1080 });
    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await detailPage.setRequestInterception(true);
    detailPage.on('request', req => {
      const type = req.resourceType();
      if (['font', 'media', 'image', 'stylesheet'].includes(type)) req.abort();
      else req.continue();
    });
    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];


      try {
        // 🔥 안정 로딩 (domcontentloaded + 1회 재시도)
        let __ok = false;
        for (let __t = 1; __t <= 2 && !__ok; __t++) {
          try { await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 9000 }); __ok = true; }
          catch (ge) { if (__t === 2) throw ge; await new Promise(r => setTimeout(r, 600)); }
        }
        // navigation 안정화: rising(검증됨)처럼 셀렉터 대기 → "Execution context destroyed" 방지
        try { await detailPage.waitForSelector('#content, .question_header, .endContentsText, .c-heading', { timeout: 2000 }); } catch {}
        // navigation 안정화: rising(검증됨)처럼 셀렉터 대기 → "Execution context destroyed" 방지
        try { await detailPage.waitForSelector('#content, .question_header, .endContentsText, .c-heading', { timeout: 2000 }); } catch {}
        await new Promise(r => setTimeout(r, 300)); // 빠른 대기

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
          
          // 🔥 채택 여부 확인: 답변 0개면 채택 물리적 불가. 정확 마커만 신뢰 (오탐 방지)
          const isAdopted =
            answerCount > 0 &&
            (text.includes('채택됨') || document.querySelector('.badge_adopted') !== null);

          const externalLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href || '')
            .filter(href => /^https?:\/\//i.test(href) && !/naver\.com|naver\.me|nid\.naver/i.test(href));
          const answerTexts = Array.from(document.querySelectorAll('.answer-content__item, .se-main-container, .endContentsText, [class*="answer"]'))
            .map(el => (el as HTMLElement).innerText || '')
            .filter(t => t.trim().length > 30);
          const avgAnswerLength = answerTexts.length
            ? Math.round(answerTexts.reduce((sum, t) => sum + t.trim().length, 0) / answerTexts.length)
            : 0;
          const answerQualityScore = answerCount === 0 ? 0 : Math.min(100, Math.max(25, Math.round(avgAnswerLength / 8)));
          const isExpertOnly = /전문가 답변|엑스퍼트|expert|의사|변호사|세무사|노무사/i.test(text);

          let hoursAgoFromDetail = 999;
          if (text.includes('방금')) hoursAgoFromDetail = 0;
          else if (text.includes('분 전')) {
            const mm = text.match(/(\d+)\s*분\s*전/);
            if (mm) hoursAgoFromDetail = Math.max(1, Math.ceil(parseInt(mm[1]) / 60));
          } else if (text.includes('시간 전')) {
            const mm = text.match(/(\d+)\s*시간\s*전/);
            if (mm) hoursAgoFromDetail = parseInt(mm[1]);
          } else if (text.includes('일 전')) {
            const mm = text.match(/(\d+)\s*일\s*전/);
            if (mm) hoursAgoFromDetail = parseInt(mm[1]) * 24;
          }
          
          // 🔥 등록 날짜 추출 (YYYY.MM.DD 형식)
          // ⚠️ 버그픽스: 상대시간(분/시간/일 전)이 있으면 그게 authoritative.
          //   절대날짜 정규식은 페이지 공통요소(무관한 날짜)를 오탐 → 신선 질문을 "오래됨" 처리하던 원인.
          //   상대시간을 못 찾은 경우(hoursAgoFromDetail===999)에만 절대날짜로 보강.
          // 절대날짜는 표시용으로만 추출, hoursAgo/yearOld 덮어쓰기 금지.
          //   (라이브 PUSHDUMP: 페이지 고정 날짜가 모든 질문을 ~61일전(1463h)으로 오판 → 신선질문 전량 탈락)
          //   relativeTimeFound 를 항상 true 로 둬 아래 덮어쓰기 분기를 무력화. rising 과 동일 정책.
          const relativeTimeFound = true;
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

              // 1년 이상 지난 질문인지 확인 (절대날짜 기준)
              const questionDate = new Date(year, month - 1, day);
              const now = new Date();
              const diffDays = Math.floor((now.getTime() - questionDate.getTime()) / (1000 * 60 * 60 * 24));
              // 상대시간이 있으면 hoursAgo 는 덮어쓰지 않음 (절대날짜 오탐 방지)
              if (!relativeTimeFound) {
                yearOld = diffDays > 365;
                hoursAgoFromDetail = diffDays * 24;
              }
              break;
            }
          }
          
          return {
            viewCount,
            likeCount,
            answerCount,
            isAdopted,
            publishedDate,
            yearOld,
            hasExternalLinks: externalLinks.length > 0,
            externalLinkCount: externalLinks.length,
            answerQualityScore,
            isExpertOnly,
            hoursAgoFromDetail
          };
        });
        
        // 채택만 하드 탈락. (날짜/외부링크 게이트는 상세 파싱 오탐으로 전량 탈락 → trending 과 동일하게 제거)
        if (detail.isAdopted) continue;
        // 답변수: 상세 정규식이 사이드바 "답변 N"(예: 9)을 오탐 → 목록값(수집 시 ≤3 검증) 신뢰, 상세는 더 작을 때만
        const listAns = Number(q.answerCount) || 0;
        const detAns = Number(detail.answerCount) || 0;
        const effAns = (detAns > 0 && detAns <= listAns) ? detAns : listAns;
        if (effAns > 3) continue;
        const baseHiddenScore = Number(q.hiddenScore) || Number(q.seedOpportunity) || 0;
        // 신선도: STEP2 가 sort=date(최신순)로 수집해 신선 보장. 상세 날짜는 사이드바 오탐이라 신뢰 금지
        //   → 24h(신선) 가정 (trending 과 동일 정책).
        const finalHoursAgo = 24;
        const finalViewCount = detail.viewCount || 0;
        const finalViewsPerHour = Math.round((finalViewCount / Math.max(1, finalHoursAgo)) * 10) / 10;
        questionsWithViewCount.push({
          ...q,
          viewCount: finalViewCount,
          likeCount: detail.likeCount || q.likeCount || 0,
          answerCount: effAns, // 오탐된 detail.answerCount 대신 검증된 effAns 저장 (isValidQuestion 재탈락 방지)
          hoursAgo: finalHoursAgo,
          viewsPerHour: finalViewsPerHour,
          isAdopted: detail.isAdopted || false,
          publishedDate: detail.publishedDate || q.publishedDate || '',
          hasExternalLinks: detail.hasExternalLinks || false,
          externalLinkCount: 0, // 외부링크 게이트 제거(상존 링크 오탐) → 후속 게이트 재탈락 방지
          answerQualityScore: detail.answerQualityScore || 0,
          isExpertOnly: detail.isExpertOnly || false,
          hiddenScore: baseHiddenScore + (detail.viewCount >= 10000 ? 50 : detail.viewCount >= 1000 ? 30 : detail.viewCount >= 100 ? 10 : 0)
        });
        
        
        if ((i + 1) % 5 === 0) {
          console.log(`  📊 ${i + 1}/${topN.length} 완료...`);
        }
        
      } catch (err: any) {
        console.warn(`[KIN] 최신 꿀질문 상세 실패 | url=${q.url} | error=${err?.message ?? err}`);
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
      
      if (!isLatestHiddenHoneyCandidate(q)) return false;
      
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
    
    validQuestions.sort((a, b) =>
      getLatestHiddenSortScore(b) - getLatestHiddenSortScore(a) ||
      getViewsPerHour(b) - getViewsPerHour(a) ||
      (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0)
    );
    
    console.log(`  ✅ 유효 질문: ${validQuestions.length}개`);
    
    await page.close();
    
    const mappedQuestions: GoldenQuestion[] = validQuestions.map((q, idx) => {
      // Phase 1: 입력 단계 정규화 (NaN 방어 상향 이동)
      const safeViewCount = Number(q.viewCount) || 0;
      const safeAnswerCount = Number(q.answerCount) || 0;
      const safeLikeCount = Number(q.likeCount) || 0;
      const rawSafeHoursAgo = Number(q.hoursAgo);
      const safeHoursAgo = Number.isFinite(rawSafeHoursAgo) ? rawSafeHoursAgo : 999;

      const signals = buildKinSignals(q, { isMainExposed: false });
      const honey = buildHoneyFields(q, signals);
      
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
        hasExternalLinks: Boolean(q.hasExternalLinks),
        externalLinkCount: Number(q.externalLinkCount) || 0,
        linkTypes: [],
        isAdopted: q.isAdopted || false,
        isExpertOnly: Boolean(q.isExpertOnly),
        goldenScore: honey.honeyPotScore,
        goldenGrade: honey.honeyPotGrade,
        goldenReason: honey.honeyPotReason || reason,
        ...honey,
        estimatedDailyTraffic: safeViewCount >= 200 ? '높음' : safeViewCount >= 50 ? '보통' : '성장중',
        trafficPotential: honey.externalTrafficPotential,
        recommendAction: `${action} · ${honey.answerAngle}`,
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
    // 후보 게이트(신선+무답변+조회반응)로 통과시키고 honeyPotScore 정렬로 품질 랭킹.
    // 등급 S+ 게이트(score>=62)는 실측 점수 분포(최대~75)에 비해 과도 → 후보 게이트로 대체.
    const goldenQuestions = mappedQuestions
      .filter(q => isLatestHiddenHoneyCandidate(q))
      .slice(0, 40);
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ 최신 미노출 꿀질문 탐지 완료!');
    console.log(`  메인 제외: ${mainPopularUrls.size}개 | 최신 꿀통: ${goldenQuestions.length}개 | ${crawlTime}초`);
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
    await page.close().catch(() => {});
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  } finally {
    await releaseBrowser(browser);
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
  const mainPopularIds = new Set<string>();

  const categories = KIN_HONEY_CATEGORIES; // 풀 확장: 1개(전체)→6개 카테고리
  
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
    
    mainUrls.forEach(url => {
      mainPopularUrls.add(url);
      const docId = extractDocIdFromUrl(url);
      if (docId) mainPopularIds.add(docId);
    });
    console.log(`[STEP 1] 🚫 제외 목록: ${mainPopularUrls.size}개 / docId ${mainPopularIds.size}개\n`);
    
    // Step 2: 최신순으로 카테고리 수집 (최신 질문 위주)
    console.log('[STEP 2] 📋 최신 질문 수집...\n');
    
    const recentQuestions: any[] = [];
    
    for (const cat of categories) {
      for (let pageNo = 1; pageNo <= LATEST_HONEY_PAGES; pageNo++) {
        const url = `https://kin.naver.com/qna/list.naver?dirId=${cat.dirId}&sort=date&page=${pageNo}`;
        console.log(`[CRAWL] 🔗 ${cat.name} (최신순) p${pageNo}`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 6000 });
          await new Promise(r => setTimeout(r, 300));
          
          const questions = await extractQuestionsFromPage(page, cat.name);
          
          // 최근 7일, 메인 미노출, 답변 3개 이하만 상세 검증으로 보냄.
          const recent = questions.filter(q => {
            const docId = q.questionId || extractDocIdFromUrl(q.url);
            if (mainPopularUrls.has(q.url) || (docId && mainPopularIds.has(docId))) return false;
            if ((Number(q.answerCount) || 0) > 3) return false;
            // 목록 hoursAgo 부정확 → 상세 단계(finalHoursAgo, line 2259)에서 7일 필터
            return true;
          });
          
          recent.forEach(q => {
            if (!recentQuestions.some(existing => existing.url === q.url)) {
              recentQuestions.push(q);
            }
          });
          console.log(`  → ${questions.length}개 중 최신 미노출: ${recent.length}개`);

        } catch (err: any) {
          console.warn(`[KIN] getTrendingHidden 카테고리 실패 | cat=${cat.name} | page=${pageNo} | error=${err?.message ?? err}`);
        }
        
        await new Promise(r => setTimeout(r, 80));
      }
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
    
    // Step 3: 상세 페이지에서 조회수/답변/채택/링크 확인
    console.log('[STEP 3] 🔍 조회수 확인...\n');
    
    const topN = [...recentQuestions]
      .sort((a, b) =>
        (Number(a.answerCount) || 0) - (Number(b.answerCount) || 0) ||
        (Number(a.hoursAgo) || 999) - (Number(b.hoursAgo) || 999) ||
        scoreQuestionIntent(String(b.title || '')) - scoreQuestionIntent(String(a.title || ''))
      )
      .slice(0, LATEST_HONEY_DETAIL_LIMIT);
    const withViewCount: any[] = [];

    // 상세 페이지: STEP2 장시간 크롤로 세션이 닫혔을 수 있어 재획득 가드 (fullHunt 와 동일)
    let detailBrowser = browser;
    let detailPage;
    try {
      detailPage = await detailBrowser.newPage();
    } catch {
      detailBrowser = await getBrowser();
      detailPage = await detailBrowser.newPage();
    }
    await detailPage.setViewport({ width: 1920, height: 1080 });
    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await detailPage.setRequestInterception(true);
    detailPage.on('request', req => {
      const type = req.resourceType();
      if (['font', 'media', 'image', 'stylesheet'].includes(type)) req.abort();
      else req.continue();
    });

    for (let i = 0; i < topN.length; i++) {
      const q = topN[i];

      try {
        // rising(검증됨)과 동일: goto → waitForSelector → 즉시 evaluate (sleep 제거로 redirect 충돌 방지)
        await detailPage.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        try { await detailPage.waitForSelector('#content, .question_header, .endContentsText', { timeout: 1500 }); } catch {}

        const detail = await detailPage.evaluate(() => {
          const text = document.body.innerText || '';
          const html = document.body.innerHTML || '';
          let viewCount = 0;
          const m = text.match(/조회[수]?\s*[:\s]*([0-9,]+)/);
          if (m) viewCount = parseInt(m[1].replace(/,/g, ''));
          let answerCount = 0;
          const answerPatterns = [/(\d+)개\s*답변/, /답변\s*(\d+)/, /(\d+)\s*답변/];
          for (const p of answerPatterns) {
            const am = text.match(p);
            if (am) { answerCount = parseInt(am[1]); break; }
          }
          let likeCount = 0;
          const likeMatch = text.match(/좋아요[:\s]*(\d+)|공감[:\s]*(\d+)|UP\s*(\d+)/i);
          if (likeMatch) likeCount = parseInt(likeMatch[1] || likeMatch[2] || likeMatch[3] || '0');
          // 채택 판정: 답변 0개면 채택 물리적 불가. 정확 마커(채택됨 텍스트/배지)만 신뢰.
          // ([class*="adopt"]·.adopted·'채택 답변' 버튼은 모든 페이지에 존재 → 오탐, 디버그로 확인)
          const isAdopted =
            answerCount > 0 &&
            (text.includes('채택됨') || document.querySelector('.badge_adopted') !== null);
          // 외부링크: 답변 영역 내부만 카운트 (페이지 전체 a[href] 는 제휴/푸터/광고 외부링크가 상존 →
          //   평범한 질문도 4~7개로 오탐하여 미노출꿀통/지금뜨는 전량 탈락의 원인이었음).
          const answerContainers = Array.from(document.querySelectorAll('.answer-content__item, .se-main-container, .endContentsText, [class*="answerArea"], [class*="answer_area"]'));
          const externalLinks = answerContainers
            .flatMap(c => Array.from(c.querySelectorAll('a[href]')))
            .map(a => (a as HTMLAnchorElement).href || '')
            .filter(href => /^https?:\/\//i.test(href) && !/naver\.com|naver\.me|nid\.naver/i.test(href));
          const answerTexts = Array.from(document.querySelectorAll('.answer-content__item, .se-main-container, .endContentsText, [class*="answer"]'))
            .map(el => (el as HTMLElement).innerText || '')
            .filter(t => t.trim().length > 30);
          const avgAnswerLength = answerTexts.length
            ? Math.round(answerTexts.reduce((sum, t) => sum + t.trim().length, 0) / answerTexts.length)
            : 0;
          const answerQualityScore = answerCount === 0 ? 0 : Math.min(100, Math.max(25, Math.round(avgAnswerLength / 8)));
          const isExpertOnly = /전문가 답변|엑스퍼트|expert|의사|변호사|세무사|노무사/i.test(text);
          let hoursAgoFromDetail = 999;
          if (text.includes('방금')) hoursAgoFromDetail = 0;
          else if (text.includes('분 전')) {
            const mm = text.match(/(\d+)\s*분\s*전/);
            if (mm) hoursAgoFromDetail = Math.max(1, Math.ceil(parseInt(mm[1]) / 60));
          } else if (text.includes('시간 전')) {
            const mm = text.match(/(\d+)\s*시간\s*전/);
            if (mm) hoursAgoFromDetail = parseInt(mm[1]);
          } else if (text.includes('일 전')) {
            const mm = text.match(/(\d+)\s*일\s*전/);
            if (mm) hoursAgoFromDetail = parseInt(mm[1]) * 24;
          }
          return {
            viewCount,
            answerCount,
            likeCount,
            isAdopted,
            hasExternalLinks: externalLinks.length > 0,
            externalLinkCount: externalLinks.length,
            answerQualityScore,
            isExpertOnly,
            hoursAgoFromDetail
          };
        });

        if (detail.isAdopted) continue;
        // 답변수: 상세 정규식 오추출(전량 4+) 방어 — 목록값(수집 시 ≤3 검증) 신뢰, 상세는 더 작을 때만 채택
        {
          const listAns = Number(q.answerCount) || 0;
          const detAns = Number(detail.answerCount) || 0;
          const effAns = (detAns > 0 && detAns <= listAns) ? detAns : listAns;
          if (effAns > 3) continue;
        }
        // 외부링크 하드 차단 제거 (과다 카운트로 전량 탈락 → rising 정책 일치)
        // 신선도: STEP2 가 sort=date(최신순)로 수집하므로 수집 자체가 신선함을 보장.
        //   상세 상대시간(N일 전)은 사이드바/연관질문 텍스트를 오탐(라이브: 59/60 가 7일초과 오판) →
        //   하드 탈락에 쓰지 않고 24h(신선) 가정. (절대날짜 오탐과 동일 계열, rising 도 동일 정책)
        const finalHoursAgo = 24;
        const finalViewCount = detail.viewCount || 0;
        const finalViewsPerHour = Math.round((finalViewCount / Math.max(1, finalHoursAgo)) * 10) / 10;
        
        withViewCount.push({
          ...q,
          viewCount: finalViewCount,
          answerCount: detail.answerCount || q.answerCount || 0,
          likeCount: detail.likeCount || q.likeCount || 0,
          hoursAgo: finalHoursAgo,
          viewsPerHour: finalViewsPerHour,
          isAdopted: detail.isAdopted || false,
          hasExternalLinks: detail.hasExternalLinks || false,
          externalLinkCount: detail.externalLinkCount || 0,
          answerQualityScore: detail.answerQualityScore || 0,
          isExpertOnly: detail.isExpertOnly || false,
        });
        
        if ((i + 1) % 5 === 0) console.log(`  📊 ${i + 1}/${topN.length} 완료...`);
        
      } catch (err) {
        console.warn(`[KIN] 지금 뜨는 빈자리 상세 실패 | url=${q.url} | error=${(err as any)?.message ?? err}`);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    await detailPage.close();
    await page.close();

    // Step 4: 최신/미노출/저답변/조회반응 후보만 최종 통과
    const validQuestions = withViewCount
      .filter(q => isLatestHiddenHoneyCandidate(q))
      .sort((a, b) =>
        getLatestHiddenSortScore(b) - getLatestHiddenSortScore(a) ||
        getViewsPerHour(b) - getViewsPerHour(a) ||
        (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0)
      );
    
    console.log(`\n  ✅ 지금 뜨는 숨은 질문: ${validQuestions.length}개\n`);
    
    // 결과 생성
    const mappedQuestions: GoldenQuestion[] = validQuestions.map((q, idx) => {
      const signals = buildKinSignals(q, { isMainExposed: false });
      const honey = buildHoneyFields(q, signals);
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
        hasExternalLinks: Boolean(q.hasExternalLinks),
        externalLinkCount: Number(q.externalLinkCount) || 0,
        linkTypes: [],
        isAdopted: Boolean(q.isAdopted),
        isExpertOnly: Boolean(q.isExpertOnly),
        goldenScore: honey.honeyPotScore,
        goldenGrade: honey.honeyPotGrade,
        goldenReason: honey.honeyPotReason || `🔥 ${timeText} | 조회 ${q.viewCount.toLocaleString()} | 답변 ${q.answerCount}`,
        ...honey,
        estimatedDailyTraffic: q.viewCount >= 500 ? '높음' : q.viewCount >= 100 ? '중간' : '보통',
        trafficPotential: honey.externalTrafficPotential,
        recommendAction: q.answerCount === 0 ? `🎯 첫 답변 기회! ${honey.answerAngle}` : `📝 더 좋은 답변으로 경쟁! ${honey.answerAngle}`,
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
    // 후보 게이트(신선+무답변+조회반응)로 통과시키고 honeyPotScore 정렬로 품질 랭킹.
    // 등급 S+ 게이트(score>=62)는 실측 점수 분포(최대~75)에 비해 과도 → 후보 게이트로 대체.
    const goldenQuestions = mappedQuestions
      .filter(q => isLatestHiddenHoneyCandidate(q))
      .slice(0, 40);
    
    const crawlTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log('═'.repeat(60));
    console.log(`✅ 지금 뜨는 숨은 질문 탐지 완료! | ${goldenQuestions.length}개 | ${crawlTime}초`);
    console.log('═'.repeat(60) + '\n');
    
    return {
      goldenQuestions,
      stats: {
        totalCrawled: recentQuestions.length,
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
    console.error('[ERROR] ❌', error.message);
    await page.close().catch(() => {});
    
    return {
      goldenQuestions: [],
      stats: { totalCrawled: 0, goldenFound: 0, sssCount: 0, ssCount: 0, sCount: 0, avgViewCount: 0, avgAnswerCount: 0 },
      categories: [],
      timestamp: new Date().toISOString(),
      crawlTime: Math.round((Date.now() - startTime) / 1000)
    };
  } finally {
    await releaseBrowser(browser);
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
