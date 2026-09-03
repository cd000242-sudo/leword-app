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
 *    대기(isPending: 트래픽·수요 통과, 자리 미실측)도 싣지 않는다 — 건수만 measured.pending 에 적는다.
 *  - 추정치는 화면에 내보내지 않는다. 검색량이 추정이면 null 로 낸다.
 *  - 이월: 실시간 이슈는 하루면 문서가 쌓여 자리가 닫힌다. 그래서 48시간만
 *    이월하고, 이월 행은 carried 로 표시해 화면이 "언제 잰 값인지"를 밝히게 한다.
 *  - 점수(nicheScore)는 정렬에만 쓰고 싣지 않는다 — 화면에 나가는 것은 실측 사실뿐이다.
 *  - 행은 황금키워드 카드와 같은 모양이다(근거·연관 실측 풀·서브키워드·제목·추세·
 *    지식인·수익 판정). 모양 규칙은 issue-niche-board-shape.ts 에 있다.
 *  - 이슈 브리핑(issues): 왜 뜨나·몰린 검색어·다음 물결을 이슈 단위로 싣는다.
 *    실시간 검색어 브리지 모달이 이걸 읽는다.
 */

import type { IssueNicheKeyword, IssueSlotSerp, IssueType } from './issue-niche-hunter';
import type { IssuePreemptionKind } from './issue-niche-verdict';
import type { IssueContext } from './issue-context';
import type { RecencyStatus } from './naver-datalab-api';
import {
  buildIssueEvidence,
  cleanKeywordPool,
  cleanKinTop,
  cleanMonetize,
  cleanSubKeywords,
  cleanTitles,
  cleanTrend,
  compactKey,
  resolveWhy,
  type BoardEvidence,
  type BoardKinQuestion,
  type BoardMonetize,
  type BoardPoolKeyword,
  type BoardSubKeyword,
  type BoardTitles,
  type BoardTrend,
  type BoardWhy,
  type IssueLedgerIssue,
  type IssueLedgerLike,
  type IssueLedgerRow,
} from './issue-niche-board-shape';

export { selectIssueRowsForEnrich } from './issue-niche-board-shape';
export type { EnrichReadyLedger, IssueLedgerIssue, IssueLedgerRow } from './issue-niche-board-shape';

export type IssueBoardLane = 'realtime' | 'tech' | 'policy';
export type IssueBoardVerdict = 'niche' | 'preemption';

export interface IssueBoardPublicRow {
  keyword: string;
  /** 어느 실시간 이슈에서 나왔는가 (머리 키워드). */
  issue: string;
  /** 황금 카드의 topic 자리 — 이슈 이름과 같다. */
  topic: string;
  lane: IssueBoardLane;
  issueType: IssueType;
  isDerived: boolean;
  /** 이 후보가 어디서 왔나 — 다음 물결/자동완성/연관/파생/머리. */
  origin: IssueNicheKeyword['origin'];
  originReason: string | null;
  verdict: IssueBoardVerdict;
  /** 선점 후보의 근거 종류(수요 미검출 / 수요 잡힘·검색량 미확인). 틈새 행은 null. */
  preemptionKind: IssuePreemptionKind | null;
  /** 블로그탭 상위 10 자리 실측(Bright Data). 틈새 행은 항상 WINNABLE 이 실려 있다. 못 쟀으면 null. */
  serp: IssueSlotSerp | null;
  documentCount: number | null;
  /** 문서수가 실측인가. 추정이면 false 이고, 그런 행은 틈새 판정을 통과하지 못한다. */
  documentCountMeasured: boolean;
  /** 검색광고 실측 검색량. 추정치는 null 로 낸다 — 화면에 추정을 싣지 않는다. */
  searchVolume: number | null;
  /**
   * 키워드도구가 "< 10" 으로 답했는가(실측). searchVolume 이 null 인데 이게 true 면
   * 화면은 '—' 가 아니라 '10 미만' 으로 적는다 — 못 잰 것과 적은 것은 다른 사실이다.
   */
  searchVolumeLt10: boolean;
  /** 이월 행 재측정이 검색량을 다시 잰 시각. 없으면 measuredAt 이 그 시각이다. */
  searchVolumeMeasuredAt?: string;
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
  /** 화면 근거 줄 — 실측 사실만. */
  evidence: BoardEvidence[];
  /** "왜 지금?" — 헤드라인 검증 이슈 추론 > 보강 AI. */
  whySearch: BoardWhy | null;
  intentLabel: string | null;
  adsenseFit: boolean | null;
  adsenseReason: string | null;
  titles: BoardTitles | null;
  subKeywords: BoardSubKeyword[] | null;
  keywordPool: BoardPoolKeyword[] | null;
  trend: BoardTrend | null;
  kinCount: number | null;
  kinTop: BoardKinQuestion[] | null;
  monetize: BoardMonetize | null;
  measuredAt: string;
  carried?: boolean;
}

