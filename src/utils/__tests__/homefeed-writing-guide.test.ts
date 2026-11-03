/**
 * 홈판 벤치마크 카드 작성 안내(2026-10-10 사장님 "이렇게 쓰세요 · 반드시 · 넣지 말 것이 하드코딩 — '한겨울에 눈 내립니다' 같은 뻔한 소리.
 * 면밀하게 분석해서 가이드로서 정확한 역할 — 사람들이 트래픽을 가져올 수 있는 올바른 방향").
 * 재료: 소재 제목 · 요약 · 벤치마크 채널들이 쓴 제목(이미 나온 각도) · 네이버 자동완성(실제 검색 의도).
 */
import { describe, expect, it } from 'vitest';
import { buildGuidePrompt, validateGuide, guidesForCards, type GuideCard } from '../homefeed/writing-guide';

const card: GuideCard = {
  id: 'c1',
  keyword: '대전 동구동락 축제 리센느 가수',
  category: '문화·연예',
  title: '대전 동구동락 축제에 리센느 온다… 무대 일정 공개',
  summary: '대전 동구 동구동락 축제 둘째 날 저녁 무대에 걸그룹 리센느가 출연한다고 주최 측이 밝혔다.',
  sourceTitles: ['대전 동구동락 축제 라인업 리센느', '동구동락 축제 가수 리센느 출연 확정'],
  relatedKeywords: ['대전', '동구동락', '축제', '리센느'],
  searchSuggestions: ['동구동락 축제 라인업', '동구동락 축제 주차', '리센느 멤버', '동구동락 축제 일정'],
};

const good = {
  id: 'c1',
  direction: '동구동락 축제 라인업을 찾는 검색 수요가 있으니 검색을 노린다. 벤치마크는 리센느 출연만 다뤘으니 날짜별 무대 순서와 주차까지 한 글에 정리해 축제 가는 사람이 저장하게 만든다.',
  searchTargets: ['동구동락 축제 라인업', '동구동락 축제 주차', '없는 검색어 지어냄'],
  mustInclude: ['리센느 출연 날짜와 무대 시간(주최 측 공지 확인 필요)', '동구동락 축제 날짜별 라인업 표', '원문 링크와 발행일', '좋은 정보를 담는다'],
  mustAvoid: ['리센느 멤버 개인사 추측', '확인하지 않은 가격·정책·인물 주장을 사실로 단정'],
  checkBefore: ['동구동락 축제 주최 측(대전 동구청) 공지의 최종 출연 일정'],
};

describe('작성 안내 지시문', () => {
  it('재료 네 가지(제목 · 요약 · 채널들이 쓴 제목 · 자동완성)와 트래픽 방향(홈판 · 검색 · 빈 각도)을 묻는다', () => {
    const p = buildGuidePrompt([card]);
    for (const s of [card.title, card.summary, card.sourceTitles[1], '동구동락 축제 주차']) expect(p).toContain(s);
    expect(p).toMatch(/홈판/);
    expect(p).toMatch(/검색/);
    expect(p).toMatch(/비어 있는 각도|빈 각도/);
    expect(p).toMatch(/JSON/);
  });
});

