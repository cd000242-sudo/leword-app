import { describe, expect, it } from 'vitest';
import {
    BRIEF_FIELDS, applyMeasuredVolumes, buildBriefPrompt, carrySeats, dropRepeats, excludeListOf, extractDates, extractFutureMonths, kstToday, markStars, pickFactsForPrompt, roundCounts, roundSlotOf, serpFitOf, timingOfFact, toFactCards, todaysRounds, validateBriefs,
    type BriefRound, type FactCard, type TopicBrief,
} from '../topic-briefs';

/** 오늘의 글감 브리프(NOW/NEXT/ALWAYS) — 순수 부분: 날짜 읽기·시기·검증기·적합성. */
const TODAY = new Date('2026-09-09T00:00:00Z');
const item = (title: string, description: string, pubDate: string, link = 'https://www.korea.kr/news/1') => ({ title, description, pubDate, link, originallink: link });

describe('extractDates', () => {
    it('"9월 11일"·"2026년 9월 21일"·"10월 7일"을 발행일 연도로 ISO 로 만든다', () => {
        expect(extractDates('개인정보보호법 9월 11일 시행, 접종은 2026년 9월 21일부터, 발사는 10월 7일', '2026-09-08T00:00:00Z')).toEqual(['2026-09-11', '2026-09-21', '2026-10-07']);
    });
    it('12월 기사의 "1월 3일"은 다음 해다', () => {
        expect(extractDates('1월 3일 시행', '2026-12-20T00:00:00Z')).toEqual(['2027-01-03']);
    });
    it('달 없는 "오는 11일부터"·"지난 3일"·"내달 1일"은 발행일 기준으로 달을 붙이고, 기간(3일간·7일 이내)은 안 센다', () => {
        expect(extractDates('오는 11일부터 접수, 지난 3일 발표, 내달 1일 시행. 3일간 진행, 7일 이내 신청', '2026-09-08T00:00:00Z'))
            .toEqual(['2026-09-03', '2026-09-11', '2026-10-01']);
        expect(extractDates('지난 28일 발표, 5일 개막', '2026-09-02T00:00:00Z')).toEqual(['2026-08-28', '2026-09-05']);
    });
    it('"10월 7일"을 읽은 뒤 그 "7일"을 이번 달로 또 세지 않는다', () => {
        expect(extractDates('발사는 10월 7일', '2026-09-08T00:00:00Z')).toEqual(['2026-10-07']);
    });
    it('kstToday 는 ISO 날짜 자리가 한국 날짜다', () => {
        expect(kstToday(new Date('2026-09-08T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-09');
    });
});

describe('extractFutureMonths — 날 없는 예정 달', () => {
    it('"내년 1월"·"10월 중"·"다음 달부터"는 발행일 이후의 달 1일로, "9월 21일"처럼 날이 붙은 것과 지난 달은 안 센다', () => {
        expect(extractFutureMonths('내년 1월 결합보증 도입, 10월 중 발표, 다음 달부터 시행. 9월 21일 접종. 지난 3월 통계', '2026-09-08T00:00:00Z'))
            .toEqual(['2026-10-01', '2027-01-01']);
    });
    it('올해 9월 기사의 "9월"은 예정이 아니다', () => {
        expect(extractFutureMonths('9월 물가 동향', '2026-09-08T00:00:00Z')).toEqual([]);
    });
    it('예정 달만 있는 카드도 NEXT 다', () => {
        const card: FactCard = { id: 'f1', field: 'x', title: '청년 월세 결합보증 내년 1월 도입', snippet: '', press: 'p', link: 'l', publishedAt: '2026-09-08T00:00:00.000Z', dates: [] };
        expect(timingOfFact(card, TODAY)).toBe('NEXT');
    });
});

describe('toFactCards · timingOfFact', () => {
    const cards = toFactCards([
        item('<b>농할상품권</b> 9월 14일부터 전연령 발행', '할인율 20%, 구매한도 안내', 'Mon, 08 Sep 2026 09:00:00 +0900'),
        item('농할상품권 9월 14일부터 전연령 발행', '중복 제목', 'Mon, 08 Sep 2026 10:00:00 +0900'),
        item('기준중위소득 확인법 정리', '2026년 급여별 선정기준', 'Mon, 01 Aug 2026 09:00:00 +0900'),
    ], '생활경제');
    it('태그를 걷고 같은 제목은 한 번만, 날짜를 읽는다', () => {
        expect(cards).toHaveLength(2);
        expect(cards[0]?.title).toBe('농할상품권 9월 14일부터 전연령 발행');
        expect(cards[0]?.dates).toEqual(['2026-09-14']);
        expect(cards[0]?.press).toBe('korea.kr');
    });
    it('미래 날짜면 NEXT, 최근 5일이면 NOW, 오래됐으면 근거로만(null)', () => {
        expect(timingOfFact(cards[0] as FactCard, TODAY)).toBe('NEXT');
        expect(timingOfFact({ ...(cards[0] as FactCard), dates: [] }, TODAY)).toBe('NOW');
        expect(timingOfFact(cards[1] as FactCard, TODAY)).toBeNull();
        expect(pickFactsForPrompt(cards, TODAY)).toHaveLength(1);
    });
});

describe('validateBriefs — 카드에 없는 것은 못 들어간다', () => {
    const facts: FactCard[] = [
        { id: 'f1', field: '건강', title: '독감 무료접종 9월 21일부터 시작', snippet: '어린이·임신부 대상', press: 'kdca.go.kr', link: 'https://kdca.go.kr/1', publishedAt: '2026-09-08T01:00:00.000Z', dates: ['2026-09-21'] },
        { id: 'f2', field: '건강', title: '인플루엔자 증가세 주의 당부', snippet: '학생 단체생활', press: 'kdca.go.kr', link: 'https://kdca.go.kr/2', publishedAt: '2026-09-07T01:00:00.000Z', dates: [] },
    ];
    const good = { title: '2026-2027 독감 무료접종 언제부터? 대상별 일정표', timing: 'NEXT', types: ['가이드형'], primaryIntent: '무료 접종 대상과 시작일 확인', value: '9월 21일부터 어린이·임신부 접종이 시작된다.', experience: '접종 경험을 의학 효과로 일반화하지 않음', differentiation: '연령별 날짜 + 1회/2회 대상', coreKeyword: '독감 무료접종 일정', factIds: ['f1'] };
    it('근거 카드·날짜·시기가 맞으면 통과한다', () => {
        const r = validateBriefs([good], facts, '건강', TODAY);
        expect(r.ok).toHaveLength(1);
        expect(r.ok[0]?.facts[0]?.press).toBe('kdca.go.kr');
        expect(r.ok[0]?.serpFit).toBe('미측정');
    });
    it('근거에 없는 날짜를 쓰면 떨어진다', () => {
        const r = validateBriefs([{ ...good, value: '9월 25일부터 시작된다.' }], facts, '건강', TODAY);
        expect(r.ok).toHaveLength(0);
        expect(r.dropped[0]?.reason).toContain('2026-09-25');
    });
    it('카드의 발행일(KST)은 근거다 — "8일 발표"는 본문이 아니라 발행일에서 온다', () => {
        const r = validateBriefs([{ ...good, timing: 'NOW', factIds: ['f1'], value: '8일 질병관리청이 발표했다.' }], facts, '건강', TODAY);
        expect(r.ok).toHaveLength(1);
    });
    it('factIds 는 "[f1]"·"F1 " 표기도 받는다(게임 회차 통째 탈락 재발 방지)', () => {
        expect(validateBriefs([{ ...good, factIds: ['[f1]', 'F1 '] }], facts, '건강', TODAY).ok[0]?.factIds).toEqual(['f1']);
    });
    it('카드 id 가 없거나 NEXT 인데 미래 날짜 근거가 없으면 떨어진다', () => {
        expect(validateBriefs([{ ...good, factIds: ['x9'] }], facts, '건강', TODAY).ok).toHaveLength(0);
        expect(validateBriefs([{ ...good, factIds: ['f2'], value: '증가세라 주의가 필요하다.' }], facts, '건강', TODAY).dropped[0]?.reason).toContain('NEXT');
    });
    it('배열이 아니면 빈 결과', () => {
        expect(validateBriefs({ nope: 1 }, facts, '건강', TODAY).ok).toEqual([]);
    });
    it('keywords 후보(1~4어절)를 받고 문장형은 버리며, 첫 후보가 핵심 검색어다', () => {
        const r = validateBriefs([{ ...good, coreKeyword: undefined, keywords: ['독감 무료접종', '독감 무료접종 대상', '가을 진드기 물림 예방 수칙 정리'] }], facts, '건강', TODAY);
        expect(r.ok[0]?.keywords).toEqual(['독감 무료접종', '독감 무료접종 대상']);
        expect(r.ok[0]?.coreKeyword).toBe('독감 무료접종');
    });
});

describe('applyMeasuredVolumes — 잰 검색량이 가장 큰 후보가 핵심 검색어', () => {
    const brief = { ...validateBriefs([{ title: '독감 무료접종 언제부터 대상별 일정', timing: 'ALWAYS', keywords: ['독감 접종', '독감 무료접종 대상'], value: '', factIds: ['f1'] }],
        [{ id: 'f1', field: '건강', title: 't', snippet: '', press: 'p', link: 'l', publishedAt: '2026-09-08T00:00:00.000Z', dates: [] }], '건강', TODAY).ok[0]! };
    it('큰 쪽으로 바꾸고, < 10 만 잰 경우는 under10 표시', () => {
        const a = applyMeasuredVolumes(brief, new Map([['독감접종', 800], ['독감무료접종대상', 2940]]));
        expect([a.coreKeyword, a.searchVolume, a.searchVolumeUnder10]).toEqual(['독감 무료접종 대상', 2940, false]);
        const b = applyMeasuredVolumes(brief, new Map([['독감접종', null]]));
        expect([b.coreKeyword, b.searchVolume, b.searchVolumeUnder10]).toEqual(['독감 접종', null, true]);
        expect(applyMeasuredVolumes(brief, new Map()).searchVolumeUnder10).toBeUndefined();
    });
});

describe('serpFitOf · markStars · 프롬프트', () => {
    it('적합성은 실측 정면 글 수로만', () => {
        expect(serpFitOf(null, null)).toBe('미측정');
        expect(serpFitOf(1, null)).toBe('높음');
        expect(serpFitOf(7, 2)).toBe('높음');
        expect(serpFitOf(4, null)).toBe('보통');
        expect(serpFitOf(9, null)).toBe('낮음');
    });
    it('★은 높음 + (검색량 500+ 또는 날짜 박힌 NOW/NEXT)', () => {
        const base = { title: 't', timing: 'ALWAYS' as const, types: [], primaryIntent: '', value: '', experience: '', differentiation: '', coreKeyword: 'k', keywords: ['k'], factIds: ['f1'], field: 'x', facts: [], searchVolume: null, serpFacing: 1, serpVacancy: null, serpFit: '높음' as const, star: false };
        const out = markStars([base, { ...base, timing: 'NOW' }, { ...base, searchVolume: 900 }, { ...base, serpFit: '보통' }]);
        expect(out.map((b) => b.star)).toEqual([false, true, true, false]);
    });
    it('프롬프트는 카드 id·날짜를 싣고 JSON 배열만 요구한다', () => {
        const p = buildBriefPrompt('건강', [{ id: 'f1', field: '건강', title: 'T', snippet: 'S', press: 'p', link: 'l', publishedAt: '2026-09-08T00:00:00.000Z', dates: ['2026-09-21'] }], TODAY);
        expect(p).toContain('[f1]');
        expect(p).toContain('2026-09-21');
        expect(p).toContain('JSON 배열 하나만');
        expect(BRIEF_FIELDS.length).toBeGreaterThanOrEqual(12);
    });
});

describe('하루 3회차 — 아침·오후·저녁(사장님 2026-09-09)', () => {
    const mk = (over: Partial<TopicBrief>): TopicBrief => ({ title: 't', timing: 'NOW', types: [], primaryIntent: '', value: '', experience: '', differentiation: '', coreKeyword: 'k', keywords: ['k'], factIds: ['f1'], field: '건강', facts: [], searchVolume: null, serpFacing: null, serpVacancy: null, serpFit: '미측정', star: false, ...over });
    it('회차 이름은 KST 시각으로 — 07시 아침 · 13시 오후 · 19시 저녁', () => {
        expect(roundSlotOf(kstToday(new Date('2026-09-08T22:05:00Z')))).toBe('아침');
        expect(roundSlotOf(kstToday(new Date('2026-09-09T04:05:00Z')))).toBe('오후');
        expect(roundSlotOf(kstToday(new Date('2026-09-09T10:05:00Z')))).toBe('저녁');
    });
    it('오늘(KST) 회차만 남기고 어제 회차는 버린다', () => {
        const rounds: BriefRound[] = [
            { slot: '저녁', builtAt: '2026-09-08T10:30:00Z', counts: roundCounts([]), briefs: [] },
            { slot: '아침', builtAt: '2026-09-08T22:30:00Z', counts: roundCounts([]), briefs: [] },
        ];
        expect(todaysRounds(rounds, kstToday(new Date('2026-09-09T04:00:00Z'))).map((r) => r.slot)).toEqual(['아침']);
        expect(todaysRounds(undefined, TODAY)).toEqual([]);
    });
    it('앞 회차의 제목·검색어가 제외 목록이 되고, 같은 검색어는 뒤 회차에서 빠지며, 잰 자리는 이어받는다', () => {
        const prior: BriefRound[] = [{ slot: '아침', builtAt: '2026-09-08T22:30:00Z', counts: roundCounts([]), briefs: [mk({ title: '독감 접종 일정', coreKeyword: '독감 접종', serpFacing: 2, serpVacancy: 1 })] }];
        expect(excludeListOf(prior, '건강')).toEqual(['독감 접종 일정(독감 접종)']);
        expect(excludeListOf(prior, '게임')).toEqual([]);
        const { kept, repeated } = dropRepeats([mk({ coreKeyword: '독감접종' }), mk({ coreKeyword: '진드기 물림' })], prior);
        expect(kept.map((b) => b.coreKeyword)).toEqual(['진드기 물림']);
        expect(repeated).toHaveLength(1);
        const carried = carrySeats([mk({ coreKeyword: '독감 접종' }), mk({ coreKeyword: '진드기 물림' })], prior);
        expect([carried[0]?.serpFacing, carried[0]?.serpVacancy, carried[1]?.serpFacing]).toEqual([2, 1, null]);
    });
    it('프롬프트는 제외 목록을 싣고 N-1~N개를 청한다', () => {
        const p = buildBriefPrompt('건강', [], TODAY, 6, ['독감 접종 일정(독감 접종)']);
        expect(p).toContain('독감 접종 일정(독감 접종)');
        expect(p).toContain('5~6개');
    });
});

describe('extractDates — ISO·슬래시 꼴', () => {
    it('"2026-09-30"·"2026.9.30"·"9/30"을 읽고, 소수 "0.8"·시각 "12:30"은 안 읽는다', () => {
        expect(extractDates('마감 2026-09-30, 발표 2026.9.30, 접수 9/30, 클릭률 0.8%, 12:30 시작', '2026-09-08T00:00:00Z')).toEqual(['2026-09-30']);
    });
});
