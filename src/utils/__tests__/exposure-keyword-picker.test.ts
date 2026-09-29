import { describe, expect, it } from 'vitest';
import { pickMeasuredKeywords, pickRelatedKeywords } from '../exposure-keyword-picker';

/**
 * 노출 추적 검색어 선정(2026-09-30).
 * 사장님: "추적하는 키워드와 연관키워드가 잘못되었어" — 제목 조각·접미사 합성 대신 실측만 남긴다.
 */
describe('추적 검색어 — 검색광고가 아는 말만', () => {
  it('제목 후보 중 검색량이 잡힌 것만, 큰 순으로 perPost 개', async () => {
    const asked: string[][] = [];
    const measure = async (keywords: string[]) => {
      asked.push(keywords);
      return keywords.map((keyword) => ({
        keyword,
        total: keyword === '비염 예방' ? 8200 : keyword === '가습기 청소' ? 1900 : keyword === '비염 예방 습도' ? 40 : null,
      }));
    };
    const picked = await pickMeasuredKeywords('비염 예방 습도 가습기 청소 하는 법', measure, { perPost: 2, candidateLimit: 8 });
    expect(asked.length).toBe(1);
    expect(picked.map((p) => p.keyword)).toEqual(['비염 예방', '가습기 청소']);
    expect(picked[0].searchVolume).toBe(8200);
  });

  it('검색광고가 모르는 말은 하나도 남기지 않는다 — 조각을 추적하지 않는다', async () => {
    const picked = await pickMeasuredKeywords('오늘 드디어 한 번 입은 옷 정리', async (ks) => ks.map((keyword) => ({ keyword, total: null })), { perPost: 3 });
    expect(picked).toEqual([]);
  });

  it('검색량 10 미만은 사람들이 치는 말로 보지 않는다', async () => {
    const picked = await pickMeasuredKeywords('공기압 마사지기 추천', async (ks) => ks.map((keyword) => ({ keyword, total: 5 })), { perPost: 3 });
    expect(picked).toEqual([]);
  });

  it('어절이 하나뿐인 제목은 후보를 못 만든다(창구를 부르지 않는다)', async () => {
    let called = 0;
    const picked = await pickMeasuredKeywords('공지', async () => { called += 1; return []; }, { perPost: 3 });
    expect(picked).toEqual([]);
    expect(called).toBe(0);
  });
});

describe('연관 검색어 — 검색광고 연관어 + 자동완성 실측', () => {
  it('씨앗 낱말을 품은 연관어를 검색량 큰 순으로, 그 뒤에 자동완성', () => {
    const out = pickRelatedKeywords('민생회복지원금 대상', {
      suggestions: [
        { keyword: '민생회복지원금 신청', searchVolume: 52000 },
        { keyword: '민생회복지원금 대상', searchVolume: 90000 }, // 씨앗 자신 — 뺀다
        { keyword: '소상공인 대출', searchVolume: 30000 },        // 씨앗과 무관 — 뺀다
        { keyword: '민생회복지원금 사용처', searchVolume: 71000 },
        { keyword: '민생회복지원금 잔액', searchVolume: 4 },       // 10 미만 — 뺀다
      ],
      autocomplete: ['민생회복지원금 대상 조회', '민생회복지원금 신청', '민생회복지원금 2차'],
    }, 4);
    expect(out.map((r) => r.keyword)).toEqual([
      '민생회복지원금 사용처', '민생회복지원금 신청', '민생회복지원금 대상 조회', '민생회복지원금 2차',
    ]);
    expect(out[0]).toMatchObject({ source: 'searchad', searchVolume: 71000 });
    expect(out[2]).toMatchObject({ source: 'autocomplete', searchVolume: null });
  });

  it('창구가 비면 빈 배열 — 접미사를 붙여 만들어 내지 않는다', () => {
    expect(pickRelatedKeywords('아이폰 색상', { suggestions: [], autocomplete: [] })).toEqual([]);
  });
});