export type IssueBoardLedger = IssueLedgerLike;

export interface IssueBoardConcentrated {
  keyword: string;
  searchVolume: number | null;
  origin: 'autocomplete' | 'related';
}

export interface IssueBoardNextWave {
  keyword: string;
  reason: string;
  searchVolume: number | null;
  documentCount: number | null;
  /** 보드 행으로 실측·통과했는가. */
  onBoard: boolean;
}

/** 이슈 브리핑 — 실시간 검색어 브리지가 읽는다. */
export interface IssueBoardIssue {
  issue: string;
  issueType: IssueType;
  lane: IssueBoardLane;
  issueStatus: RecencyStatus;
  isHot: boolean;
  why: string | null;
  headlines: IssueContext['headlines'];
  /** 지금 검색이 몰린 말 — 자동완성·연관 실측. */
  concentrated: IssueBoardConcentrated[];
  nextWave: IssueBoardNextWave[];
  rowCount: number;
  carried?: boolean;
}

export interface IssueBoardPayload {
  publishedAt: string;
  generator: 'issue-niche-board';
  /** 갱신 주기 안내 — 화면 출처 줄에 그대로 나간다. */
  schedule: string;
  /** 이번 회차 실측 규모. 화면이 "N개 실측 중 M개 통과"를 말할 재료다. */
  measured: { issues: number; candidates: number; niche: number; preemption: number; pending: number };
  /** 무료 맛보기 — 하루 동안 고정(황금키워드보드와 같은 규칙). */
  freeSample: { day: string; keywords: string[] };
  rows: IssueBoardPublicRow[];
  issues: IssueBoardIssue[];
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
const BRIEF_HEADLINES = 3;
const BRIEF_CONCENTRATED = 8;

/**
 * 보강이 끝난 카드인가 — 제목·서브키워드·실측 풀 중 하나라도 실려 있으면.
 * 맛보기는 이런 행에서 고른다: 맨카드(실측 수치뿐)가 맛보기면 유료 카드가
 * 어떻게 생겼는지 못 보여 준다. 첫 회차(2026-09-03) 실사고 — 옛 파이프라인
 * 이월 행이 앞에 서서 프로필 맨카드 3건이 하루 표본으로 잠겼다.
 */
export function hasGoldenFields(row: Pick<IssueBoardPublicRow, 'titles' | 'subKeywords' | 'keywordPool'>): boolean {
  return Boolean(row.titles && (row.titles.seo || row.titles.home))
    || (Array.isArray(row.subKeywords) && row.subKeywords.length > 0)
    || (Array.isArray(row.keywordPool) && row.keywordPool.length > 0);
}

export function laneOfSource(source: string | undefined): IssueBoardLane {
  if (source === 'tech-rss') return 'tech';
  if (source === 'policy-briefing') return 'policy';
  return 'realtime';
}

/** 자리 실측 결과는 숫자·제목만 그대로 싣는다 — 모양이 깨진 값은 실측이 아닌 것으로 본다. */
function cleanSerp(raw: unknown): IssueSlotSerp | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<IssueSlotSerp>;
  if (s.verdict !== 'WINNABLE' && s.verdict !== 'CONTESTED' && s.verdict !== 'LOCKED' && s.verdict !== 'NO_DATA') return null;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    verdict: s.verdict,
    reason: typeof s.reason === 'string' ? s.reason : '',
    exactTitleHits: n(s.exactTitleHits),
    partialTitleHits: n(s.partialTitleHits),
    sampledTitles: n(s.sampledTitles),
    topTitles: Array.isArray(s.topTitles) ? s.topTitles.filter((t): t is string => typeof t === 'string').slice(0, 10) : [],
    measuredAt: typeof s.measuredAt === 'string' ? s.measuredAt : '',
  };
}

