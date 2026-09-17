/**
 * TITLE ENGINE — 내부 12개(AI) → 결정론 검사 + AI 자기 판정 → STOP · FLAT · OVER → 화면엔 STOP 상위 3 + 제목-이미지 조합.
 *
 * 홈판 제목 교리(기준어 + 서브 키워드 + 후킹 + 사람 냄새 · 쉼표 이분법 금지 · 답 숨김 · 구어체 · 상투구 금지)를 프롬프트와 검사 양쪽에 둔다.
 * 검사는 표면 규칙이다: 표본에 없는 숫자 · 과장어 = OVER, 상투구 · 쉼표 끊기 · 기사 제목 복사 · 기준어 없음 · 길이 초과 · 답 누설 = FLAT.
 * 프롬프트는 앱이 만든다 — 브리지는 스토리 id 만 받는다.
 */
import { TITLE_CLICHES } from '../title-forge/forge';
import { CATEGORY_LABEL } from './category';
import { HYPE_WORDS_RE } from './lexicon';
import type {
  HomefeedStory,
  HomefeedTitleCandidate,
  HomefeedTitleVerdict,
  HomefeedTitleVisualPair,
  HomefeedTriggerType,
} from './types';
import { clip, compactKey, jaccard, numberCore, numberTokens, shortHash, titleTokens } from './text';

export const TITLE_MAX_CHARS = 38;
export const TITLE_TRIGGERS: readonly HomefeedTriggerType[] = [
  'direct_quote', 'number_conflict', 'relation_shift', 'expectation_break', 'result_first', 'identity_hide', 'object_price', 'before_after',
];

const TENSION_LABEL: Record<string, string> = {
  number_conflict: '숫자 충돌', relationship_shift: '관계 변화', expectation_break: '예상 밖', action_reversal: '번복',
  identity_contrast: '정체 대비', past_vs_now: '과거와 지금', result_first: '결과 먼저', scale_mismatch: '규모 불일치', hidden_reason: '숨은 이유',
  rival_compare: '맞수 비교',
};

export interface TitleMaterials {
  keyword: string;
  anchor: string;
  categoryLabel: string;
  delta: string | null;
  tensions: string[];
  alternativeAngles: string[];
  funGap: string[];
  payoff: string[];
  sampleTitles: string[];
  strategy: string;
  thumbnailCopy: string[];
}

export function titleMaterialsOf(story: HomefeedStory): TitleMaterials {
  return {
    keyword: story.keyword,
    anchor: story.anchor.text,
    categoryLabel: CATEGORY_LABEL[story.category],
    delta: story.delta ? story.delta.text : null,
    tensions: story.tensions.map((tension) => `[${TENSION_LABEL[tension.type] ?? tension.type}] "${tension.matched}"`),
    alternativeAngles: story.alternativeAngles.map((angle) => angle.label),
    funGap: story.funGap.map((reason) => reason.note),
    payoff: story.payoffLayers.map((layer) => layer.value),
    sampleTitles: story.evidence.slice(0, 8).map((item) => item.title),
    strategy: story.visual.strategy,
    thumbnailCopy: story.thumbnail.copyVariants,
  };
}

const list = (rows: readonly string[]) => (rows.length > 0 ? rows.map((row) => `- ${row}`).join('\n') : '- (없음)');

