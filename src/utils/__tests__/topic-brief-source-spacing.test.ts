import { describe, it, expect } from 'vitest';
import { claimIssue } from '../topic-brief-evidence';
import { validateBriefs, type FactCard } from '../topic-briefs';
const today = new Date('2026-09-28T00:00:00Z');
const facts: FactCard[] = [{id:'f1',field:'사업',title:'청년 창업 지원',snippet:'지원사업은 10월6일까지 신청할 수 있다.',press:'공고',link:'https://example.test/notice',publishedAt:today.toISOString(),dates:['2026-10-06']}];
describe('source spacing and named program keywords', () => {
  it('accepts supported dates regardless of spaces but still rejects different dates', () => {
    expect(claimIssue('10월 6일까지 신청',facts,today)).toBeNull();
    expect(claimIssue('10월 7일까지 신청',facts,today)).toMatch(/근거에 없는/);
  });
  it('preserves a six-word exact named core while excluding sentence-shaped expansion candidates', () => {
    const keyword='제천시 청년 개인택시 창업 지원 사업';
    const result=validateBriefs([{title:keyword+' 안내',coreKeyword:keyword,keywords:[keyword,'가을 진드기 물림 예방 수칙 정리'],timing:'NOW',factIds:['f1'],value:''}],facts,'사업',today);
    expect(result.ok[0]?.coreKeyword).toBe(keyword);
    expect(result.ok[0]?.keywords).toEqual([keyword]);
  });
});
