import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 광고 클릭 실측 통과(2026-09-08, 사장님 "광고 클릭률을 보는 게 중요하다").
 *
 * keywordstool 은 검색량과 같은 행에 월 평균 클릭수·클릭률·노출 광고 수를 실어 주는데
 * 어댑터가 CPC·경쟁도만 건지고 이 셋은 버리고 있었다. 이 시험은 두 경로를 다 본다:
 *   ① API 응답 → 필드가 그대로 나온다(소수 클릭률·노출 수를 정수 파서로 뭉개지 않는다)
 *   ② 캐시 적중 → 저장했던 값이 그대로 다시 나온다(옛 항목이면 null)
 * 이름은 API 원문(searchad-apidoc)이다. 가짜 fetch 라 네트워크로 안 나간다.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'searchad-ad-metrics-'));
process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'] = path.join(dir, 'cache.json');
process.env['LEWORD_SEARCHAD_QUOTA_STATE_FILE'] = path.join(dir, 'quota.json');
process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '100';

const originalFetch = global.fetch;
let apiCalls = 0;

beforeAll(() => {
    (global as any).fetch = async (url: string) => {
        apiCalls += 1;
        const hints = String(new URL(url).searchParams.get('hintKeywords') || '').split(',').filter(Boolean);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                keywordList: hints.map((keyword) => ({
                    relKeyword: keyword,
                    monthlyPcQcCnt: 1200,
                    monthlyMobileQcCnt: 3800,
                    monthlyAveCpc: 410,
                    compIdx: '높음',
                    monthlyAvePcClkCnt: 12.5,
                    monthlyAveMobileClkCnt: 87.3,
                    monthlyAvePcCtr: 1.04,
                    monthlyAveMobileCtr: 2.31,
                    plAvgDepth: 14.6,
                })),
            }),
        } as any;
    };
});

afterAll(() => {
    (global as any).fetch = originalFetch;
});

describe('광고 클릭 실측 통과', () => {
    const config = { customerId: '1000001', accessLicense: 'ad-metrics-license', secretKey: 'ad-metrics-secret' };

    it('API 응답의 클릭수·클릭률·노출 광고 수가 그대로 나온다', async () => {
        const { getNaverSearchAdKeywordVolume } = await import('../naver-searchad-api');
        const [row] = await getNaverSearchAdKeywordVolume(config, ['넷플릭스요금제비교']);
        expect(row.totalSearchVolume).toBe(5000);
        expect(row.monthlyAvePcClkCnt).toBe(12.5);
        expect(row.monthlyAveMobileClkCnt).toBe(87.3);
        expect(row.monthlyAvePcCtr).toBe(1.04);
        expect(row.monthlyAveMobileCtr).toBe(2.31);
        expect(row.plAvgDepth).toBe(14.6);
    });

    it('캐시 적중 경로에서도 같은 값이 나온다 — 두 번째 호출은 API 로 안 나간다', async () => {
        const { getNaverSearchAdKeywordVolume } = await import('../naver-searchad-api');
        const before = apiCalls;
        const [row] = await getNaverSearchAdKeywordVolume(config, ['넷플릭스요금제비교']);
        expect(apiCalls).toBe(before);
        expect(row.monthlyAveMobileCtr).toBe(2.31);
        expect(row.plAvgDepth).toBe(14.6);
        expect(row.monthlyAvePcClkCnt).toBe(12.5);
    });

    it('옛 캐시 항목(광고 필드 없음)은 null 로 나온다 — 지어내지 않는다', async () => {
        const { setSearchAdVolumeCached } = await import('../searchad-volume-cache');
        setSearchAdVolumeCached('옛항목', { pc: 100, mo: 300, total: 400, comp: '중간', cpc: 120 });
        const { getNaverSearchAdKeywordVolume } = await import('../naver-searchad-api');
        const [row] = await getNaverSearchAdKeywordVolume(config, ['옛항목']);
        expect(row.totalSearchVolume).toBe(400);
        expect(row.monthlyAvePcClkCnt).toBeNull();
        expect(row.monthlyAveMobileCtr).toBeNull();
        expect(row.plAvgDepth).toBeNull();
    });
});
