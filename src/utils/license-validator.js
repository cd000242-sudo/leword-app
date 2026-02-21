"use strict";
/**
 * 라이선스 검증 강화 모듈
 * - 주기적 재검증
 * - 서버 시간 동기화
 * - 시스템 시간 조작 방지
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
exports.validateLicenseStrict = validateLicenseStrict;
exports.isLicenseExpired = isLicenseExpired;
exports.clearServerTimeCache = clearServerTimeCache;
const license_manager_new_1 = require("./license-manager-new");
// 서버 시간 캐시 (5분 유효)
let serverTimeCache = null;
const SERVER_TIME_CACHE_TTL = 5 * 60 * 1000; // 5분
/**
 * 서버 시간 가져오기 (환경 변수에서 서버 URL 사용)
 */
async function getServerTime() {
    try {
        // 캐시된 서버 시간이 유효하면 사용
        if (serverTimeCache && (Date.now() - serverTimeCache.timestamp) < SERVER_TIME_CACHE_TTL) {
            return serverTimeCache.time;
        }
        // 환경 변수에서 서버 URL 가져오기
        const { loadEnvFromFile } = await Promise.resolve().then(() => __importStar(require('../env')));
        const env = loadEnvFromFile();
        const serverUrl = env.licenseServerUrl ||
            env.LICENSE_SERVER_URL ||
            process.env['LICENSE_SERVER_URL'] ||
            '';
        if (!serverUrl) {
            console.warn('[LICENSE-VALIDATOR] 서버 URL이 설정되지 않음, 로컬 시간 사용');
            return null;
        }
        // 서버 시간 API 호출 (서버가 시간을 반환하는 엔드포인트 필요)
        // 최적화: 짧은 타임아웃으로 빠른 실패, UI 블로킹 최소화
        const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
        // Google Apps Script는 쿼리 파라미터로 경로 전달 (?path=time)
        // 일반 서버는 /time 경로 사용
        let timeUrl;
        if (serverUrl.includes('script.google.com')) {
            // Google Apps Script 형식
            timeUrl = `${serverUrl.replace(/\/$/, '')}?path=time`;
        }
        else {
            // 일반 서버 형식
            timeUrl = `${serverUrl.replace(/\/$/, '')}/time`;
        }
        try {
            const response = await axios.get(timeUrl, {
                timeout: 3000, // 3초 타임아웃 (빠른 실패)
                headers: {
                    'Content-Type': 'application/json'
                },
                // AbortController를 사용하여 취소 가능하게 (선택사항)
            });
            if (response.data && typeof response.data.timestamp === 'number') {
                const serverTime = response.data.timestamp;
                serverTimeCache = {
                    time: serverTime,
                    timestamp: Date.now()
                };
                return serverTime;
            }
        }
        catch (error) {
            // 서버 시간을 가져올 수 없으면 로컬 시간 사용
            // 네트워크 오류는 조용히 처리 (앱 사용에 영향 없음)
            if (error.code !== 'ECONNABORTED') { // 타임아웃은 로그 안 남김
                console.warn('[LICENSE-VALIDATOR] 서버 시간 가져오기 실패, 로컬 시간 사용:', error.message);
            }
        }
    }
    catch (error) {
        console.error('[LICENSE-VALIDATOR] 서버 시간 확인 중 오류:', error);
    }
    return null;
}
/**
 * 강화된 라이선스 검증
 * - 서버 시간과 동기화
 * - 시스템 시간 조작 감지
 * - 만료 정확한 확인
 */
