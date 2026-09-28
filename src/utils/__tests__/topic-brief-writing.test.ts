import { describe, expect, it, vi } from 'vitest';
import { validateBriefWritingDraft } from '../topic-brief-writing';
import { generateBriefWritingPackages } from '../../main/topic-brief-writing-pipeline';
import type { FactCard, TopicBrief } from '../topic-briefs';

const fact: FactCard = { id: 'f1', field: '생활', title: '도서관 이용 공고', snippet: '이 도서관은 누구나 무료로 이용할 수 있습니다. 이용 시간은 평일 오전 9시부터 오후 6시까지입니다.', press: '도서관', link: 'https://library.example/notice', publishedAt: '2026-09-28T00:00:00Z', dates: [] };
const brief = (): TopicBrief => ({ title: '도서관 이용 시간과 이용 대상', coreKeyword: '도서관 이용', field: '생활', timing: 'ALWAYS', types: ['정보형'], primaryIntent: '누가 언제 이용하나요?', value: fact.snippet, experience: '', differentiation: '', keywords: ['도서관 이용'], factIds: ['f1'], facts: [fact], searchVolume: null, serpFacing: null, serpVacancy: null, serpFit: '미측정', star: false, editorial: { version: 2, status: 'supported', summary: fact.snippet, audience: '도서관을 이용하려는 독자', answers: [{ question: '누가 이용하나요?', answer: fact.snippet, factIds: ['f1'], excerpts: [{ factId: 'f1', text: fact.snippet }] }], missing: [], outline: ['이용 대상', '이용 시간'], angle: '방문 전 확인', review: { passed: true, issues: [] } } });
const draft = () => ({ version: 1 as const, status: 'ready', title: '도서관 이용 시간과 이용 대상', intro: '도서관을 방문하려면 먼저 이용 대상과 운영 시간을 확인해야 합니다. 공고에서 확인한 내용을 정리합니다.', sections: [{ heading: '누가 이용할 수 있나요?', paragraphs: ['이 도서관은 누구나 무료로 이용할 수 있습니다. 이용 대상과 비용을 함께 확인할 수 있습니다.'], factIds: ['f1'] }, { heading: '언제 이용할 수 있나요?', paragraphs: ['이용 시간은 평일 오전 9시부터 오후 6시까지입니다. 평일 방문을 계획한다면 이 시간을 기준으로 준비하세요.'], factIds: ['f1'] }], table: { caption: '방문 전 확인', headers: ['항목', '내용'], rows: [['대상', '누구나'], ['운영 시간', '평일 오전 9시부터 오후 6시']], factIds: ['f1'] }, faq: [{ question: '이용료가 있나요?', answer: '공고에 따르면 이 도서관은 누구나 무료로 이용할 수 있습니다.', factIds: ['f1'] }], conclusion: '방문 전에는 운영 시간을 다시 확인하세요. 안내한 대상과 시간은 제공된 공고를 기준으로 정리했습니다.', nextSteps: ['공고 링크에서 운영 시간의 변경 여부를 확인하세요.'], missing: [], sourceIds: ['f1'], reviewedAt: '2000-01-01T00:00:00Z' });
const review = (passed = true) => JSON.stringify({ passed, issues: passed ? [] : ['이용 대상에 대한 근거가 부족합니다.'] });

