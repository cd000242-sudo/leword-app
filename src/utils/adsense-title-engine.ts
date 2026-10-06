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
export const ADSENSE_TITLE_ASK = 26;
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

export interface AdsenseTitleResult { id: string; titles: string[]; rejected: Array<{ title: string; reasons: string[] }> }

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const FAKE_EXPERIENCE = /직접\s*(?:써|쓰|사용|신청|받|방문|겪|해)|써\s*봤|해\s*봤|받아\s*봤|신청해\s*봤|내돈내산|제가\s|저는\s|했더니|했어요|받았어요/;
const EXTRA_HYPE = /무조건|100\s*%|모르면\s*손해|꼭\s*보세요|필독|레전드/;

/** 표면 규칙 검사 — 빈 배열이면 통과. */
export function checkAdsenseTitle(title: string, card: AdsenseTitleCard): string[] {
  const value = text(title, 200);
  const reasons: string[] = [];
  const length = [...value].length;
  if (length < ADSENSE_TITLE_MIN_CHARS) reasons.push('TOO_SHORT');
  if (length > ADSENSE_TITLE_MAX_CHARS) reasons.push('TOO_LONG');
  // 대표 검색어(붙여 쓴 꼴)가 제목에 보여야 한다 — 띄어 쓴 꼴도 같은 말로 본다.
  if (!compactKey(value).includes(compactKey(card.query))) reasons.push('NO_ANCHOR');
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
    `- 소재마다 ${ADSENSE_TITLE_ASK}개. 서로 다른 각도(조건 · 금액 · 기간 · 방법 · 비교 · 주의점 · 대상)로.`,
    '- 대표 검색어를 제목 앞쪽에 그대로 넣는다(띄어쓰기는 자연스럽게 해도 된다).',
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
    lines.push('고수 제목(재료 · 베끼지 말 것):');
    for (const t of card.sourceTitles.slice(0, 6)) lines.push(`- ${t}`);
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
    const seen = new Set<string>();
    const titles: string[] = [];
    const rejected: AdsenseTitleResult['rejected'] = [];
    for (const title of offered) {
      const key = compactKey(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const reasons = checkAdsenseTitle(title, card);
      if (reasons.length) { rejected.push({ title, reasons }); continue; }
      if (titles.length < ADSENSE_TITLE_COUNT) titles.push(title);
    }
    if (titles.length) results.push({ id: card.id, titles, rejected });
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
