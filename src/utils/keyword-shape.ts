/**
 * 한국어 키워드 모양 검사 — 문장 조각을 걸러내는 공용 규칙.
 *
 * 뉴스·기사 기반 공급원(정책브리핑, IT 매체 RSS)은 본문·제목을 잘라 키워드를 만들기 때문에
 * 제도명/고유명사와 문장 조각이 섞여 나온다. 조각의 표식은 공통이다 —
 * 조사가 붙어 있거나, 용언 활용형이거나, 문장 부호가 남아 있다.
 * 전부 규칙 기반이며 LLM 을 쓰지 않는다.
 */

/** 그 자체가 조사·접속어·부사인 토큰 — 문장에서 잘려 나온 증거. */
const PARTICLE_TOKEN_RE = /^(에|의|를|을|은|는|이|가|와|과|및|등|도|만|더|또|이어|그|저|이런|다른|가장|처음|이는|되면서|그래야|때문이다)$/;

/** 조사가 붙은 채로 잘린 토큰 (예: "취약계층을", "재외동포청은"). */
const TRAILING_PARTICLE_RE = /(을|를|은|는|의|와|과|에|에서|에게|으로|부터|까지)$/;

/** 용언 활용형 — 명사가 아니라 서술어라는 증거 (예: "따른", "오르고", "낮춘다"). */
const VERB_FORM_RE = /(한|된|는|른|고|며|서|야|다|나|까|요)$/;

/**
 * 용언처럼 끝나지만 실제로는 명사인 흔한 어미.
 * "청년농업인", "소상공인", "가족관계증명서" — 특히 '서'는 어미(-서)와
 * 서류 명사(증명서·신청서)가 겹쳐 오탐이 잦다.
 */
const NOUN_TAIL_RE = /(인|민|원|금|권|비|료|제|법|서|증)$/;

/** 문장에서 잘려 나온 흔적. */
export const SENTENCE_DEBRIS_RE = /["'“”‘’,.…]/;

export function tokenize(keyword: string): string[] {
  return String(keyword || '').trim().split(/\s+/).filter(Boolean);
}

/**
 * 조사가 붙어 잘린 토큰인지.
 * 짧은 낱말은 조사와 형태가 겹치므로(예: "물가", "회의") 어간이 3자 이상일 때만 본다.
 */
export function hasTrailingParticle(token: string): boolean {
  if (token.length < 4) return false;
  const m = token.match(TRAILING_PARTICLE_RE);
  if (!m) return false;
  return token.length - m[1].length >= 3;
}

export function looksLikeVerbForm(token: string): boolean {
  if (token.length < 2) return false;
  if (NOUN_TAIL_RE.test(token)) return false;
  return VERB_FORM_RE.test(token);
}

export function isParticleToken(token: string): boolean {
  return PARTICLE_TOKEN_RE.test(token);
}

/** 명사구 토큰으로 볼 수 있는가 — 위 세 가지 조각 표식이 없으면 통과. */
export function isNounPhraseToken(token: string): boolean {
  if (!token) return false;
  if (isParticleToken(token)) return false;
  if (hasTrailingParticle(token)) return false;
  if (looksLikeVerbForm(token)) return false;
  return true;
}

/**
 * 같은 대상의 변형을 하나로 접는다.
 * 공급원이 한 기사에서 "아동수당" / "아동수당 지급" / "아동수당 신청" 을 각각 뱉으면
 * 후보 슬롯을 한 대상이 독식한다. 다른 키워드의 접두인 쪽(더 짧고 일반적인 이름)을 남긴다.
 * 접두가 정확히 일치할 때만 접으므로 "참전수당"과 "참전명예수당"은 둘 다 살아남는다.
 */
export function collapseVariants(keywords: string[]): string[] {
  const sorted = [...keywords].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const keyword of sorted) {
    const compact = keyword.replace(/\s+/g, '');
    if (kept.some((k) => compact.startsWith(k.replace(/\s+/g, '')))) continue;
    kept.push(keyword);
  }
  // 원래 순서를 되살린다 — 공급원이 매긴 우선순위를 버리지 않기 위해서.
  return keywords.filter((k) => kept.includes(k));
}
