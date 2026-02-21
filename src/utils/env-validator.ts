/**
 * 환경설정 검증 유틸리티
 * 친절하고 정확한 오류 메시지 제공
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    fixHint: string;
  }>;
}

export class EnvValidator {
  /**
   * API 키 형식 검증
   */
  static validateApiKey(key: string, keyName: string): { isValid: boolean; message?: string; fixHint?: string } {
    if (!key || key.trim().length === 0) {
      return {
        isValid: false,
        message: `${keyName}이(가) 비어있습니다.`,
        fixHint: `${keyName}을(를) 입력해주세요.`
      };
    }

    const trimmed = key.trim();
    
    // 앞뒤 공백 체크
    if (trimmed !== key) {
      return {
        isValid: false,
        message: `${keyName} 앞뒤에 공백이 있습니다.`,
        fixHint: '키 앞뒤의 공백을 제거해주세요.'
      };
    }

    // 너무 짧은 키 체크
    if (trimmed.length < 10) {
      return {
        isValid: false,
        message: `${keyName}이(가) 너무 짧습니다 (${trimmed.length}자).`,
        fixHint: 'API 키가 올바르게 복사되었는지 확인해주세요.'
      };
    }

    // 특수문자 체크 (일부 키는 특수문자 포함 가능)
    if (keyName.includes('Secret') || keyName.includes('비밀')) {
      // Secret 키는 특수문자 포함 가능
      if (trimmed.length < 20) {
        return {
          isValid: false,
          message: `${keyName}이(가) 너무 짧습니다.`,
          fixHint: '비밀 키가 올바르게 복사되었는지 확인해주세요.'
        };
      }
    }

    return { isValid: true };
  }

  /**
   * 블로그 ID 검증
   */
  static validateBlogId(blogId: string): { isValid: boolean; message?: string; fixHint?: string } {
    if (!blogId || blogId.trim().length === 0) {
      return {
        isValid: false,
        message: '블로그 ID가 비어있습니다.',
        fixHint: '블로그스팟 블로그 ID를 입력해주세요.'
      };
    }

    const trimmed = blogId.trim();
    
    // 블로그스팟 ID 형식 체크 (일반적으로 영문자, 숫자, 하이픈)
    if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
      return {
        isValid: false,
        message: '블로그 ID 형식이 올바르지 않습니다.',
        fixHint: '블로그스팟 주소에서 블로그 ID만 추출해서 입력해주세요. (예: myblog.blogspot.com → myblog)'
      };
    }

    return { isValid: true };
  }

  /**
   * URL 검증
   */
  static validateUrl(url: string, urlName: string): { isValid: boolean; message?: string; fixHint?: string } {
    if (!url || url.trim().length === 0) {
      return {
        isValid: false,
        message: `${urlName}이(가) 비어있습니다.`,
        fixHint: `${urlName}을(를) 입력해주세요.`
      };
    }

    const trimmed = url.trim();
    
    try {
      const urlObj = new URL(trimmed);
      if (!urlObj.protocol.startsWith('http')) {
        return {
          isValid: false,
          message: `${urlName}은(는) http:// 또는 https://로 시작해야 합니다.`,
          fixHint: 'URL 앞에 https://를 추가해주세요.'
        };
      }
    } catch {
      return {
        isValid: false,
        message: `${urlName} 형식이 올바르지 않습니다.`,
        fixHint: '올바른 URL 형식으로 입력해주세요. (예: https://example.com)'
      };
    }

    return { isValid: true };
  }

  /**
   * 전체 환경설정 검증
   */
  static validateEnvConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string; fixHint: string }> = [];

    // AI API 키 검증 (최소 하나는 필요)
    const hasOpenAI = config['openaiKey'] || config['openaiApiKey'];
    const hasGemini = config['geminiKey'] || config['geminiApiKey'];
    const hasClaude = config['claudeKey'] || config['claudeApiKey'];

    if (!hasOpenAI && !hasGemini && !hasClaude) {
      errors.push({
        field: 'aiKey',
        message: 'AI API 키가 하나도 입력되지 않았습니다.',
        fixHint: 'OpenAI, Gemini, 또는 Claude API 키 중 최소 하나를 입력해주세요.'
      });
    } else {
      // 입력된 키 검증
      if (hasOpenAI) {
        const key = config['openaiKey'] || config['openaiApiKey'];
        const result = this.validateApiKey(key, 'OpenAI API 키');
        if (!result.isValid) {
          errors.push({
            field: 'openaiKey',
            message: result.message || 'OpenAI API 키가 올바르지 않습니다.',
            fixHint: result.fixHint || 'OpenAI API 키를 확인해주세요.'
          });
        }
      }

      if (hasGemini) {
        const key = config['geminiKey'] || config['geminiApiKey'];
        const result = this.validateApiKey(key, 'Gemini API 키');
        if (!result.isValid) {
          errors.push({
            field: 'geminiKey',
            message: result.message || 'Gemini API 키가 올바르지 않습니다.',
            fixHint: result.fixHint || 'Gemini API 키를 확인해주세요.'
          });
        }
      }
    }

    // 블로그 ID 검증 (Blogger 사용 시)
    const platform = config['platform'];
    if (platform === 'blogger') {
      const blogId = config['blogId'];
      if (blogId) {
        const result = this.validateBlogId(blogId);
        if (!result.isValid) {
          errors.push({
            field: 'blogId',
            message: result.message || '블로그 ID가 올바르지 않습니다.',
            fixHint: result.fixHint || '블로그 ID를 확인해주세요.'
          });
        }
      }
    }

    // WordPress URL 검증
    if (platform === 'wordpress') {
      const wordpressSiteUrl = config['wordpressSiteUrl'];
      if (wordpressSiteUrl) {
        const result = this.validateUrl(wordpressSiteUrl, 'WordPress 사이트 URL');
        if (!result.isValid) {
          errors.push({
            field: 'wordpressSiteUrl',
            message: result.message || 'WordPress 사이트 URL이 올바르지 않습니다.',
            fixHint: result.fixHint || 'WordPress 사이트 URL을 확인해주세요.'
          });
        }
      }
    }

    // 네이버 API 키 검증 (둘 다 필요)
    const naverClientId = config['naverClientId'];
    const naverClientSecret = config['naverClientSecret'];
    if (naverClientId || naverClientSecret) {
      if (!naverClientId) {
        errors.push({
          field: 'naverClientId',
          message: '네이버 Client ID가 입력되지 않았습니다.',
          fixHint: '네이버 API 키 발급 페이지에서 Client ID를 복사해서 입력해주세요.'
        });
      } else {
        const result = this.validateApiKey(naverClientId, '네이버 Client ID');
        if (!result.isValid) {
          errors.push({
            field: 'naverClientId',
            message: result.message || '네이버 Client ID가 올바르지 않습니다.',
            fixHint: result.fixHint || '네이버 Client ID를 확인해주세요.'
          });
        }
      }

      if (!naverClientSecret) {
        errors.push({
          field: 'naverClientSecret',
          message: '네이버 Client Secret이 입력되지 않았습니다.',
          fixHint: '네이버 API 키 발급 페이지에서 Client Secret을 복사해서 입력해주세요.'
        });
      } else {
        const result = this.validateApiKey(naverClientSecret, '네이버 Client Secret');
        if (!result.isValid) {
          errors.push({
            field: 'naverClientSecret',
            message: result.message || '네이버 Client Secret이 올바르지 않습니다.',
            fixHint: result.fixHint || '네이버 Client Secret을 확인해주세요.'
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 친절한 오류 메시지 생성
   */
  static formatErrors(errors: Array<{ field: string; message: string; fixHint: string }>): string {
    if (errors.length === 0) {
      return '';
    }

    if (errors.length === 1) {
      const error = errors[0];
      if (error) {
        return `❌ ${error.message}\n\n💡 해결 방법: ${error.fixHint}`;
      }
      return '';
    }

    let message = `❌ ${errors.length}개의 오류가 발견되었습니다:\n\n`;
    errors.forEach((error, index) => {
      if (error) {
        message += `${index + 1}. ${error.message}\n   💡 ${error.fixHint}\n\n`;
      }
    });

    return message;
  }
}

