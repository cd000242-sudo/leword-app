/**
 * 애드센스 고수 벤치마크 3단계 — 소재 1개당 구글 · 다음 검색용 제목 20개(2026-10-07).
 * 홈판 제목(후킹 · 구어)과 다르다: 대표 검색어를 앞에, 22~45자(고수 제목 가운데 36자), 숫자는 재료에 있는 것만.
 */
import { describe, expect, it } from 'vitest';
import { checkAdsenseTitle, buildAdsenseTitlePrompt, titlesForAdsenseCards, cardsFromAdsenseBoard, facetsOf, scoreAdsenseTitle, masterBaseline, type AdsenseTitleCard } from '../adsense-title-engine';

const card: AdsenseTitleCard = {
  id: 'c1', query: '국민연금추납', keyword: '국민연금 추납 순서', category: '금융·재테크',
  sourceTitles: ['국민연금 추납 신청, 119개월보다 먼저 60회 분할의 비용을 보세요', '국민연금 추납 신청방법, 가능기간·보험료 계산·분할납부 조건'],
};

describe('애드센스 검색용 제목 검사', () => {
  it('대표 검색어를 담고 길이 · 숫자 근거를 지키면 통과', () => {
    expect(checkAdsenseTitle('국민연금 추납 신청 전에 60회 분할 비용부터 따져 볼 것', card)).toEqual([]);
  });
  it('검색어 없음 · 너무 짧음/김 · 재료에 없는 숫자 · 과장 · 체험 지어내기 · 고수 제목 베끼기는 막는다', () => {
    expect(checkAdsenseTitle('연금 미리 내면 좋은 이유와 계산법 한 번에 보기', card)).toContain('NO_ANCHOR');
    expect(checkAdsenseTitle('국민연금 추납 정리', card)).toContain('TOO_SHORT');
    expect(checkAdsenseTitle('국민연금 추납 신청 방법과 대상 조건 기간 보험료 계산 분할 납부 주의사항까지 하나도 빠짐없이 정리', card)).toContain('TOO_LONG');
    expect(checkAdsenseTitle('국민연금 추납 신청하면 300만원 돌려받는 방법과 조건', card)).toContain('UNSUPPORTED_NUMBER');
    expect(checkAdsenseTitle('국민연금 추납 충격적인 결과, 모르면 손해 보는 신청법', card)).toContain('HYPE_WORD');
    expect(checkAdsenseTitle('국민연금 추납 직접 신청해 봤더니 이렇게 달라졌어요', card)).toContain('FAKE_EXPERIENCE');
    expect(checkAdsenseTitle('국민연금 추납 신청방법, 가능기간·보험료 계산·분할납부 조건', card)).toContain('SOURCE_COPY');
  });
});

describe('프롬프트 · 생성', () => {
  it('프롬프트에 대표 검색어 · 고수 제목(베끼지 말 것) · 규칙이 들어간다', () => {
    const prompt = buildAdsenseTitlePrompt([card]);
    expect(prompt).toContain('국민연금추납');
    expect(prompt).toContain('119개월보다 먼저');
    expect(prompt).toMatch(/구글|다음/);
    expect(prompt).toMatch(/45자/);
  });

  // 사장님(2026-10-07) "검색용 추천 제목은 고수들이 쓴 제목보다 훨씬 상위호환이어야" — 같은 채점표로 가장 높은 고수 제목을 넘는 것만.
  it('가장 높은 고수 제목보다 점수가 높은 것만 · 점수 순 · 고수보다 나은 점을 붙인다 · 같은 제목은 한 번', async () => {
    const better = '국민연금 추납 60회 분할 시 비용·불이익과 신청 조건 비교';
    const weaker = '국민연금 추납 가능기간과 분할납부 조건 한 번에 정리';
    const titles = [weaker, better, better, '국민연금 추납 충격 대박 꿀팁 총정리 지금 바로 확인'];
    const run = async () => ({ provider: 'fake', reply: JSON.stringify([{ id: 'c1', titles }]) });
    const out = await titlesForAdsenseCards([card], run);
    const row = out.results[0];
    expect(row.titles).toEqual([better]);
    expect(row.edges[0]).toMatch(/고수/);
    expect(row.masterBest).toBe(masterBaseline(card).best);
    expect(row.rejected.find((r) => r.title === weaker)?.reasons).toContain('NOT_BETTER');
  });

  it('판에서 카드 고르기 — 실측 대표 검색어가 있는 카드만(없으면 제목을 안 짓는다)', () => {
    const board = { candidates: [
      { id: 'a', keyword: '국민연금 추납', category: '금융·재테크', metrics: { query: '국민연금추납' }, sources: [{ title: 't1' }] },
      { id: 'b', keyword: '누리호 발사', category: '종합·기타', metrics: { query: null }, sources: [{ title: 't2' }] },
    ] };
    expect(cardsFromAdsenseBoard(board).map((c) => c.id)).toEqual(['a']);
  });
});

