/**
 * 블로그 영향력지수 추정기
 * 방문자 수 기반으로 블로그 영향력지수 추정
 */

import { AuthorityLevel } from './types';

/**
 * 방문자 수 기반 권위 수준 추정
 */
export function estimateAuthorityLevel(dailyVisitors: number | null): AuthorityLevel {
  if (dailyVisitors === null || dailyVisitors === 0) {
    return 'low';
  }
  
  // 최적 블로그: 일 방문자 2,000명 이상 (상위 0.5% 추정)
  if (dailyVisitors >= 2000) {
    return 'optimal';
  }
  
  // 준최적: 일 방문자 300~2,000명 (상위 5% 추정)
  if (dailyVisitors >= 300) {
    return 'semi-optimal';
  }
  
  // 일반: 일 방문자 100~300명
  if (dailyVisitors >= 100) {
    return 'normal';
  }
  
  // 저품질: 일 방문자 100명 미만
  return 'low';
}

/**
 * 블로그 영향력지수 순위 추정 (방문자 수 기반)
 */
export function estimateBlogdexRank(dailyVisitors: number | null): number | null {
  if (dailyVisitors === null || dailyVisitors === 0) {
    return null;
  }
  
  // 추정 공식 (방문자 수를 기반으로 한 대략적 순위)
  // 방문자 수가 주요 지표 중 하나
  if (dailyVisitors >= 2000) {
    // 최적 블로그: 1,000 ~ 1,500위 추정
    return Math.floor(1000 + Math.random() * 500);
  } else if (dailyVisitors >= 300) {
    // 준최적: 10,000 ~ 15,000위 추정
    return Math.floor(10000 + Math.random() * 5000);
  } else if (dailyVisitors >= 100) {
    // 일반: 50,000 ~ 100,000위 추정
    return Math.floor(50000 + Math.random() * 50000);
  } else {
    // 저품질: 100,000위 이상
    return Math.floor(100000 + Math.random() * 100000);
  }
}

/**
 * 블로그 영향력지수 퍼센타일 추정
 */
export function estimateBlogdexPercentile(dailyVisitors: number | null): number | null {
  if (dailyVisitors === null || dailyVisitors === 0) {
    return null;
  }
  
  if (dailyVisitors >= 2000) {
    return 0.5; // 상위 0.5%
  } else if (dailyVisitors >= 300) {
    return 5.0; // 상위 5%
  } else if (dailyVisitors >= 100) {
    return 20.0; // 상위 20%
  } else {
    return 80.0; // 하위 20%
  }
}

/**
 * 최적 블로그 여부 판정
 */
export function isOptimalBlog(dailyVisitors: number | null): boolean {
  return estimateAuthorityLevel(dailyVisitors) === 'optimal';
}

/**
 * 준최적 블로그 여부 판정
 */
export function isSemiOptimalBlog(dailyVisitors: number | null): boolean {
  const level = estimateAuthorityLevel(dailyVisitors);
  return level === 'semi-optimal' || level === 'optimal';
}






