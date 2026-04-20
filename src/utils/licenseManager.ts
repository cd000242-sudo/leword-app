// LEWORD 앱용 라이선스 관리 시스템
// admin-panel과 동일한 Google Apps Script 서버 연동
import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const LICENSE_FILE = 'license.json';
const APP_ID = 'com.leword.keyword.master'; // LEWORD 앱 ID

// Google Apps Script 서버 URL (admin-panel과 동일)
const DEFAULT_LICENSE_SERVER_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

// 영어 오류 메시지를 한글로 번역
function translateErrorMessage(message: string): string {
  const translations: Record<string, string> = {
    'User ID already exists': '이미 등록된 아이디입니다.\n→ 라이선스 코드 없이 아이디/비밀번호만 입력해주세요.',
    'Invalid license code': '유효하지 않은 라이선스 코드입니다.',
    'License code already used': '이미 사용된 라이선스 코드입니다.',
    'License expired': '라이선스가 만료되었습니다.',
    'Invalid credentials': '아이디 또는 비밀번호가 올바르지 않습니다.',
    'User not found': '등록되지 않은 아이디입니다.\n→ 라이선스 코드와 함께 등록해주세요.',
    'Invalid password': '비밀번호가 올바르지 않습니다.',
    'License not found': '라이선스를 찾을 수 없습니다.',
    'Server error': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  };

  for (const [eng, kor] of Object.entries(translations)) {
    if (message.toLowerCase().includes(eng.toLowerCase())) {
      return kor;
    }
  }
  return message;
}

let licenseDir: string | null = null;
let licensePath: string | null = null;
let cachedLicense: any = null;

async function ensureLicenseDir(): Promise<string> {
  if (licenseDir) {
    return licenseDir;
  }
  if (!app.isReady()) {
    await app.whenReady();
  }
  licenseDir = path.join(app.getPath('userData'), 'license');
  await fs.mkdir(licenseDir, { recursive: true });
  licensePath = path.join(licenseDir, LICENSE_FILE);
  return licenseDir;
}

function generateDeviceId(): string {
  const platform = process.platform;
  const hostname = require('os').hostname();
  const userInfo = require('os').userInfo();
  const uniqueString = `${platform}-${hostname}-${userInfo.username}`;
  return crypto.createHash('sha256').update(uniqueString).digest('hex').substring(0, 32);
}

export async function getDeviceId(): Promise<string> {
  const dir = await ensureLicenseDir();
  const deviceIdPath = path.join(dir, 'device.id');
  try {
    const deviceId = await fs.readFile(deviceIdPath, 'utf-8');
    if (deviceId && deviceId.length >= 16) {
      return deviceId.trim();
    }
  } catch {
    // 파일이 없으면 새로 생성
  }
  const newDeviceId = generateDeviceId();
  await fs.writeFile(deviceIdPath, newDeviceId, 'utf-8');
  return newDeviceId;
}

export async function loadLicense(): Promise<any> {
  console.log('[LICENSE] 라이선스 로드 시작 (isPackaged:', app.isPackaged, ')');

  // 개발 환경 (npm start)에서는 무제한 라이선스 자동 활성화
  if (!app.isPackaged) {
    console.log('[LICENSE] 개발 환경 감지 - 무제한 라이선스 자동 활성화');
    const devLicense = {
      isValid: true,
      plan: 'unlimited',
      licenseType: 'unlimited',
      userId: '개발자',
      isUnlimited: true,
      isPremium: true,
      expiresAt: null,
      registeredAt: new Date().toISOString()
    };
    cachedLicense = devLicense;
    return devLicense;
  }

  // 배포 환경에서는 실제 라이선스 파일 확인
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);
  try {
    const raw = await fs.readFile(licenseFile, 'utf-8');
    const license = JSON.parse(raw);
    cachedLicense = license;
    return license;
  } catch {
    cachedLicense = null;
    return null;
  }
}

/**
 * 서버에서 최신 라이선스 정보 동기화
 * 관리자 패널에서 기간 변경 시 앱에 즉시 반영
 */
