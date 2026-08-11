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

    /*
     * base 는 검색량 900 / 문서수 120 — **황금 비율**이라 새 정책(2026-08-12,
     * "검색량 > 문서수는 다 통과")에서는 경쟁이 있어도 통과한다. 차단을 검증하는
     * 테스트는 문서수를 검색량 위로 올려 황금 비율을 벗긴다.
     */
    it('정면 대응 1건이면 마지막 층이고 경합이라고 적는다', () => {
        const result = judgePreemption(base({
            documentCount: 2000,
            serp: serpOf([OTHER, COVERING], { exactTitleHits: 1, partialTitleHits: 2 }),
        }));
        expect(result.tier).toBe('contested');
        expect(result.evidence.some((e) => e.code === 'contested')).toBe(true);
    });

    // 핵심 불변조건 — 단, 황금 비율은 예외다(별도 테스트).
    it('황금 비율이 아니면 정면 대응 2건 이상은 어떤 층에도 못 들어간다', () => {
        const result = judgePreemption(base({
            documentCount: 2000,
            serp: serpOf([COVERING, COVERING], { exactTitleHits: 2, partialTitleHits: 3 }),
        }));
        expect(result.passed).toBe(false);
        expect(result.tier).toBeNull();
        expect(result.failed.join(' ')).toContain('자리 없음');
    });

    // 사장님 최종 기준: "검색량이 문서수보다 높은 키워드들이야, 다 통과시켜서 보여줘."
    it('황금 비율이면 정면 대응이 몇 건이어도 통과한다', () => {
        const result = judgePreemption(base({
            searchVolume: 940, documentCount: 20,
            serp: serpOf([COVERING, COVERING], { exactTitleHits: 3, partialTitleHits: 3 }),
        }));
        expect(result.passed).toBe(true);
        expect(result.tier).toBe('golden-ratio');
        expect(result.evidence.some((e) => e.code === 'golden-ratio')).toBe(true);
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

/*
 * 사장님 기준(2026-08-11): "상위에 광고가 많이 떠 있다면 그 키워드는 돈이 되는
 * 키워드다 — 광고주가 많으니까. 광고 많고 검색량 높고 문서수 낮은 것을 위에."
 * 광고 건수는 실측이다(파워링크 항목 수). 실측 대조: 치아보험 10 · 오퍼레이터24 1.
 */
describe('줄 세우기 — 광고 많고 · 검색량 높고 · 문서수 낮은 순', () => {
    const row = (keyword: string, over: Partial<PreemptionInput> & { adCount?: number }) => {
        const { adCount, ...rest } = over;
        return base({
            keyword,
            serp: { ...serpOf([OTHER, OTHER]), ...(adCount === undefined ? {} : { adCount }) },
            ...rest,
        });
    };

    it('광고가 많은 것이 먼저 나온다', () => {
        const out = selectWithFill([
            row('광고적음', { adCount: 1 }),
            row('광고많음', { adCount: 9 }),
        ], { target: 2 });
        expect(out.rows.map((r) => r.keyword)).toEqual(['광고많음', '광고적음']);
    });

    it('광고가 같으면 검색량이 많은 것이 먼저다', () => {
        const out = selectWithFill([
            row('검색적음', { adCount: 3, searchVolume: 400 }),
            row('검색많음', { adCount: 3, searchVolume: 2000 }),
        ], { target: 2 });
        expect(out.rows[0].keyword).toBe('검색많음');
    });

    it('광고·검색량이 같으면 문서수가 적은 것이 먼저다', () => {
        const out = selectWithFill([
            row('문서많음', { adCount: 3, searchVolume: 900, documentCount: 5000 }),
            row('문서적음', { adCount: 3, searchVolume: 900, documentCount: 300 }),
        ], { target: 2 });
        expect(out.rows[0].keyword).toBe('문서적음');
    });

    // 안 본 것을 '광고 없음'으로 눌러 담으면 멀쩡한 키워드가 뒤로 밀린다.
    it('광고를 못 쟀으면 그 축으로 벌주지 않는다', () => {
        const out = selectWithFill([
            row('광고미측정', { searchVolume: 2000 }),
            row('광고있음', { adCount: 5, searchVolume: 400 }),
        ], { target: 2 });
        expect(out.rows[0].keyword).toBe('광고미측정');
    });

    it('광고가 있으면 근거로 적고, 못 쟀으면 안 적는다', () => {
        const measured = judgePreemption(base({ serp: { ...serpOf([OTHER]), adCount: 7 } }));
        expect(measured.evidence.find((e) => e.code === 'ads')?.text).toContain('상단 광고 7건');
        const unmeasured = judgePreemption(base());
        expect(unmeasured.evidence.some((e) => e.code === 'ads')).toBe(false);
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
            documentCount: 2000, // 황금 비율이면 예외로 통과하므로, 이 테스트는 비율을 벗긴다
            serp: serpOf([COVERING], { exactTitleHits: 3, partialTitleHits: 4 }),
        }));
        const outcome = selectWithFill([...topTier(1), ...noRoom], { target: 6 });
        expect(outcome.rows).toHaveLength(1);
        expect(outcome.short).toBe(true);
    });

    // "다 통과시켜서 보여줘" — 황금 비율은 목표 개수 절단에서도 제외된다.
    it('황금 비율은 목표를 넘겨도 전부 실린다', () => {
        const golden = Array.from({ length: 4 }, (_, i) => base({
            keyword: `황금${i}`,
            searchVolume: 900, documentCount: 100,
            serp: serpOf([COVERING], { exactTitleHits: 3, partialTitleHits: 3 }),
        }));
        const outcome = selectWithFill([...topTier(2), ...golden], { target: 2 });
        // 목표 2 를 top3 가 채우고도, 황금 비율 4행이 전부 덧붙는다.
        expect(outcome.rows.length).toBe(6);
        expect(outcome.rows.filter((r) => r.tier === 'golden-ratio')).toHaveLength(4);
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

/**
 * 검색량 대비 문서수 — **더 이상 판정에 쓰지 않는다.**
 *
 * 예전에는 불변조건이었다. 2026-08-11 실측이 뒤집었다: 이 조건이 버린 개념
 * 롱테일 36건을 SERP 로 직접 재보니 18건에 자리가 있었고, 두 무리를 가르는
 * 지표가 하나도 없었다(자리있음 문서수 중앙값 22,351 · 막힘 9,324 — 오히려 반대).
 *
 * 문서수는 broad 매치라 "그 단어들이 들어간 글" 수이지 "그 질문에 답한 글"
 * 수가 아니다. 자리는 SERP 제목으로만 알 수 있다.
 */
/*
 * 이 블록은 2026-08-11 에 통째로 뒤집혔다.
 *
 * 전에는 '문서수는 자리를 판정하지 않는다'를 고정했다. 근거는 실측 36건이었는데
 * 그 실측이 무효였다 — 자리 유무를 잰 titleCoverage 가 붙여 쓴 검색어를 전부
 * '정면 0건'으로 냈기 때문이다('에너지바우처조회' ← "에너지바우처 잔액조회…" 0.00).
 * 즉 "문서수가 많아도 자리가 있더라" 는 관측 자체가 고장 난 판정기의 산물이었다.
 *
 * 사장님 기준으로 돌아간다 — 검색량이 높고 문서수가 적어야 황금키워드다.
 * 다만 문서수는 컷 하나로만 쓴다(문서수 > 검색량이면 뺀다). 자리의 최종 판정은
 * 여전히 SERP 제목이 한다 — 비율로 등수를 매기지 않는다.
 */
describe('선점 게이트 — 문서수가 검색량보다 많으면 빈자리라고 하지 않는다', () => {
    const winnableSerp = {
        sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 0,
        medianDaysAgo: 120, topTitles: ['가', '나', '다'],
    };
    const base = {
        keyword: '테스트 키워드', serp: winnableSerp,
        firstSeenAt: new Date().toISOString(), inRealtimeNow: false,
    };

    it('소음이 검색량의 10배를 넘으면 정면 대응 0건이어도 안 올린다', () => {
        // 실측 '에너지바우처조회' — 검색량 280 · 문서 22,035(79배). 이걸 빈자리라고 부를 수 없다.
        const out = selectWithFill([{ ...base, searchVolume: 280, documentCount: 22035 }], { target: 5 });
        expect(out.rows).toHaveLength(0);
        expect(out.rejected[0].failed[0]).toContain('소음이 너무 두껍다');
    });

    it('문서 4만 개짜리는 더 말할 것도 없다', () => {
        const out = selectWithFill([{ ...base, searchVolume: 180, documentCount: 40560 }], { target: 5 });
        expect(out.rows).toHaveLength(0);
    });

    it('소음이 얇고 정면 대응도 없으면 통과한다', () => {
        const out = selectWithFill([{ ...base, searchVolume: 900, documentCount: 300 }], { target: 5 });
        expect(out.rows).toHaveLength(1);
    });

    /*
     * 2026-08-12 정책 반전: 검색량 > 문서수(황금 비율)는 정면 대응이 있어도
     * 전부 통과한다 — 사장님 최종 기준. 비율이 안 되는 것만 정면 차단이 잡는다.
     */
    it('황금 비율이면 정면 5건이어도 통과한다 — 층 라벨이 사실을 밝힌다', () => {
        const locked = { ...winnableSerp, exactTitleHits: 5 };
        const out = selectWithFill([{ ...base, serp: locked, searchVolume: 820, documentCount: 313 }], { target: 5 });
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].tier).toBe('golden-ratio');
    });

    // 못 쟀으면 자르지 않는다 — 못 본 것과 나쁜 것을 섞지 않는다.
    it('문서수를 못 쟀으면 비율로 자르지 않는다', () => {
        const out = selectWithFill([{ ...base, searchVolume: 280, documentCount: null }], { target: 5 });
        expect(out.rows).toHaveLength(1);
    });

    it('검색량이 문서수보다 많으면 자리가 없어도 올린다 — 황금 비율 층으로', () => {
        const locked = { ...winnableSerp, exactTitleHits: 3 };
        const out = selectWithFill([{ ...base, serp: locked, searchVolume: 940, documentCount: 20 }], { target: 5 });
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].tier).toBe('golden-ratio');
    });
});