describe('검증된 자료 기반 작성 패키지', () => {
  it('모델이 스스로 ready와 검수 시간을 지정할 수 없다', () => {
    const value = validateBriefWritingDraft(draft(), [fact]);
    expect(value?.status).toBe('needs_research'); expect(value?.reviewedAt).toBe('');
  });
  it('생성 후 별도 검수 성공 때만 ready로 공개하고 추천/검색량은 바꾸지 않는다', async () => {
    const run = vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce(review());
    const input = brief(); const snapshot = JSON.stringify(input);
    const result = await generateBriefWritingPackages([input], [fact], run, { now: () => new Date('2026-09-28T02:00:00Z') });
    expect(run).toHaveBeenCalledTimes(2); expect(run.mock.calls[1][0]).toContain('독립 검토');
    expect(result[0].writingPackage?.status).toBe('ready'); expect(result[0].writingPackage?.reviewedAt).toBe('2026-09-28T02:00:00.000Z');
    expect(result[0].star).toBe(false); expect(result[0].searchVolume).toBeNull(); expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('내용 검토 전/추가확인 글감은 생성 대상에 넣지 않는다', async () => {
    const a = brief(); a.editorial!.missing = ['휴일 운영 확인'];
    const b = brief(); b.editorial!.review = { passed: false, issues: [] };
    const c = brief(); c.editorial!.status = 'needs_research';
    const run = vi.fn(); const result = await generateBriefWritingPackages([a, b, c], [fact], run);
    expect(run).not.toHaveBeenCalled(); expect(result.every(item => !item.writingPackage)).toBe(true);
  });
  it('할당량 실패/잘린 JSON/검수 실패를 완료 상태로 만들지 않는다', async () => {
    for (const run of [vi.fn().mockRejectedValue(new Error('quota')), vi.fn().mockResolvedValue('{"title":'), vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce(review(false)), vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockRejectedValue(new Error('quota')), vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce('{"passed":true}'), vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce('{"passed":true,"issues":["확인 필요"]}')]) {
      const result = await generateBriefWritingPackages([brief()], [fact], run);
      expect(result[0].writingPackage?.status).not.toBe('ready');
    }
  });
  it('없는 출처/위험한 링크/제목뿐인 문단/빈 표/빈 FAQ/부분 자료를 거부한다', () => {
    const changes = [(d: any) => d.sourceIds = ['f404'], (d: any) => d.sections[0].factIds = [], (d: any) => d.sections[0].paragraphs = ['확인하세요'], (d: any) => d.table.rows = [['대상']], (d: any) => d.faq = [], (d: any) => d.missing = ['대상 조건 미확인'], (d: any) => d.sections = [], (d: any) => d.sections[1].factIds = ['f404'], (d: any) => d.sourceIds = [], (d: any) => d.table.headers = ['항목'], (d: any) => d.faq[0].factIds = [], (d: any) => d.nextSteps = []];
    for (const change of changes) { const value = draft(); change(value); expect(validateBriefWritingDraft(value, [fact])).toBeNull(); }
    for (const link of ['javascript:alert(1)', 'data:text/plain,hello', 'https://user:password@example.com/']) expect(validateBriefWritingDraft(draft(), [{ ...fact, link }])).toBeNull();
  });
  it('필요 없는 표는 null로 두되 없는 경험을 주장한 원고는 거부한다', () => {
    expect(validateBriefWritingDraft({ ...draft(), table: null }, [fact])).not.toBeNull();
    expect(validateBriefWritingDraft({ ...draft(), intro: '제가 직접 방문해 보니 공고보다 훨씬 편리했습니다. 저는 여러 번 이용해 봤습니다.' }, [fact])).toBeNull();
  });
  it('유효한 기존 패키지는 할당량 실패에도 보존하고 배치 상한을 지킨다', async () => {
    const saved = { ...draft(), status: 'ready' as const, reviewedAt: '2026-09-28T01:00:00Z' };
    const prior = { ...brief(), writingPackage: saved };
    const run = vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce(review());
    const result = await generateBriefWritingPackages([prior, brief(), brief()], [fact], run, { maxPackages: 1 });
    expect(result[0].writingPackage).toEqual(saved); expect(result[1].writingPackage?.status).toBe('ready'); expect(result[2].writingPackage).toBeUndefined(); expect(run).toHaveBeenCalledTimes(2);
  });
  it('같은 ID의 다른 URL 자료를 원문으로 받아들이지 않는다', async () => {
    const run = vi.fn(); const result = await generateBriefWritingPackages([brief()], [{ ...fact, link: 'https://unrelated.example/changed' }], run);
    expect(run).not.toHaveBeenCalled(); expect(result[0].writingPackage).toBeUndefined();
  });
  it('손상되었거나 미래 시각인 저장 원고는 생성 실패 시에도 ready로 남기지 않는다', async () => {
    for (const writingPackage of [{ ...draft(), sections: [] }, { ...draft(), reviewedAt: '2099-01-01T00:00:00Z' }]) {
      const result = await generateBriefWritingPackages([{ ...brief(), writingPackage } as any], [fact], vi.fn().mockRejectedValue(new Error('quota')));
      expect(result[0].writingPackage).toBeUndefined();
    }
  });
  it('시도 횟수와 실패 단계를 보고하고 외부 오류 원문은 노출하지 않는다', async () => {
    const onAttempt = vi.fn(), onIssue = vi.fn();
    await generateBriefWritingPackages([brief()], [fact], vi.fn().mockRejectedValue(new Error('secret-token-123')), { onAttempt, onIssue });
    expect(onAttempt).toHaveBeenCalledTimes(1); expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0][0].stage).toBe('generate'); expect(JSON.stringify(onIssue.mock.calls)).not.toContain('secret-token');
    const run = vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce(review(false));
    await generateBriefWritingPackages([brief()], [fact], run, { onIssue });
    expect(onIssue.mock.calls[1][0]).toMatchObject({ stage: 'review', reason: '이용 대상에 대한 근거가 부족합니다.' });
  });
});

