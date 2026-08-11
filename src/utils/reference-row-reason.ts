/**
 * 2군(참고용) 행에 붙일 **이유 문장**을 만든다.
 *
 * 사장님 지시: "조금 미달되더라도 그 키워드를 사용할 수 있다면, 참고할 수 있다면
 * 상관없다. 좋은 것만 가져오려고 브라이트데이터에 돈을 많이 쓰면 오래 걸리고 낭비다."
 *
 * 그래서 버리지 않고 내보내되, 왜 1군이 아닌지는 밝힌다. 규칙 하나만 지킨다 —
 * **실측 사실만 쓰고 임계값은 안 쓴다.**
 *
 *   쓸 것:   "상위 10개 중 8개가 이미 정면으로 다뤘습니다"     ← 검색결과에서 센 값
 *   안 쓸 것: "비율 0.28 로 하한 1.0 미달"                   ← 우리 내부 숫자
 *
 * 임계값이 화면에 나가면 우리 판단 근거가 통째로 공개되고, 게이트를 바꿀 때마다
 * 화면 문구가 흔들린다. 실측 사실은 게이트가 바뀌어도 그대로다.
 */

export interface ReferenceRowInput {
    /** 판정 자체가 불가했는가(자료 부족). 탈락과 구분해서 말해야 한다. */
    undetermined?: boolean;
    searchVolume?: number | null;
    documentCount?: number | null;
    serp?: {
        sampledTitles?: number;
        exactTitleHits?: number;
        partialTitleHits?: number;
    } | null;
}

/**
 * 화면에 그대로 쓸 한 문장. 만들 수 없으면 빈 문자열이다 —
 * 근거 없는 문장을 지어내느니 아무 말도 안 하는 편이 낫다.
 */
export function referenceRowReason(input: ReferenceRowInput): string {
    const serp = input.serp || null;
    const sampled = Number(serp?.sampledTitles ?? 0);
    const exact = Number(serp?.exactTitleHits ?? 0);
    const partial = Number(serp?.partialTitleHits ?? 0);

    // 검색결과를 읽었으면 그게 가장 구체적인 사실이다.
    if (sampled > 0) {
        if (exact >= 1) {
            return `상위 ${sampled}개 중 ${exact}개가 이미 정면으로 다뤘습니다`;
        }
        if (partial >= 1) {
            return `상위 ${sampled}개 중 ${partial}개가 비슷한 내용을 다뤘습니다`;
        }
    }

    if (input.documentCount === 0) {
        return '블로그 문서 수를 재지 못했습니다';
    }

    if (Number.isFinite(Number(input.searchVolume)) && Number(input.searchVolume) > 0) {
        const volume = Number(input.searchVolume).toLocaleString('ko-KR');
        if (input.undetermined) {
            return `월 검색량 ${volume}회 — 검색결과를 충분히 읽지 못해 자리를 확인하지 못했습니다`;
        }
        return `월 검색량 ${volume}회`;
    }

    if (input.undetermined) return '자료가 모자라 자리를 확인하지 못했습니다';
    return '';
}
