import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/**
 * 홈판 제목 규격 — 메인키워드 + 서브키워드 + 후킹.
 *
 * 사장님 지시(2026-08-18): "홈판용은 메인키워드+서브키워드+클릭할수밖에없는
 * 후킹이어야 돼". 그중 기계가 확인할 수 있는 것은 **서브키워드가 실제로
 * 들어갔는가**다(후킹의 세기는 사람이 본다). 그걸 못 박는다.
 *
 * 서브로 인정하는 것은 메인 밖의 **실측** 낱말뿐이다 — 자동완성에서 온 말이거나
 * 기사 사실 문장에 나온 말. 지어낸 말은 서브가 아니다.
 */

const require_ = createRequire(import.meta.url);
const { homeTitleHasSub, subKeywordCandidates } = require_('../../../scripts/enrich-brief-titles.js');

const FACTS = [
  '경남 거제에 570㎜ 넘는 비가 내려 도로 아스팔트가 뜯겨나갔다',
  '3개 시군에서 주민 165명이 대피했다',
];

describe('서브키워드가 없으면 규격 미달', () => {
  it('상투구는 걸러진다', () => {
    // 메인 낱말이 사실에도 있다고 통과시키면 이 문장이 살아남는다 —
    // 아무 기사에나 갖다 붙일 수 있는 제목이 정확히 우리가 없애려던 것이다.
    expect(homeTitleHasSub('경남 거제 호우 최신 이슈와 핵심 내용 정리', [], FACTS, '경남 거제 호우')).toBe(false);
    expect(homeTitleHasSub('경남 거제 호우 총정리', [], FACTS, '경남 거제 호우')).toBe(false);
  });

  it('메인키워드만 있으면 통과하지 못한다', () => {
    expect(homeTitleHasSub('경남 거제 호우', [], FACTS, '경남 거제 호우')).toBe(false);
  });
});

describe('실측 낱말이 들어가면 통과', () => {
  it('기사 사실에 나온 낱말이 서브 역할을 한다', () => {
    expect(homeTitleHasSub('경남 거제 570㎜ 호우, 아스팔트가 뜯겨나갔다', [], FACTS, '경남 거제 호우')).toBe(true);
  });

  it('자동완성에서 온 서브가 조사와 붙어 있어도 인정한다', () => {
    // 한국어는 조사가 붙는다. '제니'를 줬는데 제목엔 '제니도'로 들어간다 —
    // 낱말 단위 정확 일치로 보면 멀쩡한 제목이 탈락한다(실측으로 겪었다).
    const subs = ['제니', '리사'];
    const facts = ['블랙핑크가 데뷔 10주년 이벤트에 대해 사과했다'];
    expect(homeTitleHasSub('블랙핑크 제니도 리사도 사과한 10주년 잡음', subs, facts, '블랙핑크 10주년 사과')).toBe(true);
  });
});

describe('서브키워드 후보 고르기', () => {
  it('메인을 품지 않은 자동완성은 버린다', () => {
    // '안세영 … 진출'의 확장어로 '진출 뜻', 't1 월즈 진출'이 온다 —
    // 뒷토막만 맞은 남의 검색어다. 이걸 서브로 쓰면 제목이 딴 주제로 끌려간다.
    const subs = subKeywordCandidates('안세영 복귀전 32강 진출', ['진출 뜻', 't1 월즈 진출', '월즈 진출 조건']);
    expect(subs).toEqual([]);
  });

  it('메인을 품은 자동완성에서 "뒤에 붙는 말"만 뽑는다', () => {
    const subs = subKeywordCandidates('블랙핑크 10주년 사과', ['블랙핑크 리사', '블랙핑크 제니', '블랙핑크 해체']);
    expect(subs).toContain('리사');
    expect(subs).toContain('제니');
    expect(subs).not.toContain('블랙핑크');
  });
});
