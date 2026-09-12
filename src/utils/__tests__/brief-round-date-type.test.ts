import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { todaysRounds, roundSlotOf, scheduledRound, timingOfFact, pickFactsForPrompt, buildBriefPrompt, validateBriefs } from '../topic-briefs';

/**
 * 예약 회차가 전부 죽던 것(2026-09-11, 내가 만든 회귀).
 *
 * 회차를 예약(github.event.schedule)으로 정하게 고치면서 today 를 Date → 문자열로 바꿨다.
 * 그런데 todaysRounds·pickFactsForPrompt·buildBriefPrompt·validateBriefs 가 전부 Date 를 받는다:
 *
 *   예약 '23 10 * * *' → 2026-09-11 저녁 회차로 기록한다     ← 회차 판정은 맞았는데
 *   오늘의 글감 실패: TypeError: kstNow.toISOString is not a function
 *       at todaysRounds (src/utils/topic-briefs.ts:662)
 *
 * 손으로 돌린 회차는 schedule 이 비어 planned 가 null → clockToday(Date) 라 멀쩡했다.
 * 그래서 내가 돌린 것만 되고 **예약만 조용히 전부 죽었다**(22:39·23:29 두 건 연속 실패).
 */
describe('회차 날짜는 Date 로 넘어간다', () => {
  it('todaysRounds 는 Date 를 받는다 — 문자열이면 죽는다', () => {
    expect(() => todaysRounds([], new Date('2026-09-11T00:00:00.000Z'))).not.toThrow();
    expect(() => todaysRounds([], '2026-09-11' as unknown as Date)).toThrow();
  });

  it('예약이 정한 날짜를 Date 로 바꿔 쓴다', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'topic-briefs.js'), 'utf8');
    expect(script, 'planned.day 를 그대로 넘기면 또 죽는다').not.toMatch(/const today = planned \? planned\.day/);
    expect(script).toContain('new Date(`${planned.day}T00:00:00.000Z`)');
  });

  it('그 Date 로도 회차 판정이 같다 — 바꿔 쓴 값이 틀리면 안 된다', () => {
    const planned = scheduledRound('23 10 * * *', new Date('2026-09-11T15:06:21Z'))!;
    expect(planned.day).toBe('2026-09-11');
    expect(planned.slot).toBe('저녁');
    // 스크립트가 만드는 그 Date
    const asDate = new Date(`${planned.day}T00:00:00.000Z`);
    expect(asDate.toISOString().slice(0, 10)).toBe('2026-09-11');
    // 자정으로 민 Date 라 시계 기준 회차는 '아침' 이 되지만, 실제 slot 은 planned 가 정한다.
    expect(roundSlotOf(asDate)).toBe('아침');
  });
});
/*
 * 2026-09-12에 이 테스트를 넓혔다.
 *
 * 오늘 예약이 세 번 돌았는데 **세 번 다 '이미 실렸다'며 건너뛰기만 했다.** 그래서
 * 예약이 회차를 실제로 *만드는* 길은 고친 뒤 아직 한 번도 안 지나갔다 — 건너뛰기가
 * 증명한 것은 네 지점 중 todaysRounds 하나뿐이다.
 * 나머지 셋(pickFactsForPrompt·buildBriefPrompt·validateBriefs)을 스크립트가 만드는
 * 바로 그 Date 로 여기서 직접 태운다. 회차를 기다리며 "되겠지" 하지 않는다.
 */
describe('예약이 회차를 만드는 길도 그 Date 로 지나간다', () => {
  /** 스크립트가 만드는 것과 같은 Date. planned.day 를 KST 자정으로 민 값이다. */
  const plannedDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

  const card = (id: string, publishedAt: string, dates: string[] = []) => ({
    id, field: '사회', title: `${id} 제목입니다`, snippet: '본문 조각입니다', press: '언론사',
    link: `https://example.test/${id}`, publishedAt, dates,
  });

  it('timingOfFact — 문자열이면 죽는다. Date 면 NOW/NEXT 를 가른다', () => {
    const today = plannedDate('2026-09-12');
    const fresh = card('f1', '2026-09-11T00:00:00.000Z');
    const future = card('f2', '2026-09-11T00:00:00.000Z', ['2026-10-01']);
    expect(timingOfFact(fresh, today)).toBe('NOW');
    expect(timingOfFact(future, today)).toBe('NEXT');
    expect(() => timingOfFact(fresh, '2026-09-12' as unknown as Date)).toThrow();
  });

  it('pickFactsForPrompt — 그 Date 로 사실을 고른다', () => {
    const today = plannedDate('2026-09-12');
    const facts = [card('f1', '2026-09-11T00:00:00.000Z'), card('f2', '2026-01-01T00:00:00.000Z')];
    const picked = pickFactsForPrompt(facts, today);
    expect(picked.map((f) => f.id)).toEqual(['f1']);   // 오래된 f2 는 빠진다
    expect(() => pickFactsForPrompt(facts, '2026-09-12' as unknown as Date)).toThrow();
  });

  it('buildBriefPrompt — 프롬프트에 그 날짜가 그대로 박힌다', () => {
    const today = plannedDate('2026-09-12');
    const prompt = buildBriefPrompt('사회', [card('f1', '2026-09-11T00:00:00.000Z')], today);
    expect(prompt).toContain('오늘은 2026-09-12(KST)다');
    expect(() => buildBriefPrompt('사회', [], '2026-09-12' as unknown as Date)).toThrow();
  });

  it('validateBriefs — 그 Date 로 검증이 돈다', () => {
    const today = plannedDate('2026-09-12');
    const facts = [card('f1', '2026-09-11T00:00:00.000Z')];
    // timing 을 빼면 '시기 없음'으로 먼저 떨어져서 날짜 코드까지 못 간다 — 그러면 검사가 헛돈다.
    const draft = [{ title: '이건 여덟 자가 넘는 제목입니다', factIds: ['f1'], coreKeyword: '검색어', timing: 'NOW', value: '본문 조각입니다' }];
    expect(() => validateBriefs(draft, facts, '사회', today)).not.toThrow();
    expect(() => validateBriefs(draft, facts, '사회', '2026-09-12' as unknown as Date)).toThrow();
  });

  it('오후 예약 크론이 오후 회차로 풀린다 — 12:23 KST', () => {
    // UTC 03:23 = 한국 12:23. 늦게 돌아도 예약이 정한 회차로 기록한다.
    const planned = scheduledRound('23 3 * * *', new Date('2026-09-12T05:40:00Z'))!;
    expect(planned.slot).toBe('오후');
    expect(planned.day).toBe('2026-09-12');
    expect(plannedDate(planned.day).toISOString().slice(0, 10)).toBe('2026-09-12');
  });
});
