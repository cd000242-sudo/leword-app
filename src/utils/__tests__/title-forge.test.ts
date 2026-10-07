import { describe, expect, it } from 'vitest';
import { classifyTitleFrame, findEmptyFrames } from '../title-forge/frame-analysis';
import { forgeTitles } from '../title-forge/forge';

/**
 * 제목 대장간 — 규칙만으로 SEO/홈판 제목 2종을 만든다.
 *
 * 핵심 계약 3개를 고정한다:
 *   1. 빈 프레임 — 1페이지 10개 제목이 이미 쓴 프레임은 피한다.
 *      같은 프레임 11번째 제목은 후킹이 아니라 배경이다.
 *   2. 낚시 가드 — 파생 키워드·시기 실측에 근거 없는 프레임은 제안하지 않는다.
 *      제목이 약속한 것을 본문이 못 주면 체류시간이 무너진다.
 *   3. 규격 — 키워드 앞자리 고정(SEO), 길이 상한(SEO 40자·홈판 38자,
 *      llm-title-writer 와 같은 규격).
 */

describe('프레임 분류 — 제목이 어떤 각도로 쓰였는가', () => {
    it('레시피 프레임', () => {
        expect(classifyTitleFrame('노각무침 황금레시피 아삭하게')).toBe('recipe');
    });
    it('방법 프레임', () => {
        expect(classifyTitleFrame('노각 손질하는법 5분 완성')).toBe('howto');
    });
    it('후기 프레임', () => {
        expect(classifyTitleFrame('에어팟 프로 내돈내산 후기')).toBe('review');
    });
    it('가격 프레임', () => {
        expect(classifyTitleFrame('문콕 수리비 얼마나 나올까')).toBe('price');
    });
    it('실수·해결 프레임', () => {
        expect(classifyTitleFrame('노각무침 물러지는 이유와 해결법')).toBe('mistake');
    });
    it('비교 프레임', () => {
        expect(classifyTitleFrame('노각무침 오이무침 차이 비교')).toBe('compare');
    });
    it('어느 것도 아니면 generic', () => {
        expect(classifyTitleFrame('오늘의 일기')).toBe('generic');
    });
});

describe('빈 프레임 찾기 — 1페이지에 없는 각도만 채택', () => {
    const serpTitles = [
        '노각무침 황금레시피 총정리',
        '노각무침 레시피 아삭하게 만들기',
        '노각무침 만드는법 5분 완성',
        '노각무침 황금레시피 이렇게',
    ];

    it('SERP 가 이미 쓴 프레임은 빈 프레임이 아니다', () => {
        const empty = findEmptyFrames(serpTitles, ['recipe', 'mistake', 'compare']);
        expect(empty).not.toContain('recipe');
        expect(empty).toContain('mistake');
        expect(empty).toContain('compare');
    });

    it('지원 프레임에 없는 것은 비어 있어도 내놓지 않는다 (낚시 가드)', () => {
        const empty = findEmptyFrames(serpTitles, ['mistake']);
        expect(empty).toEqual(['mistake']);
    });
});

