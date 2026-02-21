/**
 * Structured Content Image Section Application Utility
 * Applies images to structured content sections with retry logic and error handling
 */

// ============================================
// Constants
// ============================================

/** Delay constants for UI interactions (milliseconds) */
const DELAY = {
  /** Short delay for quick UI updates */
  SHORT: 100,
  /** Medium delay for element ready checks */
  MEDIUM: 300,
  /** Long delay for complex operations */
  LONG: 500,
  /** Extra long delay for heavy operations */
  EXTRA_LONG: 1000,
  /** Delay after entering text */
  AFTER_TEXT_INPUT: 150,
  /** Delay after clicking elements */
  AFTER_CLICK: 200,
  /** Delay after DOM updates */
  AFTER_DOM_UPDATE: 250
} as const;

/** Maximum retry attempts for operations */
const MAX_RETRIES = 3;

/** Default timeout for element selection (milliseconds) */
const DEFAULT_TIMEOUT = 5000;

// ============================================
// Type Definitions
// ============================================

interface ImageSectionOptions {
  sectionIndex: number;
  imageUrl: string;
  alt?: string;
  width?: number;
  height?: number;
  retryOnFailure?: boolean;
  timeout?: number;
}

interface ApplyResult {
  success: boolean;
  sectionIndex: number;
  message?: string;
  error?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Delays execution for specified milliseconds
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for an element to be available in the DOM
 * @param selector - CSS selector for the element
 * @param timeout - Maximum time to wait (milliseconds)
 * @returns Element if found, null otherwise
 */
function waitForElement(selector: string, timeout: number = DEFAULT_TIMEOUT): Promise<Element | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime >= timeout) {
        console.warn(`[APPLY-IMAGE] Element not found within timeout: ${selector}`);
        resolve(null);
        return;
      }
      
      setTimeout(checkElement, DELAY.SHORT);
    };
    
    checkElement();
  });
}

/**
 * Safely dispatches keyboard event (Enter key)
 * @param element - Target element to dispatch event on
 */
function pressEnterKey(element: HTMLElement): void {
  try {
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(enterEvent);
  } catch (error) {
    console.error('[APPLY-IMAGE] Failed to dispatch Enter key event:', error);
  }
}

/**
 * Validates image URL format
 * @param url - URL to validate
 * @returns true if valid, false otherwise
 */
function isValidImageUrl(url: string): boolean {
  try {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // Check for data URL
    if (url.startsWith('data:image/')) {
      return true;
    }
    
    // Check for HTTP/HTTPS URL
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Retries an operation with exponential backoff
 * @param operation - Async function to retry
 * @param operationName - Name for logging
 * @param maxAttempts - Maximum retry attempts
 * @returns Result of the operation
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxAttempts: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[APPLY-IMAGE] ${operationName} - Attempt ${attempt}/${maxAttempts}`);
      const result = await operation();
      
      if (attempt > 1) {
        console.log(`[APPLY-IMAGE] ✅ ${operationName} succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[APPLY-IMAGE] ⚠️ ${operationName} failed on attempt ${attempt}:`, error);
      
      if (attempt < maxAttempts) {
        const backoffDelay = DELAY.MEDIUM * Math.pow(2, attempt - 1);
        console.log(`[APPLY-IMAGE] Retrying in ${backoffDelay}ms...`);
        await delay(backoffDelay);
      }
    }
  }
  
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${operationName} failed after ${maxAttempts} attempts: ${errorMessage}`);
}

// ============================================
// Main Functions
// ============================================

/**
 * Applies an image to a specific section in structured content
 * @param options - Configuration options for image application
 * @returns Result object with success status
 */
