/**
 * 황금지수 — "지금 바로 써도 되는가"를 한 눈에.
 *
 * 왜 새 점수를 안 만드나:
 *   이 앱에는 이미 등급 SSoT(`grade.ts`)가 있다. 화면마다 제 나름의 지수를 만들면
 *   같은 키워드가 발굴 화면에선 SSS, 분석 화면에선 '보통'으로 나온다 — 예전에
 *   등급 정의가 네 곳으로 갈라져 회귀의 근본 원인이 됐던 그 사고다.
 *   그래서 여기서는 **분류하지 않고 옮기기만** 한다.
 *
 * 지수의 정체:
 *   검색량 ÷ 문서수. 재서 나눈 값이고 만든 값이 아니다. 확률·예상 유입이 아니다.
 *   "글 하나가 상대할 경쟁 문서가 몇 분의 일인가"를 그대로 보여 준다.
 */
import { classifyGradeByMetrics, type Grade } from './grade';

export type GoldenTier = 'ultra' | 'golden' | 'fair' | 'weak';

export interface GoldenIndex {
  tier: GoldenTier;
  /** 화면에 쓸 이름. */
  label: string;
  /** 검색량 ÷ 문서수. 못 재면 null. */
  ratio: number | null;
  /** 어느 등급에서 왔는지. 다른 화면과 대조할 때 쓴다. */
  grade: Grade;
  /** 왜 이 단계인지 — 실측 숫자를 그대로 담는다. */
  reason: string;
}

const TIER_LABEL: Record<GoldenTier, string> = {
  ultra: '초황금',
  golden: '황금',
  fair: '적당',
  weak: '약함',
};

/** 등급 SSoT 의 래더를 사장님 4단계로 접는다. 임계값을 여기서 새로 정하지 않는다. */
const TIER_BY_GRADE: Record<Grade, GoldenTier> = {
  SSS: 'ultra',
  SS: 'golden',
  S: 'fair',
  A: 'weak',
  B: 'weak',
  C: 'weak',
  D: 'weak',
};

const num = (value: number) => value.toLocaleString('ko-KR');

/**
 * 실측 검색량·문서수로 황금지수를 낸다.
 *
 * 둘 중 하나라도 못 쟀으면 판정하지 않는다(null) — 모르는 것을 '약함'으로
 * 적으면 못 잰 것과 나쁜 것이 화면에서 같아진다.
 */
export function goldenIndex(
  searchVolume: number | null | undefined,
  documentCount: number | null | undefined,
): GoldenIndex | null {
  if (typeof searchVolume !== 'number' || !Number.isFinite(searchVolume)) return null;
  if (typeof documentCount !== 'number' || !Number.isFinite(documentCount)) return null;
  if (documentCount <= 0) return null;

  const ratio = searchVolume / documentCount;
  const grade = classifyGradeByMetrics(searchVolume, documentCount, ratio);
  const tier = TIER_BY_GRADE[grade];

  return {
    tier,
    label: TIER_LABEL[tier],
    ratio,
    grade,
    reason: `월 검색 ${num(searchVolume)}회에 문서 ${num(documentCount)}개 — 한 편이 ${ratio.toFixed(1)}대 1로 붙는다`,
  };
}
