// LEWORD Key Wizard — 네이버 검색광고 API
// 작성: 2026-04-15
// ⚠️ 재발급 버튼 절대 안내 금지 (기존 키 무효화 위험)

import { openExternal } from '../strategies/deep-link';
import { watchClipboardForKeys } from '../strategies/clipboard-watch';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { EnvironmentManager } from '../../../utils/environment-manager';

const TOOL_API_URL = 'https://manage.searchad.naver.com/customers/0/tool-management/api';

export const naverSearchAdDefinition: ProviderDefinition = {
  site: 'naver-searchad',
  displayName: '네이버 검색광고',
  icon: '📊',
  strategy: 'clipboard-watch',
  description: '네이버 검색광고 API 관리 페이지에서 라이선스/Secret/Customer ID를 복사하면 순서대로 자동 분배됩니다. (재발급 버튼은 절대 누르지 마세요 — 기존 키가 무효화됩니다)',
  preSteps: [
    {
      title: '⚠️ 주의',
      description: '"라이선스 재발급" 버튼을 누르면 기존 키가 즉시 무효화됩니다. 이미 발급받은 키만 복사하세요.',
    },
    {
      title: '① 검색광고 로그인 + API 관리 페이지 이동',
      description: '도구 > API 사용 관리 페이지가 열립니다.',
      externalUrl: TOOL_API_URL,
    },
    {
      title: '② 3개 값 순서대로 복사',
      description: '① Access License → ② Secret Key → ③ Customer ID 순으로 복사하면 자동으로 각 필드에 분배됩니다.',
    },
  ],
};

export async function startNaverSearchAdWizard(
  _args: Record<string, never>,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<KeyWizardResult> {
  onProgress('네이버 검색광고 API 관리 페이지 열기...');
  await openExternal(TOOL_API_URL);
  onProgress('Access License → Secret Key → Customer ID 순으로 복사해주세요.');

  const result = await watchClipboardForKeys({
    patterns: [
      // Access License: Base64-like, 보통 100자 이상
      {
        name: 'naverSearchAdAccessLicense',
        regex: /^[A-Za-z0-9+/]{50,}={0,2}$/,
        required: true,
        label: 'Access License',
      },
      // Secret Key: Base64-like, 약간 짧음
      {
        name: 'naverSearchAdSecretKey',
        regex: /^[A-Za-z0-9+/]{30,}={0,2}$/,
        required: true,
        label: 'Secret Key',
      },
      // Customer ID: 숫자 7~10자리
      {
        name: 'naverSearchAdCustomerId',
        regex: /^\d{6,10}$/,
        required: true,
        label: 'Customer ID',
      },
    ],
    timeoutMs: 5 * 60 * 1000,
    signal,
    onMatch: (name) => onProgress(`✅ ${name} 감지됨`),
  });

  if (!result.success) {
    return {
      success: false,
      site: 'naver-searchad',
      reason: result.reason === 'timeout' ? '시간 초과' : '취소됨',
      errorCode: result.reason?.toUpperCase(),
    };
  }

  await EnvironmentManager.getInstance().saveConfig({
    naverSearchAdAccessLicense: result.collected.naverSearchAdAccessLicense,
    naverSearchAdSecretKey: result.collected.naverSearchAdSecretKey,
    naverSearchAdCustomerId: result.collected.naverSearchAdCustomerId,
  });
  onProgress('✅ 3개 값 모두 저장 완료');

  return {
    success: true,
    site: 'naver-searchad',
    keys: {
      accessLicense: result.collected.naverSearchAdAccessLicense.slice(0, 10) + '…',
      customerId: result.collected.naverSearchAdCustomerId,
    },
  };
}
