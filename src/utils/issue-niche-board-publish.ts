/**
 * 실검 틈새 보드 발행 — 원장(헌터 결과)을 화면이 읽는 공개 JSON 으로 옮긴다.
 *
 * 황금키워드보드(publish-preemption-board.js)와 같은 구조다: 사장님 CI 가 회차를
 * 돌려 정적 JSON 을 사이트 레포에 커밋하고, 방문자는 그 파일을 읽기만 한다.
 * 방문자마다 헌터를 돌리지 않으므로 키 전달도, 서버 AI 도 없다.
 *
 * 규칙:
 *  - 틈새(isNiche)·선점 후보(isPreemption)만 싣는다. 나머지 실측 행은 원장에만
 *    남는다 — 보드는 "쓸 자리"를 보여주는 곳이지 실측 전부를 보는 곳이 아니다.
 *  - 추정치는 화면에 내보내지 않는다. 검색량이 추정이면 null 로 낸다.
 *  - 이월: 실시간 이슈는 하루면 문서가 쌓여 자리가 닫힌다. 그래서 48시간만
 *    이월하고, 이월 행은 carried 로 표시해 화면이 "언제 잰 값인지"를 밝히게 한다.
 *  - 점수(nicheScore)는 정렬에만 쓰고 싣지 않는다 — 화면에 나가는 것은 실측 사실뿐이다.
 */

import type { IssueNicheKeyword, IssueType } from './issue-niche-hunter';
import type { RecencyStatus } from './naver-datalab-api';

export type IssueBoardLane = 'realtime' | 'tech' | 'policy';
export type IssueBoardVerdict = 'niche' | 'preemption';

export interface IssueBoardPublicRow {
  keyword: string;
  /** 어느 실시간 이슈에서 나왔는가 (머리 키워드). */
  issue: string;
  lane: IssueBoardLane;
  issueType: IssueType;
  isDerived: boolean;
  verdict: IssueBoardVerdict;
  documentCount: number | null;
  /** 문서수가 실측인가. 추정이면 false 이고, 그런 행은 틈새 판정을 통과하지 못한다. */
  documentCountMeasured: boolean;
  /** 검색광고 실측 검색량. 추정치는 null 로 낸다 — 화면에 추정을 싣지 않는다. */
  searchVolume: number | null;
  /** 데이터랩 최근 7일 수요가 잡혔는가 (실측 이진 신호). */
  hasLiveDemand: boolean;
  demandStatus: RecencyStatus;
  /** 최근 7일 / 30일 비. 1.5+ 면 상승. */
  demandRatio: number | null;
  /** 머리 이슈의 추세. */
  issueStatus: RecencyStatus;
  isHot: boolean;
  frontalDocCount: number | null;
  freshFrontalCount: number | null;
  reasons: string[];
  measuredAt: string;
  carried?: boolean;
}

export interface IssueBoardLedger {
  generator?: string;
  generatedAt?: string;
  rows?: IssueNicheKeyword[];
  funnel?: { issues?: number; candidates?: number };
}

export interface IssueBoardPayload {
  publishedAt: string;
  generator: 'issue-niche-board';
  /** 갱신 주기 안내 — 화면 출처 줄에 그대로 나간다. */
  schedule: string;
  /** 이번 회차 실측 규모. 화면이 "N개 실측 중 M개 통과"를 말할 재료다. */
  measured: { issues: number; candidates: number; niche: number; preemption: number };
  /** 무료 맛보기 — 하루 동안 고정(황금키워드보드와 같은 규칙). */
  freeSample: { day: string; keywords: string[] };
  rows: IssueBoardPublicRow[];
}

export interface IssueBoardBuildOptions {
  nowMs: number;
  /** 이월 시간(시간 단위). 기본 48 — 실시간 이슈 자리는 그 뒤엔 대개 닫혀 있다. */
  carryHours?: number;
  schedule?: string;
  freeRows?: number;
}

export interface IssueBoardBuildResult {
  payload: IssueBoardPayload;
  fresh: number;
  carried: number;
  expired: number;
}

const DEFAULT_SCHEDULE = '매일 07·13·19시(KST) 갱신';
const DEFAULT_CARRY_HOURS = 48;
/*
 * 비로그인 맛보기 — 황금키워드보드는 5건이지만 이 보드는 **3건**이다(사장님
 * 사양 2026-09-03 "틈새키워드도 하루 3개만"). 하루 3회 갱신이라 5건이면 하루에
 * 15건이 공짜로 새는 셈이다. 사이트 IssueNicheTab 의 FREE_ISSUE_ROWS 와 같은 수.
 */
const DEFAULT_FREE_ROWS = 3;

export function laneOfSource(source: string | undefined): IssueBoardLane {
  if (source === 'tech-rss') return 'tech';
  if (source === 'policy-briefing') return 'policy';
  return 'realtime';
}

