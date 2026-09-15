import { describe, expect, it } from 'vitest';
import { buildNearBand, type WonRow } from '../blog-class/envelope';
import {
  buildProfile, coreWords, describeBlogState, interleave, nearRows, pickExpansions, sharesVocabulary, shortenSeed,
} from '../blog-class/my-blog-lane';

/**
 * 내 블로그에서 오늘 쓸 말을 찾는 순수 규칙(2026-09-15).
 *
 * 사장님 "내 블로그 주소랑 지금 현재 내 블로그가 얼마나 최적화되어있는지를 알아야지
 * 오늘 것 고르기에서 너가 키워드를 찾아줄 수 있지 않니".
 * 표본은 사장님 블로그 실측(2026-09-13 · 인테리어·DIY · 1~10위 2 · 11~30위 12)에서 옮겼다.
 */
const r = (keyword: string, blogRank: number | null, searchVolume: number | null): WonRow => ({
  keyword, blogRank, searchVolume, documentCount: null, facing: null, topic: '인테리어·DIY',
});
const measured: WonRow[] = [
  r('베란다 청소 방법', 7, 90), r('타일 바닥 청소', 10, 300), r('거실 청소', 14, 60),
  r('주말 아이랑 실내', 16, 250), r('나연 혀클리너', 16, 3610), r('차량용 통풍시트', 17, 700),
  r('제습기 연속배수', 19, 560), r('현관 청소', 29, 420), r('베란다 창틀', 30, 60),
  r('옥수수 삶는법', null, 99710), r('방충망 청소', null, 9150), r('창틀 청소', null, 6330),
];
const band = buildNearBand(measured)!;

describe('씨앗', () => {
  it('30위 안에 붙어 본 말이 가까운 순으로 씨앗이 된다 — 순위 밖은 씨앗이 아니다', () => {
    const seeds = nearRows(measured).map((x) => x.keyword);
    expect(seeds.slice(0, 3)).toEqual(['베란다 청소 방법', '타일 바닥 청소', '거실 청소']);
    expect(seeds).not.toContain('옥수수 삶는법');
    expect(seeds).toHaveLength(9);
    // 같은 16위면 검색량 큰 쪽이 먼저
    expect(seeds.indexOf('나연 혀클리너')).toBeLessThan(seeds.indexOf('주말 아이랑 실내'));
  });

  it('핵심 낱말에서 꼬리말을 뺀다 — "방법"이 겹친다고 같은 이야기가 아니다', () => {
    expect(coreWords('베란다 청소 방법')).toEqual(['베란다', '청소']);
    expect(coreWords('이케아 추천템 내돈내산')).toEqual(['이케아', '추천템']);
    expect(coreWords('비 오는 날')).toEqual([]);
  });

  it('연관어가 거의 안 오는 긴 씨앗은 핵심 낱말 둘로 줄여 다시 묻는다', () => {
    expect(shortenSeed('베란다 청소 방법')).toBe('베란다 청소');
    expect(shortenSeed('거실 청소')).toBeNull(); // 이미 핵심 낱말 두 개 그대로
  });
});

describe('넓힌 말 남기기', () => {
  // 시험 실측(2026-09-15, 씨앗 '타일 바닥 청소')에서 받은 연관어 일부 + 걸러야 할 말
  const seed = measured[1];
  const items = [
    { keyword: '다이소화장실청소', searchVolume: 2800 },
    { keyword: '화장실바닥청소', searchVolume: 1640 },
    { keyword: '바닥청소세제', searchVolume: 1480 },
    { keyword: '타일바닥', searchVolume: 12000 },     // 붙어 본 범위 위
    { keyword: '타일줄눈', searchVolume: 40 },          // 바닥 100 아래
    { keyword: '에어컨청소', searchVolume: 2100 },      // '청소'가 들어 있다 — 같은 청소 이야기라 남는다
    { keyword: '겨울캠핑용품', searchVolume: 900 },     // 씨앗 낱말이 없다
    { keyword: '타일 바닥 청소', searchVolume: 300 },   // 이미 쓴 말
    { keyword: '검색량모름청소', searchVolume: null },  // 못 잰 말
  ];

  it('씨앗 낱말이 있고 · 검색량이 붙어 본 범위(100~최대) 안이고 · 이미 쓴 말이 아닌 것만, 검색량 큰 순으로', () => {
    const seen = new Set(['타일바닥청소']);
    const got = pickExpansions(seed, items, band, seen, 10).map((e) => e.keyword);
    expect(got).toEqual(['다이소화장실청소', '에어컨청소', '화장실바닥청소', '바닥청소세제']);
  });

  it('한 씨앗이 남기는 수에 상한이 있다 — 연관어 200개짜리 씨앗이 판을 다 채우지 않게', () => {
    expect(pickExpansions(seed, items, band, new Set(), 2)).toHaveLength(2);
  });

  it('다른 씨앗이 이미 남긴 말은 또 남기지 않는다', () => {
    const seen = new Set<string>();
    pickExpansions(seed, items, band, seen, 10);
    const again = pickExpansions(measured[2], [{ keyword: '화장실바닥청소', searchVolume: 1640 }], band, seen, 10);
    expect(again).toHaveLength(0);
  });

  it('남긴 말에 어느 씨앗에서 몇 위였는지 붙인다 — 카드가 왜 나왔는지 말할 수 있게', () => {
    const [first] = pickExpansions(seed, items, band, new Set(), 1, '자동완성');
    expect(first).toMatchObject({ keyword: '다이소화장실청소', seed: '타일 바닥 청소', seedRank: 10, via: '자동완성' });
  });

  it('씨앗마다 돌아가며 하나씩 줄세운다', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
  });
});

