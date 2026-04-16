// PRO Hunter v12 — SERP 본문 분석기
// 작성: 2026-04-15
// top 10 본문에서 통계, TF-IDF, 갭 분석을 수행한다.

import type { FetchedPost } from './serp-content-fetcher';
import { tokenizeKoreanAdvanced, deduplicateStems } from './korean-tokenizer';

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

// P0 #3: 한국어 토크나이저는 korean-tokenizer.ts의 고품질 구현 사용
// 기존 stopwords/tokenizeKorean는 제거 (300+ stopwords + 조사 분리)
const tokenizeKorean = tokenizeKoreanAdvanced;

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

  // 필수 포함 용어 (60% 이상 포스트가 사용) + 어간 중복 제거
  const mustThreshold = Math.max(2, Math.floor(N * 0.6));
  const rawMust = Array.from(dfMap.entries())
    .filter(([t, df]) => df >= mustThreshold && t.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
  const mustIncludeTerms = deduplicateStems(rawMust).slice(0, 15);

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
  // SmartEditor 구조는 h2를 거의 안 쓰므로 섹션 카운트는 정보성 참고만
  // 진짜 차별화는 단어수 / 이미지 / 영상 / 외부링크로 측정
  if (analysis.avgWordCount < 1200) {
    differentiators.push(
      `📝 평균 ${analysis.avgWordCount}단어로 경쟁 글 짧음 — 1500+ 단어로 심도있게 쓰면 우위`
    );
  }
  if (analysis.avgImageCount < 6) {
    differentiators.push(
      `🖼️ 평균 이미지 ${analysis.avgImageCount}장 — 8장 이상 + 비교 표 추가 권장`
    );
  }
  if (analysis.avgExternalLinks < 1) {
    differentiators.push(
      `🔗 경쟁 글들이 외부 출처 링크 거의 없음 — 신뢰도 있는 출처 2~3개 인용하면 정보성 점수 상승`
    );
  }

  // 경쟁자 약점 분석 (P0 #2: 네이버 SmartEditor 현실 반영)
  // h2 카운트는 SmartEditor에서 거의 0이므로 더 이상 약점 판정에 사용 안 함
  for (const p of posts) {
    if (p.wordCount < analysis.avgWordCount * 0.6) {
      competitorWeaknesses.push({ rank: p.rank, weakness: `본문 ${p.wordCount}단어로 짧음 (평균 ${analysis.avgWordCount})` });
    }
    if (p.ageDays && p.ageDays >= 730) {
      competitorWeaknesses.push({ rank: p.rank, weakness: `${Math.floor(p.ageDays / 365)}년 전 글로 정보 노후` });
    }
    if (p.imageCount === 0) {
      competitorWeaknesses.push({ rank: p.rank, weakness: '이미지 0장 (시각 자료 부족)' });
    } else if (p.imageCount < 4) {
      competitorWeaknesses.push({ rank: p.rank, weakness: `이미지 ${p.imageCount}장으로 부족 (권장 8장+)` });
    }
    if (p.videoCount === 0 && analysis.videoUsageRatio < 0.3) {
      // 영상 사용률 낮으면 기회
      // (개별 약점보단 전체 gap으로 처리 — differentiators에 이미 있음)
    }
    if (p.externalLinkCount === 0) {
      competitorWeaknesses.push({ rank: p.rank, weakness: '외부 출처 링크 0 (정보성 점수 낮음)' });
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
