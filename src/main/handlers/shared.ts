// 공유 상태 및 유틸리티
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// 전역 중지 플래그 (키워드별로 관리)
export const keywordDiscoveryAbortMap = new Map<string, boolean>();

// 무제한 라이선스 체크 헬퍼 함수
export function checkUnlimitedLicense(): { allowed: boolean; error?: any } {
  const isDevelopment = !app.isPackaged || process.env['NODE_ENV'] === 'development';

  if (isDevelopment) {
    console.log('[KEYWORD-MASTER] ✅ 개발 환경: 라이선스 체크 우회');
    return { allowed: true };
  }

  try {
    // admin-panel과 동일한 라이선스 경로 사용
    const licensePath = path.join(app.getPath('userData'), 'license', 'license.json');
    if (!fs.existsSync(licensePath)) {
      console.log('[KEYWORD-MASTER] ❌ 라이선스 파일이 없습니다:', licensePath);
      return {
        allowed: false,
        error: {
          error: '라이선스가 필요합니다',
          message: '이 기능은 무제한 기간 구매자만 사용할 수 있습니다.',
          requiresUnlimited: true
        }
      };
    }

    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    console.log('[KEYWORD-MASTER] 라이선스 파일 로드:', licensePath);
    const isUnlimited = licenseData.maxUses === -1 || licenseData.remaining === -1 || licenseData.plan === 'unlimited';

    if (!isUnlimited) {
      console.log('[KEYWORD-MASTER] ❌ 무제한 라이선스가 필요합니다.');
      return {
        allowed: false,
        error: {
          error: '무제한 라이선스가 필요합니다',
          message: '이 기능은 무제한 기간 구매자만 사용할 수 있습니다.',
          requiresUnlimited: true
        }
      };
    }

    console.log('[KEYWORD-MASTER] ✅ 무제한 라이선스 확인됨');
    return { allowed: true };
  } catch (licenseError: any) {
    console.error('[KEYWORD-MASTER] 라이선스 확인 중 오류:', licenseError);
    return {
      allowed: false,
      error: {
        error: '라이선스 확인 실패',
        message: '라이선스를 확인하는 중 오류가 발생했습니다.',
        requiresUnlimited: true
      }
    };
  }
}

// PRO 티어 자격 체크 (영구제 + 1년권)
// 1개월/3개월 = LITE, 1년/영구제 = PRO
export function checkProTierAllowed(): { allowed: boolean; reason?: string } {
  const isDevelopment = !app.isPackaged || process.env['NODE_ENV'] === 'development';
  if (isDevelopment) return { allowed: true, reason: 'dev' };

  try {
    const licensePath = path.join(app.getPath('userData'), 'license', 'license.json');
    if (!fs.existsSync(licensePath)) return { allowed: false, reason: 'no-license' };

    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

    // 영구제(무제한)
    const isUnlimited = licenseData.isUnlimited === true
      || licenseData.plan === 'unlimited'
      || licenseData.licenseType === 'unlimited'
      || licenseData.licenseType === 'permanent'
      || licenseData.maxUses === -1
      || licenseData.remaining === -1
      || !licenseData.expiresAt;
    if (isUnlimited) return { allowed: true, reason: 'unlimited' };

    // 1년권
    const typeStr = String(licenseData.licenseType || licenseData.plan || '').toUpperCase();
    if (['1YEAR', '365DAY', 'YEARLY'].includes(typeStr)) {
      return { allowed: true, reason: '1year' };
    }

    return { allowed: false, reason: 'short-period' };
  } catch {
    return { allowed: false, reason: 'error' };
  }
}
