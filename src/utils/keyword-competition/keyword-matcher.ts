/**
 * 키워드 매칭 유틸리티
 */

import { KeywordMatchType } from './types';

interface MatchResult {
  type: KeywordMatchType;
  score: number;
}

/**
 * 제목에서 키워드 매칭 분석
 */
export function matchKeywordInTitle(keyword: string, title: string): MatchResult {
  if (!keyword || !title) {
    return { type: 'none', score: 0 };
  }
  
  const normalizedKeyword = keyword.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();
  
  // 정확히 일치 (제목 앞부분에 키워드가 연속으로 존재)
  if (normalizedTitle.startsWith(normalizedKeyword) || 
      normalizedTitle.includes(` ${normalizedKeyword}`) ||
      normalizedTitle.includes(`[${normalizedKeyword}`) ||
      normalizedTitle.includes(`]${normalizedKeyword}`)) {
    return { type: 'exact', score: 100 };
  }
  
  // 키워드 단어들이 모두 제목에 포함되어 있는지 확인
  const keywordWords = normalizedKeyword.split(/\s+/).filter(w => w.length > 0);
  const allWordsIncluded = keywordWords.every(word => normalizedTitle.includes(word));
  
  if (allWordsIncluded) {
    // 순서대로 포함되어 있는지 확인
    let lastIndex = -1;
    let inOrder = true;
    
    for (const word of keywordWords) {
      const index = normalizedTitle.indexOf(word, lastIndex + 1);
      if (index === -1 || index <= lastIndex) {
        inOrder = false;
        break;
      }
      lastIndex = index;
    }
    
    if (inOrder) {
      // 순서대로 포함 = exact에 가까움
      return { type: 'exact', score: 90 };
    } else {
      // 흩어져서 포함 = partial
      return { type: 'partial', score: 70 };
    }
  }
  
  // 일부 단어만 포함
  const includedWords = keywordWords.filter(word => normalizedTitle.includes(word));
  const inclusionRate = includedWords.length / keywordWords.length;
  
  if (inclusionRate >= 0.5) {
    return { type: 'partial', score: Math.round(inclusionRate * 60) };
  }
  
  return { type: 'none', score: 0 };
}
