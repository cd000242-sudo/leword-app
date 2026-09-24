import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ board: { briefs: [] as any[] } }));
vi.mock('electron', () => ({ app: { getPath: () => 'fixture-user-data' }, ipcMain: {} }));
vi.mock('fs', () => ({ readFileSync: (file: string) => {
  if (String(file).replace(/\\/g, '/').endsWith('/topic-briefs/latest.json')) return JSON.stringify(state.board);
  throw new Error('fixture has no other board');
} }));

import { gatherCandidates } from '../../main/handlers/daily-pick';

const sentence = '지역 축제 사전등록은 무료다.';
const brief = (): any => ({
  title: '지역 축제 참가 전에 확인할 사항', titles: [{ target: '설명', type: '설명형', text: '지역 축제 사전등록 비용 안내' }],
  field: '생활', timing: 'NOW', types: [], coreKeyword: '지역 축제', keywords: ['지역 축제'], factIds: ['f1'],
  primaryIntent: '사전등록 비용 확인', differentiation: '등록 비용부터 설명', value: sentence,
  searchVolume: 500, serpFacing: 1, serpVacancy: 1, serpFit: '높음', star: true,
  facts: [{ id: 'f1', title: '지역 축제 사전등록 안내', snippet: sentence, press: '공식 안내', link: 'https://example.test/festival', publishedAt: '2026-09-24T00:00:00Z' }],
  editorial: { version: 2, status: 'supported', review: { passed: true, issues: [] }, summary: sentence,
    audience: '축제 방문을 준비하는 사람', angle: '등록 비용 확인', outline: ['등록 비용'], missing: [],
    answers: [{ question: '등록 비용은 얼마인가?', answer: sentence, factIds: ['f1'], excerpts: [{ factId: 'f1', text: sentence }] }] },
});

describe('오늘 쓸 한 편의 글감 작성안 준비 상태', () => {
  it('실제 저장판 로드·정규화를 거친 검토 완료 작성안의 제목과 작성가치를 전달한다', () => {
    state.board = { briefs: [brief()] };
    const rows = gatherCandidates();
    expect(rows).toHaveLength(1);
    expect(rows[0].titles).toEqual([{ label: '설명', text: '지역 축제 사전등록 비용 안내' }]);
    expect(rows[0].why).toBe(sentence);
    expect(rows[0]).toMatchObject({ keyword: '지역 축제', source: '오늘의 글감', searchVolume: 500 });
  });

  it.each(['조사 필요', '검토 미완료', '잘못된 검토 형식', '이전 자료'])('%s 후보는 검색어와 출처를 보존하되 제목 대신 추가 확인 안내를 전달한다', (status) => {
    const row = brief();
    if (status === '조사 필요') { row.editorial.status = 'needs_research'; row.editorial.missing = ['등록 마감일 확인 필요']; }
    if (status === '검토 미완료') row.editorial.review = { passed: false, issues: ['등록 방식 확인 필요'] };
    if (status === '잘못된 검토 형식') row.editorial.review = { passed: true, issues: '등록 방식 확인 필요' };
    if (status === '이전 자료') delete row.editorial;
    state.board = { briefs: [row] };
    const rows = gatherCandidates();
    expect(rows).toHaveLength(1);
    expect(rows[0].titles).toEqual([]);
    expect(rows[0].why).toContain('추가 확인이 필요한 조사 주제입니다.');
    expect(rows[0].why).not.toContain(sentence);
    if (status === '조사 필요') expect(rows[0].why).toContain('등록 마감일 확인 필요');
    expect(rows[0]).toMatchObject({ keyword: '지역 축제', source: '오늘의 글감', searchVolume: 500 });
    expect(rows[0].facts[0].link).toBe('https://example.test/festival');
  });
});
