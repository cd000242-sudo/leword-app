import { describe, expect, it } from 'vitest';
import {
  compactKey, isRelevantSample, jaccard, normalizeTitle, numberTokens, quoteSpans, sameIssueKeyword, titleTokens,
} from '../homefeed/text';
import { recordSnapshotInLedger, resolveIssueKey } from '../homefeed/ledger';
import { DEFAULT_HOMEFEED_SETTINGS, normalizeHomefeedSettings } from '../homefeed/settings';
import { classifyHomefeedCategory } from '../homefeed/category';
import { HOMEFEED_SCHEMA } from '../homefeed/types';
import { at, issue, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호(STORY RADAR v2.0) — 텍스트 정규화 · 처음 본 시각 장부 · 중앙 설정(2026-09-16).
 * 나이는 장부로만 잰다: 기록 시작 전 · 앱이 꺼져 있던 구간에 이미 떠 있었을 수 있으면 '검열'로 표시해 하한으로만 말한다.
 */
describe('텍스트 정규화', () => {
  it('이슈 키는 공백 · 문장부호 · 대소문자를 걷는다', () => {
    expect(compactKey(' 이란, 유조선 3척! ')).toBe('이란유조선3척');
    expect(compactKey('BTS  Jin')).toBe('btsjin');
  });

  it('기사 제목의 말머리 · 이모지 · 매체 꼬리표를 걷되 본문 조각은 남긴다', () => {
    expect(normalizeTitle('[단독] 이란, 유조선 3척 타격 (종합) - 연합뉴스')).toBe('이란, 유조선 3척 타격');
    expect(normalizeTitle('손흥민 - 토트넘 결별 공식화')).toBe('손흥민 - 토트넘 결별 공식화');
    expect(normalizeTitle('🔥 유승호 결혼식')).toBe('유승호 결혼식');
  });

  it('조사 · 활용어미를 걷어 같은 말로 본다', () => {
    expect([...titleTokens('이란이 유조선을 타격했다')]).toEqual(['이란', '유조선', '타격']);
  });

  it('자카드는 둘 다 비었으면 null — 비교할 게 없다', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBeNull();
  });

  it('같은 이슈의 다른 표기를 같은 이슈로 본다', () => {
    expect(sameIssueKeyword('이란 유조선 3척 타격', '이란 유조선')).toBe(true);
    expect(sameIssueKeyword('손흥민', '손흥민 이적')).toBe(true);
    expect(sameIssueKeyword('서울 시내버스 타결', '부산 버스 파업')).toBe(false);
  });

  it('검색어와 어절이 겹치는 기사만 표본으로 본다 — 뉴스 검색이 느슨하게 걸어 준 다른 이슈 기사는 버린다', () => {
    expect(isRelevantSample('엄지성 해트트릭 첫 승리', "'엄지성 해트트릭' 이민성호, 카타르 4-1 격파")).toBe(true);
    expect(isRelevantSample('엄지성 해트트릭 첫 승리', '손흥민 새 역사 기념식에도…붉은악마 떠나 적막감')).toBe(false);
    expect(isRelevantSample('서울 시내버스 타결', '서울시 지하철 파업 예고')).toBe(false);
    expect(isRelevantSample('토지거래허가제', '토지거래허가제 확대 발표')).toBe(true);
    expect(isRelevantSample('토지거래허가제', '부동산 대책 발표')).toBe(false);
  });

  it('숫자 토큰 · 인용을 꺼낸다', () => {
    expect(numberTokens('유조선 3척 · 10억 원 · 20%')).toEqual(['3척', '10억', '20%']);
    expect(quoteSpans('유승호 "결혼식 못 간다" 해명')).toEqual(['결혼식 못 간다']);
  });
});

