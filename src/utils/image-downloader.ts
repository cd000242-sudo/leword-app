/**
 * 이미지 다운로드 및 로컬 저장 유틸리티
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { getWritableDataDir } from './index';

/**
 * 이미지를 다운로드하여 로컬 폴더에 저장
 */
export async function downloadAndSaveImage(
  imageUrl: string,
  options: {
    folderName?: string;
    fileName?: string;
    topic?: string;
    subtopic?: string;
  } = {}
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  try {
    // 이미지 저장 폴더 경로 설정
    const dataDir = getWritableDataDir();
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
      } else {
        fileName = `${timestamp}_${randomStr}${ext}`;
      }
    }
    
    const filePath = path.join(imageDir, fileName);
    
    // 이미지 다운로드
    const response = await axios({
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
  } catch (error: any) {
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
export async function downloadMultipleImages(
  imageUrls: string[],
  options: {
    folderName?: string;
    topic?: string;
    subtopic?: string;
    maxImages?: number;
  } = {}
): Promise<Array<{ url: string; localPath?: string; success: boolean; error?: string }>> {
  const maxImages = options.maxImages || 5; // 기본 최대 5개
  const urlsToDownload = imageUrls.slice(0, maxImages);
  
  const results = await Promise.all(
    urlsToDownload.map(async (url) => {
      const downloadOptions: {
        folderName?: string;
        fileName?: string;
        topic?: string;
        subtopic?: string;
      } = {
        folderName: options.folderName || 'crawled-images'
      };
      
      if (options.topic) downloadOptions.topic = options.topic;
      if (options.subtopic) downloadOptions.subtopic = options.subtopic;
      
      const result = await downloadAndSaveImage(url, downloadOptions);
      
      const returnValue: { url: string; localPath?: string; success: boolean; error?: string } = {
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
    })
  );
  
  return results;
}

/**
 * 파일명에서 특수문자 제거
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
}

/**
 * 이미지 저장 폴더 경로 가져오기
 */
export function getImageStoragePath(folderName: string = 'crawled-images'): string {
  const dataDir = getWritableDataDir();
  return path.join(dataDir, folderName);
}

/**
 * 저장된 이미지 목록 가져오기
 */
export function getSavedImages(folderName: string = 'crawled-images'): string[] {
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
  } catch (error) {
    console.error(`[IMAGE-DOWNLOADER] 저장된 이미지 목록 조회 실패:`, error);
    return [];
  }
}

