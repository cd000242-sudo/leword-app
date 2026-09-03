import { describe, expect, it } from 'vitest';
import type { IssueNicheKeyword } from '../issue-niche-hunter';
import {
  buildIssueBoardPayload,
  laneOfSource,
  toPublicIssueRow,
  type IssueBoardPayload,
  type IssueLedgerRow,
} from '../issue-niche-board-publish';

/**
 * 실검 틈새 보드 발행 변환 — 원장(헌터 결과)에서 화면 JSON 으로 옮길 때
 * 지켜야 하는 것: 틈새·선점 후보만, 추정치는 없이, 48시간 이월.
 */

const NOW = Date.parse('2026-09-03T04:00:00.000Z'); // KST 13:00

function row(over: Partial<IssueNicheKeyword> = {}): IssueNicheKeyword {
  return {
    keyword: '틈새 키워드',
    baseKeyword: '이슈',
    issueType: 'fresh',
    isDerived: true,
    grade: 'A',
    searchVolume: 320,
    documentCount: 1200,
    goldenRatio: 0.27,
    cpc: null,
    recencyStatus: 'rising',
    recencyRatio: 2.1,
    isHot: true,
    hasTraffic: true,
    frontalDocCount: 3,
    freshFrontalCount: 1,
    isNiche: true,
    isEstimated: false,
    isSearchVolumeEstimated: false,
    searchVolumeLt10: false,
    isDocumentCountEstimated: false,
    demandRecent7: 40,
    demandRatio: 1.8,
    demandStatus: 'rising',
    hasLiveDemand: true,
    nicheRoute: 'demand',
    isPreemption: false,
    nicheScore: 77,
    reasons: ['실측 수요 ▲', '문서수 1,200'],
    source: 'signal.bz',
    origin: 'derived',
    originReason: null,
    ...over,
  };
}

describe('toPublicIssueRow — 무엇을 싣는가', () => {
  it('틈새도 선점 후보도 아닌 실측 행은 싣지 않는다', () => {
    expect(toPublicIssueRow(row({ isNiche: false, isPreemption: false }), '2026-09-03T03:50:00.000Z')).toBeNull();
  });

  it('틈새와 선점 후보를 verdict 로 구분한다', () => {
    expect(toPublicIssueRow(row(), 'now')?.verdict).toBe('niche');
    expect(toPublicIssueRow(row({ isNiche: false, isPreemption: true, hasLiveDemand: false }), 'now')?.verdict).toBe('preemption');
  });

  it('추정 검색량은 null 로 낸다 — 화면에 추정을 싣지 않는다', () => {
    const pub = toPublicIssueRow(row({ searchVolume: 500, isSearchVolumeEstimated: true }), 'now');
    expect(pub?.searchVolume).toBeNull();
  });

  it('키워드도구 "< 10" 은 추정이 아니다 — 실측 숫자는 살리고 Lt10 표식을 싣는다', () => {
    // 실사고 2026-09-03 '지예은 남편': 모바일 50 / PC "< 10" 이 추정 취급돼 화면에 '—'.
    const one = toPublicIssueRow(row({ searchVolume: 50, searchVolumeLt10: true }), 'now');
    expect(one?.searchVolume).toBe(50);
    expect(one?.searchVolumeLt10).toBe(true);
    const both = toPublicIssueRow(row({ searchVolume: null, searchVolumeLt10: true }), 'now');
    expect(both?.searchVolume).toBeNull();
    expect(both?.searchVolumeLt10).toBe(true);
    const legacy = toPublicIssueRow({ ...row(), searchVolumeLt10: undefined as unknown as boolean }, 'now');
    expect(legacy?.searchVolumeLt10).toBe(false);
  });

  it('점수·등급은 payload 에 없다', () => {
    const pub = toPublicIssueRow(row(), 'now') as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty('nicheScore');
    expect(pub).not.toHaveProperty('grade');
    expect(pub).not.toHaveProperty('goldenRatio');
  });

  it('근거는 6개까지만', () => {
    const pub = toPublicIssueRow(row({ reasons: ['1', '2', '3', '4', '5', '6', '7', '8'] }), 'now');
    expect(pub?.reasons).toHaveLength(6);
  });

  it('공급원 → 레인', () => {
    expect(laneOfSource('signal.bz')).toBe('realtime');
    expect(laneOfSource('tech-rss')).toBe('tech');
    expect(laneOfSource('policy-briefing')).toBe('policy');
    expect(laneOfSource(undefined)).toBe('realtime');
  });
});

