/**
 * 데이터 검증 유틸리티
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence?: number;
}

export class DataValidator {
  static validateBlogData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!data) {
      errors.push('데이터가 없습니다');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      confidence: errors.length === 0 ? 100 : 0
    };
  }
  
  static validateKeyword(keyword: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!keyword || keyword.trim().length === 0) {
      errors.push('키워드가 비어있습니다');
    }
    
    if (keyword.length > 100) {
      warnings.push('키워드가 너무 깁니다');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      confidence: errors.length === 0 ? 100 : 0
    };
  }
  
  static validateTopBlogPost(post: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let confidence = 100;
    
    if (!post) {
      errors.push('포스트가 없습니다');
      confidence = 0;
    } else {
      if (!post.title) {
        warnings.push('제목이 없습니다');
        confidence -= 20;
      }
      if (!post.url) {
        errors.push('URL이 없습니다');
        confidence -= 50;
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      confidence: Math.max(0, confidence)
    };
  }
}
