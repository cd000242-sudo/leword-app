/**
 * 황금키워드 발굴 — 사이트 판을 깔고, 앱이 더 찾은 말은 사이트와 같은 관문으로 거른다 (2026-09-15).
 *
 * 사장님 "앱에 있는 황금키워드 발굴도 4개밖에 안 나와 사이트랑 많이 다른데 상위호환으로 발굴해줘야지".
 * 결정(같은 날): 사이트 판 전부 + 같은 관문 통과분 · 사이트 발굴 코드를 앱에서 직접 · 고른 주제는 바로, 전체 주제는 새벽.
 *
 * 조사(9-15): 앱 발굴은 기본 개수 10이 빠른 미리보기로 돌아 4개 안팎이었고, 발굴 화면은 사이트 판을 읽지 않았다.
 * 같은 날 사이트 판은 61행이었다.
 *
 * 여기에는 순수 규칙만 둔다 — 네트워크와 파일은 부르는 쪽이 넣는다.
 *   관문  사이트 후보 선별(scripts/preemption-candidates.js)과 게이트(preemption-gate)의 숫자·차단 규칙 그대로
 *   주제  사이트 행의 블로그 주제(32종)와 발굴 카테고리를 같은 id 표(category-discovery-map)로 푼다
 *   행    사이트 행을 발굴 표가 그리는 모양으로 옮긴다 — 사이트가 잰 값만 옮기고 새 값은 만들지 않는다
 */
import { resolveDiscoveryCategoryIds } from './category-discovery-map';
import { DEFAULT_PREEMPTION_THRESHOLDS } from './preemption-gate';
import { judgeAnswerCardKeyword, judgeEphemeralKeyword } from './preemption-supply-guards';

/** 사이트 후보 선별의 경쟁 글 상한 — preemption-candidates.js 의 maxDocumentCount 기본값과 같아야 한다(파리티 테스트). */
export const SITE_MAX_DOCUMENT_COUNT = 50000;

export const SITE_GATE = Object.freeze({
  minSearchVolume: DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume,
  maxDocumentCount: SITE_MAX_DOCUMENT_COUNT,
  minVolumeToDocumentRatio: DEFAULT_PREEMPTION_THRESHOLDS.minVolumeToDocumentRatio,
});

export type SiteGateCode =
  | 'pass'
  | 'empty'
  | 'answer-card'
  | 'ephemeral'
  | 'no-volume'
  | 'low-volume'
  | 'no-documents'
  | 'too-many-documents'
  | 'low-ratio';

const KO = (value: number): string => value.toLocaleString('ko-KR');
const pct = (ratio: number): number => Math.round(ratio * 1000) / 10;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const compactKey = (value: unknown): string => String(value || '').replace(/\s+/g, '').toLowerCase();

/** 뺀 이유를 사람이 읽는 말로 — 발굴 진행 줄에 그대로 적는다. 순서가 곧 표시 순서다. */
export const SITE_GATE_LABEL: Readonly<Record<Exclude<SiteGateCode, 'pass'>, string>> = Object.freeze({
  empty: '검색어 없음',
  'answer-card': '카드 답 검색어',
  ephemeral: '금방 죽는 검색어',
  'no-volume': '검색량 못 잼',
  'low-volume': `검색량 ${KO(SITE_GATE.minSearchVolume)} 미만`,
  'no-documents': '경쟁 글 수 못 잼',
  'too-many-documents': `경쟁 글 ${KO(SITE_GATE.maxDocumentCount)}개 초과`,
  'low-ratio': `검색량이 경쟁 글의 ${pct(SITE_GATE.minVolumeToDocumentRatio)}% 미만`,
});

export interface SiteGateInput {
  keyword?: string | null;
  searchVolume?: number | null;
  pcSearchVolume?: number | null;
  mobileSearchVolume?: number | null;
  documentCount?: number | null;
}

export interface SiteGateVerdict {
  ok: boolean;
  code: SiteGateCode;
  reason: string;
}

