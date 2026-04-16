// PRO Hunter v12 — 스마트블록 작성 어시스턴트 (Tier 3 #2)
// 작성: 2026-04-15
// 특정 스마트블록 진입에 필요한 CTR/제목/전략을 LLM으로 생성

import { GoogleGenerativeAI } from '@google/generative-ai';
import { EnvironmentManager } from '../environment-manager';
import type { SmartBlockAnalysis, SmartBlockType } from './smartblock-parser';

export interface TitleVariant {
  title: string;
  style: 'number' | 'question' | 'curiosity' | 'urgency' | 'benefit';
  expectedCtr: number;       // 추정 CTR (%)
  reasoning: string;
}

export interface BlockEntryPlan {
  blockType: SmartBlockType;
  blockName: string;
  targetCtrPct: number;              // 이 블록 진입에 필요한 CTR
  currentDifficulty: 'easy' | 'medium' | 'hard' | 'impossible';
  titleVariants: TitleVariant[];     // A/B/C 3개
  firstParagraphSuggestion: string;
  metaDescriptionSuggestion: string;
  thumbnailHint: string;
  insiderTips: string[];
  source: 'gemini' | 'fallback';
}

// 네이버 스마트블록별 진입 기준 CTR 추정 (커뮤니티 경험치 기반)
const ENTRY_CTR_THRESHOLDS: Record<SmartBlockType, number> = {
  popular_post: 3.5,
  view: 2.0,
  influencer: 5.0,       // 거의 불가능
  knowledge_in: 1.5,
  shopping: 2.5,
  cafe: 1.0,
  news: 4.0,
  video: 3.0,
  image: 1.0,
  place: 1.0,
  power_link: 0,         // 광고
  webdoc: 0.5,
  other: 2.0,
};

function computeDifficulty(targetCtr: number, blockType: SmartBlockType): BlockEntryPlan['currentDifficulty'] {
  if (blockType === 'influencer' || blockType === 'power_link') return 'impossible';
  if (targetCtr >= 4) return 'hard';
  if (targetCtr >= 2.5) return 'medium';
  return 'easy';
}

function fallbackPlan(blockType: SmartBlockType, keyword: string): BlockEntryPlan {
  const targetCtr = ENTRY_CTR_THRESHOLDS[blockType] || 2;
  return {
    blockType,
    blockName: blockType,
    targetCtrPct: targetCtr,
    currentDifficulty: computeDifficulty(targetCtr, blockType),
    titleVariants: [
      { title: `${keyword} 완벽 가이드`, style: 'benefit', expectedCtr: 2.0, reasoning: '기본 정보성 제목' },
      { title: `${keyword} TOP 5 추천`, style: 'number', expectedCtr: 2.8, reasoning: '숫자 + 추천 조합' },
      { title: `${keyword} 꼭 알아야 할 3가지`, style: 'curiosity', expectedCtr: 2.5, reasoning: '호기심 유발' },
    ],
    firstParagraphSuggestion: `${keyword}에 대해 궁금하신가요? 본문에서 핵심만 정리해드립니다.`,
    metaDescriptionSuggestion: `${keyword} 완벽 가이드 — 핵심 정보와 꿀팁 총정리`,
    thumbnailHint: '고대비 + 숫자/아이콘 + 큰 텍스트로 CTR 극대화',
    insiderTips: [
      '제목 30자 이내 (모바일 잘림 방지)',
      '첫 200자에 결론 배치 → 체류시간 +30초',
      '이미지 8장 이상 + 표 1개 필수',
    ],
    source: 'fallback',
  };
}

export async function generateBlockEntryPlan(
  keyword: string,
  blockType: SmartBlockType,
  smartBlocks?: SmartBlockAnalysis | null
): Promise<BlockEntryPlan> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.geminiApiKey) return fallbackPlan(blockType, keyword);

  const targetCtr = ENTRY_CTR_THRESHOLDS[blockType] || 2;
  const difficulty = computeDifficulty(targetCtr, blockType);

  try {
    const genAI = new GoogleGenerativeAI(env.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const contextInfo = smartBlocks
      ? `\n현재 네이버 SERP 상태:\n- 총 ${smartBlocks.totalBlocks}개 블록\n- 기회 점수 ${smartBlocks.bloggerOpportunityScore}/100\n- 추천: ${smartBlocks.recommendation}`
      : '';

    const prompt = `당신은 네이버 스마트블록 SEO 전문가입니다. 아래 키워드로 특정 스마트블록에 진입하기 위한 작전 카드를 JSON으로 생성하세요.

# 키워드
"${keyword}"

# 진입 목표 블록
${blockType} (진입 필요 CTR: ${targetCtr}%, 난이도: ${difficulty})
${contextInfo}

# 작업
JSON만 응답:
{
  "titleVariants": [
    {
      "title": "제목 A (30자 이내)",
      "style": "number",
      "expectedCtr": 3.2,
      "reasoning": "이 제목이 CTR 높은 이유"
    },
    {
      "title": "제목 B",
      "style": "question",
      "expectedCtr": 2.8,
      "reasoning": "..."
    },
    {
      "title": "제목 C",
      "style": "curiosity",
      "expectedCtr": 3.5,
      "reasoning": "..."
    }
  ],
  "firstParagraphSuggestion": "본문 첫 200자 추천 (독자 이탈 방지, 체류시간 30초+ 확보)",
  "metaDescriptionSuggestion": "메타 디스크립션 80자 이내 (네이버 검색결과 노출)",
  "thumbnailHint": "썸네일 이미지 디자인 가이드 (구체적 요소 나열)",
  "insiderTips": ["팁1", "팁2", "팁3", "팁4", "팁5"]
}

규칙:
- style은 number/question/curiosity/urgency/benefit 중 하나
- expectedCtr은 0.5~6.0 범위의 현실적 수치
- 제목 3개는 **완전히 다른 angle** (같은 패턴 반복 금지)
- insiderTips는 해당 블록 특화된 구체적 팁 (일반론 금지)
- firstParagraph는 ${keyword} 키워드를 자연스럽게 포함`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallbackPlan(blockType, keyword);

    const parsed = JSON.parse(m[0]);
    return {
      blockType,
      blockName: blockType,
      targetCtrPct: targetCtr,
      currentDifficulty: difficulty,
      titleVariants: Array.isArray(parsed.titleVariants)
        ? parsed.titleVariants.slice(0, 5).map((t: any) => ({
            title: String(t.title || ''),
            style: ['number', 'question', 'curiosity', 'urgency', 'benefit'].includes(t.style) ? t.style : 'benefit',
            expectedCtr: Number(t.expectedCtr) || 2,
            reasoning: String(t.reasoning || ''),
          }))
        : [],
      firstParagraphSuggestion: String(parsed.firstParagraphSuggestion || ''),
      metaDescriptionSuggestion: String(parsed.metaDescriptionSuggestion || ''),
      thumbnailHint: String(parsed.thumbnailHint || ''),
      insiderTips: Array.isArray(parsed.insiderTips) ? parsed.insiderTips.slice(0, 8).map(String) : [],
      source: 'gemini',
    };
  } catch (err) {
    console.error('[SB-ASSIST] Gemini 실패:', (err as Error).message);
    return fallbackPlan(blockType, keyword);
  }
}
