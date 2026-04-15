// LEWORD Key Wizard — Threads Graph API (OAuth 2.0 + Long-lived Token)
// 작성: 2026-04-15
// 단기 토큰(1h) → 장기 토큰(60d) 교환까지 자동.

import { runOAuthLoopback } from '../strategies/oauth-loopback';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { saveToken } from '../token-store';
import { EnvironmentManager } from '../../../utils/environment-manager';

const THREADS_AUTH_URL = 'https://threads.net/oauth/authorize';
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const THREADS_LONG_LIVED_URL = 'https://graph.threads.net/access_token';
const SCOPES = ['threads_basic', 'threads_content_publish'];

export const threadsDefinition: ProviderDefinition = {
  site: 'threads',
  displayName: 'Threads Graph API',
  icon: '🧵',
  strategy: 'oauth-loopback',
  description: 'Meta Threads Graph API에 OAuth 2.0으로 인증하고 60일 장기 토큰까지 자동 교환합니다.',
  preSteps: [
    {
      title: '① Meta for Developers 앱 생성',
      description: '"Threads API 사용" 앱 유형으로 새 앱을 만드세요.',
      externalUrl: 'https://developers.facebook.com/apps/create/',
    },
    {
      title: '② Threads 제품 추가',
      description: '앱 대시보드에서 "Threads API"를 활성화하세요.',
      externalUrl: 'https://developers.facebook.com/apps/',
    },
    {
      title: '③ 앱 ID와 Secret 복사',
      description: '앱 설정 > 기본 설정에서 App ID와 App Secret을 복사해 아래에 붙여넣으세요.',
      inputs: [
        { key: 'appId', label: 'App ID' },
        { key: 'appSecret', label: 'App Secret', secret: true },
      ],
    },
  ],
};

export interface ThreadsStartArgs {
  appId?: string;
  appSecret?: string;
}

async function exchangeForLongLivedToken(
  appSecret: string,
  shortToken: string
): Promise<{ token: string; expiresIn: number } | null> {
  const params = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: appSecret,
    access_token: shortToken,
  });
  try {
    const res = await fetch(`${THREADS_LONG_LIVED_URL}?${params.toString()}`, { method: 'GET' });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json.access_token) return null;
    return { token: json.access_token, expiresIn: Number(json.expires_in || 60 * 24 * 3600) };
  } catch (err) {
    console.error('[KEY-WIZARD][threads] long-lived 교환 실패:', err);
    return null;
  }
}

export async function startThreadsWizard(
  args: ThreadsStartArgs,
  onProgress: (msg: string) => void
): Promise<KeyWizardResult> {
  const env = EnvironmentManager.getInstance().getConfig();
  const appId = args.appId || env.threadsAppId;
  const appSecret = args.appSecret || env.threadsAppSecret;

  if (!appId || !appSecret) {
    return {
      success: false,
      site: 'threads',
      reason: 'Threads App ID/Secret이 필요합니다. 사전 단계를 완료하세요.',
      errorCode: 'MISSING_APP_CREDENTIALS',
    };
  }

  try {
    const result = await runOAuthLoopback(
      {
        authUrl: THREADS_AUTH_URL,
        tokenUrl: THREADS_TOKEN_URL,
        clientId: appId,
        clientSecret: appSecret,
        scopes: SCOPES,
      },
      onProgress
    );

    onProgress('단기 토큰 → 60일 장기 토큰 교환 중...');
    const longLived = await exchangeForLongLivedToken(appSecret, result.accessToken);
    const finalToken = longLived ? longLived.token : result.accessToken;
    const expiresAt = longLived
      ? Date.now() + longLived.expiresIn * 1000
      : result.expiresAt;

    await EnvironmentManager.getInstance().saveConfig({
      threadsAppId: appId,
      threadsAppSecret: appSecret,
      threadsAccessToken: finalToken,
      threadsTokenExpiresAt: expiresAt,
    });
    saveToken('threads', { accessToken: finalToken, expiresAt });
    onProgress('✅ ' + (longLived ? '60일 장기 토큰 저장 완료' : '단기 토큰 저장 완료 (장기 교환 실패)'));

    return {
      success: true,
      site: 'threads',
      keys: { accessToken: finalToken.slice(0, 20) + '…', expiresAt: String(expiresAt || '') },
      partial: !longLived,
    };
  } catch (err: any) {
    return {
      success: false,
      site: 'threads',
      reason: err?.message || 'OAuth 실패',
      errorCode: 'OAUTH_FAILED',
    };
  }
}

export async function refreshThreadsToken(): Promise<boolean> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.threadsAccessToken || !env.threadsAppSecret) return false;
  try {
    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: env.threadsAccessToken,
    });
    const res = await fetch(`${THREADS_LONG_LIVED_URL}?${params.toString()}`, { method: 'GET' });
    if (!res.ok) return false;
    const json: any = await res.json();
    if (!json.access_token) return false;
    const expiresAt = Date.now() + Number(json.expires_in || 60 * 24 * 3600) * 1000;
    await EnvironmentManager.getInstance().saveConfig({
      threadsAccessToken: json.access_token,
      threadsTokenExpiresAt: expiresAt,
    });
    saveToken('threads', { accessToken: json.access_token, expiresAt });
    console.log('[KEY-WIZARD][threads] 장기 토큰 갱신 완료');
    return true;
  } catch (err) {
    console.error('[KEY-WIZARD][threads] 갱신 실패:', err);
    return false;
  }
}
