// PRO Hunter v12 — 피라미드 Outline
// 작성: 2026-04-15 (Tier 2)
// 클러스터 7~15개 키워드를 단일 피라미드 콘텐츠 플랜으로 변환
// pillar 글 1개 + support 글 6~14개 + 내부링크 그래프

import { callAI } from './ai-client';
import type { KeywordCluster } from './cluster-expander';

export interface PyramidPost {
  keyword: string;
  role: 'pillar' | 'support' | 'longtail';
  publishOrder: number;
  publishWeek: number;
  estimatedWordCount: number;
  anchorText: string;      // 내부링크 표시용
  linkedFromPillar: boolean;
  linksToKeywords: string[]; // 이 글이 링크로 연결할 다른 키워드
  brief: string;           // 한 줄 요약
}

export interface PyramidPlan {
  pillarKeyword: string;
  pillarTitle: string;
  totalPosts: number;
  totalWeeks: number;
  posts: PyramidPost[];
  internalLinkCount: number;
  strategy: string;
  publishSchedule: Array<{ week: number; keywords: string[] }>;
  source: 'claude' | 'rule';
}

function fallbackPyramid(cluster: KeywordCluster): PyramidPlan {
  const pillar = cluster.keywords.find((k) => k.role === 'pillar');
  const supports = cluster.keywords.filter((k) => k.role !== 'pillar');

  const posts: PyramidPost[] = [];
  let week = 1;
  let weekCount = 0;

  for (const s of supports) {
    if (weekCount >= 2) {
      week++;
      weekCount = 0;
    }
    posts.push({
      keyword: s.keyword,
      role: s.role,
      publishOrder: posts.length + 1,
      publishWeek: week,
      estimatedWordCount: s.estimatedWordCount,
      anchorText: s.keyword,
      linkedFromPillar: true,
      linksToKeywords: [pillar?.keyword || cluster.pillarKeyword],
      brief: `${s.keyword}의 구체적 가이드. 상위 1~3위 진입 목표.`,
    });
    weekCount++;
  }

  // Pillar는 마지막 주
  if (weekCount >= 2) week++;
  posts.push({
    keyword: pillar?.keyword || cluster.pillarKeyword,
    role: 'pillar',
    publishOrder: posts.length + 1,
    publishWeek: week,
    estimatedWordCount: pillar?.estimatedWordCount || 2500,
    anchorText: pillar?.keyword || cluster.pillarKeyword,
    linkedFromPillar: false,
    linksToKeywords: supports.map((s) => s.keyword),
    brief: `${cluster.pillarKeyword} 종합 가이드. 모든 support 글의 권위 허브.`,
  });

  const schedule: Array<{ week: number; keywords: string[] }> = [];
  const weekMap = new Map<number, string[]>();
  for (const p of posts) {
    if (!weekMap.has(p.publishWeek)) weekMap.set(p.publishWeek, []);
    weekMap.get(p.publishWeek)!.push(p.keyword);
  }
  for (const [w, kws] of Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0])) {
    schedule.push({ week: w, keywords: kws });
  }

  const linkCount = supports.length * 2; // pillar↔support 양방향

  return {
    pillarKeyword: cluster.pillarKeyword,
    pillarTitle: `${cluster.pillarKeyword} 완벽 가이드`,
    totalPosts: posts.length,
    totalWeeks: week,
    posts,
    internalLinkCount: linkCount,
    strategy: `쉬운 support 글부터 시작해 권위를 누적하고, 마지막에 pillar 글을 작성해 허브로 연결. 주 2회 발행 기준 약 ${week}주.`,
    publishSchedule: schedule,
    source: 'rule',
  };
}

export async function generatePyramidPlan(cluster: KeywordCluster): Promise<PyramidPlan> {
  try {
    const keywordList = cluster.keywords
      .map((k, i) => `${i + 1}. ${k.keyword} (${k.role}, ${k.difficulty})`)
      .join('\n');

    const prompt = `당신은 콘텐츠 클러스터 전략가입니다. 아래 ${cluster.keywords.length}개 키워드를 단일 피라미드 콘텐츠 플랜으로 설계하세요.

# 시드 키워드
${cluster.pillarKeyword}

# 클러스터 키워드
${keywordList}

# 작업
JSON으로 피라미드 플랜을 생성하세요:
{
  "pillarTitle": "pillar 글의 제목 (종합 가이드 형식)",
  "strategy": "전체 전략 요약 (왜 이 순서인지 2~3문장)",
  "posts": [
    {
      "keyword": "키워드",
      "role": "pillar | support | longtail",
      "publishOrder": 1,
      "publishWeek": 1,
      "estimatedWordCount": 1500,
      "anchorText": "내부링크 앵커 텍스트 (5단어 이내)",
      "linkedFromPillar": true,
      "linksToKeywords": ["다른 키워드1", "다른 키워드2"],
      "brief": "이 글의 한 줄 요약"
    }
  ]
}

규칙:
- pillar는 마지막에 발행 (support들이 SEO 신호 누적 후)
- 쉬운 것부터 어려운 것 순
- 주 2회 발행 기준 주차 배분
- 각 support → pillar 링크 (upstream)
- pillar → 모든 support 링크 (downstream)
- anchorText는 해당 글 제목 대신 짧게
- 다른 텍스트 없이 JSON만 응답`;

    const { text } = await callAI(prompt, { maxTokens: 2048, temperature: 0.5 });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallbackPyramid(cluster);

    const parsed = JSON.parse(m[0]);
    const posts: PyramidPost[] = (parsed.posts || []).map((p: any) => ({
      keyword: String(p.keyword || ''),
      role: ['pillar', 'support', 'longtail'].includes(p.role) ? p.role : 'support',
      publishOrder: Number(p.publishOrder) || 1,
      publishWeek: Number(p.publishWeek) || 1,
      estimatedWordCount: Number(p.estimatedWordCount) || 1500,
      anchorText: String(p.anchorText || p.keyword),
      linkedFromPillar: p.linkedFromPillar !== false,
      linksToKeywords: Array.isArray(p.linksToKeywords) ? p.linksToKeywords.map(String) : [],
      brief: String(p.brief || ''),
    }));

    const schedule: Array<{ week: number; keywords: string[] }> = [];
    const weekMap = new Map<number, string[]>();
    for (const p of posts) {
      if (!weekMap.has(p.publishWeek)) weekMap.set(p.publishWeek, []);
      weekMap.get(p.publishWeek)!.push(p.keyword);
    }
    for (const [w, kws] of Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0])) {
      schedule.push({ week: w, keywords: kws });
    }

    const totalWeeks = Math.max(...posts.map((p) => p.publishWeek), 1);
    const linkCount = posts.reduce((s, p) => s + p.linksToKeywords.length, 0);

    return {
      pillarKeyword: cluster.pillarKeyword,
      pillarTitle: String(parsed.pillarTitle || `${cluster.pillarKeyword} 완벽 가이드`),
      totalPosts: posts.length,
      totalWeeks,
      posts,
      internalLinkCount: linkCount,
      strategy: String(parsed.strategy || ''),
      publishSchedule: schedule,
      source: 'claude',
    };
  } catch (err) {
    console.error('[PYRAMID] AI 실패:', (err as Error).message);
    return fallbackPyramid(cluster);
  }
}
