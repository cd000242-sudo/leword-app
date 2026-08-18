/** 승격 큐 추출 테스트 — 2026-08-18 발행 보드 실물 스키마 기반 */
import { describe, it, expect } from 'vitest';
import { extractPromotableSeeds } from '../pool-promotion';

const BOARD = {
  rows: [
    {
      keyword: '해리포터 재개봉 일정',
      topic: '영화',
      keywordPool: [
        { keyword: '해리포터 시리즈 순서', searchVolume: 15210, source: 'ai-verified' },
        { keyword: '해리포터 재개봉', searchVolume: 4300, documentCount: 1200 },
        { keyword: 'CGV 재개봉', searchVolume: 880 },
      ],
      subKeywords: [
        { keyword: '해리포터 시리즈 순서', searchVolume: 15210, frame: 'generic' }, // 풀과 중복
        { keyword: '해리포터 재개봉 순서', searchVolume: 720 },
      ],
    },
    {
      keyword: '대구 아이맥스 명당',
      topic: '영화',
      keywordPool: [
        { keyword: '해리포터 재개봉 일정', searchVolume: 1070 }, // 다른 행의 본체 — 제외돼야
        { keyword: 'https://cgv.co.kr 예매', searchVolume: 10 }, // URL 조각 — 제외
        { keyword: '아이맥스 명당', searchVolume: 2400 },
      ],
    },
  ],
};

describe('extractPromotableSeeds', () => {
  const seeds = extractPromotableSeeds(BOARD);
  const keywords = seeds.map((s) => s.keyword);

  it('풀과 서브를 합치되 보드 본체 키워드는 제외한다', () => {
    expect(keywords).toContain('해리포터 시리즈 순서');
    expect(keywords).toContain('아이맥스 명당');
    expect(keywords).not.toContain('해리포터 재개봉 일정');
    expect(keywords).not.toContain('대구 아이맥스 명당');
  });

  it('여러 행에 걸친 중복은 한 번만 (풀 우선)', () => {
    expect(keywords.filter((k) => k === '해리포터 시리즈 순서')).toHaveLength(1);
    const dup = seeds.find((s) => s.keyword === '해리포터 시리즈 순서');
    expect(dup!.origin).toBe('pool');
  });

  it('URL·조각은 씨앗이 될 수 없다', () => {
    expect(keywords.some((k) => k.includes('https'))).toBe(false);
  });

  it('실측값을 실어 나른다 — 문서수 있는 항목은 재조회 없이 게이트 선적용 가능', () => {
    const withDc = seeds.find((s) => s.keyword === '해리포터 재개봉');
    expect(withDc!.searchVolume).toBe(4300);
    expect(withDc!.documentCount).toBe(1200);
    const withoutDc = seeds.find((s) => s.keyword === 'CGV 재개봉');
    expect(withoutDc!.documentCount).toBeNull();
  });

  it('주제와 출처 행을 상속한다 (빈손 주제 추적용)', () => {
    const s = seeds.find((x) => x.keyword === '아이맥스 명당');
    expect(s!.topic).toBe('영화');
    expect(s!.fromKeyword).toBe('대구 아이맥스 명당');
  });

  it('빈 보드·rows 없음도 조용히 빈 배열', () => {
    expect(extractPromotableSeeds({})).toEqual([]);
    expect(extractPromotableSeeds({ rows: [] })).toEqual([]);
  });
});
