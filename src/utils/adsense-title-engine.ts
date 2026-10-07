/**
 * 애드센스 고수 벤치마크 소재 1개당 구글 · 다음 검색용 제목 20개 — 구독 CLI 가 짓고 표면 규칙이 거른다(2026-10-07).
 *
 * 홈판 제목(benchmark-title-engine)은 후킹 · 구어체 · 답 숨김이 교리다. 애드센스 글은 검색으로 들어오므로 반대다:
 * 대표 검색어(2단계 실측)를 앞에 두고, 검색자가 찾는 답(조건 · 금액 · 기간 · 방법)을 제목이 약속한다.
 * 길이는 고수 제목 실측 가운데 36자를 기준으로 22~45자. 재료는 그 소재의 고수 제목들뿐 — 재료 밖 숫자는 거짓이다.
 */
import { createDefaultAgentChain } from './agent-cli/defaultChain';
import { tryExtractJson } from './agent-cli/parse';
import { requireJsonArray } from './agent-cli/replyValidators';
import { runWithAnyAgent } from './agent-cli/runAny';
import { HYPE_WORDS_RE } from './homefeed/lexicon';
import { compactKey, jaccard, numberCore, numberTokens, titleTokens } from './homefeed/text';

export const ADSENSE_TITLE_COUNT = 20;
export const ADSENSE_TITLE_ASK = 30;
export const ADSENSE_TITLE_MIN_CHARS = 22;
export const ADSENSE_TITLE_MAX_CHARS = 45;
export const ADSENSE_TITLE_BATCH = 2;

export interface AdsenseTitleCard {
  id: string;
  /** 2단계 실측 대표 검색어 — 제목 앞자리에 둔다. */
  query: string;
  keyword: string;
  category: string;
  /** 고수 블로그들이 쓴 제목 — 재료이자 베끼기 검사 대상. */
  sourceTitles: string[];
}

export interface AdsenseTitleResult {
  id: string;
  titles: string[];
  /** titles 와 같은 순서 — 그 제목이 고수 제목보다 나은 점 한 줄. */
  edges: string[];
  /** 같은 채점표로 잰 가장 높은 고수 제목 점수 — 이걸 넘은 제목만 titles 에 남는다. */
  masterBest: number;
  rejected: Array<{ title: string; reasons: string[] }>;
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const FAKE_EXPERIENCE = /직접\s*(?:써|쓰|사용|신청|받|방문|겪|해)|써\s*봤|해\s*봤|받아\s*봤|신청해\s*봤|내돈내산|제가\s|저는\s|했더니|했어요|받았어요/;
const EXTRA_HYPE = /무조건|100\s*%|모르면\s*손해|꼭\s*보세요|필독|레전드/;

/*
 * 상위호환 채점(2026-10-07 사장님 "검색용 추천 제목은 고수들이 쓴 제목보다 훨씬 상위호환이어야").
 * 예전엔 표면 규칙만 걸러, 고수 제목을 다시 쓴 수준이었다(고수 "피보험단위기간 180일" → 우리 "금액 상하한액 비교").
 * 이제 고수 제목과 우리 제목을 같은 채점표로 재서, 가장 높은 고수 제목을 넘는 것만 남긴다.
 *   다루는 내용(검색자가 찾는 답의 종류) 1개당 2점 · 고수 글에 있는 확인된 숫자 2점 · 검색어가 앞 12자 안 1점(없으면 -3)
 *   · 길이 28~42자 1점 · 같은 뜻 말 겹침(실업급여 구직급여) -3.
 */
export const ADSENSE_FACETS: ReadonlyArray<{ key: string; label: string; re: RegExp }> = [
  { key: 'condition', label: '조건·자격', re: /조건|자격|대상|기준|요건|해당/ },
  { key: 'amount', label: '금액·계산', re: /금액|얼마|계산|상한|하한|지급액|비용|요금|\d+\s*만?\s*원|세액|수수료|보험료/ },
  { key: 'date', label: '기간·날짜', re: /기간|날짜|일정|언제|기한|마감|지급일|시기|\d+\s*월|\d+\s*일(?!정)/ },
  { key: 'how', label: '방법·절차', re: /방법|절차|신청|하는\s*법|순서|단계|조회|확인법|받는\s*법/ },
  { key: 'compare', label: '비교·차이', re: /차이|비교|vs|다른\s*점|유리/i },
  { key: 'docs', label: '서류·준비물', re: /서류|준비물|구비|증빙/ },
  { key: 'caution', label: '주의·불이익', re: /주의|불이익|탈락|감액|제외|거절|실수|놓치|환수|가산세|과태료|못\s*받/ },
  { key: 'change', label: '변경·개정', re: /개편|개정|변경|달라|인상|인하|신설|폐지/ },
  { key: 'case', label: '유형·사례', re: /유형|사례|경우|[가-힣]별(?=[\s,·]|$)|상황|직장인|프리랜서|개인사업자|법인|자영업/ },
];
const FACET_LABEL = new Map(ADSENSE_FACETS.map((f) => [f.key, f.label]));

/** 같은 뜻 말 — 제목에 둘 다 붙이면 어색하다(실업급여 구직급여). scripts/adsense-benchmarks-measure.cjs 의 SYNONYM_GROUPS 와 같은 목록(쌍둥이). */
export const SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['실업급여', '구직급여'], ['부가세', '부가가치세'], ['종소세', '종합소득세'], ['건보료', '건강보험료'],
  ['기초연금', '노령연금'], ['양도세', '양도소득세'], ['자동차세', '차량세'],
];

