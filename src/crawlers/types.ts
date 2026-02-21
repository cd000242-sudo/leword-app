/**
 * 크롤러 타입 정의
 */

export interface ProductDetailSnapshot {
  url: string;
  title?: string;
  price?: string;
  description?: string;
  images?: string[];
  [key: string]: any;
}


