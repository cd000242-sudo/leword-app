import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DEMAND_SHAPE_THRESHOLDS,
    classifyDemandShape,
    fetchMonthlyDemand,
    fetchMonthlyDemandPoints,
    readDemandRecency,
} from '../keyword-demand-shape';

describe('classifyDemandShape', () => {
    it('12개월 내내 고르면 에버그린이다', () => {
        const result = classifyDemandShape([88, 92, 85, 90, 95, 87, 91, 89, 93, 86, 90, 88]);
        expect(result.shape).toBe('evergreen');
        expect(result.evidence).toContain('고름');
    });

    // 실측 사례: '강아지 사료 급여량' 12개월 — 완만한 하락
    it('최근이 1년 전보다 크게 낮으면 하락세다', () => {
        const result = classifyDemandShape([100, 88, 89, 92, 93, 88, 75, 82, 61, 65, 57, 56]);
        expect(result.shape).toBe('declining');
    });

    it('최근 3개월이 크게 뛰면 상승세다', () => {
        const result = classifyDemandShape([20, 18, 22, 25, 24, 28, 30, 35, 40, 70, 85, 95]);
        expect(result.shape).toBe('rising');
        expect(result.evidence).toContain('배');
    });

    it('가운데 특정 달만 솟으면 시즌성이다', () => {
        const result = classifyDemandShape([10, 12, 15, 40, 100, 95, 45, 14, 11, 13, 12, 10]);
        expect(result.shape).toBe('seasonal');
        expect(result.peakIndex).toBe(5);
        expect(result.evidence).toContain('5번째 달');
    });

    /*
     * 시즌성만 알려주면 "언제 써야 하는가"를 모른다.
     * 상위노출까지 몇 달이 걸리므로 성수기 2~3개월 전이 착수 시점이다(리서치 §6).
     */
    it('성수기까지 남은 개월과 착수 시점을 알려준다', () => {
        // 12개월 중 5번째가 최고 → 7개월 지남 → 다음 성수기까지 5개월
        const result = classifyDemandShape([10, 12, 15, 40, 100, 95, 45, 14, 11, 13, 12, 10]);
        expect(result.monthsToPeak).toBe(5);
        expect(result.timing).toContain('5개월');
        expect(result.timing).toContain('2~3개월 뒤');
    });

    /*
     * 24개월을 받는 이유가 이것이다.
     * 12개월 창에서는 최고월이 앞쪽이면 추세가 급락으로 보여 하락세로 먼저
     * 잡히고, "성수기 임박" 판정이 구조적으로 불가능했다.
     * 24개월이면 같은 달을 두 번 보므로 달력 기준으로 셀 수 있다.
     */
    it('24개월에서 성수기가 2개월 남으면 지금이 쓸 때라고 말한다', () => {
        // 0-based 13번 = 14번째 칸 → 24-14=10개월 지남 → 남은 2개월
        const series = Array.from({ length: 24 }, (_, i) => (i === 13 ? 100 : 12));
        const result = classifyDemandShape(series);
        expect(result.shape).toBe('seasonal');
        expect(result.monthsToPeak).toBe(2);
        expect(result.timing).toContain('지금이 쓸 때');
    });

    it('24개월에서 성수기가 멀면 아직 이르다고 말한다', () => {
        // 0-based 18번 = 19번째 칸 → 24-19=5개월 지남 → 남은 7개월
        const series = Array.from({ length: 24 }, (_, i) => (i === 18 ? 100 : 12));
        const result = classifyDemandShape(series);
        expect(result.shape).toBe('seasonal');
        expect(result.monthsToPeak).toBe(7);
        expect(result.timing).toContain('아직 이릅니다');
    });

    it('시즌성이 아니면 타이밍을 말하지 않는다', () => {
        const evergreen = classifyDemandShape([88, 92, 85, 90, 95, 87, 91, 89, 93, 86, 90, 88]);
        expect(evergreen.monthsToPeak).toBeNull();
        expect(evergreen.timing).toBe('');
    });

    it('타이밍 문장에 추정 표현이 없다', () => {
        const result = classifyDemandShape([10, 12, 15, 40, 100, 95, 45, 14, 11, 13, 12, 10]);
        expect(result.timing).not.toMatch(/확률|예상 유입|예상 수익|점수/);
    });

    // 최고월이 끝이면 "몰린 것"이 아니라 "오르는 중"이다. 둘을 섞으면
    // 내년에도 이맘때 뜬다는 뜻으로 잘못 읽힌다.
    it('최고월이 마지막 달이면 시즌성이 아니라 상승세로 본다', () => {
        const result = classifyDemandShape([10, 12, 11, 13, 12, 14, 13, 15, 16, 20, 45, 100]);
        expect(result.shape).toBe('rising');
    });

    it('규칙적이지도 추세도 없으면 들쭉날쭉이다', () => {
        const result = classifyDemandShape([50, 10, 70, 15, 60, 20, 55, 25, 65, 30, 58, 45]);
        expect(result.shape).toBe('volatile');
    });

    // 여기가 이 모듈을 새로 만든 이유다. 30일 일별로는 저볼륨 키워드가
    // 1~3포인트뿐이라 전부 판정불가가 됐다.
    it('자료가 모자라면 모양을 지어내지 않고 판정불가다', () => {
        const result = classifyDemandShape([100, 60, 50]);
        expect(result.shape).toBe('unknown');
        expect(result.evidence).toContain('3개');
        expect(result.evidence).toContain('12개 필요');
    });

    it('빈 배열도 판정불가다', () => {
        expect(classifyDemandShape([]).shape).toBe('unknown');
    });

    it('임계값을 인자로 낮추면 판정이 따라 바뀐다', () => {
        const series = [10, 12, 11, 13, 12, 14, 13, 40, 12, 13, 12, 10];
        expect(classifyDemandShape(series).shape).toBe('seasonal');
        expect(classifyDemandShape(series, { ...DEFAULT_DEMAND_SHAPE_THRESHOLDS, seasonalPeakRatio: 99 }).shape)
            .toBe('volatile');
    });

    it('근거 문장에 추정 표현이 섞이지 않는다', () => {
        for (const series of [[88, 92, 85, 90, 95, 87, 91, 89, 93, 86, 90, 88], [10, 12, 15, 40, 100, 95, 45, 14, 11, 13, 12, 10]]) {
            expect(classifyDemandShape(series).evidence).not.toMatch(/점수|확률|예상|추정|가능성/);
        }
    });
});