const fail = (code: Exclude<SiteGateCode, 'pass'>, reason: string): SiteGateVerdict => ({ ok: false, code, reason });

/**
 * 발굴 행의 검색량. PC·모바일이 따로 오면 합, 없으면 searchVolume, 둘 다 없으면 null(못 잰 것).
 * 한쪽이 10 미만이면 발굴 엔진이 0 으로 싣는다 — 합은 하한이 되므로 하한이 관문을 넘으면 넘은 것이 맞다.
 */
export function measuredVolume(row: SiteGateInput): number | null {
  const pc = finite(row.pcSearchVolume) ? row.pcSearchVolume : null;
  const mobile = finite(row.mobileSearchVolume) ? row.mobileSearchVolume : null;
  if (pc !== null || mobile !== null) return (pc || 0) + (mobile || 0);
  return finite(row.searchVolume) ? row.searchVolume : null;
}

/** 사이트와 같은 관문. 자리(정면 글)는 여기서 보지 않는다 — 발굴 표의 자리 실측이 따로 잰다. */
export function judgeSiteGate(row: SiteGateInput): SiteGateVerdict {
  const keyword = String((row && row.keyword) || '').trim();
  if (!keyword) return fail('empty', '검색어가 비었다');
  const card = judgeAnswerCardKeyword(keyword);
  if (card.answerCard) return fail('answer-card', card.reason);
  const ephemeral = judgeEphemeralKeyword(keyword);
  if (ephemeral.ephemeral) return fail('ephemeral', ephemeral.reason);
  const volume = measuredVolume(row);
  if (volume === null) return fail('no-volume', '검색량을 못 쟀다');
  if (volume < SITE_GATE.minSearchVolume) {
    return fail('low-volume', `검색량 ${KO(volume)} — ${KO(SITE_GATE.minSearchVolume)} 미만`);
  }
  const documents = finite(row.documentCount) ? row.documentCount : null;
  if (documents === null || documents <= 0) return fail('no-documents', '경쟁 글 수를 못 쟀다');
  if (documents > SITE_GATE.maxDocumentCount) {
    return fail('too-many-documents', `경쟁 글 ${KO(documents)} — ${KO(SITE_GATE.maxDocumentCount)} 초과`);
  }
  const ratio = volume / documents;
  if (ratio < SITE_GATE.minVolumeToDocumentRatio) {
    return fail('low-ratio', `검색량이 경쟁 글의 ${pct(ratio)}% — ${pct(SITE_GATE.minVolumeToDocumentRatio)}% 미만`);
  }
  return { ok: true, code: 'pass', reason: '' };
}

/** 관문에서 뺀 수를 한 줄로. 뺀 것이 없으면 빈 문자열. */
export function describeSiteGateDrops(counts: Readonly<Record<string, number>>): string {
  return (Object.keys(SITE_GATE_LABEL) as Array<keyof typeof SITE_GATE_LABEL>)
    .filter((code) => (counts[code] || 0) > 0)
    .map((code) => `${SITE_GATE_LABEL[code]} ${KO(counts[code])}`)
    .join(' · ');
}

/**
 * 블로그 주제(32종) 행이 고른 발굴 카테고리에 드는가. 카테고리를 안 골랐으면 전부 든다.
 * 둘을 같은 id 표로 풀어 겹치는 id 가 있으면 든다 — 대응표를 따로 지어내지 않는다.
 */
export function siteTopicInCategory(topic: string | null | undefined, category: string | null | undefined): boolean {
  const wanted = resolveDiscoveryCategoryIds(category);
  if (wanted.length === 0) return true;
  const topicIds = resolveDiscoveryCategoryIds(topic);
  if (topicIds.length === 0) return false;
  const wantedSet = new Set(wanted);
  return topicIds.some((id) => wantedSet.has(id));
}