/** 틈새·선점 후보만 공개 행으로 옮긴다. 둘 다 아니면 null (원장에만 남는다). */
export function toPublicIssueRow(
  row: IssueLedgerRow,
  measuredAt: string,
  issue?: IssueLedgerIssue | null,
): IssueBoardPublicRow | null {
  const verdict: IssueBoardVerdict | null = row.isNiche ? 'niche' : (row.isPreemption ? 'preemption' : null);
  if (!verdict) return null;
  return {
    keyword: row.keyword,
    issue: row.baseKeyword,
    topic: row.baseKeyword,
    lane: laneOfSource(row.source),
    issueType: row.issueType,
    isDerived: row.isDerived === true,
    origin: row.origin || 'derived',
    originReason: typeof row.originReason === 'string' && row.originReason.trim() ? row.originReason.trim() : null,
    verdict,
    preemptionKind: verdict === 'preemption' ? (row.preemptionKind ?? null) : null,
    serp: cleanSerp(row.serp),
    documentCount: row.isDocumentCountEstimated ? null : (row.documentCount ?? null),
    documentCountMeasured: !row.isDocumentCountEstimated && typeof row.documentCount === 'number',
    searchVolume: row.isSearchVolumeEstimated ? null : (row.searchVolume ?? null),
    searchVolumeLt10: row.searchVolumeLt10 === true,
    hasLiveDemand: row.hasLiveDemand === true,
    demandStatus: row.demandStatus || 'unknown',
    demandRatio: typeof row.demandRatio === 'number' ? row.demandRatio : null,
    issueStatus: row.recencyStatus || 'unknown',
    isHot: row.isHot === true,
    frontalDocCount: row.frontalDocCount ?? null,
    freshFrontalCount: row.freshFrontalCount ?? null,
    reasons: Array.isArray(row.reasons) ? row.reasons.slice(0, 6) : [],
    evidence: buildIssueEvidence(row),
    whySearch: resolveWhy(row, issue),
    intentLabel: typeof row.intentLabel === 'string' && row.intentLabel ? row.intentLabel : null,
    adsenseFit: typeof row.adsenseFit === 'boolean' ? row.adsenseFit : null,
    adsenseReason: typeof row.adsenseReason === 'string' && row.adsenseReason ? row.adsenseReason : null,
    titles: cleanTitles(row.titles),
    subKeywords: cleanSubKeywords(row.subKeywords),
    keywordPool: cleanKeywordPool(row.keywordPool),
    trend: cleanTrend(row.trend),
    kinCount: typeof row.kinCount === 'number' && Number.isFinite(row.kinCount) ? row.kinCount : null,
    kinTop: cleanKinTop(row.kinTop),
    monetize: cleanMonetize(row.monetize),
    measuredAt,
  };
}

/* ─────────────── 이슈 브리핑 ─────────────── */

function headStatus(rows: IssueNicheKeyword[], issueName: string): { status: RecencyStatus; isHot: boolean } {
  const key = compactKey(issueName);
  const own = rows.filter((row) => compactKey(row.baseKeyword) === key);
  const head = own.find((row) => compactKey(row.keyword) === key) || own[0];
  return { status: head?.recencyStatus || 'unknown', isHot: head?.isHot === true };
}

