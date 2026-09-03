/**
 * 실검 틈새 보드 — 행을 황금키워드 카드 모양으로 빚는다.
 *
 * 사장님 지시(2026-09-03): "황금키워드랑 똑같이 버튼·연관키워드·그래프 전부
 * 잘 나와야 되는 거 아닌가." 그래서 보강은 황금 보드의 enrich-board.js 를 그대로
 * 돌린다(지식인·연관 실측 풀·서브키워드·AI 제목·30일 추세·수익 판정). 이 파일은
 * 그 앞뒤를 맡는다:
 *   앞 — selectIssueRowsForEnrich: 실을 행(틈새·선점 후보)만 골라 보강기가 읽는
 *        필드(topic·adsenseFit·의도·이슈 헤드라인)를 붙인다.
 *   뒤 — 보강기가 붙인 값의 모양을 검사해 공개 행에 싣는다(지어낸 값은 못 나간다).
 *
 * 화면에 나가는 것은 실측 사실·검증된 추론뿐이다. 점수는 없다.
 */

import type { IssueNicheIssue, IssueNicheKeyword } from './issue-niche-hunter';
import type { RecencyStatus } from './naver-datalab-api';
import { classifySearchIntent } from './keyword-intent';
import { judgePlatformLane } from './platform-lane';

/* ─────────────── 보강기가 붙이는 값(enrich-board.js) ─────────────── */

export interface BoardTitle { text: string; frame?: string; basis?: string }
export interface BoardTitles { seo?: BoardTitle; home?: BoardTitle }
export interface BoardSubKeyword { keyword: string; searchVolume: number | null; frame?: string }
export interface BoardPoolKeyword { keyword: string; searchVolume: number; documentCount?: number | null; source?: string }
export interface BoardTrend {
  series: number[];
  label?: string;
  recommendation?: string;
  /** 이월 행 재측정이 추세를 다시 잰 시각(ISO). 없으면 행의 measuredAt 이 그 시각이다. */
  measuredAt?: string;
}
export interface BoardKinQuestion { title: string; link: string; views?: number | null; answers?: number | null }
export interface BoardMonetize { verdict: 'good' | 'bad' | 'mixed'; points: Array<{ text: string }>; angle?: string }
export interface BoardWhy { text: string; basis?: string }

/** 보강기가 행에 덧붙이는 필드 — 전부 선택이다(보강이 안 돈 회차도 발행된다). */
export interface EnrichedFields {
  topic?: string;
  intentLabel?: string;
  adsenseFit?: boolean | null;
  adsenseReason?: string;
  /** 보강 AI 프롬프트에 실을 뉴스 헤드라인(실측). */
  issueHeadlines?: string[];
  titles?: BoardTitles | null;
  subKeywords?: BoardSubKeyword[] | null;
  keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null; source?: string }> | null;
  trend?: BoardTrend | null;
  kinCount?: number | null;
  kinTop?: BoardKinQuestion[] | null;
  monetize?: BoardMonetize | null;
  whySearch?: BoardWhy | null;
}

export type IssueLedgerRow = IssueNicheKeyword & EnrichedFields;

/** 이슈에 머리 행의 추세를 붙인 것 — 보강본(picks)만으로 브리핑이 서야 한다. */
export type IssueLedgerIssue = IssueNicheIssue & { issueStatus?: RecencyStatus; isHot?: boolean };

export interface IssueLedgerLike {
  generator?: string;
  generatedAt?: string;
  rows?: IssueLedgerRow[];
  issues?: IssueNicheIssue[] | IssueLedgerIssue[];
  funnel?: { issues?: number; candidates?: number };
  [key: string]: unknown;
}

export interface EnrichReadyLedger extends IssueLedgerLike {
  rows: IssueLedgerRow[];
  issues: IssueLedgerIssue[];
}

