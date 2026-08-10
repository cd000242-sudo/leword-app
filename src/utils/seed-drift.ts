/**
 * 자동완성으로 늘린 키워드가 **아직 그 씨앗의 말인지** 가른다.
 *
 * 자동완성은 몇 단계 확장되면 주제를 벗어난다. 씨앗 '예방접종 비용' 이 반려동물
 * 주제에서 '풍진 예방접종 비용'(사람)을 물어왔고, '베게' 는 맞춤법 질문으로 샜다.
 *
 * 이 규칙이 substring 으로 새어 나간 것이 이 레포에서만 세 번째다:
 *   ① '약' 한 글자가 '예약' 을 물었다 → 두 글자 이상만 쓰기로 했다
 *   ② 그래도 '락스' 가 '마키나락스 주가'(주식) 를, '덴트' 가 '덴트릭스 치약' 을 물었다
 * 두 글자 제한으로는 못 막는다. 두 글자가 통째로 남의 낱말 한가운데 들어가기 때문이다.
 * 그래서 **낱말 경계**에서 본다 — 압축 문자열을 훑지 않는다.
 */

/** 한 글자 씨앗은 무엇이든 문다. 애초에 어절로 치지 않는다. */
const MIN_SEED_TOKEN_LENGTH = 2;

export function seedTokens(seed: string): string[] {
    return String(seed || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= MIN_SEED_TOKEN_LENGTH);
}

/**
 * 키워드가 씨앗의 어절 하나로 **시작하는 낱말**을 갖고 있는가.
 *
 * 시작만 허용하는 이유: 한국어는 뒤로 붙여 늘린다('강아지' → '강아지사료').
 * 앞으로 붙여 늘린 것은 대개 다른 말이다('락스' → '마키나락스').
 *
 * 한계 — 낱말 **머리**에서 겹치는 상표는 여전히 통과한다('덴트' → '덴트릭스 치약').
 * 문자열 규칙으로는 여기까지다. 그 뒤는 완결성·주제 판정이 맡는다.
 */
export function sharesSeedToken(keyword: string, seed: string): boolean {
    const tokens = seedTokens(seed);
    if (tokens.length === 0) return true;

    const keywordTokens = String(keyword || '')
        .split(/\s+/)
        .filter(Boolean);

    return tokens.some((token) => keywordTokens.some((kwToken) => kwToken.startsWith(token)));
}
