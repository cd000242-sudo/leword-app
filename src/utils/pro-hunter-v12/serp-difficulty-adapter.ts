// PRO Hunter v12 — 실측 SERP 난이도 어댑터 (C2 phase 2)
//
// analyzeSmartBlocks(puppeteer 실측)의 SmartBlockAnalysis(0~100 블로거 기회점수 + 블록 구성)를
// 다운스트림이 소비하는 난이도 신호 계약으로 변환한다. 기존 죽은 getNaverSerpSignal 의
// {hasSmartBlock,hasViewSection,hasInfluencer,difficultyScore} 형태를 상위집합으로 계승하되,
// blogFriendly/shoppingDominant/opportunityScore/전략 같은 '실측 SERP' 부가 신호를 함께 노출한다.
//
// 순수 함수(결정론) — 네트워크/puppeteer 의존 없음. 매핑 규칙만 특성화 테스트로 고정한다.

import type { SmartBlockAnalysis } from './smartblock-parser';

export interface SerpDifficultySignal {
  /** 0(진입 쉬움) ~ 10(매우 어려움). analyzeSmartBlocks 기회점수의 역수 정규화. */
  difficultyScore: number;
  /** 상위 3위 이내에 블로거가 뚫을 수 없는 블록(쇼핑/뉴스/인플루언서/플레이스 등)이 존재. */
  hasSmartBlock: boolean;
  /** 블로그/인기글 섹션이 존재(블로그 친화). */
  hasViewSection: boolean;
  /** 인플루언서 블록 존재(일반 블로그 진입 불가 신호). */
  hasInfluencer: boolean;
  /** 블로그/인기글 섹션 상위 배치. */
  blogFriendly: boolean;
  /** 쇼핑 블록이 상위 지배(구매의도지만 블로그로 뚫기 어려움). */
  shoppingDominant: boolean;
  /** 0~100 원본 블로거 기회점수. */
  opportunityScore: number;
  /** 최상단 블록 유형. */
  topBlockType: string | null;
  /** 침투 전략/추천 문구(실측 SERP 기반). */
  recommendation: string;
  /** 실측 SERP 여부. true = puppeteer 실측, false = 중립 기본값(미측정). */
  measured: boolean;
}

/**
 * SmartBlockAnalysis → SerpDifficultySignal.
 * - difficultyScore: (100 - 기회점수)/10 반올림, 0~10 클램프.
 * - hasSmartBlock: 상위3 이내 비침투 블록(canPenetrate=false) 존재 = 실질 진입장벽.
 * - hasViewSection: blogFriendly 계승.
 * - hasInfluencer: influencer 블록 존재.
 */
export function adaptSmartBlockAnalysis(a: SmartBlockAnalysis): SerpDifficultySignal {
  const opportunity = Number.isFinite(a.bloggerOpportunityScore) ? a.bloggerOpportunityScore : 50;
  const difficultyScore = Math.max(0, Math.min(10, Math.round((100 - opportunity) / 10)));
  const hasInfluencer = a.blocks.some((b) => b.type === 'influencer');
  const barrierTop = a.blocks.some((b) => !b.canPenetrate && b.position <= 3);
  return {
    difficultyScore,
    hasSmartBlock: barrierTop,
    hasViewSection: a.blogFriendly,
    hasInfluencer,
    blogFriendly: a.blogFriendly,
    shoppingDominant: a.shoppingDominant,
    opportunityScore: opportunity,
    topBlockType: a.topBlockType,
    recommendation: a.recommendation,
    measured: true,
  };
}

/** 미측정(중립) 신호 — 심층분석을 안 돌린 대량 경로/실패 fallback 용. 편향 없는 중립값. */
export function neutralSerpDifficultySignal(): SerpDifficultySignal {
  return {
    difficultyScore: 5,
    hasSmartBlock: false,
    hasViewSection: true,
    hasInfluencer: false,
    blogFriendly: true,
    shoppingDominant: false,
    opportunityScore: 50,
    topBlockType: null,
    recommendation: '',
    measured: false,
  };
}
