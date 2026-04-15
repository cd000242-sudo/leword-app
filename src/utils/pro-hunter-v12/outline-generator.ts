// PRO Hunter v12 — LLM 기반 글 청사진 생성기
// 작성: 2026-04-15
// SERP 분석 + 키워드 → Gemini로 글 outline + 차별화 전략 생성

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SerpAnalysis, GapAnalysis } from './serp-content-analyzer';
import { EnvironmentManager } from '../environment-manager';

export interface BlueprintH2Section {
  title: string;
  wordCount: number;
  keyPoints: string[];
  isDifferentiator: boolean;     // top 10에서 빠뜨린 섹션
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
  competitorWeaknesses: string[];
  differentiators: string[];
  rankingPrediction: {
    confidence: 'high' | 'medium' | 'low';
    estimatedRank: string;     // "1~3위" 같은 범위
    reasoning: string;
  };
  warnings: string[];
  generatedAt: number;
  source: 'gemini' | 'fallback';
}

const MODEL_NAME = 'gemini-2.0-flash-exp';

function buildPrompt(keyword: string, analysis: SerpAnalysis, gaps: GapAnalysis): string {
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

  return `당신은 한국 네이버 블로그 SEO 전문가입니다. 아래 키워드로 1위 가능한 글의 청사진을 JSON으로만 응답하세요.

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

---

# 작업
위 분석을 기반으로 신생 블로그도 1위 갈 수 있는 글의 청사진을 만드세요.

다음 JSON 스키마를 정확히 따르세요. 다른 텍스트 없이 JSON만 응답:

{
  "strategicTitle": "후킹력 있는 제목 1개 (35자 이내, 검색 의도 충족 + 호기심 자극)",
  "alternativeTitles": ["대안 제목 2개"],
  "recommendedWordCount": ${Math.round(analysis.avgWordCount * 1.2)},
  "recommendedImages": ${Math.max(8, analysis.avgImageCount + 2)},
  "recommendedH2Count": 6,
  "outline": [
    {
      "title": "h2 섹션 제목",
      "wordCount": 250,
      "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
      "isDifferentiator": false
    }
  ],
  "mustIncludeKeywords": ["키워드1", "키워드2"],
  "contentSecret": "이 글이 1위 가는 핵심 비결 1문장",
  "rankingPrediction": {
    "confidence": "high",
    "estimatedRank": "1~3위",
    "reasoning": "왜 이 순위가 가능한지 1~2문장"
  },
  "warnings": ["주의사항이 있다면"]
}

규칙:
- outline은 5~7개 h2 섹션
- 각 섹션의 wordCount 합이 recommendedWordCount와 비슷해야 함
- isDifferentiator: true인 섹션 1~2개 (top 10이 빠뜨렸거나 약하게 다룬 주제)
- mustIncludeKeywords는 위 "필수 포함 용어"를 우선 활용
- contentSecret은 두루뭉술하지 말고 구체적으로 (예: "비교 표 + 실제 가격 + FAQ로 정보성 점수 극대화")
- warnings는 시즌성/포화/위험 신호가 있으면 포함, 없으면 빈 배열`;
}

function fallbackBlueprint(keyword: string, analysis: SerpAnalysis, gaps: GapAnalysis): KeywordBlueprint {
  // Gemini 실패 시 룰 기반 청사진
  return {
    keyword,
    strategicTitle: `${keyword} 완벽 가이드 — 핵심만 정리`,
    alternativeTitles: [`${keyword} 총정리`, `${keyword} 한 번에 보기`],
    recommendedWordCount: Math.max(1500, analysis.recommendedWordCount),
    recommendedImages: Math.max(8, analysis.avgImageCount + 2),
    recommendedH2Count: 6,
    outline: [
      { title: `${keyword}란? (개념 정리)`, wordCount: 250, keyPoints: ['정의', '왜 중요한가'], isDifferentiator: false },
      { title: `${keyword} 핵심 포인트 5가지`, wordCount: 350, keyPoints: ['핵심 1', '핵심 2', '핵심 3'], isDifferentiator: false },
      { title: '실전 적용 방법 (단계별)', wordCount: 400, keyPoints: ['Step 1', 'Step 2', 'Step 3'], isDifferentiator: false },
      { title: '주의사항과 흔한 실수', wordCount: 250, keyPoints: ['실수 1', '실수 2'], isDifferentiator: true },
      { title: '비교 / 추천 / 가격', wordCount: 300, keyPoints: ['비교 표'], isDifferentiator: false },
      { title: 'FAQ — 자주 묻는 질문', wordCount: 250, keyPoints: ['Q&A 5개'], isDifferentiator: true },
    ],
    mustIncludeKeywords: analysis.mustIncludeTerms.slice(0, 10),
    contentSecret: '비교 표 + 실제 사용 후기 + FAQ 섹션 추가로 정보성 점수 극대화',
    competitorWeaknesses: gaps.competitorWeaknesses.map((w) => `${w.rank}위: ${w.weakness}`),
    differentiators: gaps.differentiators,
    rankingPrediction: {
      confidence: 'medium',
      estimatedRank: '5~10위',
      reasoning: 'LLM 분석 미사용 (fallback). 실제 작성 시 경쟁도에 따라 변동.',
    },
    warnings: [],
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
  gaps: GapAnalysis
): Promise<KeywordBlueprint> {
  const env = EnvironmentManager.getInstance().getConfig();
  const apiKey = env.geminiApiKey;

  if (!apiKey || analysis.postCount === 0) {
    console.warn('[BLUEPRINT] Gemini API 키 없음 또는 SERP 데이터 부족 → fallback');
    return fallbackBlueprint(keyword, analysis, gaps);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const prompt = buildPrompt(keyword, analysis, gaps);

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeJsonParse(text);

    if (!parsed || !parsed.strategicTitle) {
      console.warn('[BLUEPRINT] Gemini 응답 파싱 실패 → fallback', text.slice(0, 200));
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
          }))
        : [],
      mustIncludeKeywords: Array.isArray(parsed.mustIncludeKeywords)
        ? parsed.mustIncludeKeywords.slice(0, 20).map(String)
        : analysis.mustIncludeTerms.slice(0, 10),
      contentSecret: String(parsed.contentSecret || ''),
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
      source: 'gemini',
    };
  } catch (err) {
    console.error('[BLUEPRINT] Gemini 호출 실패:', (err as Error).message);
    return fallbackBlueprint(keyword, analysis, gaps);
  }
}
