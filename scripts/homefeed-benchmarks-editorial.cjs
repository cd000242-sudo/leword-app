'use strict';
const { buildCandidates, plainText } = require('./homefeed-benchmarks-core.cjs');

function canonical(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    url.searchParams.delete('fromRss'); url.searchParams.delete('trackingCode'); url.hash = '';
    return url.href;
  } catch { return null; }
}

// Human-reviewed writing briefs can promote an observed source, never invent observations.
function applyReviewedEditorial(payload, posts, records, now) {
  const time = Date.parse(now);
  const candidates = (payload.candidates || []).map(candidate =>
    candidate.reviewedUntil && (payload.status === 'stale' || !(Date.parse(candidate.reviewedUntil) > time))
      ? { ...candidate, recommended: false, status: candidate.status === 'stale' ? 'stale' : 'verify', flags: [...new Set([...(candidate.flags || []), 'review-expired'])] }
      : candidate);
  if (payload.status === 'stale' || !Number.isFinite(time)) return { ...payload, candidates };
  const reviewed = [];
  for (const record of Array.isArray(records) ? records : []) {
    const checked = Date.parse(record.reviewedAt), expires = Date.parse(record.expiresAt);
    if (!(checked <= time && expires > time && expires - checked <= 72 * 3600000)) continue;
    const urls = new Set((record.matchUrls || []).map(canonical).filter(Boolean));
    const matched = posts.filter(post => urls.has(canonical(post.url)) &&
      payload.sources.some(source => source.id === post.sourceId && source.status === 'ok') &&
      Date.parse(post.publishedAt) <= time && time - Date.parse(post.publishedAt) < 72 * 3600000);
    const base = buildCandidates(matched, now)[0];
    if (!base || base.status === 'stale' || base.flags.includes('sponsored')) continue;
    const patch = {};
    // homeTitle 은 편집자가 손으로 고른 한 줄. 검색형(seoTitle)은 폐기 — 홈판 후킹형 20개(homeTitles)가 대신한다.
    for (const key of ['keyword','title','category','homeTitle','summary','summaryAttribution','writingDirection']) {
      if (typeof record.candidate?.[key] === 'string') patch[key] = plainText(record.candidate[key]).slice(0, 1000);
    }
    for (const key of ['mustInclude','mustAvoid','relatedKeywords','verificationNeeded','why']) {
      if (Array.isArray(record.candidate?.[key])) patch[key] = record.candidate[key].filter(item => typeof item === 'string').slice(0, 12).map(item => plainText(item).slice(0, 600));
    }
    const image = record.candidate?.imageGuide;
    if (canonical(image?.url) && typeof image.instruction === 'string') patch.imageGuide = {url:canonical(image.url),instruction:plainText(image.instruction).slice(0,1000)};
    const officialSources = (record.officialSources || []).filter(source => canonical(source.url)).slice(0,6).map(source => ({title:plainText(source.title).slice(0,150),url:canonical(source.url)}));
    reviewed.push({...base,...patch,status:'review-now',recommended:true,reviewedAt:record.reviewedAt,reviewedUntil:record.expiresAt,officialSources,flags:[...base.flags,'editor-reviewed']});
  }
  const matchedUrls = new Set(reviewed.flatMap(candidate => candidate.sources.map(source => canonical(source.url))));
  // 30장 상한 없음(2026-09-30) — 수집기가 최근 48시간 소재를 전부 싣는다. 여기서 다시 자르면 그 결정이 무효가 된다.
  return {...payload,candidates:[...reviewed,...candidates.filter(candidate => !candidate.sources?.some(source => matchedUrls.has(canonical(source.url))))]};
}
module.exports = { applyReviewedEditorial };