describe('작성 안내 거르개 — 뻔한 말 · 재료 없는 말 · 지어낸 검색어는 버린다', () => {
  it('뻔한 문장(원문 링크와 발행일 · 확인하지 않은 … 단정)과 재료 낱말이 없는 항목을 버리고, 노릴 검색어는 자동완성에 있는 것만', () => {
    const g = validateGuide(card, good)!;
    expect(g.mustInclude).toEqual(['리센느 출연 날짜와 무대 시간(주최 측 공지 확인 필요)', '동구동락 축제 날짜별 라인업 표']);
    expect(g.mustAvoid).toEqual(['리센느 멤버 개인사 추측']);
    expect(g.searchTargets).toEqual(['동구동락 축제 라인업', '동구동락 축제 주차']);
    expect(g.checkBefore).toHaveLength(1);
    expect(g.direction).toContain('동구동락');
  });

  // 2026-10-10 실주행: 방향이 320자에서 단어 중간에 잘렸다("…공개일 캘린") — 넘치면 문장 끝에서 자른다
  it('긴 방향은 단어 중간이 아니라 문장 끝에서 자르고, 긴 항목은 버리지 않고 낱말 경계에서 줄인다', () => {
    const long = `${good.direction} ${'동구동락 축제 주차장은 행사장 옆 공영주차장을 쓰고 셔틀 시간표를 함께 정리한다. '.repeat(8)}`;
    const g = validateGuide(card, { ...good, direction: long, mustInclude: [...good.mustInclude.slice(0, 2), `동구동락 축제 날짜별 무대 순서와 리센느 출연 시각 정리표 ${'그리고 주변 먹거리 부스 위치 '.repeat(10)}`] })!;
    expect(g.direction.length).toBeLessThanOrEqual(420);
    expect(g.direction.endsWith('다.')).toBe(true);
    expect(g.mustInclude).toHaveLength(3);
    expect(g.mustInclude[2].length).toBeLessThanOrEqual(151);
    expect(g.mustInclude[2].endsWith('…')).toBe(true);
    expect(buildGuidePrompt([card])).toMatch(/300자 이내/);
  });

  it('반드시 들어갈 내용이 2개 미만으로 남거나 방향이 비면 안내 전체를 버린다(빈칸이 뻔한 말보다 낫다)', () => {
    expect(validateGuide(card, { ...good, mustInclude: ['원문 링크와 발행일', '리센느 출연 날짜'] })).toBeNull();
    expect(validateGuide(card, { ...good, direction: '' })).toBeNull();
    expect(validateGuide(card, { ...good, direction: '독자의 질문에 답하는 해설을 작성하세요. 정확한 정보를 담으세요.' })).toBeNull();
  });
});

describe('작성 안내 만들기 — 두뇌 답을 id 별로 거른다', () => {
  it('준 카드만 받고 · 못 읽는 답은 빈 결과(지어내지 않는다)', async () => {
    const out = await guidesForCards([card], async () => ({ reply: JSON.stringify([good, { ...good, id: '없는카드' }]), provider: 'fake' }));
    expect(out.results.map((r) => r.id)).toEqual(['c1']);
    expect(out.results[0].guide!.mustInclude).toHaveLength(2);
    const bad = await guidesForCards([card], async () => ({ reply: '말만 했어요', provider: 'fake' }));
    expect(bad.results).toEqual([]);
  });
});

// 2026-10-13 사장님 "오늘의 글감처럼 애드센스 · 홈판 벤치마킹도 글 쓰는 방향과 넣을 것 · 넣지 말 것 알려줘야" — 애드센스는 검색 유입 · 광고 수익 기준
describe('애드센스 작성 안내 지시문', () => {
  it('애드센스 모드는 검색 유입 · 고수 제목의 빈 각도 · 다시 찾을 이유를 묻고 홈판(피드 후킹) 판단은 묻지 않는다', () => {
    const p = buildGuidePrompt([card], 'adsense');
    expect(p).toMatch(/애드센스/);
    expect(p).toMatch(/검색/);
    expect(p).toMatch(/고수/);
    expect(p).not.toMatch(/홈판\(피드 후킹\)/);
    expect(p).toContain(card.sourceTitles[1]);
    expect(buildGuidePrompt([card])).toMatch(/홈판\(피드 후킹\)/);
  });
  it('안내 만들기는 모드를 지시문에 넘긴다', async () => {
    let asked = '';
    await guidesForCards([card], async (prompt) => { asked = prompt; return { reply: '[]', provider: 'fake' }; }, 'adsense');
    expect(asked).toMatch(/애드센스/);
  });
});

