// PRO Hunter v12 — LLM 기반 글 청사진 생성기
// 작성: 2026-04-15
// SERP 분석 + 키워드 → Gemini로 글 outline + 차별화 전략 생성

import { callAI } from './ai-client';
import type { SerpAnalysis, GapAnalysis } from './serp-content-analyzer';
import type { SmartBlockAnalysis } from './smartblock-parser';
import type { SeasonalityProfile } from './seasonality-analyzer';

export interface BlueprintH2Section {
  title: string;
  wordCount: number;
  keyPoints: string[];
  isDifferentiator: boolean;
  toneNote?: string;
  mediaHint?: string;
}

export interface KeywordBlueprint {
  keyword: string;
  strategicTitle: string;
  alternativeTitles: string[];
  recommendedWordCount: number;
  recommendedImages: number;
  recommendedH2Count: number;
  outline: BlueprintH2Section[];
  mustIncludeKeywords: string[];
  contentSecret: string;
  // Tier 1 확장 필드
  titleFormula?: string;
  hookOpener?: string;
  faqSuggestions?: Array<{ q: string; a: string }>;
  ctaSuggestion?: string;
  smartBlockStrategy?: string;
  competitorWeaknesses: string[];
  differentiators: string[];
  rankingPrediction: {
    confidence: 'high' | 'medium' | 'low';
    estimatedRank: string;
    reasoning: string;
  };
  warnings: string[];
  generatedAt: number;
  source: 'claude' | 'fallback';
}

function buildPrompt(
  keyword: string,
  analysis: SerpAnalysis,
  gaps: GapAnalysis,
  smartBlocks?: SmartBlockAnalysis | null,
  seasonality?: SeasonalityProfile | null
): string {
  const competitorSummary = analysis.postOutlines
    .slice(0, 10)
    .map((p) => `${p.rank}위: "${p.title}" (${p.wordCount}단어, ${p.ageDays != null ? p.ageDays + '일 전' : '날짜불명'})`)
    .join('\n');

  const topTermsList = analysis.topKeywords
    .slice(0, 15)
    .map((k) => k.term)
    .join(', ');

  const mustList = analysis.mustIncludeTerms.join(', ');

  const weaknessList = gaps.competitorWeaknesses
    .map((w) => `- ${w.rank}위: ${w.weakness}`)
    .join('\n');

  const diffList = gaps.differentiators.map((d) => `- ${d}`).join('\n');

  // 스마트블록 정보 추가 (Tier 1)
  const smartBlockSection = smartBlocks
    ? `\n# 스마트블록 분석 (네이버 SERP 구조)
- 총 ${smartBlocks.totalBlocks}개 블록, 블로거 기회 점수 ${smartBlocks.bloggerOpportunityScore}/100
- 최상단 블록: ${smartBlocks.topBlockType || '알 수 없음'}
- 블로그 친화: ${smartBlocks.blogFriendly ? 'YES' : 'NO'}
- 추천: ${smartBlocks.recommendation}
- 침투 가능 블록: ${smartBlocks.blocks.filter((b) => b.canPenetrate).map((b) => b.displayName).join(', ') || '없음'}
- 침투 전략: ${smartBlocks.blocks.filter((b) => b.canPenetrate).slice(0, 3).map((b) => `${b.displayName} → ${b.strategy}`).join(' / ') || '일반 블로그 글'}`
    : '';

  // 시즌성 정보 추가
  const seasonSection = seasonality && seasonality.isSeasonal
    ? `\n# 시즌성 (12개월 트렌드)
- 피크 월: ${seasonality.peakMonth}월
- 현재 피크 대비: ${seasonality.currentVsPeakPct}%
- 권장: ${seasonality.recommendation}
- 데이터 소스: ${seasonality.source}`
    : '';

  return `당신은 한국 네이버 블로그 SEO 전문가이자 카피라이터입니다. 아래 키워드로 1위 가능한 글의 청사진을 JSON으로만 응답하세요. Surfer SEO 수준의 디테일을 담으세요.

# 키워드
"${keyword}"

# 현재 상위 10개 분석
- 평균 단어수: ${analysis.avgWordCount}단어
- 평균 이미지: ${analysis.avgImageCount}장
- 평균 h2 섹션: ${analysis.avgH2Count}개
- 영상 사용률: ${Math.round(analysis.videoUsageRatio * 100)}%
- 1년 이상 된 글 비율: ${Math.round(analysis.oldPostRatio * 100)}%

# 상위 10개 제목과 단어수
${competitorSummary}

# TF-IDF 상위 키워드 (top 10에서 자주 나오는 용어)
${topTermsList}

# 필수 포함 용어 (60% 이상의 글이 사용)
${mustList}

# 경쟁자 약점
${weaknessList || '(특이점 없음)'}

# 자동 감지된 차별화 기회
${diffList || '(특이점 없음)'}
${smartBlockSection}
${seasonSection}

---

# 작업
위 분석을 **모두 반영**해 신생 블로그도 1위 갈 수 있는 글의 청사진을 만드세요.

다음 JSON 스키마를 정확히 따르세요. 다른 텍스트 없이 JSON만 응답:

{
  "strategicTitle": "후킹력 있는 제목 1개 (35자 이내, 검색 의도 충족 + 호기심 자극, 숫자/연도/강한 형용사 포함)",
  "alternativeTitles": ["대안 제목 2개 (각 다른 angle)"],
  "recommendedWordCount": ${Math.round(analysis.avgWordCount * 1.2)},
  "recommendedImages": ${Math.max(8, analysis.avgImageCount + 2)},
  "recommendedH2Count": 6,
  "outline": [
    {
      "title": "h2 섹션 제목 (구체적, 행동 유도형)",
      "wordCount": 250,
      "keyPoints": ["실제 팩트/수치/사례 1", "팩트 2", "팩트 3"],
      "isDifferentiator": false,
      "toneNote": "이 섹션의 어조 (예: 진지 / 친근 / 공감 / 설명)",
      "mediaHint": "이 섹션에 필요한 시각자료 (예: 비교표 1개, 인포그래픽 1개)"
    }
  ],
  "mustIncludeKeywords": ["키워드1", "키워드2"],
  "contentSecret": "이 글이 1위 가는 핵심 비결 1~2문장 — 경쟁자가 못하는 것 구체적으로",
  "titleFormula": "제목 설계 공식 (예: [숫자] + [호기심 단어] + [혜택] + [대상])",
  "hookOpener": "본문 첫 문장 — 이걸로 체류시간 결정됨 (50자 이내)",
  "faqSuggestions": [
    {"q": "자주 묻는 질문 1", "a": "짧은 답"},
    {"q": "질문 2", "a": "답"},
    {"q": "질문 3", "a": "답"},
    {"q": "질문 4", "a": "답"},
    {"q": "질문 5", "a": "답"}
  ],
  "ctaSuggestion": "글 마지막에 독자에게 유도할 액션 (댓글/공유/구독)",
  "smartBlockStrategy": "스마트블록 침투 전략 (인기글 진입 방법 등, 스마트블록 분석 결과 반영)",
  "rankingPrediction": {
    "confidence": "high",
    "estimatedRank": "1~3위",
    "reasoning": "왜 이 순위가 가능한지 1~2문장 (SERP 분석 근거 포함)"
  },
  "warnings": ["시즌성/포화/위험 신호"]
}

규칙:
- outline은 5~7개 h2 섹션 (각 250~400단어)
- 각 섹션의 wordCount 합이 recommendedWordCount와 비슷해야 함
- isDifferentiator: true인 섹션 1~2개 (top 10이 빠뜨렸거나 약하게 다룬 주제)
- mustIncludeKeywords는 위 "필수 포함 용어"를 우선 활용
- contentSecret은 두루뭉술 금지 — **구체적**으로 (예: "비교 표 3개 + 실제 가격 + FAQ 5개로 정보성 점수 극대화 + 첫 200자에 핵심 결론 배치하여 체류시간 30초+ 확보")
- hookOpener는 질문형/충격형/공감형 중 하나
- titleFormula는 실제 포뮬러 (예: "{숫자}가지 + {주제} + {효과} + {대상}")
- faqSuggestions는 top 10 중 FAQ가 없다면 반드시 포함 (검색 의도 다양화 효과)
- smartBlockStrategy는 스마트블록 분석이 제공된 경우 반드시 구체적으로
- warnings: 시즌이 하락기면 "피크 D-N일 대기 권장", 포화면 "작성 서두르기" 등`;
}