describe('제목 생성 — 규격과 근거', () => {
    const input = {
        keyword: '노각무침',
        derivedKeywords: [
            { keyword: '노각무침 물러짐', searchVolume: 320 },
            { keyword: '노각무침 오이무침 차이', searchVolume: 210 },
            { keyword: '노각무침 황금레시피', searchVolume: 20870 },
        ],
        serpTitles: [
            '노각무침 황금레시피 총정리',
            '노각무침 레시피 아삭하게',
            '노각무침 만드는법',
        ],
    };

    it('SEO 제목은 키워드가 맨 앞이고 40자 이하다', () => {
        const out = forgeTitles(input);
        expect(out.seo.text.startsWith('노각무침')).toBe(true);
        expect(out.seo.text.length).toBeLessThanOrEqual(40);
    });

    it('SEO 제목의 프레임은 SERP 에 없는 빈 프레임이다', () => {
        const out = forgeTitles(input);
        expect(['mistake', 'compare']).toContain(out.seo.frame);
    });

    it('빈 프레임의 근거가 된 파생 키워드 표현이 제목에 실린다', () => {
        const out = forgeTitles(input);
        const carried = input.derivedKeywords.some((d) => {
            const extra = d.keyword.replace('노각무침', '').trim();
            return extra.length > 0 && out.seo.text.includes(extra.split(/\s+/)[0]);
        });
        expect(carried).toBe(true);
    });

    it('홈판 제목은 38자 이하다', () => {
        const out = forgeTitles(input);
        expect(out.home.text.length).toBeLessThanOrEqual(38);
        expect(out.home.text.length).toBeGreaterThanOrEqual(6);
    });

    it('파생에 근거 없는 프레임은 절대 나오지 않는다 (낚시 가드)', () => {
        const out = forgeTitles({
            keyword: '민증사진 규칙',
            derivedKeywords: [{ keyword: '민증사진 규칙 머리', searchVolume: 90 }],
            serpTitles: ['민증사진 규칙 총정리'],
        });
        // 파생·시기 어디에도 가격/일정 근거가 없다 — 그 프레임이 나오면 낚시다.
        expect(out.seo.frame).not.toBe('price');
        expect(out.seo.frame).not.toBe('schedule');
        expect(out.home.frame).not.toBe('price');
        expect(out.home.frame).not.toBe('schedule');
    });

    it('근거(basis)에 어느 실측이 이 제목을 만들었는지 적힌다', () => {
        const out = forgeTitles(input);
        expect(out.seo.basis.length).toBeGreaterThan(0);
    });
});

describe('제품 키워드 — 제품명 + 구매욕구 후킹', () => {
    it('홈판 제목에 제품명이 실리고 욕구 문구 근거가 붙는다', () => {
        const out = forgeTitles({
            keyword: '강아지치약 페피릴리프',
            derivedKeywords: [{ keyword: '강아지치약 페피릴리프 후기', searchVolume: 150 }],
            serpTitles: ['강아지 치석 관리 방법'],
            isProduct: true,
            productName: '페피릴리프',
            productSignal: '반려동물 강아지 치약',
        });
        expect(out.home.text).toContain('페피릴리프');
        expect(out.home.basis).toContain('구매');
    });
});

describe('붙어 온 연관어 다듬기 — 키워드와 겹치는 부분은 빼고 남는 말만', () => {
    // 실주행(2026-10-06 '자동차 보험 갱신'): 검색광고 연관어는 붙여 쓴 꼴로 온다. 띄어쓰기로만 나누던 옛 조립은
    // 'KB자동차보험'·'자동차보험비교'를 통째로 끼워 "자동차 보험 갱신 KB자동차보험 어떤 정보가 있는지"를 냈다.
    const keyword = '자동차 보험 갱신';
    const serpTitles = ['자동차 보험 갱신 방법 총정리'];

    it('뒤에 붙은 말만 싣는다 — 비교', () => {
        const out = forgeTitles({ keyword, derivedKeywords: [{ keyword: '자동차보험비교', searchVolume: 88000 }], serpTitles });
        expect(out.home.text).toBe('자동차 보험 갱신 비교, 기준은 하나면 됩니다');
        expect(out.seo.text).toBe('자동차 보험 갱신 비교 무엇이 어떻게 다른가');
    });

    it('앞에 붙은 말은 끌리는 제목에서 키워드 앞으로 — 검색용은 키워드가 맨 앞 그대로', () => {
        const out = forgeTitles({ keyword, derivedKeywords: [{ keyword: 'KB자동차보험', searchVolume: 110700 }], serpTitles });
        expect(out.home.text).toBe('KB 자동차 보험 갱신 이게 뭔지 몰라서 찾아봤습니다');
        expect(out.seo.text).toBe('자동차 보험 갱신 어떤 정보가 있는지');
    });

    it('뒤 문구에 이미 있는 말은 겹쳐 쓰지 않는다', () => {
        const out = forgeTitles({ keyword, derivedKeywords: [{ keyword: '자동차 보험 갱신 방법', searchVolume: 320 }], serpTitles: [] });
        expect(out.seo.text).toBe('자동차 보험 갱신 단계별 방법');
    });

    it('한 글자로 남는 조각(보험료의 료)은 버린다', () => {
        const out = forgeTitles({ keyword, derivedKeywords: [{ keyword: '자동차보험료', searchVolume: 5000 }], serpTitles });
        expect(out.seo.text).not.toMatch(/\s료(\s|$)/);
        expect(out.home.text).not.toMatch(/\s료(\s|,|$)/);
    });

    it('남는 말이 없으면 쉼표 앞에 빈칸이 생기지 않는다', () => {
        const out = forgeTitles({ keyword: '노각무침', derivedKeywords: [{ keyword: '노각무침', searchVolume: 900 }], serpTitles: [], frame: undefined });
        expect(out.home.text).not.toMatch(/\s,/);
    });
});

