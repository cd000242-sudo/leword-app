/**
 * 환경변수 로딩 및 네이버 API 연동 확인 시스템
 */

import * as path from 'path';
import * as fs from 'fs';

export interface EnvConfig {
  networkOptimization?: {
    apiDelay?: number;
    batchSize?: number;
    timeout?: number;
    retryCount?: number;
    parallelLimit?: number;
    cacheEnabled?: boolean;
    cacheTTL?: number;
  };
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;          // Claude API key (sk-ant-...)
  aiInferenceMode?: 'claude' | 'rule' | 'auto';   // 기본 'auto'
  pexelsApiKey?: string;
  dalleApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  naverSearchAdAccessLicense?: string;
  naverSearchAdSecretKey?: string;
  naverSearchAdCustomerId?: string; // 고객 ID (X-Customer 헤더용)
  googleApiKey?: string;
  googleCseKey?: string;
  googleCseId?: string;
  googleCseCx?: string;
  youtubeApiKey?: string;
  // ── Key Wizard 신규 필드 (v2.4.0) ──
  youtubeOAuthClientId?: string;
  youtubeOAuthClientSecret?: string;
  youtubeOAuthAccessToken?: string;
  youtubeOAuthRefreshToken?: string;
  youtubeTokenExpiresAt?: number;
  threadsAppId?: string;
  threadsAppSecret?: string;
  threadsAccessToken?: string;
  threadsTokenExpiresAt?: number;
  rakutenApplicationId?: string;
  bigkindsAccessKey?: string;
  massCrawlingEnabled: boolean;
  maxConcurrentRequests: number;
  maxResultsPerSource: number;
  enableFullContentCrawling: boolean;
  mockDate?: string; // 테스트를 위한 가상 날짜 (예: '2025-12-31')
}

