// LEWORD Key Wizard — Rakuten Ichiba (Application ID)
// 작성: 2026-04-15

import { openExternal } from '../strategies/deep-link';
import { watchClipboardForKeys } from '../strategies/clipboard-watch';
import type { ProviderDefinition, KeyWizardResult } from '../types';
import { EnvironmentManager } from '../../../utils/environment-manager';

const REGISTER_URL = 'https://webservice.rakuten.co.jp/app/create';

export const rakutenDefinition: ProviderDefinition = {
  site: 'rakuten',
  displayName: 'Rakuten Ichiba',
  icon: '🇯🇵',
  strategy: 'clipboard-watch',
  description: 'Rakuten Developers에서 새 앱을 등록하고 Application ID를 복사하면 자동 감지합니다.',
  preSteps: [
    {
      title: '① Rakuten Developers 로그인',
      description: '"신규 등록" 페이지가 열립니다. 일본어이니 번역 사용 권장.',
      externalUrl: REGISTER_URL,
    },
    {
      title: '② 앱 등록',
      description: '앱 이름: LEWORD, URL: http://localhost (placeholder), 약관 동의 후 제출',
    },
    {
      title: '③ Application ID 복사',
      description: '등록 직후 마이페이지에 표시되는 19자리 Application ID를 복사하세요.',
    },
  ],
};

export async function startRakutenWizard(
  _args: Record<string, never>,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<KeyWizardResult> {
  onProgress('Rakuten Developers 페이지 열기...');
  await openExternal(REGISTER_URL);
  onProgress('Application ID(19자리 숫자)를 복사해주세요.');

  const result = await watchClipboardForKeys({
    patterns: [
      {
        name: 'rakutenApplicationId',
        regex: /^\d{19}$/,
        required: true,
        label: 'Application ID',
      },
    ],
    timeoutMs: 5 * 60 * 1000,
    signal,
    onMatch: (name) => onProgress(`✅ ${name} 감지됨`),
  });

  if (!result.success) {
    return {
      success: false,
      site: 'rakuten',
      reason: result.reason === 'timeout' ? '시간 초과' : '취소됨',
      errorCode: result.reason?.toUpperCase(),
    };
  }

  await EnvironmentManager.getInstance().saveConfig({
    rakutenApplicationId: result.collected.rakutenApplicationId,
  });
  onProgress('✅ Rakuten Application ID 저장 완료');

  return {
    success: true,
    site: 'rakuten',
    keys: { rakutenApplicationId: result.collected.rakutenApplicationId },
  };
}
