import { describe, expect, it } from 'vitest';
import { applyMeasuredVolumes, buildBriefPrompt, extractDates, extractFutureMonths, normalizeBriefForDisplay, finalizeBriefRecommendations, pickAltCandidates, pickRelatedKeywords, serpFitOf, titleTargetOf, validateBriefs, type FactCard, type TopicBrief } from '../topic-briefs';

const today = new Date('2026-09-17T00:00:00Z');
const fact: FactCard = { id: 'f1', field: '생활', title: '시몬스 침대 신제품 출시', snippet: '시몬스 침대 신제품은 9월 20일 출시된다. 가격과 사전예약 조건은 공개되지 않았다.', press: 'news.example', link: 'https://news.example/1', publishedAt: '2026-09-16T01:00:00Z', dates: ['2026-09-20'] };
const draft = { title: '시몬스 침대 신제품 언제 출시되나요?', timing: 'NEXT', types: ['정보형'], primaryIntent: '시몬스 침대 신제품 출시일 확인', value: '시몬스 침대 신제품은 9월 20일 출시된다.', experience: '직접 사용한 경험은 별도로 확인해야 합니다.', differentiation: '출시일과 미공개 조건을 구분합니다.', coreKeyword: '시몬스 침대', keywords: ['시몬스 침대', '침대', '시몬스 침대 신제품'], factIds: ['f1'], editorial: { version: 2, status: 'supported', summary: '시몬스 침대 신제품은 9월 20일 출시된다.', audience: '신제품 출시일을 확인하려는 독자', answers: [{ question: '시몬스 침대 신제품은 언제 출시되나요?', answer: '시몬스 침대 신제품은 9월 20일 출시된다.', factIds: ['f1'], excerpts: [{ factId: 'f1', text: '시몬스 침대 신제품은 9월 20일 출시된다.' }] }], missing: [], outline: ['확인된 출시일', '공개 여부를 확인할 조건'], angle: '출시일과 미공개 조건을 구분합니다.' } };
const brief = (over: Partial<TopicBrief> = {}) => {
  const validated = validateBriefs([draft], [fact], '생활', today).ok[0]!;
  return { ...validated, editorial: { ...validated.editorial!, review: { passed: true, issues: [] } }, searchVolume: 1000, serpFacing: 1, serpVacancy: 2, serpFit: '높음', star: true, ...over } as TopicBrief;
};