function fallbackBlueprint(keyword: string, analysis: SerpAnalysis, gaps: GapAnalysis): KeywordBlueprint {
  // P1 #1: Gemini 실패 시 정직하게 "청사진 미생성" 공지
  // (이전: 템플릿 6-섹션을 진짜 청사진인 양 반환 → 사용자 신뢰 파괴)
  const warnings = [
    '⚠️ Gemini LLM이 사용 불가 상태입니다 (API 키 미설정 또는 호출 실패)',
    '📋 아래는 SERP 분석 기반 가이드일 뿐이며, 실제 청사진이 아닙니다',
    '🔧 환경설정에서 Gemini API 키를 등록하면 키워드별 맞춤 청사진이 생성됩니다',
  ];

  // 차별화 있을 때만 그걸 활용, 없으면 빈 outline
  const realSections: any[] = [];
  if (analysis.postCount > 0) {
    realSections.push({
      title: `📊 SERP 분석 요약 (${analysis.postCount}개 경쟁자)`,
      wordCount: 0,
      keyPoints: [
        `경쟁 평균 ${analysis.avgWordCount}단어 / 이미지 ${analysis.avgImageCount}장`,
        `영상 사용률 ${Math.round(analysis.videoUsageRatio * 100)}% / 노후 비율 ${Math.round(analysis.oldPostRatio * 100)}%`,
      ],
      isDifferentiator: false,
    });
  }
  if (gaps.differentiators.length > 0) {
    realSections.push({
      title: '💡 자동 감지된 차별화 기회',
      wordCount: 0,
      keyPoints: gaps.differentiators,
      isDifferentiator: true,
    });
  }

  return {
    keyword,
    strategicTitle: `[LLM 미사용] "${keyword}" — SERP 분석만 제공됨`,
    alternativeTitles: [],
    recommendedWordCount: Math.max(1500, analysis.recommendedWordCount),
    recommendedImages: Math.max(8, analysis.avgImageCount + 2),
    recommendedH2Count: 6,
    outline: realSections,
    mustIncludeKeywords: analysis.mustIncludeTerms.slice(0, 10),
    contentSecret:
      '⚠️ 청사진이 생성되지 않았습니다. Gemini API 키를 환경설정에 등록하면 키워드 맞춤 전략이 나옵니다.',
    competitorWeaknesses: gaps.competitorWeaknesses.map((w) => `${w.rank}위: ${w.weakness}`),
    differentiators: gaps.differentiators,
    rankingPrediction: {
      confidence: 'low',
      estimatedRank: 'LLM 미사용',
      reasoning:
        'Gemini LLM이 사용 불가 상태입니다. 예측은 SERP 통계만 기반으로 한 win-predictor 결과를 참고하세요.',
    },
    warnings,
    generatedAt: Date.now(),
    source: 'fallback',
  };
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // ```json ... ``` 코드 블록 제거
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m && m[1]) {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    }
    // { ... } 첫 객체 추출
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateBlueprint(
  keyword: string,
  analysis: SerpAnalysis,
  gaps: GapAnalysis,
  smartBlocks?: SmartBlockAnalysis | null,
  seasonality?: SeasonalityProfile | null
): Promise<KeywordBlueprint> {
  if (analysis.postCount === 0) {
    console.warn('[BLUEPRINT] SERP 데이터 부족 → fallback');
    return fallbackBlueprint(keyword, analysis, gaps);
  }

  try {
    const prompt = buildPrompt(keyword, analysis, gaps, smartBlocks, seasonality);
    const { text } = await callAI(prompt, { maxTokens: 4096, temperature: 0.6 });
    const parsed = safeJsonParse(text);

    if (!parsed || !parsed.strategicTitle) {
      console.warn('[BLUEPRINT] AI 응답 파싱 실패 → fallback', text.slice(0, 200));
      return fallbackBlueprint(keyword, analysis, gaps);
    }

    return {
      keyword,
      strategicTitle: String(parsed.strategicTitle).slice(0, 100),
      alternativeTitles: Array.isArray(parsed.alternativeTitles) ? parsed.alternativeTitles.slice(0, 3) : [],
      recommendedWordCount: Number(parsed.recommendedWordCount) || analysis.recommendedWordCount,
      recommendedImages: Number(parsed.recommendedImages) || Math.max(8, analysis.avgImageCount + 2),
      recommendedH2Count: Number(parsed.recommendedH2Count) || 6,
      outline: Array.isArray(parsed.outline)
        ? parsed.outline.slice(0, 8).map((s: any) => ({
            title: String(s.title || ''),
            wordCount: Number(s.wordCount) || 250,
            keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
            isDifferentiator: !!s.isDifferentiator,
            toneNote: s.toneNote ? String(s.toneNote) : undefined,
            mediaHint: s.mediaHint ? String(s.mediaHint) : undefined,
          }))
        : [],
      mustIncludeKeywords: Array.isArray(parsed.mustIncludeKeywords)
        ? parsed.mustIncludeKeywords.slice(0, 20).map(String)
        : analysis.mustIncludeTerms.slice(0, 10),
      contentSecret: String(parsed.contentSecret || ''),
      titleFormula: parsed.titleFormula ? String(parsed.titleFormula) : undefined,
      hookOpener: parsed.hookOpener ? String(parsed.hookOpener) : undefined,
      faqSuggestions: Array.isArray(parsed.faqSuggestions)
        ? parsed.faqSuggestions.slice(0, 8).map((f: any) => ({ q: String(f.q || ''), a: String(f.a || '') }))
        : undefined,
      ctaSuggestion: parsed.ctaSuggestion ? String(parsed.ctaSuggestion) : undefined,
      smartBlockStrategy: parsed.smartBlockStrategy ? String(parsed.smartBlockStrategy) : undefined,
      competitorWeaknesses: gaps.competitorWeaknesses.map((w) => `${w.rank}위: ${w.weakness}`),
      differentiators: gaps.differentiators,
      rankingPrediction: {
        confidence: ['high', 'medium', 'low'].includes(parsed.rankingPrediction?.confidence)
          ? parsed.rankingPrediction.confidence
          : 'medium',
        estimatedRank: String(parsed.rankingPrediction?.estimatedRank || '5~10위'),
        reasoning: String(parsed.rankingPrediction?.reasoning || ''),
      },
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 5) : [],
      generatedAt: Date.now(),
      source: 'claude',
    };
  } catch (err) {
    console.error('[BLUEPRINT] AI 호출 실패:', (err as Error).message);
    return fallbackBlueprint(keyword, analysis, gaps);
  }
}