export function buildTitlePrompt(m: TitleMaterials): string {
  return [
    '너는 네이버 블로그 홈판(피드)에 올릴 글의 제목을 쓰는 사람이다.',
    '아래 재료(실제 기사 제목에서 뽑은 사실)만으로 제목 후보 12개를 만들어라.',
    '',
    `이슈 검색어: ${m.keyword}`,
    `기준어: ${m.anchor}`,
    `카테고리: ${m.categoryLabel}`,
    `새로 나온 사실: ${m.delta ?? '(아직 없음)'}`,
    '긴장:', list(m.tensions),
    '다른 각도:', list(m.alternativeAngles),
    '재미 근거:', list(m.funGap),
    '본문에서 풀 정보(제목에 다 쓰지 말 것):', list(m.payoff),
    '표본 기사 제목(참고용 — 그대로 옮기거나 조금 바꾸면 실패):',
    m.sampleTitles.map((title, index) => `${index + 1}. ${title}`).join('\n') || '(없음)',
    `대표이미지 전략: ${m.strategy}`,
    '',
    '규칙 — 하나라도 어기면 실패다:',
    '- 공식: ① 기준어(제목만 봐도 무슨 이야기인지) ② 서브 키워드 하나(상황 · 대상 · 조건) ③ 멈추게 하는 후킹 ④ 사람 냄새(~네요 · ~더라고요 · ~었대요).',
    '- 기준어는 문장 속에 녹여라. 쉼표로 끊어 앞에 붙이면 실패다.',
    '- 답은 숨긴다: 본문에서 풀 정보의 결론을 제목에 다 쓰지 마라.',
    '- 재료에 없는 숫자 · 사실 · 인물 · 주장을 지어내지 마라. 과장어(충격 · 경악 · 발칵 · 역대급 · 전말 · 소름 · 폭로) 금지.',
    '- 기사 제목을 조금 바꾼 제목 금지 — 표본 제목과 어휘 · 말 순서가 비슷하면 실패다.',
    '- 라벨형 금지(총정리 · 핵심 정리 · 알아보기 · 한눈에 · 완벽 가이드).',
    `- ${TITLE_MAX_CHARS}자 이내. 첫 10~15자 안에 걸리는 말(새 사실 · 긴장 말)이 오게.`,
    '',
    '후보마다 적을 것: first_hook(첫 10~15자 걸림 말), second_hook(뒤에서 한 번 더 당기는 말),',
    `trigger_type(${TITLE_TRIGGERS.join(' · ')} 중 하나), self_check(STOP=멈추게 함 · FLAT=밋밋함 · OVER=과장/사실 넘침 중 스스로 판정),`,
    'visual(real · ai · hybrid 중 어울리는 대표이미지), thumb_copy(썸네일 문구 7~12자 — 제목과 다른 말로).',
    '',
    'JSON 하나만 출력: {"titles":[{"title":"...","first_hook":"...","second_hook":"...","trigger_type":"...","self_check":"STOP","visual":"real","thumb_copy":"..."}]}',
  ].join('\n');
}

export interface RawTitleCandidate {
  title: string;
  firstHook: string;
  secondHook: string;
  triggerType: HomefeedTriggerType | null;
  selfCheck: HomefeedTitleVerdict | null;
  visual: 'real' | 'ai' | 'hybrid' | null;
  thumbCopy: string | null;
}

