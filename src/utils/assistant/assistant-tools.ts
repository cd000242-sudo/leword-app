/**
 * 비서 도구 루프의 순수 부분(2026-10-06) — 사장님 "AI비서는 에이전트로 움직이니까 … 내 블로그 주제로는 어떤 키워드가 있고
 * 현재 정면 빈자리나 검색량 문서량 등등 참고해서 … 너는 볼 수 있을 거 아냐".
 *
 * 왜 앱이 도구 루프를 돌리나: 구독 CLI 넷(클로드 · 코덱스 · agy · 그록)은 일부러 도구 · MCP 를 막아 두고 띄운다
 * (subscriptionEnv 격리 인자). 그 격리를 풀지 않고, 모델은 [도구] 블록으로 "이걸 재 달라"고만 말하고
 * 실측은 앱의 기존 함수(검색광고 · 오픈 API · 내 PC 크로미엄)가 한다. 엔진이 무엇이든 같은 방식으로 돈다.
 *
 * 여기에는 입출력이 없다 — 요청 읽기 · 상한 · 결과 문장 만들기만. 실행은 main/assistant-tool-runner.ts.
 */

export const ASSISTANT_TOOL_NAMES = ['my_blog', 'volume', 'docs', 'expand', 'seat', 'homefeed_now', 'title_guide', 'picks', 'briefs', 'news'] as const;
export type AssistantToolName = typeof ASSISTANT_TOOL_NAMES[number];

export interface ToolArgs { keywords?: string[]; seed?: string; category?: string }
export interface ToolCall { tool: AssistantToolName; args: ToolArgs }
export interface ToolResult { tool: string; ok: boolean; text: string }

/** 한 번에 받는 호출 수 · 키워드 수 · 질문 하나에 쓸 수 있는 양. */
export const TOOL_LIMITS = {
  callsPerRound: 4,
  keywordsPerCall: 20,
  /** 자리 실측은 키워드당 4~6초(내 PC 크로미엄, 직렬) — 질문 하나에 8개면 최악 약 50초. */
  seatPerQuestion: 15,
  volumePerQuestion: 40,
  docsPerQuestion: 40,
  resultChars: 2_400,
  totalChars: 8_000,
} as const;

/** 모델에게 보여 주는 도구 설명 — 이름 · 인자 · 무엇을 돌려주나. */
const TOOL_GUIDE: Readonly<Record<AssistantToolName, string>> = {
  my_blog: 'my_blog {} — 사용자 블로그를 앱이 잰 기록: 주제 낱말, 30위 안에 붙어 본 검색어와 순위 · 검색량, 내 크기(검색량 범위), 최근 글 제목, 오늘 쓸 글 후보. 안 쟀으면 "기록 없음".',
  volume: 'volume {"keywords":[…최대 20]} — 네이버 검색광고 월간 검색량(PC+모바일) 실측.',
  docs: 'docs {"keywords":[…최대 20]} — 네이버 블로그 문서 수(경쟁 글 수) 실측.',
  expand: 'expand {"seed":"씨앗 말"} — 그 말의 네이버 자동완성 + 검색광고 연관어(검색량 붙음). 새 키워드 후보를 찾을 때.',
  seat: `seat {"keywords":[…]} — 지금 네이버 블로그 탭 1페이지를 열어 잰 자리: 판정(열림 · 반열림 · 잠김 · 카드답), 같은 걸 정면으로 다룬 글 수, 몇 번째 자리가 비었나, 광고 수, AI 브리핑, 상위 제목. 느리다(키워드당 약 5초) — 질문 하나에 ${TOOL_LIMITS.seatPerQuestion}개까지, 검색량 · 문서수로 먼저 추린 뒤에만.`,
  homefeed_now: 'homefeed_now {} — 지금 홈판 흐름: 벤치마크 블로그 186곳의 48시간 소재 묶음(분야 · 채널 수 · 홈판 후킹 제목 초안)과, 앱이 잰 어제 실제 홈판 상위 글 제목.',
  title_guide: 'title_guide {} — 홈판 제목 규칙과 실제 홈판에 뜬 제목 본보기. 제목을 추천하기 전에 부른다.',
  news: 'news {"seed":"검색어"} — 네이버 뉴스 검색: 그 말이 든 최근 기사 제목·날짜·요약. 제목에 넣을 사실(가격 · 출시일 · 발표 내용)을 확인할 때 쓴다. 기사에 없는 사실은 없는 것이다.',
  picks: 'picks {"category":"자동차"} — 사이트 "오늘의 네이버 추천키워드": 블로그 주제별 키워드(검색량 · 문서수 · 황금비). category 는 주제명(예: 자동차 · 맛집 · IT·컴퓨터) 생략 가능, 생략하면 주제마다 상위 몇 개씩. 자리(첫 페이지)는 재지 않은 값이다.',
  briefs: 'briefs {"category":"자동차"} — 사이트 "오늘의 글감": 뉴스 사실로 만든 글감(지금 · 일정 전 · 상시), 검색량 · 문서수 · 자리 적합도. category 는 같은 주제명, 생략 가능.',
};

const MARK_RE = /^\s*\[도구\]\s*$/m;

function cleanKeyword(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
}

