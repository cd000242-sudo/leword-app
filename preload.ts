// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { SnippetLibraryFile } from './src/utils/snippet-library';
import { ProductDetailSnapshot } from './src/crawlers/types';

export type PublishType = 'draft' | 'now' | 'schedule';

/** ───────── ENV / 실행 타입 ───────── */
export type EnvConfig = {
  provider: 'openai' | 'gemini';
  openaiKey?: string;
  geminiKey?: string;

  /** Blogger & OAuth */
  blogId: string;
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;

  /** UI에서 문자열로 들어와도 허용, 저장 시 숫자로 보정 */
  minChars?: number | string;

  /** ✅ Google CSE 자동 링크용 자격증명(선택) */
  googleCseKey?: string; // Google CSE JSON API Key
  googleCseCx?: string;  // Programmable Search Engine ID (cx)

  /** ✅ BFL.AI FLUX.AI 이미지 생성용 API 키 */
  bflApiKey?: string;    // BFL.AI API Key for image generation

  /** ✅ Pexels 무료 이미지 검색용 API 키 */
  pexelsApiKey?: string; // Pexels API Key for free image search
};

export type PostPayload = EnvConfig & {
  topic: string;
  keywords: string;
  publishType: PublishType;
  scheduleISO?: string;
  thumbnailMode?: 'default' | 'bfl' | 'cse' | 'pexels';
  promptMode?: 'default' | 'custom';
  useGoogleSearch?: boolean;
  customPrompt?: string;
  pexelsApiKey?: string;
};

export type RunOk = { ok: true; logs?: string };
export type RunFail = { ok: false; exitCode?: number; logs?: string; error?: string };
export type RunResult = RunOk | RunFail;

/** 저장된 .env 로드 결과 */
export type GetEnvResult =
  | { ok: true; data: (Omit<EnvConfig, 'minChars'> & { minChars?: number }) | null }
  | { ok: false; error?: string };

/** ───────── 라이선스 타입 ───────── */
export type LicenseData = {
  maxUses: number;
  remaining: number;
  expiresAt: string;
};

/** ───────── 관리자 모드/진행률 이벤트 ───────── */
export type AdminModePayload = { enabled: boolean };
export type ProgressPayload = { p: number; label?: string };

