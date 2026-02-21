/**
 * 키워드의 검색 의도(Intent)를 분류하고 적절한 배지를 반환합니다.
 */
export function classifyKeywordIntent(keyword: string): { intent: string; badge: string } {
    const kw = keyword.toLowerCase().replace(/\s+/g, '');

    // 1. Commercial (구매/상업성) - 💰
    if (kw.match(/가격|비용|얼마|최저가|할인|쿠폰|구매|구입|파는곳|매장|쇼핑|정가|공구|직구|싸게|장터/)) {
        return { intent: 'Commercial', badge: '💰' };
    }

    // 2. Transactional (행동/변환) - ⚡
    if (kw.match(/추천|순위|베스트|top|비교|장단점|차이|예약|신청|결제|로그인|다운로드|설치|실행|사용법|방법/)) {
        return { intent: 'Transactional', badge: '⚡' };
    }

    // 3. Informational (정보/지식) - ℹ️
    if (kw.match(/이유|의미|뜻|유래|배경|전말|정리|요약|총정리|소식|뉴스|기사|결과|날씨|일사|시간|일정|효능|성분|주의사항/)) {
        return { intent: 'Informational', badge: 'ℹ️' };
    }

    // 4. Navigational (이동/브랜드) - 📍
    if (kw.match(/공홈|공식홈페이지|인스타그램|유튜브|블로그|카페|커뮤니티|위치|주소|지도|가는법/)) {
        return { intent: 'Navigational', badge: '📍' };
    }

    // 기본값 (정보성으로 간주)
    return { intent: 'Informational', badge: 'ℹ️' };
}
