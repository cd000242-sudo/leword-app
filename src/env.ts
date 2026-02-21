/**
 * 환경 변수 로더 스텁
 */

import { EnvironmentManager } from './utils/environment-manager';

export function loadEnvFromFile(): Record<string, string> {
  // 앱 설정(config.json/.env) + process.env 병합
  // - Electron 실행/패키징/CLI 테스트 모두에서 동일한 설정 소스를 사용하기 위함
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };

  try {
    const cfg = EnvironmentManager.getInstance().getConfig() as any;

    // camelCase 키
    if (cfg?.naverClientId) out.naverClientId = String(cfg.naverClientId);
    if (cfg?.naverClientSecret) out.naverClientSecret = String(cfg.naverClientSecret);
    if (cfg?.naverSearchAdAccessLicense) out.naverSearchAdAccessLicense = String(cfg.naverSearchAdAccessLicense);
    if (cfg?.naverSearchAdSecretKey) out.naverSearchAdSecretKey = String(cfg.naverSearchAdSecretKey);
    if (cfg?.naverSearchAdCustomerId) out.naverSearchAdCustomerId = String(cfg.naverSearchAdCustomerId);
    if (cfg?.googleCseKey) out.googleCseKey = String(cfg.googleCseKey);
    if (cfg?.googleCseCx) out.googleCseCx = String(cfg.googleCseCx);
    if (cfg?.googleCseId) out.googleCseId = String(cfg.googleCseId);
    if (cfg?.youtubeApiKey) out.youtubeApiKey = String(cfg.youtubeApiKey);
    if (cfg?.geminiApiKey) out.geminiApiKey = String(cfg.geminiApiKey);
    if (cfg?.openaiApiKey) out.openaiApiKey = String(cfg.openaiApiKey);

    // uppercase 호환 키 (기존 코드에서 process.env 형태로도 조회함)
    if (cfg?.naverClientId) out.NAVER_CLIENT_ID = String(cfg.naverClientId);
    if (cfg?.naverClientSecret) out.NAVER_CLIENT_SECRET = String(cfg.naverClientSecret);
    if (cfg?.naverSearchAdAccessLicense) out.NAVER_SEARCHAD_ACCESS_LICENSE = String(cfg.naverSearchAdAccessLicense);
    if (cfg?.naverSearchAdSecretKey) out.NAVER_SEARCHAD_SECRET_KEY = String(cfg.naverSearchAdSecretKey);
    if (cfg?.naverSearchAdCustomerId) out.NAVER_SEARCHAD_CUSTOMER_ID = String(cfg.naverSearchAdCustomerId);
    if (cfg?.googleCseKey) out.GOOGLE_CSE_KEY = String(cfg.googleCseKey);
    if (cfg?.googleCseCx) out.GOOGLE_CSE_CX = String(cfg.googleCseCx);
    if (cfg?.googleCseId) out.GOOGLE_CSE_ID = String(cfg.googleCseId);
    if (cfg?.youtubeApiKey) out.YOUTUBE_API_KEY = String(cfg.youtubeApiKey);
    if (cfg?.geminiApiKey) out.GEMINI_API_KEY = String(cfg.geminiApiKey);
    if (cfg?.openaiApiKey) out.OPENAI_API_KEY = String(cfg.openaiApiKey);
  } catch {
    // 설정 파일이 없거나 Electron 컨텍스트가 아닐 수 있음 → process.env로만 진행
  }

  return out;
}


