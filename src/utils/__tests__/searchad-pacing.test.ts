import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 검색광고 호출 간격 — 샤드 분산 회차(2026-09-08 실측)에서 러너 4개가 한 계정을 동시에 불러
 * 429 가 러너당 700~1,150회 났다. 워크플로가 LEWORD_SEARCHAD_MIN_INTERVAL_MS 로 러너 안 간격을
 * 러너 수만큼 늘리면 계정 전체 속도가 러너 하나일 때로 돌아온다. env 가 없으면 예전 그대로다.
 */
const load = async () => {
    vi.resetModules();
    const mod = await import('../naver-searchad-api');
    return mod.searchAdPacing();
};

describe('검색광고 호출 간격', () => {
    const original = process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'];
    afterEach(() => {
        if (original === undefined) delete process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'];
        else process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'] = original;
    });

    it('env 가 없으면 예전 그대로 — 기본 900ms, 제안 조회 500ms', async () => {
        delete process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'];
        expect(await load()).toEqual({ baseMs: 900, suggestMs: 500 });
    });

    it('러너 수만큼 늘린 간격을 두 경로(키워드도구·제안 조회)가 같이 쓴다', async () => {
        process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'] = '3600';
        expect(await load()).toEqual({ baseMs: 3600, suggestMs: 3600 });
    });

    it('900 보다 작게는 못 줄인다 — 계정 한도는 그대로다', async () => {
        process.env['LEWORD_SEARCHAD_MIN_INTERVAL_MS'] = '100';
        expect((await load()).baseMs).toBe(900);
    });
});
