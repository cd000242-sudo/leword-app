// LEWORD Key Wizard — Google AdSense Management API v2 (OAuth 2.0)
// 작성: 2026-08-23
//
// 왜 필요한가: "키워드별 RPM" 을 주는 API 는 세상에 없다. 있는 것은 **글 주소별
// 실측 수익·페이지뷰**뿐이고(PAGE_URL 차원), 어떤 글이 어떤 키워드용인지는
// 사장님만 안다. 둘을 이으면 그때 비로소 '키워드별 실측 RPM' 이 생긴다.
// 남이 못 베끼는 자료라 이게 해자가 된다.
//
// 읽기 전용 범위만 쓴다(adsense.readonly). 수익 자료를 밖으로 내보내지 않는다.

import { runOAuthLoopback, refreshAccessToken } from '../strategies/oauth-loopback';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { saveToken } from '../token-store';
import { EnvironmentManager } from '../../../utils/environment-manager';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/adsense.readonly'];

export const adsenseDefinition: ProviderDefinition = {
  site: 'adsense',
  displayName: 'Google AdSense (실측 RPM)',
  icon: '💰',
  strategy: 'oauth-loopback',
  description:
    '내 글 주소별 실제 수익·페이지뷰를 읽어 키워드별 실측 RPM 장부를 만듭니다. 읽기 전용이라 계정을 바꾸지 않습니다.',
  preSteps: [
    {
      title: '① GCP 프로젝트 (유튜브에 쓰던 것 그대로 써도 됩니다)',
      description: '이미 만들어 둔 프로젝트가 있으면 새로 만들 필요 없습니다.',
      externalUrl: 'https://console.cloud.google.com/projectcreate',
    },
    {
      title: '② AdSense Management API 활성화',
      description: '"AdSense Management API" 를 검색해서 활성화하세요.',
      externalUrl: 'https://console.cloud.google.com/apis/library/adsense.googleapis.com',
    },
    {
      title: '③ OAuth 동의 화면에 범위 추가',
      description: '범위에 adsense.readonly 를 추가하세요. 읽기 전용이라 계정이 바뀌지 않습니다.',
      externalUrl: 'https://console.cloud.google.com/apis/credentials/consent',
    },
    {
      title: '④ 데스크톱 앱 Client ID',
      description:
        '유튜브에 쓰던 데스크톱 앱 Client ID 를 그대로 붙여넣어도 됩니다. 없으면 "OAuth 클라이언트 ID" → 유형 "데스크톱 앱" 으로 새로 발급하세요.',
      externalUrl: 'https://console.cloud.google.com/apis/credentials',
      inputs: [
        { key: 'clientId', label: 'Client ID', placeholder: 'xxxxx.apps.googleusercontent.com' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-xxxxx', secret: true },
      ],
    },
  ],
};

export interface AdSenseStartArgs {
  clientId?: string;
  clientSecret?: string;
}

export async function startAdSenseWizard(
  args: AdSenseStartArgs,
  onProgress: (msg: string) => void,
): Promise<KeyWizardResult> {
  const env = EnvironmentManager.getInstance().getConfig() as any;
  /*
   * 유튜브에 쓰던 데스크톱 앱 자격증명을 그대로 받아들인다. 같은 GCP 프로젝트면
   * 재발급이 필요 없는데, 모르고 새로 만들다 막히는 일이 잦다.
   */
  const clientId = args.clientId || env.adsenseOAuthClientId || env.youtubeOAuthClientId;
  const clientSecret = args.clientSecret || env.adsenseOAuthClientSecret || env.youtubeOAuthClientSecret;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      site: 'adsense',
      reason: 'GCP 데스크톱 앱 Client ID/Secret이 필요합니다. 사전 단계를 완료한 뒤 다시 시도하세요.',
      errorCode: 'MISSING_CLIENT_CREDENTIALS',
    };
  }

  try {
    const result = await runOAuthLoopback(
      { authUrl: GOOGLE_AUTH_URL, tokenUrl: GOOGLE_TOKEN_URL, clientId, clientSecret, scopes: SCOPES },
      onProgress,
    );

    await EnvironmentManager.getInstance().saveConfig({
      adsenseOAuthClientId: clientId,
      adsenseOAuthClientSecret: clientSecret,
      adsenseOAuthAccessToken: result.accessToken,
      adsenseOAuthRefreshToken: result.refreshToken,
      adsenseTokenExpiresAt: result.expiresAt,
    } as any);
    saveToken('adsense', {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    });
    onProgress('🔐 토큰 저장 완료');

    return {
      success: true,
      site: 'adsense',
      keys: { accessToken: result.accessToken.slice(0, 20) + '…', expiresAt: String(result.expiresAt || '') },
    };
  } catch (err: any) {
    return { success: false, site: 'adsense', reason: err?.message || 'OAuth 실패', errorCode: 'OAUTH_FAILED' };
  }
}

/** 만료된 액세스 토큰을 갱신한다. 갱신 못 하면 false — 조용히 옛 토큰을 쓰지 않는다. */
export async function refreshAdSenseToken(): Promise<boolean> {
  const env = EnvironmentManager.getInstance().getConfig() as any;
  if (!env.adsenseOAuthClientId || !env.adsenseOAuthClientSecret || !env.adsenseOAuthRefreshToken) return false;
  try {
    const refreshed = await refreshAccessToken({
      tokenUrl: GOOGLE_TOKEN_URL,
      clientId: env.adsenseOAuthClientId,
      clientSecret: env.adsenseOAuthClientSecret,
      refreshToken: env.adsenseOAuthRefreshToken,
    });
    await EnvironmentManager.getInstance().saveConfig({
      adsenseOAuthAccessToken: refreshed.accessToken,
      adsenseTokenExpiresAt: refreshed.expiresAt,
    } as any);
    saveToken('adsense', {
      accessToken: refreshed.accessToken,
      refreshToken: env.adsenseOAuthRefreshToken,
      expiresAt: refreshed.expiresAt,
    });
    return true;
  } catch {
    return false;
  }
}
