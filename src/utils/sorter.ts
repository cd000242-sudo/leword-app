/**
 * 정렬 유틸리티
 * - 다양한 정렬 전략 제공
 * - 인기도, 날짜, 관련성 기반 정렬
 * - 복합 정렬 지원
 */

import { Logger, LogLevel } from './logger';

interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
  weight?: number; // 복합 정렬 시 가중치
}

interface SortableItem {
  [key: string]: any;
  title?: string;
  description?: string;
  pubDate?: string;
  popularityScore?: number;
  wordCount?: number;
}

export class Sorter {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(LogLevel.INFO);
  }

  /**
   * 날짜순 정렬
   */
  sortByDate<T extends SortableItem>(
    items: T[], 
    order: 'asc' | 'desc' = 'desc'
  ): T[] {
    return items.sort((a, b) => {
      const dateA = this.parseDate(a.pubDate);
      const dateB = this.parseDate(b.pubDate);
      
      if (order === 'desc') {
        return dateB.getTime() - dateA.getTime();
      } else {
        return dateA.getTime() - dateB.getTime();
      }
    });
  }

  /**
   * 인기도 점수 정렬
   */
  sortByPopularity<T extends SortableItem>(
    items: T[], 
    order: 'asc' | 'desc' = 'desc'
  ): T[] {
    return items.sort((a, b) => {
      const scoreA = a.popularityScore || 0;
      const scoreB = b.popularityScore || 0;
      
      if (order === 'desc') {
        return scoreB - scoreA;
      } else {
        return scoreA - scoreB;
      }
    });
  }

  /**
   * 제목 길이 정렬
   */
  sortByTitleLength<T extends SortableItem>(
    items: T[], 
    order: 'asc' | 'desc' = 'desc'
  ): T[] {
    return items.sort((a, b) => {
      const lengthA = a.title?.length || 0;
      const lengthB = b.title?.length || 0;
      
      if (order === 'desc') {
        return lengthB - lengthA;
      } else {
        return lengthA - lengthB;
      }
    });
  }

  /**
   * 콘텐츠 길이 정렬
   */
  sortByContentLength<T extends SortableItem>(
    items: T[], 
    order: 'asc' | 'desc' = 'desc'
  ): T[] {
    return items.sort((a, b) => {
      const lengthA = a.wordCount || (a.description?.length || 0);
      const lengthB = b.wordCount || (b.description?.length || 0);
      
      if (order === 'desc') {
        return lengthB - lengthA;
      } else {
        return lengthA - lengthB;
      }
    });
  }

  /**
   * 키워드 관련성 정렬
   */
  sortByRelevance<T extends SortableItem>(
    items: T[], 
    keyword: string, 
    order: 'asc' | 'desc' = 'desc'
  ): T[] {
    const keywordLower = keyword.toLowerCase();
    
    return items.sort((a, b) => {
      const relevanceA = this.calculateRelevance(a, keywordLower);
      const relevanceB = this.calculateRelevance(b, keywordLower);
      
      if (order === 'desc') {
        return relevanceB - relevanceA;
      } else {
        return relevanceA - relevanceB;
      }
    });
  }

  /**
   * 복합 정렬 (여러 기준 조합)
   */
  sortByMultiple<T extends SortableItem>(
    items: T[], 
    options: SortOptions[]
  ): T[] {
    return items.sort((a, b) => {
      let totalScore = 0;
      
      for (const option of options) {
        const score = this.compareField(a, b, option.field, option.order);
        const weightedScore = score * (option.weight || 1);
        totalScore += weightedScore;
      }
      
      return totalScore;
    });
  }

  /**
   * 스마트 정렬 (AI 기반)
   */
  sortBySmart<T extends SortableItem>(
    items: T[], 
    keyword: string
  ): T[] {
    this.logger.info(`스마트 정렬 시작: "${keyword}"`);
    
    return items.sort((a, b) => {
      const scoreA = this.calculateSmartScore(a, keyword);
      const scoreB = this.calculateSmartScore(b, keyword);
      
      return scoreB - scoreA;
    });
  }

  /**
   * 랜덤 정렬
   */
  sortRandom<T>(items: T[]): T[] {
    const shuffled = [...items];
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      if (temp !== undefined && shuffled[j] !== undefined) {
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
      }
    }
    
    return shuffled;
  }

  /**
   * 페이지네이션을 위한 정렬
   */
  sortForPagination<T extends SortableItem>(
    items: T[], 
    page: number, 
    pageSize: number,
    sortBy: 'date' | 'popularity' | 'relevance' = 'date',
    keyword?: string
  ): {
    sortedItems: T[];
    totalPages: number;
    currentPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } {
    let sortedItems: T[];

    // 정렬 적용
    switch (sortBy) {
      case 'date':
        sortedItems = this.sortByDate(items);
        break;
      case 'popularity':
        sortedItems = this.sortByPopularity(items);
        break;
      case 'relevance':
        if (keyword) {
          sortedItems = this.sortByRelevance(items, keyword);
        } else {
          sortedItems = this.sortByDate(items);
        }
        break;
      default:
        sortedItems = items;
    }

    // 페이지네이션 계산
    const totalPages = Math.ceil(sortedItems.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = sortedItems.slice(startIndex, endIndex);

    return {
      sortedItems: paginatedItems,
      totalPages,
      currentPage: page,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }

  /**
   * 날짜 파싱
   */
  private parseDate(dateString?: string): Date {
    if (!dateString) {
      return new Date(0); // 기본값: 1970년
    }

    try {
      return new Date(dateString);
    } catch {
      return new Date(0);
    }
  }

  /**
   * 키워드 관련성 계산
   */
  private calculateRelevance(item: SortableItem, keyword: string): number {
    let score = 0;
    
    // 제목에서 키워드 매칭
    if (item.title) {
      const titleLower = item.title.toLowerCase();
      if (titleLower.includes(keyword)) {
        score += 10;
        
        // 제목 시작 부분에 있으면 추가 점수
        if (titleLower.startsWith(keyword)) {
          score += 5;
        }
      }
    }

    // 설명에서 키워드 매칭
    if (item.description) {
      const descLower = item.description.toLowerCase();
      if (descLower.includes(keyword)) {
        score += 5;
      }
    }

    // 콘텐츠에서 키워드 매칭
    if (item['content']) {
      const contentLower = item['content'].toLowerCase();
      const keywordCount = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
      score += keywordCount * 2;
    }

    return score;
  }

  /**
   * 스마트 점수 계산
   */
  private calculateSmartScore(item: SortableItem, keyword: string): number {
    let score = 0;
    
    // 1. 키워드 관련성 (40%)
    const relevance = this.calculateRelevance(item, keyword);
    score += relevance * 0.4;

    // 2. 인기도 점수 (30%)
    const popularity = item.popularityScore || 0;
    score += popularity * 0.3;

    // 3. 최신성 (20%)
    const pubDate = this.parseDate(item.pubDate);
    const now = new Date();
    const daysOld = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysOld < 7) score += 20;
    else if (daysOld < 30) score += 15;
    else if (daysOld < 90) score += 10;
    else if (daysOld < 365) score += 5;

    // 4. 콘텐츠 품질 (10%)
    const contentLength = item.wordCount || (item.description?.length || 0);
    if (contentLength > 1000) score += 10;
    else if (contentLength > 500) score += 5;
    else if (contentLength > 200) score += 2;

    return score;
  }

  /**
   * 필드 비교
   */
  private compareField(a: any, b: any, field: string, order: 'asc' | 'desc'): number {
    const valueA = this.getNestedValue(a, field);
    const valueB = this.getNestedValue(b, field);

    let comparison = 0;
    
    if (valueA > valueB) {
      comparison = 1;
    } else if (valueA < valueB) {
      comparison = -1;
    }

    return order === 'desc' ? -comparison : comparison;
  }

  /**
   * 중첩된 객체에서 값 가져오기
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 정렬 통계
   */
  getSortStats<T extends SortableItem>(items: T[]): {
    totalItems: number;
    dateRange: { oldest: string; newest: string };
    popularityRange: { min: number; max: number };
    averageWordCount: number;
  } {
    if (items.length === 0) {
      return {
        totalItems: 0,
        dateRange: { oldest: '', newest: '' },
        popularityRange: { min: 0, max: 0 },
        averageWordCount: 0
      };
    }

    const dates = items
      .map(item => this.parseDate(item.pubDate))
      .filter(date => date.getTime() > 0)
      .sort((a, b) => a.getTime() - b.getTime());

    const popularityScores = items
      .map(item => item.popularityScore || 0)
      .sort((a, b) => a - b);

    const wordCounts = items
      .map(item => item.wordCount || (item.description?.length || 0));

    return {
      totalItems: items.length,
      dateRange: {
        oldest: dates[0]?.toISOString() || '',
        newest: dates[dates.length - 1]?.toISOString() || ''
      },
      popularityRange: {
        min: popularityScores[0] || 0,
        max: popularityScores[popularityScores.length - 1] || 0
      },
      averageWordCount: wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length
    };
  }
}