describe('선점 게이트 — AI 브리핑 없는 것부터 채운다', () => {
    const serp = (hasAiBriefing: boolean) => ({
        sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 0,
        medianDaysAgo: 120, topTitles: ['가', '나', '다'], hasAiBriefing,
    });
    const row = (keyword: string, hasAiBriefing: boolean) => ({
        keyword, searchVolume: 900, documentCount: 100,
        serp: serp(hasAiBriefing),
        firstSeenAt: new Date().toISOString(), inRealtimeNow: false,
    });

    it('브리핑 없는 것이 먼저 나온다', () => {
        const out = selectWithFill([row('브리핑있음', true), row('브리핑없음', false)], { target: 2 });
        expect(out.rows[0].keyword).toBe('브리핑없음');
    });

    it('없는 것만으로 목표를 채우면 있는 것은 안 넣는다', () => {
        const out = selectWithFill([row('브리핑있음', true), row('브리핑없음', false)], { target: 1 });
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].keyword).toBe('브리핑없음');
    });

    it('모자라면 브리핑 있는 것도 꺼낸다 — 빈 결과보다는 낫다', () => {
        const out = selectWithFill([row('브리핑있음', true)], { target: 3 });
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].keyword).toBe('브리핑있음');
    });

    // 못 본 것(undefined)을 "있다"로 취급해 뒤로 밀면 멀쩡한 키워드가 손해를 본다.
    it('브리핑을 못 쟀으면 뒤로 밀지 않는다', () => {
        const unmeasured = { ...row('미측정', false), serp: { ...serp(false), hasAiBriefing: undefined } };
        const out = selectWithFill([row('브리핑있음', true), unmeasured as never], { target: 1 });
        expect(out.rows[0].keyword).toBe('미측정');
    });
});