export function compactKey(keyword: unknown): string {
  return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 싣는 행 = 틈새·선점 후보. 대기(isPending: 트래픽·수요 통과, 자리 미실측)는 싣지 않는다 —
 * 자리를 안 잰 것을 "자리 있다"고 보여 주면 황금보다 세다는 틈새의 뜻이 사라진다.
 */
export function isPublishable(row: IssueNicheKeyword): boolean {
  return row.isNiche === true || row.isPreemption === true;
}

/**
 * 보강에 넘길 행만 고른다. 황금 보강기는 keyword 만 있어도 돌지만, 수익 판정은
 * adsenseFit === true 인 행에서만 돌고 AI 제안은 헤드라인이 있어야 근거가 선다.
 * 그래서 여기서 붙여 준다 — 실측 없이 판정하지 않는다(재료 부족이면 null).
 */
export function selectIssueRowsForEnrich(ledger: IssueLedgerLike): EnrichReadyLedger {
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  const issues = Array.isArray(ledger.issues) ? ledger.issues : [];
  const issueByName = new Map(issues.map((i) => [compactKey(i.issue), i]));

  const seen = new Set<string>();
  const picks: IssueLedgerRow[] = [];
  for (const row of rows) {
    if (!isPublishable(row)) continue;
    const key = compactKey(row.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const issue = issueByName.get(compactKey(row.baseKeyword));
    const intent = classifySearchIntent(row.keyword);
    const lane = judgePlatformLane({ keyword: row.keyword, intentLabel: intent.intentLabel, cpc: row.cpc ?? null });
    picks.push({
      ...row,
      topic: row.baseKeyword,
      intentLabel: intent.intentLabel,
      adsenseFit: lane.adsenseFit,
      adsenseReason: lane.adsenseReason,
      issueHeadlines: (issue?.headlines ?? []).map((h) => h.title).filter(Boolean),
    });
  }

  const statusByIssue = new Map<string, { status: RecencyStatus; isHot: boolean }>();
  for (const row of rows) {
    const key = compactKey(row.baseKeyword);
    const isHead = compactKey(row.keyword) === key;
    if (isHead || !statusByIssue.has(key)) {
      statusByIssue.set(key, { status: row.recencyStatus || 'unknown', isHot: row.isHot === true });
    }
  }
  const shapedIssues: IssueLedgerIssue[] = issues.map((issue) => {
    const head = statusByIssue.get(compactKey(issue.issue));
    return { ...issue, issueStatus: head?.status ?? 'unknown', isHot: head?.isHot ?? false };
  });

  return { ...ledger, rows: picks, issues: shapedIssues };
}

/* ─────────────── 공개 행 근거(evidence) ─────────────── */

export interface BoardEvidence { code: string; text: string }

const ORIGIN_EVIDENCE: Record<string, string | null> = {
  'next-wave': null, // 이유가 행마다 다르다 — 아래에서 만든다
  autocomplete: '네이버 자동완성 실측 — 사람들이 이미 치는 말',
  related: '검색광고 연관검색어 실측 — 같이 검색되는 말',
  derived: null,
  head: null,
};

/**
 * 근거는 실측 사실에서만 만든다. 순서 = 이 키워드가 왜 여기 있는지(출처) →
 * 트래픽 → 수요 → 자리(블로그탭 실측) → 빈자리 → 이슈 추세. 문구는 화면 근거 줄에 그대로 나간다.
 */
export function buildIssueEvidence(row: IssueNicheKeyword): BoardEvidence[] {
  const out: BoardEvidence[] = [];
  if (row.origin === 'next-wave' && row.originReason) {
    out.push({ code: 'next-wave', text: `다음 물결 — ${row.originReason}` });
  } else if (row.origin && ORIGIN_EVIDENCE[row.origin]) {
    out.push({ code: row.origin, text: ORIGIN_EVIDENCE[row.origin] as string });
  }
  if (row.trafficGate === true && typeof row.searchVolume === 'number') {
    out.push({ code: 'traffic', text: `검색광고 월 검색량 ${row.searchVolume.toLocaleString()} 실측 — 트래픽 하한 통과` });
  }
  if (row.hasLiveDemand === true) {
    const ratio = typeof row.demandRatio === 'number' ? ` — 7일/30일 ${row.demandRatio.toFixed(1)}배` : '';
    out.push({ code: 'demand', text: `데이터랩 최근 7일 수요 실측${ratio}` });
  }
  if (row.serp && row.serp.verdict === 'WINNABLE') {
    out.push({ code: 'slot', text: `블로그탭 상위 ${row.serp.sampledTitles} 제목 중 정면 대응 0건 — 자리 있음 (실측)` });
  }
  if (typeof row.frontalDocCount === 'number') {
    const fresh = typeof row.freshFrontalCount === 'number' ? ` (최근 ${row.freshFrontalCount}건)` : '';
    out.push({ code: 'empty-field', text: `정면으로 다룬 글 ${row.frontalDocCount}건${fresh}` });
  }
  if (row.isHot === true || row.recencyStatus === 'rising') {
    out.push({ code: 'fresh', text: row.isHot ? '이슈 자체가 지금 뜨는 중(HOT)' : '이슈 추세 상승 중' });
  }
  return out;
}

/* ─────────────── 보강 값 모양 검사 ─────────────── */

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function cleanTitle(t: unknown): BoardTitle | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const text = str((t as BoardTitle).text);
  if (!text) return undefined;
  const frame = str((t as BoardTitle).frame);
  const basis = str((t as BoardTitle).basis);
  return { text, ...(frame ? { frame } : {}), ...(basis ? { basis } : {}) };
}

export function cleanTitles(raw: unknown): BoardTitles | null {
  if (!raw || typeof raw !== 'object') return null;
  const seo = cleanTitle((raw as BoardTitles).seo);
  const home = cleanTitle((raw as BoardTitles).home);
  if (!seo && !home) return null;
  return { ...(seo ? { seo } : {}), ...(home ? { home } : {}) };
}

export function cleanSubKeywords(raw: unknown): BoardSubKeyword[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.flatMap((s) => {
    const keyword = str(s?.keyword);
    if (!keyword) return [];
    const frame = str(s?.frame);
    return [{ keyword, searchVolume: num(s?.searchVolume), ...(frame ? { frame } : {}) }];
  });
  return out.length > 0 ? out : null;
}

/** 풀은 검색량 실측이 붙은 것만 — 검색량 없는 항목은 실존 확인이 안 된 말이다. */
export function cleanKeywordPool(raw: unknown): BoardPoolKeyword[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.flatMap((p) => {
    const keyword = str(p?.keyword);
    const searchVolume = num(p?.searchVolume);
    if (!keyword || searchVolume === null) return [];
    const documentCount = num(p?.documentCount);
    const source = str(p?.source);
    return [{
      keyword,
      searchVolume,
      ...(documentCount !== null ? { documentCount } : {}),
      ...(source ? { source } : {}),
    }];
  });
  return out.length > 0 ? out : null;
}

export function cleanTrend(raw: unknown): BoardTrend | null {
  if (!raw || typeof raw !== 'object') return null;
  const series = Array.isArray((raw as BoardTrend).series)
    ? (raw as BoardTrend).series.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  if (series.length < 2) return null;
  const label = str((raw as BoardTrend).label);
  const recommendation = str((raw as BoardTrend).recommendation);
  const measuredAt = str((raw as BoardTrend).measuredAt);
  return {
    series,
    ...(label ? { label } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(measuredAt ? { measuredAt } : {}),
  };
}

export function cleanKinTop(raw: unknown): BoardKinQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.flatMap((q) => {
    const title = str(q?.title);
    const link = str(q?.link);
    if (!title || !link) return [];
    return [{ title, link, views: num(q?.views), answers: num(q?.answers) }];
  });
  return out.length > 0 ? out : null;
}

export function cleanMonetize(raw: unknown): BoardMonetize | null {
  if (!raw || typeof raw !== 'object') return null;
  const verdict = (raw as BoardMonetize).verdict;
  if (verdict !== 'good' && verdict !== 'bad' && verdict !== 'mixed') return null;
  const points = Array.isArray((raw as BoardMonetize).points)
    ? (raw as BoardMonetize).points.flatMap((p) => (str(p?.text) ? [{ text: str(p.text) }] : [])) : [];
  const angle = str((raw as BoardMonetize).angle);
  return { verdict, points, ...(angle ? { angle } : {}) };
}

export function cleanWhy(raw: unknown): BoardWhy | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = str((raw as BoardWhy).text);
  if (!text) return null;
  const basis = str((raw as BoardWhy).basis);
  return { text, ...(basis ? { basis } : {}) };
}

/**
 * "왜 지금?" — 헤드라인이 검증한 이슈 추론이 먼저다. 보강 AI 의 why 는 그 키워드
 * 하나만 보고 지은 것이고, 이슈 추론은 뉴스 헤드라인 밖의 사실을 못 쓰게 검증됐다.
 */
export function resolveWhy(row: IssueLedgerRow, issue: IssueNicheIssue | null | undefined): BoardWhy | null {
  const issueWhy = str(issue?.why);
  if (issueWhy) {
    const count = issue?.headlines?.length ?? 0;
    return {
      text: issueWhy,
      basis: `뉴스 헤드라인 ${count}건 근거 · 에이전트 추론(헤드라인 밖 사실 검증 탈락)`,
    };
  }
  return cleanWhy(row.whySearch);
}
