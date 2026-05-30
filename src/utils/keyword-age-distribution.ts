/**
 * 키워드 연령대 분포 (Phase 2) — 네이버 데이터랩 검색어트렌드 ages 버킷
 *
 * ⚠️ 데이터 성격: "실측 절대치"가 아니라 **상대 추정(relative estimate)**.
 *   데이터랩 API는 연령 필터를 지원하지만 절대 검색량이 아닌 0~100 상대 ratio만 준다.
 *   (검증: developers.naver.com 공식 — 절대값은 NCP Data Box 유료만)
 *   → UI/내부 모두 "상대 추정"으로 라벨하고, 등급(SSS) 게이트에 절대 반영하지 않는다.
 *   (메모리 규칙: feedback_no_estimates_in_ui / feedback_estimated_fallback_guard)
 *
 * 방법 (리서치 확정):
 *   - ages 배열은 합산 필터라 분리 안 됨 → 버킷별로 따로 호출 필수.
 *   - 각 버킷 응답 data[]의 ratio 합(sum)을 버킷 강도로 잡고, 4버킷 합을 100%로 정규화.
 *   - ages 코드: 1=0~12, 2=13~18, 3=19~24, 4=25~29, 5=30~34, 6=35~39,
 *                7=40~44, 8=45~49, 9=50~54, 10=55~59, 11=60+
 */

import type { NaverDatalabConfig } from './naver-datalab-api';

export type AgeBucketKey = 'teen' | 'youngAdult' | 'middle' | 'senior';

// 4버킷 ← 데이터랩 11구간 매핑
const AGE_BUCKETS: Array<{ key: AgeBucketKey; label: string; ages: string[] }> = [
  { key: 'teen', label: '10대', ages: ['1', '2'] },           // 0~18
  { key: 'youngAdult', label: '20~30대', ages: ['3', '4', '5', '6'] }, // 19~39
  { key: 'middle', label: '40~50대', ages: ['7', '8', '9', '10'] },    // 40~59
  { key: 'senior', label: '60대+', ages: ['11'] },            // 60+
];

export interface KeywordAgeDistribution {
  keyword: string;
  estimated: true;                       // 항상 상대 추정 — 절대 검색량 아님
  share: Record<AgeBucketKey, number>;   // 0~100 (%), 합 ≈ 100
  top: AgeBucketKey;
  topLabel: string;
  available: boolean;                    // 데이터 유효(합>0) 여부
  buckets: Array<{ key: AgeBucketKey; label: string; share: number }>;
}

const EMPTY = (keyword: string): KeywordAgeDistribution => ({
  keyword,
  estimated: true,
  share: { teen: 0, youngAdult: 0, middle: 0, senior: 0 },
  top: 'youngAdult',
  topLabel: '20~30대',
  available: false,
  buckets: AGE_BUCKETS.map(b => ({ key: b.key, label: b.label, share: 0 })),
});

/** 단일 키워드의 연령 버킷 강도(=기간 ratio 합) 1개를 데이터랩에서 가져온다. */
async function fetchBucketStrength(
  config: NaverDatalabConfig,
  keyword: string,
  ages: string[],
  startDate: string,
  endDate: string,
): Promise<number> {
  try {
    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: 'month',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
        ages,
      }),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const group = (data.results || [])[0];
    const points = group?.data || [];
    // ratio 합(sum) — 버킷 내부 분포 형태 차이의 영향을 줄임 (리서치 권고)
    return points.reduce((s: number, p: any) => s + (Number(p.ratio) || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * 키워드 1개의 연령 분포(상대 추정)를 조회한다. 버킷별 분리 호출(4콜) + 합 100% 정규화.
 */
export async function getKeywordAgeDistribution(
  config: NaverDatalabConfig,
  keyword: string,
): Promise<KeywordAgeDistribution> {
  const kw = String(keyword || '').trim();
  if (!kw || !config?.clientId || !config?.clientSecret) return EMPTY(kw);

  const startDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]; })();
  const endDate = new Date().toISOString().split('T')[0];

  const strengths: Record<AgeBucketKey, number> = { teen: 0, youngAdult: 0, middle: 0, senior: 0 };
  for (const b of AGE_BUCKETS) {
    strengths[b.key] = await fetchBucketStrength(config, kw, b.ages, startDate, endDate);
    await new Promise(r => setTimeout(r, 200)); // rate limit (429 방지)
  }

  const total = AGE_BUCKETS.reduce((s, b) => s + strengths[b.key], 0);
  if (total <= 0) return EMPTY(kw);

  const share: Record<AgeBucketKey, number> = { teen: 0, youngAdult: 0, middle: 0, senior: 0 };
  for (const b of AGE_BUCKETS) {
    share[b.key] = Math.round((strengths[b.key] / total) * 100);
  }

  const buckets = AGE_BUCKETS.map(b => ({ key: b.key, label: b.label, share: share[b.key] }));
  const topBucket = [...buckets].sort((a, b) => b.share - a.share)[0];

  return {
    keyword: kw,
    estimated: true,
    share,
    top: topBucket.key,
    topLabel: topBucket.label,
    available: true,
    buckets,
  };
}
