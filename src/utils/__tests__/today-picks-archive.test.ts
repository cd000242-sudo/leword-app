/**
 * 추천키워드 날짜별 보관함(2026-10-11 사장님 "어제 꺼는 어떻게 보니?") — 매일 새 키워드로 바뀌니 지난 판을 날짜별로 남긴다.
 * 사이트의 [어제 · 그제] 보기와, 그제 이전 황금을 다시 재는 재료로 함께 쓴다. 7일만 남긴다.
 */
import { describe, expect, it } from 'vitest';
const { archiveEntry, planArchive } = require('../../../scripts/today-picks-archive');

const board = { builtAt: '2026-10-10T22:58:01.833Z', round: { id: '2026-10-11-morning', label: '오전' }, keep: 30, minRatio: 1, upcomingMonths: [10, 11], novelty: { newCount: 960 }, topics: [{ topic: '경제', rows: [{ keyword: '가' }] }], history: { windowDays: 7, entries: [{ keyword: '가' }], days: {} }, changes: {}, measurements: {} };

describe('추천키워드 날짜별 보관함', () => {
 it('보관본은 판 날짜(KST)로 이름 짓고, 이력(history) 같은 큰 칸은 뺀다', () => {
  const entry = archiveEntry(board);
  expect(entry.day).toBe('2026-10-11');
  expect(entry.board.topics).toEqual(board.topics);
  expect('history' in entry.board).toBe(false);
  expect(entry.board.round.id).toBe('2026-10-11-morning');
 });
 it('7일이 지난 날짜는 지우고, 목록은 최신순(오늘 판 포함)', () => {
  const plan = planArchive(board, ['2026-10-03', '2026-10-04', '2026-10-09', '2026-10-10', '2026-10-11'], 7);
  expect(plan.day).toBe('2026-10-11');
  expect(plan.remove).toEqual(['2026-10-03', '2026-10-04']);
  expect(plan.index.days).toEqual(['2026-10-11', '2026-10-10', '2026-10-09']);
 });
});
