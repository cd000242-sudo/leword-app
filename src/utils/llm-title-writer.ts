/**
 * 로컬 LLM 제목 작성기 — SEO 모드와 홈판 모드를 따로 쓴다.
 *
 * 왜 두 모드인가:
 *   노리는 사람이 다르다. SEO 는 검색창에 키워드를 친 사람을 잡아야 하니
 *   키워드가 앞에서 겹치고 확인하려는 답이 제목에 보여야 한다. 홈판은 그냥
 *   훑어보던 사람을 멈춰 세워야 하니 "왜 지금 봐야 하는가" 가 앞선다.
 *   하나의 프롬프트로 두 개를 뽑으면 둘 다 어중간해진다.
 *
 * 왜 로컬인가:
 *   배치가 사장님 PC 에서 돌아 API 키도 월정액도 없다.
 *   RTX 4060(8GB) 에서 7B 모델이 호출당 2~3초.
 *
 * 과장은 어디까지 되는가:
 *   홈판은 표현을 세게 써도 된다. 다만 숫자·이름·소속·일정은 기사에 있는 것만
 *   쓴다. 어조를 세게 하는 건 과장이지만 사실을 바꾸면 그건 거짓이고,
 *   초보자는 그걸 그대로 믿고 글을 쓴다. 그래서 수치 검사는 두 모드 모두에 건다.
 *
 * 통과 여부는 코드가 정한다:
 *   - 출력의 숫자가 원문에 없으면 기각하고 규칙 기반으로 되돌린다
 *   - temperature 0 + 고정 seed. 같은 이슈는 언제 돌려도 같은 제목
 *   - Ollama 가 없거나 죽어도 배치는 안 죽는다 — 조용히 폴백
 */

const DEFAULT_ENDPOINT = process.env['LEWORD_OLLAMA_URL'] || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env['LEWORD_OLLAMA_MODEL'] || 'qwen2.5:7b';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface LlmTitleResult {
  seoTitle: string;
  homeTitle: string;
  /** llm = 모델 출력 채택, fallback = 기각되어 규칙 기반 사용 */
  source: 'llm' | 'fallback';
  /** 기각 사유. 운영 중 품질 추적용. */
  rejectedReason?: string;
}

export interface LlmTitleOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  /** 테스트용 주입. 실제로는 Ollama HTTP 호출. */
  generate?: (prompt: string) => Promise<string>;
}

/**
 * 한국어 수 표기를 아라비아 숫자로 바꾼다.
 * "1천8백원" 과 "1800원" 은 같은 값인데 문자열로는 안 겹쳐서,
 * 정규화하지 않으면 멀쩡한 출력이 환각으로 기각된다(실제로 그랬다).
 */
export function normalizeKoreanNumerals(text: string): string {
  return String(text || '')
    .replace(/(\d+)\s*천\s*(\d+)\s*백/g, (_m, a, b) => String(Number(a) * 1000 + Number(b) * 100))
    .replace(/(\d+)\s*천/g, (_m, a) => String(Number(a) * 1000))
    .replace(/(\d+)\s*백/g, (_m, a) => String(Number(a) * 100))
    .replace(/(\d+)\s*만/g, (_m, a) => String(Number(a) * 10000))
    .replace(/[,\s]/g, '');
}

/**
 * 출력에 원문에 없는 숫자가 섞였는지 본다.
 * 숫자는 거짓이 가장 잘 드러나는 자리이고 기계적으로 검사할 수 있다.
 */