/** 렌더러에서 사용할 API 모음 */
export type BloggerApi = {
  openLink(href: string): Promise<boolean>;

  saveEnv(env: EnvConfig): Promise<RunResult>;
  getEnv(): Promise<GetEnvResult>;
  setSettingsProtection(protectedMode: boolean): Promise<RunResult>;
  isSettingsProtected(): Promise<{ ok: boolean; protected?: boolean }>;
  validateEnv(): Promise<RunResult>;

  runPost(payload: PostPayload): Promise<RunResult>;

  /** 로그/진행률 구독 */
  onLog(listener: (line: string) => void): () => void;
  onProgress(listener: (payload: ProgressPayload) => void): () => void;

  /** 작업 취소 */
  cancelTask(): void;

  /** 라이선스 */
  subscribeLicense(): void; // 구독 시작 신호(중복 브로드캐스트 방지)
  getLicense(): Promise<{ ok: true; data: LicenseData }>;
  getLicenseInfo(): Promise<any>;
  registerLicense(data: any): Promise<any>;
  checkPremiumAccess(): Promise<any>;
  activateLicense(args: { code: string; who?: string }): Promise<{ ok: true; data: LicenseData } | { ok: false; error?: string }>;
  saveLicense(data: { maxUses: number; expiresAt: string; pin?: string }): Promise<
    | { ok: true; data: LicenseData }
    | { ok: false; error?: string }
  >;
  onLicenseUpdated(listener: (d: LicenseData) => void): () => void;

  /** ⚠️ onLicenseUpdated와 동시에 쓰지 마세요(구버전 호환용). */
  onLicense?(listener: (d: LicenseData) => void): () => void;

  /** 관리자 */
  adminAuth(pin: string): Promise<{ ok: true } | { ok: false; error?: string }>;
  setAdminPin(args: { oldPin: string; newPin: string }): Promise<{ ok: true } | { ok: false; error?: string }>;
  onAdminMode(listener: (enabled: boolean) => void): () => void;
  onAdminShortcut(listener: () => void): () => void;

  /** 워드프레스 카테고리 로드 */
  loadWordPressCategories(args: { siteUrl: string; username?: string; password?: string; clientId?: string; clientSecret?: string; jwtToken?: string }): Promise<{ ok: true; categories: any[] } | { ok: false; error?: string }>;
  /** 워드프레스 카테고리 로드 (별칭) */
  loadWpCategories(args: { wpUrl: string; wpUsername: string; wpPassword: string }): Promise<{ ok: boolean; categories?: Array<{ id: number; name: string; count: number }>; error?: string }>;

  /** 썸네일 생성 */
  makeThumb(args: { topic: string; mode?: 'default' | 'bfl' | 'cse' | 'pexels' }): Promise<{ ok: true; imageUrl: string } | { ok: false; error?: string }>;

  /** 콘텐츠 품질 분석 */
  analyzeContentQuality(args: { content: string; topic: string; keywords?: string[] }): Promise<{ ok: true; result: any } | { ok: false; error?: string }>;

  /** 스마트 키워드 생성 */
  generateSmartKeywords(args: { topic: string; baseKeywords?: string[] }): Promise<{ ok: true; result: any } | { ok: false; error?: string }>;

  /** CTA 클릭 로깅 */
  logCtaClick(payload: { role: string; url: string; sectionIndex?: number | string; timestamp: string; postId?: string }): Promise<void>;

  /** 스니펫 라이브러리 */
  getSnippetLibrary(): Promise<{ ok: boolean; data?: SnippetLibraryFile; error?: string }>;
  saveSnippetLibrary(library: SnippetLibraryFile): Promise<{ ok: boolean; error?: string }>;

  /** 상세페이지 스냅샷 크롤링 */
  crawlProductSnapshot(args: { url: string; forceParserId?: string }): Promise<{
    ok: boolean;
    data?: ProductDetailSnapshot;
    error?: string;
  }>;

  /** 트렌드 분석 */
  analyzeTrends(args: { topic: string; keywords?: string[] }): Promise<{ ok: true; result: any } | { ok: false; error?: string }>;

  /** 워드프레스 연결 테스트 */
  testWordPressConnection(args: { siteUrl: string; username: string; password: string }): Promise<{ ok: boolean; message?: string; error?: string }>;
  /** 워드프레스 카테고리 가져오기 */
  getWordPressCategories(args: { siteUrl: string; username: string; password: string }): Promise<{ ok: boolean; categories?: Array<{ id: number; name: string; count: number }>; error?: string }>;
  /** 워드프레스 태그 가져오기 */
  getWordPressTags(args: { siteUrl: string; username: string; password: string }): Promise<{ ok: boolean; tags?: Array<{ id: number; name: string; count: number }>; error?: string }>;

  /** Google CSE 연결 테스트 */
  testGoogleCseConnection(args: { googleCseKey: string; googleCseCx: string }): Promise<{ ok: boolean; message?: string; error?: string }>;

  /** 외부 브라우저로 URL 열기 */
  openExternal(url: string): Promise<boolean>;

  /** 프리미엄 기능 - 키워드 모니터링 */
  addMonitoringKeyword(keyword: string): Promise<any>;
  removeMonitoringKeyword(keyword: string): Promise<any>;
  getMonitoringKeywords(): Promise<any>;
  getKeywordMonitoringHistory(keyword: string): Promise<any>;
  startKeywordMonitoring(): Promise<any>;
  stopKeywordMonitoring(): Promise<any>;

  /** 프리미엄 기능 - 경쟁자 블로그 분석 */
  analyzeCompetitorBlog(blogUrl: string): Promise<any>;

  /** 프리미엄 기능 - 키워드 조합 생성 */
  generateKeywordCombinations(data: any): Promise<any>;

  /** 프리미엄 기능 - 수익 예측 계산 */
  calculateRevenuePrediction(data: any): Promise<any>;

  /** 프리미엄 기능 - 시즌별 키워드 캘린더 */
  getSeasonalKeywords(baseKeyword: string): Promise<any>;

  /** 프리미엄 기능 - SEO 체크리스트 */
  evaluateSEOChecklist(data: any): Promise<any>;

  /** 프리미엄 기능 - 경쟁자 키워드 역분석 */
  reverseAnalyzeKeywords(blogUrl: string): Promise<any>;

  /** 프리미엄 기능 - AI 골든타임 예측 */
  predictGoldenTime(data: any): Promise<any>;

  /** OAuth2 토큰 교환 */
  fetchToken(tokenData: any): Promise<any>;

  /** 블로거 인증 */
  startAuth(payload: any): Promise<{ success: boolean; authUrl?: string; error?: string }>;
  handleCallback(args: { payload: any; code: string }): Promise<{ success: boolean; error?: string }>;
  checkAuthStatus(): Promise<{ authenticated: boolean; error?: string }>;

  /** 인증 상태 확인 (메인 프로세스에서 호출용) */
  checkWordPressAuthStatus(): Promise<{ authenticated: boolean; error?: string }>;
  checkBloggerAuthStatus(): Promise<{ authenticated: boolean; error?: string }>;

  /** OAuth2 토큰 교환 */
  exchangeOAuthToken(args: { client_id: string; client_secret: string; code: string; redirect_uri: string }): Promise<{ success: boolean; access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; error?: string }>;

  /** 키워드 마스터 (leadernam 황금키워드) */
  openKeywordMasterWindow(): Promise<{ ok: boolean; error?: string }>;
  findGoldenKeywords(keyword: string): Promise<any[]>;
  stopKeywordDiscovery(keyword: string): Promise<{ success: boolean }>;
  getTrendingKeywords(source: 'naver' | 'google' | 'youtube'): Promise<any[]>;
  getRealtimeKeywords(options?: { platform?: 'zum' | 'google' | 'nate' | 'daum' | 'all', limit?: number }): Promise<{ success: boolean; data?: any; timestamp?: string; error?: string }>;
  checkKeywordRank(data: { keyword: string; blogUrl: string }): Promise<any>;
  analyzeCompetitors(keyword: string): Promise<any>;
  getSchedules(): Promise<any[]>;
  addSchedule(schedule: { name: string; time: string }): Promise<any>;
  toggleSchedule(id: string, enabled: boolean): Promise<any>;
  getNotifications(): Promise<any[]>;
  saveNotificationSettings(settings: any): Promise<any>;
  getDashboardStats(): Promise<any>;
  getKeywordGroups(): Promise<any[]>;
  addKeywordGroup(group: { name: string; color: string }): Promise<any>;
  updateKeywordGroup(id: string, updates: any): Promise<any>;
  deleteKeywordGroup(id: string): Promise<any>;
  getKeywordSchedules(): Promise<any[]>;
  addKeywordSchedule(scheduleData: any): Promise<any>;
  toggleKeywordSchedule(id: string, enabled: boolean): Promise<any>;
  getSNSTrends(platform: 'youtube'): Promise<any[]>;
  huntTimingGold(options?: { category?: string; limit?: number; offset?: number; refresh?: boolean }): Promise<any>;
  getGoogleTrendKeywords(): Promise<Array<{ rank: number; keyword: string; changeRate: number; category: string }>>;
  getYouTubeVideos(options?: { maxResults?: number }): Promise<any[]>;

  /** YouTube 심층 분석 */
  analyzeYouTubeTrends(params: { keyword?: string; maxResults?: number; categoryId?: string }): Promise<any>;
  getYouTubeTitlePatterns(params: { keyword?: string; maxResults?: number }): Promise<any>;
  getYouTubeContentOpportunity(params: { keyword: string; maxResults?: number }): Promise<any>;
  getYouTubeDemandSignals(params: { videoId: string }): Promise<any>;
  getYouTubeBenchmark(params: { keyword: string; maxResults?: number }): Promise<any>;
  getYouTubeGoldenKeywords(params: { maxResults?: number }): Promise<any>;

  /** 자동완성 키워드 조회 */
  getAutoComplete(keyword: string): Promise<string[]>;
  /** 연관 키워드 조회 */
  getRelatedKeywords(keyword: string): Promise<any[]>;

  /** user-config.json 저장/불러오기 */
  saveUserConfig(config: Record<string, any>): Promise<{ ok: true; logs: string } | { ok: false; error?: string }>;
  getUserConfig(): Promise<{ ok: true; data: Record<string, any> } | { ok: false; error?: string }>;

  /** 라이센스 파일 시스템 접근 */
  readLicenseFile(): Promise<{ ok: true; data: any } | { ok: false; error?: string }>;
  writeLicenseFile(data: any): Promise<{ ok: true } | { ok: false; error?: string }>;

  /** 플랫폼 연동 확인 */
  checkPlatformAuth(platform: 'blogger' | 'wordpress'): Promise<{ authenticated: boolean; error?: string }>;
  /** CSE 연동 테스트 */
  testCseConnection(cseKey: string, cseCx: string): Promise<{ success: boolean; error?: string }>;
  /** 블로그스팟 OAuth 인증 시작 */
  startBloggerAuth(): Promise<{ ok: boolean; authUrl?: string; error?: string }>;
  /** 블로그스팟 OAuth 코드 처리 */
  handleBloggerCallback(code: string): Promise<{ ok: boolean; error?: string }>;
  /** Blogger OAuth2 인증 */
  bloggerOAuth(oauthData: { clientId: string; clientSecret: string; redirectUri: string }): Promise<{ ok: boolean; error?: string }>;
  /** 환경설정 저장 */
  saveEnvironmentSettings(settings: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  /** 환경설정 로드 */
  loadEnvironmentSettings(): Promise<{ ok: boolean; data?: Record<string, string>; error?: string }>;

  /** 생성된 콘텐츠 발행 */
  publishContent(payload: any, title: string, content: string, thumbnailUrl: string): Promise<{ ok: boolean; url?: string; id?: string; error?: string }>;


  /** 백업 관리 */
  createBackup(): Promise<{ ok: boolean; error?: string }>;
  restoreBackup(): Promise<{ ok: boolean; error?: string }>;

  // 블로그스팟 인증 상태 확인
  checkBloggerAuthStatus(): Promise<{ authenticated: boolean; error?: string; message?: string }>;

  /** AI 이미지 생성 */
  generateAIImage(args: { prompt: string; type: string; size?: string }): Promise<{ success: boolean; imageUrl?: string; error?: string }>;
  crawlProductSnapshot(args: { url: string; forceParserId?: string }): Promise<{ ok: boolean; data?: any; error?: string }>;

  /** 🔥 100점짜리 뉴스 크롤링 (Main Process) */
  crawlNewsSnippets(keyword: string): Promise<string[]>;

  /** 🔥 100점짜리 연관 검색어 (Main Process) */
  fetchRealRelatedKeywords(keyword: string): Promise<string[]>;

  /** 🚀 원클릭 빈집털이 - 틈새 키워드 (Main Process) */
  getNicheKeywords(options?: any): Promise<any>;
  /** 🏆 Ultimate Niche Finder - 끝판왕 (Main Process) */
  findUltimateNicheKeywords(options: { seeds?: string[]; maxDepth?: number; targetCount?: number }): Promise<any>;
  /** 🔄 즉시 수집 실행 (Main Process) */
  collectNow(): Promise<{ success: boolean; error?: string }>;
  /** 📊 시스템 상태 조회 (Main Process) */
  getSystemStatus(): Promise<any>;

  /** 🤖 AI 챗봇 - Gemini 대화 (Main Process) */
  geminiChat(args: { apiKey: string; message: string; history: any[]; modelName?: string }): Promise<string>;
};

/** ───────── 공통 유틸 ───────── */
function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** ───────── IPC 구현 ───────── */
const api: BloggerApi = {
  openLink: (href) => ipcRenderer.invoke('open-link', href),

  // 저장 시 minChars를 숫자로 보정해서 main으로 전달
  // (googleCseKey/googleCseCx 포함되어 그대로 전달됨)
  saveEnv: (env) => {
    const minChars = toNumberOrUndefined(env.minChars);
    return ipcRenderer.invoke('save-env', { ...env, minChars });
  },

  getEnv: () => ipcRenderer.invoke('get-env'),
  setSettingsProtection: (protectedMode: boolean) => ipcRenderer.invoke('set-settings-protection', protectedMode),
  isSettingsProtected: () => ipcRenderer.invoke('is-settings-protected'),
  validateEnv: () => ipcRenderer.invoke('validate-env'),
  runPost: (p) => ipcRenderer.invoke('run-post', p),

  onLog: (listener) => {
    const handler = (_e: unknown, line: string) => { try { listener(line); } catch { } };
    ipcRenderer.on('log-line', handler);
    return () => ipcRenderer.off('log-line', handler);
  },

  // 블로그스팟 인증 상태 확인
  checkBloggerAuthStatus: () => ipcRenderer.invoke('blogger-check-auth-status'),

  // OAuth2 토큰 교환
  exchangeOAuthToken: (args) => ipcRenderer.invoke('exchange-oauth-token', args),

  // 진행률(막대바) 구독
  onProgress: (listener) => {
    const handler = (_e: unknown, payload: ProgressPayload) => {
      try { listener(payload); } catch { }
    };
    ipcRenderer.on('run-progress', handler);
    return () => ipcRenderer.off('run-progress', handler);
  },

  // 작업 취소
  cancelTask: () => ipcRenderer.send('cancel-task'),

  // 라이선스
  subscribeLicense: () => ipcRenderer.send('license:subscribe'),
  getLicense: () => ipcRenderer.invoke('get-license'),
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  registerLicense: (data: any) => ipcRenderer.invoke('register-license', data),
  checkPremiumAccess: () => ipcRenderer.invoke('check-premium-access'),
  activateLicense: (args) => ipcRenderer.invoke('activate-license', args),
  saveLicense: (data) => ipcRenderer.invoke('save-license', data),

  // 프리미엄 기능 - 키워드 모니터링
  addMonitoringKeyword: (keyword: string) => ipcRenderer.invoke('add-monitoring-keyword', keyword),
  removeMonitoringKeyword: (keyword: string) => ipcRenderer.invoke('remove-monitoring-keyword', keyword),
  getMonitoringKeywords: () => ipcRenderer.invoke('get-monitoring-keywords'),
  getKeywordMonitoringHistory: (keyword: string) => ipcRenderer.invoke('get-keyword-monitoring-history', keyword),
  startKeywordMonitoring: () => ipcRenderer.invoke('start-keyword-monitoring'),
  stopKeywordMonitoring: () => ipcRenderer.invoke('stop-keyword-monitoring'),
  analyzeCompetitorBlog: (blogUrl: string) => ipcRenderer.invoke('analyze-competitor-blog', blogUrl),
  generateKeywordCombinations: (data: any) => ipcRenderer.invoke('generate-keyword-combinations', data),
  calculateRevenuePrediction: (data: any) => ipcRenderer.invoke('calculate-revenue-prediction', data),
  getSeasonalKeywords: (baseKeyword: string) => ipcRenderer.invoke('get-seasonal-keywords', baseKeyword),
  evaluateSEOChecklist: (data: any) => ipcRenderer.invoke('evaluate-seo-checklist', data),
  reverseAnalyzeKeywords: (blogUrl: string) => ipcRenderer.invoke('reverse-analyze-keywords', blogUrl),
  predictGoldenTime: (data: any) => ipcRenderer.invoke('predict-golden-time', data),

  onLicenseUpdated: (listener) => {
    const handler = (_e: unknown, d: LicenseData) => { try { listener(d); } catch { } };
    ipcRenderer.on('license-updated', handler);
    return () => ipcRenderer.off('license-updated', handler);
  },

  // ✅ alias (구버전 호환) — 둘 중 하나만 사용
  onLicense: (listener) => {
    const handler = (_e: unknown, d: LicenseData) => { try { listener(d); } catch { } };
    ipcRenderer.on('license-updated', handler);
    return () => ipcRenderer.off('license-updated', handler);
  },

  // ── 관리자 모드 ──
  adminAuth: (pin: string) => ipcRenderer.invoke('admin-auth', pin),
  setAdminPin: (args) => ipcRenderer.invoke('set-admin-pin', args),

  onAdminMode: (listener) => {
    const handler = (_e: unknown, payload: AdminModePayload) => {
      try { listener(!!payload?.enabled); } catch { }
    };
    ipcRenderer.on('admin-mode', handler);
    return () => ipcRenderer.off('admin-mode', handler);
  },

  onAdminShortcut: (listener) => {
    const handler = () => {
      try { listener(); } catch { }
    };
    ipcRenderer.on('admin-shortcut', handler);
    return () => ipcRenderer.off('admin-shortcut', handler);
  },

  // ── 워드프레스 카테고리 로드 ──
  loadWordPressCategories: (args: { siteUrl: string; username?: string; password?: string; clientId?: string; clientSecret?: string; jwtToken?: string }) => ipcRenderer.invoke('load-wordpress-categories', args),
  loadWpCategories: (args: { wpUrl: string; wpUsername: string; wpPassword: string }) => ipcRenderer.invoke('loadWpCategories', args),

  // ── 썸네일 생성 ──
  makeThumb: (payload: { topic: string; mode?: 'default' | 'bfl' | 'cse' | 'pexels' }) => ipcRenderer.invoke('make-thumb', payload),

  // ── 콘텐츠 품질 분석 ──
  analyzeContentQuality: (args) => ipcRenderer.invoke('analyze-content-quality', args),

  // ── 스마트 키워드 생성 ──
  generateSmartKeywords: (args) => ipcRenderer.invoke('generate-smart-keywords', args),

  // ── CTA 클릭 로깅 ──
  logCtaClick: (payload: { role: string; url: string; sectionIndex?: number | string; timestamp: string; postId?: string }) =>
    ipcRenderer.invoke('log-cta-click', payload),

  getSnippetLibrary: () => ipcRenderer.invoke('get-snippet-library'),
  saveSnippetLibrary: (library: SnippetLibraryFile) => ipcRenderer.invoke('save-snippet-library', library),

  // ── 트렌드 분석 ──
  analyzeTrends: (args) => ipcRenderer.invoke('analyze-trends', args),

  // ── 워드프레스 연결 테스트 ──
  testWordPressConnection: (args) => ipcRenderer.invoke('test-wordpress-connection', args),
  getWordPressCategories: (args) => ipcRenderer.invoke('get-wordpress-categories', args),
  getWordPressTags: (args) => ipcRenderer.invoke('get-wordpress-tags', args),

  // ── 블로거 인증 ──
  startAuth: (payload) => ipcRenderer.invoke('blogger-start-auth', payload),
  handleCallback: (args) => ipcRenderer.invoke('blogger-handle-callback', args),
  checkAuthStatus: () => ipcRenderer.invoke('blogger-check-auth-status'),

  // ── 인증 상태 확인 (메인 프로세스에서 호출용) ──
  checkWordPressAuthStatus: () => ipcRenderer.invoke('wordpress-check-auth-status'),

  // ── Google CSE 연동 확인 ──
  testGoogleCseConnection: (args) => ipcRenderer.invoke('test-google-cse-connection', args),

  // ── user-config.json 저장/불러오기 ──
  saveUserConfig: (config) => ipcRenderer.invoke('save-user-config', config),
  getUserConfig: () => ipcRenderer.invoke('get-user-config'),

  // ── 외부 브라우저로 링크 열기 ──
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ── OAuth2 토큰 교환 ──
  fetchToken: (tokenData) => ipcRenderer.invoke('fetch-token', tokenData),

  // ── 라이센스 파일 시스템 접근 ──
  readLicenseFile: () => ipcRenderer.invoke('read-license-file'),
  writeLicenseFile: (data) => ipcRenderer.invoke('write-license-file', data),

  // ── 플랫폼 연동 확인 ──
  checkPlatformAuth: (platform) => ipcRenderer.invoke('check-platform-auth', platform),
  testCseConnection: (cseKey, cseCx) => ipcRenderer.invoke('test-cse-connection', { cseKey, cseCx }),

  // ── 블로그스팟 OAuth ──
  startBloggerAuth: () => ipcRenderer.invoke('start-blogger-auth'),
  handleBloggerCallback: (code) => ipcRenderer.invoke('blogger-handle-callback', { code }),
  /** Blogger OAuth2 인증 */
  bloggerOAuth: (oauthData: { clientId: string; clientSecret: string; redirectUri: string }) => ipcRenderer.invoke('blogger:oauth', oauthData),
  saveEnvironmentSettings: (settings) => ipcRenderer.invoke('save-environment-settings', settings),
  loadEnvironmentSettings: () => ipcRenderer.invoke('load-environment-settings'),

  // ── 워드프레스 연동 ──

  // ── 생성된 콘텐츠 발행 ──
  publishContent: (payload, title, content, thumbnailUrl) => ipcRenderer.invoke('publish-content', { payload, title, content, thumbnailUrl }),


  // ── 백업 관리 ──
  createBackup: () => ipcRenderer.invoke('create-backup'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),

  // ── AI 이미지 생성 ──
  generateAIImage: (args) => ipcRenderer.invoke('generate-ai-image', args),
  crawlProductSnapshot: (args) => ipcRenderer.invoke('crawl-product-snapshot', args),

  // ── 키워드 마스터 ──
  openKeywordMasterWindow: () => ipcRenderer.invoke('open-keyword-master-window'),
  findGoldenKeywords: (keyword: string, options?: any) => ipcRenderer.invoke('find-golden-keywords', keyword, options),
  stopKeywordDiscovery: (keyword: string) => ipcRenderer.invoke('stop-keyword-discovery', keyword),
  getTrendingKeywords: (source: 'naver' | 'google' | 'youtube') => ipcRenderer.invoke('get-trending-keywords', source),
  getRealtimeKeywords: (options?: { platform?: 'zum' | 'google' | 'nate' | 'daum' | 'all', limit?: number }) => ipcRenderer.invoke('get-realtime-keywords', options),
  checkKeywordRank: (data: { keyword: string; blogUrl: string }) => ipcRenderer.invoke('check-keyword-rank', data),
  analyzeCompetitors: (keyword: string) => ipcRenderer.invoke('analyze-competitors', keyword),
  getSchedules: () => ipcRenderer.invoke('get-schedules'),
  addSchedule: (schedule: { name: string; time: string }) => ipcRenderer.invoke('add-schedule', schedule),
  toggleSchedule: (id: string, enabled: boolean) => ipcRenderer.invoke('toggle-schedule', id, enabled),
  getNotifications: () => ipcRenderer.invoke('get-notifications'),
  saveNotificationSettings: (settings: any) => ipcRenderer.invoke('save-notification-settings', settings),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getKeywordGroups: () => ipcRenderer.invoke('get-keyword-groups'),
  addKeywordGroup: (group: { name: string; color: string }) => ipcRenderer.invoke('add-keyword-group', group),
  updateKeywordGroup: (id: string, updates: any) => ipcRenderer.invoke('update-keyword-group', id, updates),
  deleteKeywordGroup: (id: string) => ipcRenderer.invoke('delete-keyword-group', id),
  getKeywordSchedules: () => ipcRenderer.invoke('get-keyword-schedules'),
  addKeywordSchedule: (scheduleData: any) => ipcRenderer.invoke('add-keyword-schedule', scheduleData),
  toggleKeywordSchedule: (id: string, enabled: boolean) => ipcRenderer.invoke('toggle-keyword-schedule', id, enabled),
  getSNSTrends: (platform: 'youtube') => ipcRenderer.invoke('get-sns-trends', platform),
  huntTimingGold: (options?: { category?: string; limit?: number; offset?: number; refresh?: boolean }) => ipcRenderer.invoke('hunt-timing-gold', options),
  getYouTubeVideos: (options?: { maxResults?: number }) => ipcRenderer.invoke('get-youtube-videos', options),

  // YouTube 심층 분석
  analyzeYouTubeTrends: (params: { keyword?: string; maxResults?: number; categoryId?: string }) =>
    ipcRenderer.invoke('youtube-trend-analysis', params),
  getYouTubeTitlePatterns: (params: { keyword?: string; maxResults?: number }) =>
    ipcRenderer.invoke('youtube-title-patterns', params),
  getYouTubeContentOpportunity: (params: { keyword: string; maxResults?: number }) =>
    ipcRenderer.invoke('youtube-content-opportunity', params),
  getYouTubeDemandSignals: (params: { videoId: string }) =>
    ipcRenderer.invoke('youtube-demand-signals', params),
  getYouTubeBenchmark: (params: { keyword: string; maxResults?: number }) =>
    ipcRenderer.invoke('youtube-benchmark', params),
  getYouTubeGoldenKeywords: (params: { maxResults?: number }) =>
    ipcRenderer.invoke('youtube-golden-keywords', params),

  getGoogleTrendKeywords: () => ipcRenderer.invoke('get-google-trend-keywords'),

  // 자동완성 및 연관 키워드 조회
  getAutoComplete: (keyword: string) => ipcRenderer.invoke('get-autocomplete-keywords', keyword),
  getRelatedKeywords: (keyword: string) => ipcRenderer.invoke('get-related-keywords', keyword),

  // 🔥 100점짜리 뉴스 크롤링 (IPC Bridge)
  crawlNewsSnippets: (keyword: string) => ipcRenderer.invoke('crawl-news-snippets', keyword),

  // 🔥 100점짜리 연관 검색어 (IPC Bridge)
  fetchRealRelatedKeywords: (keyword: string) => ipcRenderer.invoke('fetch-real-related-keywords', keyword),

  // 🚀 원클릭 빈집털이 - 틈새 키워드 (IPC Bridge)
  getNicheKeywords: (options: any) => ipcRenderer.invoke('get-niche-keywords', options),
  // 🏆 Ultimate Niche Finder - 끝판왕 (IPC Bridge)
  findUltimateNicheKeywords: (options: any) => ipcRenderer.invoke('find-ultimate-niche-keywords', options),
  // 🔄 즉시 수집 실행 (IPC Bridge)
  collectNow: () => ipcRenderer.invoke('collect-now'),
  // 📊 시스템 상태 조회 (IPC Bridge)
  getSystemStatus: () => ipcRenderer.invoke('get-system-status'),

  // 🤖 AI 챗봇 - Gemini 대화 (IPC Bridge)
  geminiChat: (args: any) => ipcRenderer.invoke('gemini-chat', args),

};

// Electron API (개발자 모드 체크 포함)
const electronApi = {
  ...api,
  // IPC 직접 호출 메서드 (모든 IPC 핸들러 호출 가능)
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  // IPC 이벤트 구독 (필요 이벤트만 허용)
  on: (channel: string, listener: (...args: any[]) => void) => {
    const allowed = new Set<string>([
      'keyword-expansion-progress',
      'keyword-discovery-progress',
      'keyword-discovery-chunk',
      'ultimate-niche-progress',
      'keyWizard:progress',
      'keyWizard:result'
    ]);
    if (!allowed.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    const handler = (_e: unknown, payload: any) => {
      try { listener(payload); } catch { }
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  },
  off: (channel: string, listener: (...args: any[]) => void) => {
    // Note: this is a best-effort helper; prefer using the unsubscribe returned by on().
    try {
      ipcRenderer.off(channel, listener as any);
    } catch {
      // ignore
    }
  },
  // 개발자 모드 확인
  isDeveloperMode: () => ipcRenderer.invoke('is-developer-mode'),
  // 패키징 여부 확인
  isPackaged: async () => {
    try {
      return await ipcRenderer.invoke('is-packaged');
    } catch {
      return false; // 기본값: 개발 모드로 간주
    }
  },
};

contextBridge.exposeInMainWorld('blogger', api);
contextBridge.exposeInMainWorld('electron', electronApi);
// 메인 프로세스에서 호출하는 함수들을 위한 별칭 (isPackaged 및 invoke 포함)
const electronApiForWindow = {
  ...api,
  ...electronApi, // invoke, isDeveloperMode, isPackaged 포함
};
contextBridge.exposeInMainWorld('electronAPI', electronApiForWindow);


// 콘텐츠 변형을 위한 추가 API
contextBridge.exposeInMainWorld('api', {
  envLoad: () => ipcRenderer.invoke('get-env'),
  crawlUrl: (url: string) => ipcRenderer.invoke('crawl-url', url),
  transformContent: (args: { content: string; options?: any }) => ipcRenderer.invoke('transform-content', args),
});

// 전역 선언 (TS에서 안전하게 window.blogger, window.electronAPI 사용)
declare global {
  interface Window {
    blogger: BloggerApi;
    electronAPI: typeof electronApiForWindow;
    api: {
      envLoad: () => Promise<GetEnvResult>;
      crawlUrl: (url: string) => Promise<any>;
      transformContent: (args: { content: string; options?: any }) => Promise<any>;
    };
  }
}