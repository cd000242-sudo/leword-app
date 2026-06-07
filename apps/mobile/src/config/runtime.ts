import Constants from 'expo-constants';

declare const process: {
  env?: Record<string, string | undefined>;
};

declare const __DEV__: boolean;

export const LEWORD_DEV_API_URL = 'http://127.0.0.1:34983';
export const LEWORD_DEFAULT_PRIVACY_URL = 'https://leword.app/privacy';

function normalizeApiUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function getExpoHostUri(): string {
  const constants = Constants as any;
  return (
    constants.expoConfig?.hostUri
    || constants.manifest2?.extra?.expoClient?.hostUri
    || constants.manifest?.debuggerHost
    || ''
  ).trim();
}

function getExpoLanApiUrl(): string {
  const hostUri = getExpoHostUri();
  const host = hostUri
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .split(':')[0];

  if (!host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host)) {
    return '';
  }

  return `http://${host}:34983`;
}

export function getDefaultLewordApiUrl(): string {
  const envUrl = normalizeApiUrl(process.env?.EXPO_PUBLIC_LEWORD_API_URL);
  if (envUrl) return envUrl;

  if (isDevRuntime()) {
    return getExpoLanApiUrl() || LEWORD_DEV_API_URL;
  }

  const constants = Constants as any;
  return normalizeApiUrl(constants.expoConfig?.extra?.lewordApiBaseUrl) || LEWORD_DEV_API_URL;
}

export function getDefaultPrivacyUrl(): string {
  return normalizeApiUrl(process.env?.EXPO_PUBLIC_LEWORD_PRIVACY_URL) || LEWORD_DEFAULT_PRIVACY_URL;
}

export function isLocalLewordApiUrl(url: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i.test(url.trim());
}

export function getLewordApiUrlWarning(url: string): string | null {
  if (!isLocalLewordApiUrl(url)) return null;
  return '실제 휴대폰에서는 localhost/127.0.0.1이 PC 서버가 아니라 휴대폰 자신을 가리킵니다. 개발 실행은 PC의 Wi-Fi IP를 쓰고, 배포 빌드는 EXPO_PUBLIC_LEWORD_API_URL에 HTTPS API 주소를 넣어야 합니다.';
}
