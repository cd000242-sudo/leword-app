import { describe, expect, it } from 'vitest';
import { candidatesFromTitle, collectCandidates } from '../blog-class/title-candidates';

/**
 * 후보가 3어절만 나오던 결함(2026-09-11).
 *
 * 실측(leadernam- 최근 글 30개): 만들어진 후보 88개가 **전부 3어절**이었다. 2어절은 0개.
 * 원인은 `for (const size of [3, 2])` 가 3어절을 앞에서부터 채우다 limit 에 걸려 끝나는 것이다.
 * 어절이 5개만 넘어도 3어절 후보가 3개 이상 나오니 2어절 차례가 영영 안 온다.
 *
 * 그래서 검색광고에 물어본 88개가 이런 것들이었다:
 *   "한 번 입은" · "번 입은 옷" · "비염 예방 습도" · "UV 휴대용 무선B"
 * 정작 사람들이 치는 말은 안 물어봤다:
 *   "옷 보관법" · "비염 예방" · "환절기 비염" · "공기압 마사지기" · "음식물처리기"
 * 글 30개에서 만들 수 있는 2어절이 188개였는데 **한 개도 안 썼다.**
 * 검색량이 잡힌 것이 88개 중 8개(9%)뿐이었던 이유가 이것이다.
 *
 * 이 파일의 원칙은 그대로다 — 어느 말이 좋은지는 우리가 안 고르고 검색광고가 고른다.
 * 고치는 건 **물어보는 목록을 한쪽으로 쏠리지 않게** 하는 것뿐이다.
 */
describe('두 크기를 섞어서 물어본다', () => {
  it('실측한 그 제목에서 2어절이 실제로 나온다', () => {
    const got = candidatesFromTitle('한 번 입은 옷 보관법, 빨기 애매할 때 다시 입는 기준 3가지', 6);
    expect(got, `2어절이 없다: ${got.join(' / ')}`).toContain('옷 보관법');
  });

  it('3어절만으로 채우지 않는다', () => {
    const got = candidatesFromTitle('가을철 환절기 비염 예방, 습도 숫자가 제각각일 때 기준', 6);
    const twos = got.filter((k) => k.split(' ').length === 2);
    const threes = got.filter((k) => k.split(' ').length === 3);
    expect(twos.length, `2어절 ${twos.length}개: ${got.join(' / ')}`).toBeGreaterThan(0);
    expect(threes.length).toBeGreaterThan(0);
  });

  it('한쪽이 바닥나면 남은 쪽이 자리를 이어받는다', () => {
    // 어절 3개짜리 제목이면 3어절 후보는 하나뿐이다. 나머지는 2어절이 채운다.
    const got = candidatesFromTitle('환절기 비염 예방법', 4);
    expect(got.length).toBeGreaterThanOrEqual(2);
    expect(got).toContain('환절기 비염 예방법');
  });

  it('원래 규칙은 그대로 — 군더더기 말이 양 끝에 오면 버리고, 너무 짧으면 안 만든다', () => {
    expect(candidatesFromTitle('오늘 정말 좋은 하루', 6).every((k) => !/^(오늘|정말)\s|\s(오늘|정말)$/.test(k))).toBe(true);
    expect(candidatesFromTitle('그 수 때', 6)).toEqual([]);
    expect(candidatesFromTitle('한글', 6)).toEqual([]);
  });

  it('같은 말을 두 번 넣지 않는다', () => {
    const got = candidatesFromTitle('비염 예방 비염 예방 비염 예방', 6);
    expect(new Set(got.map((k) => k.replace(/\s/g, ''))).size).toBe(got.length);
  });
});

describe('글 전체에서도 두 크기가 다 나온다', () => {
  it('실측 제목 여섯 개로 재현 — 전에는 3어절 100%였다', () => {
    const titles = [
      '한 번 입은 옷 보관법, 빨기 애매할 때 다시 입는 기준 3가지',
      '다리 공기압 마사지기 닥터웰 종아리 DR-5180',
      '가을철 환절기 비염 예방, 습도 숫자가 제각각일 때 기준',
      '쿠쿠 건조분쇄형 에코웨일 2L 음식물처리기 요즘이게 대세라며?!',
      '오아 메가에어라이트 써큘레이터 저소음 BLDC, 침실 무드등과 세척 편의성에서 갈리는 이유',
      '오아 클린이워터B-UV 휴대용 무선B-, 잇몸 예민하면 Strong에서 갈려요',
    ];
    const rows = collectCandidates(titles.map((title, i) => ({ title, url: `u${i}`, publishedOn: null })), 6);
    const twos = rows.filter((r) => r.keyword.split(' ').length === 2).length;
    expect(twos, '여전히 2어절이 0개다').toBeGreaterThan(0);
    // 한쪽이 8할을 넘게 먹지 않는다
    expect(twos / rows.length).toBeGreaterThan(0.2);
    expect(twos / rows.length).toBeLessThan(0.8);
  });

  it('검색 허용이 꺼진 글은 여전히 뺀다', () => {
    const rows = collectCandidates([{ title: '환절기 비염 예방 방법', url: 'u', publishedOn: null, searchable: false }], 6);
    expect(rows).toEqual([]);
  });
});