function briefIssue(
  issue: IssueLedgerIssue,
  ledgerRows: IssueNicheKeyword[],
  freshRows: IssueBoardPublicRow[],
): IssueBoardIssue | null {
  const key = compactKey(issue.issue);
  const own = freshRows.filter((row) => compactKey(row.issue) === key);
  const byKeyword = new Map(own.map((row) => [compactKey(row.keyword), row]));
  const relatedVolume = new Map(
    (issue.related || []).map((r) => [compactKey(r.keyword), typeof r.monthlyVolume === 'number' ? r.monthlyVolume : null]),
  );
  const volumeOf = (keyword: string): number | null => {
    const k = compactKey(keyword);
    const onBoard = byKeyword.get(k);
    if (onBoard && typeof onBoard.searchVolume === 'number') return onBoard.searchVolume;
    return relatedVolume.get(k) ?? null;
  };

  const seen = new Set<string>();
  const concentrated: IssueBoardConcentrated[] = [];
  const pushConcentrated = (keyword: string, origin: IssueBoardConcentrated['origin']) => {
    const k = compactKey(keyword);
    if (!k || k === key || seen.has(k) || concentrated.length >= BRIEF_CONCENTRATED) return;
    seen.add(k);
    concentrated.push({ keyword, searchVolume: volumeOf(keyword), origin });
  };
  for (const keyword of issue.autocomplete || []) pushConcentrated(keyword, 'autocomplete');
  for (const r of issue.related || []) pushConcentrated(r.keyword, 'related');

  const nextWave: IssueBoardNextWave[] = (issue.nextWave || []).map((wave) => {
    const onBoard = byKeyword.get(compactKey(wave.keyword));
    return {
      keyword: wave.keyword,
      reason: wave.reason,
      searchVolume: onBoard?.searchVolume ?? null,
      documentCount: onBoard?.documentCount ?? null,
      onBoard: Boolean(onBoard),
    };
  });

  const why = typeof issue.why === 'string' && issue.why.trim() ? issue.why.trim() : null;
  if (!why && nextWave.length === 0 && own.length === 0) return null;

  const fallback = headStatus(ledgerRows, issue.issue);
  return {
    issue: issue.issue,
    issueType: issue.issueType,
    lane: laneOfSource(issue.source),
    issueStatus: issue.issueStatus || fallback.status,
    isHot: typeof issue.isHot === 'boolean' ? issue.isHot : fallback.isHot,
    why,
    headlines: (issue.headlines || []).slice(0, BRIEF_HEADLINES),
    concentrated,
    nextWave,
    rowCount: own.length,
  };
}

/**
 * 직전 발행본 행을 이월 행으로 — carried 를 붙이고, 배열 필드는 배열로 맞춘다.
 * 스키마가 바뀌기 전 회차의 행이 그대로 실려 오면(2026-09-03 04:49 발행본 28행에
 * evidence 없음) 화면 카드의 `row.evidence.map` 이 터져 탭 전체가 죽는다.
 */
function carryRow(row: IssueBoardPublicRow): IssueBoardPublicRow {
  const shaped = Array.isArray(row.reasons) && Array.isArray(row.evidence)
    ? row
    : { ...row, reasons: Array.isArray(row.reasons) ? row.reasons : [], evidence: Array.isArray(row.evidence) ? row.evidence : [] };
  return shaped.carried === true ? shaped : { ...shaped, carried: true };
}

/**
 * 이번 회차 원장 + 직전 발행본 → 발행 payload.
 *
 * 신규 행이 항상 이긴다(측정이 더 최신). 신규에 없는 직전 행은 carryHours 안이면
 * 이월(carried)하고, 넘겼으면 만료다. 순서는 틈새 → 선점 후보, 각 안에서
 * 신규(헌터 정렬 그대로) → 이월이다. 이슈 브리핑도 같이 이월된다 — 이월 행이
 * 가리키는 이슈의 직전 브리핑을 carried 로 잇는다.
 */
