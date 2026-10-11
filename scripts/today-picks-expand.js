/**
 * 오늘의 추천키워드 — 연관어 확장(2026-10-11 사장님 "설계해서 진행해봐").
 *
 * 어제 실린 말을 막은 첫 회차에 황금이 171개 · 32주제 중 12주제 0개였다. 창고 후보(주제당 검색량 상위)만으로는
 * 매일 새 황금이 모자라다. 그날 찾은 황금(없으면 큰 후보)을 씨앗으로 검색광고 연관어를 받아 새 황금을 캔다.
 * 연관어는 검색량이 함께 오므로 블로그 문서 수만 재면 된다(today-picks.js 가 잰다).
 *
 * 관련도: 씨앗 낱말(2자+)이 3자 이하면 통째로, 4자 이상이면 연속 3자 조각 하나가 겹치면 같은 갈래(김도영 → 김도영 홈런 ○ · 홈런왕 ×,
 *   인스타스토리 → 인스타그램스토리 ○ · 카드뉴스만들기 ×). 씨앗 그 자체는 뺀다.
 * 추정 검색량(svEstimated) · 10 미만 표시 말은 뺀다 — 황금비는 실측끼리만 나눈다.
 */
'use strict';

const flat = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 그 주제 황금을 검색량 큰 순으로 k개, 모자라면 큰 후보로 채운다. */
function expansionSeeds(golden, others, k) {
  const out = [];
  const seen = new Set();
  const take = (rows) => {
    for (const row of [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))) {
      if (out.length >= k) return;
      const key = flat(row && row.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row.keyword);
    }
  };
  take(golden);
  take(others);
  return out;
}

/** 연관어 → 재 볼 후보(검색량 큰 순). opts: minVolume · isOpen(어제 안 실림) · measured(이미 잰 말 키) · guard(길이 · 정답카드 · 종목명 걸러내기). */
function relatedCandidates(seed, suggestions, opts) {
  const words = String(seed || '').split(/\s+/).map(flat).filter((w) => w.length >= 2);
  const seedKey = flat(seed);
  // 연관어엔 띄어쓰기가 없다(인스타스토리 → 인스타그램스토리). 4자 이상 낱말은 연속 3자 조각 하나가 겹치면 같은 갈래, 3자 이하는 통째로.
  const pieces = words.flatMap((w) => (w.length <= 3 ? [w] : Array.from({ length: w.length - 2 }, (_, i) => w.slice(i, i + 3))));
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(suggestions) ? suggestions : []) {
    const keyword = String((s && s.keyword) || '').trim();
    const key = flat(keyword);
    const volume = s && s.totalSearchVolume;
    if (!key || key === seedKey || seen.has(key)) continue;
    if (!Number.isFinite(volume) || volume < opts.minVolume || s.svEstimated || s.pcSearchVolumeLt10 || s.mobileSearchVolumeLt10) continue;
    if (!pieces.some((w) => key.includes(w))) continue;
    if (!opts.guard(keyword) || !opts.isOpen(keyword) || opts.measured.has(key)) continue;
    seen.add(key);
    out.push({ keyword, searchVolume: volume, source: 'related', comp: s.competition || null });
  }
  return out.sort((a, b) => b.searchVolume - a.searchVolume);
}

module.exports = { expansionSeeds, relatedCandidates };
