// PRO Hunter v12 — SERP 본문 분석기
// 작성: 2026-04-15
// top 10 본문에서 통계, TF-IDF, 갭 분석을 수행한다.

import type { FetchedPost } from './serp-content-fetcher';

export interface SerpAnalysis {
  postCount: number;
  avgWordCount: number;
  recommendedWordCount: number;     // top 10 평균 + 20%
  avgImageCount: number;
  avgH2Count: number;
  avgH3Count: number;
  avgVideoCount: number;
  avgExternalLinks: number;
  avgAgeDays: number | null;
  oldPostRatio: number;             // 1년 이상 비율
  videoUsageRatio: number;          // 영상 1개 이상 비율
  topKeywords: Array<{ term: string; tf: number; idf: number; tfidf: number }>;
  mustIncludeTerms: string[];       // 8개 이상 포스트가 사용한 용어
  competitorTitles: string[];
  postOutlines: Array<{ rank: number; title: string; wordCount: number; ageDays: number | null }>;
}

export interface GapAnalysis {
  missingTopics: string[];          // top 10에서 약하거나 없는 주제
  weakSections: string[];           // top 10이 짧게 다룬 섹션
  differentiators: string[];        // 차별화 포인트 (예: "FAQ 추가", "동영상 0개 → 1개")
  competitorWeaknesses: Array<{ rank: number; weakness: string }>;
}

const STOPWORDS = new Set([
  '있다', '없다', '하다', '되다', '같다', '이다', '아니다', '이런', '저런', '그런',
  '그리고', '하지만', '그러나', '그래서', '따라서', '또한', '이렇게', '저렇게',
  '많이', '조금', '정말', '진짜', '너무', '아주', '매우', '굉장히',
  '오늘', '어제', '내일', '지금', '나중', '먼저', '바로', '계속',
  '이것', '저것', '그것', '여기', '저기', '거기', '뭐', '어떤', '어떻게',
  '저는', '제가', '저희', '우리', '당신', '여러분',
  '입니다', '습니다', '합니다', '됩니다', '이에요', '예요', '에요',
  '해서', '하면', '하고', '하는', '하지', '한번', '하나', '두번',
  '대한', '대해', '위해', '통해', '대로', '만큼', '뿐만', '동안',
  '경우', '때문', '부분', '시간', '오늘', '이번', '이런',
]);

function tokenizeKorean(text: string): string[] {
  if (!text) return [];
  // 한글 + 알파벳 + 숫자 (2자 이상)
  const tokens = text
    .toLowerCase()
    .replace(/[^\uac00-\ud7a3a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 20)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => !/^\d+$/.test(t));
  return tokens;
}