describe('buildIssueBoardPayload — 순서·이월·맛보기', () => {
  const ledger = {
    generator: 'issue-niche-hunter',
    generatedAt: '2026-09-03T03:50:00.000Z',
    funnel: { issues: 16, candidates: 61 },
    rows: [
      row({ keyword: '틈새 A' }),
      row({ keyword: '선점 B', isNiche: false, isPreemption: true, hasLiveDemand: false, documentCount: 120 }),
      row({ keyword: '탈락 C', isNiche: false, isPreemption: false }),
      row({ keyword: '틈새 D', source: 'tech-rss' }),
      row({ keyword: '틈새 a' }), // 공백·대소문자 다른 중복
    ],
  };

  it('틈새 → 선점 후보 순서이고, 탈락·중복은 빠진다', () => {
    const { payload, fresh } = buildIssueBoardPayload(ledger, null, { nowMs: NOW });
    expect(payload.rows.map((r) => r.keyword)).toEqual(['틈새 A', '틈새 D', '선점 B']);
    expect(fresh).toBe(3);
    expect(payload.measured).toEqual({ issues: 16, candidates: 61, niche: 3, preemption: 1 });
    expect(payload.generator).toBe('issue-niche-board');
    expect(payload.rows.every((r) => r.measuredAt === '2026-09-03T03:50:00.000Z')).toBe(true);
  });

  it('직전 발행본의 행은 48시간 안이면 이월(carried)하고, 넘기면 만료다', () => {
    const first = buildIssueBoardPayload(ledger, null, { nowMs: NOW }).payload;
    const prev: IssueBoardPayload = {
      ...first,
      rows: [
        ...first.rows,
        { ...first.rows[0], keyword: '어제 틈새', measuredAt: new Date(NOW - 20 * 3_600_000).toISOString() },
        { ...first.rows[0], keyword: '사흘 전 틈새', measuredAt: new Date(NOW - 60 * 3_600_000).toISOString() },
      ],
    };
    const next = { ...ledger, rows: [row({ keyword: '오늘 틈새' })] };
    const { payload, fresh, carried, expired } = buildIssueBoardPayload(next, prev, { nowMs: NOW });
    expect(fresh).toBe(1);
    expect(carried).toBe(4);
    expect(expired).toBe(1);
    // 신규가 앞, 이월이 뒤. 틈새 묶음 다음에 선점 후보.
    expect(payload.rows.map((r) => r.keyword)).toEqual(['오늘 틈새', '틈새 A', '틈새 D', '어제 틈새', '선점 B']);
    expect(payload.rows.find((r) => r.keyword === '틈새 A')?.carried).toBe(true);
    expect(payload.rows.find((r) => r.keyword === '오늘 틈새')?.carried).toBeUndefined();
  });

  it('옛 스키마 이월 행도 reasons·evidence 배열은 갖춰 낸다 — 화면 카드가 evidence.map 을 그대로 부른다', () => {
    // 2026-09-03 04:49 발행본 실사고: 스키마 바뀌기 전 회차 행 28건이 evidence 없이 이월돼
    // 사이트 실검 틈새 탭이 통째로 죽었다(카드 0장).
    const first = buildIssueBoardPayload(ledger, null, { nowMs: NOW }).payload;
    const { evidence: _e, reasons: _r, ...legacy } = first.rows[0];
    const prev = { ...first, rows: [{ ...legacy, keyword: '옛 회차 행' } as IssueBoardPayload['rows'][number]] };
    const next = { ...ledger, rows: [row({ keyword: '오늘 틈새' })] };
    const carriedRow = buildIssueBoardPayload(next, prev, { nowMs: NOW }).payload.rows.find((r) => r.keyword === '옛 회차 행');
    expect(carriedRow?.carried).toBe(true);
    expect(carriedRow?.evidence).toEqual([]);
    expect(carriedRow?.reasons).toEqual([]);
  });

  it('신규 행이 직전 행과 겹치면 신규(더 최신 실측)가 이긴다', () => {
    const prevPayload = buildIssueBoardPayload(ledger, null, { nowMs: NOW - 3_600_000 }).payload;
    const next = { ...ledger, rows: [row({ keyword: '틈새 A', documentCount: 2900 })] };
    const { payload } = buildIssueBoardPayload(next, prevPayload, { nowMs: NOW });
    const a = payload.rows.filter((r) => r.keyword === '틈새 A');
    expect(a).toHaveLength(1);
    expect(a[0].documentCount).toBe(2900);
    expect(a[0].carried).toBeUndefined();
  });

  it('무료 맛보기는 같은 KST 날짜면 직전 것을 그대로 쓴다', () => {
    const morning = buildIssueBoardPayload(ledger, null, { nowMs: Date.parse('2026-09-02T22:00:00.000Z'), freeRows: 2 }).payload;
    expect(morning.freeSample).toEqual({ day: '2026-09-03', keywords: ['틈새 A', '틈새 D'] });

    const next = { ...ledger, rows: [row({ keyword: '오후 틈새' })] };
    const noon = buildIssueBoardPayload(next, morning, { nowMs: NOW, freeRows: 2 }).payload;
    expect(noon.freeSample).toEqual(morning.freeSample);

    const tomorrow = buildIssueBoardPayload(next, noon, { nowMs: NOW + 24 * 3_600_000, freeRows: 2 }).payload;
    expect(tomorrow.freeSample.day).toBe('2026-09-04');
    expect(tomorrow.freeSample.keywords[0]).toBe('오후 틈새');
  });

  it('무료 맛보기 기본은 3건 — 사장님 사양(2026-09-03): 틈새는 하루 3개만', () => {
    const wide = { ...ledger, rows: ['가', '나', '다', '라', '마'].map((k) => row({ keyword: `틈새 ${k}` })) };
    const payload = buildIssueBoardPayload(wide, null, { nowMs: NOW }).payload;
    expect(payload.rows).toHaveLength(5);
    expect(payload.freeSample.keywords).toEqual(['틈새 가', '틈새 나', '틈새 다']);
  });

  it('새 날 표본은 보강(제목·서브·풀)이 끝난 행에서 먼저 고른다 — 맨카드가 맛보기면 유료 카드가 어떻게 생겼는지 못 보여 준다', () => {
    // 첫 회차(2026-09-03 실사고): 옛 파이프라인 이월 행이 앞에 서서 프로필 맨카드 3건이 하루 표본으로 잠겼다.
    const bare = (k: string) => row({ keyword: k });
    const rich = (k: string): IssueLedgerRow => ({ ...row({ keyword: k }), titles: { seo: { text: '베슬AI 상장 일정, 공모가는 어떻게 되나', frame: 'ai' }, home: { text: '베슬AI 상장 언제냐고 물어보시길래 찾아봤어요', frame: 'ai' } }, subKeywords: [{ keyword: k + ' 일정', searchVolume: 120 }] });
    const mixed = { ...ledger, rows: [bare('맨 가'), bare('맨 나'), rich('보강 다'), bare('맨 라'), rich('보강 마')] };
    const payload = buildIssueBoardPayload(mixed, null, { nowMs: NOW }).payload;
    // 보강 행이 먼저(원래 순서 유지), 모자라면 맨 행으로 채운다.
    expect(payload.freeSample.keywords).toEqual(['보강 다', '보강 마', '맨 가']);
    // 행 순서 자체는 그대로다 — 표본만 고르는 순서가 다르다.
    expect(payload.rows.map((r) => r.keyword)).toEqual(['맨 가', '맨 나', '보강 다', '맨 라', '보강 마']);
    // 같은 날은 여전히 직전 표본을 지킨다 — 보강 행이 새로 생겨도 낮에 새 키워드를 열지 않는다.
    const later = { ...ledger, rows: [rich('보강 바')] };
    expect(buildIssueBoardPayload(later, payload, { nowMs: NOW + 3_600_000 }).payload.freeSample).toEqual(payload.freeSample);
  });

  it('같은 날 표본이 상한보다 길면 앞에서 자른다 — 닫기만 하고 새 키워드는 열지 않는다', () => {
    const wide = { ...ledger, rows: ['가', '나', '다', '라', '마'].map((k) => row({ keyword: `틈새 ${k}` })) };
    const five = buildIssueBoardPayload(wide, null, { nowMs: NOW, freeRows: 5 }).payload;
    expect(five.freeSample.keywords).toHaveLength(5);
    const three = buildIssueBoardPayload(wide, five, { nowMs: NOW + 3_600_000, freeRows: 3 }).payload;
    expect(three.freeSample).toEqual({ day: five.freeSample.day, keywords: ['틈새 가', '틈새 나', '틈새 다'] });
    // 반대로 표본이 짧으면 채우지 않는다 — 낮에 새 키워드가 열리는 구멍이다.
    const two = { ...five, freeSample: { day: five.freeSample.day, keywords: ['틈새 라', '틈새 마'] } };
    expect(buildIssueBoardPayload(wide, two, { nowMs: NOW + 3_600_000, freeRows: 3 }).payload.freeSample.keywords).toEqual(['틈새 라', '틈새 마']);
  });

  it('원장에 실을 행이 없으면 fresh 0 — 발행기는 이 값으로 기존 파일을 지킨다', () => {
    const empty = { ...ledger, rows: [row({ isNiche: false, isPreemption: false })] };
    const { fresh, payload } = buildIssueBoardPayload(empty, null, { nowMs: NOW });
    expect(fresh).toBe(0);
    expect(payload.rows).toEqual([]);
  });
});
