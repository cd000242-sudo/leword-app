import { describe, expect, it } from 'vitest';
import { buildEnvelope, isWon, judgeRange, type WonRow } from '../blog-class/envelope';

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

describe('내 범위 안인가 — 판단이 아니라 대조', () => {
  const envelope = buildEnvelope([
    row({ keyword: 'a', documentCount: 4200, facing: 2, topic: 'IT·컴퓨터' }),
    row({ keyword: 'b', documentCount: 1100, facing: 1, topic: 'IT·컴퓨터' }),
  ])!;

  it('이겨본 크기 안이면 근거를 숫자로 적는다', () => {
    const got = judgeRange({ documentCount: 1200, facing: 1 }, envelope);
    expect(got.verdict).toBe('in');
    expect(got.reason).toBe('경쟁 글 1,200개 — 4,200개까지 이겨본 적 있어요');
  });

  it('이겨본 적 없는 크기면 그 사실을 말한다', () => {
    const got = judgeRange({ documentCount: 8300 }, envelope);
    expect(got.verdict).toBe('out');
    expect(got.reason).toBe('경쟁 글 8,300개 — 지금까지 이긴 가장 큰 것은 4,200개예요');
  });

  it('문서수가 작아도 같은 걸 다룬 글이 많으면 범위 밖이다', () => {
    const got = judgeRange({ documentCount: 300, facing: 6 }, envelope);
    expect(got.verdict).toBe('out');
    expect(got.reason).toBe('같은 걸 다룬 글 6개 — 지금까지는 2개까지 이겼어요');
  });

  it('봉투가 없으면 배지를 못 붙인다 — 지어낸 기준으로 말하지 않는다', () => {
    const got = judgeRange({ documentCount: 100 }, null);
    expect(got.verdict).toBe('unknown');
    expect(got.reason).toContain('아직 첫 페이지에 든 글이 없어서');
  });

  it('후보의 경쟁 글 수를 모르면 견주지 않는다', () => {
    expect(judgeRange({ documentCount: null }, envelope).verdict).toBe('unknown');
  });

  it('이긴 적 있는 주제인지 따로 알려 준다', () => {
    expect(judgeRange({ documentCount: 900, topic: 'IT·컴퓨터' }, envelope).myTopic).toBe(true);
    expect(judgeRange({ documentCount: 900, topic: '요리' }, envelope).myTopic).toBe(false);
    expect(judgeRange({ documentCount: 900 }, envelope).myTopic).toBe(false);
  });

  it('추천·쉬움 같은 판단하는 말을 만들지 않는다', () => {
    const lines = [
      judgeRange({ documentCount: 900 }, envelope).reason,
      judgeRange({ documentCount: 99999 }, envelope).reason,
      judgeRange({ documentCount: null }, envelope).reason,
      judgeRange({ documentCount: 1 }, null).reason,
    ].join(' ');
    for (const banned of ['추천', '쉬움', '어려움', '확률', '가능성', '보장']) {
      expect(lines).not.toContain(banned);
    }
  });
});
