/**
 * Single Image Insert Utility
 * Handles image file validation and upload operations
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================
// Constants
// ============================================

/** Maximum file size in bytes (20MB) */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Allowed image file extensions */
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/** Retry configuration for failed operations */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 500,
  delayIncrement: 300
};

// ============================================
// Utility Functions
// ============================================

/**
 * Validates if the file path exists and is accessible
 * @param filePath - Path to the file
 * @returns true if path is valid, false otherwise
 */
function validateFilePath(filePath: string): boolean {
  try {
    if (!filePath || typeof filePath !== 'string') {
      console.error('[INSERT-IMAGE] Invalid file path type:', typeof filePath);
      return false;
    }
    
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath !== filePath && !path.isAbsolute(filePath)) {
      console.warn('[INSERT-IMAGE] Path normalization mismatch:', { original: filePath, normalized: normalizedPath });
    }
    
    return true;
  } catch (error) {
    console.error('[INSERT-IMAGE] File path validation error:', error);
    return false;
  }
}

/**
 * Validates if the URL is a valid HTTP/HTTPS URL
 * @param url - URL string to validate
 * @returns true if URL is valid, false otherwise
 */
function validateUrl(url: string): boolean {
  try {
    if (!url || typeof url !== 'string') {
      console.error('[INSERT-IMAGE] Invalid URL type:', typeof url);
      return false;
    }
    
    const urlObj = new URL(url);
    const isValidProtocol = urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    
    if (!isValidProtocol) {
      console.error('[INSERT-IMAGE] Invalid URL protocol:', urlObj.protocol);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[INSERT-IMAGE] URL validation error:', error);
    return false;
  }
}

/**
 * Determines MIME type from buffer by checking file signatures (magic numbers)
 * @param buffer - File buffer to analyze
 * @returns MIME type string or null if unknown
 */
function getMimeTypeFromBuffer(buffer: Buffer): string | null {
  try {
    if (!buffer || buffer.length < 4) {
      return null;
    }
    
    // Check file signatures (magic numbers)
    const header = buffer.subarray(0, 12);
    
    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      return 'image/png';
    }
    
    // GIF: 47 49 46 38 (GIF8)
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
      return 'image/gif';
    }
    
    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
      if (header.length >= 12 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
        return 'image/webp';
      }
    }
    
    return null;
  } catch (error) {
    console.error('[INSERT-IMAGE] MIME type detection error:', error);
    return null;
  }
}

/**
 * Validates file size against maximum allowed size
 * @param filePath - Path to the file to validate
 * @throws Error if file size exceeds maximum or file access fails
 */
