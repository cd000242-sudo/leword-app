/**
 * 브리핑 키워드 "검색량 이유" Manus 추론기 (서버, 발행 시점 배치).
 *
 * 왜 여기서:
 * - pro-web-site 의 사전(TARGET_NOUN_INTENTS)은 브리핑 95개 중 28% 만 잡는다.
 *   '원피스 이무 앵무새'(작품+캐릭터 밈)처럼 대상어가 뒤에 없는 형태는 실제 언어
 *   이해가 필요해 규칙으로는 한계다.
 * - 매 사용자 요청마다 LLM 을 부르면 비용이 쌓이므로, 관리자가 브리핑을 발행할 때
 *   한 번만 추론해 각 행에 searchReason 을 박아 둔다(하루 100개 × 1회).
 *
 * 폴백(사용자 요구):
 * - 키 없음 / 크레딧 없음(402·429) / 5xx / 타임아웃 → 그 행은 searchReason 없이
 *   그대로 저장한다. 그러면 브라우저의 agentInferredSearchReason 이 사전·규칙으로
 *   폴백한다(searchVolumeReason 이 있으면 우선, 없으면 사전). 즉 충전 전에는
 *   지금과 동일하게 동작하고, 충전하면 다음 발행부터 자동으로 추론이 붙는다.
 *
 * 결정론적 스코어링(검색량·문서수·기회지수·등급)은 절대 건드리지 않는다 — 문구만 만든다.
 */

const MANUS_API_BASE = 'https://api.manus.ai/v2';
const MANUS_AGENT_PROFILE = 'manus-1.6';
const CREATE_TIMEOUT_MS = 20_000;
const POLL_TIMEOUT_MS = 90_000; // 배치라 넉넉히. 그래도 못 받으면 폴백.
const POLL_INTERVAL_MS = 4_000;
const INITIAL_GRACE_MS = 3_000;
const MAX_REASON_LEN = 400;

export interface BriefingReasonRow {
  keyword: string;
  searchVolume?: number;
  documentCount?: number;
}

export interface BriefingReasonResult {
  /** keyword -> 추론된 검색 이유 문장. 폴백된 행은 여기에 없다. */
  reasons: Record<string, string>;
  /** 왜 추론이 안 됐는지(관리자 로그용). 'no-key' | 'no-credit' | 'error' | 'timeout' | 'ok' */
  status: 'ok' | 'partial' | 'no-key' | 'no-credit' | 'error' | 'timeout';
  detail?: string;
}

function apiKeyFromEnv(): string | null {
  const key = (process.env['MANUS_API_KEY'] || '').trim();
  return key || null;
}

function buildPrompt(rows: BriefingReasonRow[]): string {
  const list = rows
    .map((r, i) => `${i + 1}. ${r.keyword}`)
    .join('\n');
  return [
    '당신은 한국 블로그 키워드 분석가입니다. 아래는 오늘 급상승한 검색 키워드 목록입니다.',
    '각 키워드에 대해 "사람들이 이걸 왜 검색하는지"를 한 문장으로 추론해 주세요.',
    '',
    '규칙:',
    '- 키워드 뒤에 붙은 말, 인물·작품·사건의 맥락을 근거로 실제 의도를 추론하세요.',
    '  예: "원피스 이무 앵무새" → 원피스에서 이무가 앵무새라는 팬들 사이의 설을 확인하려는 검색.',
    '  예: "김나영 폭염 속 유럽 여행 사복 코디" → 김나영이 입은 옷이 어떤 제품이고 어디서 살 수 있는지 알고 싶은 검색.',
    '- "이 조합이 확인하려는 것을 담고 있어서" 같은 동어반복 금지. 무엇을 알고 싶은지 구체적으로.',
    '- 검색량·수익·트래픽 같은 추정 수치를 만들지 마세요. 검색 의도만 서술.',
    '- 각 문장은 한국어 1~2문장, 120자 이내.',
    '',
    '반드시 아래 JSON 형식으로만 답하세요(설명·마크다운 없이):',
    '{"reasons": [{"n": 1, "why": "..."}, {"n": 2, "why": "..."}]}',
    '',
    '키워드 목록:',
    list,
  ].join('\n');
}

