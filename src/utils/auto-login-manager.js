"use strict";
/**
 * 자동 로그인 관리자
 * 앱 시작 시 저장된 인증 정보로 자동 로그인 시도
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryAutoLogin = tryAutoLogin;
exports.saveAutoLoginConfig = saveAutoLoginConfig;
exports.loadAutoLoginConfig = loadAutoLoginConfig;
exports.clearAutoLoginConfig = clearAutoLoginConfig;
const license_manager_new_1 = require("./license-manager-new");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Electron app을 동적으로 가져오기 (런타임에만 필요)
function getAppPath() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return app.getPath('userData');
        }
    }
    catch {
        // Electron이 아닌 환경
    }
    return path.join(process.cwd(), 'data');
}
/**
 * 자동 로그인 설정 저장 경로
 */
function getAutoLoginConfigPath() {
    const userDataPath = getAppPath();
    return path.join(userDataPath, 'auto-login.json');
}
/**
 * 자동 로그인 시도
 * - 저장된 인증 정보 확인
 * - 유효한 경우 자동 로그인 성공
 * - 만료되었거나 없는 경우 로그인 창 표시 필요
 */
async function tryAutoLogin() {
    try {
        const licenseManager = (0, license_manager_new_1.getLicenseManager)();
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
    }
    catch (error) {
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
function saveAutoLoginConfig(enabled, userId) {
    try {
        const configPath = getAutoLoginConfigPath();
        const config = {
            enabled,
            userId: enabled ? userId : undefined,
            savedAt: Date.now()
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log('[AUTO-LOGIN] 자동 로그인 설정 저장:', enabled);
    }
    catch (error) {
        console.error('[AUTO-LOGIN] 설정 저장 실패:', error);
    }
}
/**
 * 자동 로그인 설정 로드
 */
function loadAutoLoginConfig() {
    try {
        const configPath = getAutoLoginConfigPath();
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return {
                enabled: config.enabled === true,
                userId: config.userId
            };
        }
    }
    catch (error) {
        console.error('[AUTO-LOGIN] 설정 로드 실패:', error);
    }
    return { enabled: false };
}
/**
 * 자동 로그인 설정 삭제
 */
function clearAutoLoginConfig() {
    try {
        const configPath = getAutoLoginConfigPath();
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
            console.log('[AUTO-LOGIN] 자동 로그인 설정 삭제됨');
        }
    }
    catch (error) {
        console.error('[AUTO-LOGIN] 설정 삭제 실패:', error);
    }
}
