/**
 * 🎯 이슈 황금 틈새 헌터 — 「네이버 상위노출 전용 틈새키워드」
 *
 * 사장님 교리(확정):
 *  1. 머리 이슈어("이용주 사망")는 실시간 검색어라 누구나 써서 경쟁 폭발 → 못 먹는다.
 *  2. 필요한 건 그 주변의 "저경쟁 × 고검색량" 황금키워드.
 *  3. 확장은 **같은 카테고리/페르소나 안에서 세부로** 판다 — 도메인 점프 금지.
 *     "이용주 사망"(연예이슈) → 사망원인·아내·재산·출연작·장례식장 (O)
 *     심근비대증(건강)·추천/최저가/렌탈(상업) (X — 다른 블로거 영역)
 *  4. 틈새 0은 "없어서"가 아니라 "하네스가 부실해서"다. 확장 가능·검색되는 키워드는
 *     무궁무진하므로 대량 생성 + 게이트로 항상 뽑아낸다(never-empty).
 *
 * 하네스:
 *   실시간 이슈(Signal.bz)
 *     → 카테고리 판정(classifyKeyword)
 *     → LLM 카테고리고정 후보 대량 생성(callAI)  ← 무궁무진 확장(페르소나 적합)
 *        · AI 없으면 네이버 자동완성으로 폴백(실검 반영, 상업 변형 제외)
 *     → 검색량·문서수 실측(getNaverKeywordSearchVolumeSeparate)
 *        + 최신성(상위글 도배 여부) + 추세(dead 차단)
 *     → 틈새 판정: 데이터랩 실측 수요 × 저경쟁(문서수)
 *
 * 판정에 검색광고 검색량을 쓰지 않는 이유: 검색광고는 '지난달 평균'이라
 * 오늘 터진 이슈에는 구조적으로 데이터가 없다. 검색량·황금비율은 표시용 관측값으로만 남긴다.
 *
 * LLM은 **후보(아이디어) 생성에만**. 측정·게이트·등급은 전부 결정론적
 * (메모리 규칙: 결정론적 스코어링은 LLM 대체 금지).
 */

import { getSignalBzKeywords, SignalKeyword } from './signal-bz-crawler';
import { getPolicyBriefingKeywords } from './policy-briefing-api';
import { sanitizePolicyKeywords } from './policy-keyword-sanitizer';
import { isNounPhraseToken } from './keyword-shape';
import { getTechIssueKeywords } from './tech-issue-keywords';
import { classifyKeyword } from './category-classifier';
import { runClaude } from './agent-cli/claudeRunner';
import { runCodex } from './agent-cli/codexRunner';
import { runGemini } from './agent-cli/geminiRunner';
import { runGrok } from './agent-cli/grokRunner';
import { runWithAnyAgent } from './agent-cli/runAny';
import { tryExtractJson } from './agent-cli/parse';
import { getNaverAutocompleteKeywords } from './naver-autocomplete';
import {
  NaverDatalabConfig,
  NaverKeywordSearchVolumeSeparateResult,
  KeywordRecency,
  RecencyStatus,
  getNaverKeywordSearchVolumeSeparate,
  checkKeywordRecencyBatch,
} from './naver-datalab-api';
import { takeRecentBlogPostMeta } from './naver-blog-api';
import { Grade } from './grade';
import { judgeIssueNiche } from './issue-niche-verdict';

export type IssueType = 'policy' | 'incident' | 'entertainment' | 'fresh';