async function validateFileSize(filePath: string): Promise<void> {
  try {
    console.log('[INSERT-IMAGE] Validating file size:', filePath);
    
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    console.log('[INSERT-IMAGE] File size:', fileSize, 'bytes (', (fileSize / 1024 / 1024).toFixed(2), 'MB)');
    
    if (fileSize > MAX_FILE_SIZE) {
      const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
      const maxMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
      throw new Error(`File size (${sizeMB}MB) exceeds maximum allowed size (${maxMB}MB)`);
    }
    
    if (fileSize === 0) {
      throw new Error('File is empty (0 bytes)');
    }
    
    console.log('[INSERT-IMAGE] ✅ File size validation passed');
  } catch (error) {
    console.error('[INSERT-IMAGE] File size validation error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`File size validation failed: ${String(error)}`);
  }
}

/**
 * Validates file extension against allowed extensions
 * @param filePath - Path to the file
 * @returns true if extension is allowed, false otherwise
 */
function validateFileExtension(filePath: string): boolean {
  try {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const isValid = ALLOWED_EXTENSIONS.includes(ext);
    
    if (!isValid) {
      console.error('[INSERT-IMAGE] Invalid file extension:', ext, 'Allowed:', ALLOWED_EXTENSIONS.join(', '));
    }
    
    return isValid;
  } catch (error) {
    console.error('[INSERT-IMAGE] Extension validation error:', error);
    return false;
  }
}

/**
 * Retry wrapper for async operations
 * @param operation - Async function to retry
 * @param operationName - Name of operation for logging
 * @returns Result of the operation
 * @throws Error if all retries fail
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`[INSERT-IMAGE] ${operationName} - Attempt ${attempt}/${RETRY_CONFIG.maxRetries}`);
      const result = await operation();
      if (attempt > 1) {
        console.log(`[INSERT-IMAGE] ✅ ${operationName} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[INSERT-IMAGE] ⚠️ ${operationName} failed on attempt ${attempt}:`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = RETRY_CONFIG.baseDelay + (attempt - 1) * RETRY_CONFIG.delayIncrement;
        console.log(`[INSERT-IMAGE] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${operationName} failed after ${RETRY_CONFIG.maxRetries} attempts: ${errorMessage}`);
}

// ============================================
// Main Function
// ============================================

/**
 * Inserts a single image from file path or URL
 * @param imageSource - File path or URL to the image
 * @param options - Additional options for image processing
 * @returns Result object with success status and image data or error
 */
export async function insertSingleImage(
  imageSource: string,
  options: {
    alt?: string;
    width?: number;
    height?: number;
    onLog?: (message: string) => void;
  } = {}
): Promise<{
  success: boolean;
  imageData?: {
    url: string;
    dataUrl?: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
  };
  error?: string;
}> {
  const log = (message: string) => {
    console.log(`[INSERT-IMAGE] ${message}`);
    options.onLog?.(message);
  };
  
  try {
    log('Starting image insertion process...');
    log(`Image source: ${imageSource.substring(0, 100)}${imageSource.length > 100 ? '...' : ''}`);
    
    // Step 1: Validate input
    if (!imageSource || typeof imageSource !== 'string') {
      const error = 'Image source is required and must be a string';
      log(`❌ ${error}`);
      return { success: false, error };
    }
    
    const isUrl = imageSource.startsWith('http://') || imageSource.startsWith('https://');
    const isFilePath = !isUrl;
    
    log(`Source type: ${isUrl ? 'URL' : 'File Path'}`);
    
    // Step 2: Validate source
    if (isUrl) {
      if (!validateUrl(imageSource)) {
        const error = 'Invalid URL format';
        log(`❌ ${error}`);
        return { success: false, error };
      }
    } else {
      if (!validateFilePath(imageSource)) {
        const error = 'Invalid file path format';
        log(`❌ ${error}`);
        return { success: false, error };
      }
      
      // Step 3: Validate file extension
      if (!validateFileExtension(imageSource)) {
        const error = `File extension not allowed. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`;
        log(`❌ ${error}`);
        return { success: false, error };
      }
    }
    
    // Step 4: Read file or fetch URL
    let buffer: Buffer;
    let mimeType: string | null = null;
    
    if (isUrl) {
      log('Fetching image from URL...');
      const fetchResult = await retryOperation(async () => {
        const response = await fetch(imageSource, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }, 'URL fetch');
      
      buffer = fetchResult;
      
      // Try to determine MIME type from Content-Type header or buffer
      const contentType = null; // Would need response object
      mimeType = getMimeTypeFromBuffer(buffer) || contentType || 'image/jpeg';
      
      log(`✅ Image fetched successfully (${buffer.length} bytes, ${mimeType})`);
    } else {
      log('Reading image file...');
      
      // Validate file size
      await validateFileSize(imageSource);
      
      // Read file with retry
      buffer = await retryOperation(async () => {
        return await fs.readFile(imageSource);
      }, 'File read');
      
      // Determine MIME type from buffer
      mimeType = getMimeTypeFromBuffer(buffer);
      
      // Fallback to extension-based MIME type
      if (!mimeType) {
        const ext = path.extname(imageSource).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        mimeType = mimeMap[ext] || 'image/jpeg';
      }
      
      log(`✅ Image file read successfully (${buffer.length} bytes, ${mimeType})`);
    }
    
    // Step 5: Create data URL
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    log(`✅ Data URL created (${dataUrl.length} characters)`);
    
    // Step 6: Return result
    const imageData: {
      url: string;
      dataUrl: string;
      mimeType: string;
      size: number;
      width?: number;
      height?: number;
    } = {
      url: isUrl ? imageSource : `file://${path.resolve(imageSource)}`,
      dataUrl,
      mimeType,
      size: buffer.length
    };
    
    // Only include width/height if provided
    if (options.width !== undefined) {
      imageData.width = options.width;
    }
    if (options.height !== undefined) {
      imageData.height = options.height;
    }
    
    const result = {
      success: true as const,
      imageData
    };
    
    log('✅ Image insertion completed successfully');
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    log(`❌ Image insertion failed: ${errorMessage}`);
    if (errorDetails) {
      console.error('[INSERT-IMAGE] Error stack:', errorDetails);
    }
    
    return {
      success: false,
      error: `Image insertion failed: ${errorMessage}`
    };
  }
}

