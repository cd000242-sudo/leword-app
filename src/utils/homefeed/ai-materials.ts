/**
 * 홈판 신호 AI 보강 재료 — 스토리 검토(긴장 · 재미 근거를 근거 제목 번호와 함께) · 이미지 프롬프트 다듬기.
 *
 * 근거 번호가 없거나 범위 밖인 항목은 버린다 — 근거 없는 FUN GAP 을 만들지 않는다.
 * 검토 결과는 화면에 'AI 보강'으로 따로 보여 줄 뿐, 규칙 판정(창 · 상태)을 바꾸지 않는다.
 */
import { CATEGORY_LABEL } from './category';
import type { HomefeedAiPromptPlan, HomefeedAiStoryReview, HomefeedFunGapFlag, HomefeedStory, HomefeedTensionType } from './types';
import { clip } from './text';

const TENSION_TYPES: readonly HomefeedTensionType[] = [
  'number_conflict', 'relationship_shift', 'expectation_break', 'action_reversal', 'identity_contrast', 'past_vs_now', 'result_first', 'scale_mismatch', 'hidden_reason',
];
const FUN_GAP_FLAGS: readonly HomefeedFunGapFlag[] = [
  'unexpected_fact', 'surprising_number', 'relationship_change', 'strong_quote', 'visible_contrast', 'before_after', 'unusual_object_price', 'outcome_mismatch', 'socially_tellable', 'visual_curiosity',
];
export const REVIEW_RISKS = ['RUMOR_ONLY', 'FAN_ONLY', 'NEEDS_EXAGGERATION', 'SINGLE_ARTICLE', 'CARD_IMPOSSIBLE', 'SENSITIVE'] as const;

function jsonObject(reply: string): Record<string, unknown> | null {
  const match = String(reply || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const rowsOf = (value: unknown): Array<Record<string, unknown>> => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>> : []);

export function buildStoryReviewPrompt(story: HomefeedStory): string {
  return [
    '너는 네이버 홈판 글감을 고르는 편집자다. 아래 기사 제목들만 보고 이 이슈의 긴장과 재미 근거를 분류해라.',
    `이슈: ${story.keyword} (${CATEGORY_LABEL[story.category]})`,
    '기사 제목(번호로 근거를 댄다):',
    story.evidence.map((item, index) => `${index + 1}. ${item.title}`).join('\n') || '(없음)',
    '',
    `긴장 유형(이 중에서만): ${TENSION_TYPES.join(', ')}`,
    `재미 근거(이 중에서만): ${FUN_GAP_FLAGS.join(', ')}`,
    `위험(이 중에서만): ${REVIEW_RISKS.join(', ')}`,
    '',
    '규칙: 모든 항목에 근거 제목 번호(evidence)를 단다. 제목에 없는 사실을 지어내지 마라. 해당 없으면 빈 배열.',
    'JSON 하나만 출력: {"tensions":[{"type":"...","evidence":1,"note":"한 줄"}],"fun_gap":[{"flag":"...","evidence":2,"note":"한 줄"}],"risks":["..."]}',
  ].join('\n');
}

export function parseStoryReview(reply: string, evidenceCount: number): Pick<HomefeedAiStoryReview, 'tensions' | 'funGap' | 'risks'> | null {
  const parsed = jsonObject(reply);
  if (!parsed) return null;
  const index = (value: unknown): number | null => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= evidenceCount ? number - 1 : null;
  };
  const tensions = rowsOf(parsed.tensions)
    .map((row) => ({ type: TENSION_TYPES.find((type) => type === row.type), evidenceIndex: index(row.evidence), note: clip(row.note, 80) }))
    .filter((row): row is { type: HomefeedTensionType; evidenceIndex: number; note: string } => Boolean(row.type) && row.evidenceIndex !== null)
    .slice(0, 12);
  const funGap = rowsOf(parsed.fun_gap)
    .map((row) => ({ flag: FUN_GAP_FLAGS.find((flag) => flag === row.flag), evidenceIndex: index(row.evidence), note: clip(row.note, 80) }))
    .filter((row): row is { flag: HomefeedFunGapFlag; evidenceIndex: number; note: string } => Boolean(row.flag) && row.evidenceIndex !== null)
    .slice(0, 12);
  const risks = [...new Set((Array.isArray(parsed.risks) ? parsed.risks : []).map(String))].filter((risk) => (REVIEW_RISKS as readonly string[]).includes(risk));
  return { tensions, funGap, risks };
}

const PROMPT_MAX_CHARS = 1200;

export function buildPromptRefinePrompt(story: HomefeedStory, plans: readonly HomefeedAiPromptPlan[]): string {
  return [
    '너는 이미지 생성 프롬프트를 다듬는 사람이다. 아래 초안을 더 구체적인 장면으로 다듬어라.',
    `주제: ${story.anchor.text} (${CATEGORY_LABEL[story.category]})`,
    `새로 나온 사실: ${story.delta?.text ?? '없음'}`,
    '규칙: 실존 인물의 얼굴 · 이름 · 로고 · 글자를 넣지 마라. 실제 뉴스 사진처럼 꾸미지 마라. 초안의 구도 · 비율 · 여백 조건을 지켜라. 재료에 없는 사건을 그리지 마라.',
    '초안:',
    plans.map((plan) => `- id=${plan.id}\n  ko: ${plan.finalPromptKo}\n  en: ${plan.finalPromptEn}`).join('\n'),
    'JSON 하나만 출력: {"prompts":[{"id":"ai-hero","ko":"...","en":"..."}]}',
  ].join('\n');
}

/** 다듬은 답을 초안에 입힌다. 제외 조건이 빠졌으면 다시 붙인다. 하나도 못 입히면 null. */
export function applyPromptRefine(plans: readonly HomefeedAiPromptPlan[], reply: string, provider: string): HomefeedAiPromptPlan[] | null {
  const parsed = jsonObject(reply);
  if (!parsed) return null;
  const refined = new Map(rowsOf(parsed.prompts).map((row) => [String(row.id || ''), row]));
  let applied = 0;
  const out = plans.map((plan) => {
    const row = refined.get(plan.id);
    const ko = clip(row?.ko, PROMPT_MAX_CHARS);
    const en = clip(row?.en, PROMPT_MAX_CHARS);
    if (!ko || !en) return plan;
    applied += 1;
    return {
      ...plan,
      finalPromptKo: ko.includes('제외:') ? ko : `${ko} 제외: ${plan.negativePrompt}.`,
      finalPromptEn: /avoid:/i.test(en) ? en : `${en} Avoid: text, watermark, logo, real person face, distorted hands.`,
      refinedBy: provider,
    };
  });
  return applied > 0 ? out : null;
}