export interface IssueNicheKeyword {
  keyword: string;
  baseKeyword: string;
  issueType: IssueType;
  isDerived: boolean;
  grade: Grade;
  searchVolume: number | null;
  documentCount: number | null;
  goldenRatio: number | null;
  cpc: number | null;
  recencyStatus: RecencyStatus;
  recencyRatio: number;
  isHot: boolean;
  hasTraffic: boolean;
  frontalDocCount: number | null;
  freshFrontalCount: number | null;
  isNiche: boolean;
  /** 검색량·문서수 중 하나라도 추정이면 true (기존 호환) */
  isEstimated: boolean;
  /** 검색량이 추정치인가 — 어느 축이 추정인지 구분해야 판정 원인을 말할 수 있다 */
  isSearchVolumeEstimated: boolean;
  /** 문서수가 추정치인가 */
  isDocumentCountEstimated: boolean;
  /** 데이터랩 최근 7일 상대지수 평균 — 상대값이며 절대 검색량 아님. null=미측정 */
  demandRecent7: number | null;
  /** 최근 7일 / 30일 비 (1.0=평행, 1.5+=상승) */
  demandRatio: number | null;
  /** 이 키워드 자체의 추세 (baseKeyword 의 recencyStatus 와 별개) */
  demandStatus: RecencyStatus;
  /** 데이터랩에 최근 7일 수요가 잡혔는가 (실측 이진 신호) */
  hasLiveDemand: boolean;
  /** 어느 증거로 틈새 판정을 통과했는가 */
  nicheRoute: 'demand' | null;
  /** 선점 후보 — 경쟁 없음이 확인됐으나 수요는 아직 측정되지 않음. 틈새와 별개 범주. */
  isPreemption: boolean;
  nicheScore: number;
  reasons: string[];
  source: string;
}

export interface HuntIssueNicheOptions {
  config: NaverDatalabConfig;
  /** Signal.bz 상위 몇 개 이슈 (기본 12) */
  issueLimit?: number;
  /** 이슈당 후보 개수 (기본 12) */
  candidatesPerIssue?: number;
  /** 실측할 후보 상한 — 쿼터/속도 (기본 120) */
  maxCandidates?: number;
  /** 저경쟁 판정 문서수 상한 (기본 3000) */
  docCountMax?: number;
  /** 상위 정면글이 이 일수 내면 '오늘 도배' (기본 2) */
  headFloodDays?: number;
  /**
   * 검색광고 검색량이 없는 키워드를 데이터랩 실측 수요로 구제할지 (기본 true).
   * 검색광고는 '지난달 평균'이라 오늘 터진 이슈에는 구조적으로 데이터가 없다.
   */
  useLiveDemandRoute?: boolean;
  /**
   * 정책·지원금 이슈를 함께 넣을지 (기본 false).
   *
   * 공급·정제는 정상 동작한다(제도명 17/60 추출). 그런데 자리가 닫혀 있다 —
   * 3회 라이브 주행 연속 틈새 0건이고(6차 0/24, 7차 0/30), 예전 SERP 실측도
   * 25 LOCKED / 0 WINNABLE 이었다. 지원금 키워드는 법무법인·대형 정보사이트가
   * 이미 점령해 문서수가 수십만이다("아동수당" 247,745).
   * 슬롯을 실검·IT 레인에 넘기는 편이 낫다. 필요하면 옵션으로 켠다.
   */
  includePolicyIssues?: boolean;
  /** 정책 이슈를 몇 개까지 넣을지 (기본 6) */
  policyIssueLimit?: number;
  /**
   * IT·AI 이슈를 함께 넣을지 (기본 true).
   * 새 AI 모델·기기는 나온 날 검색이 터지는데 블로그 문서는 아직 없다 —
   * 이 탭의 demand 경로가 정확히 그런 자리를 잡으라고 있는 것이다.
   */
  includeTechIssues?: boolean;
  /** IT·AI 이슈를 몇 개까지 넣을지 (기본 8) */
  techIssueLimit?: number;
  /**
   * 후보 생성기를 갈아끼운다. 기본은 구독 에이전트 CLI(claude→codex→gemini→grok).
   * 테스트에서 고정 후보를 넣을 때 쓴다 — 실주행은 데스크톱·CI 모두 구독 CLI 다.
   */
  generateCandidates?: (issues: string[], perIssue: number) => Promise<Map<string, string[]>>;
  onProgress?: (progress: IssueNicheProgress) => void;
  onCandidate?: (candidate: IssueNicheKeyword) => void;
  signal?: AbortSignal;
}

