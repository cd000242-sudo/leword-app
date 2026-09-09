import { describe, expect, it } from 'vitest';
import { bigNumbersOf, buildKeywordBriefPrompt, measuredLines, validateKeywordBrief } from '../keyword-brief';
import type { FactCard } from '../topic-briefs';

/** 황금키워드 행 글감 브리프 — 실측 수치·뉴스 카드 밖의 날짜/숫자는 못 들어간다. */
const TODAY = new Date('2026-09-09T00:00:00Z');
const row = { keyword: '독감 무료접종 대상', topic: '건강', searchVolume: 2940, documentCount: 1200, openSlot: 3, serp: { exactTitleHits: 2 }, adDepth: 4, adCtrPc: 0.8, serpSections: ['파워링크', '인기글'], kinCount: 12, evidence: [{ code: 'fresh', text: '21시간 전 처음 관측' }] };
const facts: FactCard[] = [
    { id: 'f1', field: '건강', title: '독감 무료접종 9월 21일부터 시작', snippet: '어린이·임신부 대상, 약 1400만 명', press: 'kdca.go.kr', link: 'https://kdca.go.kr/1', publishedAt: '2026-09-08T01:00:00.000Z', dates: ['2026-09-21'] },
];
const good = { timing: 'NEXT', primaryIntent: '내가 무료 대상인지, 언제부터인지', value: '월 검색량 2,940 에 정면 글 2건뿐이고 3번째 자리가 비어 있다. 9월 21일부터 어린이·임신부 접종이 시작된다.', experience: '접종 경험은 절차 팁으로만', differentiation: '대상별 날짜 표', angle: '"나는 대상인가"에 답하는 글', factIds: ['f1'] };

describe('measuredLines · bigNumbersOf', () => {
    it('행의 실측 수치를 문장으로 만들고, 100 이상 숫자를 뽑는다', () => {
        const lines = measuredLines(row);
        expect(lines[0]).toBe('월 검색량 2,940');
        expect(lines).toContain('블로그탭 상위 10 중 3번째 자리가 비어 있음');
        expect(lines).toContain('21시간 전 처음 관측');
        expect(bigNumbersOf('검색량 2,940 · 정면 2건 · 1400만 · 0.8%')).toEqual(['2940', '1400']);
    });
});

describe('validateKeywordBrief', () => {
    it('실측 수치와 카드 안의 날짜·숫자만 쓰면 통과한다', () => {
        const r = validateKeywordBrief(good, row, facts, TODAY);
        expect(r.ok?.timing).toBe('NEXT');
        expect(r.ok?.facts[0]?.press).toBe('kdca.go.kr');
        expect(r.ok?.basis).toContain('뉴스 카드 1건');
    });
    it('근거에 없는 숫자(검색량 5,000)·날짜(9월 25일)는 떨어진다', () => {
        expect(validateKeywordBrief({ ...good, value: '월 검색량 5,000 이라 수요가 크다.' }, row, facts, TODAY).reason).toContain('5000');
        expect(validateKeywordBrief({ ...good, value: '9월 25일부터 시작된다.' }, row, facts, TODAY).reason).toContain('2026-09-25');
    });
    it('카드 없이도 수치만으로 ALWAYS 브리프는 된다 — NEXT 는 미래 날짜 근거가 있어야', () => {
        const r = validateKeywordBrief({ ...good, timing: 'ALWAYS', value: '월 검색량 2,940 인데 정면 글이 2건뿐이다.', factIds: [] }, row, [], TODAY);
        expect(r.ok?.basis).toContain('관련 뉴스 없음');
        expect(validateKeywordBrief({ ...good, value: '월 검색량 2,940 인데 정면 글이 2건뿐이다.', factIds: [] }, row, [], TODAY).reason).toContain('NEXT');
    });
    it('프롬프트는 수치와 카드 id 를 싣는다', () => {
        const p = buildKeywordBriefPrompt(row, facts, TODAY);
        expect(p).toContain('월 검색량 2,940');
        expect(p).toContain('[f1]');
        expect(buildKeywordBriefPrompt(row, [], TODAY)).toContain('뉴스 사실 카드 없음');
    });
});

describe('본문 카드 표기 걷기', () => {
    it('"(f4)"·"[f2, f3]"는 문장에서 빠진다', () => {
        const r = validateKeywordBrief({ ...good, value: '월 검색량 2,940 인데 정면 글이 2건뿐이다(f1). 상시 문의가 있다 [f1, f2].' }, row, facts, TODAY);
        expect(r.ok?.value).toBe('월 검색량 2,940 인데 정면 글이 2건뿐이다. 상시 문의가 있다.');
    });
});
