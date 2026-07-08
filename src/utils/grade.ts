/**
 * 🏅 등급 SSoT (Single Source of Truth) — LEWORD 전 표면(발굴/헌터/마인드맵/보드) 공용
 *
 * [배경] 등급 정의가 4곳으로 파편화돼 회귀의 근본원인이었다:
 *   - mdp-engine.calculateGrade  : 점수+지표 풀 래더, SSS=classic만 (winnable 경로 없음)
 *   - golden-discovery-floor     : 지표만, classic OR winnable
 *   - live-golden-radar.normalizeGrade : 점수만 (85→SSS, 지표 무시 → 가짜 SSS 누수)
 *   - mindmap-metrics.calculateMindmapMetricGrade : 지표만 래더
 * 임계값 85/1000/5000/5 가 ~29파일에 하드코딩 → 하나 바꾸면 하나 빠뜨려 회귀.
 *
 * [정본 결정] SSS = classic(고볼륨 저경쟁) OR winnable(저볼륨 문서수≪검색량). floor·CLAUDE.md·
 *   isStrictGoldenDiscoverySss 가 이미 winnable을 SSS로 인정하는데 mdp만 lagging → 정본은 둘 다 인정.
 *   임계값은 CLAUDE.md 등급 시스템과 mdp 래더를 그대로 계승(SS/S/A/B/C/D 무변경).
 *
 * 이 파일이 유일한 임계값·판정 소스. 다른 모든 곳은 여기서 import (하드코딩 금지).
 */

export type Grade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

/** 등급 임계값 — 유일 정의. 캘리브레이션은 여기 한 곳만 수정. */
export const GRADE_THRESHOLDS = {
  /** classic SSS: 고볼륨 저경쟁 (검색량 1000+, 문서수 5000↓, 비율 5+, 점수 85+) */
  sssClassic: { volumeMin: 1000, docsMax: 5000, ratioMin: 5, scoreMin: 85 },
  /** winnable SSS: 저볼륨(100~1500)이라도 문서수 500↓·비율 3+ 인 진짜 저경쟁 (점수 80+) */
  sssWinnable: { volumeMin: 100, volumeMax: 1500, docsMax: 500, ratioMin: 3, scoreMin: 80 },
  ss: { volumeMin: 500, docsMax: 10000, ratioMin: 3, scoreMin: 75 },
  s: { volumeMin: 300, ratioMin: 2, scoreMin: 65 },
  a: { volumeMin: 100, scoreMin: 55 },
  b: { scoreMin: 45 },
  c: { scoreMin: 30 },
} as const;

const T = GRADE_THRESHOLDS;

/** classic SSS 지표: 고볼륨 저경쟁 (검색량 1000+, 문서수 5000↓, 비율 5+). 점수 불문(지표만). */
export function isClassicSss(volume: number, docs: number, ratio: number): boolean {
  return volume >= T.sssClassic.volumeMin && docs > 0 && docs <= T.sssClassic.docsMax && ratio >= T.sssClassic.ratioMin;
}

/**
 * winnable SSS 지표: 저볼륨(100~1500)이라도 '문서수 ≪ 검색량'(비율 ≥ 3)인 진짜 저경쟁만.
 * docs > volume(비율 1 미만)은 볼륨 무관 의미 없음 → 탈락. 절대 경쟁 상한 docs ≤ 500.
 */
export function isWinnableSss(volume: number, docs: number, ratio: number): boolean {
  return (
    volume >= T.sssWinnable.volumeMin &&
    volume <= T.sssWinnable.volumeMax &&
    docs > 0 &&
    docs <= T.sssWinnable.docsMax &&
    ratio >= T.sssWinnable.ratioMin
  );
}

/** SSS 지표 = classic OR winnable. (점수 불문 — 지표 게이트만) */
export function isGoldenSss(volume: number, docs: number, ratio: number): boolean {
  return isClassicSss(volume, docs, ratio) || isWinnableSss(volume, docs, ratio);
}

export interface GradeMetrics {
  score: number;
  volume: number;
  docs: number;
  ratio: number;
}

/**
 * 정본 등급 배정자 — 점수 + 지표. 발굴/헌터가 사용.
 * SSS = (점수 85+ AND classic) OR (점수 80+ AND winnable). 이하 SS/S/A/B/C/D 는 CLAUDE.md·mdp 래더 계승.
 */
export function classifyGrade(m: GradeMetrics): Grade {
  const score = Number(m.score) || 0;
  const volume = Number(m.volume) || 0;
  const docs = Number(m.docs) || 0;
  const ratio = Number.isFinite(m.ratio) ? m.ratio : 0;

  if (score >= T.sssClassic.scoreMin && isClassicSss(volume, docs, ratio)) return 'SSS';
  if (score >= T.sssWinnable.scoreMin && isWinnableSss(volume, docs, ratio)) return 'SSS';
  if (score >= T.ss.scoreMin && volume >= T.ss.volumeMin && docs <= T.ss.docsMax && ratio >= T.ss.ratioMin) return 'SS';
  if (score >= T.s.scoreMin && volume >= T.s.volumeMin && ratio >= T.s.ratioMin) return 'S';
  if (score >= T.a.scoreMin && volume >= T.a.volumeMin) return 'A';
  if (score >= T.b.scoreMin) return 'B';
  if (score >= T.c.scoreMin) return 'C';
  return 'D';
}

/**
 * 지표-only 등급 래더 (점수 신호가 없는 경로 — 마인드맵). SSS 는 classic OR winnable.
 * 나머지 SS/S/A/B 는 마인드맵 기존 래더(문서수 상한 완화형) 계승.
 */
export function classifyGradeByMetrics(volume: number, docs: number, ratio: number): Grade {
  if (volume <= 0 || docs <= 0 || !Number.isFinite(ratio) || ratio <= 0) return 'C';
  if (isGoldenSss(volume, docs, ratio)) return 'SSS';
  if (volume >= 500 && docs <= 10000 && ratio >= 3) return 'SS';
  if (volume >= 300 && docs <= 15000 && ratio >= 2) return 'S';
  if (volume >= 100 && docs <= 30000) return 'A';
  if (volume >= 30 && docs <= 80000) return 'B';
  return 'C';
}

/**
 * 이미 계산된 등급 문자열을 정규화하되, 지표 없이 점수만으로는 SSS/SS 로 승격하지 않는다.
 * (기존 radar.normalizeGrade 의 '점수 85→SSS' 누수 차단 — 지표 미확인 시 최대 S 로 캡)
 */
export function normalizeStoredGrade(value: unknown, score = 0): Grade {
  const g = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (g === 'SSS' || g === 'SS' || g === 'S' || g === 'A' || g === 'B' || g === 'C' || g === 'D') return g as Grade;
  // 지표 미확인 점수-only fallback: SSS/SS 승격 금지(가짜 SSS 방지), 최대 S.
  if (score >= T.s.scoreMin) return 'S';
  if (score >= T.a.scoreMin) return 'A';
  if (score >= T.b.scoreMin) return 'B';
  if (score >= T.c.scoreMin) return 'C';
  return 'D';
}
