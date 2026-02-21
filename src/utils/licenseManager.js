"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeviceId = getDeviceId;
exports.loadLicense = loadLicense;
exports.saveLicense = saveLicense;
exports.clearLicense = clearLicense;
exports.getCachedLicense = getCachedLicense;
exports.validateLicenseFormat = validateLicenseFormat;
exports.isLicenseExpired = isLicenseExpired;
exports.verifyLicense = verifyLicense;
exports.revalidateLicense = revalidateLicense;
const electron_1 = require("electron");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const LICENSE_FILE = 'license.json';
let licenseDir = null;
let licensePath = null;
let cachedLicense = null;
async function ensureLicenseDir() {
    if (licenseDir) {
        return licenseDir;
    }
    if (!electron_1.app.isReady()) {
        await electron_1.app.whenReady();
    }
    licenseDir = path_1.default.join(electron_1.app.getPath('userData'), 'license');
    await promises_1.default.mkdir(licenseDir, { recursive: true });
    licensePath = path_1.default.join(licenseDir, LICENSE_FILE);
    return licenseDir;
}
function generateDeviceId() {
    // 기기 고유 ID 생성 (MAC 주소 기반 또는 하드웨어 정보)
    const platform = process.platform;
    const hostname = require('os').hostname();
    const userInfo = require('os').userInfo();
    const uniqueString = `${platform}-${hostname}-${userInfo.username}`;
    return crypto_1.default.createHash('sha256').update(uniqueString).digest('hex').substring(0, 32);
}
async function getDeviceId() {
    const dir = await ensureLicenseDir();
    const deviceIdPath = path_1.default.join(dir, 'device.id');
    try {
        const deviceId = await promises_1.default.readFile(deviceIdPath, 'utf-8');
        if (deviceId && deviceId.length >= 16) {
            return deviceId.trim();
        }
    }
    catch {
        // 파일이 없으면 새로 생성
    }
    const newDeviceId = generateDeviceId();
    await promises_1.default.writeFile(deviceIdPath, newDeviceId, 'utf-8');
    return newDeviceId;
}
async function loadLicense() {
    const filePath = await ensureLicenseDir();
    const licenseFile = path_1.default.join(filePath, LICENSE_FILE);
    try {
        const raw = await promises_1.default.readFile(licenseFile, 'utf-8');
        const license = JSON.parse(raw);
        cachedLicense = license;
        return license;
    }
    catch {
        cachedLicense = null;
        return null;
    }
}
async function saveLicense(license) {
    const filePath = await ensureLicenseDir();
    const licenseFile = path_1.default.join(filePath, LICENSE_FILE);
    cachedLicense = license;
    await promises_1.default.writeFile(licenseFile, JSON.stringify(license, null, 2), 'utf-8');
}
async function clearLicense() {
    const filePath = await ensureLicenseDir();
    const licenseFile = path_1.default.join(filePath, LICENSE_FILE);
    try {
        await promises_1.default.unlink(licenseFile);
    }
    catch {
        // 파일이 없어도 무시
    }
    cachedLicense = null;
}
function getCachedLicense() {
    return cachedLicense;
}
/**
 * 라이선스 코드 형식 검증 (예: XXXX-XXXX-XXXX-XXXX)
 */
function validateLicenseFormat(licenseCode) {
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(licenseCode);
}
/**
 * 라이선스 만료 여부 확인
 */
function isLicenseExpired(license) {
    if (!license.expiresAt) {
        return false; // 만료일이 없으면 영구 라이선스
    }
    const expiresAt = new Date(license.expiresAt);
    return new Date() > expiresAt;
}
/**
 * 라이선스 검증 (로컬 또는 서버)
 */