export async function refreshLicenseFromServer(): Promise<{ success: boolean; license?: any; message?: string }> {
  console.log('[LICENSE] 서버에서 라이선스 정보 동기화 시작...');

  // 개발 환경에서는 스킵
  if (!app.isPackaged) {
    console.log('[LICENSE] 개발 환경 - 서버 동기화 스킵');
    return { success: true, license: cachedLicense };
  }

  // 저장된 라이선스 로드
  const savedLicense = await loadLicense();
  if (!savedLicense || !savedLicense.userId || !savedLicense.userPassword) {
    console.log('[LICENSE] 저장된 인증 정보 없음 - 동기화 불가');
    return { success: false, message: '저장된 인증 정보가 없습니다.' };
  }

  try {
    console.log('[LICENSE] 서버에 라이선스 정보 요청:', savedLicense.userId);

    const response = await fetch(DEFAULT_LICENSE_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify-credentials',
        userId: savedLicense.userId,
        userPassword: savedLicense.userPassword,
        appId: APP_ID,
      }),
    });

    if (!response.ok) {
      console.error('[LICENSE] 서버 응답 오류:', response.status);
      return { success: false, message: `서버 오류: ${response.status}` };
    }

    const result = JSON.parse(await response.text());
    console.log('[LICENSE] 서버 응답:', result);

    if (!result.ok || !result.valid) {
      console.error('[LICENSE] 인증 실패:', result.error || result.message);
      return { success: false, message: result.error || result.message };
    }

    console.log('[LICENSE] 서버 응답 전체:', JSON.stringify(result, null, 2));

    // 🔥 영구제 판단: expiresAt이 없거나 licenseType이 EX/unlimited/permanent인 경우
    const typeUpper = (result.licenseType || '').toUpperCase();
    const planUpper = (result.plan || '').toUpperCase();
    const isUnlimited = !result.expiresAt ||
      typeUpper === 'EX' ||
      typeUpper === 'UNLIMITED' ||
      typeUpper === 'PERMANENT' ||
      planUpper === 'EX' ||
      planUpper === 'UNLIMITED' ||
      planUpper === 'PERMANENT';

    // 🔥 서버에서 받은 유형을 그대로 저장 (기간으로 다시 계산하지 않음!)
    const serverPlan = result.plan || result.licenseType || 'standard';
    const serverLicenseType = result.licenseType || result.plan || 'standard';

    // ✅ 서버에서 받은 최신 정보로 업데이트
    const updatedLicense = {
      ...savedLicense,
      expiresAt: result.expiresAt || null,
      licenseType: serverLicenseType, // 🔥 서버에서 받은 유형 그대로 저장
      plan: serverPlan, // 🔥 서버에서 받은 플랜 그대로 저장 (1year, 3months, unlimited 등)
      isValid: true,
      lastSyncAt: new Date().toISOString(),
      maxUses: isUnlimited ? -1 : 100,
      remaining: isUnlimited ? -1 : 100,
      isUnlimited: isUnlimited,
    };

    console.log(`[LICENSE] 서버에서 받은 플랜: ${serverPlan}, 유형: ${serverLicenseType}`);
    if (isUnlimited) {
      console.log('[LICENSE] 🔥 영구제(무제한) 라이선스 확인됨!');
    }

    // 저장
    await saveLicense(updatedLicense);
    cachedLicense = updatedLicense;

    console.log('[LICENSE] ✅ 서버 동기화 완료:', {
      userId: updatedLicense.userId,
      plan: updatedLicense.plan,
      expiresAt: updatedLicense.expiresAt
    });

    return { success: true, license: updatedLicense };

  } catch (error: any) {
    console.error('[LICENSE] 서버 동기화 실패:', error);
    return { success: false, message: error.message || '서버 연결 실패' };
  }
}

// safeStorage 암호화된 credentials 파일
const CREDENTIALS_FILE = 'credentials.enc';

/**
 * 체크박스 "기억하기" 켜진 경우 userId + userPassword를 OS 키체인 수준 암호화로 저장
 * electron.safeStorage 사용 — Windows DPAPI / macOS Keychain / Linux SecretService
 */
async function saveCredentials(userId: string, userPassword: string): Promise<void> {
  try {
    const { safeStorage } = require('electron');
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[LICENSE] safeStorage 암호화 불가 — credential 저장 스킵');
      return;
    }
    const filePath = await ensureLicenseDir();
    const credFile = path.join(filePath, CREDENTIALS_FILE);
    const payload = JSON.stringify({ userId, userPassword });
    const encrypted = safeStorage.encryptString(payload);
    await fs.writeFile(credFile, encrypted);
  } catch (e: any) {
    console.warn('[LICENSE] credential 저장 실패:', e?.message);
  }
}

/**
 * 저장된 credential 로드 (자동로그인용)
 */
export async function loadCredentials(): Promise<{ userId: string; userPassword: string } | null> {
  try {
    const { safeStorage } = require('electron');
    if (!safeStorage.isEncryptionAvailable()) return null;
    const filePath = await ensureLicenseDir();
    const credFile = path.join(filePath, CREDENTIALS_FILE);
    const raw = await fs.readFile(credFile);
    const decrypted = safeStorage.decryptString(raw);
    return JSON.parse(decrypted);
  } catch {
    return null; // 파일 없거나 복호화 실패
  }
}