describe('fetchMonthlyDemand', () => {
    const config = { clientId: 'id', clientSecret: 'secret' };

    it('월별 비율만 뽑아 온다', async () => {
        const fake = (async () => ({
            ok: true,
            json: async () => ({ results: [{ data: [{ ratio: 12.5 }, { ratio: 40 }, { ratio: 100 }] }] }),
        })) as unknown as typeof fetch;
        expect(await fetchMonthlyDemand('테스트', config, fake)).toEqual([12.5, 40, 100]);
    });

    it('timeUnit 을 month 로 요청한다 — date 로는 저볼륨이 안 잡힌다', async () => {
        let sentBody = '';
        const fake = (async (_url: string, init: RequestInit) => {
            sentBody = String(init.body);
            return { ok: true, json: async () => ({ results: [] }) };
        }) as unknown as typeof fetch;
        await fetchMonthlyDemand('테스트', config, fake);
        expect(JSON.parse(sentBody).timeUnit).toBe('month');
    });

    it('실패하면 빈 배열이다 — 조용히 가짜 시계열을 만들지 않는다', async () => {
        const fake = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        expect(await fetchMonthlyDemand('테스트', config, fake)).toEqual([]);
    });

    it('예외가 나도 빈 배열이다', async () => {
        const fake = (async () => { throw new Error('네트워크'); }) as unknown as typeof fetch;
        expect(await fetchMonthlyDemand('테스트', config, fake)).toEqual([]);
    });
});

/**
 * 실측 시계열 고정 — 2026-08-11 데이터랩 24개월 월별 실측값이다. 지어낸 수열이 아니다.
 *
 * 왜 이걸 고정하나: 이 판정이 라벨로만 쓰이고 게이트에서 안 걸러지던 동안,
 * 통과한 26건 중 7건이 이미 식은 키워드였다. 검색량 한 숫자로는 방향이 안 보인다
 * ('브롤 스타즈 서버 점검 시간'은 월 120이지만 한 번 터지고 끝난 서버 장애였다).
 * 이 수열들이 declining 으로 안 나오면 죽은 키워드가 다시 보드로 나간다.
 */
