/**
 * 코어 타입 정의
 */

export type CtaRole = 'primary' | 'secondary' | 'tertiary' | 'information' | 'application' | 'support';

export interface BaseConfig {
  apiKey?: string;
  timeout?: number;
}

export interface KeywordData {
  keyword: string;
  searchVolume?: number;
  documentCount?: number;
  goldenRatio?: number;
}

export interface CrawlResult {
  success: boolean;
  data?: any;
  error?: string;
}
