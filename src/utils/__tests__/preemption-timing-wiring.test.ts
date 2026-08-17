import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { selectWithFill, type PreemptionInput } from '../preemption-gate';
import { analyzeSerp } from '../serp-winnability';

/**
 * 시기(timing) 배선 회귀 — "만들어 놓고 버리는" 결함 4건을 고정한다.
 *
 * 2026-08-14 금요일 회차 실측: 34행 전부 timing='' · monthsToPeak=null ·
 * trendShape=null 이었다. 원인은 계산기(keyword-demand-shape)가 아니라 배선이다:
 * 후보 스크립트가 shape 의 monthsToPeak/timing 을 복사하지 않고 버렸고,
 * 배치 로더는 trendShape 를 복사하지 않았다. 계산은 맞는데 값이 보드까지
 * 도달하지 못하면 "시기별로 알려준다"는 기능 전체가 조용히 죽는다 —
 * 에러가 없어서 다음 회차까지 아무도 모른다. 그래서 파일 대조로 잡는다.
 */

const root = path.join(__dirname, '..', '..', '..');
const candidatesSource = fs.readFileSync(
    path.join(root, 'scripts', 'preemption-candidates.js'),
    'utf8',
);
const batchSource = fs.readFileSync(
    path.join(root, 'scripts', 'preemption-board-batch.js'),
    'utf8',
);

describe('시기 배선 — 후보 스크립트가 계산 결과를 버리지 않는다', () => {
    it('shape 의 monthsToPeak 를 후보 행으로 넘긴다', () => {
        // 후보 행 push 에 이 필드가 없으면 배치 로더(:98)가 읽을 것이 없다.
        expect(/monthsToPeak:/.test(candidatesSource)).toBe(true);
    });

    it('shape 의 timing 문구를 후보 행으로 넘긴다', () => {
        expect(/timing:/.test(candidatesSource)).toBe(true);
    });
});

describe('시기 배선 — 배치 로더가 라벨을 흘리지 않는다', () => {
    it('trendShape 를 후보에서 보드 행으로 복사한다', () => {
        // 없으면 board.json 의 trendShape 가 항상 null 이고,
        // 발행기는 shapeFromLabel 폴백(문구 파싱)으로 연명한다.
        expect(/trendShape:\s*row\.trendShape/.test(batchSource)).toBe(true);
    });
});

describe('제목·시기 배선 — 만든 것을 화면까지 나른다', () => {
    it('배치가 행에 제목 2종을 싣는다 (buildBoardTitles)', () => {
        expect(/buildBoardTitles/.test(batchSource)).toBe(true);
        expect(/titles:\s*buildBoardTitles/.test(batchSource)).toBe(true);
    });

    it('배치 로더가 씨앗을 복사한다 — 형제 파생을 찾는 열쇠다', () => {
        expect(/seed:\s*row\.seed/.test(batchSource)).toBe(true);
    });

    it('발행기가 timingGroup 과 titles 를 화면으로 통과시킨다', () => {
        const publishSource = fs.readFileSync(
            path.join(root, 'scripts', 'publish-preemption-board.js'),
            'utf8',
        );
        expect(/judgeTimingGroup/.test(publishSource)).toBe(true);
        expect(/timingGroup:/.test(publishSource)).toBe(true);
        expect(/titles:\s*row\.titles/.test(publishSource)).toBe(true);
    });

    it('배치가 문제해결 서브를 싣고 발행기가 통과시킨다', () => {
        // 사이트 화면의 "메인 + 서브 3" 재료. 형제 실측뿐이고 없으면 빈 배열.
        expect(/subKeywords:\s*pickProblemSubKeywords/.test(batchSource)).toBe(true);
        const publishSource = fs.readFileSync(
            path.join(root, 'scripts', 'publish-preemption-board.js'),
            'utf8',
        );
        expect(/subKeywords:/.test(publishSource)).toBe(true);
    });
});

describe('집계 — golden-ratio 층도 셈에 들어간다', () => {
    const goldenInput: PreemptionInput = {
        keyword: '노각무침 황금레시피',
        searchVolume: 900,
        documentCount: 100,
        serp: {
            sampledTitles: 10,
            exactTitleHits: 3,
            partialTitleHits: 3,
            medianDaysAgo: 5,
            topTitles: ['노각무침 황금레시피 소개', '노각무침 황금레시피 후기', '노각무침 황금레시피 정리'],
        },
        firstSeenAt: null,
        inRealtimeNow: false,
    };

    it('byTier["golden-ratio"] 가 NaN 이 아니라 실제 건수다', () => {
        // 초기화 객체에 키가 빠지면 undefined+1=NaN 이 되고, JSON 직렬화에서
        // null 로 바뀌어 보드의 tierTotals 가 "황금 비율 몇 건"을 영영 못 말한다.
        const outcome = selectWithFill([goldenInput], { target: 1 });
        expect(outcome.byTier['golden-ratio']).toBe(1);
        expect(Number.isFinite(outcome.byTier['golden-ratio'])).toBe(true);
    });
});

describe('SERP 제목 보존 — 판 것을 버리지 않는다', () => {
    it('파싱한 상위 제목 10개를 전부 topTitles 로 남긴다', () => {
        /*
         * extractTitles 는 10개를 뽑는데 topTitles 가 3개로 잘리면,
         * findOpenSlot 은 4위 이하 빈자리를 못 보고, 빈 프레임 제목 생성은
         * 원료의 70% 를 잃는다. BD 비용은 이미 치렀다 — 버릴 이유가 없다.
         */
        const titleSpan = (text: string) =>
            `<span class="sds-comps-text-type-headline1 sds-comps-text-weight-sm">${text}</span>`;
        const html = Array.from({ length: 12 }, (_, i) =>
            titleSpan(`노각무침 아삭하게 만드는 법 ${i + 1}탄`)).join('\n');

        const serp = analyzeSerp(html, '노각무침', { nowMs: Date.UTC(2026, 7, 16) });
        expect(serp.sampledTitles).toBe(10);
        expect(serp.topTitles).toHaveLength(10);
    });
});
