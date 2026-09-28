/** Read pre-upgrade successful rows without rerunning the hunter or inventing lost article evidence. */
import { classifyIssuePublication } from '../utils/issue-recommendation-gate';
import { publicBoard } from './board-cache';

const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 300) : '';
const validTime = (value: unknown, nowMs: number) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && Date.parse(value) <= nowMs + 300000 && nowMs - Date.parse(value) <= 48 * 3600000;

export function legacyIssueBoard(raw: any, nowMs = Date.now()): any | null {
  if (!raw || !validTime(raw.ranAt, nowMs) || !Array.isArray(raw.rows)) return null;
  const rows: any[] = []; const observations: any[] = []; const seen = new Set<string>();
  for (const item of raw.rows.slice(0, 500)) {
    if (!item || !['niche', 'preemption'].includes(item.verdict) || !validTime(item.measuredAt, nowMs)) continue;
    const keyword = text(item.keyword); const issue = text(item.baseKeyword);
    const key = keyword.replace(/\s+/g, '').toLowerCase();
    if (!keyword || !issue || seen.has(key)) continue;
    const row: any = {
      keyword, issue, topic: issue, issueType: text(item.issueType), verdict: item.verdict,
      searchVolume: number(item.searchVolume), documentCount: number(item.documentCount),
      // The old UI cache lost estimated/measured provenance and SERP sample titles.
      // Keep reported values, but do not invent those missing verification fields.
      documentCountMeasured: false, hasLiveDemand: item.hasLiveDemand === true,
      demandStatus: text(item.demandStatus) || 'unknown', measuredAt: item.measuredAt,
      reasons: (Array.isArray(item.reasons) ? item.reasons : []).filter((v: unknown) => typeof v === 'string').slice(0, 12),
      evidence: [{ code: 'legacy-cache', text: '이전 앱 저장 결과입니다. 기사 근거와 검색결과 표본은 보관되지 않았습니다.' }],
    };
    if (number(item.seatFacing) !== null) row.evidence.push({ code: 'legacy-facing', text: `앱에 기록된 정면 글 ${item.seatFacing}건 · 검색결과 표본 미보관` });
    const decision = classifyIssuePublication(row);
    if (decision.status === 'reject') continue;
    seen.add(key);
    row.recommendationStatus = decision.status; row.exclusionReason = decision.reason;
    (decision.status === 'observe' ? observations : rows).push(row);
  }
  return publicBoard('issue-niche', { publishedAt: raw.ranAt, generator: 'leword-desktop-legacy',
    schedule: '이전 앱 저장본 · 기사 브리핑 미보관', rows, observations, issues: [] }, nowMs);
}

export function selectSavedIssueBoard(publicRaw: unknown, legacyRaw: unknown, nowMs = Date.now()): any | null {
  const published = publicBoard('issue-niche', publicRaw, nowMs);
  const legacy = legacyIssueBoard(legacyRaw, nowMs);
  if (!legacy) return published;
  if (!published || Date.parse(legacy.publishedAt) > Date.parse(published.publishedAt)) return legacy;
  return published;
}