export async function applyStructuredContentImageSection(
  options: ImageSectionOptions
): Promise<ApplyResult> {
  const {
    sectionIndex,
    imageUrl,
    alt = '',
    width,
    height,
    retryOnFailure = true,
    timeout = DEFAULT_TIMEOUT
  } = options;
  
  console.log(`[APPLY-IMAGE] Starting image application for section ${sectionIndex}`);
  console.log(`[APPLY-IMAGE] Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
  
  try {
    // Step 1: Validate input
    if (typeof sectionIndex !== 'number' || sectionIndex < 0) {
      const error = `Invalid section index: ${sectionIndex}`;
      console.error(`[APPLY-IMAGE] ❌ ${error}`);
      return {
        success: false,
        sectionIndex,
        error
      };
    }
    
    if (!isValidImageUrl(imageUrl)) {
      const error = 'Invalid image URL format';
      console.error(`[APPLY-IMAGE] ❌ ${error}`);
      return {
        success: false,
        sectionIndex,
        error
      };
    }
    
    // Step 2: Find section element
    console.log(`[APPLY-IMAGE] Looking for section element (index: ${sectionIndex})...`);
    
    const findSectionElement = async (): Promise<HTMLElement | null> => {
      // Try multiple selectors for section identification
      const selectors = [
        `[data-section-index="${sectionIndex}"]`,
        `.section[data-index="${sectionIndex}"]`,
        `#section-${sectionIndex}`,
        `.content-section:nth-child(${sectionIndex + 1})`
      ];
      
      for (const selector of selectors) {
        const element = await waitForElement(selector, timeout);
        if (element && element instanceof HTMLElement) {
          console.log(`[APPLY-IMAGE] ✅ Section found using selector: ${selector}`);
          return element;
        }
      }
      
      return null;
    };
    
    const sectionElement = retryOnFailure
      ? await retryWithBackoff(findSectionElement, 'Section element search')
      : await findSectionElement();
    
    if (!sectionElement) {
      const error = `Section element not found for index ${sectionIndex}`;
      console.error(`[APPLY-IMAGE] ❌ ${error}`);
      return {
        success: false,
        sectionIndex,
        error
      };
    }
    
    // Step 3: Wait for section to be ready
    await delay(DELAY.MEDIUM);
    
    // Step 4: Create or update image element
    console.log(`[APPLY-IMAGE] Creating/updating image element...`);
    
    const applyImageOperation = async (): Promise<void> => {
      // Check if image already exists in section
      let imgElement = sectionElement.querySelector('img') as HTMLImageElement | null;
      
      if (imgElement) {
        console.log(`[APPLY-IMAGE] Existing image found, updating...`);
        imgElement.src = imageUrl;
        if (alt) imgElement.alt = alt;
        if (width) imgElement.width = width;
        if (height) imgElement.height = height;
      } else {
        console.log(`[APPLY-IMAGE] Creating new image element...`);
        imgElement = document.createElement('img');
        imgElement.src = imageUrl;
        imgElement.alt = alt || `Section ${sectionIndex} image`;
        if (width) imgElement.width = width;
        if (height) imgElement.height = height;
        imgElement.style.maxWidth = '100%';
        imgElement.style.height = 'auto';
        imgElement.style.display = 'block';
        imgElement.style.margin = '0 auto';
        
        // Insert image at the beginning of section
        if (sectionElement.firstChild) {
          sectionElement.insertBefore(imgElement, sectionElement.firstChild);
        } else {
          sectionElement.appendChild(imgElement);
        }
      }
      
      // Wait for image to load
      await new Promise<void>((resolve, reject) => {
        if (imgElement?.complete) {
          resolve();
          return;
        }
        
        const timeoutId = setTimeout(() => {
          reject(new Error('Image load timeout'));
        }, timeout);
        
        imgElement?.addEventListener('load', () => {
          clearTimeout(timeoutId);
          resolve();
        });
        
        imgElement?.addEventListener('error', (e) => {
          clearTimeout(timeoutId);
          reject(new Error('Image load failed'));
        });
      });
      
      console.log(`[APPLY-IMAGE] ✅ Image applied successfully`);
    };
    
    if (retryOnFailure) {
      await retryWithBackoff(applyImageOperation, 'Image application');
    } else {
      await applyImageOperation();
    }
    
    // Step 5: Wait for DOM updates
    await delay(DELAY.AFTER_DOM_UPDATE);
    
    return {
      success: true,
      sectionIndex,
      message: `Image successfully applied to section ${sectionIndex}`
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    console.error(`[APPLY-IMAGE] ❌ Image application failed for section ${sectionIndex}:`, errorMessage);
    if (errorDetails) {
      console.error('[APPLY-IMAGE] Error stack:', errorDetails);
    }
    
    return {
      success: false,
      sectionIndex,
      error: `Image application failed: ${errorMessage}`
    };
  }
}

/**
 * Applies images to multiple sections in batch
 * @param sections - Array of image section options
 * @returns Array of results for each section
 */
export async function applyStructuredContentImageSections(
  sections: ImageSectionOptions[]
): Promise<ApplyResult[]> {
  console.log(`[APPLY-IMAGE] Starting batch image application for ${sections.length} sections`);
  
  try {
    const results: ApplyResult[] = [];
    
    // Process sections sequentially to avoid DOM conflicts
    for (const section of sections) {
      const result = await applyStructuredContentImageSection(section);
      results.push(result);
      
      // Add delay between sections to prevent DOM thrashing
      if (section !== sections[sections.length - 1]) {
        await delay(DELAY.MEDIUM);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[APPLY-IMAGE] ✅ Batch application completed: ${successCount}/${sections.length} successful`);
    
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[APPLY-IMAGE] ❌ Batch application failed:`, errorMessage);
    
    return sections.map((section, index) => ({
      success: false,
      sectionIndex: section.sectionIndex,
      error: `Batch application failed: ${errorMessage}`
    }));
  }
}

/**
 * Removes image from a specific section
 * @param sectionIndex - Index of the section to remove image from
 * @returns Result object with success status
 */
export async function removeStructuredContentImageSection(
  sectionIndex: number
): Promise<ApplyResult> {
  console.log(`[APPLY-IMAGE] Removing image from section ${sectionIndex}`);
  
  try {
    if (typeof sectionIndex !== 'number' || sectionIndex < 0) {
      const error = `Invalid section index: ${sectionIndex}`;
      console.error(`[APPLY-IMAGE] ❌ ${error}`);
      return {
        success: false,
        sectionIndex,
        error
      };
    }
    
    const sectionElement = await waitForElement(
      `[data-section-index="${sectionIndex}"]`,
      DEFAULT_TIMEOUT
    ) as HTMLElement | null;
    
    if (!sectionElement) {
      const error = `Section element not found for index ${sectionIndex}`;
      console.error(`[APPLY-IMAGE] ❌ ${error}`);
      return {
        success: false,
        sectionIndex,
        error
      };
    }
    
    const imgElement = sectionElement.querySelector('img');
    if (imgElement) {
      imgElement.remove();
      console.log(`[APPLY-IMAGE] ✅ Image removed from section ${sectionIndex}`);
      return {
        success: true,
        sectionIndex,
        message: `Image removed from section ${sectionIndex}`
      };
    } else {
      console.log(`[APPLY-IMAGE] ℹ️ No image found in section ${sectionIndex}`);
      return {
        success: true,
        sectionIndex,
        message: `No image to remove from section ${sectionIndex}`
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[APPLY-IMAGE] ❌ Image removal failed for section ${sectionIndex}:`, errorMessage);
    
    return {
      success: false,
      sectionIndex,
      error: `Image removal failed: ${errorMessage}`
    };
  }
}


