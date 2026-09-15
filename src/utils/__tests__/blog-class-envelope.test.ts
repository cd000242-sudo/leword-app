import { describe, expect, it } from 'vitest';
import { BAND_FLOOR, NEAR_RANK, buildEnvelope, buildNearBand, isWon, judgeRange, type WonRow } from '../blog-class/envelope';

/**
 * 봉투 — "내가 이겨본 크기". 사장님 2026-09-10 "초보자들에게 엄청난 도움을 주는 게 목적이야".
 * 이 판정이 틀리면 초보자가 못 이길 자리에 덤비거나, 이길 자리를 지레 포기한다.
 * 그래서 지어낸 기본값을 절대 만들지 않는다 — 모르면 모른다고 한다.
 */
const row = (over: Partial<WonRow> = {}): WonRow => ({
  keyword: '여권사진 규격',
  blogRank: 3,
  searchVolume: 2750,
  documentCount: 2015,
  facing: 1,
  topic: '사진',
  ...over,
});

describe('이겼다의 기준', () => {
  it('블로그 탭 10위 안이면 이긴 것이다', () => {
    expect(isWon(row({ blogRank: 1 }))).toBe(true);
    expect(isWon(row({ blogRank: 10 }))).toBe(true);
    expect(isWon(row({ blogRank: 11 }))).toBe(false);
  });

  it('순위를 못 쟀으면 이긴 것이 아니다 — 0 위도 아니고 모르는 것이다', () => {
    expect(isWon(row({ blogRank: null }))).toBe(false);
  });

  it('통합검색 순위는 이겼다의 기준이 아니다', () => {
    // 블로그 탭 3위인데 통합검색에는 없을 수 있고 그 반대도 있다 — 기준은 하나여야 한다.
    expect(isWon(row({ blogRank: 3, allRank: null }))).toBe(true);
    expect(isWon(row({ blogRank: 30, allRank: 2 }))).toBe(false);
  });
});

describe('봉투 만들기', () => {
  it('이긴 기록이 없으면 봉투를 만들지 않는다 — 기본값을 지어내지 않는다', () => {
    expect(buildEnvelope([])).toBeNull();
    expect(buildEnvelope([row({ blogRank: 40 }), row({ blogRank: null })])).toBeNull();
  });

  it('이긴 행에서 한계선과 중앙값을 뽑는다', () => {
    const envelope = buildEnvelope([
      row({ keyword: 'a', documentCount: 500, facing: 0, searchVolume: 1000 }),
      row({ keyword: 'b', documentCount: 2015, facing: 1, searchVolume: 2750 }),
      row({ keyword: 'c', documentCount: 4200, facing: 2, searchVolume: 800 }),
      row({ keyword: 'd', blogRank: 25, documentCount: 90000, facing: 9 }), // 진 행은 안 센다
    ])!;
    expect(envelope.wonCount).toBe(3);
    expect(envelope.measuredCount).toBe(4);
    expect(envelope.docMax).toBe(4200);
    expect(envelope.docP50).toBe(2015);
    expect(envelope.facingMax).toBe(2);
    expect(envelope.volumeMin).toBe(800);
    expect(envelope.volumeMax).toBe(2750);
  });

  it('문서수를 못 잰 이긴 행은 한계선에서 뺀다 — 얼마짜리였는지 모르니까', () => {
    const envelope = buildEnvelope([
      row({ keyword: 'a', documentCount: 1200 }),
      row({ keyword: 'b', documentCount: null }),
    ])!;
    expect(envelope.wonCount).toBe(2);
    expect(envelope.docMax).toBe(1200);
  });

  it('잘 이기는 주제를 많은 순으로 3개까지 센다', () => {
    const envelope = buildEnvelope([
      row({ keyword: 'a', topic: 'IT·컴퓨터' }), row({ keyword: 'b', topic: 'IT·컴퓨터' }),
      row({ keyword: 'c', topic: '건강' }), row({ keyword: 'd', topic: null }),
    ])!;
    expect(envelope.topics).toEqual([{ topic: 'IT·컴퓨터', count: 2 }, { topic: '건강', count: 1 }]);
  });
});

/**
 * 거르는 기준 — 30위 안에 붙어 본 검색량(2026-09-15, 사장님 승인).
 *
 * 사장님 블로그 실측(2026-09-13): 검색어 62개를 쟀고 1~10위 2 · 11~30위 12.
 * 이긴 2건 중 '타일 바닥 청소'가 경쟁 글 1,690,874개짜리 넓은 말이라, 문서수 최대치로 거르면
 * 오늘 쓸 한 편 후보 459개 중 450개가 통과했고 인테리어·DIY 블로그에 'kaist 입학처'가 세워졌다.
 */