export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private config: EnvConfig;
  private configPath: string;

  constructor() {
    // 사용자별 환경변수 경로 설정
    // Electron 앱인 경우 app.getPath('userData') 사용
    let basePath: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      if (app && typeof app.getPath === 'function') {
        basePath = app.getPath('userData');
        console.log('[ENV] Electron 앱 경로 사용:', basePath);
      } else {
        throw new Error('app.getPath not available');
      }
    } catch {
      // Electron이 아닌 환경 (CLI 등)
      const appData = process.env['APPDATA'] || '';
      const localAppData = process.env['LOCALAPPDATA'] || '';

      // Electron userData 기본 규칙: %APPDATA%\\<productName>
      // 우리 앱 productName은 package.json 기준 "LEWORD"
      const candidates = [
        appData ? path.join(appData, 'LEWORD') : '',
        appData ? path.join(appData, 'leword') : '',
        localAppData ? path.join(localAppData, 'LEWORD') : '',
        localAppData ? path.join(localAppData, 'leword') : ''
      ].filter(Boolean);

      const found = candidates.find(p => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });

      basePath = found || appData || process.env['HOME'] || process.cwd();
      console.log('[ENV] 일반 환경 경로 사용:', basePath);
    }

    this.configPath = path.join(basePath, 'config.json');

    console.log('[ENV] Config 파일 경로:', this.configPath);
    this.config = this.loadConfig();
  }

  /**
   * 설정 강제 리로드 (config.json 파일에서 다시 읽기)
   */
  reloadConfig(): void {
    console.log('[ENV] 설정 강제 리로드 시작...');
    this.config = this.loadConfig();
    console.log('[ENV] 설정 리로드 완료:', {
      hasSearchAdLicense: !!this.config.naverSearchAdAccessLicense,
      hasSearchAdSecret: !!this.config.naverSearchAdSecretKey,
      hasSearchAdCustomerId: !!this.config.naverSearchAdCustomerId,
      licenseLength: this.config.naverSearchAdAccessLicense?.length || 0,
      secretLength: this.config.naverSearchAdSecretKey?.length || 0,
      customerIdLength: this.config.naverSearchAdCustomerId?.length || 0,
      customerIdValue: this.config.naverSearchAdCustomerId || '없음'
    });
  }

  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * .env 파일 경로 가져오기
   */
  private getEnvPath(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      if (app && typeof app.getPath === 'function') {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, '.env');
      }
    } catch { /* no electron */ }
    const base = process.env['APPDATA'] || process.env['LOCALAPPDATA'] || process.env['HOME'] || process.cwd();
    return path.join(base, 'blogger-gpt-cli', '.env');
  }

  /**
   * .env 파일 파싱
   */
  private parseDotEnv(str: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!str) return out;

    // JSON 형식인지 확인
    if (str.trim().startsWith('{')) {
      try {
        const jsonData = JSON.parse(str);
        // JSON에서 apiKeys 섹션 추출
        if (jsonData.apiKeys) {
          const apiKeys = jsonData.apiKeys;
          // 환경 변수 이름으로 매핑
          if (apiKeys['gemini']) out['GEMINI_API_KEY'] = apiKeys['gemini'];
          if (apiKeys['naverClientId']) out['NAVER_CLIENT_ID'] = apiKeys['naverClientId'];
          if (apiKeys['naverClientSecret']) out['NAVER_CLIENT_SECRET'] = apiKeys['naverClientSecret'];
          if (apiKeys['googleClientId']) out['GOOGLE_CLIENT_ID'] = apiKeys['googleClientId'];
          if (apiKeys['googleClientSecret']) out['GOOGLE_CLIENT_SECRET'] = apiKeys['googleClientSecret'];
          if (apiKeys['youtubeApiKey']) out['YOUTUBE_API_KEY'] = apiKeys['youtubeApiKey'];
        }
        return out;
      } catch (e) {
        console.warn('[ENV] JSON 파싱 실패, 일반 형식으로 시도:', e);
      }
    }

    // 일반 KEY=VALUE 형식 파싱
    for (const raw of str.split(/\r?\n/)) {
      const line = (raw || '').trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || !m[1]) continue;
      const k = m[1];
      let v = (m[2] || '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      v = v.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      out[k] = v;
    }
    return out;
  }

  /**
   * 설정 로드 (개선된 버전 - .env 파일 지원 추가)
   */
  private loadConfig(): EnvConfig {
    try {
      // 1. 먼저 .env 파일에서 로드 (기존에 저장된 API 키)
      let envFileConfig: Record<string, string> = {};

      // 프로젝트 루트의 .env 파일도 확인
      const projectRootEnv = path.join(process.cwd(), '.env');
      if (fs.existsSync(projectRootEnv)) {
        try {
          const raw = fs.readFileSync(projectRootEnv, 'utf-8');
          const parsed = this.parseDotEnv(raw);
          envFileConfig = { ...envFileConfig, ...parsed };
          console.log('[ENV] 프로젝트 루트 .env 파일에서 설정 로드:', projectRootEnv);
        } catch (error) {
          console.warn('[ENV] 프로젝트 루트 .env 파일 읽기 실패:', error);
        }
      }

      // 사용자 데이터 디렉토리의 .env 파일 확인
      const envPath = this.getEnvPath();
      if (fs.existsSync(envPath)) {
        try {
          const raw = fs.readFileSync(envPath, 'utf-8');
          const parsed = this.parseDotEnv(raw);
          envFileConfig = { ...envFileConfig, ...parsed }; // 병합 (사용자 데이터 디렉토리가 우선)
          console.log('[ENV] 사용자 데이터 디렉토리 .env 파일에서 설정 로드:', envPath);
        } catch (envFileError) {
          console.warn('[ENV] 사용자 데이터 디렉토리 .env 파일 읽기 실패:', envFileError);
        }
      }

      // 2. 환경변수에서 로드 (process.env 직접 확인)
      // Electron 앱에서 환경변수가 제대로 로드되지 않을 수 있으므로 더 자세한 로그
      const naverClientIdFromEnv = process.env['NAVER_CLIENT_ID'];
      const naverClientSecretFromEnv = process.env['NAVER_CLIENT_SECRET'];

      if (naverClientIdFromEnv || naverClientSecretFromEnv) {
        console.log('[ENV] 환경변수에서 네이버 API 키 발견:', {
          hasClientId: !!naverClientIdFromEnv,
          hasClientSecret: !!naverClientSecretFromEnv,
          clientIdLength: naverClientIdFromEnv?.length || 0,
          clientSecretLength: naverClientSecretFromEnv?.length || 0
        });
      }

      const envConfig: EnvConfig = {
        openaiApiKey: envFileConfig['OPENAI_API_KEY'] || envFileConfig['DALLE_API_KEY'] || process.env['OPENAI_API_KEY'] || process.env['DALLE_API_KEY'] || '',
        geminiApiKey: envFileConfig['GEMINI_API_KEY'] || envFileConfig['GEMINI_KEY'] || process.env['GEMINI_API_KEY'] || process.env['GEMINI_KEY'] || '',
        anthropicApiKey: envFileConfig['ANTHROPIC_API_KEY'] || envFileConfig['CLAUDE_API_KEY'] || process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
        aiInferenceMode: ((envFileConfig['AI_INFERENCE_MODE'] || process.env['AI_INFERENCE_MODE'] || 'auto').toLowerCase() as 'claude' | 'rule' | 'auto'),
        pexelsApiKey: envFileConfig['PEXELS_API_KEY'] || process.env['PEXELS_API_KEY'] || '',
        dalleApiKey: envFileConfig['DALLE_API_KEY'] || envFileConfig['OPENAI_API_KEY'] || process.env['DALLE_API_KEY'] || process.env['OPENAI_API_KEY'] || '',
        naverClientId: envFileConfig['NAVER_CLIENT_ID'] || process.env['NAVER_CLIENT_ID'] || '',
        naverClientSecret: envFileConfig['NAVER_CLIENT_SECRET'] || process.env['NAVER_CLIENT_SECRET'] || '',
        naverSearchAdAccessLicense: envFileConfig['NAVER_SEARCH_AD_ACCESS_LICENSE'] || envFileConfig['naverSearchAdAccessLicense'] || envFileConfig['naver_search_ad_access_license'] ||
          process.env['NAVER_SEARCH_AD_ACCESS_LICENSE'] || process.env['naverSearchAdAccessLicense'] || process.env['naver_search_ad_access_license'] || '',
        naverSearchAdSecretKey: envFileConfig['NAVER_SEARCH_AD_SECRET_KEY'] || envFileConfig['naverSearchAdSecretKey'] || envFileConfig['naver_search_ad_secret_key'] ||
          process.env['NAVER_SEARCH_AD_SECRET_KEY'] || process.env['naverSearchAdSecretKey'] || process.env['naver_search_ad_secret_key'] || '',
        naverSearchAdCustomerId: envFileConfig['NAVER_SEARCH_AD_CUSTOMER_ID'] || envFileConfig['naverSearchAdCustomerId'] || envFileConfig['naver_search_ad_customer_id'] ||
          process.env['NAVER_SEARCH_AD_CUSTOMER_ID'] || process.env['naverSearchAdCustomerId'] || process.env['naver_search_ad_customer_id'] || '',
        googleApiKey: envFileConfig['GOOGLE_API_KEY'] || envFileConfig['GOOGLE_CSE_KEY'] || envFileConfig['GOOGLE_CSE_API_KEY'] ||
          process.env['GOOGLE_API_KEY'] || process.env['GOOGLE_CSE_KEY'] || process.env['GOOGLE_CSE_API_KEY'] || '',
        googleCseId: envFileConfig['GOOGLE_CSE_ID'] || envFileConfig['GOOGLE_CSE_CX'] || process.env['GOOGLE_CSE_ID'] || process.env['GOOGLE_CSE_CX'] || '',
        youtubeApiKey: envFileConfig['YOUTUBE_API_KEY'] || envFileConfig['youtubeApiKey'] || envFileConfig['youtube_api_key'] ||
          process.env['YOUTUBE_API_KEY'] || process.env['youtubeApiKey'] || process.env['youtube_api_key'] || '',
        massCrawlingEnabled: process.env['MASS_CRAWLING_ENABLED'] !== 'false',
        maxConcurrentRequests: parseInt(process.env['MAX_CONCURRENT_REQUESTS'] || '30'),
        maxResultsPerSource: parseInt(process.env['MAX_RESULTS_PER_SOURCE'] || '1000'),
        enableFullContentCrawling: process.env['ENABLE_FULL_CONTENT_CRAWLING'] !== 'false',
        mockDate: envFileConfig['MOCK_DATE'] || process.env['MOCK_DATE'] || ''
      };

      // 3. config.json 파일에서 설정 로드 시도 (가장 우선순위 높음)
      // Electron 앱인 경우 app.getPath('userData')로 경로 재확인
      let actualConfigPath = this.configPath;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
          const electronConfigPath = path.join(app.getPath('userData'), 'config.json');
          console.log('[ENV] Electron 경로 확인:', electronConfigPath);
          if (fs.existsSync(electronConfigPath)) {
            actualConfigPath = electronConfigPath;
            console.log('[ENV] ✅ Electron 경로의 config.json 파일 발견:', actualConfigPath);
          }
        }
      } catch {
        // Electron이 아니거나 app이 아직 준비되지 않음
      }

      if (fs.existsSync(actualConfigPath)) {
        try {
          let fileConfigRaw = fs.readFileSync(actualConfigPath, 'utf8');

          // BOM 제거 (UTF-8 BOM이 있는 경우)
          if (fileConfigRaw.charCodeAt(0) === 0xFEFF) {
            fileConfigRaw = fileConfigRaw.slice(1);
            console.log('[ENV] BOM 제거됨');
          }

          // 앞뒤 공백 및 줄바꿈 제거
          fileConfigRaw = fileConfigRaw.trim();

          // 빈 파일 체크
          if (!fileConfigRaw || fileConfigRaw.length === 0) {
            console.warn('[ENV] ⚠️ config.json 파일이 비어있습니다');
            throw new Error('Empty config file');
          }

          const fileConfig = JSON.parse(fileConfigRaw);
          console.log('[ENV] ✅ config.json 파일 내용 로드 성공:', {
            filePath: actualConfigPath,
            fileSize: fileConfigRaw.length,
            hasSearchAdLicense: !!fileConfig.naverSearchAdAccessLicense,
            hasSearchAdSecret: !!fileConfig.naverSearchAdSecretKey,
            hasSearchAdCustomerId: !!fileConfig.naverSearchAdCustomerId,
            licenseLength: fileConfig.naverSearchAdAccessLicense?.length || 0,
            secretLength: fileConfig.naverSearchAdSecretKey?.length || 0,
            customerIdLength: fileConfig.naverSearchAdCustomerId?.length || 0,
            customerIdValue: fileConfig.naverSearchAdCustomerId || '없음',
            allKeys: Object.keys(fileConfig)
          });

          // 파일 설정이 .env와 환경변수보다 우선 (가장 최신 설정)
          const mergedConfig = { ...envConfig, ...fileConfig };
          console.log('[ENV] ✅ config.json에서 설정 로드 완료:', actualConfigPath);
          console.log('[ENV] ✅ 최종 설정 상태:', {
            naverClientId: mergedConfig.naverClientId ? `✅ (${mergedConfig.naverClientId.length}자)` : '❌',
            naverClientSecret: mergedConfig.naverClientSecret ? `✅ (${mergedConfig.naverClientSecret.length}자)` : '❌',
            youtubeApiKey: mergedConfig.youtubeApiKey ? `✅ (${mergedConfig.youtubeApiKey.length}자)` : '❌',
            naverSearchAdAccessLicense: mergedConfig.naverSearchAdAccessLicense ? `✅ (${mergedConfig.naverSearchAdAccessLicense.length}자)` : '❌',
            naverSearchAdSecretKey: mergedConfig.naverSearchAdSecretKey ? `✅ (${mergedConfig.naverSearchAdSecretKey.length}자)` : '❌',
            naverSearchAdCustomerId: mergedConfig.naverSearchAdCustomerId ? `✅ (${mergedConfig.naverSearchAdCustomerId.length}자) [${mergedConfig.naverSearchAdCustomerId}]` : '❌',
            source: 'config.json'
          });
          return mergedConfig;
        } catch (fileError: any) {
          console.error('[ENV] ❌ config.json 읽기 실패:', fileError);
          console.error('[ENV] 에러 상세:', fileError.message);
          console.warn('[ENV] .env와 환경변수만 사용');
        }
      } else {
        // config.json 파일이 없는 경우 - 다른 앱의 설정에서 API 키만 가져오기
        console.log('[ENV] ⚠️ leword config.json 없음 - 다른 앱 설정에서 API 키 확인');

        // 🔥 다른 앱에서 API 키 가져오기 (패키지 앱에서도 동작)
        const alternatePaths = [
          path.join(process.env['APPDATA'] || '', 'blogger-admin-panel', 'config.json'),
          path.join(process.env['APPDATA'] || '', 'blogger-gpt-cli', 'config.json'),
          path.join(process.env['LOCALAPPDATA'] || '', 'blogger-admin-panel', 'config.json'),
          path.join(process.env['LOCALAPPDATA'] || '', 'blogger-gpt-cli', 'config.json')
        ];

        for (const altPath of alternatePaths) {
          if (fs.existsSync(altPath)) {
            console.log('[ENV] ✅ 대체 경로에서 config.json 발견:', altPath);
            try {
              let fileConfigRaw = fs.readFileSync(altPath, 'utf8');

              // BOM 제거 (UTF-8 BOM이 있는 경우)
              if (fileConfigRaw.charCodeAt(0) === 0xFEFF) {
                fileConfigRaw = fileConfigRaw.slice(1);
              }

              fileConfigRaw = fileConfigRaw.trim();
              if (!fileConfigRaw || fileConfigRaw.length === 0) continue;

              const fileConfig = JSON.parse(fileConfigRaw);

              // API 키만 가져오기 (빈 값인 경우에만)
              if (!envConfig.youtubeApiKey && fileConfig.youtubeApiKey) {
                envConfig.youtubeApiKey = fileConfig.youtubeApiKey;
                console.log('[ENV] ✅ YouTube API 키 가져옴 (from:', altPath, ')');
              }
              if (!envConfig.naverClientId && fileConfig.naverClientId) {
                envConfig.naverClientId = fileConfig.naverClientId;
                console.log('[ENV] ✅ Naver Client ID 가져옴');
              }
              if (!envConfig.naverClientSecret && fileConfig.naverClientSecret) {
                envConfig.naverClientSecret = fileConfig.naverClientSecret;
                console.log('[ENV] ✅ Naver Client Secret 가져옴');
              }
              if (!envConfig.naverSearchAdAccessLicense && fileConfig.naverSearchAdAccessLicense) {
                envConfig.naverSearchAdAccessLicense = fileConfig.naverSearchAdAccessLicense;
                console.log('[ENV] ✅ Naver Search Ad License 가져옴');
              }
              if (!envConfig.naverSearchAdSecretKey && fileConfig.naverSearchAdSecretKey) {
                envConfig.naverSearchAdSecretKey = fileConfig.naverSearchAdSecretKey;
                console.log('[ENV] ✅ Naver Search Ad Secret 가져옴');
              }
              if (!envConfig.naverSearchAdCustomerId && fileConfig.naverSearchAdCustomerId) {
                envConfig.naverSearchAdCustomerId = fileConfig.naverSearchAdCustomerId;
                console.log('[ENV] ✅ Naver Search Ad Customer ID 가져옴');
              }

              // 하나라도 가져왔으면 leword config.json에 저장
              if (envConfig.youtubeApiKey || envConfig.naverClientId) {
                try {
                  const lewordConfigDir = path.dirname(actualConfigPath);
                  if (!fs.existsSync(lewordConfigDir)) {
                    fs.mkdirSync(lewordConfigDir, { recursive: true });
                  }
                  fs.writeFileSync(actualConfigPath, JSON.stringify(envConfig, null, 2), 'utf8');
                  console.log('[ENV] ✅ leword config.json에 API 키 저장:', actualConfigPath);
                } catch (saveError) {
                  console.warn('[ENV] ⚠️ leword config.json 저장 실패:', saveError);
                }
              }

              break; // 첫 번째 유효한 설정에서 종료
            } catch (altError: any) {
              console.error('[ENV] 대체 경로 파일 읽기 실패:', altError);
              continue;
            }
          }
        }
      }

      // .env 파일과 환경변수만 사용
      console.log('[ENV] .env 파일과 환경변수에서 설정 로드 완료');
      console.log('[ENV] 최종 설정 상태:', {
        naverClientId: envConfig.naverClientId ? `✅ (${envConfig.naverClientId.length}자)` : '❌',
        naverClientSecret: envConfig.naverClientSecret ? `✅ (${envConfig.naverClientSecret.length}자)` : '❌',
        youtubeApiKey: envConfig.youtubeApiKey ? `✅ (${envConfig.youtubeApiKey.length}자)` : '❌',
        naverSearchAdAccessLicense: envConfig.naverSearchAdAccessLicense ? `✅ (${envConfig.naverSearchAdAccessLicense.length}자)` : '❌',
        naverSearchAdSecretKey: envConfig.naverSearchAdSecretKey ? `✅ (${envConfig.naverSearchAdSecretKey.length}자)` : '❌',
        naverSearchAdCustomerId: envConfig.naverSearchAdCustomerId ? `✅ (${envConfig.naverSearchAdCustomerId.length}자) [${envConfig.naverSearchAdCustomerId}]` : '❌',
        source: '.env + 환경변수'
      });
      return envConfig;
    } catch (error) {
      console.error('[ENV] 설정 로드 실패:', error);
      return {
        massCrawlingEnabled: true,
        maxConcurrentRequests: 30,
        maxResultsPerSource: 1000,
        enableFullContentCrawling: true
      };
    }
  }

  /**
   * 설정 저장
   */
  async saveConfig(config: Partial<EnvConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };

      // Electron 앱인 경우 올바른 경로 확인
      let actualConfigPath = this.configPath;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
          actualConfigPath = path.join(app.getPath('userData'), 'config.json');
          console.log('[ENV] ✅ Electron 경로로 저장:', actualConfigPath);
        }
      } catch {
        // Electron이 아니거나 app이 아직 준비되지 않음
        console.log('[ENV] 일반 경로로 저장:', actualConfigPath);
      }

      // 디렉토리 생성
      const dir = path.dirname(actualConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('[ENV] ✅ 디렉토리 생성:', dir);
      }

      // 파일 저장 (UTF-8, BOM 없음)
      const configJson = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(actualConfigPath, configJson, 'utf8');
      console.log('[ENV] ✅ 설정 저장 완료:', actualConfigPath);
      console.log('[ENV] 저장할 설정:', {
        naverSearchAdAccessLicense: this.config.naverSearchAdAccessLicense ? `✅ (${this.config.naverSearchAdAccessLicense.length}자)` : '❌',
        naverSearchAdSecretKey: this.config.naverSearchAdSecretKey ? `✅ (${this.config.naverSearchAdSecretKey.length}자)` : '❌',
        naverSearchAdCustomerId: this.config.naverSearchAdCustomerId ? `✅ (${this.config.naverSearchAdCustomerId.length}자) [${this.config.naverSearchAdCustomerId}]` : '❌',
        naverClientId: this.config.naverClientId ? `✅ (${this.config.naverClientId.length}자)` : '❌',
        naverClientSecret: this.config.naverClientSecret ? `✅ (${this.config.naverClientSecret.length}자)` : '❌',
        youtubeApiKey: this.config.youtubeApiKey ? `✅ (${this.config.youtubeApiKey.length}자)` : '❌'
      });

      // 저장 직후 파일에서 다시 읽어서 검증
      if (fs.existsSync(actualConfigPath)) {
        // 약간의 지연을 두고 파일 읽기 (파일 시스템 동기화 보장)
        await new Promise(resolve => setTimeout(resolve, 50));

        let savedContent = fs.readFileSync(actualConfigPath, 'utf8');

        // BOM 제거
        if (savedContent.charCodeAt(0) === 0xFEFF) {
          savedContent = savedContent.slice(1);
        }

        savedContent = savedContent.trim();

        const savedConfig = JSON.parse(savedContent);
        console.log('[ENV] ✅ 저장된 설정 검증 완료:', {
          naverSearchAdAccessLicense: savedConfig.naverSearchAdAccessLicense ? `✅ (${savedConfig.naverSearchAdAccessLicense.length}자)` : '❌',
          naverSearchAdSecretKey: savedConfig.naverSearchAdSecretKey ? `✅ (${savedConfig.naverSearchAdSecretKey.length}자)` : '❌',
          naverSearchAdCustomerId: savedConfig.naverSearchAdCustomerId ? `✅ (${savedConfig.naverSearchAdCustomerId.length}자) [${savedConfig.naverSearchAdCustomerId}]` : '❌',
          naverClientId: savedConfig.naverClientId ? `✅ (${savedConfig.naverClientId.length}자)` : '❌',
          naverClientSecret: savedConfig.naverClientSecret ? `✅ (${savedConfig.naverClientSecret.length}자)` : '❌',
          youtubeApiKey: savedConfig.youtubeApiKey ? `✅ (${savedConfig.youtubeApiKey.length}자)` : '❌',
          fileSize: savedContent.length,
          allKeys: Object.keys(savedConfig).filter(k => k.includes('naver') || k.includes('youtube'))
        });

        // 메모리의 config도 업데이트 (저장된 값과 동기화)
        this.config = { ...this.config, ...savedConfig };

        // configPath 업데이트 (다음 로드 시 올바른 경로 사용)
        this.configPath = actualConfigPath;
      } else {
        console.error('[ENV] ❌ 저장된 파일이 존재하지 않습니다:', actualConfigPath);
      }
    } catch (error) {
      console.error('[ENV] 설정 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 설정 가져오기
   */
  getConfig(): EnvConfig {
    return { ...this.config };
  }

  /**
   * 네이버 API 키 확인
   */
  isNaverApiConfigured(): boolean {
    return !!(this.config.naverClientId && this.config.naverClientSecret);
  }

  /**
   * Google API 키 확인
   */
  isGoogleApiConfigured(): boolean {
    return !!(this.config.googleApiKey && this.config.googleCseId);
  }

  /**
   * AI API 키 확인
   */
  isAiApiConfigured(): boolean {
    return !!(this.config.openaiApiKey || this.config.geminiApiKey);
  }

  /**
   * 설정 상태 출력
   */
  printConfigStatus(): void {
    console.log('\n📋 환경변수 설정 상태:');
    console.log('='.repeat(50));
    console.log(`🔑 OpenAI API: ${this.config.openaiApiKey ? '✅ 설정됨' : '❌ 미설정'}`);
    console.log(`🔑 Gemini API: ${this.config.geminiApiKey ? '✅ 설정됨' : '❌ 미설정'}`);
    console.log(`🔑 네이버 API: ${this.isNaverApiConfigured() ? '✅ 설정됨' : '❌ 미설정'}`);
    console.log(`🔑 Google CSE: ${this.isGoogleApiConfigured() ? '✅ 설정됨' : '❌ 미설정'}`);
    console.log(`🚀 대량 크롤링: ${this.config.massCrawlingEnabled ? '✅ 활성화' : '❌ 비활성화'}`);
    console.log(`⚡ 최대 동시 요청: ${this.config.maxConcurrentRequests}개`);
    console.log(`📊 소스별 최대 결과: ${this.config.maxResultsPerSource}개`);
    console.log(`📄 전체 본문 크롤링: ${this.config.enableFullContentCrawling ? '✅ 활성화' : '❌ 비활성화'}`);
    console.log('='.repeat(50));
  }
}

/**
 * 네이버 API 연동 테스트
 */
export async function testNaverApiConnection(
  clientId?: string,
  clientSecret?: string
): Promise<{ success: boolean; message: string; data?: any }> {
  const env = EnvironmentManager.getInstance();
  const naverClientId = clientId || env.getConfig().naverClientId;
  const naverClientSecret = clientSecret || env.getConfig().naverClientSecret;

  if (!naverClientId || !naverClientSecret) {
    return {
      success: false,
      message: '네이버 API 키가 설정되지 않았습니다.'
    };
  }

  try {
    console.log('[NAVER API] 연결 테스트 시작...');

    const testQuery = '블로그 마케팅';
    const encodedQuery = encodeURIComponent(testQuery);
    const apiUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodedQuery}&display=10&sort=sim`;

    const response = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': naverClientId,
        'X-Naver-Client-Secret': naverClientSecret
      }
    });

    if (!response.ok) {
      return {
        success: false,
        message: `네이버 API 호출 실패: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json() as {
      items?: Array<{ title?: string }>;
      total?: number;
    };

    if (data.items && data.items.length > 0) {
      return {
        success: true,
        message: `네이버 API 연결 성공! ${data.items.length}개 결과 수신`,
        data: {
          totalResults: data.total,
          itemsCount: data.items.length,
          sampleTitle: data.items[0]?.title
        }
      };
    } else {
      return {
        success: false,
        message: '네이버 API는 연결되었지만 결과가 없습니다.'
      };
    }

  } catch (error: any) {
    return {
      success: false,
      message: `네이버 API 연결 실패: ${error.message}`
    };
  }
}