describe('처음 본 시각 장부', () => {
  const empty = { schemaVersion: HOMEFEED_SCHEMA.signalState, updatedAt: null, entries: {} };
  const gap = 25 * 60_000;
  const snap1 = snapshot(at(0), [issue('이란 유조선')]);
  const state1 = recordSnapshotInLedger(empty, snap1, null, gap, 7);
  const snap2 = snapshot(at(10), [issue('이란 유조선'), issue('유승호 결혼식')]);
  const state2 = recordSnapshotInLedger(state1, snap2, snap1.capturedAt, gap, 7);

  it('장부 첫 회차에 보인 이슈는 그 전부터 떠 있었을 수 있다 — 검열', () => {
    expect(state1.entries['이란유조선'].firstSeenCensored).toBe(true);
  });

  it('바로 앞 회차에 없다가 나타난 이슈는 검열이 아니고, 이어 보인 이슈는 처음 본 시각을 지킨다', () => {
    expect(state2.entries['유승호결혼식'].firstSeenCensored).toBe(false);
    expect(state2.entries['이란유조선']).toMatchObject({ firstSeenAt: at(0), lastSeenAt: at(10), appearances: 2 });
    expect(state1.entries['이란유조선'].appearances).toBe(1);
  });

  it('앞 회차와 사이가 벌어졌으면(앱 꺼짐) 새로 보인 이슈도 검열', () => {
    const late = recordSnapshotInLedger(state2, snapshot(at(120), [issue('새 이슈')]), snap2.capturedAt, gap, 7);
    expect(late.entries['새이슈'].firstSeenCensored).toBe(true);
  });

  it('보존 기간이 지난 항목은 지운다', () => {
    const later = recordSnapshotInLedger(state2, snapshot(at(60 * 24 * 8), [issue('다른 이슈')]), at(60 * 24 * 8 - 10), gap, 7);
    expect(Object.keys(later.entries)).toEqual(['다른이슈']);
  });

  it('표기가 바뀐 같은 이슈는 앞서 쓴 키를 잇고, 이번 회차에 이미 쓴 키는 다시 주지 않는다', () => {
    const now = Date.parse(at(20));
    expect(resolveIssueKey('이란 유조선 3척 타격', state2, now, new Set())).toBe('이란유조선');
    expect(resolveIssueKey('이란 유조선', state2, now, new Set(['이란유조선']))).toBeNull();
    expect(resolveIssueKey('전혀 다른 말', state2, now, new Set())).toBe('전혀다른말');
  });
});

describe('중앙 설정', () => {
  it('기본은 수집 꺼짐 · 10분 · 이미지 생성 없음(프롬프트까지만)', () => {
    expect(DEFAULT_HOMEFEED_SETTINGS).toMatchObject({ enabled: false, snapshotIntervalMinutes: 10, imageProvider: 'none' });
  });

  it('명령서 하한은 설정으로도 못 내린다', () => {
    const tuned = normalizeHomefeedSettings({ snapshotIntervalMinutes: 1, calibration: { sampleShortN: 2, successRateMinN: 3 } });
    expect(tuned.snapshotIntervalMinutes).toBe(5);
    expect(tuned.calibration).toEqual({ sampleShortN: 5, successRateMinN: 20 });
  });

  it('모르는 칸 · 모르는 이미지 제공자는 버린다(유료 API 제공자를 받지 않는다)', () => {
    const tuned = normalizeHomefeedSettings({ imageProvider: 'openai-api', unknownKey: 1 });
    expect(tuned.imageProvider).toBe('none');
    expect(tuned).not.toHaveProperty('unknownKey');
  });
});

describe('카테고리 사전', () => {
  it('검색어 · 제목 사전으로 고르고, 안 걸리면 미분류', () => {
    expect(classifyHomefeedCategory('유승호 결혼식 동행', ['배우 유승호, 결혼식 불참'])).toBe('entertainment');
    expect(classifyHomefeedCategory('엄지성 해트트릭', ['엄지성 해트트릭으로 첫 승리 이끈 선수'])).toBe('sports');
    expect(classifyHomefeedCategory('이투데이', ['이투데이'])).toBe('unknown');
  });
});