describe('classifyDemandShape — 실측 시계열', () => {
    it('한 번 터지고 끝난 것은 하락으로 본다', () => {
        // 서버 장애 한 번(100)에 스파이크, 그 앞뒤는 1~11.
        const 브롤스타즈서버점검 = [2, 9, 3, 3, 2, 2, 3, 1, 4, 11, 1, 1, 1, 4, 2, 1, 5, 1, 100, 16, 24, 4, 2, 2, 4];
        expect(classifyDemandShape(브롤스타즈서버점검).shape).toBe('declining');
    });

    it('정점이 2년 전이면 하락으로 본다', () => {
        const 냥코계정복구 = [100, 46, 28, 16, 16, 12, 19, 22, 19, 19, 6, 10, 20, 9, 5, 3, 2, 1, 4, 23, 13, 12, 2, 2, 28, 5];
        expect(classifyDemandShape(냥코계정복구).shape).toBe('declining');
    });

    it('1년에 걸쳐 완만히 무너지는 것도 하락으로 본다', () => {
        // 편차만 보면 고르게 보이는 수열이다. 에버그린으로 새면 "한 번 쓰면 1년 간다"가 된다.
        const 라미샤프 = [48, 46, 49, 47, 56, 95, 98, 88, 60, 57, 45, 44, 41, 40, 45, 39, 52, 100, 88, 77, 51, 45, 39, 40, 34, 8];
        expect(classifyDemandShape(라미샤프).shape).toBe('declining');
    });

    it('지금이 정점이면 상승으로 본다', () => {
        const 광교아이맥스명당 = [1, 3, 1, 2, 4, 1, 1, 16, 16, 22, 78, 42, 6, 9, 85, 26, 2, 46, 44, 3, 1, 49, 100];
        expect(classifyDemandShape(광교아이맥스명당).shape).toBe('rising');
    });

    it('점이 모자라면 모른다고 한다 — 지어내지 않는다', () => {
        // 저볼륨은 데이터랩이 검색 없는 달을 통째로 빼서 11개만 온다.
        const 속초해수욕장개장일 = [5, 4, 1, 14, 8, 1, 3, 18, 100, 89, 15];
        expect(classifyDemandShape(속초해수욕장개장일).shape).toBe('unknown');
    });
});

/**
 * 시점 표기 — "이 숫자가 언제쩍 결과인지".
 *
 * 사장님 지적: "황금키워드지만 현재 실측량은 얼마인지 모르니까."
 * 검색량은 지난 한 달의 총합이라, 정점이 1년 전인 키워드와 지금이 정점인
 * 키워드가 화면에서 똑같은 숫자로 보인다. 실측 시계열의 마지막 달과
 * 정점 대비 비율은 단순 나눗셈이라 화면에 그대로 쓸 수 있다.
 */
describe('readDemandRecency', () => {
    it('지금이 정점이면 그렇게 말한다', () => {
        // 광교 아이맥스 명당 실측 — 마지막 달이 100.
        const points = [
            { period: '2026-06-01', ratio: 1 },
            { period: '2026-07-01', ratio: 49 },
            { period: '2026-08-01', ratio: 100 },
        ];
        const out = readDemandRecency(points);
        expect(out.asOf).toBe('2026-08');
        expect(out.latestVsPeakPct).toBe(100);
        expect(out.monthsSincePeak).toBe(0);
        expect(out.summary).toContain('지금이 최고치');
    });

    it('정점이 지났으면 지금이 몇 %인지 말한다', () => {
        // 라미 샤프 실측 꼬리 — 100 에서 8 까지 내려왔다.
        const points = [
            { period: '2026-06-01', ratio: 100 },
            { period: '2026-07-01', ratio: 34 },
            { period: '2026-08-01', ratio: 8 },
        ];
        const out = readDemandRecency(points);
        expect(out.latestVsPeakPct).toBe(8);
        expect(out.monthsSincePeak).toBe(2);
        expect(out.summary).toContain('최고치의 8%');
        expect(out.summary).toContain('2개월 전');
    });

    it('시계열이 없으면 모른다고 한다 — 지어내지 않는다', () => {
        const out = readDemandRecency([]);
        expect(out.asOf).toBeNull();
        expect(out.latestVsPeakPct).toBeNull();
        expect(out.summary).toContain('재지 못했습니다');
    });
});

describe('fetchMonthlyDemandPoints', () => {
    const config = { clientId: 'id', clientSecret: 'secret' };

    it('기간을 함께 돌려준다 — 비율만 오면 언제쩍인지 알 수 없다', async () => {
        const fake = (async () => ({
            ok: true,
            json: async () => ({ results: [{ data: [{ period: '2026-07-01', ratio: 40 }, { period: '2026-08-01', ratio: 100 }] }] }),
        })) as unknown as typeof fetch;
        expect(await fetchMonthlyDemandPoints('테스트', config, fake)).toEqual([
            { period: '2026-07-01', ratio: 40 },
            { period: '2026-08-01', ratio: 100 },
        ]);
    });

    it('실패하면 빈 배열이다', async () => {
        const fake = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        expect(await fetchMonthlyDemandPoints('테스트', config, fake)).toEqual([]);
    });
});
