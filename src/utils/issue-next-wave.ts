/**
 * 이슈 추론 — "왜 뜨나 · 지금 어디에 몰리나 · 다음 물결은 무엇인가".
 *
 * 실검 틈새 보드는 그동안 이슈에서 파생어를 뽑아 자리를 재기만 했다. 사장님 지적
 * (2026-09-03): "왜 뜨는지, 어느 키워드에 몰려 있는지, 다음에 궁금해할 키워드가
 * 뭔지 분석해서 올려야지 — 그 추론 부분이 빠져 있잖아."
 *
 * 구독 에이전트를 **이슈 전부에 대해 한 번** 부른다(후보 생성 콜과 합침 —
 * 비용은 그대로다). 재료는 issue-context 가 실측한 헤드라인·자동완성·연관어다.
 *
 * ## 환각 가드가 이 파일의 절반이다
 *
 * 에이전트는 헤드라인을 보고 이유를 쓰지만, 모르는 사실을 지어내기도 한다.
 * 화면에 나가는 "왜 뜨나"는 헤드라인이 뒷받침하는 문장만 남긴다:
 *  - 문장 안 숫자는 전부 헤드라인에 있어야 한다("3주 입원" 은 되고 "5주" 는 안 된다)
 *  - 이슈어가 아닌 어절 2개 이상이 헤드라인에 있어야 한다(조사 떼고 어간으로 본다)
 *  - 헤드라인이 0건이면 검증할 수 없으니 버린다
 * 떨어진 문장은 null 이다 — 규칙 문장으로 채우지 않는다(추정치 노출 금지와 같은 결).
 */

import { runClaude } from './agent-cli/claudeRunner';
import { runCodex } from './agent-cli/codexRunner';
import { runGemini } from './agent-cli/geminiRunner';
import { runGrok } from './agent-cli/grokRunner';
import { runWithAnyAgent, type AgentAttempt } from './agent-cli/runAny';
import { tryExtractJson } from './agent-cli/parse';
import { filterIssueKeywords, ISSUE_MEASURABLE_MAX_TOKENS, type IssueContext } from './issue-context';

export interface IssueNextWave {
  keyword: string;
  /** 에이전트가 댄 이유 — 화면엔 "예측" 으로 표시한다(실측 아님). */
  reason: string;
}

export interface IssueAnalysis {
  issue: string;
  /** 헤드라인이 뒷받침하는 한 줄. 검증에 떨어지면 null. */
  why: string | null;
  /** 같은 카테고리의 파생 후보(측정 대상). */
  cands: string[];
  /** 다음에 궁금해할 키워드 — 측정 대상이자 '선점' 제안. */
  nextWave: IssueNextWave[];
}

export type IssueAnalyzer = (contexts: readonly IssueContext[], perIssue: number) => Promise<Map<string, IssueAnalysis>>;

const WHY_MAX_CHARS = 140;
const REASON_MAX_CHARS = 80;
const NEXT_WAVE_MAX = 5;
const AGENT_TIMEOUT_MS = 180_000;
/** 이슈어만 되풀이하는 상투어 — 이 어절들은 근거로 세지 않는다. */
const FILLER_RE = /^(실검|실시간|검색어|검색|급증|급상승|상위|진입|화제|관심|이슈|논란|소식|때문|관련|검색량|몰린다|몰림)$/;

const AGENT_RUNNERS: readonly AgentAttempt[] = [
  { provider: 'claude', run: runClaude },
  { provider: 'codex', run: runCodex },
  { provider: 'gemini', run: runGemini },
  { provider: 'grok', run: runGrok },
];

function compactKey(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, '').toLowerCase();
}

function headlineBlob(context: IssueContext): string {
  return compactKey(context.headlines.map((h) => h.title).join(' '));
}

/**
 * 어절이 헤드라인에 있으면 맞은 어간을, 없으면 null. 조사·활용어미가 붙은 채로 오므로
 * ("뇌경색으로", "입원했다는") 앞에서부터 가장 길게 맞는 2자 이상 어간을 찾는다.
 */
function supportedStem(token: string, blob: string): string | null {
  const t = compactKey(token).replace(/[^\p{L}\p{N}]/gu, '');
  for (let len = t.length; len >= 2; len -= 1) {
    const stem = t.slice(0, len);
    if (blob.includes(stem)) return stem;
  }
  return null;
}