/** 모델 답에서 후보를 꺼낸다. 못 읽으면 빈 배열 — 지어내지 않는다. */
export function parseTitleCandidates(reply: string): RawTitleCandidate[] {
  const match = String(reply || '').match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  const rows = (parsed as { titles?: unknown })?.titles;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: RawTitleCandidate[] = [];
  for (const raw of rows) {
    const row = (raw || {}) as Record<string, unknown>;
    const title = String(row.title || '').replace(/\s+/g, ' ').trim();
    const key = compactKey(title);
    if (title.length < 4 || title.length > 80 || seen.has(key)) continue;
    seen.add(key);
    const trigger = TITLE_TRIGGERS.find((value) => value === row.trigger_type) ?? null;
    const self = (['STOP', 'FLAT', 'OVER'] as const).find((value) => value === String(row.self_check || '').toUpperCase()) ?? null;
    const visual = (['real', 'ai', 'hybrid'] as const).find((value) => value === String(row.visual || '').toLowerCase()) ?? null;
    out.push({
      title,
      firstHook: clip(row.first_hook, 30),
      secondHook: clip(row.second_hook, 30),
      triggerType: trigger,
      selfCheck: self,
      visual,
      thumbCopy: row.thumb_copy ? clip(row.thumb_copy, 16) : null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export interface TitleCheckContext {
  anchor: string;
  sampleTitles: readonly string[];
  /** 제목에 써도 되는 숫자의 출처(표본 제목 · 정보층 · 새 사실). */
  factText: readonly string[];
  payoffValues: readonly string[];
}

export function titleCheckContextOf(story: HomefeedStory): TitleCheckContext {
  return {
    anchor: story.anchor.text,
    sampleTitles: story.evidence.map((item) => item.title),
    factText: [...story.evidence.map((item) => item.title), ...story.payoffLayers.map((layer) => layer.value), story.delta?.text ?? '', story.keyword],
    payoffValues: story.payoffLayers.map((layer) => layer.value),
  };
}

const RANK: Record<HomefeedTitleVerdict, number> = { STOP: 0, FLAT: 1, OVER: 2 };

export function classifyTitle(raw: RawTitleCandidate, ctx: TitleCheckContext): HomefeedTitleCandidate {
  const title = raw.title;
  const allowedNumbers = new Set(ctx.factText.flatMap((text) => numberTokens(text).map(numberCore)).filter(Boolean));
  const unsupportedNumbers = numberTokens(title).filter((token) => numberCore(token) && !allowedNumbers.has(numberCore(token)));
  const hypeWords = [...new Set(title.match(new RegExp(HYPE_WORDS_RE.source, 'gu')) || [])];
  const tokens = titleTokens(title);
  const overlaps = ctx.sampleTitles.map((sample) => jaccard(tokens, titleTokens(sample))).filter((value): value is number => value !== null);
  const overlapWithSample = overlaps.length > 0 ? Math.round(Math.max(...overlaps) * 100) / 100 : null;

  const reasons: string[] = [];
  if (unsupportedNumbers.length > 0) reasons.push('UNSUPPORTED_NUMBER');
  if (hypeWords.length > 0) reasons.push('HYPE_WORD');
  const over = reasons.length > 0;
  if (TITLE_CLICHES.test(title)) reasons.push('CLICHE');
  if (/^[^,，]{1,20}[,，]\s*\S/u.test(title)) reasons.push('COMMA_SPLIT');
  if (overlapWithSample !== null && overlapWithSample >= 0.5) reasons.push('ARTICLE_COPY');
  if (ctx.anchor && !compactKey(title).includes(compactKey(ctx.anchor))) reasons.push('NO_ANCHOR');
  if (title.length > TITLE_MAX_CHARS) reasons.push('TOO_LONG');
  if (ctx.payoffValues.length >= 2 && ctx.payoffValues.every((value) => title.includes(value))) reasons.push('ANSWER_LEAK');
  if (!raw.firstHook) reasons.push('NO_HOOK');

  let verdict: HomefeedTitleVerdict = over ? 'OVER' : reasons.length > 0 ? 'FLAT' : 'STOP';
  if (raw.selfCheck && RANK[raw.selfCheck] > RANK[verdict]) {
    verdict = raw.selfCheck;
    reasons.push(`AI_SELF_${raw.selfCheck}`);
  }
  return {
    id: `t-${shortHash(title, 10)}`,
    title,
    firstHook: raw.firstHook,
    secondHook: raw.secondHook,
    triggerType: raw.triggerType,
    verdict,
    reasons,
    aiVerdict: raw.selfCheck,
    overlapWithSample,
    overclaim: { unsupportedNumbers, hypeWords },
    bestVisualPair: raw.visual,
    thumbCopy: raw.thumbCopy,
  };
}

/** STOP 상위 n — 트리거 유형이 겹치지 않게 먼저 고르고 남은 자리를 채운다. */
export function pickTopStops(candidates: readonly HomefeedTitleCandidate[], n = 3): HomefeedTitleCandidate[] {
  const stops = candidates.filter((candidate) => candidate.verdict === 'STOP');
  const picked: HomefeedTitleCandidate[] = [];
  const triggers = new Set<string>();
  for (const candidate of stops) {
    if (picked.length >= n) break;
    const trigger = candidate.triggerType ?? 'none';
    if (triggers.has(trigger)) continue;
    triggers.add(trigger);
    picked.push(candidate);
  }
  for (const candidate of stops) {
    if (picked.length >= n) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

/** 제목-이미지 조합 — 제목은 상황, 썸네일 문구는 충돌만. 제목과 겹치는 문구는 뺀다. */
export function buildTitleVisualPairs(story: HomefeedStory, tops: readonly HomefeedTitleCandidate[], maxChars: number): HomefeedTitleVisualPair[] {
  return tops.map((candidate) => {
    const titleTok = titleTokens(candidate.title);
    const copy = [candidate.thumbCopy, ...story.thumbnail.copyVariants]
      .filter((line): line is string => Boolean(line && line.trim()))
      .map((line) => clip(line, maxChars))
      .filter((line, index, all) => all.indexOf(line) === index)
      .filter((line) => !candidate.title.includes(line) && (jaccard(titleTokens(line), titleTok) ?? 0) < 0.34)
      .slice(0, 2);
    const hero = candidate.bestVisualPair === 'ai'
      ? { kind: 'ai' as const, guideId: 'ai-hero', imageUrl: null }
      : story.thumbnail.heroImage;
    return {
      id: `p-${shortHash(`${candidate.id}:${copy.join('|')}`, 10)}`,
      titleId: candidate.id,
      title: candidate.title,
      visualStrategy: candidate.bestVisualPair === 'ai' ? 'AI-FIRST' : story.visual.strategy,
      heroImage: hero,
      thumbnailCopy: copy,
      why: copy.length > 0
        ? `제목은 상황("${story.anchor.text}")을, 썸네일은 "${copy[0]}"만 — 같은 말을 두 번 쓰지 않는다`
        : '제목과 겹치지 않는 문구가 없어 썸네일은 장면만 쓴다',
    };
  });
}
