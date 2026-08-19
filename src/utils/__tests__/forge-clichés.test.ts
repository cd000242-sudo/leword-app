/**
 * 대장간 상투구 회귀 — 2026-08-19 실사고 재발 방지.
 * 규칙 폴백 문구("핵심 정리"·"핵심만 추렸습니다"·"총정리"·"한눈에")가 금지
 * 정규식에 걸리는 말이었는데, 검증기는 AI 제목만 지켜서 규칙 제목이 그대로
 * 화면까지 갔다. 대장간의 **모든** 프레임 문구는 금지 목록을 통과해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { SEO_SUFFIX, HOME_TEMPLATE, TITLE_CLICHES } from '../title-forge/forge';

describe('대장간 문구는 금지 상투구를 절대 내지 않는다', () => {
  it('SEO 접미 전 프레임', () => {
    for (const [frame, suffix] of Object.entries(SEO_SUFFIX)) {
      expect(TITLE_CLICHES.test(suffix), `${frame}: "${suffix}"`).toBe(false);
    }
  });

  it('홈판 템플릿 전 프레임 (실키워드 대입)', () => {
    for (const [frame, template] of Object.entries(HOME_TEMPLATE)) {
      const title = template('하희라 프로필', '나이');
      expect(TITLE_CLICHES.test(title), `${frame}: "${title}"`).toBe(false);
    }
  });

  it('금지 정규식 자체가 실사고 문구를 잡는다 (정규식 무력화 방지)', () => {
    expect(TITLE_CLICHES.test('하희라 프로필 나이 핵심 정리')).toBe(true);
    expect(TITLE_CLICHES.test('노각무침 황금레시피, 핵심만 추렸습니다')).toBe(true);
    expect(TITLE_CLICHES.test('여름휴가 시기 총정리')).toBe(true);
  });
});
