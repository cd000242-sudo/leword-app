import { describe, expect, it, vi } from 'vitest';
import { generateBriefInventory, isBriefRoundComplete, preserveRicherBriefRound } from '../../main/topic-brief-inventory';
import type { FactCard, TopicBrief, BriefRound } from '../topic-briefs';

const today = new Date('2026-09-28T00:00:00Z');
const fact = (id = 'f1', field = '지원금'): FactCard => ({ id, field, title: `${id} 신청 대상 안내`, snippet: '해당 사업의 신청 대상은 지역에 거주하는 시민입니다. 신청 전 공고에서 자격을 확인해야 합니다.', press: '공식 기관', link: `https://example.org/${id}`, publishedAt: '2026-09-28T00:00:00Z', dates: [] });
const draft = (keyword: string, source = fact()) => ({ title: `${keyword} 신청 대상 확인하기`, coreKeyword: keyword, timing: 'NOW', types: ['정보형'], primaryIntent: '누가 신청할 수 있나요?', value: source.snippet, experience: '', differentiation: '신청 대상을 먼저 설명합니다.', keywords: [keyword], factIds: [source.id], editorial: { version: 2, status: 'supported', summary: source.snippet, audience: '공고 신청을 준비하는 독자', answers: [{ question: '누가 신청할 수 있나요?', answer: source.snippet, factIds: [source.id], excerpts: [{ factId: source.id, text: source.snippet }] }], missing: [], outline: ['신청 대상'], angle: '신청 전 자격을 확인합니다.' } });
const row = (keyword: string): TopicBrief => ({ ...draft(keyword), timing: 'NOW', editorial: undefined, field: '지원금', facts: [fact()], searchVolume: null, serpFacing: null, serpVacancy: null, serpFit: '미측정', star: false });
const round = (keywords: string[], at = '2026-09-28T00:00:00Z', slot: BriefRound['slot'] = '아침'): BriefRound => ({ slot, builtAt: at, briefs: keywords.map(row), counts: { briefs: keywords.length, now: keywords.length, next: 0, always: 0, star: 0 } });
const passed = (count: number) => JSON.stringify(Array.from({ length: count }, (_, index) => ({ index, passed: true, issues: [] })));

