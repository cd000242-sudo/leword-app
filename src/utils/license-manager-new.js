"use strict";
/**
 * 라이선스 관리 시스템
 * 아이디/비밀번호/코드 기반 인증
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseManager = void 0;
exports.getLicenseManager = getLicenseManager;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
class LicenseManager {
    constructor() {
        const userDataPath = electron_1.app.getPath('userData');
        this.licensePath = path_1.default.join(userDataPath, 'license.json');
        this.patchFilePath = path_1.default.join(userDataPath, 'license.patch');
    }
    /**
     * 비밀번호 해시 생성
     */
    hashPassword(password) {
        return crypto_1.default.createHash('sha256').update(password).digest('hex');
    }
    /**
     * 패치 파일 해시 생성
     */
    hashPatchFile(patchContent) {
        return crypto_1.default.createHash('sha256').update(patchContent).digest('hex');
    }
    /**
     * 디바이스 ID 생성
     */
    getDeviceId() {
        const os = require('os');
        const base = `${os.hostname()}|${os.platform()}|${os.arch()}`;
        return crypto_1.default.createHash('sha256').update(base).digest('hex').slice(0, 32);
    }
    /**
     * 라이선스 인증 (아이디/비밀번호/코드)
     */
    async authenticate(userId, password, licenseCode) {
        try {
            const deviceId = this.getDeviceId();
            const passwordHash = this.hashPassword(password);
            // 기존 라이선스 확인
            let existingLicense = null;
            if (fs_1.default.existsSync(this.licensePath)) {
                try {
                    existingLicense = JSON.parse(fs_1.default.readFileSync(this.licensePath, 'utf8'));
                }
                catch (e) {
                    // 파일이 손상된 경우 무시
                }
            }
            // 기존 라이선스가 있고, 코드 기간이 남아있으면 아이디/비밀번호만으로 인증
            if (existingLicense) {
                // 아이디/비밀번호 일치 확인
                if (existingLicense.userId === userId &&
                    existingLicense.passwordHash === passwordHash &&
                    existingLicense.deviceId === deviceId) {
                    // 기간제인 경우 만료 확인
                    if (existingLicense.licenseType === 'temporary') {
                        if (existingLicense.expiresAt && existingLicense.expiresAt > Date.now()) {
                            return {
                                success: true,
                                message: '라이선스 인증 성공 (기간제, 기간 남음)',
                                licenseData: existingLicense
                            };
                        }
                        else if (existingLicense.expiresAt && existingLicense.expiresAt <= Date.now()) {
                            // 만료된 경우 코드 재등록 필요
                            if (licenseCode) {
                                return await this.registerLicense(userId, password, licenseCode);
                            }
                            return {
                                success: false,
                                message: '라이선스가 만료되었습니다. 코드를 다시 등록해주세요.'
                            };
                        }
                    }
                    else {
                        // 영구제인 경우
                        // 패치 파일 확인
                        if (fs_1.default.existsSync(this.patchFilePath)) {
                            const patchContent = fs_1.default.readFileSync(this.patchFilePath, 'utf8');
                            const patchHash = this.hashPatchFile(patchContent);
                            if (existingLicense.patchFileHash === patchHash) {
                                return {
                                    success: true,
                                    message: '라이선스 인증 성공 (영구제, 패치 파일 확인됨)',
                                    licenseData: existingLicense
                                };
                            }
                        }
                        // 패치 파일이 없거나 해시가 다르면 코드 재등록 필요
                        if (licenseCode) {
                            return await this.registerLicense(userId, password, licenseCode);
                        }
                        return {
                            success: false,
                            message: '패치 파일이 없거나 유효하지 않습니다. 코드를 다시 등록해주세요.'
                        };
                    }
                }
            }
            // 기존 라이선스가 없거나 인증 실패한 경우, 코드로 등록
            if (licenseCode) {
                return await this.registerLicense(userId, password, licenseCode);
            }
            return {
                success: false,
                message: '라이선스가 등록되지 않았습니다. 아이디, 비밀번호, 코드를 입력해주세요.'
            };
        }
        catch (error) {
            return {
                success: false,
                message: `라이선스 인증 실패: ${error.message || '알 수 없는 오류'}`
            };
        }
    }
    /**
     * 라이선스 등록 (코드 기반)
     */
    async registerLicense(userId, password, licenseCode) {
        try {
            const deviceId = this.getDeviceId();
            const passwordHash = this.hashPassword(password);
            // 라이선스 코드 검증 (서버 API를 통해 검증)
            const licenseInfo = await this.parseLicenseCode(licenseCode, userId, password);
            if (!licenseInfo) {
                return {
                    success: false,
                    message: '유효하지 않은 라이선스 코드입니다. 코드 형식을 확인하거나 서버에 문의해주세요.'
                };
            }
            const licenseData = {
                userId,
                passwordHash,
                licenseType: licenseInfo.type,
                activatedAt: Date.now(),
                deviceId,
                ...(licenseCode && { licenseCode }),
                ...(licenseInfo.expiresAt && { expiresAt: licenseInfo.expiresAt })
            };
            // 영구제인 경우 패치 파일 생성
            if (licenseInfo.type === 'permanent' && licenseCode) {
                const patchContent = this.generatePatchFile(userId, deviceId, licenseCode);
                fs_1.default.writeFileSync(this.patchFilePath, patchContent, 'utf8');
                licenseData.patchFileHash = this.hashPatchFile(patchContent);
            }
            // 라이선스 파일 저장
            fs_1.default.writeFileSync(this.licensePath, JSON.stringify(licenseData, null, 2), 'utf8');
            return {
                success: true,
                message: licenseInfo.type === 'permanent'
                    ? '라이선스 등록 성공 (영구제) - 패치 파일이 생성되었습니다. 이후 아이디/비밀번호만으로 사용 가능합니다.'
                    : `라이선스 등록 성공 (기간제) - ${new Date(licenseInfo.expiresAt).toLocaleDateString()}까지 사용 가능합니다.`,
                licenseData
            };
        }
        catch (error) {
            return {
                success: false,
                message: `라이선스 등록 실패: ${error.message || '알 수 없는 오류'}`
            };
        }
    }
    /**
     * 라이선스 코드 검증 (서버 API를 통해 검증)
     * 서버가 코드 형식과 유효성을 모두 검증합니다.
     */
    async parseLicenseCode(code, userId, password) {
        try {
            // 환경 변수에서 서버 URL 가져오기
            const { loadEnvFromFile } = await Promise.resolve().then(() => __importStar(require('../env')));
            const env = loadEnvFromFile();
            const redeemUrl = env.licenseRedeemUrl ||
                env.LICENSE_REDEEM_URL ||
                process.env['LICENSE_REDEEM_URL'] ||
                '';
            if (!redeemUrl) {
                throw new Error('라이선스 서버 URL이 설정되지 않았습니다.');
            }
            // 서버 API를 통해 코드 검증 (서버가 코드 형식과 유효성을 모두 검증)
            const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
            const response = await axios.post(redeemUrl, {
                code,
                userId,
                password: this.hashPassword(password) // 비밀번호는 해시로 전송
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.data && response.data.valid) {
                const data = response.data;
                const result = {
                    type: data.type === 'permanent' ? 'permanent' : 'temporary'
                };
                if (data.expiresAt) {
                    result.expiresAt = new Date(data.expiresAt).getTime();
                }
                return result;
            }
            return null;
        }
        catch (error) {
            console.error('[LICENSE] 서버 검증 실패:', error.message);
            throw new Error(`라이선스 코드 검증 실패: ${error.message || '서버에 연결할 수 없습니다.'}`);
        }
    }
    /**
     * 패치 파일 생성 (영구제용)
     */
    generatePatchFile(userId, deviceId, licenseCode) {
        const patchData = {
            userId,
            deviceId,
            licenseCode,
            generatedAt: Date.now()
        };
        // 간단한 암호화 (실제로는 더 강력한 암호화 필요)
        const content = JSON.stringify(patchData);
        const encrypted = crypto_1.default.createHash('sha256').update(content).digest('hex');
        return `${encrypted}:${content}`;
    }
    /**
     * 라이선스 상태 확인
     */
    getLicenseStatus() {
        try {
            if (!fs_1.default.existsSync(this.licensePath)) {
                return {
                    valid: false,
                    message: '라이선스가 등록되지 않았습니다.'
                };
            }
            const licenseData = JSON.parse(fs_1.default.readFileSync(this.licensePath, 'utf8'));
            const deviceId = this.getDeviceId();
            if (licenseData.deviceId !== deviceId) {
                return {
                    valid: false,
                    message: '디바이스가 변경되었습니다. 다시 인증해주세요.'
                };
            }
            if (licenseData.licenseType === 'temporary') {
                if (licenseData.expiresAt && licenseData.expiresAt > Date.now()) {
                    const daysLeft = Math.ceil((licenseData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
                    return {
                        valid: true,
                        message: `기간제 라이선스 (${daysLeft}일 남음)`,
                        licenseData
                    };
                }
                else {
                    return {
                        valid: false,
                        message: '라이선스가 만료되었습니다. 코드를 다시 등록해주세요.'
                    };
                }
            }
            else {
                // 영구제
                if (fs_1.default.existsSync(this.patchFilePath)) {
                    const patchContent = fs_1.default.readFileSync(this.patchFilePath, 'utf8');
                    const patchHash = this.hashPatchFile(patchContent);
                    if (licenseData.patchFileHash === patchHash) {
                        return {
                            valid: true,
                            message: '영구제 라이선스 (인증됨)',
                            licenseData
                        };
                    }
                }
                return {
                    valid: false,
                    message: '패치 파일이 없거나 유효하지 않습니다.'
                };
            }
        }
        catch (error) {
            return {
                valid: false,
                message: `라이선스 확인 실패: ${error.message || '알 수 없는 오류'}`
            };
        }
    }
}
exports.LicenseManager = LicenseManager;
// 싱글톤 인스턴스
let licenseManagerInstance = null;
function getLicenseManager() {
    if (!licenseManagerInstance) {
        licenseManagerInstance = new LicenseManager();
    }
    return licenseManagerInstance;
}
