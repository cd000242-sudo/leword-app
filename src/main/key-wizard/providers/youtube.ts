// LEWORD Key Wizard — YouTube Data API v3 (OAuth 2.0)
// 작성: 2026-04-15
// 공식 OAuth 2.0 Installed App 플로우. GCP에서 데스크톱 앱 Client ID를 받아둔 뒤 사용.

import { runOAuthLoopback, refreshAccessToken } from '../strategies/oauth-loopback';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { saveToken, loadToken } from '../token-store';
import { EnvironmentManager } from '../../../utils/environment-manager';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

export const youtubeDefinition: ProviderDefinition = {
  site: 'youtube',
  displayName: 'YouTube Data API',
  icon: '📺',
  strategy: 'oauth-loopback',
  description: 'OAuth 2.0으로 YouTube Data API에 인증합니다. 첫 1회만 GCP에서 데스크톱 앱 Client ID 발급이 필요합니다.',
  preSteps: [
    {
      title: '① GCP 프로젝트 생성',
      description: 'Google Cloud Console에서 새 프로젝트를 만드세요.',
      externalUrl: 'https://console.cloud.google.com/projectcreate',
    },
    {
      title: '② YouTube Data API v3 활성화',
      description: '"YouTube Data API v3"를 검색해서 활성화하세요.',
      externalUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    },
    {
      title: '③ OAuth 동의 화면 설정',
      description: '"외부" 사용자 유형 → 앱 이름 "LEWORD" → 범위에 youtube.readonly 추가',
      externalUrl: 'https://console.cloud.google.com/apis/credentials/consent',
    },
    {
      title: '④ 데스크톱 앱 Client ID 발급',
      description: '"사용자 인증 정보 만들기" → "OAuth 클라이언트 ID" → 유형 "데스크톱 앱" → 발급된 Client ID와 Secret을 아래에 붙여넣으세요.',
      externalUrl: 'https://console.cloud.google.com/apis/credentials',
      inputs: [
        { key: 'clientId', label: 'Client ID', placeholder: 'xxxxx.apps.googleusercontent.com' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-xxxxx', secret: true },
      ],
    },
  ],
};

export interface YouTubeStartArgs {
  clientId?: string;
  clientSecret?: string;
}

export async function startYouTubeWizard(
  args: YouTubeStartArgs,
  onProgress: (msg: string) => void
): Promise<KeyWizardResult> {
  const env = EnvironmentManager.getInstance().getConfig();
  const clientId = args.clientId || env.youtubeOAuthClientId;
  const clientSecret = args.clientSecret || env.youtubeOAuthClientSecret;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      site: 'youtube',
      reason: 'GCP 데스크톱 앱 Client ID/Secret이 필요합니다. 사전 단계를 완료한 뒤 다시 시도하세요.',
      errorCode: 'MISSING_CLIENT_CREDENTIALS',
    };
  }

  try {
    const result = await runOAuthLoopback(
      {
        authUrl: GOOGLE_AUTH_URL,
        tokenUrl: GOOGLE_TOKEN_URL,
        clientId,
        clientSecret,
        scopes: SCOPES,
      },
      onProgress
    );

    // 영구 저장: EnvironmentManager + token-store 이중 저장
    await EnvironmentManager.getInstance().saveConfig({
      youtubeOAuthClientId: clientId,
      youtubeOAuthClientSecret: clientSecret,
      youtubeOAuthAccessToken: result.accessToken,
      youtubeOAuthRefreshToken: result.refreshToken,
      youtubeTokenExpiresAt: result.expiresAt,
    });
    saveToken('youtube', {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    });
    onProgress('🔐 토큰 저장 완료');

    return {
      success: true,
      site: 'youtube',
      keys: {
        accessToken: result.accessToken.slice(0, 20) + '…',
        expiresAt: String(result.expiresAt || ''),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      site: 'youtube',
      reason: err?.message || 'OAuth 실패',
      errorCode: 'OAUTH_FAILED',
    };
  }
}

export async function refreshYouTubeToken(): Promise<boolean> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.youtubeOAuthClientId || !env.youtubeOAuthClientSecret || !env.youtubeOAuthRefreshToken) {
    return false;
  }
  try {
    const r = await refreshAccessToken({
      tokenUrl: GOOGLE_TOKEN_URL,
      clientId: env.youtubeOAuthClientId,
      clientSecret: env.youtubeOAuthClientSecret,
      refreshToken: env.youtubeOAuthRefreshToken,
    });
    await EnvironmentManager.getInstance().saveConfig({
      youtubeOAuthAccessToken: r.accessToken,
      youtubeOAuthRefreshToken: r.refreshToken,
      youtubeTokenExpiresAt: r.expiresAt,
    });
    saveToken('youtube', {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      expiresAt: r.expiresAt,
    });
    console.log('[KEY-WIZARD][youtube] 토큰 갱신 완료');
    return true;
  } catch (err) {
    console.error('[KEY-WIZARD][youtube] 토큰 갱신 실패:', err);
    return false;
  }
}
