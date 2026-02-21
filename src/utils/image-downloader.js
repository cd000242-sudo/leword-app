"use strict";
/**
 * 이미지 다운로드 및 로컬 저장 유틸리티
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
exports.downloadAndSaveImage = downloadAndSaveImage;
exports.downloadMultipleImages = downloadMultipleImages;
exports.getImageStoragePath = getImageStoragePath;
exports.getSavedImages = getSavedImages;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("../utils");
/**
 * 이미지를 다운로드하여 로컬 폴더에 저장
 */
async function downloadAndSaveImage(imageUrl, options = {}) {
    try {
        // 이미지 저장 폴더 경로 설정
        const dataDir = (0, utils_1.getWritableDataDir)();
        const folderName = options.folderName || 'crawled-images';
        const imageDir = path.join(dataDir, folderName);
        // 폴더 생성
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }
        // 파일명 생성
        let fileName = options.fileName;
        if (!fileName) {
            const urlParts = imageUrl.split('/');
            const originalFileName = urlParts[urlParts.length - 1]?.split('?')[0] || 'image';
            const ext = path.extname(originalFileName) || '.jpg';
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            // 토픽/소제목 기반 파일명 생성
            if (options.topic || options.subtopic) {
                const topicPart = options.topic ? sanitizeFileName(options.topic).substring(0, 20) : '';
                const subtopicPart = options.subtopic ? sanitizeFileName(options.subtopic).substring(0, 20) : '';
                fileName = `${topicPart}_${subtopicPart}_${timestamp}_${randomStr}${ext}`.replace(/^_+|_+$/g, '');
            }
            else {
                fileName = `${timestamp}_${randomStr}${ext}`;
            }
        }
        const filePath = path.join(imageDir, fileName);
        // 이미지 다운로드
        const response = await (0, axios_1.default)({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': imageUrl
            }
        });
        // 파일 저장
        fs.writeFileSync(filePath, response.data);
        console.log(`[IMAGE-DOWNLOADER] ✅ 이미지 저장 완료: ${filePath}`);
        return {
            success: true,
            localPath: filePath
        };
    }
    catch (error) {
        console.error(`[IMAGE-DOWNLOADER] ❌ 이미지 다운로드 실패 (${imageUrl}):`, error?.message || error);
        return {
            success: false,
            error: error?.message || String(error)
        };
    }
}
/**
 * 여러 이미지를 일괄 다운로드
 */
async function downloadMultipleImages(imageUrls, options = {}) {
    const maxImages = options.maxImages || 5; // 기본 최대 5개
    const urlsToDownload = imageUrls.slice(0, maxImages);
    const results = await Promise.all(urlsToDownload.map(async (url) => {
        const downloadOptions = {
            folderName: options.folderName || 'crawled-images'
        };
        if (options.topic)
            downloadOptions.topic = options.topic;
        if (options.subtopic)
            downloadOptions.subtopic = options.subtopic;
        const result = await downloadAndSaveImage(url, downloadOptions);
        const returnValue = {
            url,
            success: result.success
        };
        if (result.localPath) {
            returnValue.localPath = result.localPath;
        }
        if (result.error) {
            returnValue.error = result.error;
        }
        return returnValue;
    }));
    return results;
}
/**
 * 파일명에서 특수문자 제거
 */
function sanitizeFileName(fileName) {
    return fileName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .trim();
}
/**
 * 이미지 저장 폴더 경로 가져오기
 */
function getImageStoragePath(folderName = 'crawled-images') {
    const dataDir = (0, utils_1.getWritableDataDir)();
    return path.join(dataDir, folderName);
}
/**
 * 저장된 이미지 목록 가져오기
 */
function getSavedImages(folderName = 'crawled-images') {
    try {
        const imageDir = getImageStoragePath(folderName);
        if (!fs.existsSync(imageDir)) {
            return [];
        }
        const files = fs.readdirSync(imageDir);
        return files
            .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        })
            .map(file => path.join(imageDir, file));
    }
    catch (error) {
        console.error(`[IMAGE-DOWNLOADER] 저장된 이미지 목록 조회 실패:`, error);
        return [];
    }
}
