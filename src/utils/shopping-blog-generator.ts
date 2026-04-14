/**
 * 쇼핑 커넥트 — 블로그 판매 글 자동 생성 (v2.2.5 SSS 승급)
 *
 * 입력: 네이버 쇼핑 API 결과 (ShoppingItem[])
 * 출력: 블로그 글 작성에 바로 쓸 수 있는 풍부한 초안
 *
 * 핵심 가치:
 *  - 상품 나열이 아니라 "판매 전환"을 노린 글쓰기 지원
 *  - 제목 후보 3개 (롱테일/후킹/가이드 스타일)
 *  - 글 섹션 자동 채움 (도입 / 추천 / 비교표 / 선택 가이드 / 구매 팁)
 *  - 롱테일 키워드 태그 + CPC 힌트
 *  - 마크다운 복사 → 티스토리/네이버 블로그 붙여넣기
 */

import type { ShoppingItem } from './naver-shopping-api';

// ============================================================
// 1. 롱테일 키워드 추출
// ============================================================

const STOP_WORDS = new Set([
  '그리고', '또한', '하지만', '그러나', '이것', '저것', '무엇', '어디',
  '세트', '패키지', '정품', '새상품', '국내', '정식', '발매',
  'the', 'and', 'for', 'with', 'new', 'set', 'pack',
]);

/**
 * 상품명들에서 롱테일 키워드 추출
 * - 2+ 자 한글/영문 단어
 * - 불용어 제거
 * - 빈도순 정렬
 */