export function facetsOf(title: string): string[] {
  const value = String(title || '');
  return ADSENSE_FACETS.filter((f) => f.re.test(value)).map((f) => f.key);
}

function stackedGroup(value: string): ReadonlyArray<string> | null {
  const key = compactKey(value);
  return SYNONYM_GROUPS.find((group) => group.filter((word) => key.includes(compactKey(word))).length >= 2) || null;
}

/** 대표 검색어가 제목 어디(붙여 쓴 꼴 기준)에 있나 — 검색어가 같은 뜻 말 두 개를 붙인 꼴이면 한쪽만 있어도 인정. 없으면 -1. */
function anchorIndex(title: string, query: string): number {
  const key = compactKey(title);
  const at = key.indexOf(compactKey(query));
  if (at >= 0) return at;
  const group = stackedGroup(query);
  if (!group) return -1;
  const found = group.map((word) => key.indexOf(compactKey(word))).filter((i) => i >= 0);
  return found.length ? Math.min(...found) : -1;
}

function groundedNumbers(title: string, card: AdsenseTitleCard): string[] {
  const allowed = new Set([card.query, card.keyword, ...card.sourceTitles].flatMap((line) => numberTokens(line).map(numberCore)).filter(Boolean));
  return numberTokens(title).filter((token) => numberCore(token) && allowed.has(numberCore(token)));
}

export function scoreAdsenseTitle(title: string, card: AdsenseTitleCard): { score: number; facets: string[]; numbers: string[] } {
  const value = text(title, 200);
  const facets = facetsOf(value);
  const numbers = groundedNumbers(value, card);
  const at = anchorIndex(value, card.query);
  const length = [...value].length;
  let score = facets.length * 2;
  if (numbers.length) score += 2;
  score += at < 0 ? -3 : at <= 12 ? 1 : 0;
  if (length >= 28 && length <= 42) score += 1;
  if (stackedGroup(value)) score -= 3;
  return { score, facets, numbers };
}

export interface MasterBaseline { best: number; bestTitle: string; bestFacets: number; bestHasNumber: boolean; union: Set<string>; perTitle: Array<{ title: string; facets: string[] }> }

/** 고수 제목들의 기준선 — 가장 높은 점수 · 그 제목 · 고수 전체가 다룬 내용 · 제목별 다룬 내용. */
export function masterBaseline(card: AdsenseTitleCard): MasterBaseline {
  let best = Number.NEGATIVE_INFINITY;
  let bestTitle = '';
  let bestFacets = 0;
  let bestHasNumber = false;
  const union = new Set<string>();
  const perTitle = card.sourceTitles.map((title) => {
    const s = scoreAdsenseTitle(title, card);
    s.facets.forEach((f) => union.add(f));
    if (s.score > best) { best = s.score; bestTitle = title; bestFacets = s.facets.length; bestHasNumber = s.numbers.length > 0; }
    return { title, facets: s.facets };
  });
  return { best: Number.isFinite(best) ? best : 0, bestTitle, bestFacets, bestHasNumber, union, perTitle };
}

const facetLabels = (keys: string[]) => keys.map((k) => FACET_LABEL.get(k) || k);

function edgeOf(scored: { score: number; facets: string[]; numbers: string[] }, base: MasterBaseline, masters: number): string {
  const fresh = facetLabels(scored.facets.filter((f) => !base.union.has(f)));
  if (fresh.length) return '고수 ' + masters + '명이 안 다룬 \'' + fresh.join('\' · \'') + '\'까지';
  if (scored.facets.length > base.bestFacets) return '다루는 내용 고수 최고 ' + base.bestFacets + '가지 → ' + scored.facets.length + '가지';
  if (scored.numbers.length && !base.bestHasNumber) return '고수 글의 확인된 숫자(' + scored.numbers.join(' · ') + ')로 더 구체적';
  return '고수 최고 제목 점수 ' + base.best + ' → ' + scored.score;
}