// 2026-10-20 사장님 "상황을 해결해 주거나 지식인에서 문제점을 보고 그걸 해결해 주는 글 · 행동을 유발하는 키워드를 같이 엮어서 제목에".
describe('애드센스 안내 — 지식인 문제 해결 · 행동 제목', () => {
  const ads: GuideCard = {
    id: 'ads-1', keyword: '기초연금 모의계산', category: '정부지원금·복지', title: '기초연금 기준 3가지, 나이·소득인정액·제외 대상 확인하기', summary: '',
    sourceTitles: ['기초연금 모의계산 방법 복지로', '기초연금 소득인정액 계산법'], relatedKeywords: [],
    searchSuggestions: ['기초연금 모의계산 사이트', '기초연금 모의계산기', '기초연금 수급자격 조회'],
    kinQuestions: [{ title: '기초연금 모의계산 처음 할 때 어떤 정보부터 넣나요', summary: '재산 금액을 어디까지 넣는지 모르겠어요', views: 1200 }, { title: '전세 보증금도 기초연금 소득인정액에 들어가나요', summary: '', views: 800 }],
  };

  it('지시문에 지식인 질문(조회수)과 해결 · 행동 제목 지시가 들어간다', () => {
    const prompt = buildGuidePrompt([ads], 'adsense');
    expect(prompt).toContain('지식인에서 실제로 묻는 것');
    expect(prompt).toContain('기초연금 모의계산 처음 할 때 어떤 정보부터 넣나요 (조회 1,200)');
    expect(prompt).toContain('solves');
    expect(prompt).toContain('actionTitles');
  });

  it('행동 제목은 행동을 부르는 말과 소재 낱말이 있어야 남고, 해결 항목도 소재 낱말이 있어야 남는다', () => {
    const guide = validateGuide(ads, {
      direction: '기초연금 모의계산에서 재산 금액 입력을 헷갈리는 문제를 풀어 준다. 복지로 입력 항목 순서대로 정리한다.',
      searchTargets: ['기초연금 모의계산기'],
      mustInclude: ['기초연금 소득인정액 계산 순서', '전세 보증금 반영 여부'],
      mustAvoid: [], checkBefore: [],
      solves: ['모의계산 재산 입력 헷갈림 → 기초연금 항목별 입력 예시', '정확한 정보를 담는다'],
      actionTitles: ['기초연금 모의계산 하는 법, 재산·전세 보증금 입력 순서 정리', '기초연금 이야기 총정리', '오늘 날씨 확인하는 법'],
    });
    expect(guide?.actionTitles).toEqual(['기초연금 모의계산 하는 법, 재산·전세 보증금 입력 순서 정리']);
    expect(guide?.solves).toEqual(['모의계산 재산 입력 헷갈림 → 기초연금 항목별 입력 예시']);
  });

  it('재료에 없는 숫자를 넣은 행동 제목은 버린다', () => {
    const guide = validateGuide(ads, {
      direction: '기초연금 모의계산에서 재산 금액 입력을 헷갈리는 문제를 풀어 준다.',
      mustInclude: ['기초연금 소득인정액 계산 순서', '전세 보증금 반영 여부'],
      actionTitles: ['기초연금 모의계산 신청 전 확인할 7가지', '기초연금 모의계산 조회 방법, 소득인정액 넣는 순서'],
    });
    expect(guide?.actionTitles).toEqual(['기초연금 모의계산 조회 방법, 소득인정액 넣는 순서']);
  });
});

// 2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지" — 판 종류와 무관한 '검색어' 모드(애드센스 지시문은 고수 블로그 전제라 쓰지 않는다).
describe('keyword 모드', () => {
  const kw: GuideCard = { id: 'k1', keyword: '연말정산 간소화', category: '세금·경제', title: '자료 조회 시점과 누락 자료 제출 절차', summary: '', sourceTitles: [], relatedKeywords: [], searchSuggestions: ['연말정산 간소화 자료 조회'], kinQuestions: [{ title: '연말정산 간소화 자료가 안 보여요', views: 300 }] };
  it('고수 블로그 전제 없이 지식인 문제 해결 · 행동 제목을 묻는다', () => {
    const prompt = buildGuidePrompt([kw], 'keyword');
    expect(prompt).not.toContain('애드센스 고수');
    expect(prompt).toContain('지식인에서 실제로 묻는 것');
    expect(prompt).toContain('actionTitles');
  });
});
