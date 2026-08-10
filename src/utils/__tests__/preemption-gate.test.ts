import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PREEMPTION_THRESHOLDS,
    findOpenSlot,
    judgePreemption,
    selectWithFill,
    type PreemptionInput,
} from '../preemption-gate';

const NOW = Date.parse('2026-08-10T00:00:00Z');
// 어절 3개짜리로 잡는다. 2어절이면 커버리지가 0 / 0.5 / 1.0 뿐이라
// 부분 점유(0.6~1.0 미만)라는 실제 상황을 재현할 수 없다.
const KEYWORD = '주휴수당 자동 계산기';

/**
 * 자리를 차지한 제목 / 비켜 있는 제목.
 * 점유 판정은 부분 일치(0.6) 기준이므로, 어절 하나만 담아도 '반쯤 찬 자리'가 된다.
 */
const COVERING = '주휴수당 자동 계산기 사용법';   // 3/3 = 1.0  → 정면 대응, 자리 참
const PARTIAL = '주휴수당 자동 지급 기준';         // 2/3 = 0.67 → 반쯤 담음, 자리 참
const OTHER = '아르바이트 급여 명세서 쓰는 법';    // 0/3 = 0    → 빈자리

/** 1층(top3)에 들어가는 기준 입력. 각 테스트는 여기서 하나만 무너뜨린다. */
function base(overrides: Partial<PreemptionInput> = {}): PreemptionInput {
    return {
        keyword: KEYWORD,
        searchVolume: 900,
        documentCount: 120,
        serp: serpOf([OTHER, OTHER, OTHER, OTHER, OTHER], { partialTitleHits: 1 }),
        firstSeenAt: new Date(NOW - 8 * 3600000).toISOString(),
        inRealtimeNow: false,
        nowMs: NOW,
        ...overrides,
    };
}

const serpOf = (topTitles: string[], over: Partial<{ exactTitleHits: number; partialTitleHits: number }> = {}) => ({
    sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 0, medianDaysAgo: 84, topTitles, ...over,
});

describe('findOpenSlot — 상위 몇 번째 자리가 비었나', () => {
    it('1위부터 아무도 안 다뤘으면 1위 자리가 빈 것이다', () => {
        expect(findOpenSlot(serpOf([OTHER, OTHER]), KEYWORD)).toBe(1);
    });

    it('1·2위가 차 있으면 3위가 첫 빈자리다', () => {
        expect(findOpenSlot(serpOf([COVERING, COVERING, OTHER]), KEYWORD)).toBe(3);
    });

    // 정면 대응이 0건이어도 반쯤 담은 글은 자리를 차지한다. 이걸 빈자리로 세면
    // 모든 키워드의 빈자리가 1위가 되어 '상위에 자리' 구분이 무의미해진다.
    it('반쯤 담은 글도 자리를 차지한 것으로 센다', () => {
        expect(findOpenSlot(serpOf([PARTIAL, PARTIAL, OTHER]), KEYWORD)).toBe(3);
    });

    it('훑은 자리가 전부 차 있으면 null 이다 — 그 아래는 안 봤으므로', () => {
        expect(findOpenSlot(serpOf([COVERING, COVERING]), KEYWORD)).toBeNull();
    });

    // 셀 수 없으면 0이나 1로 때우면 안 된다. 그러면 없는 자리를 있다고 말하게 된다.
    it('제목 목록이 없으면 세지 않고 null 이다', () => {
        expect(findOpenSlot({ sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 0, medianDaysAgo: 1 }, KEYWORD)).toBeNull();
    });
});