/**
 * 대량 크롤링 시스템 테스트
 */
export async function testMassCrawlingSystem(): Promise<{
  success: boolean;
  message: string;
  results?: any;
}> {
  try {
    console.log('[MASS CRAWLING] 시스템 테스트 시작...');

    const env = EnvironmentManager.getInstance();
    const config = env.getConfig();

    if (!config.massCrawlingEnabled) {
      return {
        success: false,
        message: '대량 크롤링이 비활성화되어 있습니다.'
      };
    }

    // 네이버 API 테스트
    const naverTest = await testNaverApiConnection();
    if (!naverTest.success) {
      return {
        success: false,
        message: `네이버 API 테스트 실패: ${naverTest.message}`
      };
    }

    // 실제 크롤링 테스트
    const { MassCrawlingSystem } = await import('../core/mass-crawler');
    const crawler = new MassCrawlingSystem(
      config.naverClientId,
      config.naverClientSecret,
      config.googleApiKey,
      config.googleCseId
    );

    const testResult = await crawler.crawlAll('블로그 마케팅', {
      maxResults: 100,
      enableFullContent: false,
      maxConcurrent: 10
    });

    return {
      success: true,
      message: `대량 크롤링 시스템 테스트 성공! ${testResult.stats.totalItems}개 데이터 수집`,
      results: testResult.stats
    };

  } catch (error: any) {
    return {
      success: false,
      message: `대량 크롤링 시스템 테스트 실패: ${error.message}`
    };
  }
}

