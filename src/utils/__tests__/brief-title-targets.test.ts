import { describe, expect, it } from 'vitest';
import { buildBriefPrompt, kstToday, sanitizeTitles, titleTargetOf, type FactCard } from '../topic-briefs';

/**
 * 제목 후보의 세 갈래 — 사장님 2026-09-10
 * "오늘의 글감 제목후보는 네이버에 최적화해서 SEO·AEO·GEO 에 최적화된 제목을 나열해줘야 됩니다".
 *
 * 실사고(사이트 저녁 회차): 핵심 검색어가 '계약학과'(월 8,460)인데 제목 셋 중 둘이
 *   "왜 반도체 계약학과로 지원이 쏠렸을까" / "의대 대신 반도체 계약학과 고른 수험생들"
 * 처럼 검색어를 문장 한가운데 묻어 두었다. 네이버 검색에는 그 제목이 안 걸린다.
 *
 * 그래서 라벨을 믿지 않고 **글자로 확인**한다. 확인 규칙:
 *   검색   검색어로 문장이 시작한다
 *   AI답변 답을 요구하는 꼴로 끝나고, 검색어가 앞쪽 절반 안에 있다
 *   인용   숫자가 박혀 있고 검색어가 들어 있다
 */
const KW = ['계약학과', '반도체 계약학과', '의대 수시'];

describe('제목이 어느 갈래인지 글자로 가린다', () => {
  it('검색어로 시작하면 검색용', () => {
    expect(titleTargetOf('계약학과 지원이 몰린 이유', KW)).toBe('검색');
    expect(titleTargetOf('반도체 계약학과 뽑는 기업과 조건', KW)).toBe('검색');
  });

  it('검색어를 문장 한가운데 묻으면 검색용이 아니다 — 이번 사고의 핵심', () => {
    expect(titleTargetOf('왜 반도체 계약학과로 지원이 쏠렸을까', KW)).not.toBe('검색');
    expect(titleTargetOf('의대 대신 반도체 계약학과 고른 수험생들', KW)).not.toBe('검색');
  });

  it('답을 요구하는 꼴로 끝나고 검색어가 앞쪽에 있으면 AI답변용', () => {
    expect(titleTargetOf('계약학과 지원 자격은 어떻게 되는지', KW)).toBe('AI답변');
    expect(titleTargetOf('계약학과 취업 연계는 어디까지인가', KW)).toBe('AI답변');
    expect(titleTargetOf('계약학과 원서접수 언제', KW)).toBe('AI답변');
  });

  it('질문 꼴이어도 검색어가 뒤쪽에 있으면 AI답변용이 아니다', () => {
    expect(titleTargetOf('올해 수험생들이 몰린 곳이 반도체 계약학과인가', KW)).not.toBe('AI답변');
  });

  it('숫자가 박혀 있으면 인용용', () => {
    expect(titleTargetOf('계약학과 2027학년도 수시 마감 결과', KW)).toBe('인용');
    expect(titleTargetOf('반도체 계약학과 6장 지원 흐름', KW)).toBe('인용');
  });

  it('검색어가 아예 없으면 어느 갈래도 아니다', () => {
    expect(titleTargetOf('수험생들이 고른 길', KW)).toBe(null);
    expect(titleTargetOf('올해 입시가 달라진 이유', KW)).toBe(null);
  });
});

describe('검증기가 갈래 없는 제목을 떨어뜨린다', () => {
  const raw = [
    { type: '질문형', text: '왜 반도체 계약학과로 지원이 쏠렸을까' },   // 검색어가 가운데 · 질문 꼴도 아님 → 버림
    { type: '정리형', text: '계약학과 지원이 몰린 이유' },              // 검색
    { type: '시기형', text: '계약학과 원서접수 언제까지인가요' },        // AI답변
    { type: '비교형', text: '계약학과 2027학년도 수시 결과' },           // 인용
    { type: '경험형', text: '수험생들이 고른 길' },                      // 검색어 없음 → 버림
  ];

  it('세 갈래를 갖춘 것만 남고, 라벨이 붙는다', () => {
    const got = sanitizeTitles(raw, '반도체 계약학과 몰리고 의대 지원 줄어든 흐름', 4, KW);
    expect(got.map((t) => t.text)).not.toContain('왜 반도체 계약학과로 지원이 쏠렸을까');
    expect(got.map((t) => t.text)).not.toContain('수험생들이 고른 길');
    expect(new Set(got.map((t) => t.target))).toEqual(new Set(['검색', 'AI답변', '인용']));
    expect(got.length).toBe(3);
  });

  it('갈래가 고루 섞인다 — 한 갈래가 자리를 다 먹지 않는다', () => {
    const many = [
      { type: '정리형', text: '계약학과 지원이 몰린 이유' },
      { type: '정리형', text: '계약학과 뽑는 기업 구조' },
      { type: '정리형', text: '계약학과 졸업 뒤 진로' },
      { type: '시기형', text: '계약학과 원서접수 언제까지인가요' },
    ];
    const got = sanitizeTitles(many, '다른 제목', 3, KW);
    expect(got.filter((t) => t.target === 'AI답변').length).toBe(1);
    expect(got.filter((t) => t.target === '검색').length).toBe(2);
  });

  it('금지 상투구는 갈래를 갖췄어도 떨어진다', () => {
    const got = sanitizeTitles([{ type: '정리형', text: '계약학과 총정리 2027' }], '다른 제목', 4, KW);
    expect(got).toEqual([]);
  });

  it('keywords 를 안 주면 옛 방식대로 다 받는다 — 부르는 쪽이 안 고쳐졌을 때', () => {
    const got = sanitizeTitles([{ type: '경험형', text: '수험생들이 고른 길' }], '다른 제목', 4);
    expect(got.length).toBe(1);
    expect(got[0].target).toBe(null);
  });
});

describe('프롬프트가 세 갈래를 실제로 청한다', () => {
  const fact: FactCard = {
    id: 'f1', field: '취업·교육', title: '수시 원서접수 마감', snippet: '2027학년도 수시 원서접수가 마감됐다',
    press: 'mediawatch.kr', link: 'https://x', publishedAt: '2026-09-10T00:00:00.000Z', dates: ['2026-09-10'],
  };
  const prompt = buildBriefPrompt('취업·교육', [fact], kstToday(new Date('2026-09-10T09:00:00+09:00')), 3);

  it('target 필드를 요구한다', () => {
    expect(prompt).toContain('"target": "검색|AI답변|인용"');
  });

  it('세 갈래 규칙이 다 적혀 있다', () => {
    expect(prompt).toContain('[target: "검색"]');
    expect(prompt).toContain('[target: "AI답변"]');
    expect(prompt).toContain('[target: "인용"]');
    // 이번 사고를 예시로 못 박는다
    expect(prompt).toContain('왜 반도체 계약학과로 지원이 쏠렸을까');
    expect(prompt).toContain('문장을 시작');
  });

  it('AI 티 금지 교리는 그대로 남아 있다', () => {
    expect(prompt).toContain('총정리');
    expect(prompt).toContain('쉼표로 두 동강 내지 마라');
    expect(prompt).toContain('답을 제목에 다 적지 마라');
  });
});