/** 표면 규칙 검사 — 빈 배열이면 통과. */
export function checkAdsenseTitle(title: string, card: AdsenseTitleCard): string[] {
  const value = text(title, 200);
  const reasons: string[] = [];
  const length = [...value].length;
  if (length < ADSENSE_TITLE_MIN_CHARS) reasons.push('TOO_SHORT');
  if (length > ADSENSE_TITLE_MAX_CHARS) reasons.push('TOO_LONG');
  // 대표 검색어(붙여 쓴 꼴)가 제목에 보여야 한다 — 띄어 쓴 꼴도 같은 말로 본다.
  if (anchorIndex(value, card.query) < 0) reasons.push('NO_ANCHOR');
  // 개편 · 달라진 점 같은 변경 주장은 고수 제목 중 하나라도 변경을 말했을 때만 — 아니면 지어낸 사실이다(실주행 "2026 하한액 개편").
  if (facetsOf(value).includes('change') && !card.sourceTitles.some((s) => facetsOf(s).includes('change'))) reasons.push('UNSUPPORTED_CHANGE');
  const material = [card.query, card.keyword, ...card.sourceTitles];
  const hype = value.match(new RegExp(HYPE_WORDS_RE.source, 'gu')) || [];
  if (hype.some((word) => !material.some((line) => line.includes(word))) || EXTRA_HYPE.test(value)) reasons.push('HYPE_WORD');
  if (FAKE_EXPERIENCE.test(value)) reasons.push('FAKE_EXPERIENCE');
  const allowed = new Set(material.flatMap((line) => numberTokens(line).map(numberCore)).filter(Boolean));
  if (numberTokens(value).some((token) => numberCore(token) && !allowed.has(numberCore(token)))) reasons.push('UNSUPPORTED_NUMBER');
  const tokens = titleTokens(value);
  const overlap = Math.max(0, ...card.sourceTitles.map((s) => jaccard(tokens, titleTokens(s))).filter((n): n is number => n !== null));
  if (overlap >= 0.6) reasons.push('SOURCE_COPY');
  return reasons;
}

export function buildAdsenseTitlePrompt(cards: AdsenseTitleCard[]): string {
  const lines = [
    '너는 애드센스(구글 · 다음 검색 유입) 블로그 제목을 짓는 편집자다. 아래 소재마다 검색용 제목을 지어라.',
    '',
    '규칙:',
    `- 소재마다 ${ADSENSE_TITLE_ASK}개. 목표는 고수 제목의 상위호환이다 — 아래 "가장 높은 고수 제목"보다 검색자에게 더 많은 답을 약속해야 남는다.`,
    '- 제목 하나가 검색자가 찾는 답을 2가지 이상 약속한다(조건·자격 / 금액·계산 / 기간·날짜 / 방법·절차 / 비교·차이 / 서류·준비물 / 주의·불이익 / 변경·개정 / 유형·사례).',
    '- "아무도 안 다룬 내용"이 있으면 사실에 맞는 범위에서 적극적으로 넣는다 — 고수 여럿이 다룬 내용을 합치고 빈틈을 채우는 것이 상위호환이다.',
    '- 고수 제목에 있는 확인된 숫자(금액 · 날짜 · 기간)는 살려서 더 구체적으로 만든다.',
    '- 대표 검색어는 앞 12자 안에 넣되(띄어쓰기는 자연스럽게), 그 뒤 문장 구조는 제목마다 다르게 한다.',
    '- 같은 뜻 말을 겹쳐 쓰지 않는다(예: "실업급여 구직급여" 금지 — 하나만).',
    '- 개편 · 달라진 점 · 인상 같은 변경 주장은 고수 제목이 변경을 말했을 때만 쓴다. 근거 없는 변경 주장은 거짓이다.',
    `- 길이 ${ADSENSE_TITLE_MIN_CHARS}~${ADSENSE_TITLE_MAX_CHARS}자. 애드센스 고수 제목의 가운데 길이는 36자다.`,
    '- 검색자가 찾는 답을 제목이 약속한다(무엇을 알 수 있는지 분명히). 낚시 · 답 숨김 금지.',
    '- 숫자(금액 · 날짜 · 비율 · 횟수)는 아래 고수 제목에 있는 것만 쓴다. 없는 숫자를 지어내지 않는다.',
    '- 과장어(충격 · 대박 · 무조건 · 100% · 모르면 손해) 금지. 직접 해 봤다는 체험 지어내기 금지.',
    '- 고수 제목을 베끼지 않는다 — 사실만 가져오고 문장은 새로 짓는다.',
    '- 연도는 해가 바뀌면 달라지는 정보에만 붙인다. 괄호 부제는 조건 · 금액 · 날짜를 묶을 때만.',
    '',
    '출력: JSON 배열 하나만. 형식 [{"id":"소재id","titles":["제목", ...]}, ...]. 설명 문장 없이.',
    '',
  ];
  for (const card of cards) {
    lines.push(`## 소재 id=${card.id}`);
    lines.push(`대표 검색어: ${card.query}`);
    lines.push(`분야: ${card.category}`);
    const base = masterBaseline(card);
    const label = (keys: string[]) => (keys.length ? facetLabels(keys).join(' · ') : '없음');
    lines.push('고수 제목(재료 · 베끼지 말 것) [그 제목이 다룬 내용]:');
    for (const row of base.perTitle.slice(0, 6)) lines.push(`- ${row.title}  [${label(row.facets)}]`);
    lines.push(`아무도 안 다룬 내용: ${label(ADSENSE_FACETS.map((f) => f.key).filter((k) => !base.union.has(k)))}`);
    lines.push(`가장 높은 고수 제목(넘어야 할 기준): ${base.bestTitle}`);
    lines.push('');
  }
  return lines.join('\n');
}

