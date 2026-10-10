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