/**
 * "왜 뜨나" 한 줄을 헤드라인과 대조한다. 통과하면 다듬은 문장, 아니면 null.
 */
export function verifyWhy(why: string | null | undefined, context: IssueContext): string | null {
  const text = String(why ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > WHY_MAX_CHARS) return null;
  if (context.headlines.length === 0) return null;
  const blob = headlineBlob(context);

  const numbers = text.match(/\d[\d,.]*/g) ?? [];
  for (const raw of numbers) {
    const n = raw.replace(/[,.]/g, '');
    if (n && !blob.replace(/[,.]/g, '').includes(n)) return null;
  }

  const issueKey = compactKey(context.issue);
  const stems = new Set<string>();
  let beyondIssue = 0;
  for (const token of text.split(/\s+/)) {
    if (FILLER_RE.test(token)) continue;
    const stem = supportedStem(token, blob);
    if (!stem || stems.has(stem)) continue;
    stems.add(stem);
    if (!issueKey.includes(stem)) beyondIssue += 1;
  }
  if (stems.size < 2 || beyondIssue < 1) return null;
  return text;
}

function describeContext(context: IssueContext, index: number): string {
  const lines = [`${index + 1}. ${context.issue}`];
  if (context.headlines.length > 0) {
    lines.push('   헤드라인:');
    for (const h of context.headlines) lines.push(`   - ${h.title}${h.press ? ` (${h.press})` : ''}`);
  } else {
    lines.push('   헤드라인: (없음 — 이 이슈의 why 는 비워라)');
  }
  if (context.autocomplete.length > 0) lines.push(`   자동완성: ${context.autocomplete.join(', ')}`);
  if (context.related.length > 0) {
    lines.push(`   연관검색어(월 검색량): ${context.related.map((r) => `${r.keyword}(${r.monthlyVolume ?? '—'})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function buildIssueAnalysisPrompt(contexts: readonly IssueContext[], perIssue: number): string {
  return [
    '너는 네이버 블로그 키워드 전략가다. 실시간 이슈 각각에 대해 세 가지를 판단해라.',
    '',
    '(1) why — 왜 지금 뜨는가. 반드시 아래 헤드라인에 적힌 사실만으로 한 문장(60자 내). 헤드라인에 없는',
    '    숫자·인물·사건을 넣지 마라. 헤드라인이 없으면 빈 문자열로 둬라.',
    '(2) cands — 그 이슈 카테고리(연예/스포츠/정치/사건/정책/경제 등) 블로거가 실제 검색하는',
    `    "같은 카테고리"의 더 구체적이고 경쟁 낮은 하위 키워드. 이슈당 ${perIssue}개.`,
    '    도메인 점프 금지: 연예인 사망→사망원인·가족·재산·출연작·장례식장(O), 질병명/의학(X).',
    '(3) next — 지금 헤드라인 다음에 사람들이 궁금해할 키워드(다음 물결) 최대 5개와 그 이유(40자 내).',
    '    예: 입원 소식 → 복귀 시점 / 신제품 출시 → 사전예약·비교 / 판결 → 항소·형량.',
    '',
    '공통 규칙:',
    '- 상업 변형 금지: 추천·후기·최저가·렌탈·구매처·가격비교 같은 쇼핑 접미사 금지.',
    `- 길이 제한(필수): 각 키워드는 최대 ${ISSUE_MEASURABLE_MAX_TOKENS}어절. 4어절 이상은 검색량 실측이 불가해 버려진다.`,
    '  좋은 예: "이용주 사망원인", "박재홍 복귀", "해병대 신병 수료식"',
    '  나쁜 예: "이용주 사망 원인 심근비대증 여부", "해병대 2사단 신병 수료식 일정"',
    '- 자동완성·연관검색어는 사람들이 이미 치는 말이다. 겹치지 않는 새 각도를 우선해라.',
    '',
    '설명 없이 JSON 만 출력:',
    '{"items":[{"issue":"<원문>","why":"<한 문장>","cands":["..."],"next":[{"k":"<키워드>","why":"<이유>"}]}]}',
    '',
    contexts.map(describeContext).join('\n\n'),
  ].join('\n');
}

function matchContext(issue: string, contexts: readonly IssueContext[]): IssueContext | undefined {
  const key = compactKey(issue);
  if (!key) return undefined;
  return contexts.find((c) => c.issue === issue)
    ?? contexts.find((c) => compactKey(c.issue) === key)
    ?? contexts.find((c) => compactKey(c.issue).includes(key) || key.includes(compactKey(c.issue)));
}

function parseNextWave(raw: unknown, issue: string, exclude: readonly string[]): IssueNextWave[] {
  if (!Array.isArray(raw)) return [];
  const proposed = raw.map((item: any) => ({
    keyword: String(item?.k ?? item?.keyword ?? '').replace(/\s+/g, ' ').trim(),
    reason: String(item?.why ?? item?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX_CHARS),
  }));
  const allowed = new Set(filterIssueKeywords(proposed.map((p) => p.keyword), issue).map(compactKey));
  const excluded = new Set(exclude.map(compactKey));
  const seen = new Set<string>();
  const out: IssueNextWave[] = [];
  for (const p of proposed) {
    const key = compactKey(p.keyword);
    if (!allowed.has(key) || excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= NEXT_WAVE_MAX) break;
  }
  return out;
}

/**
 * 에이전트 답을 이슈별 분석으로 정제한다. 이슈 이름은 원문·압축·포함 순으로 맞춘다.
 * why 가 검증에 떨어져도 후보는 살린다 — 측정은 그것대로 가치가 있다.
 */
export function parseIssueAnalysisReply(
  reply: string,
  contexts: readonly IssueContext[],
  perIssue: number,
): Map<string, IssueAnalysis> {
  const out = new Map<string, IssueAnalysis>();
  const parsed: any = tryExtractJson(reply);
  const items: any[] = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
  for (const row of items) {
    const context = matchContext(String(row?.issue ?? '').trim(), contexts);
    if (!context || out.has(context.issue)) continue;
    const rawCands: string[] = Array.isArray(row?.cands) ? row.cands.map((s: unknown) => String(s ?? '')) : [];
    const cands = filterIssueKeywords(rawCands, context.issue, perIssue);
    out.set(context.issue, {
      issue: context.issue,
      why: verifyWhy(typeof row?.why === 'string' ? row.why : null, context),
      cands,
      nextWave: parseNextWave(row?.next, context.issue, []),
    });
  }
  return out;
}

/**
 * 구독 에이전트 한 번 — 전부 실패하면 빈 맵으로 물러선다(헌터는 자동완성·연관어만으로
 * 이어 간다). 실패 사유는 호출자가 로그로 남길 수 있게 onError 로 준다.
 */
export async function analyzeIssuesWith(
  runners: readonly AgentAttempt[],
  contexts: readonly IssueContext[],
  perIssue: number,
  options: { timeoutMs?: number; onError?: (message: string) => void } = {},
): Promise<Map<string, IssueAnalysis>> {
  if (contexts.length === 0) return new Map();
  const prompt = buildIssueAnalysisPrompt(contexts, perIssue);
  try {
    const run = await runWithAnyAgent(prompt, runners, { timeoutMs: options.timeoutMs ?? AGENT_TIMEOUT_MS });
    return parseIssueAnalysisReply(run.reply, contexts, perIssue);
  } catch (error) {
    options.onError?.(error instanceof Error ? error.message : String(error));
    return new Map();
  }
}

/**
 * 배치(CI)용 분석기 — 클로드 모델만 고정하고 나머지 폴백은 그대로다
 * (createAgentCandidateGenerator 와 같은 결정: 배치는 오푸스, 최상위 티어 한도는 사장님 자리에).
 */
export function createAgentIssueAnalyzer(
  options: { claudeModel?: string; onError?: (message: string) => void } = {},
): IssueAnalyzer {
  const runners: readonly AgentAttempt[] = options.claudeModel
    ? [
      { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: options.claudeModel }) },
      ...AGENT_RUNNERS.slice(1),
    ]
    : AGENT_RUNNERS;
  return (contexts, perIssue) => analyzeIssuesWith(runners, contexts, perIssue, { onError: options.onError });
}