function parseReply(reply: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const parsed = tryExtractJson(reply);
  if (!Array.isArray(parsed)) return out;
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const id = text((row as { id?: unknown }).id, 64);
    const titles = (row as { titles?: unknown }).titles;
    if (id && Array.isArray(titles)) out.set(id, titles.map((t) => text(t, 200)).filter(Boolean));
  }
  return out;
}

const runDefault = (prompt: string) => runWithAnyAgent(prompt, createDefaultAgentChain({ claudeModel: 'opus' }), { timeoutMs: 180_000, validate: requireJsonArray() });

export async function titlesForAdsenseCards(
  cards: AdsenseTitleCard[],
  runAgent: (prompt: string) => Promise<{ reply: string; provider: string }> = runDefault,
): Promise<{ provider: string; results: AdsenseTitleResult[] }> {
  const run = await runAgent(buildAdsenseTitlePrompt(cards));
  const parsed = parseReply(run.reply);
  const results: AdsenseTitleResult[] = [];
  for (const card of cards) {
    const offered = parsed.get(card.id);
    if (!offered) continue;
    const base = masterBaseline(card);
    const seen = new Set<string>();
    const passed: Array<{ title: string; score: number; edge: string }> = [];
    const rejected: AdsenseTitleResult['rejected'] = [];
    for (const title of offered) {
      const key = compactKey(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const reasons = checkAdsenseTitle(title, card);
      if (reasons.length) { rejected.push({ title, reasons }); continue; }
      const scored = scoreAdsenseTitle(title, card);
      if (scored.score <= base.best) { rejected.push({ title, reasons: ['NOT_BETTER'] }); continue; }
      passed.push({ title, score: scored.score, edge: edgeOf(scored, base, card.sourceTitles.length) });
    }
    const kept = passed.sort((a, b) => b.score - a.score).slice(0, ADSENSE_TITLE_COUNT);
    if (kept.length) results.push({ id: card.id, titles: kept.map((k) => k.title), edges: kept.map((k) => k.edge), masterBest: base.best, rejected });
  }
  return { provider: run.provider, results };
}

/** 판(adsense-benchmarks.json)에서 제목을 지을 카드 — 2단계 실측 대표 검색어가 있는 카드만. 판 순서(★ 먼저) 그대로. */
export function cardsFromAdsenseBoard(board: unknown): AdsenseTitleCard[] {
  const list = board && typeof board === 'object' && Array.isArray((board as { candidates?: unknown }).candidates) ? (board as { candidates: Array<Record<string, any>> }).candidates : [];
  const out: AdsenseTitleCard[] = [];
  for (const c of list) {
    const query = text(c?.metrics?.query, 40);
    const id = text(c?.id, 64);
    if (!id || !query) continue;
    out.push({ id, query, keyword: text(c.keyword, 60), category: text(c.category, 30), sourceTitles: (Array.isArray(c.sources) ? c.sources : []).map((s: any) => text(s?.title, 200)).filter(Boolean).slice(0, 6) });
  }
  return out;
}
