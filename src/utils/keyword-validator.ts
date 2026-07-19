/**
 * 키워드 검증 유틸리티
 * 네이버 API를 통해 키워드의 실제 검색량, 문서수, 유효성을 검증
 */

import { getNaverKeywordSearchVolumeSeparate } from './naver-datalab-api';
import { EnvironmentManager } from './environment-manager';
import { getNaverBlogDocumentCount } from './naver-blog-api';

export interface ValidatedKeyword {
  keyword: string;
  searchVolume: number; // 실제 검색량
  /** 실제 broad Blog OpenAPI 문서수. null은 조회 실패/미측정, 0은 실제 0건. */
  documentCount: number | null;
  validated: boolean; // 검증 완료 여부
  validationScore?: number; // 검증 점수 (0-100)
  reason?: string; // 검증 실패 이유
  reasonCode?:
    | 'validated'
    | 'document-only'
    | 'no-documents'
    | 'document-count-unavailable'
    | 'missing-api-credentials'
    | 'validation-failed';
}

/**
 * 키워드 검증
 */
export async function validateKeyword(
  keyword: string
): Promise<ValidatedKeyword> {
  try {
    const envManager = EnvironmentManager.getInstance();
    const env = envManager.getConfig();
    
    const clientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    
    if (!clientId || !clientSecret) {
      return {
        keyword,
        searchVolume: 0,
        documentCount: null,
        validated: false,
        validationScore: 0,
        reason: '네이버 API 키 없음',
        reasonCode: 'missing-api-credentials',
      };
    }
    
    // 1. 검색량 검증
    let searchVolume = 0;
    try {
      const volumeData = await getNaverKeywordSearchVolumeSeparate({
        clientId,
        clientSecret
      }, [keyword]);
      
      if (volumeData && volumeData.length > 0 && volumeData[0]) {
        // pcSearchVolume + mobileSearchVolume 합산
        searchVolume = (volumeData[0].pcSearchVolume || 0) + (volumeData[0].mobileSearchVolume || 0);
      }
    } catch (e) {
      console.warn(`[KEYWORD-VALIDATOR] 검색량 조회 실패 (${keyword}):`, e);
    }
    
    // 2. 문서수 검증. 제품 전체가 같은 정규화된 broad Blog OpenAPI
    // 쿼리를 사용해야 한다. API 실패는 null, 실제 total=0은 0으로
    // 보존해 미측정과 실제 검색 결과 0건을 구분한다.
    let documentCount: number | null = null;
    try {
      const measuredDocumentCount = await getNaverBlogDocumentCount(keyword, {
        config: { clientId, clientSecret },
        timeoutMs: 5000,
      });
      documentCount = typeof measuredDocumentCount === 'number'
        && Number.isFinite(measuredDocumentCount)
        && measuredDocumentCount >= 0
        ? measuredDocumentCount
        : null;
    } catch (e) {
      console.warn(`[KEYWORD-VALIDATOR] 문서수 조회 실패 (${keyword}):`, e);
    }
    
    // 3. 검증 점수 계산
    let validationScore = 0;
    let validated = false;
    let reason = '';
    let reasonCode: NonNullable<ValidatedKeyword['reasonCode']> = 'validation-failed';
    
    if (searchVolume > 0 && documentCount !== null && documentCount > 0) {
      // 검색량과 문서수가 모두 있으면 유효한 키워드
      validated = true;
      
      // 검증 점수: 검색량이 높을수록, 문서수가 적당할수록 높은 점수
      const volumeScore = Math.min(100, (searchVolume / 100) * 10); // 검색량 점수
      const competitionScore = documentCount < 100 ? 100 : 
                               documentCount < 500 ? 80 :
                               documentCount < 1000 ? 60 : 40; // 경쟁 적을수록 높은 점수
      
      validationScore = Math.round((volumeScore * 0.6) + (competitionScore * 0.4));
      reason = '검증 완료';
      reasonCode = 'validated';
    } else if (documentCount !== null && documentCount > 0) {
      // 문서수만 있어도 유효한 키워드 (검색량은 추정 불가일 수 있음)
      validated = true;
      validationScore = 60;
      reason = '문서 존재 확인 (검색량 미확인)';
      reasonCode = 'document-only';
    } else if (documentCount === 0) {
      validated = false;
      validationScore = 0;
      reason = '검색 결과 없음';
      reasonCode = 'no-documents';
    } else {
      validated = false;
      validationScore = 0;
      reason = '문서수 조회 실패';
      reasonCode = 'document-count-unavailable';
    }
    
    return {
      keyword,
      searchVolume,
      documentCount,
      validated,
      validationScore,
      reason,
      reasonCode,
    };
    
  } catch (error: any) {
    console.warn(`[KEYWORD-VALIDATOR] 키워드 검증 실패 (${keyword}):`, error.message);
    return {
      keyword,
      searchVolume: 0,
      documentCount: null,
      validated: false,
      validationScore: 0,
      reason: error.message || '검증 실패',
      reasonCode: 'validation-failed',
    };
  }
}

/**
 * 키워드 목록 일괄 검증
 */
export async function validateKeywords(
  keywords: string[],
  maxConcurrent: number = 5
): Promise<ValidatedKeyword[]> {
  const results: ValidatedKeyword[] = [];
  
  // 동시 처리 수 제한
  for (let i = 0; i < keywords.length; i += maxConcurrent) {
    const batch = keywords.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map(keyword => validateKeyword(keyword))
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          keyword: batch[Math.min(batchResults.indexOf(result), batch.length - 1)] || '',
          searchVolume: 0,
          documentCount: null,
          validated: false,
          validationScore: 0,
          reason: result.reason?.message || '검증 실패',
          reasonCode: 'validation-failed',
        });
      }
    }
  }
  
  return results;
}