describe('내 블로그 어휘와 겹침', () => {
  const profile = buildProfile({ wonRows: measured, snapshot: { declaredTopic: '인테리어·DIY' } })!;

  it('순위를 잰 말의 핵심 낱말이 어휘다 — 붙여 쓴 말도 잡는다', () => {
    expect(sharesVocabulary('욕실 청소 세제', profile.vocabulary)).toBe(true);
    expect(sharesVocabulary('제습기추천', profile.vocabulary)).toBe(true);
  });

  it('인테리어·DIY 블로그에 kaist 입학처는 겹치지 않는다 — 9-14 회차가 세웠던 그 말', () => {
    expect(sharesVocabulary('kaist 입학처', profile.vocabulary)).toBe(false);
    expect(sharesVocabulary('kaist 서울캠퍼스', profile.vocabulary)).toBe(false);
  });

  it('이미 쓴 말을 안다 · 블로그 주제를 안다 · 범위를 같이 든다', () => {
    expect(profile.ownKeywords.has('타일바닥청소')).toBe(true);
    expect(profile.declaredTopic).toBe('인테리어·DIY');
    expect(profile.band!.volumeMax).toBe(3610);
  });

  it('순위를 잰 기록이 없으면 프로필이 없다', () => {
    expect(buildProfile({ wonRows: [] })).toBeNull();
    expect(buildProfile(null)).toBeNull();
  });
});

describe('지금 내 블로그 — 잰 사실만 문장으로', () => {
  const record = {
    measuredAt: '2026-09-13T15:16:12.887Z',
    card: { headline: null, lines: [{ text: '최근 30일에 8개를 올렸어요. 보통 4일에 한 편씩 올려요.', evidence: '9월 14일 00:16 · 글 목록' }] },
    wonRows: measured,
  };

  it('사실 카드 문장에 순위 결과와 오늘 찾을 범위를 덧붙인다', () => {
    const lines = describeBlogState(record, band).map((l) => l.text);
    expect(lines[0]).toBe('최근 30일에 8개를 올렸어요. 보통 4일에 한 편씩 올려요.');
    expect(lines).toContain('검색어 12개로 내 순위를 재 봤고, 첫 페이지(10위 안) 2개 · 11~30위 7개였어요.');
    expect(lines).toContain('오늘 쓸 것은 30위 안에 붙어 본 말들의 검색량(100~3,610) 안에서 찾아요.');
  });

  it('문장마다 언제·어디서 잰 값인지 붙인다', () => {
    const lines = describeBlogState(record, band);
    expect(lines[0].evidence).toBe('9월 14일 00:16 · 글 목록');
    expect(lines[lines.length - 1].evidence).toBe('2026-09-13 에 잰 값');
  });

  it('범위가 없으면 그렇다고 말한다 — 지어내지 않는다', () => {
    const lines = describeBlogState({ ...record, wonRows: [r('먼 말', null, 500)] }, null).map((l) => l.text);
    expect(lines).toContain('아직 30위 안에 든 검색어가 없어 검색량으로는 못 거르고, 자리만 재서 골라요.');
  });

  it('점수·지수·확률 같은 말을 만들지 않는다', () => {
    const text = describeBlogState(record, band).map((l) => l.text).join(' ');
    for (const banned of ['점수', '지수', '확률', '가능성', '추천', '보장']) expect(text).not.toContain(banned);
  });

  it('블로그를 안 쟀으면 아무 말도 하지 않는다', () => {
    expect(describeBlogState(null, null)).toEqual([]);
  });
});
