/**
 * 로컬 LLM 제목 작성기 — 규칙으로는 못 넘는 선을 넘되, 지어내는 건 막는다.
 *
 * 왜 필요한가:
 *   규칙 기반 제목은 "강채연 제주삼다수 선두 10억원 우승 경기 결과 정리" 처럼
 *   조각을 이어 붙인 티가 난다. 유형별 분기를 아무리 늘려도 "치지직 → 경기 결과"
 *   같은 오분류가 남는다. 같은 사실로 LLM 은
 *   "강채연, 제주삼다수 마스터스 2라운드 4언더파 68타 기록" 을 쓴다.
 *
 * 왜 로컬인가:
 *   배치가 사장님 PC 에서 도는 구조라 API 키도 월정액도 필요 없다.
 *   RTX 4060(8GB) 에서 7B 모델이 건당 2~3초. 하루 37건이면 2분이 안 걸린다.
 *
 * 환각을 어떻게 막는가:
 *   LLM 은 그럴듯한 거짓을 잘 만든다. 초보자는 그걸 사실로 믿고 글을 쓴다.
 *   그래서 LLM 은 "제안"만 하고 통과 여부는 코드가 정한다.
 *     - 입력은 기사에서 뽑은 사실 문장뿐. 그 밖의 지식을 쓰지 말라고 지시.
 *     - 출력에 나온 숫자가 원문에 없으면 기각하고 규칙 기반으로 되돌린다.
 *     - temperature 0 + 고정 seed. 같은 이슈는 언제 돌려도 같은 제목이어야
 *       사용자가 봤던 걸 다시 찾는다.
 *   기각은 손해가 아니다. 규칙 기반 폴백이 받아내므로 최악이라도 오늘 수준이다.
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
    if (n.length <= 1) return false;      // 한 자리는 우연 일치가 잦다
    return !source.includes(n);
  });
}

function buildPrompt(keyword: string, facts: string[]): string {
  return `아래는 뉴스 기사에서 그대로 가져온 사실이다.

${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

검색 키워드: ${keyword}

이 사실만 사용해서 네이버 블로그 글 제목 2개를 만들어라.
기사에 없는 정보·추측·과장·전망은 절대 넣지 마라. 단어를 줄여 쓰지 마라.

- 검색제목: 키워드가 앞에 오고 구체적 수치를 포함. 30자 내외
- 홈판제목: 궁금증을 자극하되 사실만. 30자 내외

아래 형식으로만 답하라. 설명 금지.
검색제목: <제목>
홈판제목: <제목>`;
}

function parseTitles(raw: string): { seoTitle: string; homeTitle: string } {
  const seo = raw.match(/검색제목\s*[:：]\s*(.+)/);
  const home = raw.match(/홈판제목\s*[:：]\s*(.+)/);
  const clean = (v?: string) => String(v || '').replace(/[<>"']/g, '').trim();
  return { seoTitle: clean(seo?.[1]), homeTitle: clean(home?.[1]) };
}

async function ollamaGenerate(prompt: string, opts: Required<Pick<LlmTitleOptions, 'endpoint' | 'model' | 'timeoutMs'>>): Promise<string> {
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

/**
 * 제목을 쓴다. 실패·기각이면 fallback 을 그대로 돌려준다.
 * Ollama 가 없어도 배치가 죽지 않아야 한다 — 없으면 조용히 규칙 기반으로 간다.
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

  let raw: string;
  try {
    raw = await generate(buildPrompt(keyword, facts));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fallback, source: 'fallback', rejectedReason: `unavailable:${message}` };
  }

  const { seoTitle, homeTitle } = parseTitles(raw);
  if (!seoTitle || !homeTitle) {
    return { ...fallback, source: 'fallback', rejectedReason: 'unparsable' };
  }
  if (seoTitle.length > 60 || homeTitle.length > 60) {
    return { ...fallback, source: 'fallback', rejectedReason: 'too_long' };
  }

  const unsupported = findUnsupportedNumbers(`${seoTitle} ${homeTitle}`, facts);
  if (unsupported.length > 0) {
    return { ...fallback, source: 'fallback', rejectedReason: `unsupported_numbers:${unsupported.join(',')}` };
  }

  return { seoTitle, homeTitle, source: 'llm' };
}