/*
 * 인물 · 이슈 키워드(2026-10-07 사장님 "제목이 그게 왜 나오니 — 상위노출 · 홈판 노출을 겨냥한 제목이어야지").
 * 실사고: '가수주현미별세이유' → "가수주현미별세이유 어떤 정보가 있는지" · "… 이게 뭔지 몰라서 찾아봤습니다".
 * 원인 ① 붙여 쓴 키워드를 그대로 박음 ② 틀이 상품 · 생활정보용이라 '이유' → '원인과 해결법'이 됐을 것.
 * 인물 · 이슈는 확인 안 된 사실을 단정하지 않고(가짜 뉴스일 수 있다), 실제로 많이 찾는 말(근황)을 붙인다.
 */
describe('인물 · 이슈 제목', () => {
  it('인물 · 이슈 판별 — 직업 앞말 또는 별세 · 근황 · 프로필 같은 말 · 생활정보(결혼 준비 비용 · 만 나이 계산)는 아님', async () => {
    const { isPersonIssueKeyword } = await import('../title-forge/issue');
    expect(isPersonIssueKeyword('가수주현미별세이유')).toBe(true);
    expect(isPersonIssueKeyword('주현미 근황')).toBe(true);
    expect(isPersonIssueKeyword('배우김OO나이')).toBe(true);
    expect(isPersonIssueKeyword('자동차 보험 갱신')).toBe(false);
    expect(isPersonIssueKeyword('결혼 준비 비용')).toBe(false);
    expect(isPersonIssueKeyword('만 나이 계산')).toBe(false);
  });

  it('검색용은 띄운 키워드 맨 앞 + 실제 많이 찾는 인물 말(근황) · 홈판용은 직업 · 이유 뗀 짧은 말로 답 숨김 · 둘 다 단정 없음', async () => {
    const { forgeVariedTitles } = await import('../title-forge/varied');
    const derived = [
      { keyword: '가수주현미별세', searchVolume: 301600 },
      { keyword: '가수주현미', searchVolume: 15760 },
      { keyword: '주현미 별세', searchVolume: 9130 },
      { keyword: '가수주현미근황', searchVolume: 2490 },
      { keyword: '주현미 노래', searchVolume: 2510 },
    ];
    const titles = forgeVariedTitles('가수주현미별세이유', derived, ['가수 주현미 별세? 사실은…']);
    expect(titles.map((t) => [t.kind, t.text])).toEqual([
      ['끌리는', '주현미 별세 소식 돌던데… 직접 확인해 봤습니다'],
      ['검색용', '가수 주현미 별세 이유, 근황까지 확인된 사실만'],
    ]);
    expect(titles.every((t) => t.frameLabel === '인물·이슈')).toBe(true);
    expect(titles[1].basis).toContain('가수주현미근황');
    for (const t of titles) expect(/원인과 해결법|어떤 정보가 있는지|이게 뭔지 몰라서/.test(t.text), t.text).toBe(false);
  });

  it('인물 말 근거가 없으면 검색용은 키워드 + 확인된 사실만 · 근황 · 프로필은 홈판용을 소식이 아니라 찾아본 말로', async () => {
    const { forgeVariedTitles } = await import('../title-forge/varied');
    const titles = forgeVariedTitles('배우김OO프로필', [], []);
    expect(titles.map((t) => t.text)).toEqual(['김OO 프로필 궁금해서 직접 찾아봤습니다', '배우 김OO 프로필, 확인된 사실만']);
  });

  it('인물 · 이슈가 아닌 붙여 쓴 키워드도 제목에는 띄어서 박는다', async () => {
    const { forgeVariedTitles } = await import('../title-forge/varied');
    const titles = forgeVariedTitles('청년도약계좌신청방법', [{ keyword: '청년도약계좌 신청방법', searchVolume: 900 }], []);
    for (const t of titles) expect(t.text.startsWith('청년도약계좌 신청 방법'), t.text).toBe(true);
  });
});