/**
 * credential 파일만 삭제 (로그아웃 또는 "기억하기" 해제 시)
 */
export async function clearCredentials(): Promise<void> {
  try {
    const filePath = await ensureLicenseDir();
    const credFile = path.join(filePath, CREDENTIALS_FILE);
    await fs.unlink(credFile);
  } catch {
    // 파일 없으면 무시
  }
}

export async function saveLicense(license: any, options?: { rememberCredentials?: boolean }): Promise<void> {
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);
  cachedLicense = license;
  const { userPassword, ...safeData } = license;
  await fs.writeFile(licenseFile, JSON.stringify(safeData, null, 2), 'utf-8');

  // 🔐 "기억하기" 켜진 경우 별도 암호화 파일에 credential 저장
  if (options?.rememberCredentials && license.userId && userPassword) {
    await saveCredentials(license.userId, userPassword);
  } else if (options?.rememberCredentials === false) {
    // 명시적으로 끈 경우 기존 credential 삭제
    await clearCredentials();
  }
}

export async function clearLicense(): Promise<void> {
  const filePath = await ensureLicenseDir();
  const licenseFile = path.join(filePath, LICENSE_FILE);
  try {
    await fs.unlink(licenseFile);
  } catch {
    // 파일이 없어도 무시
  }
  cachedLicense = null;
}

/**
 * 로그아웃 — license.json + credentials.enc 모두 삭제 + 메모리 초기화
 */
export async function logout(): Promise<{ success: boolean }> {
  try {
    await clearLicense();
    await clearCredentials();
    return { success: true };
  } catch (e: any) {
    console.error('[LICENSE] 로그아웃 실패:', e?.message);
    return { success: false };
  }
}

/**
 * 자동로그인 — 저장된 credential 있으면 서버 재인증
 */
export async function autoLogin(): Promise<{ success: boolean; license?: any; message?: string }> {
  const creds = await loadCredentials();
  if (!creds || !creds.userId || !creds.userPassword) {
    return { success: false, message: '저장된 credential 없음' };
  }
  try {
    const deviceId = await getDeviceId();
    const result = await verifyLicense('', deviceId, undefined, creds.userId, creds.userPassword);
    if (result.valid && result.license) {
      // 메모리 캐시 업데이트 (password 포함)
      cachedLicense = { ...result.license, userPassword: creds.userPassword };
      return { success: true, license: result.license };
    }
    return { success: false, message: result.message || '서버 재인증 실패' };
  } catch (e: any) {
    return { success: false, message: e?.message || '자동로그인 실패' };
  }
}

export function getCachedLicense(): any {
  return cachedLicense;
}

export function validateLicenseFormat(licenseCode: string): boolean {
  const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(licenseCode);
}

export function isLicenseExpired(license: any): boolean {
  if (!license.expiresAt) {
    return false; // 만료일이 없으면 영구 라이선스
  }
  const expiresAt = new Date(license.expiresAt);
  return new Date() > expiresAt;
}

/**
 * 라이선스 검증 (Google Apps Script 서버 연동)
 */
