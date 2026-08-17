import { describe, expect, it } from 'vitest';
import { pickSubKeywords, pickProblemSubKeywords } from '../title-forge/subkeyword-forge';

/**
 * 서브키워드 선별 — 문제해결형을 **우선**하되, 없다고 빈손으로 두지 않는다.
 *
 * 사장님 지시(2026-08-18): "융통적이게 해줘, 문제해결형만 나오는 건 아닐 테니까".
 *
 * 2026-08-18 실측이 이 변경의 근거다. 프롬프트를 고쳐 실존 검증 통과가
 * 2% → 77% 로 올랐는데(제안 79 → 통과 61), 정작 보강된 행은 0이었다.
 * 실제로 검색되는 61개를 손에 쥐고도 "문제해결형 프레임" 하나만 보고 전부
 * 버렸기 때문이다. 실존이 확인된 검색어를 버리는 것보다, 순서를 매겨
 * 보여주는 편이 언제나 낫다.
 */

const cands = [
  { keyword: '민증사진 규격', searchVolume: 3400, source: 'ai-verified' },
  { keyword: '민증사진 재발급', searchVolume: 1400, source: 'ai-verified' },
  { keyword: '민증사진 안경', searchVolume: 120, source: 'ai-verified' },
  { keyword: '민증사진 배경색 오류', searchVolume: 90, source: 'ai-verified' },
];

describe('문제해결형이 먼저', () => {
  it('문제해결형이 있으면 앞자리를 준다', () => {
    const picked = pickSubKeywords('민증사진 규칙', cands);
    expect(picked[0].keyword).toBe('민증사진 배경색 오류');
  });
});

describe('모자라면 실존 검색어로 채운다', () => {
  it('문제해결형이 하나도 없어도 빈손으로 두지 않는다', () => {
    const plain = [
      { keyword: '민증사진 규격', searchVolume: 3400, source: 'ai-verified' },
      { keyword: '민증사진 크기', searchVolume: 420, source: 'ai-verified' },
      { keyword: '민증사진 가격', searchVolume: 210, source: 'ai-verified' },
    ];
    const picked = pickSubKeywords('민증사진 규칙', plain);
    expect(picked).toHaveLength(3);
    // 채울 때는 검색량 큰 순 — 순서가 곧 확신의 순서다.
    expect(picked[0].keyword).toBe('민증사진 규격');
  });

  it('세 개를 넘기지 않는다', () => {
    expect(pickSubKeywords('민증사진 규칙', cands)).toHaveLength(3);
  });

  it('남의 키워드는 채움에도 못 들어온다', () => {
    // 어절을 공유하지 않으면 다른 주제다 — 유연해진다고 이 선까지 풀지 않는다.
    const picked = pickSubKeywords('민증사진 규칙', [
      { keyword: '여권사진 규격', searchVolume: 9000, source: 'ai-verified' },
    ]);
    expect(picked).toEqual([]);
  });

  it('메인 키워드 자신은 서브가 아니다', () => {
    const picked = pickSubKeywords('민증사진 규칙', [
      { keyword: '민증사진 규칙', searchVolume: 500, source: 'ai-verified' },
    ]);
    expect(picked).toEqual([]);
  });
});

describe('기존 함수는 그대로 둔다', () => {
  it('pickProblemSubKeywords 는 여전히 문제해결형만 낸다', () => {
    // 홈판·제목 쪽에서 이 엄격한 판정을 쓰고 있다 — 조용히 바꾸면 그쪽이 흔들린다.
    const picked = pickProblemSubKeywords('민증사진 규칙', cands);
    expect(picked.every((p) => p.frame === 'mistake' || p.frame === 'compare')).toBe(true);
  });
});