describe('bounded topic brief inventory', () => {
  it('visits every field once, then refills priority fields until the goal, without mutating facts', async () => {
    const fields = [{ field: '스포츠', facts: [fact('sport', '스포츠')] }, { field: '지원금', facts: [fact('grant', '지원금')] }];
    const before = JSON.stringify(fields);
    const visits: string[] = [];
    const run = vi.fn(async (_prompt, context) => {
      if (context.stage === 'review') return passed(context.count);
      visits.push(`${context.pass}:${context.field}`);
      const source = fields.find(item => item.field === context.field)!.facts[0];
      return JSON.stringify([draft(context.pass ? '추가 지원' : context.field, source)]);
    });
    const result = await generateBriefInventory({ fields, today, goal: 3, run });
    expect(visits).toEqual(['0:스포츠', '0:지원금', '1:지원금']);
    expect(result.inventory).toMatchObject({ actualCount: 3, targetCount: 3, complete: true, shortfall: 0, refillRounds: 1 });
    expect(result.briefs.every(item => item.editorial?.review?.passed)).toBe(true);
    expect(JSON.stringify(fields)).toBe(before);
  });

  it('deduplicates keywords across fields, refill passes, and prior rounds', async () => {
    const run = vi.fn(async (_prompt, context) => context.stage === 'review' ? passed(context.count) : JSON.stringify([
      draft('같은 키워드'), draft('같은키워드'), draft('ＳＡＭＥ'), draft('same'), draft('지난 키워드'),
    ]));
    const result = await generateBriefInventory({ fields: [{ field: '지원금', facts: [fact()] }, { field: '사업', facts: [fact()] }], today, priorRounds: [round(['지난키워드'])], run });
    expect(result.briefs.map(item => item.coreKeyword)).toEqual(['같은 키워드', 'ＳＡＭＥ']);
    expect(result.inventory).toMatchObject({ actualCount: 2, targetCount: 30, complete: false, shortfall: 28, refillRounds: 2 });
    expect(result.inventory.shortfallReason).toBeTruthy();
    expect(run.mock.calls.filter(call => call[1].stage === 'generate')).toHaveLength(6);
    expect(run.mock.calls[2][0]).toContain('같은 키워드');
  });

  it('isolates generation failures and bounds refill rounds even when the caller requests more', async () => {
    const onProgress = vi.fn();
    const run = vi.fn(async (_prompt, context) => {
      if (context.field === '지원금') throw new Error('PRIVATE_TOKEN=secret');
      return context.stage === 'review' ? passed(context.count) : JSON.stringify([draft('사업 신청')]);
    });
    const result = await generateBriefInventory({ fields: [{ field: '지원금', facts: [fact()] }, { field: '사업', facts: [fact()] }], today, run, maxRefillRounds: 99, onProgress });
    expect(result.briefs).toHaveLength(1);
    expect(result.inventory.refillRounds).toBe(2);
    expect(result.inventory.failures).toHaveLength(3);
    expect(JSON.stringify([result, onProgress.mock.calls])).not.toContain('PRIVATE_TOKEN');
  });

  it('review failure preserves honest needs_research rows and reports the failure', async () => {
    const run = vi.fn(async (_prompt, context) => {
      if (context.stage === 'review') throw new Error('private');
      return JSON.stringify([draft('지원 사업')]);
    });
    const result = await generateBriefInventory({ fields: [{ field: '지원금', facts: [fact()] }], today, goal: 1, run });
    expect(result.briefs[0].editorial?.status).toBe('needs_research');
    expect(result.inventory.failures[0].stage).toBe('review');
    expect(result.briefs[0].star).toBe(false);
  });

  it('refills from fresh supplied facts and rotates uncited facts without manufacturing fallback rows', async () => {
    const first = fact('f1'), second = fact('f2');
    const refreshFacts = vi.fn().mockResolvedValue([second]);
    const prompts: string[] = [];
    const run = vi.fn(async (prompt, context) => {
      if (context.stage === 'review') return passed(context.count);
      prompts.push(prompt);
      return JSON.stringify([draft(context.pass ? '추가 사업' : '첫 사업', context.pass ? second : first)]);
    });
    const result = await generateBriefInventory({ fields: [{ field: '지원금', facts: [first] }], today, goal: 2, run, refreshFacts });
    expect(result.briefs).toHaveLength(2);
    expect(refreshFacts).toHaveBeenCalledTimes(1);
    expect(prompts[1].indexOf('[f2]')).toBeLessThan(prompts[1].indexOf('[f1]'));
    const empty = await generateBriefInventory({ fields: [{ field: '지원금', facts: [] }], today, run: vi.fn(), maxRefillRounds: 0 });
    expect(empty.briefs).toEqual([]);
    expect(empty.inventory).toMatchObject({ complete: false, actualCount: 0, shortfall: 30 });
  });

  it('stops refill as soon as enough unique rows exist but never skips first-pass fields', async () => {
    const visits: string[] = [];
    const run = vi.fn(async (_prompt, context) => {
      if (context.stage === 'review') return passed(context.count);
      visits.push(context.field);
      return JSON.stringify([draft(context.field)]);
    });
    const result = await generateBriefInventory({ fields: ['지원금', '경제', '이슈'].map(field => ({ field, facts: [fact()] })), today, goal: 1, run });
    expect(visits).toEqual(['지원금', '경제', '이슈']);
    expect(result.inventory.refillRounds).toBe(0);
  });

  it('rotates uncited evidence when the first pass finds no usable topics', async () => {
    const facts = ['f1', 'f2', 'f3', 'f4'].map(id => fact(id));
    const prompts: string[] = [];
    const run = vi.fn(async (prompt, context) => {
      if (context.stage === 'review') return passed(context.count);
      prompts.push(prompt);
      return JSON.stringify(context.pass ? [draft('새로운 사업', facts[3])] : []);
    });
    const result = await generateBriefInventory({ fields: [{ field: '지원금', facts }], today, goal: 1, run });
    expect(result.briefs).toHaveLength(1);
    expect(prompts[1].indexOf('[f4]')).toBeLessThan(prompts[1].indexOf('[f1]'));
  });

  it('propagates cancellation after generation or review instead of refilling or returning partial rows', async () => {
    for (const cancelledStage of ['generate', 'review']) {
      let cancelled = false;
      const run = vi.fn(async (_prompt, context) => {
        if (context.stage === cancelledStage) cancelled = true;
        return context.stage === 'review' ? passed(context.count) : JSON.stringify([draft('신청 지원')]);
      });
      await expect(generateBriefInventory({ fields: [{ field: '지원금', facts: [fact()] }, { field: '사업', facts: [fact()] }], today, run, cancelled: () => cancelled })).rejects.toThrow('취소');
      expect(run).toHaveBeenCalledTimes(cancelledStage === 'generate' ? 1 : 2);
    }
  });
});

describe('inventory publication guards', () => {
  it('stops starting generation when its total time budget expires', async () => {
    const run = vi.fn();
    let tick=0;
    const result=await generateBriefInventory({fields:[{field:'지원금',facts:[fact()]}],today,run,now:()=>tick++ ? 200 : 0,maxDurationMs:100});
    expect(run).not.toHaveBeenCalled();
    expect(result.inventory.complete).toBe(false);
    expect(result.inventory.failures[0].reason).toMatch(/시간 한도/);
  });
  const keywords = Array.from({ length: 30 }, (_, i) => `검색어 ${i}`);
  it('marks a scheduled slot done only with at least 30 unique rows', () => {
    expect(isBriefRoundComplete(round(keywords))).toBe(true);
    expect(isBriefRoundComplete(round(keywords.slice(0, 29)))).toBe(false);
    expect(isBriefRoundComplete(round(Array(30).fill('같은 검색어')))).toBe(false);
    expect(isBriefRoundComplete(undefined)).toBe(false);
  });
  it('keeps the richer same-day same-slot board and its original timestamp', () => {
    const previous = round(keywords), next = round(keywords.slice(0, 12), '2026-09-28T01:00:00Z');
    expect(preserveRicherBriefRound(next, previous)).toBe(previous);
    expect(preserveRicherBriefRound(previous, next)).toBe(previous);
    expect(preserveRicherBriefRound(next, round(keywords, '2026-09-27T00:00:00Z'))).toBe(next);
    expect(preserveRicherBriefRound(next, round(keywords, undefined, '오후'))).toBe(next);
  });
});
