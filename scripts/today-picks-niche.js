'use strict';
/**
 * 오늘의 추천키워드 — 니치 우선 순서(2026-11-15, 사장님 "대형키워드가 많네. 그럼 있으나 마나야. 니치키워드를 기본으로 잡아줘.").
 *
 * 문제: 후보를 검색량 큰 순으로 훑고, 황금(검색량 ÷ 문서수 ≥ 1)이 차면 멈추고, 황금 안에서는 입찰가 큰 순으로 세웠다.
 *   그래서 판(32주제 × 100)의 앞이 '메가커피'(검색량 125만 · 문서 106만) 같은 큰 말이었다.
 *
 * 기준은 새로 짓지 않고 저장소 정의를 그대로 쓴다.
 *   · 대형 헤드 = 월 검색량 1만 이상 — golden-discovery-floor.ts(goldenDiscoveryWinnabilityBonus 의 "대형 헤드" -22)와
 *     keyword-intent.ts(sortWeight 의 1만 이상 층)가 같은 선이다.
 *   · 경쟁 상한 = 문서수 1만 — grade.ts GRADE_THRESHOLDS.ss.docsMax(SS 등급 문서수 상한).
 *   · 황금 = 이 판의 minRatio(검색량 ÷ 문서수) — 판이 원래 쓰던 기준 그대로.
 *
 * 등급(추가 호출 없이 이미 잰 값만 쓴다):
 *   niche  니치        — 황금이면서 검색량 1만 미만 (문서수는 검색량 이하라 1만 미만이 따라온다)
 *   mid    고볼륨 저경쟁 — 황금이면서 검색량 1만 이상, 문서수 1만 이하 (등급표 classic SSS 쪽 — 큰 말이지만 경쟁이 적다)
 *   plain  일반        — 검색량 1만 미만인데 황금비 미달 (문서가 검색량보다 많은 작은 말)
 *   large  대형        — 검색량 1만 이상이면서 문서수 1만 초과 (황금비가 1 넘어도 대형이다)
 * 목록은 niche → mid → plain → large. 목표 개수에서 자르면 대형부터 빠진다. 같은 등급 안은 원래 순서(신규 → 재추천, 입찰가 등).
 */
const { selectRows, normalizeKeyword } = require('./today-picks-selection');

const NICHE_MAX_VOLUME = 10000;
const FRONT_MAX_DOCS = 10000;
const TIER_ORDER = Object.freeze(['niche', 'mid', 'plain', 'large']);
/** 기본 목록(니치 + 고볼륨 저경쟁)에 드는 등급 — 목표 개수를 채우는 것은 이 둘뿐이다. */
const FRONT_TIERS = Object.freeze(['niche', 'mid']);

function tierOf(row, minRatio = 1) {
  const volume = Number(row && row.searchVolume);
  const docs = Number(row && row.documentCount);
  if (!(volume > 0)) return 'plain';
  const ratio = Number.isFinite(Number(row.ratio)) && row.ratio !== null ? Number(row.ratio) : (docs > 0 ? volume / docs : 0);
  const golden = ratio >= minRatio;
  if (volume < NICHE_MAX_VOLUME) return golden ? 'niche' : 'plain';
  return golden && docs <= FRONT_MAX_DOCS ? 'mid' : 'large';
}

const bandOf = (seed) => (Number(seed && seed.searchVolume) < NICHE_MAX_VOLUME ? 0 : 1);
const byVolumeDesc = (a, b) => (Number(b.searchVolume) || 0) - (Number(a.searchVolume) || 0);

/**
 * 후보(아직 문서수를 모르는 말)의 순서 — 검색량 1만 미만을 먼저. 문서수는 재 보기 전엔 모르니 검색량이 앞서 아는 전부다.
 * 같은 묶음 안은 base 순서(기본: 검색량 큰 순) 그대로라 시즌 앞 씨앗 · 12일 오름세 순서(today-picks-rising.js)가 묶음 안에서 산다.
 */
function nicheBandFirst(base = byVolumeDesc) {
  return (a, b) => bandOf(a) - bandOf(b) || base(a, b);
}

/** 등급 순으로 고른다 — 등급마다 selectRows(황금 신규 → 재추천 → 일반 …)를 그대로 쓰고 이어 붙여 목표 개수에서 자른다. */
function selectNicheFirst(rows, history, keep, minRatio = 1, orderGolden, orderOthers) {
  const groups = new Map(TIER_ORDER.map((tier) => [tier, []]));
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeKeyword(row && row.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    groups.get(tierOf(row, minRatio)).push(row);
  }
  return TIER_ORDER.flatMap((tier) => {
    const list = groups.get(tier);
    return list.length ? selectRows(list, history, list.length, minRatio, orderGolden, orderOthers).map((row) => ({ ...row, tier })) : [];
  }).slice(0, keep);
}

/** 기본 목록(니치 + 고볼륨 저경쟁)에 드는 행 수 — 후보를 더 잴지 멈출지의 기준. */
const countFront = (rows, minRatio = 1) => (Array.isArray(rows) ? rows : []).filter((row) => FRONT_TIERS.includes(tierOf(row, minRatio))).length;

/** 주제 한 칸에 싣는 요약 — 모자라면 모자란 수를 그대로 적는다(채우려고 지어내지 않는다). */
function tierSummary(rows, keep, minRatio = 1) {
  const counts = { niche: 0, mid: 0, plain: 0, large: 0 };
  for (const row of Array.isArray(rows) ? rows : []) counts[tierOf(row, minRatio)] += 1;
  return { nicheCount: counts.niche, midCount: counts.mid, plainCount: counts.plain, largeCount: counts.large, nicheShortfall: Math.max(0, keep - counts.niche - counts.mid) };
}

/** 화면이 그대로 옮겨 적을 수 있는 설명 · 기준 숫자. */
function nichePolicy(minRatio = 1) {
  return {
    version: 1,
    order: [...TIER_ORDER],
    nicheMaxVolume: NICHE_MAX_VOLUME,
    frontMaxDocs: FRONT_MAX_DOCS,
    minRatio,
    note: `니치 = 황금비 ${minRatio}+ · 월 검색량 ${NICHE_MAX_VOLUME.toLocaleString('ko-KR')} 미만 / 고볼륨 저경쟁 = 월 검색량 ${NICHE_MAX_VOLUME.toLocaleString('ko-KR')}+ · 문서 ${FRONT_MAX_DOCS.toLocaleString('ko-KR')}↓ / 일반 = 작은 말인데 황금비 미달 / 대형 = 월 검색량 ${NICHE_MAX_VOLUME.toLocaleString('ko-KR')}+ · 문서 ${FRONT_MAX_DOCS.toLocaleString('ko-KR')} 초과`,
  };
}

module.exports = { NICHE_MAX_VOLUME, FRONT_MAX_DOCS, TIER_ORDER, FRONT_TIERS, tierOf, nicheBandFirst, selectNicheFirst, countFront, tierSummary, nichePolicy };
