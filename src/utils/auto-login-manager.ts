/**
 * 자동 로그인 관리자
 * 앱 시작 시 저장된 인증 정보로 자동 로그인 시도
 */

import { getLicenseManager } from './license-manager-new';
import * as fs from 'fs';
import * as path from 'path';

// Electron app을 동적으로 가져오기 (런타임에만 필요)
function getAppPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Electron이 아닌 환경
  }
  return path.join(process.cwd(), 'data');
}

/**
 * 자동 로그인 설정 저장 경로
 */
function getAutoLoginConfigPath(): string {
  const userDataPath = getAppPath();
  return path.join(userDataPath, 'auto-login.json');
}

export interface AutoLoginResult {
  success: boolean;
  shouldShowLoginWindow: boolean;
  message?: string;
  licenseData?: any;
}

/**
 * 자동 로그인 시도
 * - 저장된 인증 정보 확인
 * - 유효한 경우 자동 로그인 성공
 * - 만료되었거나 없는 경우 로그인 창 표시 필요
 */
export async function tryAutoLogin(): Promise<AutoLoginResult> {
  try {
    const licenseManager = getLicenseManager();
    const status = licenseManager.getLicenseStatus();
    
    // 라이선스가 유효한 경우
    if (status.valid === true) {
      // 기간제인 경우 만료 확인
      if (status.licenseData?.licenseType === 'temporary' && status.licenseData?.expiresAt) {
        const expiresDate = new Date(status.licenseData.expiresAt);
        const now = new Date();
        
        if (expiresDate <= now) {
          // 만료된 경우 자동 로그인 차단
          return {
            success: false,
            shouldShowLoginWindow: true,
            message: '라이선스가 만료되었습니다. 코드를 다시 등록해주세요.'
          };
        }
      }
      
      // 자동 로그인 성공
      return {
        success: true,
        shouldShowLoginWindow: false,
        message: '자동 로그인 성공',
        licenseData: status.licenseData
      };
    }
    
    // 라이선스가 없거나 유효하지 않은 경우
    return {
      success: false,
      shouldShowLoginWindow: true,
      message: status.message || '라이선스 인증이 필요합니다.'
    };
  } catch (error: any) {
    console.error('[AUTO-LOGIN] 자동 로그인 확인 실패:', error);
    return {
      success: false,
      shouldShowLoginWindow: true,
      message: '자동 로그인 확인 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 자동 로그인 설정 저장
 */
export function saveAutoLoginConfig(enabled: boolean, userId?: string): void {
  try {
    const configPath = getAutoLoginConfigPath();
    const config = {
      enabled,
      userId: enabled ? userId : undefined,
      savedAt: Date.now()
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('[AUTO-LOGIN] 자동 로그인 설정 저장:', enabled);
  } catch (error: any) {
    console.error('[AUTO-LOGIN] 설정 저장 실패:', error);
  }
}

/**
 * 자동 로그인 설정 로드
 */
export function loadAutoLoginConfig(): { enabled: boolean; userId?: string } {
  try {
    const configPath = getAutoLoginConfigPath();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        enabled: config.enabled === true,
        userId: config.userId
      };
    }
  } catch (error: any) {
    console.error('[AUTO-LOGIN] 설정 로드 실패:', error);
  }
  return { enabled: false };
}

/**
 * 자동 로그인 설정 삭제
 */
export function clearAutoLoginConfig(): void {
  try {
    const configPath = getAutoLoginConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('[AUTO-LOGIN] 자동 로그인 설정 삭제됨');
    }
  } catch (error: any) {
    console.error('[AUTO-LOGIN] 설정 삭제 실패:', error);
  }
}

