/**
 * 정책·지원금 키워드 정제 게이트.
 *
 * 정책브리핑 공급원(policy-briefing-api)은 기사 본문을 잘라 키워드를 만들기 때문에
 * 제도명과 문장 조각이 섞여 나온다. 실측 표본(2026-09-02, 60건):
 *   제도명   → "아동수당", "온누리상품권 환급", "유가연동보조금", "참전명예수당"
 *   문장조각 → "에 따른 급여", "오르고 참전명예수당", "취약계층을 지원",
 *              "학생들 때문이다", "AI를 활용하는 시행"
 *
 * 조각을 그대로 발굴 결과로 내보내면 안 되므로, 제도명 모양만 통과시킨다.
 * 판정은 전부 규칙 기반이며 LLM 을 쓰지 않는다.
 */

import {
  SENTENCE_DEBRIS_RE,
  tokenize,
  isParticleToken,
  hasTrailingParticle,
  looksLikeVerbForm,
  collapseVariants,
} from './keyword-shape';

/** 제도명이라면 거의 반드시 갖는 도메인 명사 — 이게 없으면 제도명이 아니다. */
const POLICY_DOMAIN_NOUN_RE = /(수당|지원|지원금|급여|보조금|장려금|연금|바우처|대출|환급|공제|보험|장학금|펀드|직불금|상품권|돌봄|급식|감면|세액|융자|보상금)/;

/** 단독으로 쓰이면 의미가 없는 일반어 — 이것만으로 이뤄진 구는 제도명이 아니다. */
const GENERIC_TOKEN_RE = /^(지원|신청|지급|대상|접수|안내|확대|시행|추진|운영|사업|제도|정책)$/;

export interface PolicyKeywordVerdict {
  ok: boolean;
  reason: string;
}

/**
 * 정책 키워드 한 건을 검사한다.
 * @param maxTokens 검색량 실측이 가능한 최대 어절 수 (헌터의 MEASURABLE_MAX_TOKENS 와 맞춘다)
 */
export function inspectPolicyKeyword(keyword: string, maxTokens: number = 3): PolicyKeywordVerdict {
  const raw = String(keyword || '').trim();
  if (raw.length < 2) return { ok: false, reason: '너무 짧음' };
  if (SENTENCE_DEBRIS_RE.test(raw)) return { ok: false, reason: '문장 부호 포함' };

  const tokens = tokenize(raw);
  if (tokens.length === 0) return { ok: false, reason: '빈 값' };
  if (tokens.length > maxTokens) return { ok: false, reason: `${maxTokens}어절 초과` };

  for (const token of tokens) {
    if (isParticleToken(token)) return { ok: false, reason: `조사·부사 토큰 "${token}"` };
    if (hasTrailingParticle(token)) return { ok: false, reason: `조사 붙은 토큰 "${token}"` };
    if (looksLikeVerbForm(token)) return { ok: false, reason: `용언 활용형 "${token}"` };
  }

  if (!POLICY_DOMAIN_NOUN_RE.test(raw)) return { ok: false, reason: '제도 도메인 명사 없음' };
  if (tokens.every((t) => GENERIC_TOKEN_RE.test(t))) return { ok: false, reason: '일반어로만 구성' };

  return { ok: true, reason: '제도명' };
}

/** 통과한 것만 남긴다. 순서는 보존한다. */
export function sanitizePolicyKeywords(keywords: string[], maxTokens: number = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of keywords) {
    if (!inspectPolicyKeyword(keyword, maxTokens).ok) continue;
    const key = String(keyword).replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(String(keyword).trim());
  }
  return collapseVariants(out);
}
