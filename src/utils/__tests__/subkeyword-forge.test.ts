import { describe, expect, it } from 'vitest';
import { pickProblemSubKeywords } from '../title-forge/subkeyword-forge';

/**
 * 문제해결형 서브키워드 — 애드센스 레인의 "메인 + 서브 3" 재료.
 *
 * 사장님 기준(2026-08-17): 아무 키워드에나 붙는 하드코딩 접미사는 절대 금지.
 * 입력은 **실측 확장 결과**(자동완성·연관검색이 실제로 돌려준 것)만 받고,
 * 그중 문제해결형 프레임(안됨/오류/원인/해결/차이/실수…)으로 분류되는 것을
 * 검색량 순으로 고른다. 3개를 못 채우면 지어내지 않고 있는 만큼만 낸다.
 */

const expansions = [
    { keyword: '백업 옵트아웃 해제 안됨', searchVolume: 320 },
    { keyword: '백업 옵트아웃 뜻', searchVolume: 900 },
    { keyword: '백업 옵트아웃 아이폰 차이', searchVolume: 180 },
    { keyword: '백업 옵트아웃 오류 해결', searchVolume: 110 },
    { keyword: '백업 옵트아웃 추천', searchVolume: 700 },
    { keyword: '갤럭시 백업', searchVolume: 5000 },
];

describe('문제해결형 서브키워드 선별', () => {
    it('문제해결형 프레임만 검색량 순으로 최대 3개', () => {
        const subs = pickProblemSubKeywords('백업 옵트아웃', expansions);
        const keywords = subs.map((s) => s.keyword);
        // 문제형: 안됨(320) > 차이(180) > 오류 해결(110). '뜻'(정의)·'추천'은 문제형이 아니다.
        expect(keywords).toEqual([
            '백업 옵트아웃 해제 안됨',
            '백업 옵트아웃 아이폰 차이',
            '백업 옵트아웃 오류 해결',
        ]);
    });

    it('메인 키워드 어절을 공유하지 않는 확장은 남의 키워드다 — 제외', () => {
        const subs = pickProblemSubKeywords('백업 옵트아웃', [
            { keyword: '프린터 인쇄 안됨', searchVolume: 9000 },
            { keyword: '백업 옵트아웃 해제 안됨', searchVolume: 320 },
        ]);
        expect(subs.map((s) => s.keyword)).toEqual(['백업 옵트아웃 해제 안됨']);
    });

    it('문제해결형이 부족하면 지어내지 않고 있는 만큼만', () => {
        const subs = pickProblemSubKeywords('민증사진 규칙', [
            { keyword: '민증사진 규칙 머리 넘김 안됨', searchVolume: 90 },
            { keyword: '민증사진 규칙 정리', searchVolume: 400 },
        ]);
        expect(subs).toHaveLength(1);
        expect(subs[0].keyword).toBe('민증사진 규칙 머리 넘김 안됨');
    });

    it('검색량 미측정(null)은 뒤로 밀리지만 버리지 않는다', () => {
        const subs = pickProblemSubKeywords('백업 옵트아웃', [
            { keyword: '백업 옵트아웃 오류 해결', searchVolume: null },
            { keyword: '백업 옵트아웃 해제 안됨', searchVolume: 320 },
        ]);
        expect(subs.map((s) => s.keyword)).toEqual([
            '백업 옵트아웃 해제 안됨',
            '백업 옵트아웃 오류 해결',
        ]);
    });

    it('확장이 비면 빈 배열 — 하드코딩 접미사를 만들어내지 않는다', () => {
        expect(pickProblemSubKeywords('아무 키워드', [])).toEqual([]);
    });
});
