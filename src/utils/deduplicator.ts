/**
 * 중복 제거 유틸리티
 * - URL 기준 중복 제거
 * - 텍스트 유사도 기반 중복 제거
 * - 다양한 중복 제거 전략 제공
 */

import { Logger, LogLevel } from './logger';

interface DeduplicationOptions {
  method: 'url' | 'title' | 'content' | 'similarity';
  similarityThreshold?: number; // 0-1, 유사도 임계값
  caseSensitive?: boolean;
  normalizeWhitespace?: boolean;
}

interface DuplicateItem {
  original: any;
  duplicates: any[];
  similarity: number;
}

export class Deduplicator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(LogLevel.INFO);
  }

  /**
   * URL 기준 중복 제거
   */
  deduplicateByUrl<T extends { link: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];

    for (const item of items) {
      if (!item.link || seen.has(item.link)) {
        continue;
      }
      seen.add(item.link);
      unique.push(item);
    }

    this.logger.info(`URL 중복 제거: ${items.length} → ${unique.length}개`);
    return unique;
  }

  /**
   * 제목 기준 중복 제거
   */
  deduplicateByTitle<T extends { title: string }>(
    items: T[], 
    options: { caseSensitive?: boolean; normalizeWhitespace?: boolean } = {}
  ): T[] {
    const { caseSensitive = false, normalizeWhitespace = true } = options;
    const seen = new Set<string>();
    const unique: T[] = [];

    for (const item of items) {
      let title = item.title;
      
      if (!caseSensitive) {
        title = title.toLowerCase();
      }
      
      if (normalizeWhitespace) {
        title = title.replace(/\s+/g, ' ').trim();
      }

      if (seen.has(title)) {
        continue;
      }
      
      seen.add(title);
      unique.push(item);
    }

    this.logger.info(`제목 중복 제거: ${items.length} → ${unique.length}개`);
    return unique;
  }

  /**
   * 콘텐츠 유사도 기반 중복 제거
   */
  deduplicateBySimilarity<T extends { title: string; description?: string; content?: string }>(
    items: T[],
    options: DeduplicationOptions = { method: 'similarity', similarityThreshold: 0.8 }
  ): T[] {
    const { similarityThreshold = 0.8 } = options;
    const unique: T[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (processed.has(i)) continue;

      const current = items[i];
      if (!current) continue;
      const currentText = this.extractText(current);
      unique.push(current);
      processed.add(i);

      // 나머지 아이템들과 유사도 비교
      for (let j = i + 1; j < items.length; j++) {
        if (processed.has(j)) continue;

        const other = items[j];
        if (!other) continue;
        const otherText = this.extractText(other);
        const similarity = this.calculateSimilarity(currentText, otherText);

        if (similarity >= similarityThreshold) {
          processed.add(j);
          this.logger.debug(`유사도 ${similarity.toFixed(3)}로 중복 제거: "${current.title}" ↔ "${other.title}"`);
        }
      }
    }

    this.logger.info(`유사도 중복 제거: ${items.length} → ${unique.length}개 (임계값: ${similarityThreshold})`);
    return unique;
  }

  /**
   * 중복 그룹 찾기
   */
  findDuplicateGroups<T extends { title: string; description?: string; content?: string }>(
    items: T[],
    options: DeduplicationOptions = { method: 'similarity', similarityThreshold: 0.7 }
  ): DuplicateItem[] {
    const groups: DuplicateItem[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (processed.has(i)) continue;

      const current = items[i];
      if (!current) continue;
      const currentText = this.extractText(current);
      const duplicates: T[] = [];
      let maxSimilarity = 0;

      // 유사한 아이템들 찾기
      for (let j = i + 1; j < items.length; j++) {
        if (processed.has(j)) continue;

        const other = items[j];
        if (!other) continue;
        const otherText = this.extractText(other);
        const similarity = this.calculateSimilarity(currentText, otherText);

        if (similarity >= (options.similarityThreshold || 0.7)) {
          duplicates.push(other);
          maxSimilarity = Math.max(maxSimilarity, similarity);
          processed.add(j);
        }
      }

      if (duplicates.length > 0) {
        groups.push({
          original: current,
          duplicates,
          similarity: maxSimilarity
        });
        processed.add(i);
      }
    }

    this.logger.info(`${groups.length}개 중복 그룹 발견`);
    return groups;
  }

  /**
   * 아이템에서 텍스트 추출
   */
  private extractText(item: { title: string; description?: string; content?: string }): string {
    const parts = [item.title];
    
    if (item.description) {
      parts.push(item.description);
    }
    
    if (item.content) {
      parts.push(item.content);
    }

    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * 코사인 유사도 계산
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.tokenize(text1);
    const words2 = this.tokenize(text2);

    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;

    // 단어 빈도 계산
    const freq1 = this.calculateWordFrequency(words1);
    const freq2 = this.calculateWordFrequency(words2);

    // 모든 단어 집합
    const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

    // 벡터 생성
    const vector1: number[] = [];
    const vector2: number[] = [];

    for (const word of allWords) {
      vector1.push(freq1[word] || 0);
      vector2.push(freq2[word] || 0);
    }

    // 코사인 유사도 계산
    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * 텍스트 토큰화
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 제거
      .split(/\s+/)
      .filter(word => word.length > 1); // 1글자 단어 제거
  }

  /**
   * 단어 빈도 계산
   */
  private calculateWordFrequency(words: string[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    
    for (const word of words) {
      frequency[word] = (frequency[word] || 0) + 1;
    }

    return frequency;
  }

  /**
   * 코사인 유사도 계산
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('벡터 길이가 다릅니다');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i] ?? 0;
      const b = vecB[i] ?? 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 다중 전략 중복 제거
   */
  deduplicateMultiStrategy<T extends { link: string; title: string; description?: string; content?: string }>(
    items: T[],
    strategies: DeduplicationOptions[] = [
      { method: 'url' },
      { method: 'title', caseSensitive: false },
      { method: 'similarity', similarityThreshold: 0.8 }
    ]
  ): T[] {
    let result = [...items];
    
    for (const strategy of strategies) {
      const beforeCount = result.length;
      
      switch (strategy.method) {
        case 'url':
          result = this.deduplicateByUrl(result);
          break;
        case 'title':
          result = this.deduplicateByTitle(result, {
            ...(strategy.caseSensitive !== undefined && { caseSensitive: strategy.caseSensitive }),
            ...(strategy.normalizeWhitespace !== undefined && { normalizeWhitespace: strategy.normalizeWhitespace })
          });
          break;
        case 'similarity':
          result = this.deduplicateBySimilarity(result, strategy);
          break;
      }
      
      this.logger.info(`${strategy.method} 전략 적용: ${beforeCount} → ${result.length}개`);
    }

    return result;
  }
}
