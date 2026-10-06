/**
 * 글 한 편 유입 설계실(2026-10-06 사장님 "지금 기능들을 적절하게 사용해서 대단한 기능 하나" → 계획 승인 "진행").
 * 순수 판정 · 정리 함수 — 질문 체크리스트, 제휴 상품 후보, 설계 목록 저장.
 */
import { describe, expect, it } from 'vitest';
import { affiliateCandidates, questionChecklist, upsertPlan, type PostPlan } from '../post-plan/post-plan-model';

const NOW = Date.parse('2026-10-06T08:00:00Z');

describe('사람들이 실제로 물은 것 — 질문 체크리스트', () => {
  it('최근 글부터, 같은 질문은 한 번, 출처 이름을 사람 말로', () => {
    const items = [
      { source: 'cafearticle', title: '마일리지 특약 중간에 바꿀 수 있나요?', link: 'https://cafe.naver.com/a/1', postdate: '2026-10-01', postedAt: '2026-10-01T03:00:00Z', cafeName: '자동차 카페' },
      { source: 'kin', title: '블랙박스 할인 따로 신청해야 하나요?', link: 'https://kin.naver.com/qna/detail.naver?docId=1', postdate: '2026-10-04', postedAt: '2026-10-04T03:00:00Z' },
      { source: 'kin', title: '블랙박스 할인 따로 신청해야 하나요?', link: 'https://kin.naver.com/qna/detail.naver?docId=1', postdate: '2026-10-04', postedAt: '2026-10-04T03:00:00Z' },
      { source: 'community', title: '보험 갱신 후기', link: 'https://www.a-ha.io/questions/x', postdate: '2026-09-30', postedAt: '2026-09-30T03:00:00Z', siteName: '아하 Q&A' },
    ];
    const list = questionChecklist(items, 10);
    expect(list.map((q) => q.title)).toEqual(['블랙박스 할인 따로 신청해야 하나요?', '마일리지 특약 중간에 바꿀 수 있나요?', '보험 갱신 후기']);
    expect(list.map((q) => q.where)).toEqual(['지식인', '카페 · 자동차 카페', '아하 Q&A']);
    expect(list[0].postdate).toBe('2026-10-04');
  });
  it('작성일이 없는 글은 넣지 않는다(서버가 14일 안만 보내지만 한 번 더 막는다)', () => {
    expect(questionChecklist([{ source: 'kin', title: '날짜 없음', link: 'https://kin.naver.com/x', postdate: '' }], 10)).toEqual([]);
  });
  // 실주행(2026-10-06 '자동차 보험 갱신'): 카페 검색이 낱말 하나만 맞아도 줘서 '개인회생' · '장갑차 대형면허 갱신'이 섞였다.
  it('키워드를 주면 낱말 절반 이상이 제목에 든 질문만 남긴다(띄어쓰기 무시)', () => {
    const at = (title: string, i: number) => ({ source: 'cafearticle', title, link: `https://cafe.naver.com/a/${i}`, postdate: '2026-10-06', postedAt: `2026-10-06T0${i}:00:00Z` });
    const items = [at('개인회생 신청자격 조건', 1), at('K808 장갑차 대형면허 갱신', 2), at('KB다이렉트 자동차보험 대중교통 할인', 3), at('개인택시 자동차보험 다이렉트 알아보니', 4)];
    expect(questionChecklist(items, 10, '자동차 보험 갱신').map((q) => q.title)).toEqual(['개인택시 자동차보험 다이렉트 알아보니', 'KB다이렉트 자동차보험 대중교통 할인']);
  });
});

describe('돈 — 관련 제휴 상품 후보', () => {
  const snapshot = {
    sites: {
      toss: { label: '토스쇼핑', items: [
        { name: '차량용 블랙박스 2채널 FHD', keyword: '블랙박스', price: 89000, reward: '8%' },
        { name: '여성 스니커즈 화이트', keyword: '스니커즈' },
        { name: '자동차 방향제 세트', keyword: '차량 방향제' },
      ] },
      brandconnect: { label: '브랜드커넥트', items: [{ name: '블랙박스 메모리카드 128GB', keyword: '메모리카드' }] },
    },
  };
  it('키워드 낱말이 상품 이름 · 검색어에 든 것만, 많이 겹친 순으로, 몇 개만', () => {
    const list = affiliateCandidates('자동차 블랙박스 할인', snapshot, 3);
    expect(list.map((p) => p.name)).toEqual(['차량용 블랙박스 2채널 FHD', '블랙박스 메모리카드 128GB', '자동차 방향제 세트']);
    expect(list[0].platform).toBe('토스쇼핑');
  });
  it('겹치는 낱말이 없으면 빈 목록 — 억지로 채우지 않는다', () => {
    expect(affiliateCandidates('엑셀 함수', snapshot, 3)).toEqual([]);
  });
  it('스냅샷을 못 받았으면 빈 목록', () => {
    expect(affiliateCandidates('블랙박스', null, 3)).toEqual([]);
  });
});

describe('설계 목록 저장', () => {
  const plan = (id: string, keyword: string, at: number): PostPlan => ({ id, keyword, createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString(), steps: {} });
  it('같은 키워드는 새 설계로 덮고 맨 앞에 둔다 · 상한을 넘으면 오래된 것부터 뺀다', () => {
    const list = [plan('a', '블랙박스', NOW - 3000), plan('b', '엑셀 함수', NOW - 2000)];
    const next = upsertPlan(list, plan('c', '블랙박스', NOW), 2);
    expect(next.map((p) => p.id)).toEqual(['c', 'b']);
    expect(upsertPlan(next, plan('d', '새 키워드', NOW + 1), 2).map((p) => p.id)).toEqual(['d', 'c']);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']); // 원본은 그대로
  });
});
