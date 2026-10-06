/**
 * 글 한 편 유입 설계실(2026-10-06 사장님 "지금 기능들을 적절하게 사용해서 대단한 기능 하나" → 계획 승인 "진행").
 * 순수 판정 · 정리 함수 — 질문 체크리스트, 제휴 상품 후보, 설계 목록 저장.
 */
import { describe, expect, it } from 'vitest';
import { affiliateCandidates, filterByAnalysis, inflowSpots, planSyncView, questionChecklist, radarAction, relatedForTitles, upsertPlan, type PostPlan } from '../post-plan/post-plan-model';

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

describe('⑤ 발행 후 유입 — 링크 달 자리', () => {
  it('평가 묶음은 사이트 레이더와 같은 가중치 · 문턱(80 지금 · 60 지켜볼)', () => {
    expect(radarAction({ relevance: 90, urgency: 90, commercialValue: 90, trafficPotential: 90, contentMatch: 90, spamRisk: 10 })).toBe('NOW');
    expect(radarAction({ relevance: 70, urgency: 60, commercialValue: 60, trafficPotential: 60, contentMatch: 70, spamRisk: 30 })).toBe('WATCH');
    expect(radarAction({ relevance: 20, urgency: 10, commercialValue: 10, trafficPotential: 10, contentMatch: 10, spamRisk: 80 })).toBe('SKIP');
  });
  it('검색 결과와 평가를 합쳐 지금 → 지켜볼 순으로, 제외는 세기만 · 평가 없는 것은 따로', () => {
    const items = [
      { source: 'kin', title: '갱신 때 블랙박스 할인 되나요', link: 'https://kin.naver.com/qna/detail.naver?docId=1', postdate: '2026-10-04', postedAt: '2026-10-04T00:00:00Z' },
      { source: 'cafearticle', title: '자동차보험 갱신 비교', link: 'https://cafe.naver.com/a/1', postdate: '2026-10-05', postedAt: '2026-10-05T00:00:00Z', cafeName: '차 카페' },
      { source: 'community', title: '보험 잡담', link: 'https://www.a-ha.io/q/1', postdate: '2026-10-03', siteName: '아하', linkPolicy: 'careful', policyWhy: '홍보로 보이면 지워짐' },
      { source: 'kin', title: '평가 못 받은 질문', link: 'https://kin.naver.com/qna/detail.naver?docId=9', postdate: '2026-10-02' },
    ];
    const high = { relevance: 90, urgency: 90, commercialValue: 90, trafficPotential: 90, contentMatch: 90, spamRisk: 10, why: '내 글이 바로 답' };
    const mid = { relevance: 70, urgency: 60, commercialValue: 60, trafficPotential: 60, contentMatch: 70, spamRisk: 30, why: '관련은 있음' };
    const low = { relevance: 10, urgency: 10, commercialValue: 10, trafficPotential: 10, contentMatch: 10, spamRisk: 90, why: '무관' };
    const out = inflowSpots(items, [{ index: 2, ...mid }, { index: 1, ...high }, { index: 3, ...low }]);
    expect(out.spots.map((s) => [s.action, s.title])).toEqual([['NOW', '갱신 때 블랙박스 할인 되나요'], ['WATCH', '자동차보험 갱신 비교']]);
    expect(out.spots[0].reason).toBe('내 글이 바로 답');
    expect(out.spots[1].where).toBe('카페 · 차 카페');
    expect(out.skipped).toBe(1);
    // 제외한 자리도 숨기지 않는다(사장님 "링크를 달 수 있는 곳은 전부 보여줘야") — 참고 목록으로
    expect(out.skippedSpots.map((s) => s.title)).toEqual(['보험 잡담']);
    expect(out.skippedSpots[0].reason).toBe('무관');
    expect(out.unrated.map((s) => s.title)).toEqual(['평가 못 받은 질문']);
  });
});

