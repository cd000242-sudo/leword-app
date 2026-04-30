// PRO Hunter v12 — Markdown 초안 생성기
// 작성: 2026-04-15
// 청사진(outline) → Gemini로 실제 본문 초안 자동 생성

import { callAI } from './ai-client';
import type { KeywordBlueprint } from './outline-generator';

export interface DraftResult {
  keyword: string;
  title: string;
  markdown: string;
  wordCount: number;
  source: 'claude' | 'fallback';
  generatedAt: number;
}

function buildDraftPrompt(blueprint: KeywordBlueprint): string {
  const outlineText = blueprint.outline
    .map(
      (s, i) =>
        `## ${i + 1}. ${s.title} (${s.wordCount}단어)\n` +
        (s.keyPoints || []).map((p) => `- ${p}`).join('\n')
    )
    .join('\n\n');

  return `당신은 한국 네이버 블로그 SEO 전문가입니다. 아래 청사진대로 실제 블로그 글 초안을 마크다운으로 작성하세요.

# 키워드
"${blueprint.keyword}"

# 제목
${blueprint.strategicTitle}

# 권장 분량
총 ${blueprint.recommendedWordCount}단어
이미지 ${blueprint.recommendedImages}장 (위치 표시)
h2 섹션 ${blueprint.recommendedH2Count}개

# 본문 청사진
${outlineText}

# 본문에 반드시 포함할 키워드
${blueprint.mustIncludeKeywords.join(', ')}

# 1위 비결
${blueprint.contentSecret}

---

# 작업
위 청사진대로 실제 블로그 글 초안을 작성하세요.

규칙:
- 마크다운 형식 (h1: 제목, h2: 섹션, h3: 하위)
- 친근하고 자연스러운 한국어 톤
- 정보를 구체적으로 (숫자, 사례, 비교)
- 이미지 위치는 [이미지: 설명] 형태로 표시
- 필수 키워드를 본문에 자연스럽게 포함
- 각 h2 섹션의 권장 단어수 준수
- FAQ 섹션이 청사진에 있으면 실제 Q&A 5개 작성
- 마지막에 한 줄로 총 단어수 표시: "(총 약 N단어)"

마크다운만 출력하세요. 다른 설명 없이 글만.`;
}

function fallbackDraft(blueprint: KeywordBlueprint): DraftResult {
  const sections = blueprint.outline
    .map(
      (s, i) =>
        `## ${i + 1}. ${s.title}\n\n` +
        (s.keyPoints || []).map((p) => `- ${p}`).join('\n') +
        `\n\n*[이 섹션은 약 ${s.wordCount}단어로 작성하세요]*\n`
    )
    .join('\n');

  const md = `# ${blueprint.strategicTitle}\n\n*키워드: ${blueprint.keyword}*\n\n${sections}\n\n---\n\n**필수 포함 키워드**: ${blueprint.mustIncludeKeywords.join(', ')}\n\n**1위 비결**: ${blueprint.contentSecret}\n`;

  return {
    keyword: blueprint.keyword,
    title: blueprint.strategicTitle,
    markdown: md,
    wordCount: md.split(/\s+/).length,
    source: 'fallback',
    generatedAt: Date.now(),
  };
}

export async function generateDraft(blueprint: KeywordBlueprint): Promise<DraftResult> {
  try {
    const prompt = buildDraftPrompt(blueprint);
    const { text } = await callAI(prompt, { maxTokens: 8192, temperature: 0.7 });
    if (!text || text.length < 200) return fallbackDraft(blueprint);
    return {
      keyword: blueprint.keyword,
      title: blueprint.strategicTitle,
      markdown: text,
      wordCount: text.split(/\s+/).length,
      source: 'claude',
      generatedAt: Date.now(),
    };
  } catch (err) {
    console.error('[DRAFT] AI 실패:', (err as Error).message);
    return fallbackDraft(blueprint);
  }
}