function compactKey(keyword: unknown): string {
  return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

/** 틈새·선점 후보만 공개 행으로 옮긴다. 둘 다 아니면 null (원장에만 남는다). */
export function toPublicIssueRow(row: IssueNicheKeyword, measuredAt: string): IssueBoardPublicRow | null {
  const verdict: IssueBoardVerdict | null = row.isNiche ? 'niche' : (row.isPreemption ? 'preemption' : null);
  if (!verdict) return null;
  return {
    keyword: row.keyword,
    issue: row.baseKeyword,
    lane: laneOfSource(row.source),
    issueType: row.issueType,
    isDerived: row.isDerived === true,
    verdict,
    documentCount: row.isDocumentCountEstimated ? null : (row.documentCount ?? null),
    documentCountMeasured: !row.isDocumentCountEstimated && typeof row.documentCount === 'number',
    searchVolume: row.isSearchVolumeEstimated ? null : (row.searchVolume ?? null),
    hasLiveDemand: row.hasLiveDemand === true,
    demandStatus: row.demandStatus || 'unknown',
    demandRatio: typeof row.demandRatio === 'number' ? row.demandRatio : null,
    issueStatus: row.recencyStatus || 'unknown',
    isHot: row.isHot === true,
    frontalDocCount: row.frontalDocCount ?? null,
    freshFrontalCount: row.freshFrontalCount ?? null,
    reasons: Array.isArray(row.reasons) ? row.reasons.slice(0, 6) : [],
    measuredAt,
  };
}

/**
 * 이번 회차 원장 + 직전 발행본 → 발행 payload.
 *
 * 신규 행이 항상 이긴다(측정이 더 최신). 신규에 없는 직전 행은 carryHours 안이면
 * 이월(carried)하고, 넘겼으면 만료다. 순서는 틈새 → 선점 후보, 각 안에서
 * 신규(헌터 정렬 그대로) → 이월이다.
 */
export function buildIssueBoardPayload(
  ledger: IssueBoardLedger,
  prev: IssueBoardPayload | null | undefined,
  options: IssueBoardBuildOptions,
): IssueBoardBuildResult {
  const carryMs = (options.carryHours ?? DEFAULT_CARRY_HOURS) * 3_600_000;
  const measuredAt = ledger.generatedAt || new Date(options.nowMs).toISOString();
  const ledgerRows = Array.isArray(ledger.rows) ? ledger.rows : [];

  const seen = new Set<string>();
  const freshRows: IssueBoardPublicRow[] = [];
  for (const row of ledgerRows) {
    const pub = toPublicIssueRow(row, measuredAt);
    if (!pub) continue;
    const key = compactKey(pub.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    freshRows.push(pub);
  }

  let expired = 0;
  const carriedRows: IssueBoardPublicRow[] = [];
  for (const row of Array.isArray(prev?.rows) ? prev!.rows : []) {
    const key = compactKey(row?.keyword);
    if (!key || seen.has(key)) continue;
    const measuredMs = Date.parse(String(row.measuredAt || '')) || Date.parse(String(prev?.publishedAt || '')) || 0;
    if (!measuredMs || options.nowMs - measuredMs > carryMs) { expired += 1; continue; }
    seen.add(key);
    carriedRows.push(row.carried === true ? row : { ...row, carried: true });
  }

  const byVerdict = (verdict: IssueBoardVerdict) => [
    ...freshRows.filter((row) => row.verdict === verdict),
    ...carriedRows.filter((row) => row.verdict === verdict),
  ];
  const rows = [...byVerdict('niche'), ...byVerdict('preemption')];

  const kstDay = new Date(options.nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
  const freeRows = options.freeRows ?? DEFAULT_FREE_ROWS;
  /*
   * 같은 날은 직전 표본을 그대로 쓴다 — 회차마다 새 이름이 열리면 하루 세 번
   * 보는 사람이 다 본다. 다만 상한이 줄었을 때(5→3)는 앞에서 자른다: 닫는 것은
   * 괜찮고, 반대로 짧은 표본을 채우는 것은 낮에 새 키워드를 여는 구멍이라 안 한다.
   */
  const freeSample = prev?.freeSample && prev.freeSample.day === kstDay
    ? { day: prev.freeSample.day, keywords: prev.freeSample.keywords.slice(0, freeRows) }
    : { day: kstDay, keywords: rows.slice(0, freeRows).map((row) => row.keyword) };

  const payload: IssueBoardPayload = {
    publishedAt: new Date(options.nowMs).toISOString(),
    generator: 'issue-niche-board',
    schedule: options.schedule || DEFAULT_SCHEDULE,
    measured: {
      issues: ledger.funnel?.issues ?? 0,
      candidates: ledger.funnel?.candidates ?? ledgerRows.length,
      niche: ledgerRows.filter((row) => row.isNiche).length,
      preemption: ledgerRows.filter((row) => !row.isNiche && row.isPreemption).length,
    },
    freeSample,
    rows,
  };

  return { payload, fresh: freshRows.length, carried: carriedRows.length, expired };
}
