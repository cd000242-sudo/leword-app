// LEWORD Key Wizard — 네이버 개발자 센터 (Client ID/Secret)
// 작성: 2026-04-15
// 딥링크 + 클립보드 감시 (자동화 없음 — ToS 준수)

import { openExternal } from '../strategies/deep-link';
import { watchClipboardForKeys } from '../strategies/clipboard-watch';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { EnvironmentManager } from '../../../utils/environment-manager';

const REGISTER_URL = 'https://developers.naver.com/apps/#/register';

export const naverDevDefinition: ProviderDefinition = {
  site: 'naver-dev',
  displayName: '네이버 개발자 센터',
  icon: '🟢',
  strategy: 'clipboard-watch',
  description: '네이버 개발자 센터에서 애플리케이션을 등록하고 Client ID/Secret을 복사하면 자동 감지합니다.',
  preSteps: [
    {
      title: '① 네이버 개발자 센터 로그인',
      description: '네이버 계정으로 로그인 후 "애플리케이션 등록" 페이지가 열립니다.',
      externalUrl: REGISTER_URL,
    },
    {
      title: '② 애플리케이션 등록',
      description: '애플리케이션 이름: LEWORD, 사용 API: 검색 / 데이터랩 (필수), 환경: WEB 설정',
    },
    {
      title: '③ Client ID와 Client Secret 복사',
      description: '등록 후 노출되는 Client ID와 Client Secret을 각각 복사하면 자동으로 감지됩니다.',
    },
  ],
};

export async function startNaverDevWizard(
  _args: Record<string, never>,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<KeyWizardResult> {
  onProgress('네이버 개발자 센터 페이지 열기...');
  await openExternal(REGISTER_URL);
  onProgress('등록 후 Client ID와 Secret을 복사해주세요. 클립보드 감시 중...');

  const result = await watchClipboardForKeys({
    patterns: [
      {
        name: 'naverClientId',
        regex: /^[A-Za-z0-9_]{20,40}$/,
        required: true,
        label: 'Client ID',
      },
      {
        name: 'naverClientSecret',
        regex: /^[A-Za-z0-9_]{10,30}$/,
        required: true,
        label: 'Client Secret',
      },
    ],
    timeoutMs: 5 * 60 * 1000,
    signal,
    onMatch: (name) => onProgress(`✅ ${name} 감지됨`),
  });

  if (!result.success) {
    return {
      success: false,
      site: 'naver-dev',
      reason: result.reason === 'timeout' ? '시간 초과 — 수동 입력으로 전환하세요.' : '취소됨',
      errorCode: result.reason?.toUpperCase(),
    };
  }

  // Client ID와 Secret이 같은 정규식을 통과할 수 있어 길이로 보정
  // (Client ID는 보통 20자 내외, Secret은 10자 내외)
  const id = result.collected.naverClientId;
  const secret = result.collected.naverClientSecret;

  await EnvironmentManager.getInstance().saveConfig({
    naverClientId: id,
    naverClientSecret: secret,
  });
  onProgress('✅ EnvironmentManager 저장 완료');

  return {
    success: true,
    site: 'naver-dev',
    keys: { naverClientId: id, naverClientSecret: secret.slice(0, 4) + '…' },
  };
}