function cleanArgs(tool: AssistantToolName, raw: unknown): ToolArgs | null {
  const args = (raw && typeof raw === 'object' ? raw : {}) as { keywords?: unknown; seed?: unknown; category?: unknown };
  if (tool === 'volume' || tool === 'docs' || tool === 'seat') {
    if (!Array.isArray(args.keywords)) return null;
    const keywords = [...new Set(args.keywords.map(cleanKeyword).filter(Boolean))].slice(0, TOOL_LIMITS.keywordsPerCall);
    return keywords.length ? { keywords } : null;
  }
  if (tool === 'expand') {
    const seed = cleanKeyword(args.seed);
    return seed ? { seed } : null;
  }
  if (tool === 'news') {
    const seed = cleanKeyword(args.seed);
    return seed ? { seed } : null;
  }
  if (tool === 'picks' || tool === 'briefs') {
    const category = cleanKeyword(args.category);
    return category ? { category } : {};
  }
  return {};
}

/**
 * 모델 답 → 도구 요청. [도구] 줄이 없으면 null(최종 답). 있는데 못 읽으면 [] — 호출부가 "형식이 틀렸다"고 되돌려 준다.
 */
export function parseToolRequest(reply: string): ToolCall[] | null {
  const text = String(reply || '');
  const mark = text.match(MARK_RE);
  if (!mark || mark.index === undefined) return null;
  const body = text.slice(mark.index + mark[0].length).replace(/```(?:json)?/g, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(body.slice(start, end + 1)); } catch { return []; }
  const calls = (parsed as { calls?: unknown })?.calls;
  if (!Array.isArray(calls)) return [];
  const out: ToolCall[] = [];
  for (const call of calls) {
    const tool = (call as { tool?: unknown })?.tool;
    if (typeof tool !== 'string' || !(ASSISTANT_TOOL_NAMES as readonly string[]).includes(tool)) continue;
    const args = cleanArgs(tool as AssistantToolName, (call as { args?: unknown }).args);
    if (!args) continue;
    out.push({ tool: tool as AssistantToolName, args });
    if (out.length >= TOOL_LIMITS.callsPerRound) break;
  }
  return out;
}

/** 질문 하나 동안의 사용량 — 같은 말을 두 번 재지 않고, 느린 자리 실측을 묶는다. */
export function createToolBudget() {
  const caps: Record<string, number> = { seat: TOOL_LIMITS.seatPerQuestion, volume: TOOL_LIMITS.volumePerQuestion, docs: TOOL_LIMITS.docsPerQuestion };
  const seen = new Map<string, Set<string>>();
  return {
    take(tool: 'seat' | 'volume' | 'docs', keywords: readonly string[]): { allowed: string[]; dropped: string[] } {
      const done = seen.get(tool) ?? new Set<string>();
      seen.set(tool, done);
      const fresh = keywords.filter((k) => !done.has(k));
      const room = Math.max(0, caps[tool] - done.size);
      const allowed = fresh.slice(0, room);
      allowed.forEach((k) => done.add(k));
      return { allowed, dropped: fresh.slice(room) };
    },
  };
}

/** 도구 결과 → 다음 프롬프트에 붙일 글. 결과마다 · 전체 길이를 자른다. */
export function formatToolResults(results: readonly ToolResult[]): string {
  const blocks: string[] = [];
  let used = 0;
  for (const result of results) {
    const body = result.text.length > TOOL_LIMITS.resultChars ? `${result.text.slice(0, TOOL_LIMITS.resultChars)}\n…(뒤는 잘림)` : result.text;
    const block = result.ok ? `[${result.tool} 결과]\n${body}` : `[${result.tool} 실패] ${body}`;
    if (used + block.length > TOOL_LIMITS.totalChars) {
      blocks.push(`[${result.tool}] 결과가 길어 생략`);
      continue;
    }
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n\n');
}

/** 프롬프트의 도구 안내. roundsLeft 가 0 이면 도구를 막고 지금 가진 자료로 답하게 한다. */
export function toolGuideLines(roundsLeft: number): string[] {
  if (roundsLeft <= 0) {
    return ['[도구] 이제 더는 도구를 부를 수 없다 — 위 실측 결과만으로 답해라. 못 잰 것은 "이번 질문에서 잴 수 있는 횟수를 다 써서 못 쟀다"고 말하고, 그 키워드만 짚어 다시 물어 달라고 해라. 앱 · 연결 문제라고 말하지 마라.'];
  }
  return [
    '[도구 — 실측 데이터가 필요할 때]',
    '키워드를 찾거나 고르거나 제목을 추천할 땐 짐작하지 말고 먼저 재라. 재려면 답 대신 아래 형식만 출력한다(다른 말 없이):',
    '[도구]',
    '{"calls":[{"tool":"이름","args":{…}}]}',
    `한 번에 ${TOOL_LIMITS.callsPerRound}개까지 — 서로 기다릴 필요 없는 것은 한 번에 같이 불러 기회를 아껴라(예: my_blog 와 homefeed_now, volume 과 docs). 결과를 받으면 이어서 답하거나 또 부른다(남은 기회 ${roundsLeft}번). 데이터 없이 답할 수 있는 질문(사용법 등)은 바로 답한다.`,
    '쓸 수 있는 도구:',
    ...ASSISTANT_TOOL_NAMES.map((name) => `- ${TOOL_GUIDE[name]}`),
  ];
}
