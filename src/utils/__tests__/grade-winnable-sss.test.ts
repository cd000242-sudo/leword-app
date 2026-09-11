import { describe, expect, it } from 'vitest';
import { GRADE_THRESHOLDS, classifyGrade, classifyGradeByMetrics, isClassicSss, isGoldenSss, isWinnableSss } from '../grade';

/**
 * 저볼륨 winnable SSS 경로 복원(2026-09-11, 사장님 지시 "되살려").
 *
 * 2026-07-15 커밋 dcfd6ffd 가 이 경로를 껐다(isWinnableSss → 항상 false).
 * 그런데 CLAUDE.md 의 등급 시스템은 계속 이렇게 적혀 있었다:
 *   "SSS (저볼륨 winnable): 점수 80+ AND 검색량 100~1500 AND 문서수 500↓ AND 비율 3+
 *    — 지수 낮은 초보자가 실제로 1페이지 가능한 진짜 저경쟁(문서수 ≪ 검색량)"
 * 규격과 코드가 갈라진 채 두 달을 갔고, 그 사이 golden-floor-winnability-rank 테스트가
 * 계속 깨져 있었다(실측 2026-09-11: 저볼륨 둘이 통째로 탈락하고 검색량 35,000짜리 헤드만 남음).
 *
 * 초보자가 실제로 이기는 건 작은 말이다. 큰 말만 SSS 로 두면 이 도구의 목적과 어긋난다.
 * 임계값은 지어내지 않고 껐던 커밋에서 그대로 되살린다.
 */
describe('winnable 임계값이 규격 그대로 있다', () => {
  it('CLAUDE.md 에 적힌 숫자와 같다', () => {
    expect(GRADE_THRESHOLDS.sssWinnable).toEqual({ volumeMin: 100, volumeMax: 1500, docsMax: 500, ratioMin: 3, scoreMin: 80 });
  });
});

describe('저볼륨 저경쟁이 SSS 로 인정된다', () => {
  it('실측으로 탈락하던 둘이 통과한다', () => {
    expect(isWinnableSss(900, 120, 7.5), '주휴수당 신청방법').toBe(true);
    expect(isWinnableSss(700, 90, 7.78), '치아보험 면책기간 조회').toBe(true);
  });

  it('지표 게이트는 classic 이거나 winnable 이다', () => {
    expect(isGoldenSss(900, 120, 7.5)).toBe(true);      // winnable
    expect(isGoldenSss(4000, 400, 10)).toBe(true);      // classic
  });

  it('점수 80 이면 SSS 다 — classic 은 85 를 요구하지만 winnable 은 80 이다', () => {
    expect(classifyGrade({ score: 80, volume: 900, docs: 120, ratio: 7.5 })).toBe('SSS');
    expect(classifyGrade({ score: 79, volume: 900, docs: 120, ratio: 7.5 })).not.toBe('SSS');
  });

  it('점수 없는 길(마인드맵)에서도 산다', () => {
    expect(classifyGradeByMetrics(900, 120, 7.5)).toBe('SSS');
  });
});

describe('되살렸다고 아무거나 SSS 가 되지는 않는다', () => {
  it('문서수가 검색량보다 많으면(비율 3 미만) 탈락', () => {
    expect(isWinnableSss(900, 400, 2.25)).toBe(false);
  });

  it('경쟁 글이 500 을 넘으면 탈락 — 저볼륨인데 경쟁이 크면 초보자가 못 이긴다', () => {
    expect(isWinnableSss(1400, 600, 2.33)).toBe(false);
    expect(isWinnableSss(1400, 501, 3)).toBe(false);
  });

  it('검색량 100 미만·1500 초과는 이 길이 아니다', () => {
    expect(isWinnableSss(90, 10, 9)).toBe(false);
    expect(isWinnableSss(1600, 100, 16)).toBe(false);
  });

  it('문서수 0 은 안 센다 — 안 잰 것을 저경쟁으로 바꾸지 않는다', () => {
    expect(isWinnableSss(900, 0, 999)).toBe(false);
  });

  it('classic 은 그대로다', () => {
    expect(isClassicSss(1000, 5000, 5)).toBe(true);
    expect(isClassicSss(999, 5000, 5)).toBe(false);
  });
});
