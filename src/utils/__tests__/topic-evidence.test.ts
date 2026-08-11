/**
 * 주제 되짚기 — 실측 오염 사례를 고정한다.
 *
 * 아래 제목들은 지어낸 것이 아니라 2026-08-11 네이버 블로그 검색에서 그대로 받아 온
 * 것이다. 판정 규칙을 손볼 때 이 두 묶음이 갈리는지부터 본다.
 */
import { describe, it, expect } from 'vitest';
import {
  judgeTopicByEvidence,
  distinctiveVocabulary,
  evidenceTokens,
} from '../topic-evidence';

/** 실측: '노트북받침대 비교' 상위 블로그 제목 (2026-08-11). */
const NOTEBOOK_STAND_TITLES = [
  '듀얼 모니터 받침대 추천 높이조절 가능한 재택필수템 퍼플래빗',
  '듀얼 노트북 거치대 추천 퍼플래빗 다이소 받침대와 비교',
  '퍼플래빗 모니터 노트북 거치대 추천 다이소 받침대와 비교 홈스쿨',
  '듀얼 노트북 거치대 퍼플래빗 받침대 추천 다이소 비교 끝판왕 후기',
  '레이저 노트북 쿨링 패드 거치대 RAZER Laptop Cooling Pad 사용 후기',
];

/** 실측: '독서대 각도조절' 상위 블로그 제목 (2026-08-11). */
const BOOK_STAND_TITLES = [
  '다이소 휴대용 독서대 후기｜2000원 가성비 가벼운 독서대 솔직 리뷰',
  '노르잇 투명 독서대 내돈내산 후기pr01a vs pr02a 차이, 필기까지 되나',
  '코믈리 투명 접이식 독서대 내돈내산 후기',
  '각도조절되는 2단독서대 추천, 이룸 프라임 후기',
];

describe('주제 고유 낱말표', () => {
  it('두 주제 이상이 쓰는 말은 증거가 되지 못한다', () => {
    const vocabulary = distinctiveVocabulary();
    // '추천'·'비교'·'후기' 는 거의 모든 주제의 씨앗에 붙는다.
    expect(vocabulary.has('추천')).toBe(false);
    expect(vocabulary.has('비교')).toBe(false);
  });

  it('한 주제만 쓰는 말은 남는다', () => {
    const vocabulary = distinctiveVocabulary();
    expect(vocabulary.get('독서대')).toBe('문학·책');
    expect(vocabulary.get('베스트셀러')).toBe('문학·책');
  });

  it('낱말 경계는 사람이 띄어 쓴 제목에서만 존재한다', () => {
    // 씨앗 단계에서 불가능하던 것 — '노트북' 안에 '노트' 라는 낱말은 없다.
    expect(evidenceTokens('듀얼 노트북 거치대 추천')).toEqual(['듀얼', '노트북', '거치대', '추천']);
  });
});

describe('실측 오염: 노트북받침대 비교 → 문학·책', () => {
  const verdict = judgeTopicByEvidence({
    keyword: '노트북받침대 비교',
    claimedTopic: '문학·책',
    meaning: { topTitles: NOTEBOOK_STAND_TITLES },
  });

  it('문학·책 라벨을 떼어 낸다', () => {
    expect(verdict.topic).not.toBe('문학·책');
    expect(verdict.claimedHits).toEqual([]);
  });

  it('임의로 다른 주제를 찍지 않고 주제 선택 안 함으로 내린다', () => {
    // '노트북'·'모니터' 는 상품리뷰와 IT·컴퓨터가 함께 쓰는 말이라 증거가 못 된다.
    expect(verdict.kind).toBe('unlabeled');
    expect(verdict.topic).toBe('주제 선택 안 함');
  });
});

describe('정상 후보는 살아남는다', () => {
  it('독서대 각도조절 은 문학·책 그대로', () => {
    const verdict = judgeTopicByEvidence({
      keyword: '독서대 각도조절',
      claimedTopic: '문학·책',
      meaning: { topTitles: BOOK_STAND_TITLES },
    });
    expect(verdict.kind).toBe('supported');
    expect(verdict.topic).toBe('문학·책');
    expect(verdict.claimedHits).toContain('독서대');
  });

  it('공백이 지워진 키워드도 낱말 머리로 살린다', () => {
    // 검색광고 연관어는 '강아지사료' 처럼 붙여서 온다.
    const verdict = judgeTopicByEvidence({
      keyword: '강아지사료 추천',
      claimedTopic: '반려동물',
      meaning: { topTitles: ['강아지사료 추천 순위 정리'] },
    });
    expect(verdict.kind).toBe('supported');
    expect(verdict.claimedHits).toContain('강아지사료');
  });

  it('두 글자 꼬리로는 남의 주제를 물지 않는다', () => {
    // seed-drift.ts 가 기록한 오염 — '락스'(인테리어·DIY) 가 '마키나락스' 를 물던 통로.
    const verdict = judgeTopicByEvidence({
      keyword: '마키나락스 주가',
      claimedTopic: '인테리어·DIY',
      meaning: { topTitles: ['마키나락스 주가 전망 분석'] },
    });
    expect(verdict.claimedHits).toEqual([]);
  });
});

describe('못 본 것과 없는 것을 섞지 않는다', () => {
  it('검색결과를 못 읽었으면 주제를 건드리지 않는다', () => {
    const verdict = judgeTopicByEvidence({
      keyword: '노트북받침대 비교',
      claimedTopic: '문학·책',
      meaning: null,
    });
    expect(verdict.kind).toBe('insufficient');
    expect(verdict.topic).toBe('문학·책');
  });
});
