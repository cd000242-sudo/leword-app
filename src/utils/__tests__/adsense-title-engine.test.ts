/**
 * 애드센스 고수 벤치마크 3단계 — 소재 1개당 구글 · 다음 검색용 제목 20개(2026-10-07).
 * 홈판 제목(후킹 · 구어)과 다르다: 대표 검색어를 앞에, 22~45자(고수 제목 가운데 36자), 숫자는 재료에 있는 것만.
 */
import { describe, expect, it } from 'vitest';
import { checkAdsenseTitle, buildAdsenseTitlePrompt, titlesForAdsenseCards, cardsFromAdsenseBoard, type AdsenseTitleCard } from '../adsense-title-engine';

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

  it('에이전트 답을 검사해 통과한 것만 · 같은 제목은 한 번 · 최대 20개', async () => {
    const titles = ['국민연금 추납 신청 전에 60회 분할 비용부터 따져 볼 것', '국민연금 추납 신청 전에 60회 분할 비용부터 따져 볼 것', '국민연금 추납 충격 대박 꿀팁 총정리 지금 바로 확인', '국민연금 추납 가능기간과 분할납부 조건 한 번에 정리'];
    const run = async () => ({ provider: 'fake', reply: JSON.stringify([{ id: 'c1', titles }]) });
    const out = await titlesForAdsenseCards([card], run);
    expect(out.results[0].titles).toEqual(['국민연금 추납 신청 전에 60회 분할 비용부터 따져 볼 것', '국민연금 추납 가능기간과 분할납부 조건 한 번에 정리']);
    expect(out.results[0].rejected.length).toBeGreaterThan(0);
  });

  it('판에서 카드 고르기 — 실측 대표 검색어가 있는 카드만(없으면 제목을 안 짓는다)', () => {
    const board = { candidates: [
      { id: 'a', keyword: '국민연금 추납', category: '금융·재테크', metrics: { query: '국민연금추납' }, sources: [{ title: 't1' }] },
      { id: 'b', keyword: '누리호 발사', category: '종합·기타', metrics: { query: null }, sources: [{ title: 't2' }] },
    ] };
    expect(cardsFromAdsenseBoard(board).map((c) => c.id)).toEqual(['a']);
  });
});