describe('오늘의 글감 근거와 추천 회귀', () => {
  it('17일 발행 기사에서 16일 발표를 다음 달로 밀지 않고 숙박 기간은 날짜로 읽지 않는다', () => {
    expect(extractDates('16일(현지 시간) 발표했다. 1박 2일 캠프다.', '2026-09-17T01:00:00Z')).toEqual(['2026-09-16']);
    expect(extractDates('오는 3일 개막', '2026-09-17T01:00:00Z')).toEqual(['2026-10-03']);
    expect(extractDates('10월 3일부터 18일까지 운영한다고 17일 밝혔다.', '2026-09-17T01:00:00Z')).toEqual(['2026-09-17', '2026-10-03', '2026-10-18']);
    expect(extractDates('영주 풍기인삼축제 10월 3~11일 개최', '2026-09-17T01:00:00Z')).toEqual(['2026-10-03', '2026-10-11']);
  });
  it('과거에 설립된 달과 연도가 생략된 지난 달을 미래 일정으로 만들지 않는다', () => {
    expect(extractFutureMonths('한국에는 2023년 11월 설립했다. 지난 6월 출시했다. 1월에 도입했다.', '2026-09-17T01:00:00Z')).toEqual([]);
    expect(extractFutureMonths('2027년 1월부터 시행, 10월 중 발표, 내년 3월 도입', '2026-09-17T01:00:00Z')).toEqual(['2026-10-01', '2027-01-01', '2027-03-01']);
  });
  it('빈자리 점수가 좋아도 정면 경쟁 6개 이상은 낮음이다', () => {
    expect(serpFitOf(8, 2)).toBe('낮음');
    expect(serpFitOf(6, 0)).toBe('낮음');
    expect(serpFitOf(-1, 0)).toBe('미측정');
  });
  it('원검색을 보존하는 더 좁은 검색어만 대안/관련어로 남긴다', () => {
    const suggestions = ['침대', '시몬스', '시몬스 침대 신제품', '면접', '해외여행'].map(keyword => ({ keyword, totalSearchVolume: 10000 }));
    expect(pickAltCandidates(draft, suggestions, new Map()).map(x => x.keyword)).toEqual(['시몬스 침대 신제품']);
    expect(pickRelatedKeywords(draft, suggestions, new Map()).map(x => x.keyword)).toEqual(['시몬스 침대 신제품']);
    expect(applyMeasuredVolumes(brief(), new Map([['시몬스침대', 800], ['침대', 500000]])).coreKeyword).toBe('시몬스 침대');
  });
  it('기사에 없는 999만원과 직접 수령한 경험은 검증을 통과하지 않는다', () => {
    for (const change of [{ value: '신제품 신청자는 999만원을 지급받습니다.' }, { title: '시몬스 침대 써보니 확 다르네요' }, { primaryIntent: '직접 999만원을 받았어요' }, { differentiation: '매장에서 누워보니 편안했어요' }]) {
      expect(validateBriefs([{ ...draft, ...change }], [fact], '생활', today).ok).toHaveLength(0);
    }
  });
  it('출처 발췌를 조작하거나 같은 날짜의 다른 달을 쓰면 supported로 남기지 않는다', () => {
    expect(validateBriefs([{ ...draft, value: '10월 20일 출시된다.' }], [fact], '생활', today).ok).toHaveLength(0);
    const changed = { ...draft, editorial: { ...draft.editorial, answers: [{ ...draft.editorial.answers[0], answer: '누구나 무료로 받습니다.', excerpts: [{ factId: 'f1', text: '누구나 무료로 받습니다.' }] }] } };
    const result = validateBriefs([changed], [fact], '생활', today).ok[0];
    expect(result?.editorial?.status).toBe('needs_research');
    expect(result?.editorial?.answers).toEqual([]);
  });
  it('출처 단어를 뒤섞은 별개의 사실은 검증된 답이 아니다', () => {
    const changed = { ...draft, editorial: { ...draft.editorial, answers: [{ ...draft.editorial.answers[0], answer: '가격은 9월 20일 공개된다.' }] } };
    expect(validateBriefs([changed], [fact], '생활', today).ok[0]?.editorial?.status).toBe('needs_research');
  });
  it('확인된 답과 정확발췌는 보존하고 부족한 내용이 있으면 추천하지 않는다', () => {
    expect(brief().editorial?.status).toBe('supported');
    expect(finalizeBriefRecommendations([brief()])[0]?.recommendation?.keyword).toBe('시몬스 침대');
    expect(finalizeBriefRecommendations([brief({ searchVolume: null })])[0]?.star).toBe(false);
    const missing = brief({ editorial: { ...draft.editorial, version: 2, status: 'needs_research', missing: ['가격 확인 필요'] } });
    expect(finalizeBriefRecommendations([missing])[0]?.star).toBe(false);
  });
  it('구형 글감도 버리지 않고 검증 전으로 표시하며 경험 제목과 과한 별을 제거한다', () => {
    const legacy = brief({ editorial: undefined, title: '시몬스 침대 직접 써보니 좋네요', alternative: { keyword: '침대', searchVolume: 99999, serpFacing: 8, serpVacancy: 2, serpFit: '높음' } });
    const output = normalizeBriefForDisplay(legacy);
    expect(output.editorial?.status).toBe('needs_research');
    expect(output.editorial?.missing.join(' ')).toContain('검증');
    expect(output.title).not.toContain('써보니');
    expect(output.star).toBe(false);
    expect(output.alternative).toBeNull();
    expect(output.facts).toEqual(legacy.facts);
    expect(normalizeBriefForDisplay(output)).toEqual(output);
  });
  it('상품명에 있는 숫자를 수치 배지로 만들지 않는다', () => {
    expect(titleTargetOf('미르의 전설2 업데이트 확인할 내용', ['미르의 전설2'])).toBe('설명');
    expect(titleTargetOf('미르의 전설2 언제 시작하나요?', ['미르의 전설2'])).toBe('질문');
    expect(titleTargetOf('미르의 전설2 9월 20일 업데이트 안내', ['미르의 전설2'])).toBe('수치');
    expect(titleTargetOf('삼국지: 구주제패 CBT는 언제 진행되나', ['삼국지 구주제패'])).toBe('질문');
  });
  it('프롬프트는 경험 날조 예시와 성과를 보장하는 라벨을 요구하지 않는다', () => {
    const prompt = buildBriefPrompt('생활', [fact], today);
    expect(prompt).toContain('needs_research');
    expect(prompt).toContain('excerpts');
    expect(prompt).toContain('범위를 완성하는 데 필수인 정보만');
    expect(prompt).not.toContain('병원에서 듣고 놀랐어요');
    expect(prompt).not.toContain('자극적인 강한 훅');
  });
  it('검토 결과가 위조되거나 중간에 잘린 요약이면 추천할 수 없다', () => {
    const input = { ...draft, editorial: { ...draft.editorial, review: { passed: true, issues: [] } } };
    expect(validateBriefs([input], [fact], '생활', today).ok[0]?.editorial?.review).toBeUndefined();
    const fragment = '시몬스 침대 신제품은 9월 20일 출시...';
    const incomplete = { ...draft, editorial: { ...draft.editorial, summary: fragment, answers: [{ ...draft.editorial.answers[0], answer: fragment, excerpts: [{ factId: 'f1', text: fragment }] }] } };
    expect(validateBriefs([incomplete], [{ ...fact, snippet: fragment }], '생활', today).ok[0]?.editorial?.status).toBe('needs_research');
  });
  it('검토와 부족한 정보의 구조가 깨지면 빈 배열로 승인하지 않는다', () => {
    const good = brief();
    for (const review of [{ passed: true, issues: '실패' }, { passed: true }, { passed: true, issues: [123] }, { passed: true, issues: ['추가 확인 필요'] }]) {
      const output = normalizeBriefForDisplay({ ...good, editorial: { ...good.editorial!, review: review as any } });
      expect(output.editorial?.status).toBe('needs_research');
      expect(output.editorial?.review?.passed).toBe(false);
      expect(output.star).toBe(false);
      expect(output.recommendation).toBeUndefined();
    }
    for (const missing of [undefined, '가격 확인 필요', [123]]) {
      const output = normalizeBriefForDisplay({ ...good, editorial: { ...good.editorial!, missing: missing as any } });
      expect(output.editorial?.status).toBe('needs_research');
      expect(output.editorial?.review?.passed).toBe(false);
      expect(output.editorial?.missing.length).toBeGreaterThan(0);
      expect(output.star).toBe(false);
    }
  });
});
