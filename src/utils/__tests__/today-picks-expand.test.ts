/**
 * 추천키워드 연관어 확장(2026-10-11 사장님 "설계해서 진행해봐") — 어제 실린 말 금지 뒤 황금이 171 · 12주제 0개라,
 * 그날 찾은 황금(없으면 큰 후보)을 씨앗으로 검색광고 연관어를 받아 새 황금을 캔다. 연관어는 검색량이 같이 와서 문서 수만 잰다.
 */
import { describe, expect, it } from 'vitest';
const { expansionSeeds, relatedCandidates } = require('../../../scripts/today-picks-expand');

const r = (keyword: string, searchVolume: number, ratio = 0.5) => ({ keyword, searchVolume, documentCount: Math.round(searchVolume / ratio), ratio });

describe('확장 씨앗', () => {
  it('그 주제 황금을 검색량 큰 순으로 k개, 모자라면 큰 후보로 채운다(같은 말은 한 번)', () => {
    expect(expansionSeeds([r('황금작은', 900, 2), r('황금큰', 50000, 3)], [r('후보큰', 80000), r('황금큰', 50000)], 3)).toEqual(['황금큰', '황금작은', '후보큰']);
    expect(expansionSeeds([], [r('a', 1000), r('b', 3000)], 1)).toEqual(['b']);
  });
});

describe('연관어 후보', () => {
  const sugg = (keyword: string, total: number | null, more = {}) => ({ keyword, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: total, ...more });
  const opts = { minVolume: 500, isOpen: (k: string) => k !== '김도영 연봉', measured: new Set(['김도영나이']) /* 본 스크립트처럼 띄어쓰기 뺀 키 */, guard: (k: string) => k.length >= 2 && k.length <= 15 };
  it('씨앗 낱말을 담은 말만 · 검색량 하한 · 어제 실린 말 · 이미 잰 말 · 걸러내기 · 추정 검색량은 뺀다 — 검색량 큰 순', () => {
    const list = [
      sugg('김도영 홈런', 12000), sugg('김도영 연봉', 9000), sugg('김도영 나이', 30000), sugg('홈런왕', 40000),
      sugg('김도영 여자친구', 300), sugg('김도영 타율', 4000), sugg('김도영 기록', 5000, { svEstimated: true }), sugg('김도영 홈런 몇개 2026 시즌 최종 기록', 2000), sugg('김도영', 90000),
    ];
    const got = relatedCandidates('김도영', list, opts);
    expect(got.map((c: any) => [c.keyword, c.searchVolume, c.source])).toEqual([['김도영 홈런', 12000, 'related'], ['김도영 타율', 4000, 'related']]);
  });
  it('여러 낱말 씨앗은 2자 이상 낱말 중 하나라도 담으면 같은 갈래', () => {
    const got = relatedCandidates('제주 단풍 명소', [sugg('제주 가을 여행', 8000), sugg('단풍 시기', 20000), sugg('서울 맛집', 9000)], { ...opts, isOpen: () => true, measured: new Set() });
    expect(got.map((c: any) => c.keyword)).toEqual(['단풍 시기', '제주 가을 여행']);
  });
});

// 2026-10-11 실주행: 연관어엔 띄어쓰기가 없어 '씨앗 낱말 통째로 담기'가 같은 갈래까지 버렸다(인스타스토리 → 인스타그램스토리 ×)
describe('연관어 관련도 — 띄어쓰기 없는 말', () => {
  const sugg = (keyword: string, total: number) => ({ keyword, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: total });
  const open = { minVolume: 500, isOpen: () => true, measured: new Set<string>(), guard: () => true };
  it('씨앗이 4자 이상이면 연속 3자가 겹치는 말은 같은 갈래, 3자 이하면 통째로 담아야', () => {
    const got = relatedCandidates('인스타스토리', [sugg('인스타그램스토리', 2030), sugg('인스타팔로워늘리기', 2070), sugg('카드뉴스만들기', 1250), sugg('페이스북광고관리자', 1060)], open);
    expect(got.map((c: any) => c.keyword)).toEqual(['인스타팔로워늘리기', '인스타그램스토리']);
    expect(relatedCandidates('청춘', [sugg('청춘기록', 3000), sugg('청년도약계좌', 9000)], open).map((c: any) => c.keyword)).toEqual(['청춘기록']);
  });
});
