import { describe, expect, it } from 'vitest';
import {
    analyzeKeywordSignals,
    classifySearchIntent,
    judgeBriefingRisk,
    judgeRegulatoryRisk,
    sortWeight,
} from '../keyword-intent';

/** 사례는 전부 실주행에서 나온 실제 후보다. 지어낸 것이 없다. */

describe('classifySearchIntent', () => {
    it.each([
        '허리 통증 약국 약 추천',
        '가성비 노트북 비교',
        '강아지 사료 순위',
    ])('구매 검토로 본다: %s', (keyword) => {
        expect(classifySearchIntent(keyword).intent).toBe('commercial');
    });

    it.each([
        '한강 캠핑장 예약 방법',
        '제주도 2박3일 렌트카 비용',
        '연말정산 신청',
    ])('거래로 본다: %s', (keyword) => {
        const result = classifySearchIntent(keyword);
        expect(['transactional', 'commercial']).toContain(result.intent);
    });

    it.each([
        '베게 베개 뜻',
        '이비인후과 한자 뜻',
        '두피 대상포진 증상',
    ])('정보로 본다: %s', (keyword) => {
        expect(classifySearchIntent(keyword).intent).toBe('informational');
    });

    // 둘 다 걸리면 구매 검토가 이긴다. 비교를 원하는 사람이 글을 끝까지 읽는다.
    it('가격 비교는 거래가 아니라 구매 검토다', () => {
        expect(classifySearchIntent('공기청정기 가격 비교').intent).toBe('commercial');
    });

    // 신호가 없으면 단정하지 않는다. 정보형으로 반올림하면 멀쩡한 키워드가 강등된다.
    it('신호가 없으면 분류하지 않는다', () => {
        const result = classifySearchIntent('제주에어카텔2박3일');
        expect(result.intent).toBe('unknown');
        expect(result.matched).toEqual([]);
    });

    it('무엇에 걸렸는지 근거를 남긴다', () => {
        expect(classifySearchIntent('강아지 사료 추천').matched).toContain('추천');
    });
});

describe('judgeBriefingRisk — AI 브리핑 잠식', () => {
    // 이 테스트가 이 모듈을 만든 이유다. 실주행에서 뽑힌 후보였다.
    it.each(['베게 베개 뜻', '이비인후과 한자 뜻'])('정의형은 위험 높음: %s', (keyword) => {
        const result = judgeBriefingRisk(keyword);
        expect(result.risk).toBe('high');
        expect(result.reason).toContain('한 줄로 답하고');
    });

    it.each(['두피 대상포진 증상', '허리 통증 원인'])('나열형은 중간: %s', (keyword) => {
        expect(judgeBriefingRisk(keyword).risk).toBe('medium');
    });

    it.each([
        '한강 캠핑장 예약 방법',
        '제주도 2박3일 렌트카 비용',
        '힐스 췌장염 사료 후기',
    ])('값이 바뀌거나 경험이 필요하면 낮음: %s', (keyword) => {
        expect(judgeBriefingRisk(keyword).risk).toBe('low');
    });

    // 정의어가 섞여 있어도 경험형 신호가 있으면 AI 가 못 삼킨다.
    it('정의어와 경험어가 같이 있으면 낮음으로 본다', () => {
        expect(judgeBriefingRisk('마카롱 뜻과 내돈내산 후기').risk).toBe('low');
    });

    it('아무 신호 없으면 낮음이다 — 근거 없이 강등하지 않는다', () => {
        expect(judgeBriefingRisk('제주에어카텔2박3일').risk).toBe('low');
    });
});

describe('judgeRegulatoryRisk', () => {
    // 실주행 후보였다. 지역+병원은 CPC 는 높지만 의료광고 심의 대상이다.
    it('천안 허리 통증 병원 은 의료 위험이다', () => {
        const result = judgeRegulatoryRisk('천안 허리 통증 병원');
        expect(result.risk).toBe('medical');
        expect(result.matched).toContain('병원');
    });

    it('대출·보험은 금융 위험이다', () => {
        expect(judgeRegulatoryRisk('전세 대출 금리 비교').risk).toBe('financial');
    });

    it('일반 키워드는 위험 없음이다', () => {
        expect(judgeRegulatoryRisk('한강 캠핑장 예약 방법').risk).toBeNull();
    });

    /*
     * 한 글자 어휘가 다른 단어 속에 숨는 함정.
     * '약' 하나를 의료 어휘에 넣었더니 예약·계약·약속이 전부 의료로 잡혔다.
     * 한국어는 부분 문자열 매칭이라 반드시 두 글자 이상이어야 한다.
     */
    it.each(['한강 캠핑장 예약 방법', '전세 계약 갱신', '약속 장소 추천'])(
        '한 글자가 다른 단어에 숨어 오판하지 않는다: %s',
        (keyword) => {
            expect(judgeRegulatoryRisk(keyword).risk).not.toBe('medical');
        },
    );

    // 걸린다고 버리지 않는다. 쓸지는 사람이 정한다.
    it('위험이 있어도 무엇에 걸렸는지 알려준다', () => {
        expect(judgeRegulatoryRisk('치과 임플란트 비용').matched.length).toBeGreaterThan(0);
    });
});

describe('sortWeight — 내부 정렬만, 화면 비노출', () => {
    const weight = (keyword: string) => sortWeight(analyzeKeywordSignals(keyword));

    it('구매 검토가 정의형보다 앞선다', () => {
        expect(weight('강아지 사료 추천')).toBeLessThan(weight('베게 베개 뜻'));
    });

    it('같은 의도면 AI 위험이 낮은 쪽이 앞선다', () => {
        expect(weight('캠핑장 예약 방법')).toBeLessThan(weight('예방접종 증상 기준'));
    });
});

describe('analyzeKeywordSignals', () => {
    it('세 신호를 한 번에 돌려준다', () => {
        const signals = analyzeKeywordSignals('천안 허리 통증 병원 추천');
        expect(signals.intent.intent).toBe('commercial');
        expect(signals.regulatory.risk).toBe('medical');
        expect(signals.briefing.risk).toBe('low');
    });

    it('라벨에 추정 표현이 섞이지 않는다', () => {
        const signals = analyzeKeywordSignals('두피 대상포진 증상');
        for (const text of [signals.intent.intentLabel, signals.briefing.label, signals.briefing.reason]) {
            expect(text).not.toMatch(/점수|확률|예상 수익|예상 유입/);
        }
    });
});
