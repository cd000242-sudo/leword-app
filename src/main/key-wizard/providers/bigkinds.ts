// LEWORD Key Wizard — 빅카인즈 (승인 대기형 — 딥링크만)
// 작성: 2026-04-15

import { openExternal } from '../strategies/deep-link';
import type { ProviderDefinition, KeyWizardResult } from '../types';

const APPLY_URL = 'https://www.bigkinds.or.kr/v2/news/index.do';

export const bigkindsDefinition: ProviderDefinition = {
  site: 'bigkinds',
  displayName: '빅카인즈',
  icon: '📰',
  strategy: 'deep-link-only',
  description: '빅카인즈는 승인 대기형이라 자동화 대상이 아닙니다. 신청 페이지를 열어드리고, 발급 후 수동 입력해주세요.',
  preSteps: [
    {
      title: '① 빅카인즈 로그인 + API 신청 페이지 이동',
      description: '회원가입 후 마이페이지 > API 신청',
      externalUrl: APPLY_URL,
    },
    {
      title: '② 승인 대기',
      description: '관리자 승인까지 1~3일 소요됩니다. 승인 후 발급된 키를 환경설정 수동 입력란에 붙여넣으세요.',
    },
  ],
};

export async function startBigkindsWizard(
  _args: Record<string, never>,
  onProgress: (msg: string) => void
): Promise<KeyWizardResult> {
  onProgress('빅카인즈 페이지 열기...');
  await openExternal(APPLY_URL);
  return {
    success: true,
    site: 'bigkinds',
    partial: true,
    reason: '발급 페이지가 열렸습니다. 승인 후 수동 입력해주세요.',
  };
}
