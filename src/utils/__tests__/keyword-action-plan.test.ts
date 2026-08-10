import { describe, expect, it } from 'vitest';
import { buildActionPlan, type ActionPlanInput } from '../keyword-action-plan';

function base(overrides: Partial<ActionPlanInput> = {}): ActionPlanInput {
    return {
        keyword: '한강 캠핑장 예약 방법',
        topic: '국내여행',
        tier: 'top3',
        openSlot: 1,
        searchVolume: 400,
        documentCount: 1689,
        ...overrides,
    };
}

describe('buildActionPlan — 왜', () => {
    it('1층이면 몇 번째 자리가 비었는지 적는다', () => {
        expect(buildActionPlan(base()).why[0]).toContain('상위 1번째 자리');
    });

    it('경합이면 자리가 아주 없지는 않다고 적는다', () => {
        expect(buildActionPlan(base({ tier: 'contested' })).why[0]).toContain('1건뿐');
    });

    it('실측 숫자를 그대로 싣는다', () => {
        expect(buildActionPlan(base()).why.join(' ')).toContain('월 검색량 400 · 문서수 1,689');
    });

    // 근거가 없으면 그 줄을 아예 안 쓴다. 빈칸을 추측으로 메우지 않는다.
    it('검색량이 없으면 그 줄을 쓰지 않는다', () => {
        const plan = buildActionPlan(base({ searchVolume: null, documentCount: null }));
        expect(plan.why.join(' ')).not.toContain('검색량');
    });

    it('상위 문서가 낡았을 때만 그 사실을 적는다', () => {
        expect(buildActionPlan(base({ medianDaysAgo: 84 })).why.join(' ')).toContain('84일 전');
        expect(buildActionPlan(base({ medianDaysAgo: 3 })).why.join(' ')).not.toContain('일 전');
    });
});

describe('buildActionPlan — 어떻게', () => {
    it('제목 지침은 항상 있고 키워드를 그대로 넣는다', () => {
        expect(buildActionPlan(base()).how[0]).toContain('"한강 캠핑장 예약 방법"');
    });

    it('구매 검토형은 단점까지 넣으라고 한다', () => {
        expect(buildActionPlan(base({ intentLabel: '구매 검토' })).how.join(' ')).toContain('단점');
    });

    it('거래형은 절차를 번호로 적으라고 한다', () => {
        expect(buildActionPlan(base({ intentLabel: '거래' })).how.join(' ')).toContain('번호 순서');
    });

    it('정보형은 첫 문단에 답을 쓰라고 한다', () => {
        expect(buildActionPlan(base({ intentLabel: '정보' })).how.join(' ')).toContain('첫 문단');
    });

    it('실제로 뜬 경쟁 구획에만 대응을 준다', () => {
        const plan = buildActionPlan(base({ sections: ['지식iN', '쇼핑'] }));
        const text = plan.how.join(' ');
        expect(text).toContain('지식iN');
        expect(text).toContain('쇼핑');
        expect(text).not.toContain('카페');
    });

    it('모르는 구획 이름은 조용히 무시한다', () => {
        expect(() => buildActionPlan(base({ sections: ['처음보는구획'] }))).not.toThrow();
    });
});

describe('buildActionPlan — 조심', () => {
    it('AI 잠식 위험을 경고한다', () => {
        expect(buildActionPlan(base({ briefingRisk: 'high' })).caution.join(' ')).toContain('클릭이 안 올 수');
    });

    it('규제 라벨을 그대로 전한다', () => {
        const plan = buildActionPlan(base({ regulatoryLabel: '의료광고 심의 대상' }));
        expect(plan.caution.join(' ')).toContain('의료광고 심의 대상');
    });

    it('하락세면 수요가 빠질 수 있다고 알린다', () => {
        expect(buildActionPlan(base({ trendLabel: '하락세' })).caution.join(' ')).toContain('수요가 계속 빠질');
    });

    it('위험이 없으면 경고를 만들지 않는다', () => {
        expect(buildActionPlan(base()).caution).toEqual([]);
    });
});

describe('buildActionPlan — 언제', () => {
    it('시즌성 착수 시점을 그대로 쓴다', () => {
        const plan = buildActionPlan(base({ timing: '성수기까지 약 2개월 — 지금이 쓸 때입니다' }));
        expect(plan.when).toContain('지금이 쓸 때');
    });

    it('에버그린은 서두를 것 없다고 말한다', () => {
        expect(buildActionPlan(base({ trendLabel: '에버그린' })).when).toContain('1년 내내');
    });

    // 근거 없이 "지금 쓰세요"라고 말하지 않는다.
    it('근거가 없으면 아무 말도 하지 않는다', () => {
        expect(buildActionPlan(base()).when).toBe('');
    });
});

describe('추정 표현 금지', () => {
    it('어떤 문장에도 예상·확률·점수가 없다', () => {
        const plan = buildActionPlan(base({
            intentLabel: '구매 검토',
            briefingRisk: 'high',
            regulatoryLabel: '의료광고 심의 대상',
            trendLabel: '시즌성',
            timing: '성수기까지 약 2개월 — 지금이 쓸 때입니다',
            sections: ['인플루언서', '지식iN', '카페', '쇼핑', '파워링크'],
            medianDaysAgo: 84,
        }));
        const all = [...plan.why, ...plan.how, ...plan.caution, plan.when].join(' ');
        expect(all).not.toMatch(/예상 유입|예상 수익|성공 확률|점수|보장|1위 가능/);
    });
});