export async function verifyLicense(
  licenseCode: string,
  deviceId: string,
  serverUrl?: string,
  userId?: string,
  userPassword?: string,
  rememberCredentials?: boolean
): Promise<{ valid: boolean; message?: string; license?: any }> {
  const actualServerUrl = serverUrl || DEFAULT_LICENSE_SERVER_URL;

  // 0. 파라미터가 모두 비어있는 경우 - 저장된 라이선스로 자동 로그인 시도
  if (!licenseCode && !userId && !userPassword) {
    console.log('[LICENSE] 자동 로그인 시도 - 저장된 라이선스 확인');
    const savedLicense = await loadLicense();

    if (savedLicense && savedLicense.userId && savedLicense.userPassword) {
      console.log('[LICENSE] 저장된 인증 정보 발견:', savedLicense.userId);
      // 저장된 아이디/비밀번호로 재인증
      return verifyLicense('', deviceId, actualServerUrl, savedLicense.userId, savedLicense.userPassword);
    } else {
      console.log('[LICENSE] 저장된 인증 정보 없음');
      return {
        valid: false,
        message: '저장된 인증 정보가 없습니다.',
      };
    }
  }

  // 1. 아이디/비밀번호만 있는 경우 (재로그인) - verify-credentials 액션 사용
  if (userId && userPassword && !licenseCode) {
    console.log('[LICENSE] 아이디/비밀번호로 인증 시도:', { userId, appId: APP_ID });

    try {
      const response = await fetch(actualServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify-credentials',
          userId: userId,
          userPassword: userPassword,
          appId: APP_ID,
        }),
      });

      console.log('[LICENSE] verify-credentials 응답:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '응답 본문 읽기 실패');
        console.error('[LICENSE] verify-credentials 실패:', errorText);
        return {
          valid: false,
          message: `서버 검증 실패: ${response.status} ${response.statusText}`,
        };
      }

      const responseText = await response.text();
      const result = JSON.parse(responseText);
      console.log('[LICENSE] verify-credentials 결과:', result);

      if (!result.ok || !result.valid) {
        const errorMsg = result.error || result.message || '아이디 또는 비밀번호가 일치하지 않습니다.';
        return {
          valid: false,
          message: translateErrorMessage(errorMsg),
        };
      }

      console.log('[LICENSE] ✅ verify-credentials 인증 성공!');
      console.log('[LICENSE] 서버 응답 전체:', JSON.stringify(result, null, 2));

      // 🔥 영구제 판단: expiresAt이 없거나 licenseType이 EX/unlimited/permanent인 경우
      const typeUpper = (result.licenseType || '').toUpperCase();
      const planUpper = (result.plan || '').toUpperCase();
      const isUnlimited = !result.expiresAt ||
        typeUpper === 'EX' ||
        typeUpper === 'UNLIMITED' ||
        typeUpper === 'PERMANENT' ||
        planUpper === 'EX' ||
        planUpper === 'UNLIMITED' ||
        planUpper === 'PERMANENT';

      // 🔥 서버에서 받은 유형을 그대로 저장 (덮어쓰지 않음!)
      const serverPlan = result.plan || result.licenseType || 'standard';
      const serverLicenseType = result.licenseType || result.plan || 'standard';

      // 인증 성공 - 라이선스 정보 저장
      const license = {
        licenseCode: result.licenseCode,
        deviceId,
        verifiedAt: new Date().toISOString(),
        expiresAt: result.expiresAt || null, // 영구제면 null
        isValid: true,
        licenseType: serverLicenseType, // 🔥 서버에서 받은 유형 그대로 저장
        plan: serverPlan, // 🔥 서버에서 받은 플랜 그대로 저장 (1year, 3months, unlimited 등)
        maxUses: isUnlimited ? -1 : 100,
        remaining: isUnlimited ? -1 : 100,
        userId: userId,
        userPassword: userPassword,
        isUnlimited: isUnlimited, // 명시적으로 저장
      };

      console.log('[LICENSE] 저장할 라이선스:', {
        userId: license.userId,
        licenseType: license.licenseType,
        plan: license.plan,
        isUnlimited: license.isUnlimited,
        expiresAt: license.expiresAt
      });

      // license 객체에 userPassword 를 포함해 전달 (saveLicense 가 꺼내서 암호화 저장)
      await saveLicense({ ...license, userPassword }, { rememberCredentials });
      return { valid: true, license };

    } catch (error: any) {
      console.error('[LICENSE] verify-credentials 에러:', error);
      return {
        valid: false,
        message: `서버 연결 실패: ${error?.message || '알 수 없는 오류'}`,
      };
    }
  }

  // 2. 라이선스 코드가 있는 경우 (초기 등록) - register 액션 사용
  if (licenseCode) {
    // 형식 검증
    if (!validateLicenseFormat(licenseCode)) {
      return {
        valid: false,
        message: '라이선스 코드 형식이 올바르지 않습니다. (예: XXXX-XXXX-XXXX-XXXX)',
      };
    }

    // userId와 userPassword가 필수
    if (!userId || !userPassword) {
      return {
        valid: false,
        message: '아이디와 비밀번호를 입력해주세요.',
      };
    }

    console.log('[LICENSE] 라이선스 등록 시작:', {
      licenseCode,
      userId,
      appId: APP_ID
    });

    // 429 에러 재시도 로직
    let retries = 3;
    let lastError: any = null;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(actualServerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'register',
            code: licenseCode,
            userId: userId,
            userPassword: userPassword,
            appId: APP_ID,
            deviceId: deviceId,
          }),
        });

        // 429 에러 (Too Many Requests) 처리
        if (response.status === 429) {
          console.log(`[LICENSE] 429 에러 - ${i + 1}/${retries} 재시도 중...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          return {
            valid: false,
            message: `서버 검증 실패: ${response.status} ${response.statusText}`,
          };
        }

        const responseText = await response.text();
        const result = JSON.parse(responseText);
        console.log('[LICENSE] register 결과:', result);

        if (!result.ok) {
          const errorMsg = result.error || result.message || '라이선스 등록에 실패했습니다.';
          return {
            valid: false,
            message: translateErrorMessage(errorMsg),
          };
        }

        console.log('[LICENSE] ✅ 라이선스 등록 성공!');
        console.log('[LICENSE] 서버 응답 전체:', JSON.stringify(result, null, 2));

        // 🔥 영구제 판단: expiresAt이 없거나 licenseType이 EX/unlimited/permanent인 경우
        const typeUpper = (result.licenseType || '').toUpperCase();
        const planUpper = (result.plan || '').toUpperCase();
        const isUnlimited = !result.expiresAt ||
          typeUpper === 'EX' ||
          typeUpper === 'UNLIMITED' ||
          typeUpper === 'PERMANENT' ||
          planUpper === 'EX' ||
          planUpper === 'UNLIMITED' ||
          planUpper === 'PERMANENT';

        // 🔥 서버에서 받은 유형을 그대로 저장 (덮어쓰지 않음!)
        const serverPlan = result.plan || result.licenseType || 'standard';
        const serverLicenseType = result.licenseType || result.plan || 'standard';

        // 등록 성공 - 라이선스 정보 저장
        const license = {
          licenseCode: licenseCode,
          deviceId,
          verifiedAt: new Date().toISOString(),
          expiresAt: result.expiresAt || null,
          isValid: true,
          licenseType: serverLicenseType, // 🔥 서버에서 받은 유형 그대로 저장
          plan: serverPlan, // 🔥 서버에서 받은 플랜 그대로 저장 (1year, 3months, unlimited 등)
          maxUses: isUnlimited ? -1 : 100,
          remaining: isUnlimited ? -1 : 100,
          userId: userId,
          userPassword: userPassword,
          isUnlimited: isUnlimited,
        };

        console.log('[LICENSE] 저장할 라이선스:', {
          userId: license.userId,
          licenseType: license.licenseType,
          plan: license.plan,
          isUnlimited: license.isUnlimited,
          expiresAt: license.expiresAt
        });

        await saveLicense({ ...license, userPassword }, { rememberCredentials });
        return { valid: true, license };

      } catch (error: any) {
        lastError = error;
        console.error(`[LICENSE] register 에러 (시도 ${i + 1}/${retries}):`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    return {
      valid: false,
      message: `서버 연결 실패: ${lastError?.message || '알 수 없는 오류'}`,
    };
  }

  // 코드가 없는 경우
  return {
    valid: false,
    message: '라이선스 코드, 또는 아이디/비밀번호를 입력해주세요.',
  };
}

/**
 * 라이선스 재검증
 */
export async function revalidateLicense(serverUrl?: string): Promise<boolean> {
  const license = await loadLicense();
  if (!license || !license.isValid) {
    return false;
  }

  if (isLicenseExpired(license)) {
    await clearLicense();
    return false;
  }

  return true;
}

/**
 * 라이선스 서버 URL 가져오기
 */
export function getLicenseServerUrl(): string {
  return DEFAULT_LICENSE_SERVER_URL;
}

/**
 * 프리미엄 라이선스 확인
 */
export function isPremiumLicense(license: any): boolean {
  if (!license) return false;

  return (
    license.plan === 'unlimited' ||
    license.plan === 'three-months-plus' ||
    license.licenseType === 'unlimited' ||
    license.licenseType === 'three-months-plus'
  );
}

/**
 * 무제한 라이선스 확인
 */
export function isUnlimitedLicense(license: any): boolean {
  if (!license) return false;

  return (
    license.plan === 'unlimited' ||
    license.licenseType === 'unlimited' ||
    !license.expiresAt
  );
}

/**
 * 라이선스 검증 및 저장
 */
export async function verifyAndSaveLicense(authData: {
  licenseCode?: string;
  userId?: string;
  userPassword?: string;
  serverUrl?: string;
  rememberCredentials?: boolean;
}): Promise<{ success: boolean; plan?: string; isUnlimited?: boolean; message?: string }> {
  const { licenseCode, userId, userPassword, serverUrl, rememberCredentials } = authData;

  const result = await verifyLicense(
    licenseCode || '',
    await getDeviceId(),
    serverUrl || DEFAULT_LICENSE_SERVER_URL,
    userId,
    userPassword,
    rememberCredentials
  );

  if (result.valid && result.license) {
    return {
      success: true,
      plan: result.license.plan || 'standard',
      isUnlimited: !!result.license.isUnlimited
    };
  }

  return { success: false, message: result.message || '인증 실패' };
}