describe('⑤ 관련성 — 글 분석 키워드로 거르기', () => {
  // 실주행(2026-10-06 '우리들의 발라드2' 글): 147곳 중 '신용대출' · '임신 중 퇴사'가 섞였다(문장형 질의에 느슨하게 맞음).
  const analysis = {
    coreKeywords: [{ keyword: '우리들의 발라드2 심사 기준' }, { keyword: '탑백귀 150명' }, { keyword: '정승환 SBS의 아들' }],
    shortQueries: ['우발라2 첫방', '발라드2 투표 방식'],
  };
  const at = (title: string) => ({ source: 'cafearticle', title, link: `https://cafe.naver.com/a/${encodeURIComponent(title)}`, postdate: '2026-10-06' });
  it('구절이 그대로 있거나 주제어 + 낱말 둘 이상이면 남기고, 일반어 하나만 겹치면 뺀다', () => {
    const kept = filterByAnalysis([
      at('신용대출이 1억 넘으면 추가 불가?'),
      at('임신 중 퇴사 2027년 지원 기준'),
      at('우발라2 첫방 보신 분 탑백귀 투표 어때요'),
      at('우리들의 발라드2 심사 기준 이해 안 돼요'),
      at('정승환 이번 무대 기준 뭐예요'),
      at('공무원 심사 기준 질문'),
    ], analysis);
    expect(kept.map((i) => i.title)).toEqual(['우발라2 첫방 보신 분 탑백귀 투표 어때요', '우리들의 발라드2 심사 기준 이해 안 돼요', '정승환 이번 무대 기준 뭐예요']);
  });
});

describe('사이트 동기화용 설계 요약(4차)', () => {
  it('최근 20개만 · 답변 초안 본문 · 상위 제목 같은 큰 칸은 빼고 화면에 그릴 값만', () => {
    const big = (i: number): PostPlan => ({
      id: `p${i}`, keyword: `키워드${i}`, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
      steps: {
        judge: { ok: true, data: { searchVolume: 100, documentCount: 50, seat: { verdict: '반열림', facing: 1, vacancy: 7, topTitles: ['a', 'b'] }, range: { verdict: 'in', reason: '크기 안' } } },
        titles: { ok: true, data: { search: [{ text: '검색 제목', basis: 'x' }], homefeed: ['홈판 제목'], news: ['n'] } },
        inflow: { ok: true, data: { postUrl: 'https://blog.naver.com/x/1', postTitle: '글', found: 10, relevant: 3, skipped: 2, spots: [{ title: '질문', link: 'https://kin', where: '지식인', postdate: '2026-10-05', action: 'NOW', reason: '근거' }], answers: { 'https://kin': '아주 긴 초안'.repeat(100) } } },
        result: { ok: true, data: { registeredAt: '2026-10-06T00:00:00Z', pick: { seat: '반열림' }, checks: [{ day: 3, rank: 4 }], homefeed: { count: 2 } } },
      },
    });
    const view = planSyncView(Array.from({ length: 25 }, (_, i) => big(i)));
    expect(view.length).toBe(20);
    const v: any = view[0];
    expect(v.keyword).toBe('키워드0');
    expect(v.judge).toEqual({ searchVolume: 100, documentCount: 50, seat: '반열림', facing: 1, vacancy: 7, range: 'in', rangeReason: '크기 안' });
    expect(v.titles).toEqual({ search: ['검색 제목'], homefeed: ['홈판 제목'] });
    expect(v.inflow.spots[0]).toEqual({ title: '질문', link: 'https://kin', where: '지식인', postdate: '2026-10-05', action: 'NOW', reason: '근거' });
    expect(v.inflow.answered).toBe(1);
    expect(JSON.stringify(v)).not.toContain('아주 긴 초안');
    expect(v.result.checks).toEqual([{ day: 3, rank: 4 }]);
  });
});

describe('제목 재료 연관어 — 엉뚱하게 번진 말은 뺀다', () => {
  // 실주행(2026-10-06 '자동차 보험 갱신'): '현대차'(665,800)가 섞여 '자동차 보험 갱신 현대차 어떤 정보가 있는지'가 나왔다. 사이트 postPlanSiteModel 과 같은 규칙.
  it('키워드 낱말 절반 이상을 담은 것만 · 검색량 큰 순 · 자기 자신 제외', () => {
    const items = [
      { keyword: '현대차', volume: 665800 },
      { keyword: '자동차보험비교', volume: 88000 },
      { keyword: '자동차 보험 갱신 방법', volume: 320 },
      { keyword: '자동차 보험 갱신', volume: 1600 },
      { keyword: '보험', volume: null },
    ];
    expect(relatedForTitles('자동차 보험 갱신', items)).toEqual([
      { keyword: '자동차보험비교', searchVolume: 88000 },
      { keyword: '자동차 보험 갱신 방법', searchVolume: 320 },
    ]);
  });
});