describe('judgePreemption — 층 판정', () => {
    it('상위 3위권이 비고 근거가 다 있으면 1층이다', () => {
        const result = judgePreemption(base());
        expect(result.tier).toBe('top3');
        expect(result.openSlot).toBe(1);
        expect(result.passed).toBe(true);
    });

    it('빈자리가 4위면 1층이 아니라 2층으로 내려간다', () => {
        const result = judgePreemption(base({
            // 앞 3자리를 '반쯤 담은 글'이 차지하고 4번째가 첫 빈자리 — 정면 대응은 0건이다
            serp: serpOf([PARTIAL, PARTIAL, PARTIAL, OTHER, OTHER], { partialTitleHits: 3 }),
        }));
        expect(result.openSlot).toBe(4);
        expect(result.tier).toBe('page1');
    });

    // 상위 문서 나이·신선도는 층을 가르지 않는다(실주행 0/15 통과 후 뺐다).
    // 근거 줄로만 남는다.
    it('상위 문서가 최근이어도 자리가 비었으면 1층이다', () => {
        const result = judgePreemption(base({
            firstSeenAt: new Date(NOW - 40 * 24 * 3600000).toISOString(),
            serp: { ...serpOf([OTHER], { partialTitleHits: 1 }), medianDaysAgo: 3 },
        }));
        expect(result.tier).toBe('top3');
        expect(result.evidence.some((e) => e.code === 'stale-top')).toBe(false);
        expect(result.evidence.some((e) => e.code === 'fresh')).toBe(false);
    });

    it('실시간에 노출 중이면 3층으로 내려간다', () => {
        const result = judgePreemption(base({ inRealtimeNow: true }));
        expect(result.tier).toBe('page1-weak');
        expect(result.passed).toBe(true);
    });

    it('이미 실시간에 뜬 것은 1층에서 밀려난다', () => {
        expect(judgePreemption(base({ inRealtimeNow: true })).tier).toBe('page1-weak');
    });

    it('정면 대응 1건이면 마지막 층이고 경합이라고 적는다', () => {
        const result = judgePreemption(base({
            serp: serpOf([OTHER, COVERING], { exactTitleHits: 1, partialTitleHits: 2 }),
        }));
        expect(result.tier).toBe('contested');
        expect(result.evidence.some((e) => e.code === 'contested')).toBe(true);
    });

    // 여기가 핵심 불변조건이다. 개수를 채우려고 자리 없는 것을 끼우면 안 된다.
    it('정면 대응 2건 이상이면 어떤 층에도 못 들어간다', () => {
        const result = judgePreemption(base({
            serp: serpOf([COVERING, COVERING], { exactTitleHits: 2, partialTitleHits: 3 }),
        }));
        expect(result.passed).toBe(false);
        expect(result.tier).toBeNull();
        expect(result.failed.join(' ')).toContain('자리 없음');
    });

    it('검색량이 기준 미만이면 어떤 층에도 못 들어간다', () => {
        expect(judgePreemption(base({ searchVolume: 50 })).passed).toBe(false);
    });

    it('SERP 표본이 부족하면 판정불가다 — 통과도 탈락도 아니다', () => {
        const result = judgePreemption(base({
            serp: { ...serpOf([OTHER]), sampledTitles: 2 },
        }));
        expect(result.undetermined).toBe(true);
        expect(result.passed).toBe(false);
        expect(result.evidence).toEqual([]);
    });

    it('검색량 미측정도 판정불가다', () => {
        expect(judgePreemption(base({ searchVolume: null })).undetermined).toBe(true);
    });

    it('근거 문장에 추정 표현이 섞이지 않는다', () => {
        for (const item of judgePreemption(base()).evidence) {
            expect(item.text).not.toMatch(/점수|확률|예상|추정|가능성/);
        }
    });
});

describe('AI 브리핑 실측 반영', () => {
    /*
     * 실측(2026-08-10, Bright Data 3건):
     *   '바리깡 어원'(정의형)          → AI 브리핑 있음, 4개 글 인용
     *   '멜라토닌 복용량'(정보형)       → 있음, 2개 인용
     *   '고양이 자동화장실 렌탈'(상거래) → 없음
     */
    it('AI 브리핑이 떠 있으면 1층에서 내려간다', () => {
        const withAi = judgePreemption(base({
            serp: { ...serpOf([OTHER, OTHER]), hasAiBriefing: true, aiBriefingSourceCount: 4 },
        }));
        expect(withAi.tier).toBe('page1-weak');
        expect(withAi.failed).toContain('AI 브리핑이 답을 대신한다');
    });

    it('AI 브리핑이 없으면 1층 그대로다', () => {
        const noAi = judgePreemption(base({
            serp: { ...serpOf([OTHER, OTHER]), hasAiBriefing: false },
        }));
        expect(noAi.tier).toBe('top3');
    });

    // 안 본 것과 없는 것을 섞으면 안 된다. undefined 는 강등하지 않는다.
    it('측정하지 않았으면 강등하지 않는다', () => {
        expect(judgePreemption(base()).tier).toBe('top3');
    });

    it('인용 건수를 근거에 남긴다', () => {
        const result = judgePreemption(base({
            serp: { ...serpOf([OTHER, OTHER]), hasAiBriefing: true, aiBriefingSourceCount: 4 },
        }));
        expect(result.evidence.find((e) => e.code === 'ai-briefing')?.text).toContain('4개 글을 인용');
    });

    it('없을 때도 사실로 적는다', () => {
        const result = judgePreemption(base({
            serp: { ...serpOf([OTHER, OTHER]), hasAiBriefing: false },
        }));
        expect(result.evidence.find((e) => e.code === 'ai-briefing')?.text).toContain('클릭이 글로 온다');
    });
});