export interface IssueNicheProgress {
  phase: 'source' | 'derive' | 'demand' | 'judge' | 'complete';
  current?: number;
  total?: number;
  keyword?: string;
  message?: string;
}

const DATALAB_BATCH_SIZE = 5;

function toIssueType(primaryCategory: string): IssueType {
  const c = String(primaryCategory || '').toLowerCase();
  if (/celeb|broadcast|music|movie|drama|entertain|연예/.test(c)) return 'entertainment';
  if (/policy|welfare|gov|정책|복지|지원/.test(c)) return 'policy';
  if (/incident|accident|crime|사건|사고/.test(c)) return 'incident';
  return 'fresh';
}

function compactKey(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

const SUBJECT_DROP_TOKEN_RE = /^[0-9][0-9,]*(명|만|억|원|위|대|건|회|차|일|월)?$/;
/** 잘린 실검 문구 끝에 남는 처소격 조사. 한글 뒤에만 붙는다. */
const TRAILING_LOCATIVE_RE = /(?<=[가-힣])(에서|에게|으로|부터|까지|에)$/;

/**
 * 실검 문구에서 검색되는 주체를 뽑는다.
 *
 * Signal.bz 는 "박재홍, 뇌경색 진단", "지예은♥바타, 결혼 소감" 처럼 서술이 붙은 문구를 준다.
 * 앞 3어절만 자르면 쉼표·♥·꼬리 조각이 그대로 키워드가 된다
 * (실측 2026-09-03: "지예은♥바타, 결혼 소감", "vfl 오스나브뤼크 대" 가 결과에 실렸다).
 * 정책·IT 레인과 같은 조각 규칙을 여기에도 건다.
 */
export function cleanSubject(raw: string): string {
  const normalized = String(raw || '')
    .replace(/["'’“”♥♡★☆]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "주체, 서술" 꼴이면 쉼표 앞이 주체다. 기술기사 제목과 같은 관습이다.
  const lead = normalized.split(/[,·]/)[0].trim() || normalized;

  const tokens = lead
    .split(' ')
    .filter((token) => token && !SUBJECT_DROP_TOKEN_RE.test(token));

  // 앞에서부터 명사구 토큰만 취한다 — 중간에 조각이 나오면 거기서 끊는다.
  const taken: string[] = [];
  for (const token of tokens) {
    if (taken.length >= 3) break;
    if (!isNounPhraseToken(token)) break;
    taken.push(token);
  }
  // 한 글자 꼬리는 잘린 조각이다 ("vfl 오스나브뤼크 대").
  while (taken.length > 1 && taken[taken.length - 1].length < 2) taken.pop();
  // 잘린 문구의 꼬리 조사 ("용혜인 논란에" — 12차 실측). 처소격만 뗀다 —
  // 은/는/이/가 는 이름 끝 글자("지예은")와 구분이 안 되므로 손대지 않는다.
  if (taken.length > 0) {
    const last = taken[taken.length - 1];
    const stripped = last.replace(TRAILING_LOCATIVE_RE, '');
    if (stripped !== last && stripped.length >= 2) taken[taken.length - 1] = stripped;
  }

  const subject = taken.join(' ').trim();
  if (subject.length >= 2) return subject;
  // 규칙으로 못 건지면 원문 앞 3어절로 물러선다 — 이슈를 통째로 잃지 않기 위해서.
  return tokens.slice(0, 3).join(' ').trim() || normalized;
}

/** 이슈에 안 맞는 상업/쇼핑 변형 제외 (자동완성 폴백 정제용). */
const COMMERCE_NOISE_RE = /(최저가|가격비교|렌탈|구매처|구입|할인|쿠폰|중고|직구|도매|판매처|얼마|가격)/;

/**
 * 검색량 실측 가능한 최대 어절 수.
 * 실측 근거(2026-09-02): 네이버 검색광고 키워드도구는 4어절 이상 구를 전량 null 로 돌려준다.
 *   "프리즈 서울"(2어절) pc=7,970 mo=21,500 / "프리즈 서울 VIP 프리뷰 입장 조건"(5어절) pc=null mo=null
 * 이 길이를 넘으면 검색량이 통째로 null 이 되어 관측값(검색량·황금비율)이 사라지므로,
 * 애초에 재지 못할 길이는 후보로 만들지 않는다.
 */
const MEASURABLE_MAX_TOKENS = 3;

function tokenCount(keyword: string): number {
  return String(keyword || '').trim().split(/\s+/).filter(Boolean).length;
}

function isMeasurableLength(keyword: string): boolean {
  const n = tokenCount(keyword);
  return n >= 1 && n <= MEASURABLE_MAX_TOKENS;
}

interface Candidate {
  keyword: string;
  baseKeyword: string;
  issueType: IssueType;
  signalStatus: SignalKeyword['status'] | null;
}

type AgentRunners = Parameters<typeof runWithAnyAgent>[1];

const AGENT_RUNNERS: AgentRunners = [
  { provider: 'claude' as const, run: runClaude },
  { provider: 'codex' as const, run: runCodex },
  { provider: 'gemini' as const, run: runGemini },
  { provider: 'grok' as const, run: runGrok },
];

/**
 * 배치(CI)용 후보 생성기 — 클로드 모델만 고정하고 나머지 폴백은 그대로다.
 *
 * 왜 모델을 고정하나: 사장님 클로드코드 기본 모델은 최상위 티어라 그 한도는
 * 사장님이 직접 쓰는 자리에 남겨 두고, 배치는 오푸스로 돌린다(enrich-board.js 와
 * 같은 결정). 데스크톱은 기본 생성기(사용자 로그인 모델)를 쓴다.
 */
export function createAgentCandidateGenerator(
  options: { claudeModel?: string } = {},
): (issues: string[], perIssue: number) => Promise<Map<string, string[]>> {
  const runners: AgentRunners = options.claudeModel
    ? [
      { provider: 'claude' as const, run: (p, o) => runClaude(p, { ...(o || {}), model: options.claudeModel }) },
      ...AGENT_RUNNERS.slice(1),
    ]
    : AGENT_RUNNERS;
  return (issues, perIssue) => generateCandidatesWith(runners, issues, perIssue);
}

/**
 * 카테고리고정 후보 생성 — 구독 에이전트(클로드 코드 등) 사용. 원시 LLM API 아님.
 * claude→codex→gemini→grok 순 폴백(runWithAnyAgent). 전부 실패 시 빈 맵 → 자동완성 폴백.
 */
function generateCandidatesAgent(issues: string[], perIssue: number): Promise<Map<string, string[]>> {
  return generateCandidatesWith(AGENT_RUNNERS, issues, perIssue);
}

async function generateCandidatesWith(
  runners: AgentRunners,
  issues: string[],
  perIssue: number,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (issues.length === 0) return out;
  const prompt = [
    '너는 네이버 블로그 키워드 전략가다.',
    '아래 실시간 이슈 각각을, 그 이슈 카테고리(연예/스포츠/정치/사건/정책/경제 등) 블로거가',
    '실제 검색하는 "같은 카테고리"의 더 구체적이고 경쟁 낮은 하위 키워드로 확장해라.',
    '도메인 점프 금지: 연예인 사망→사망원인·가족·재산·출연작·장례식장(O), 질병명/의학(X).',
    '상업 변형 금지: 추천·후기·최저가·렌탈·구매처·가격비교 같은 쇼핑 접미사 금지.',
    `길이 제한(필수): 각 키워드는 최대 ${MEASURABLE_MAX_TOKENS}어절. 4어절 이상은 검색량 실측이 불가해 버려진다.`,
    '  좋은 예: "이용주 사망원인", "이용주 아내", "해병대 신병 수료식"',
    '  나쁜 예: "이용주 사망 원인 심근비대증 여부", "해병대 2사단 신병 수료식 일정"',
    `이슈당 ${perIssue}개씩. 설명 없이 JSON 만 출력:`,
    '{"items":[{"issue":"<원문>","cands":["...","..."]}]}',
    '',
    issues.map((k, i) => `${i + 1}. ${k}`).join('\n'),
  ].join('\n');
  try {
    const run = await runWithAnyAgent(prompt, runners, { timeoutMs: 120_000 });
    const parsed: any = tryExtractJson(run.reply);
    const items: any[] = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    for (const row of items) {
      const issue = String(row?.issue || '').trim();
      const cands = Array.isArray(row?.cands) ? row.cands.map((s: unknown) => String(s || '').trim()).filter(Boolean) : [];
      if (!issue || cands.length === 0) continue;
      const match = issues.find((k) => k === issue)
        || issues.find((k) => compactKey(k).includes(compactKey(issue)) || compactKey(issue).includes(compactKey(k)));
      if (match) out.set(match, cands.slice(0, perIssue));
    }
  } catch {
    // 에이전트 전부 실패 → 자동완성 폴백
  }
  return out;
}

/** 자동완성 폴백 — 실제 검색되는 변형(상업 노이즈 제외). */
async function autocompleteFallback(
  issue: string,
  config: NaverDatalabConfig,
  perIssue: number,
): Promise<string[]> {
  try {
    const sugg = await getNaverAutocompleteKeywords(issue, config as any);
    return sugg
      .filter((s) => s && !COMMERCE_NOISE_RE.test(s) && isMeasurableLength(s))
      .slice(0, perIssue);
  } catch {
    return [];
  }
}

interface HeadAnalysis { frontal: number; freshFrontal: number; }
function analyzeHead(keyword: string, floodDays: number, nowMs: number): HeadAnalysis | null {
  const meta = takeRecentBlogPostMeta(keyword);
  if (meta === null) return null;
  const tokens = keyword.split(/\s+/).map(compactKey).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  let frontal = 0, freshFrontal = 0;
  for (const post of meta) {
    const ct = compactKey(post.title);
    if (!tokens.every((t) => ct.includes(t))) continue;
    frontal += 1;
    const d = post.postdate.replace(/[^0-9]/g, '');
    if (d.length === 8) {
      const age = (nowMs - Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))) / 86_400_000;
      if (age <= floodDays + 1) freshFrontal += 1;
    }
  }
  return { frontal, freshFrontal };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 실시간 이슈에서 카테고리 고정 황금 틈새키워드 발굴.
 * 결과: isNiche 우선 · nicheScore 내림차순. never-empty 지향.
 */
export async function huntIssueNicheKeywords(
  options: HuntIssueNicheOptions,
): Promise<IssueNicheKeyword[]> {
  const {
    config,
    issueLimit = 12,
    candidatesPerIssue = 12,
    maxCandidates = 120,
    docCountMax = 3000,
    headFloodDays = 2,
    useLiveDemandRoute = true,
    includePolicyIssues = false,
    policyIssueLimit = 6,
    includeTechIssues = true,
    techIssueLimit = 8,
    generateCandidates = generateCandidatesAgent,
    onProgress,
    onCandidate,
    signal,
  } = options;

  if (!config?.clientId || !config?.clientSecret) {
    throw new Error('네이버 API 인증 정보가 필요합니다 (config.clientId/clientSecret)');
  }
  const nowMs = Date.now();

  // 1) 실시간 소스
  onProgress?.({ phase: 'source', message: '실시간 이슈 수집 중(Signal.bz)' });
  const signalKeywords = await getSignalBzKeywords(Math.max(issueLimit, 20));
  if (isAborted(signal)) return [];
  const issues = Array.from(new Set(
    signalKeywords.slice(0, issueLimit).map((s) => cleanSubject(s.keyword)).filter((k) => k.length >= 2),
  ));

  // 1-b) 정책·지원금 보충 공급원.
  // 정책브리핑은 기사 본문을 잘라 키워드를 만들어서 제도명과 문장 조각이 섞여 나온다
  // ("에 따른 급여", "학생들 때문이다"). 정제 게이트를 통과한 제도명만 이슈로 쓴다.
  const policyIssues: string[] = [];
  if (includePolicyIssues && policyIssueLimit > 0) {
    onProgress?.({ phase: 'source', message: '정책·지원금 제도명 수집 중(정책브리핑)' });
    try {
      const rows = await getPolicyBriefingKeywords(Math.max(policyIssueLimit * 6, 40));
      const clean = sanitizePolicyKeywords(rows.map((r) => r.keyword), MEASURABLE_MAX_TOKENS);
      for (const k of clean) {
        if (policyIssues.length >= policyIssueLimit) break;
        if (issues.some((i) => compactKey(i) === compactKey(k))) continue;
        policyIssues.push(k);
      }
    } catch (e: any) {
      console.warn('[ISSUE-NICHE] 정책 공급원 실패:', e?.message || e);
    }
  }
  for (const k of policyIssues) if (!issues.includes(k)) issues.push(k);

  // 1-c) IT·AI 보충 공급원 — 기술 매체 RSS 의 제품·모델명과 기업명.
  const techIssues: string[] = [];
  if (includeTechIssues && techIssueLimit > 0) {
    onProgress?.({ phase: 'source', message: 'IT·AI 이슈 수집 중(기술 매체)' });
    try {
      const rows = await getTechIssueKeywords(techIssueLimit * 3);
      for (const row of rows) {
        if (techIssues.length >= techIssueLimit) break;
        if (issues.some((i) => compactKey(i) === compactKey(row.keyword))) continue;
        techIssues.push(row.keyword);
      }
    } catch (e: any) {
      console.warn('[ISSUE-NICHE] IT·AI 공급원 실패:', e?.message || e);
    }
  }
  for (const k of techIssues) if (!issues.includes(k)) issues.push(k);

  if (issues.length === 0) {
    onProgress?.({ phase: 'complete', total: 0, message: '실시간 이슈를 가져오지 못했습니다' });
    return [];
  }
  const policySet = new Set(policyIssues.map(compactKey));
  const techSet = new Set(techIssues.map(compactKey));
  const statusByIssue = new Map<string, SignalKeyword['status']>();
  const typeByIssue = new Map<string, IssueType>();
  for (const s of signalKeywords.slice(0, issueLimit)) statusByIssue.set(compactKey(cleanSubject(s.keyword)), s.status);
  // 정책 이슈는 분류기를 거치지 않는다 — 공급원이 이미 정책이라고 알려준 사실이다.
  for (const issue of issues) {
    if (policySet.has(compactKey(issue))) { typeByIssue.set(issue, 'policy'); continue; }
    // IT·AI 는 공급원이 이미 기술 기사라고 알려준 사실이라 분류기를 거치지 않는다.
    if (techSet.has(compactKey(issue))) { typeByIssue.set(issue, 'fresh'); continue; }
    typeByIssue.set(issue, toIssueType(classifyKeyword(issue).primary));
  }

  // 2) 카테고리 고정 후보 생성 (LLM → 폴백 자동완성)
  onProgress?.({ phase: 'derive', total: issues.length, message: '에이전트로 카테고리 세부 키워드 생성 중' });
  const llm = await generateCandidates(issues, candidatesPerIssue).catch((e: any) => {
    console.warn('[ISSUE-NICHE] 후보 생성 실패 → 자동완성 폴백:', e?.message || e);
    return new Map<string, string[]>();
  });
  if (isAborted(signal)) return [];

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const push = (keyword: string, base: string) => {
    const key = compactKey(keyword);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ keyword, baseKeyword: base, issueType: typeByIssue.get(base) || 'fresh', signalStatus: statusByIssue.get(compactKey(base)) ?? null });
  };
  // 이슈별 후보를 먼저 모은다 — 이슈 순서대로 쌓고 앞에서 자르면
  // 뒤쪽 이슈는 후보가 한 개도 안 들어간다(maxCandidates 60 = 앞 5개 이슈에서 소진).
  const perIssueCands: { issue: string; cands: string[] }[] = [];
  for (const issue of issues) {
    // 실측 불가 길이(4어절+)는 여기서 떨군다 — LLM 이 길이 지시를 어겨도 게이트가 막는다.
    let cands = (llm.get(issue) || []).filter(isMeasurableLength);
    if (cands.length === 0) cands = await autocompleteFallback(issue, config, candidatesPerIssue);
    perIssueCands.push({ issue, cands });
  }
  // 머리(관찰용)를 전부 먼저 넣고, 파생은 라운드로빈으로 고르게 배분한다.
  for (const issue of issues) push(issue, issue);
  const maxDepth = perIssueCands.reduce((m, r) => Math.max(m, r.cands.length), 0);
  for (let depth = 0; depth < maxDepth; depth++) {
    for (const row of perIssueCands) {
      const c = row.cands[depth];
      if (c) push(c, row.issue);
    }
  }
  const judgeList = candidates.slice(0, maxCandidates);

  // 3) 이슈(base) 추세 — dead 차단용
  const baseKeywords = Array.from(new Set(judgeList.map((c) => c.baseKeyword)));
  const baseRecency = new Map<string, KeywordRecency>();
  for (const batch of chunk(baseKeywords, DATALAB_BATCH_SIZE)) {
    if (isAborted(signal)) break;
    const rows = await checkKeywordRecencyBatch(config, batch).catch(() => [] as KeywordRecency[]);
    for (const r of rows) baseRecency.set(compactKey(r.keyword), r);
  }

  // 3-b) 후보 자체의 실측 수요 — 데이터랩 최근 7일.
  // 검색광고(지난달 평균)가 못 보는 "오늘 생긴 수요"를 여기서 잡는다.
  // 데이터랩 ratio 는 요청 단위로 최대값=100 정규화되므로, 크기가 크게 다른
  // 머리와 파생을 한 배치에 섞으면 작은 쪽이 0 으로 눌린다 → 분리해서 잰다.
  const demandByKeyword = new Map<string, KeywordRecency>();
  if (useLiveDemandRoute) {
    // 같은 이슈 가족끼리 묶어서 잰다.
    // 실측(2026-09-02 8차): 라운드로빈 배분 뒤 후보 순서가 이슈별로 섞이는 바람에
    // 신제품 '카메라젯'(문서 62)이 '이순철'(sv 12,360)과 한 배치에 들어가 0 으로 눌렸다.
    // 문서수 1~3짜리 무주공산이 "수요 없음"으로 전량 탈락했다.
    // 가족 안에서는 크기가 비슷해 정규화 왜곡이 작다.
    const heads = judgeList.filter((c) => compactKey(c.keyword) === compactKey(c.baseKeyword));
    const derivedByBase = new Map<string, string[]>();
    for (const c of judgeList) {
      if (compactKey(c.keyword) === compactKey(c.baseKeyword)) continue;
      const key = compactKey(c.baseKeyword);
      if (!derivedByBase.has(key)) derivedByBase.set(key, []);
      derivedByBase.get(key)!.push(c.keyword);
    }
    let done = 0;
    const groups = [
      // 머리끼리도 레인이 다르면 크기가 크게 다르다 — 유형별로 나눈다.
      ...chunk(heads.filter((c) => c.issueType !== 'fresh').map((c) => c.keyword), DATALAB_BATCH_SIZE),
      ...chunk(heads.filter((c) => c.issueType === 'fresh').map((c) => c.keyword), DATALAB_BATCH_SIZE),
      ...Array.from(derivedByBase.values()).flatMap((list) => chunk(list, DATALAB_BATCH_SIZE)),
    ];
    for (const batch of groups) {
      if (isAborted(signal)) break;
      const rows = await checkKeywordRecencyBatch(config, batch).catch(() => [] as KeywordRecency[]);
      for (const r of rows) demandByKeyword.set(compactKey(r.keyword), r);
      done += batch.length;
      onProgress?.({ phase: 'demand', current: Math.min(done, judgeList.length), total: judgeList.length, message: '실측 수요(데이터랩) 측정 중' });
    }
  }

  // 4) 검색량·문서수 실측 + 황금 판정
  const results: IssueNicheKeyword[] = [];
  let judged = 0;
  for (const batch of chunk(judgeList, DATALAB_BATCH_SIZE)) {
    if (isAborted(signal)) break;
    const kws = batch.map((c) => c.keyword);
    const vols = await getNaverKeywordSearchVolumeSeparate(config, kws, { includeDocumentCount: true })
      .catch(() => [] as NaverKeywordSearchVolumeSeparateResult[]);
    const byKey = new Map(vols.map((r) => [compactKey(r.keyword), r]));

    for (const cand of batch) {
      if (isAborted(signal)) break;
      const v = byKey.get(compactKey(cand.keyword));
      const searchVolume = v && (v.pcSearchVolume !== null || v.mobileSearchVolume !== null)
        ? (v.pcSearchVolume ?? 0) + (v.mobileSearchVolume ?? 0) : null;
      const documentCount = v?.documentCount ?? null;
      const cpc = v?.monthlyAveCpc ?? null;
      const isSearchVolumeEstimated = Boolean(v?.svEstimated || v?.isSearchVolumeEstimated);
      const isDocumentCountEstimated = Boolean(v?.isDocumentCountEstimated);
      const rec = baseRecency.get(compactKey(cand.baseKeyword));
      const recencyStatus: RecencyStatus = rec?.status ?? 'unknown';
      const head = analyzeHead(cand.keyword, headFloodDays, nowMs);

      const dem = demandByKeyword.get(compactKey(cand.keyword)) ?? null;
      const demandRecent7 = dem ? dem.recent7Avg : null;
      const demandRatio = dem ? dem.ratio : null;
      const demandStatus: RecencyStatus = dem?.status ?? 'unknown';

      // 판정은 순수 함수에 맡긴다 — 규칙이 두 곳에 있으면 반드시 갈라진다.
      const verdict = judgeIssueNiche(
        {
          searchVolume,
          documentCount,
          isSearchVolumeEstimated,
          isDocumentCountEstimated,
          recencyStatus,
          demandRecent7,
          demandStatus,
          freshFrontalCount: head?.freshFrontal ?? null,
        },
        { docCountMax, useLiveDemandRoute },
      );

      const row: IssueNicheKeyword = {
        keyword: cand.keyword,
        baseKeyword: cand.baseKeyword,
        issueType: cand.issueType,
        isDerived: compactKey(cand.keyword) !== compactKey(cand.baseKeyword),
        grade: verdict.grade,
        searchVolume,
        documentCount,
        goldenRatio: verdict.goldenRatio,
        cpc,
        recencyStatus,
        recencyRatio: rec?.ratio ?? 0,
        isHot: cand.signalStatus === 'up' || cand.signalStatus === 'new' || recencyStatus === 'rising',
        hasTraffic: verdict.hasTraffic,
        frontalDocCount: head?.frontal ?? null,
        freshFrontalCount: head?.freshFrontal ?? null,
        isNiche: verdict.isNiche,
        isEstimated: verdict.isEstimated,
        isSearchVolumeEstimated,
        isDocumentCountEstimated,
        demandRecent7,
        demandRatio,
        demandStatus,
        hasLiveDemand: verdict.hasLiveDemand,
        nicheRoute: verdict.nicheRoute,
        isPreemption: verdict.isPreemption,
        nicheScore: verdict.nicheScore,
        reasons: verdict.reasons,
        source: policySet.has(compactKey(cand.baseKeyword)) ? 'policy-briefing'
          : (techSet.has(compactKey(cand.baseKeyword)) ? 'tech-rss' : 'signal.bz'),
      };
      results.push(row);
      onCandidate?.(row);
      judged += 1;
      onProgress?.({ phase: 'judge', current: judged, total: judgeList.length, keyword: cand.keyword });
    }
  }

  results.sort((a, b) => {
    if (a.isNiche !== b.isNiche) return a.isNiche ? -1 : 1;
    if (a.isPreemption !== b.isPreemption) return a.isPreemption ? -1 : 1;
    return b.nicheScore - a.nicheScore;
  });
  onProgress?.({ phase: 'complete', total: results.length });
  return results;
}