async function validateLicenseStrict() {
    try {
        const licenseManager = (0, license_manager_new_1.getLicenseManager)();
        const status = licenseManager.getLicenseStatus();
        // 라이선스가 없거나 기본적으로 유효하지 않은 경우
        if (!status.valid) {
            return {
                valid: false,
                expired: true,
                message: status.message || '라이선스가 등록되지 않았습니다.'
            };
        }
        const licenseData = status.licenseData;
        if (!licenseData) {
            return {
                valid: false,
                expired: true,
                message: '라이선스 데이터가 없습니다.'
            };
        }
        // 기간제인 경우 만료 확인
        if (licenseData.licenseType === 'temporary' && licenseData.expiresAt) {
            const localTime = Date.now();
            let serverTime = null;
            // 서버 시간 가져오기 시도
            try {
                serverTime = await getServerTime();
            }
            catch (error) {
                console.warn('[LICENSE-VALIDATOR] 서버 시간 가져오기 실패, 로컬 시간 사용');
            }
            // 서버 시간이 있으면 서버 시간 사용, 없으면 로컬 시간 사용
            const currentTime = serverTime || localTime;
            const expiresAt = licenseData.expiresAt;
            // 시간 조작 감지 (로컬 시간이 서버 시간보다 1시간 이상 앞서 있으면 의심)
            const timeDiff = serverTime ? Math.abs(localTime - serverTime) : 0;
            if (serverTime && timeDiff > 60 * 60 * 1000) {
                console.warn('[LICENSE-VALIDATOR] ⚠️ 시스템 시간이 서버 시간과 크게 다릅니다:', {
                    localTime: new Date(localTime).toISOString(),
                    serverTime: new Date(serverTime).toISOString(),
                    diff: Math.round(timeDiff / 1000 / 60) + '분'
                });
                // 시간 조작이 의심되면 서버 시간 기준으로 검증
                if (localTime < serverTime) {
                    // 시스템 시간을 뒤로 되돌린 경우 (만료 우회 시도)
                    return {
                        valid: false,
                        expired: true,
                        message: '시스템 시간이 올바르지 않습니다. 인터넷 시간 동기화를 확인해주세요.',
                        serverTime,
                        localTime,
                        timeDiff
                    };
                }
            }
            // 만료 확인 (서버 시간 또는 로컬 시간 기준)
            if (expiresAt <= currentTime) {
                const result = {
                    valid: false,
                    expired: true,
                    message: '라이선스가 만료되었습니다. 코드를 다시 등록해주세요.',
                    localTime
                };
                if (serverTime !== null) {
                    result.serverTime = serverTime;
                    result.timeDiff = timeDiff;
                }
                return result;
            }
            // 유효한 경우
            const daysLeft = Math.ceil((expiresAt - currentTime) / (1000 * 60 * 60 * 24));
            const result = {
                valid: true,
                expired: false,
                message: `기간제 라이선스 (${daysLeft}일 남음)`,
                localTime
            };
            if (serverTime !== null) {
                result.serverTime = serverTime;
                result.timeDiff = timeDiff;
            }
            return result;
        }
        // 영구제인 경우
        if (licenseData.licenseType === 'permanent') {
            return {
                valid: true,
                expired: false,
                message: '영구제 라이선스 (인증됨)'
            };
        }
        // 알 수 없는 타입
        return {
            valid: false,
            expired: false,
            message: '알 수 없는 라이선스 타입입니다.'
        };
    }
    catch (error) {
        console.error('[LICENSE-VALIDATOR] 라이선스 검증 중 오류:', error);
        return {
            valid: false,
            expired: true,
            message: `라이선스 검증 실패: ${error.message || '알 수 없는 오류'}`
        };
    }
}
/**
 * 라이선스 만료 여부만 빠르게 확인 (서버 시간 동기화 없이)
 */
function isLicenseExpired() {
    try {
        const licenseManager = (0, license_manager_new_1.getLicenseManager)();
        const status = licenseManager.getLicenseStatus();
        if (!status.valid || !status.licenseData) {
            return true;
        }
        if (status.licenseData.licenseType === 'temporary' && status.licenseData.expiresAt) {
            return status.licenseData.expiresAt <= Date.now();
        }
        return false; // 영구제는 만료되지 않음
    }
    catch (error) {
        console.error('[LICENSE-VALIDATOR] 만료 확인 중 오류:', error);
        return true; // 오류 시 만료로 간주
    }
}
/**
 * 서버 시간 캐시 초기화 (테스트용)
 */
function clearServerTimeCache() {
    serverTimeCache = null;
}