export function extractLongtailKeywords(items: ShoppingItem[], limit: number = 15): string[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    const title = item.title || '';
    const cleaned = title.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter(w => {
      if (w.length < 2) return false;
      if (/^\d+$/.test(w)) return false; // 순수 숫자 제외
      if (STOP_WORDS.has(w.toLowerCase())) return false;
      return true;
    });
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

// ============================================================
// 2. 제목 후보 생성 (3 스타일)
// ============================================================

function currentYear(): number {
  return new Date().getFullYear();
}

function currentMonthLabel(): string {
  return `${new Date().getMonth() + 1}월`;
}

export function generateTitleCandidates(keyword: string, items: ShoppingItem[]): string[] {
  const year = currentYear();
  const month = currentMonthLabel();
  const count = Math.min(items.length, 10);
  const topKeywords = extractLongtailKeywords(items, 5);
  const primary = topKeywords[0] || keyword;

  return [
    // 스타일 1: 연도 + 숫자 + 가이드 (SEO 강함)
    `${year}년 ${keyword} 추천 TOP ${count} — 실사용자 리뷰 모아본 BEST`,
    // 스타일 2: 비교 + 구매 가이드 (롱테일)
    `${keyword} 고를 때 꼭 확인해야 할 ${primary} 비교 가이드`,
    // 스타일 3: 월별 신상/핫딜 (시즌 반영)
    `${month} ${keyword} 신상 후기 — 가성비 ${count}선 솔직 정리`,
  ];
}

// ============================================================
// 3. 가격대 분석
// ============================================================

export interface PriceAnalysis {
  min: number;
  max: number;
  median: number;
  avg: number;
  lowTier: number;    // 하위 30% 경계
  highTier: number;   // 상위 30% 경계
  mallDistribution: Array<{ mall: string; count: number }>;
}

export function analyzePrices(items: ShoppingItem[]): PriceAnalysis {
  const prices = items.map(i => i.lprice).filter(p => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) {
    return { min: 0, max: 0, median: 0, avg: 0, lowTier: 0, highTier: 0, mallDistribution: [] };
  }
  const median = prices[Math.floor(prices.length / 2)];
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const lowTier = prices[Math.floor(prices.length * 0.3)] || prices[0];
  const highTier = prices[Math.floor(prices.length * 0.7)] || prices[prices.length - 1];

  const mallCount = new Map<string, number>();
  for (const item of items) {
    const mall = item.mallName || '기타';
    mallCount.set(mall, (mallCount.get(mall) || 0) + 1);
  }
  const mallDistribution = Array.from(mallCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([mall, count]) => ({ mall, count }));

  return {
    min: prices[0],
    max: prices[prices.length - 1],
    median,
    avg,
    lowTier,
    highTier,
    mallDistribution,
  };
}

// ============================================================
// 4. 블로그 마크다운 초안 생성
// ============================================================

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function generateBlogDraft(
  keyword: string,
  items: ShoppingItem[],
  recommended: ShoppingItem[]
): string {
  const analysis = analyzePrices(items);
  const year = currentYear();
  const titles = generateTitleCandidates(keyword, items);
  const longtail = extractLongtailKeywords(items, 15);
  const tagLine = longtail.slice(0, 10).map(k => `#${k}`).join(' ');

  const topRec = recommended.slice(0, 5);
  const lines: string[] = [];

  // 제목 후보
  lines.push(`# 📝 ${titles[0]}`);
  lines.push('');
  lines.push(`> 📎 **제목 후보**`);
  titles.forEach((t, i) => lines.push(`> ${i + 1}. ${t}`));
  lines.push('');

  // 도입부
  lines.push(`## 🎯 들어가며`);
  lines.push('');
  lines.push(`안녕하세요! ${year}년 현재 **${keyword}** 을(를) 찾으시는 분들이 많아 직접 시장을 조사해 정리해봤습니다.`);
  lines.push('');
  lines.push(`총 ${items.length}개 상품을 비교해본 결과:`);
  lines.push(`- 가격 범위: **${fmt(analysis.min)}원 ~ ${fmt(analysis.max)}원**`);
  lines.push(`- 평균가: ${fmt(analysis.avg)}원 / 중간가: ${fmt(analysis.median)}원`);
  lines.push(`- 주요 판매처: ${analysis.mallDistribution.map(m => `${m.mall}(${m.count})`).join(' · ')}`);
  lines.push('');

  // 추천 상품 요약 (5개 한정)
  lines.push(`## 🏆 이 글에서 추천하는 ${topRec.length}가지`);
  lines.push('');
  topRec.forEach((item, i) => {
    lines.push(`${i + 1}. **${item.title}** — ${fmt(item.lprice)}원 (${item.mallName || '-'})`);
  });
  lines.push('');

  // 비교 표
  lines.push(`## 📊 가격·판매처 비교표`);
  lines.push('');
  lines.push(`| 순위 | 상품명 | 가격 | 판매처 | 브랜드 |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  topRec.forEach((item, i) => {
    const brand = item.brand || item.maker || '-';
    const shortTitle = (item.title || '').slice(0, 30);
    lines.push(`| ${i + 1} | ${shortTitle} | ${fmt(item.lprice)}원 | ${item.mallName || '-'} | ${brand} |`);
  });
  lines.push('');

  // 상세 섹션 (상위 3개만 상세 설명)
  lines.push(`## 💡 상세 리뷰 (BEST 3)`);
  lines.push('');
  topRec.slice(0, 3).forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.title}`);
    lines.push('');
    lines.push(`> 💰 **가격**: ${fmt(item.lprice)}원${item.hprice > item.lprice ? ` (정가 ${fmt(item.hprice)}원)` : ''}`);
    lines.push(`> 🏪 **판매처**: ${item.mallName || '-'}`);
    if (item.brand) lines.push(`> 🏷️ **브랜드**: ${item.brand}`);
    if (item.category2) lines.push(`> 📂 **카테고리**: ${[item.category1, item.category2, item.category3].filter(Boolean).join(' > ')}`);
    lines.push('');
    lines.push(`**이 상품의 포인트**`);
    lines.push(`- 여기에 상품의 장점을 3~5줄로 작성하세요`);
    lines.push(`- 실제 사용 경험이나 리뷰 내용을 요약하면 좋습니다`);
    lines.push(`- 경쟁 상품 대비 차별화 요소를 부각하세요`);
    lines.push('');
    lines.push(`👉 [상품 자세히 보기](${item.link})`);
    lines.push('');
  });

  // 구매 가이드
  lines.push(`## 🎁 ${keyword} 구매 시 체크포인트`);
  lines.push('');
  lines.push(`1. **가격대 선택** — 가성비(${fmt(analysis.lowTier)}원 이하) / 중가(~${fmt(analysis.highTier)}원) / 프리미엄(${fmt(analysis.highTier)}원+)`);
  lines.push(`2. **신뢰할 수 있는 판매처** — ${analysis.mallDistribution[0]?.mall || '메이저 쇼핑몰'} 등에서 구매하면 A/S 편리`);
  lines.push(`3. **리뷰 확인** — 별점뿐 아니라 구매자 리뷰 본문 꼼꼼히 읽기`);
  lines.push(`4. **가격 변동** — 네이버 쇼핑 최저가 알림 설정 추천`);
  lines.push('');

  // 마무리
  lines.push(`## 🎉 마치며`);
  lines.push('');
  lines.push(`이상 ${year}년 ${keyword} 추천 ${topRec.length}가지를 소개해드렸습니다. 각자의 예산과 필요에 맞는 상품을 고르시길 바랍니다. 도움이 되셨다면 공감 ❤️ 부탁드립니다!`);
  lines.push('');

  // 태그
  lines.push(`---`);
  lines.push('');
  lines.push(`🏷️ **태그**: ${tagLine}`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// 5. 통합 enrich 함수
// ============================================================

export interface ShoppingEnrichment {
  titleCandidates: string[];
  longtailKeywords: string[];
  priceAnalysis: PriceAnalysis;
  blogDraftMarkdown: string;
}

export function enrichShoppingResult(
  keyword: string,
  items: ShoppingItem[],
  recommended: ShoppingItem[]
): ShoppingEnrichment {
  return {
    titleCandidates: generateTitleCandidates(keyword, items),
    longtailKeywords: extractLongtailKeywords(items, 15),
    priceAnalysis: analyzePrices(items),
    blogDraftMarkdown: generateBlogDraft(keyword, items, recommended),
  };
}
