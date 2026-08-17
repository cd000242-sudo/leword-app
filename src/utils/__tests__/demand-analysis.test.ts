import { describe, expect, it } from 'vitest';
import { groundDemandReasons, buildDemandEvidence } from '../keyword-demand-analysis';

/**
 * "이 키워드를 왜 이렇게 많이 검색하나" — 근거 없는 설명은 내보내지 않는다.
 *
 * 사장님 지시(2026-08-18): "이 키워드가 왜 검색을 많이 하는지 분석해서
 * 보여주게끔". 문제는 이 질문이 **AI 가 가장 그럴듯하게 지어내기 쉬운**
 * 종류라는 것이다. "최근 관심이 높아지고 있습니다" 같은 문장은 어느 키워드에
 * 갖다 붙여도 말이 되고, 아무것도 알려주지 않는다.
 *
 * 그래서 설명 하나하나가 **우리가 실제로 잰 신호**를 짚어야만 통과시킨다.
 * 짚지 못한 문장은 버린다 — 빈 화면이 거짓 설명보다 낫다.
 */

const EVIDENCE = buildDemandEvidence({
  keyword: '민증사진 규칙',
  expansions: ['민증사진 규격', '민증사진 안경', '민증사진 배경색'],
  volumes: new Map([['민증사진규격', 1200]]),
  serpSections: ['지식iN', '이미지', '블로그'],
});

describe('실측 신호를 짚은 설명만 통과', () => {
  it('자동완성 실측을 짚으면 통과한다', () => {
    const kept = groundDemandReasons([
      { text: '규격·안경·배경색처럼 촬영 전에 확인할 조건을 따로 검색한다', basis: '자동완성' },
    ], EVIDENCE);
    expect(kept).toHaveLength(1);
    expect(kept[0].basis).toBeTruthy();
  });

  it('SERP 구획 실측을 짚으면 통과한다', () => {
    const kept = groundDemandReasons([
      { text: '지식iN 이 상위에 있어 남에게 물어봐야 풀리는 질문형 수요다', basis: 'SERP' },
    ], EVIDENCE);
    expect(kept).toHaveLength(1);
  });
});

describe('지어낸 설명은 버린다', () => {
  it('아무 키워드에나 붙는 상투구는 걸러진다', () => {
    const kept = groundDemandReasons([
      { text: '최근 관심이 높아지고 있습니다', basis: '' },
      { text: '많은 사람들이 궁금해하는 주제입니다', basis: '' },
    ], EVIDENCE);
    expect(kept).toEqual([]);
  });

  it('우리가 재지 않은 것을 근거로 대면 걸러진다', () => {
    // 계절성·연령대는 이 경로에서 측정하지 않는다. 측정하지 않은 것을
    // 근거라고 적으면 그건 관측이 아니라 추측이다.
    const kept = groundDemandReasons([
      { text: '20대 여성 사이에서 인기가 급증했다', basis: '연령대 분석' },
      { text: '여름 휴가철마다 검색이 몰린다', basis: '계절성' },
    ], EVIDENCE);
    expect(kept).toEqual([]);
  });

  it('너무 짧거나 빈 설명은 버린다', () => {
    expect(groundDemandReasons([{ text: '수요 많음', basis: '자동완성' }], EVIDENCE)).toEqual([]);
    expect(groundDemandReasons([{ text: '', basis: '자동완성' }], EVIDENCE)).toEqual([]);
  });
});

describe('근거 목록', () => {
  it('실제로 잰 것만 근거로 싣는다', () => {
    expect(EVIDENCE.signals).toContain('자동완성');
    expect(EVIDENCE.signals).toContain('SERP');
    expect(EVIDENCE.signals).toContain('검색량');
  });

  it('안 잰 신호는 근거 목록에 없다', () => {
    // 검색량을 하나도 못 쟀으면 '검색량'을 근거로 인정하면 안 된다.
    const thin = buildDemandEvidence({
      keyword: '민증사진 규칙',
      expansions: ['민증사진 규격'],
      volumes: new Map(),
      serpSections: [],
    });
    expect(thin.signals).not.toContain('검색량');
    expect(thin.signals).not.toContain('SERP');
    expect(thin.signals).toContain('자동완성');
  });
});