/** 선점 보드 화면에서 이 PC로 다시 잰 자리(userData/preemption-board/reseats.json 한 줄). */
export interface SiteReseat {
  keyword?: string;
  verdict: string;
  facing: number | null;
  vacancy: number | null;
  reason?: string;
  measuredAt: string;
}

/** 발굴 표가 그리는 사이트 행. 발굴 엔진 행과 같은 칸 이름을 쓰고, 사이트가 잰 값은 site* 칸에 따로 둔다. */
export interface SiteGoldenRow {
  keyword: string;
  source: 'site-board';
  topic: string;
  searchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number | null;
  grade: '';
  siteTier: string;
  siteTierLabel: string;
  siteTiming: string | null;
  siteMeasuredAt: string | null;
  siteOpenSlot: number | null;
  siteFacing: number | null;
  siteAiBriefing: boolean;
  siteAdCount: number | null;
  reseat: SiteReseat | null;
  adsenseFit: boolean | null;
  adsenseReason: string;
  intent: string;
  goldenReason: string;
  platformLane: 'content';
}

/** 사이트 행 하나를 발굴 표 모양으로. 검색어가 비면 null. 못 잰 칸은 null 로 둔다(0 으로 채우지 않는다). */
export function siteRowToGoldenRow(row: any, reseat: SiteReseat | null = null): SiteGoldenRow | null {
  const keyword = String((row && row.keyword) || '').trim();
  if (!keyword) return null;
  const volume = finite(row.searchVolume) ? row.searchVolume : null;
  const documents = finite(row.documentCount) ? row.documentCount : null;
  const ratio = volume !== null && documents !== null && documents > 0
    ? Math.round((volume / documents) * 100) / 100
    : null;
  const serp = row.serp && typeof row.serp === 'object' ? row.serp : {};
  const tierLabel = String(row.tierLabel || row.tier || '');
  const timing = row.timingGroup ? String(row.timingGroup) : null;
  return {
    keyword,
    source: 'site-board',
    topic: String(row.topic || ''),
    searchVolume: volume,
    documentCount: documents,
    goldenRatio: ratio,
    grade: '',
    siteTier: String(row.tier || ''),
    siteTierLabel: tierLabel,
    siteTiming: timing,
    siteMeasuredAt: row.measuredAt ? String(row.measuredAt) : null,
    siteOpenSlot: finite(row.openSlot) ? row.openSlot : null,
    siteFacing: finite(serp.exactTitleHits) ? serp.exactTitleHits : null,
    siteAiBriefing: serp.hasAiBriefing === true,
    siteAdCount: finite(serp.adCount) ? serp.adCount : null,
    reseat,
    adsenseFit: typeof row.adsenseFit === 'boolean' ? row.adsenseFit : null,
    adsenseReason: String(row.adsenseReason || ''),
    intent: String(row.intentLabel || ''),
    goldenReason: ['사이트 판', tierLabel, timing].filter(Boolean).join(' · '),
    platformLane: 'content',
  };
}

export interface SiteBoardLike {
  publishedAt?: string | null;
  rows?: any[] | null;
}

/** 사이트 판에서 고른 카테고리의 행만, 판 순서 그대로, 같은 말은 한 번. 다시 잰 자리가 있으면 붙인다. */
export function buildSiteGoldenRows(
  board: SiteBoardLike | null,
  category: string | null | undefined,
  reseats: Readonly<Record<string, SiteReseat>> = {},
): SiteGoldenRow[] {
  const rows = board && Array.isArray(board.rows) ? board.rows : [];
  const out: SiteGoldenRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!siteTopicInCategory(row && row.topic, category)) continue;
    const key = compactKey(row && row.keyword);
    if (!key || seen.has(key)) continue;
    // 다시 잰 자리의 키는 선점 보드 핸들러와 같게 공백만 뺀다.
    const reseat = reseats[String(row.keyword).replace(/\s+/g, '')] || null;
    const converted = siteRowToGoldenRow(row, reseat);
    if (!converted) continue;
    seen.add(key);
    out.push(converted);
  }
  return out;
}