describe('꼬리말 겹침(2026-10-07 "청년도약계좌 신청 방법 단계별 방법")', () => {
  it('키워드에 이미 있는 낱말이 꼬리말에 또 나오면 다른 꼬리말 · 겹침 없는 키워드는 예전 그대로', () => {
    const howto = forgeTitles({ keyword: '청년도약계좌 신청 방법', derivedKeywords: [{ keyword: '청년도약계좌 신청방법', searchVolume: 900 }], serpTitles: [] });
    expect(howto.seo.text.split('방법').length - 1).toBe(1);
    const price = forgeTitles({ keyword: '이사 비용', derivedKeywords: [{ keyword: '이사 비용 견적', searchVolume: 500 }], serpTitles: [] });
    expect(price.seo.text.split('비용').length - 1).toBe(1);
    const plain = forgeTitles({ keyword: '엑셀 함수', derivedKeywords: [{ keyword: '엑셀 함수 사용법', searchVolume: 800 }], serpTitles: [] });
    expect(plain.seo.text).toBe('엑셀 함수 사용법 단계별 방법');
  });
});

describe('일반 틀은 마지막 수단(2026-10-07 "자동차 보험 갱신 어떤 정보가 있는지")', () => {
  it('근거 없는 연관어(KB자동차보험)가 검색량이 커도 일반 틀을 세우지 않는다 · 다른 근거 틀만 쓴다', async () => {
    const { forgeVariedTitles } = await import('../title-forge/varied');
    const titles = forgeVariedTitles('자동차 보험 갱신', [
      { keyword: 'KB자동차보험', searchVolume: 115300 },
      { keyword: '자동차보험비교', searchVolume: 63700 },
      { keyword: '자동차 보험 갱신 기간 놓치면', searchVolume: 90 },
      { keyword: '자동차 보험 갱신 방법', searchVolume: 70 },
    ], []);
    expect(titles.some((t) => t.frame === 'generic')).toBe(false);
    for (const t of titles) expect(/어떤 정보가 있는지|이게 뭔지 몰라서/.test(t.text), t.text).toBe(false);
    expect(new Set(titles.map((t) => t.frameLabel))).toEqual(new Set(['비교', '시기', '방법']));
  });

  it('근거 틀이 하나도 없을 때만 일반 틀', async () => {
    const { forgeVariedTitles } = await import('../title-forge/varied');
    const titles = forgeVariedTitles('엑셀 단축키', [{ keyword: 'KB자동차보험', searchVolume: 100 }], []);
    expect(titles.every((t) => t.frame === 'generic')).toBe(true);
  });
});

describe('끝나지 않은 조각(2026-10-07 "자동차 보험 갱신 기간 놓치면 언제부터 언제까지")', () => {
  it('연관어 끝의 …면 · …는데 · …려면 조각은 떼고 붙인다', () => {
    const t = forgeTitles({ keyword: '자동차 보험 갱신', derivedKeywords: [{ keyword: '자동차 보험 갱신 기간 놓치면', searchVolume: 90 }], serpTitles: [] });
    expect(t.seo.text).toBe('자동차 보험 갱신 기간 언제부터 언제까지');
  });
});
