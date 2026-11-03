'use strict';
/**
 * 오늘의 네이버 추천키워드 — 행마다 연관 황금 · 초황금 표시(2026-10-20).
 * 사장님: "드롭다운 펼치면 연관 황금키워드도 같이 알려주시고, 초황금키워드면 초황금키워드라고 해주세요."
 *
 * 연관 황금은 이미 잰 말(이번 회차에 잰 황금 + 14일 재고 황금)에서 고른다 — 추가 API 호출이 없다.
 * 연관 판정은 연관어 확장(today-picks-expand)과 같은 규칙: 4자 이상 낱말은 연속 3자 조각, 3자 이하는 통째로 겹치면 같은 갈래.
 * 초황금은 앱 등급표 SSS(classic 또는 winnable, src/utils/grade.ts isGoldenSss) — 판정 함수는 today-picks.js 가 넘긴다.
 */
const flat = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

function piecesOf(keyword) {
  return String(keyword || '').split(/\s+/).map(flat).filter((w) => w.length >= 2)
    .flatMap((w) => (w.length <= 3 ? [w] : Array.from({ length: w.length - 2 }, (_, i) => w.slice(i, i + 3))));
}

function isRelatedKeyword(base, other) {
  const key = flat(other);
  if (!key || key === flat(base)) return false;
  return piecesOf(base).some((p) => key.includes(p));
}

const ultraOf = (r, isUltra) => isUltra(Number(r.searchVolume), Number(r.documentCount), Number(r.ratio));

/** 초황금 행에 ultra: true (아닌 행은 칸을 만들지 않는다). 새 배열 · 새 객체. */
function markUltra(rows, isUltra) {
  return (rows || []).map((r) => (ultraOf(r, isUltra) ? { ...r, ultra: true } : r));
}

/** 행마다 연관 황금(판에 실린 말 제외) — 초황금 먼저, 황금비 높은 순, limit 개. 없으면 칸을 만들지 않는다. */
function attachRelated(rows, pool, { minRatio, limit = 5, isUltra }) {
  const onBoard = new Set((rows || []).map((r) => flat(r.keyword)));
  const seen = new Set();
  const golden = (pool || []).filter((p) => {
    const key = flat(p.keyword);
    const ok = key && !onBoard.has(key) && !seen.has(key) && Number(p.documentCount) > 0 && Number(p.ratio) >= minRatio;
    if (ok) seen.add(key);
    return ok;
  }).map((p) => ({ keyword: p.keyword, searchVolume: p.searchVolume, documentCount: p.documentCount, ratio: p.ratio, ultra: ultraOf(p, isUltra) }));
  return (rows || []).map((r) => {
    const related = golden.filter((p) => isRelatedKeyword(r.keyword, p.keyword))
      .sort((a, b) => Number(b.ultra) - Number(a.ultra) || b.ratio - a.ratio)
      .slice(0, limit);
    return related.length ? { ...r, related } : r;
  });
}

module.exports = { isRelatedKeyword, attachRelated, markUltra };