async function createTask(apiKey: string, prompt: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CREATE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${MANUS_API_BASE}/task.create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manus-api-key': apiKey },
      body: JSON.stringify({
        message: { content: [{ type: 'text', text: prompt }] },
        agent_profile: MANUS_AGENT_PROFILE,
      }),
      signal: ctrl.signal,
    });
    if (resp.status === 401 || resp.status === 403) {
      const e = new Error('manus-auth'); (e as any).code = 'no-key'; throw e;
    }
    if (resp.status === 402 || resp.status === 429) {
      const e = new Error('manus-credit'); (e as any).code = 'no-credit'; throw e;
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      const e = new Error(`manus-create-${resp.status}: ${txt.slice(0, 200)}`); (e as any).code = 'error'; throw e;
    }
    const data: any = await resp.json();
    const taskId = data?.task_id || data?.taskId || data?.id;
    if (!taskId) { const e = new Error('manus-no-taskid'); (e as any).code = 'error'; throw e; }
    return String(taskId);
  } finally {
    clearTimeout(timer);
  }
}

function collectAssistantText(node: any, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
  if (Array.isArray(node)) { for (const it of node) collectAssistantText(it, depth + 1, out); return out; }
  if (typeof node === 'object') {
    for (const k of ['content', 'text', 'message', 'output', 'answer', 'value', 'response', 'messages']) {
      if (k in node) collectAssistantText(node[k], depth + 1, out);
    }
  }
  return out;
}

async function pollTask(apiKey: string, taskId: string): Promise<string[]> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, INITIAL_GRACE_MS));
  let last: string[] = [];
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const url = `${MANUS_API_BASE}/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=20`;
    const resp = await fetch(url, { headers: { 'x-manus-api-key': apiKey } });
    if (resp.status === 404 && Date.now() - start < 30_000) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS)); continue;
    }
    if (resp.status === 402 || resp.status === 429) { const e = new Error('manus-credit'); (e as any).code = 'no-credit'; throw e; }
    if (!resp.ok) { await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS)); continue; }
    const data: any = await resp.json();
    const texts = collectAssistantText(data);
    if (texts.length) last = texts;
    // 완결 신호: JSON 블록이 보이면 종료
    if (texts.some((t) => /"reasons"\s*:/.test(t))) return texts;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return last;
}

function parseReasons(texts: string[], rows: BriefingReasonRow[]): Record<string, string> {
  const joined = texts.join('\n');
  const match = joined.match(/\{[\s\S]*"reasons"[\s\S]*\}/);
  if (!match) return {};
  let parsed: any;
  try { parsed = JSON.parse(match[0]); } catch { return {}; }
  const arr = Array.isArray(parsed?.reasons) ? parsed.reasons : [];
  const out: Record<string, string> = {};
  for (const item of arr) {
    const n = Number(item?.n);
    const why = String(item?.why || '').trim();
    if (!Number.isInteger(n) || n < 1 || n > rows.length || !why) continue;
    out[rows[n - 1].keyword] = why.slice(0, MAX_REASON_LEN);
  }
  return out;
}

/**
 * 브리핑 행들의 검색 이유를 Manus 로 추론한다. 실패·크레딧없음이면 빈 결과로 폴백.
 * 절대 throw 하지 않는다 — 발행을 막으면 안 되기 때문.
 */
export async function inferBriefingSearchReasons(rows: BriefingReasonRow[]): Promise<BriefingReasonResult> {
  const clean = rows.filter((r) => r && typeof r.keyword === 'string' && r.keyword.trim());
  if (!clean.length) return { reasons: {}, status: 'ok' };

  const apiKey = apiKeyFromEnv();
  if (!apiKey) return { reasons: {}, status: 'no-key' };

  try {
    const taskId = await createTask(apiKey, buildPrompt(clean));
    const texts = await pollTask(apiKey, taskId);
    const reasons = parseReasons(texts, clean);
    if (!Object.keys(reasons).length) return { reasons: {}, status: 'timeout', detail: 'no parseable reasons' };
    const status = Object.keys(reasons).length >= clean.length ? 'ok' : 'partial';
    return { reasons, status };
  } catch (error: any) {
    const code = error?.code;
    if (code === 'no-key' || code === 'no-credit') {
      return { reasons: {}, status: code, detail: error?.message };
    }
    return { reasons: {}, status: 'error', detail: String(error?.message || error).slice(0, 200) };
  }
}
