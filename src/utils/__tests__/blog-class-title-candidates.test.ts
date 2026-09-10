import { describe, expect, it } from 'vitest';
import { candidatesFromTitle, collectCandidates } from '../blog-class/title-candidates';

/**
 * 제목 → 검색어 후보. 여기서 헛 후보가 많이 나오면 순위 실측이 그만큼 헛돌고(요청 낭비),
 * 봉투가 엉뚱한 검색어로 채워진다. 그러면 초보자에게 "네 크기다"라고 잘못 말하게 된다.
 */
describe('제목에서 검색어 후보 뽑기', () => {
  it('이어진 어절 3개·2개로 만든다 — 긴 것부터', () => {
    const got = candidatesFromTitle('여권사진 규격 변환 방법', 4);
    expect(got[0]).toBe('여권사진 규격 변환');
    expect(got).toContain('여권사진 규격');
  });

  it('대괄호·괄호·따옴표 안은 걷어 낸다 — 블로그 제목에 흔한 꾸밈이다', () => {
    const got = candidatesFromTitle('[내돈내산] 코스트코 연어 후기(솔직)', 4);
    expect(got.join(' ')).not.toContain('내돈내산');
    expect(got.join(' ')).not.toContain('솔직');
    expect(got).toContain('코스트코 연어 후기');
  });

  it('군더더기가 앞뒤에 붙은 후보는 버린다', () => {
    // '진짜 코스트코 연어' 는 아무도 안 친다.
    const got = candidatesFromTitle('진짜 코스트코 연어 맛있다', 6);
    expect(got.every((k) => !k.startsWith('진짜'))).toBe(true);
  });

  it('어절이 하나뿐이면 후보를 안 만든다 — 단어 하나는 너무 넓다', () => {
    expect(candidatesFromTitle('코스트코')).toEqual([]);
    expect(candidatesFromTitle('')).toEqual([]);
  });

  it('같은 말이 두 번 나와도 한 번만 담는다', () => {
    const got = candidatesFromTitle('연어 회 연어 회 추천', 6);
    const keys = got.map((k) => k.replace(/\s/g, ''));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('상한만큼만 만든다', () => {
    expect(candidatesFromTitle('가나 다라 마바 사아 자차 카타', 3)).toHaveLength(3);
  });
});

describe('글 목록에서 후보 모으기', () => {
  const post = (title: string, url: string, extra: Record<string, unknown> = {}) =>
    ({ title, url, publishedOn: '2026-09-01', ...extra });

  it('같은 검색어가 여러 글에서 나오면 한 번만 — 두 번 재지 않는다', () => {
    const got = collectCandidates([
      post('코스트코 연어 후기 정리', 'a'),
      post('코스트코 연어 후기 또 샀다', 'b'),
    ], 3);
    const keys = got.map((c) => c.keyword.replace(/\s/g, ''));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('먼저 나온 글이 그 검색어의 임자가 된다', () => {
    const got = collectCandidates([post('코스트코 연어 후기', 'first'), post('코스트코 연어 후기', 'second')], 3);
    expect(got[0].postUrl).toBe('first');
    expect(got.every((c) => c.postUrl === 'first')).toBe(true);
  });

  it('검색 허용이 꺼진 글은 건너뛴다 — 순위를 재도 소용없다', () => {
    const got = collectCandidates([post('코스트코 연어 후기', 'a', { searchable: false })], 3);
    expect(got).toEqual([]);
  });

  it('글 정보를 후보에 그대로 달아 준다 — 나중에 어느 글이 이겼는지 말해야 한다', () => {
    const got = collectCandidates([post('여권사진 규격 변환', 'https://blog.naver.com/me/1')], 1);
    expect(got[0]).toMatchObject({
      keyword: '여권사진 규격 변환',
      postUrl: 'https://blog.naver.com/me/1',
      publishedOn: '2026-09-01',
    });
  });
});