describe('selectWithFill — 껍질 까기', () => {
    /** n개의 1층짜리 입력. */
    const topTier = (n: number) => Array.from({ length: n }, (_, i) => base({ keyword: `1층${i}` }));
    /** n개의 3층짜리 입력(이미 실시간에 노출 중). */
    const weakTier = (n: number) => Array.from({ length: n }, (_, i) => base({
        keyword: `3층${i}`,
        inRealtimeNow: true,
    }));

    it('1층만으로 충분하면 아래 층은 열지 않는다', () => {
        const outcome = selectWithFill([...topTier(8), ...weakTier(5)], { target: 5 });
        expect(outcome.rows).toHaveLength(5);
        expect(outcome.rows.every((r) => r.tier === 'top3')).toBe(true);
        expect(outcome.deepestTier).toBe('top3');
        expect(outcome.short).toBe(false);
    });

    // 이 테스트가 이번 변경의 이유다. 예전 게이트는 여기서 0건을 냈다.
    it('1층이 모자라면 아래 층을 까서 개수를 채운다', () => {
        const outcome = selectWithFill([...topTier(2), ...weakTier(6)], { target: 5 });
        expect(outcome.rows).toHaveLength(5);
        expect(outcome.rows.filter((r) => r.tier === 'top3')).toHaveLength(2);
        expect(outcome.rows.filter((r) => r.tier === 'page1-weak')).toHaveLength(3);
        expect(outcome.deepestTier).toBe('page1-weak');
    });

    it('확실한 층이 항상 먼저 나온다', () => {
        const outcome = selectWithFill([...weakTier(4), ...topTier(3)], { target: 7 });
        expect(outcome.rows.slice(0, 3).every((r) => r.tier === 'top3')).toBe(true);
    });

    it('같은 층에서는 빈자리가 위인 것이 먼저다', () => {
        const outcome = selectWithFill([
            base({ serp: serpOf([PARTIAL, PARTIAL, OTHER], { partialTitleHits: 2 }) }),
            base({ serp: serpOf([OTHER, OTHER], { partialTitleHits: 0 }) }),
        ], { target: 2 });
        expect(outcome.rows.map((r) => r.openSlot)).toEqual([1, 3]);
    });

    it('전부 까도 모자라면 억지로 채우지 않고 short 로 알린다', () => {
        const outcome = selectWithFill(topTier(2), { target: 8 });
        expect(outcome.rows).toHaveLength(2);
        expect(outcome.short).toBe(true);
    });

    it('자리 없는 키워드는 개수가 모자라도 절대 안 들어온다', () => {
        const noRoom = Array.from({ length: 10 }, (_, i) => base({
            keyword: `자리없음${i}`,
            serp: serpOf([COVERING], { exactTitleHits: 3, partialTitleHits: 4 }),
        }));
        const outcome = selectWithFill([...topTier(1), ...noRoom], { target: 6 });
        expect(outcome.rows).toHaveLength(1);
        expect(outcome.short).toBe(true);
        expect(outcome.rejected).toHaveLength(10);
    });

    it('층별 건수를 세어 몇 층까지 깠는지 알려준다', () => {
        const outcome = selectWithFill([...topTier(2), ...weakTier(3)], { target: 4 });
        expect(outcome.byTier.top3).toBe(2);
        expect(outcome.byTier['page1-weak']).toBe(3);
    });

    it('상위 범위를 넓히면 더 많은 후보가 1층으로 올라온다', () => {
        // 빈자리가 4위 → 기본(3위까지)에서는 2층, 5위까지 보면 1층
        const inputs = Array.from({ length: 3 }, () => base({
            serp: serpOf([PARTIAL, PARTIAL, PARTIAL, OTHER], { partialTitleHits: 3 }),
        }));
        expect(selectWithFill(inputs, { target: 3 }).byTier.top3).toBe(0);
        expect(selectWithFill(inputs, { target: 3 }).byTier.page1).toBe(3);
        const wider = selectWithFill(inputs, {
            target: 3,
            thresholds: { ...DEFAULT_PREEMPTION_THRESHOLDS, topSlots: 5 },
        });
        expect(wider.byTier.top3).toBe(3);
    });
});
