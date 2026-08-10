/**
 * 자동완성으로 늘린 키워드가 **아직 그 씨앗의 말인지** 가른다.
 *
 * 자동완성은 몇 단계 확장되면 주제를 벗어난다. 씨앗 '예방접종 비용' 이 반려동물
 * 주제에서 '풍진 예방접종 비용'(사람)을 물어왔고, '베게' 는 맞춤법 질문으로 샜다.
 * 씨앗의 어절 하나는 남아 있어야 같은 말로 본다.
 *
 * ## 낱말 경계로 막으려다 실패한 기록 (2026-08-10)
 *
 * 이 검사는 압축 문자열에 substring 으로 건다. 그래서 '락스' 가 '마키나락스 주가'
 * (주식)를 물어 인테리어·DIY 후보로 올라온 적이 있다. 낱말 머리에서만 인정하도록
 * 바꿔 봤는데 **실측에서 정상 후보가 무너졌다**:
 *
 *   공기청정기 필터 교체주기  ← 씨앗 '공기청정기필터'   정상인데 죽음
 *   강아지사료 추천          ← 씨앗 '사료'            정상인데 죽음
 *   청소년소설추천           ← 씨앗 '소설 추천'        정상인데 죽음
 *   상품리뷰 한 주제의 이탈이 54건 → 771건
 *
 * 이유는 둘이다.
 *   ① 검색광고 연관어는 공백 없는 1어절로 온다('공기청정기필터'). 확장 씨앗 대부분이
 *      홑말이고, 그 확장형은 띄어쓰기가 들어간 채 온다. 낱말 머리로 맞출 수가 없다.
 *   ② 한국어 복합어는 뒷말이 머리말이다. '강아지사료' 의 '사료' 와 '마키나락스' 의
 *      '락스' 는 **구조가 같다** — 앞에 다른 말이 붙은 복합어의 꼬리다.
 *      하나는 같은 말이고 하나는 남남인데 글자로는 구별할 방법이 없다.
 *
 * 그래서 substring 으로 되돌렸다. '마키나락스' 류 오염은 이 함수가 풀 문제가 아니다 —
 * 형태소 분석기나, 키워드가 실제로 무엇에 관한 것인지 보는 SERP 실측이 있어야 한다.
 * **아래 테스트가 그 오염이 통과한다는 사실을 일부러 고정한다.** 여기서 또 막으려
 * 들면 정상 후보가 다시 무너진다.
 */

/** 한 글자 씨앗은 무엇이든 문다. 애초에 어절로 치지 않는다. */
const MIN_SEED_TOKEN_LENGTH = 2;

/** 'OST' 와 'ost' 는 같은 말이다. 대소문자로 갈리면 정상 확장이 통째로 이탈로 죽는다. */
const normalize = (value: string): string => String(value || '').toLowerCase();

export function seedTokens(seed: string): string[] {
    return normalize(seed)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= MIN_SEED_TOKEN_LENGTH);
}

export function sharesSeedToken(keyword: string, seed: string): boolean {
    const tokens = seedTokens(seed);
    if (tokens.length === 0) return true;

    const compact = normalize(keyword).replace(/\s+/g, '');
    return tokens.some((token) => compact.includes(token));
}