describe('상위호환 채점', () => {
  it('제목이 다루는 내용(조건 · 금액 · 기간 · 방법 · 비교 · 서류 · 주의 · 변경 · 유형)을 센다', () => {
    expect(facetsOf('부가세 예정신고와 확정신고 차이, 대상·날짜 정리')).toEqual(expect.arrayContaining(['compare', 'condition', 'date']));
    expect(facetsOf('기초연금 선정기준액 넘으면 감액되나? 소득인정액 계산법')).toEqual(expect.arrayContaining(['caution', 'amount']));
    expect(facetsOf('오늘의 이야기')).toEqual([]);
  });
  it('확인된 숫자 · 더 많은 내용은 점수가 오르고, 같은 뜻 말 겹침 · 검색어 빠짐은 깎인다', () => {
    const base = scoreAdsenseTitle('국민연금 추납 신청 조건 정리', card).score;
    expect(scoreAdsenseTitle('국민연금 추납 60회 분할 비용과 신청 조건 비교', card).score).toBeGreaterThan(base);
    const job: AdsenseTitleCard = { id: 'j', query: '실업급여구직급여', keyword: '실업급여', category: '정부지원금·복지', sourceTitles: ['실업급여 얼마 받을까? 상·하한액 계산과 피보험단위기간 180일 총정리'] };
    expect(scoreAdsenseTitle('실업급여 구직급여 신청 절차 정리', job).score).toBeLessThan(scoreAdsenseTitle('실업급여 신청 절차와 조건 정리', job).score);
  });
  it('대표 검색어가 같은 뜻 말 두 개를 붙인 꼴이면(실업급여+구직급여) 한쪽만 있어도 검색어로 인정한다', () => {
    const job: AdsenseTitleCard = { id: 'j', query: '실업급여구직급여', keyword: '실업급여', category: '정부지원금·복지', sourceTitles: ['실업급여 얼마 받을까? 상·하한액 계산과 피보험단위기간 180일 총정리'] };
    expect(checkAdsenseTitle('실업급여 신청 조건과 피보험단위기간 180일 계산법', job)).not.toContain('NO_ANCHOR');
  });
  // 실주행(2026-10-07): "실업급여 반복수급 감액 기준과 2026 하한액 개편 내용" — 고수 누구도 개편을 말하지 않았다(지어낸 사실).
  it('개편 · 달라진 점 같은 변경 주장은 고수 제목에 변경 말이 있을 때만', () => {
    const job: AdsenseTitleCard = { id: 'j', query: '실업급여', keyword: '실업급여', category: '정부지원금·복지', sourceTitles: ['2026 실업급여 신청 조건 및 구직급여 수급 자격 총정리'] };
    expect(checkAdsenseTitle('실업급여 반복수급 감액 기준과 2026 하한액 개편 내용', job)).toContain('UNSUPPORTED_CHANGE');
    const pension: AdsenseTitleCard = { ...job, query: '기초연금', sourceTitles: ['기초연금 개편안 5가지 핵심 내용'] };
    expect(checkAdsenseTitle('기초연금 개편안 이후 달라지는 수급 조건과 감액 기준', pension)).not.toContain('UNSUPPORTED_CHANGE');
  });
  it('프롬프트에 고수 제목별 다룬 내용 · 아무도 안 다룬 빈틈 · 넘어야 할 기준을 넣는다', () => {
    const prompt = buildAdsenseTitlePrompt([card]);
    expect(prompt).toContain('아무도 안 다룬');
    expect(prompt).toMatch(/가장 높은 고수 제목/);
    expect(prompt).toMatch(/같은 뜻/);
  });
});