/**
 * 전체 시스템 진단
 */
export async function diagnoseSystem(): Promise<void> {
  console.log('\n🔍 시스템 진단 시작...');
  console.log('='.repeat(60));

  const env = EnvironmentManager.getInstance();
  env.printConfigStatus();

  // 네이버 API 테스트
  console.log('\n🌐 네이버 API 연결 테스트...');
  const naverTest = await testNaverApiConnection();
  console.log(`결과: ${naverTest.success ? '✅' : '❌'} ${naverTest.message}`);
  if (naverTest.data) {
    console.log(`   - 총 결과: ${naverTest.data.totalResults}개`);
    console.log(`   - 수신 항목: ${naverTest.data.itemsCount}개`);
    console.log(`   - 샘플 제목: ${naverTest.data.sampleTitle}`);
  }

  // 대량 크롤링 시스템 테스트
  if (env.isNaverApiConfigured()) {
    console.log('\n🚀 대량 크롤링 시스템 테스트...');
    const crawlingTest = await testMassCrawlingSystem();
    console.log(`결과: ${crawlingTest.success ? '✅' : '❌'} ${crawlingTest.message}`);
    if (crawlingTest.results) {
      console.log(`   - 네이버: ${crawlingTest.results.naverCount}개`);
      console.log(`   - RSS: ${crawlingTest.results.rssCount}개`);
      console.log(`   - CSE: ${crawlingTest.results.cseCount}개`);
      console.log(`   - 처리 시간: ${crawlingTest.results.processingTimeMs}ms`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 진단 완료!');
}