export function analyzeSerp(posts: FetchedPost[]): SerpAnalysis {
  const valid = posts.filter((p) => p.bodyText && p.wordCount > 50);
  if (valid.length === 0) {
    return {
      postCount: 0,
      avgWordCount: 0,
      recommendedWordCount: 1000,
      avgImageCount: 0,
      avgH2Count: 0,
      avgH3Count: 0,
      avgVideoCount: 0,
      avgExternalLinks: 0,
      avgAgeDays: null,
      oldPostRatio: 0,
      videoUsageRatio: 0,
      topKeywords: [],
      mustIncludeTerms: [],
      competitorTitles: [],
      postOutlines: [],
    };
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);

  const wordCounts = valid.map((p) => p.wordCount);
  const avgWord = avg(wordCounts);

  const ageDays = valid.map((p) => p.ageDays).filter((d): d is number => d != null);
  const avgAge = ageDays.length ? avg(ageDays) : null;
  const oldRatio = ageDays.length ? ageDays.filter((d) => d >= 365).length / ageDays.length : 0;
  const videoRatio = valid.filter((p) => p.videoCount > 0).length / valid.length;

  // TF-IDF
  const docTokens = valid.map((p) => tokenizeKorean(p.bodyText));
  const N = docTokens.length;
  const dfMap = new Map<string, number>();
  for (const tokens of docTokens) {
    const uniq = new Set(tokens);
    for (const t of uniq) dfMap.set(t, (dfMap.get(t) || 0) + 1);
  }
  const allTokens = docTokens.flat();
  const tfMap = new Map<string, number>();
  for (const t of allTokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);

  const tfidf: Array<{ term: string; tf: number; idf: number; tfidf: number }> = [];
  for (const [term, tf] of tfMap.entries()) {
    const df = dfMap.get(term) || 1;
    const idf = Math.log((N + 1) / (df + 0.5)) + 1; // smooth
    // 너무 흔한 단어 제외 (df = N)
    if (df === N && N >= 5) continue;
    tfidf.push({ term, tf, idf, tfidf: tf * idf });
  }
  tfidf.sort((a, b) => b.tfidf - a.tfidf);
  const topKeywords = tfidf.slice(0, 30);

  // 필수 포함 용어 (80% 이상 포스트가 사용)
  const mustThreshold = Math.max(2, Math.floor(N * 0.6));
  const mustIncludeTerms = Array.from(dfMap.entries())
    .filter(([t, df]) => df >= mustThreshold && t.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([t]) => t);

  return {
    postCount: valid.length,
    avgWordCount: Math.round(avgWord),
    recommendedWordCount: Math.round(avgWord * 1.2),
    avgImageCount: Math.round(avg(valid.map((p) => p.imageCount))),
    avgH2Count: Math.round(avg(valid.map((p) => p.h2Count)) * 10) / 10,
    avgH3Count: Math.round(avg(valid.map((p) => p.h3Count)) * 10) / 10,
    avgVideoCount: Math.round(avg(valid.map((p) => p.videoCount)) * 10) / 10,
    avgExternalLinks: Math.round(avg(valid.map((p) => p.externalLinkCount)) * 10) / 10,
    avgAgeDays: avgAge != null ? Math.round(avgAge) : null,
    oldPostRatio: Math.round(oldRatio * 100) / 100,
    videoUsageRatio: Math.round(videoRatio * 100) / 100,
    topKeywords,
    mustIncludeTerms,
    competitorTitles: valid.map((p) => p.title),
    postOutlines: valid.map((p) => ({
      rank: p.rank,
      title: p.title,
      wordCount: p.wordCount,
      ageDays: p.ageDays,
    })),
  };
}

export function detectGaps(analysis: SerpAnalysis, posts: FetchedPost[]): GapAnalysis {
  const differentiators: string[] = [];
  const weakSections: string[] = [];
  const competitorWeaknesses: Array<{ rank: number; weakness: string }> = [];

  // 차별화 포인트 자동 감지
  if (analysis.videoUsageRatio < 0.3) {
    differentiators.push(
      `📹 동영상 사용률 ${Math.round(analysis.videoUsageRatio * 100)}% — 유튜브 임베드 1개 추가 시 노출 우위 가능`
    );
  }
  if (analysis.oldPostRatio >= 0.5) {
    differentiators.push(
      `⏰ 상위 글의 ${Math.round(analysis.oldPostRatio * 100)}%가 1년 이상 — 최신 글로 신선도 우위`
    );
  }
  if (analysis.avgH2Count < 4) {
    differentiators.push(
      `📋 평균 h2 ${analysis.avgH2Count}개로 구조가 약함 — 5~7개 섹션 + FAQ로 차별화`
    );
  }
  if (analysis.avgImageCount < 5) {
    differentiators.push(
      `🖼️ 평균 이미지 ${analysis.avgImageCount}장 — 8장 이상 + 비교 표 추가 권장`
    );
  }

  // 경쟁자 약점 분석
  for (const p of posts) {
    if (p.wordCount < analysis.avgWordCount * 0.6) {
      competitorWeaknesses.push({ rank: p.rank, weakness: `본문 ${p.wordCount}단어로 짧음 (평균 ${analysis.avgWordCount})` });
    }
    if (p.ageDays && p.ageDays >= 730) {
      competitorWeaknesses.push({ rank: p.rank, weakness: `${Math.floor(p.ageDays / 365)}년 전 글로 정보 노후` });
    }
    if (p.imageCount === 0) {
      competitorWeaknesses.push({ rank: p.rank, weakness: '이미지 0장 (시각 자료 부족)' });
    }
    if (p.h2Count === 0) {
      competitorWeaknesses.push({ rank: p.rank, weakness: '본문 구조 없음 (h2 미사용)' });
    }
  }

  // 약한 섹션은 LLM이 더 잘 잡으므로 일단 비워둠 (Phase A2에서 보강)
  const missingTopics: string[] = [];

  return {
    missingTopics,
    weakSections,
    differentiators,
    competitorWeaknesses: competitorWeaknesses.slice(0, 10),
  };
}