/**
 * 층보다 브리핑 유무가 먼저다.
 *
 * 사장님 논리: 브리핑에서 답을 얻으면 굳이 내 글을 안 본다. 자리가 좋아도
 * 클릭이 안 오는 자리는 값이 없고, 경합이어도 클릭이 오는 자리가 낫다.
 */
describe('선점 게이트 — 브리핑 유무가 층보다 앞선다', () => {
    const make = (keyword: string, hasAiBriefing: boolean, exactTitleHits: number) => ({
        keyword, searchVolume: 900, documentCount: 100,
        serp: {
            sampledTitles: 10, exactTitleHits, partialTitleHits: 0,
            medianDaysAgo: 120, topTitles: ['가', '나', '다'], hasAiBriefing,
        },
        firstSeenAt: new Date().toISOString(), inRealtimeNow: false,
    });

    it('브리핑 없는 경합이, 브리핑 있는 1페이지보다 먼저다', () => {
        const out = selectWithFill([
            make('브리핑있음_1페이지', true, 0),
            make('브리핑없음_경합', false, 1),
        ], { target: 2 });
        expect(out.rows[0].keyword).toBe('브리핑없음_경합');
    });

    it('둘 다 브리핑이 없으면 층 순서를 지킨다', () => {
        const out = selectWithFill([
            make('경합', false, 1),
            make('1층', false, 0),
        ], { target: 2 });
        expect(out.rows[0].keyword).toBe('1층');
    });
});

/**
 * 문서수 0 은 "경쟁이 전혀 없다"가 아니라 대개 **측정 실패**다.
 * 실측: '야설사이트' 검색량 130 / 문서수 0 — 네이버가 그 질의에 결과를 안 준 것이지
 * 글이 없는 게 아니다. 0 을 무경쟁으로 읽으면 비율 검사를 통째로 건너뛴다.
 */
describe('선점 게이트 — 문서수 0', () => {
    const input = {
        keyword: '야설사이트', searchVolume: 130, documentCount: 0,
        serp: {
            sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 0,
            medianDaysAgo: 120, topTitles: ['가', '나', '다'], hasAiBriefing: false,
        },
        firstSeenAt: new Date().toISOString(), inRealtimeNow: false,
    };

    it('문서수 0 은 통과시키지 않는다', () => {
        const out = selectWithFill([input], { target: 5 });
        expect(out.rows).toHaveLength(0);
        expect(out.rejected[0].failed[0]).toContain('문서수 0');
    });

    // 못 잰 것(null)과 0 은 다르다. null 은 그 조건을 안 볼 뿐이다.
    it('문서수를 아예 못 쟀으면 이 조건으로 버리지 않는다', () => {
        expect(selectWithFill([{ ...input, documentCount: null }], { target: 5 }).rows).toHaveLength(1);
    });
});