export function buildIssueBoardPayload(
  ledger: IssueBoardLedger,
  prev: IssueBoardPayload | null | undefined,
  options: IssueBoardBuildOptions,
): IssueBoardBuildResult {
  const carryMs = (options.carryHours ?? DEFAULT_CARRY_HOURS) * 3_600_000;
  const measuredAt = ledger.generatedAt || new Date(options.nowMs).toISOString();
  const ledgerRows = Array.isArray(ledger.rows) ? ledger.rows : [];
  const ledgerIssues = Array.isArray(ledger.issues) ? ledger.issues : [];
  const issueByName = new Map(ledgerIssues.map((issue) => [compactKey(issue.issue), issue]));

  const seen = new Set<string>();
  const freshRows: IssueBoardPublicRow[] = [];
  for (const row of ledgerRows) {
    const pub = toPublicIssueRow(row, measuredAt, issueByName.get(compactKey(row.baseKeyword)));
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
    carriedRows.push(carryRow(row));
  }

  const byVerdict = (verdict: IssueBoardVerdict) => [
    ...freshRows.filter((row) => row.verdict === verdict),
    ...carriedRows.filter((row) => row.verdict === verdict),
  ];
  const rows = [...byVerdict('niche'), ...byVerdict('preemption')];

  const freshIssues = ledgerIssues
    .map((issue) => briefIssue(issue, ledgerRows, freshRows))
    .filter((issue): issue is IssueBoardIssue => issue !== null);
  const freshIssueKeys = new Set(freshIssues.map((issue) => compactKey(issue.issue)));
  const carriedIssueKeys = new Set(carriedRows.map((row) => compactKey(row.issue)));
  const carriedIssues = (Array.isArray(prev?.issues) ? prev!.issues : [])
    .filter((issue) => {
      const key = compactKey(issue?.issue);
      return key && !freshIssueKeys.has(key) && carriedIssueKeys.has(key);
    })
    .map((issue) => (issue.carried === true ? issue : { ...issue, carried: true }));
  const issues = [...freshIssues, ...carriedIssues];

  const kstDay = new Date(options.nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
  const freeRows = options.freeRows ?? DEFAULT_FREE_ROWS;
  /*
   * 같은 날은 직전 표본을 그대로 쓴다 — 회차마다 새 이름이 열리면 하루 세 번
   * 보는 사람이 다 본다. 다만 상한이 줄었을 때(5→3)는 앞에서 자른다: 닫는 것은
   * 괜찮고, 반대로 짧은 표본을 채우는 것은 낮에 새 키워드를 여는 구멍이라 안 한다.
   * 표본은 확정 틈새(3중 실측)부터 — 틈새가 모자랄 때만 선점 후보로 채운다.
   */
  const byGolden = (list: IssueBoardPublicRow[]) => [...list.filter(hasGoldenFields), ...list.filter((row) => !hasGoldenFields(row))];
  const sampleOrder = [...byGolden(byVerdict('niche')), ...byGolden(byVerdict('preemption'))];
  const freeSample = prev?.freeSample && prev.freeSample.day === kstDay
    ? { day: prev.freeSample.day, keywords: prev.freeSample.keywords.slice(0, freeRows) }
    : { day: kstDay, keywords: sampleOrder.slice(0, freeRows).map((row) => row.keyword) };

  const payload: IssueBoardPayload = {
    publishedAt: new Date(options.nowMs).toISOString(),
    generator: 'issue-niche-board',
    schedule: options.schedule || DEFAULT_SCHEDULE,
    measured: {
      issues: ledger.funnel?.issues ?? 0,
      candidates: ledger.funnel?.candidates ?? ledgerRows.length,
      niche: ledgerRows.filter((row) => row.isNiche).length,
      preemption: ledgerRows.filter((row) => !row.isNiche && row.isPreemption).length,
      pending: ledgerRows.filter((row) => row.isPending === true).length,
    },
    freeSample,
    rows,
    issues,
  };

  return { payload, fresh: freshRows.length, carried: carriedRows.length, expired };
}