export function findUnsupportedNumbers(output: string, sourceFacts: string[]): string[] {
  const source = normalizeKoreanNumerals(sourceFacts.join(' '));
  const candidate = normalizeKoreanNumerals(output);
  const numbers = [...candidate.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
  return [...new Set(numbers)].filter((n) => {
    if (n.length <= 1) return false; // 한 자리는 우연 일치가 잦다
    return !source.includes(n);
  });
}

const FACT_RULE = [
  '숫자·이름·소속·일정은 위 사실에 있는 것만 써라.',
  '없는 수치를 만들거나 바꾸면 안 된다.',
  '단어를 줄여 쓰지 마라(휘발유·경유를 "휘경유" 로 쓰지 마라).',
].join('\n');

function factBlock(facts: string[]): string {
  return facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
}

/** SEO 모드 — 검색창에 키워드를 친 사람을 잡는다. */
function buildSeoPrompt(keyword: string, facts: string[]): string {
  return [
    '너는 네이버 블로그 상위노출만으로 연 매출 10억을 만든 최고 전문가다.',
    '어떤 제목이 1페이지에 걸리고 어떤 제목이 묻히는지 수만 건으로 검증해 왔다.',
    '',
    '[기사에서 확인된 사실]',
    factBlock(facts),
    '',
    `[검색 키워드] ${keyword}`,
    '',
    '이 키워드로 검색하는 사람이 무엇을 확인하려는지 먼저 생각하고,',
    '그 답이 제목에서 바로 보이는 검색용 제목 1개를 써라.',
    '',
    '지켜라:',
    '- 검색 키워드를 제목 맨 앞에 그대로 넣는다',
    '- 기사에 있는 구체적 수치나 고유명사를 최소 하나 넣는다',
    '- 28~40자',
    '- 낚시성 표현·물음표·느낌표 금지. 정보로 승부한다',
    FACT_RULE,
    '',
    '제목만 한 줄로 답하라. 설명·따옴표·번호 금지.',
  ].join('\n');
}

/**
 * 홈판 모드 — 훑어보던 사람을 멈춰 세운다.
 * 표현은 세게 가되 사실은 그대로.
 */
function buildHomePrompt(keyword: string, facts: string[]): string {
  return [
    '너는 네이버 블로그 홈판에 수백 번 올라간 최고의 카피라이터다.',
    '스쳐 지나가는 손가락을 멈추게 하는 한 줄이 무엇인지 몸으로 안다.',
    '',
    '[기사에서 확인된 사실]',
    factBlock(facts),
    '',
    `[주제] ${keyword}`,
    '',
    '블로그 홈을 훑어보던 사람이 멈추고 누를 수밖에 없는 제목 1개를 써라.',
    '',
    '지켜라:',
    '- 무엇이 걸려 있는지, 왜 지금 봐야 하는지가 드러나게',
    '- 읽는 사람의 감정이나 겪었을 상황에 닿는 표현을 써도 좋다',
    '- 표현은 세게 써도 된다. 다만 사실 자체를 바꾸지는 마라',
    '- 20~38자',
    FACT_RULE,
    '',
    '제목만 한 줄로 답하라. 설명·따옴표·번호 금지.',
  ].join('\n');
}

/**
 * 모델이 말을 거는 문장. 제목이 아니다.
 * 이걸 안 거르면 "제목을 만들어 드리겠습니다" 가 그대로 블로그 제목이 된다.
 */
const CHATTER_RE = /(드리겠습니다|도와드릴|무엇을|다음과 같|알려주세요|입력해|죄송|어떤 내용|말씀해)/;

/** 모델이 앞뒤로 붙이는 군더더기를 걷고 제목 한 줄만 남긴다. */
export function cleanTitleLine(raw: string): string {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // 목록 기호만 걷는다. 숫자를 무조건 자르면 "41도 기록…" 이 "도 기록…" 이 되고
    // 그러면 환각 검사가 볼 숫자가 사라져 거짓 수치가 그대로 통과한다.
    .map((l) => l
      .replace(/^(제목|검색제목|홈판제목)\s*[:：]\s*/, '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .trim())
    .map((l) => l.replace(/^["'“”‘’<]+|["'“”‘’>]+$/g, '').trim())
    .filter((l) => l.length >= 6)
    .filter((l) => !CHATTER_RE.test(l));
  return lines[0] || '';
}

async function ollamaGenerate(
  prompt: string,
  opts: Required<Pick<LlmTitleOptions, 'endpoint' | 'model' | 'timeoutMs'>>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${opts.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        prompt,
        stream: false,
        options: { temperature: 0, seed: 42 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ollama_http_${res.status}`);
    const data = await res.json() as { response?: string };
    return String(data.response || '');
  } finally {
    clearTimeout(timer);
  }
}

/** 제목 하나를 쓰고 검증한다. 통과 못 하면 빈 문자열. */
/**
 * 한국어 제목으로 낼 수 없는 글자가 섞였는지.
 *
 * qwen2.5 는 중국 모델이라 한국어를 시켜도 한자와 잡토큰이 새어 나온다.
 * 실측에서 "결과 확인必备知识：", "입추도 막판 더위 bied" 가 나왔다.
 * 이런 게 그대로 블로그 제목이 되면 안 된다.
 * 영문 약어(EXBO, U17)는 정상이므로 한자만 막는다.
 */
export function hasForeignScript(title: string): boolean {
  return /[一-鿿぀-ヿ]/.test(title);
}

async function writeOne(
  prompt: string,
  facts: string[],
  maxLen: number,
  generate: (p: string) => Promise<string>,
): Promise<{ title: string; reason?: string }> {
  const title = cleanTitleLine(await generate(prompt));
  if (!title) return { title: '', reason: 'unparsable' };
  if (title.length > maxLen) return { title: '', reason: 'too_long' };
  if (hasForeignScript(title)) return { title: '', reason: 'foreign_script' };
  const unsupported = findUnsupportedNumbers(title, facts);
  if (unsupported.length > 0) return { title: '', reason: `unsupported_numbers:${unsupported.join(',')}` };
  return { title };
}

/**
 * 제목을 쓴다. 실패·기각이면 fallback 을 그대로 돌려준다.
 * 두 모드를 따로 호출한다 — 한 번에 뽑으면 둘 다 어중간해진다.
 */
export async function writeTitles(
  keyword: string,
  facts: string[],
  fallback: { seoTitle: string; homeTitle: string },
  options: LlmTitleOptions = {},
): Promise<LlmTitleResult> {
  if (facts.length === 0) return { ...fallback, source: 'fallback', rejectedReason: 'no_facts' };

  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const generate = options.generate || ((p: string) => ollamaGenerate(p, { endpoint, model, timeoutMs }));

  let seo: { title: string; reason?: string };
  let home: { title: string; reason?: string };
  try {
    seo = await writeOne(buildSeoPrompt(keyword, facts), facts, 45, generate);
    home = await writeOne(buildHomePrompt(keyword, facts), facts, 40, generate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fallback, source: 'fallback', rejectedReason: `unavailable:${message}` };
  }

  // 한쪽만 통과하면 통과분만 채택하고 나머지는 폴백으로 채운다.
  const seoTitle = seo.title || fallback.seoTitle;
  const homeTitle = home.title || fallback.homeTitle;
  if (!seo.title && !home.title) {
    return { seoTitle, homeTitle, source: 'fallback', rejectedReason: seo.reason || home.reason || 'rejected' };
  }
  const reason = [seo.reason, home.reason].filter(Boolean).join('|');
  return { seoTitle, homeTitle, source: 'llm', ...(reason ? { rejectedReason: reason } : {}) };
}