async function verifyLicense(licenseCode, deviceId, serverUrl, userId, userPassword) {
    // 저장된 라이선스 확인 (아이디/비밀번호로 인증 시도)
    if (userId && userPassword && !licenseCode) {
        const savedLicense = await loadLicense();
        if (savedLicense && savedLicense.userId === userId && savedLicense.userPassword === userPassword) {
            // 아이디/비밀번호로 인증 성공
            // 만료 확인
            if (isLicenseExpired(savedLicense)) {
                return {
                    valid: false,
                    message: '라이선스가 만료되었습니다. 새로운 코드를 등록해주세요.',
                };
            }
            // 인증 성공
            return { valid: true, license: savedLicense };
        }
        return {
            valid: false,
            message: '아이디 또는 비밀번호가 일치하지 않습니다.',
        };
    }
    
    // 코드가 없는 경우
    if (!licenseCode) {
        return {
            valid: false,
            message: '라이선스 코드, 또는 아이디/비밀번호를 입력해주세요.',
        };
    }
    
    // 형식 검증
    if (!validateLicenseFormat(licenseCode)) {
        return {
            valid: false,
            message: '라이선스 코드 형식이 올바르지 않습니다. (예: XXXX-XXXX-XXXX-XXXX)',
        };
    }
    // 서버 검증 (서버 URL이 제공된 경우)
    if (serverUrl) {
        try {
            const response = await fetch(`${serverUrl}/api/verify-license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    licenseCode,
                    deviceId,
                    appVersion: electron_1.app.getVersion(),
                    userId: userId || undefined,
                    userPassword: userPassword || undefined,
                }),
            });
            if (!response.ok) {
                return {
                    valid: false,
                    message: `서버 검증 실패: ${response.status} ${response.statusText}`,
                };
            }
            const result = await response.json();
            if (!result.valid) {
                return {
                    valid: false,
                    message: result.message || '라이선스 코드가 유효하지 않습니다.',
                };
            }
            const license = {
                licenseCode,
                deviceId,
                verifiedAt: new Date().toISOString(),
                expiresAt: result.expiresAt,
                isValid: true,
                licenseType: result.licenseType || 'standard',
                maxDevices: result.maxDevices,
                userId: userId || undefined,
                userPassword: userPassword || undefined,
            };
            await saveLicense(license);
            return { valid: true, license };
        }
        catch (error) {
            return {
                valid: false,
                message: `서버 연결 실패: ${error.message}`,
            };
        }
    }
    // 로컬 검증 (오프라인 모드)
    // 실제 구현에서는 암호화된 라이선스 코드를 검증해야 합니다
    // 여기서는 간단한 예시만 제공합니다
    // 예시: 특정 패턴의 라이선스 코드만 허용
    const validPrefixes = ['DEMO', 'TRIAL', 'PROD'];
    const prefix = licenseCode.substring(0, 4);
    if (!validPrefixes.includes(prefix)) {
        return {
            valid: false,
            message: '유효하지 않은 라이선스 코드입니다.',
        };
    }
    // 라이선스 타입 결정
    let licenseType = 'standard';
    let expiresAt;
    if (prefix === 'DEMO') {
        licenseType = 'trial';
        // 데모 라이선스는 7일 후 만료
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        expiresAt = expiry.toISOString();
    }
    else if (prefix === 'TRIAL') {
        licenseType = 'trial';
        // 트라이얼 라이선스는 30일 후 만료
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        expiresAt = expiry.toISOString();
    }
    else if (prefix === 'PROD') {
        licenseType = 'premium';
        // 프로덕션 라이선스는 영구 (또는 서버에서 만료일 제공)
        expiresAt = undefined;
    }
    const license = {
        licenseCode,
        deviceId,
        verifiedAt: new Date().toISOString(),
        expiresAt,
        isValid: true,
        licenseType,
        userId: userId || undefined,
        userPassword: userPassword || undefined,
    };
    await saveLicense(license);
    return { valid: true, license };
}
/**
 * 저장된 라이선스 재검증
 */
async function revalidateLicense(serverUrl) {
    const license = await loadLicense();
    if (!license || !license.isValid) {
        return false;
    }
    // 만료 확인
    if (isLicenseExpired(license)) {
        await clearLicense();
        return false;
    }
    // 서버 재검증 (선택사항)
    if (serverUrl) {
        try {
            const response = await fetch(`${serverUrl}/api/revalidate-license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    licenseCode: license.licenseCode,
                    deviceId: license.deviceId,
                }),
            });
            if (!response.ok) {
                return false;
            }
            const result = await response.json();
            if (!result.valid) {
                await clearLicense();
                return false;
            }
            // 라이선스 정보 업데이트
            license.verifiedAt = new Date().toISOString();
            if (result.expiresAt) {
                license.expiresAt = result.expiresAt;
            }
            await saveLicense(license);
        }
        catch {
            // 서버 연결 실패 시 로컬 라이선스 유지
        }
    }
    return true;
}






