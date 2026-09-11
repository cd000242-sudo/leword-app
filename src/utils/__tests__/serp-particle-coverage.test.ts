import { describe, expect, it } from 'vitest';
import { titleCoverage, analyzeSerp, verdictFor, DEFAULT_SERP_THRESHOLDS } from '../serp-winnability';

/**
 * 정면 판정이 한국어 조사·문법 군더더기에 깨지는 것(2026-09-11).
 *
 * 사장님 "트렌드 CSV 들이기도 결과가 제대로 잘나와야되는데 안나오네" — 빈자리가 0이었다.
 *
 * 실측(이 PC 브라우저로 블로그탭을 직접 받아 잼):
 *   '김연아 임신설에 대한 공식입장'  표본 10 · 정면 0 · 부분 7 → 반열림
 *     상위 제목: "김연아 임신설 공식입장, 소속사 사실무근 발표와 확산 경위"
 *                "김연아·고우림 임신설, 결국 나온 공식 입장 총정리"
 *   정면으로 같은 얘기를 쓴 글이 일곱인데 **정면 0** 이라 적혔다.
 *
 * 왜: 어절 커버리지의 평균이 0.999 를 넘어야 정면인데
 *   김연아 1.00 · 임신설에 0.75(조사 '에'가 25% 깎음) · 대한 0.00 · 공식입장 1.00 → 평균 0.69
 * 조사 한 글자와 문법 군더더기 한 어절이 정면 글을 부분으로 떨어뜨렸다.
 *
 * 이 판정은 선점 보드 · 자리 실측기 · 오늘 쓸 한 편 · 트렌드 CSV · 실시간 틈새 · 내 크기가
 * **전부 같이 쓴다.** 여기가 틀리면 여섯 판이 같이 틀린다.
 *
 * 고치는 방향은 둘뿐이고 둘 다 '내용이 아닌 말'만 건드린다:
 *   ① 덩어리 매칭 뒤 남은 한 글자가 조사면 덮인 것으로 본다(줄기는 이미 제목에 있으니까)
 *   ② '대한'·'관련'·'위한' 같은 문법 군더더기 어절은 셈에서 뺀다 — 단, 내용 어절이 둘 이상 남을 때만
 */
describe('조사 한 글자가 정면 글을 떨어뜨리지 않는다', () => {
  it("'임신설에' 는 제목의 '임신설' 로 덮인 것으로 본다", () => {
    expect(titleCoverage('김연아 임신설 공식입장 소속사 사실무근', '임신설에')).toBe(1);
  });

  it("'1997년도' 는 제목의 '1997년' 으로 덮인다", () => {
    expect(titleCoverage('제니 하객룩 30년 전 1997년 베르사체', '1997년도')).toBe(1);
  });

  it('조사가 아닌 한 글자는 덮어 주지 않는다', () => {
    // '청소법' 의 '법' 은 조사가 아니다 — 제목에 '청소' 뿐이면 다 덮인 게 아니다.
    expect(titleCoverage('베란다 청소 요령', '청소법')).toBeLessThan(1);
  });

  it('줄기가 아예 없으면 여전히 0 이다', () => {
    expect(titleCoverage('오늘 날씨 맑음', '임신설에')).toBe(0);
  });
});

describe('문법 군더더기 어절은 셈에서 뺀다', () => {
  it("'대한' 이 정면 글을 부분으로 떨어뜨리지 않는다", () => {
    expect(titleCoverage('김연아 임신설 공식입장, 소속사 사실무근 발표', '김연아 임신설에 대한 공식입장')).toBe(1);
  });

  it("'관련'·'위한'·'통한' 도 같다", () => {
    expect(titleCoverage('전세자금대출 조건 총정리', '전세자금대출 관련 조건')).toBe(1);
    expect(titleCoverage('환절기 비염 예방 습도 관리', '환절기 비염 예방을 위한 습도')).toBe(1);
  });

  it('내용 어절이 둘 이상 남을 때만 뺀다 — 검색어를 한 어절로 줄이지 않는다', () => {
    // '대한 항공' 에서 '대한' 을 빼면 '항공' 하나만 남는다. 그러면 안 뺀다.
    expect(titleCoverage('아시아나 소식', '대한 항공')).toBeLessThan(0.6);
  });

  it('내용 어절은 없다고 덮어 주지 않는다', () => {
    // '화제의' 의 줄기 '화제' 는 진짜 낱말이다. 제목에 없으면 부분이 맞다.
    const c = titleCoverage('제니 하객룩 30년 전 1997년 베르사체', '제니 화제의 1997년도 하객룩');
    expect(c).toBeGreaterThanOrEqual(DEFAULT_SERP_THRESHOLDS.partialCoverage);
    expect(c).toBeLessThan(DEFAULT_SERP_THRESHOLDS.exactCoverage);
  });
});

describe('실측 화면이 제대로 판정된다', () => {
  // 실제 블로그탭이 쓰는 제목 클래스 — extractTitles 가 이 모양만 읽는다.
  const serp = (titles: string[]) => `<html>${titles
    .map((t) => `<span class="sds-comps-text sds-comps-text-type-headline1 sds-comps-text-weight-sm">${t}</span>`)
    .join('')}</html>`;

  it('정면 글 일곱이면 잠김이다 — 반열림이 아니다', () => {
    const html = serp([
      '김연아 임신설 공식입장, 소속사 사실무근 발표와 확산 경위',
      '김연아·고우림 임신설, 결국 나온 공식 입장 총정리',
      '김연아 임신설 왜 나왔나? 사진 한 장에 확산, 소속사 공식입장',
      '김연아 임신설 공식입장 정리',
      '김연아 임신설에 소속사 공식입장 발표',
      '오늘의 날씨와 교통 정보',
      '주말 나들이 추천 장소',
    ]);
    const a = analyzeSerp(html, '김연아 임신설에 대한 공식입장');
    expect(a.exactTitleHits, `정면 ${a.exactTitleHits}건 (부분 ${a.partialTitleHits})`).toBeGreaterThanOrEqual(3);
    expect(verdictFor(a).verdict).toBe('LOCKED');
  });

  it('상관없는 글만 있으면 여전히 열림이다', () => {
    const html = serp([
      '이강인 올여름 이적 임박? 그리즈만 대체자 아틀레티코 최우선 타깃',
      'NEWS :: 대한민국 영어공장 내신 수능 워크북',
      '월스트리트 퀀트의 시선 데이터로 해체한 글로벌 마켓',
    ]);
    const a = analyzeSerp(html, '시메오네 아틀레티코 결렬 가능성');
    expect(a.exactTitleHits).toBe(0);
    expect(verdictFor(a).verdict).toBe('WINNABLE');
  });
});