describe('30위 안에 붙어 본 검색량 — 거르는 기준', () => {
  const measured = [
    row({ keyword: '베란다 청소 방법', blogRank: 7, searchVolume: 90, documentCount: 640204, topic: '인테리어·DIY' }),
    row({ keyword: '타일 바닥 청소', blogRank: 10, searchVolume: 300, documentCount: 1690874, topic: '인테리어·DIY' }),
    row({ keyword: '거실 청소', blogRank: 14, searchVolume: 60, documentCount: null, topic: '인테리어·DIY' }),
    row({ keyword: '나연 혀클리너', blogRank: 16, searchVolume: 3610, documentCount: null, topic: '인테리어·DIY' }),
    row({ keyword: '현관 청소', blogRank: 29, searchVolume: 420, documentCount: null, topic: '인테리어·DIY' }),
    row({ keyword: '옥수수 삶는법', blogRank: null, searchVolume: 99710, documentCount: null, topic: '인테리어·DIY' }),
    row({ keyword: '바깥 순위', blogRank: 31, searchVolume: 50000, documentCount: null, topic: '인테리어·DIY' }),
  ];

  it('30위 안 기록으로 범위를 만든다 — 순위 밖·31위는 안 센다', () => {
    const band = buildNearBand(measured)!;
    expect(NEAR_RANK).toBe(30);
    expect(band.measuredCount).toBe(7);
    expect(band.wonCount).toBe(2);
    expect(band.nearCount).toBe(3);
    expect(band.volumeMin).toBe(60);
    expect(band.volumeMax).toBe(3610);
    expect(band.topics).toEqual([{ topic: '인테리어·DIY', count: 5 }]);
  });

  it('30위 안 기록이 없거나 그 검색량을 못 쟀으면 범위를 만들지 않는다 — 기본값을 지어내지 않는다', () => {
    expect(buildNearBand([])).toBeNull();
    expect(buildNearBand([row({ blogRank: null }), row({ blogRank: 44 })])).toBeNull();
    expect(buildNearBand([row({ blogRank: 12, searchVolume: null })])).toBeNull();
  });

  it('첫 페이지를 못 들었어도 11~30위 기록이 있으면 범위가 생긴다 — 봉투와 다른 점', () => {
    const rows = [row({ blogRank: 17, searchVolume: 700 }), row({ blogRank: 19, searchVolume: 560 })];
    expect(buildEnvelope(rows)).toBeNull();
    expect(buildNearBand(rows)!.volumeMax).toBe(700);
  });

  const band = buildNearBand(measured)!;

  it('범위 안이면 근거를 숫자로 적는다', () => {
    const got = judgeRange({ searchVolume: 1640 }, band);
    expect(got.verdict).toBe('in');
    expect(got.reason).toBe('검색량 1,640 — 30위 안에 붙어 본 말이 3,610까지 있어요');
  });

  it('붙어 본 가장 큰 말보다 크면 그 사실을 말한다', () => {
    const got = judgeRange({ searchVolume: 100500 }, band);
    expect(got.verdict).toBe('out');
    expect(got.reason).toBe('검색량 100,500 — 30위 안에 붙어 본 말은 3,610까지였어요');
  });

  it(`${BAND_FLOOR} 아래 말은 찾지 않는다 — 등급표 A 의 검색량 100+ 그대로`, () => {
    const got = judgeRange({ searchVolume: 40 }, band);
    expect(got.verdict).toBe('out');
    expect(got.reason).toBe('검색량 40 — 100 아래 말은 찾지 않아요');
    expect(judgeRange({ searchVolume: BAND_FLOOR }, band).verdict).toBe('in');
  });

  it('범위가 없으면 배지를 못 붙인다 — 지어낸 기준으로 말하지 않는다', () => {
    const got = judgeRange({ searchVolume: 500 }, null);
    expect(got.verdict).toBe('unknown');
    expect(got.reason).toContain('아직 30위 안에 든 검색어가 없어서');
  });

  it('후보의 검색량을 모르면 견주지 않는다', () => {
    expect(judgeRange({ searchVolume: null }, band).verdict).toBe('unknown');
    expect(judgeRange({ searchVolume: NaN }, band).verdict).toBe('unknown');
  });

  it('붙어 본 적 있는 주제인지 따로 알려 준다', () => {
    expect(judgeRange({ searchVolume: 900, topic: '인테리어·DIY' }, band).myTopic).toBe(true);
    expect(judgeRange({ searchVolume: 900, topic: '요리' }, band).myTopic).toBe(false);
    expect(judgeRange({ searchVolume: 900 }, band).myTopic).toBe(false);
  });

  it('추천·쉬움 같은 판단하는 말을 만들지 않는다', () => {
    const lines = [
      judgeRange({ searchVolume: 900 }, band).reason,
      judgeRange({ searchVolume: 99999 }, band).reason,
      judgeRange({ searchVolume: 10 }, band).reason,
      judgeRange({ searchVolume: null }, band).reason,
      judgeRange({ searchVolume: 1 }, null).reason,
    ].join(' ');
    for (const banned of ['추천', '쉬움', '어려움', '확률', '가능성', '보장']) {
      expect(lines).not.toContain(banned);
    }
  });
});
