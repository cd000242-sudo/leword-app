/**
 * 스토리 6요소 · NO-SEARCH · TELLABILITY · FIRST CARD — 규칙 판정.
 *
 *   1 KNOWN ANCHOR   이슈 개체 + 카테고리(사전)
 *   2 FRESH DELTA    30분 전 회차 표본에 없던 사실 말(숫자 · 인용 · 사건 말 · 두 제목 이상이 새로 쓴 말)
 *   3 TENSION        제목 표면 규칙 + 근거 제목
 *   4 ANGLE GAP      clusters.anglesOf
 *   5 FUN GAP        긴장 · 인용 · 장면 근거 플래그(근거 없는 플래그 금지)
 *   6 PAYOFF DEPTH   정보층(clusters.revealLayersOf)
 *
 * 카드 문구는 문장을 지어내지 않는다 — 근거 제목에 실제로 있는 말 조각(기준어 · 새 사실 말 · 긴장 말)만 잇는다.
 * 기사 제목을 살짝 바꿔 제목처럼 내놓지 않기 위해서다. 제목 문장은 [제목 만들기](AI + 검사)에서만 나온다.
 */
import { issueEntity } from '../issue-context';
import type {
  HomefeedCardVariant,
  HomefeedCategory,
  HomefeedCheck,
  HomefeedDelta,
  HomefeedFirstCard,
  HomefeedFunGapFlag,
  HomefeedFunGapReason,
  HomefeedImageRef,
  HomefeedIssueSnapshot,
  HomefeedNoSearch,
  HomefeedRevealLayer,
  HomefeedSample,
  HomefeedSignals,
  HomefeedTellability,
  HomefeedTension,
  HomefeedTensionType,
  HomefeedVisualDecision,
} from './types';
import type { HomefeedSettings } from './settings';
import {
  BIG_MONEY_RE, CONFIRM_RE, EVENT_FACT_RE, FAN_ONLY_RE, NUMBER_CONTRAST_RE, OBJECT_WORDS_RE, PRICED_OBJECT_RE, RUMOR_RE, TENSION_RULES, VISUAL_CUE_RE,
} from './lexicon';
import { evidenceOf } from './clusters';
import { clip, compactKey, normalizeTitle, numberTokens, quoteSpans, surfaceToken, titleTokens, withoutTokens } from './text';

/**
 * 이 말 하나로는 무슨 이야기인지 알 수 없는 앞어절 — 지역 · 나라 이름은 범위가 너무 넓다.
 * 실측(2026-09-16): '서울 시내버스 협상 타결'의 기준어가 '서울'로 잡혀 카드 문구가 "서울 철회"가 됐다.
 */
const BROAD_ANCHORS: ReadonlySet<string> = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국',
  '정부', '국회', '미국', '중국', '일본', '러시아', '유럽', '대만', '조지아', '베트남', '태국', '인도', '호주', '캐나다', '독일', '프랑스', '영국',
  '이란', '이스라엘', '우크라이나', '북한',
]);

export function anchorOf(keyword: string, category: HomefeedCategory): { text: string; category: HomefeedCategory } {
  const tokens = String(keyword || '').trim().split(/\s+/).filter(Boolean);
  const entity = (issueEntity(keyword) || keyword).trim();
  // 넓은 말 하나만 남으면 두 어절까지 넓힌다 — 카드 문구가 '서울 철회' 같은 말이 되지 않게.
  const text = BROAD_ANCHORS.has(entity) && tokens.length >= 2 ? tokens.slice(0, 2).join(' ') : entity;
  return { text, category };
}

/** 날짜 · 연도처럼 긴장이 아닌 숫자는 뺀다. */
function meaningfulNumbers(title: string): string[] {
  const hasDate = /\d{1,2}\s?월\s?\d{1,2}\s?일/u.test(title);
  return numberTokens(title).filter((token) => {
    if (/^\d{4}년?$/u.test(token)) return false;
    if (hasDate && /^\d{1,2}일$/u.test(token)) return false;
    return /\D/.test(token.replace(/[.,]/g, '')) || token.replace(/[.,]/g, '').length >= 2;
  });
}

export function detectTensions(samples: readonly HomefeedSample[], maxPerType = 2): HomefeedTension[] {
  const out: HomefeedTension[] = [];
  const seen = new Set<string>();
  const perType = new Map<HomefeedTensionType, number>();
  const add = (type: HomefeedTensionType, matched: string, sample: HomefeedSample) => {
    const key = `${type}:${compactKey(matched)}`;
    if (!matched || seen.has(key) || (perType.get(type) ?? 0) >= maxPerType) return;
    seen.add(key);
    perType.set(type, (perType.get(type) ?? 0) + 1);
    out.push({ type, matched, evidence: evidenceOf(sample) });
  };
  for (const sample of samples) {
    const title = normalizeTitle(sample.title);
    const numbers = meaningfulNumbers(title);
    if (numbers.length >= 2) add('number_conflict', numbers.slice(0, 2).join(' · '), sample);
    else if (numbers.length === 1 && NUMBER_CONTRAST_RE.test(title)) add('number_conflict', `${numbers[0]} ${(title.match(NUMBER_CONTRAST_RE) || [''])[0]}`.trim(), sample);
    const priced = title.match(PRICED_OBJECT_RE);
    const object = title.match(OBJECT_WORDS_RE);
    if (priced) add('scale_mismatch', priced[0], sample);
    else if (BIG_MONEY_RE.test(title) && object) add('scale_mismatch', `${(title.match(BIG_MONEY_RE) || [''])[0]} ${object[0]}`, sample);
    for (const rule of TENSION_RULES) {
      const match = title.match(rule.re);
      if (match) add(rule.type, match[0], sample);
    }
  }
  return out.slice(0, 12);
}

const eventRe = () => new RegExp(EVENT_FACT_RE.source, 'u');

/**
 * FRESH DELTA — baseline(보통 30분 이상 앞선 회차) 표본에 없던 사실 말. 이력이 없으면 null(NO_HISTORY).
 * 이미 봤던 기사 주소는 새 사실로 치지 않는다.
 */
export function freshDeltaOf(
  latest: HomefeedIssueSnapshot,
  baseline: { capturedAt: string; issue: HomefeedIssueSnapshot } | null,
): { delta: HomefeedDelta | null; reason: string | null } {
  if (!baseline) return { delta: null, reason: 'NO_HISTORY' };
  const anchor = titleTokens(latest.keyword);
  const previousTokens = new Set(baseline.issue.samples.flatMap((sample) => [...titleTokens(sample.title)]));
  const previousUrls = new Set(baseline.issue.samples.map((sample) => sample.url));
  const frequency = new Map<string, number>();
  for (const sample of latest.samples) for (const token of titleTokens(sample.title)) frequency.set(token, (frequency.get(token) ?? 0) + 1);

  let best: { sample: HomefeedSample; fresh: string[] } | null = null;
  for (const sample of latest.samples) {
    if (previousUrls.has(sample.url)) continue;
    const quotes = quoteSpans(sample.title).map((quote) => quote.toLowerCase());
    const fresh = [...withoutTokens(titleTokens(sample.title), anchor)]
      .filter((token) => !previousTokens.has(token))
      .filter((token) => /\d/.test(token) || eventRe().test(token) || TENSION_RULES.some((rule) => rule.re.test(token))
        || quotes.some((quote) => quote.includes(token)) || (frequency.get(token) ?? 0) >= 2);
    if (fresh.length === 0) continue;
    const newer = best && Date.parse(sample.publishedAt || '') > Date.parse(best.sample.publishedAt || '');
    if (!best || fresh.length > best.fresh.length || (fresh.length === best.fresh.length && newer)) best = { sample, fresh };
  }
  if (!best) return { delta: null, reason: 'NO_NEW_FACT' };
  const sourceTitle = best.sample.title;
  const surface = best.fresh.map((token) => surfaceToken(token, [sourceTitle]));
  return {
    delta: {
      text: surface.slice(0, 4).join(' '),
      newTokens: surface.slice(0, 6),
      evidence: evidenceOf(best.sample),
      comparedWith: baseline.capturedAt,
    },
    reason: null,
  };
}

const FLAG_NOTE: Record<HomefeedFunGapFlag, string> = {
  unexpected_fact: '예상과 다른 사실(반전 · 번복)이 제목에 있다',
  surprising_number: '숫자끼리 부딪히거나 숫자가 크다',
  relationship_change: '관계가 바뀌었다(결혼 · 결별 · 합류 등)',
  strong_quote: '따옴표 인용이 있다',
  visible_contrast: '과거와 지금 · 정체가 대비된다',
  before_after: '전후가 달라졌다',
  unusual_object_price: '일상 물건에 큰 돈이 붙었다',
  outcome_mismatch: '결과부터 나온다(결국 · 끝내)',
  socially_tellable: '한 줄로 남에게 전할 수 있다',
  visual_curiosity: '사진이 궁금증을 키우는 장면이다',
};

const TENSION_FLAGS: Partial<Record<HomefeedTensionType, HomefeedFunGapFlag[]>> = {
  expectation_break: ['unexpected_fact'],
  action_reversal: ['unexpected_fact'],
  number_conflict: ['surprising_number'],
  scale_mismatch: ['surprising_number', 'unusual_object_price'],
  relationship_shift: ['relationship_change'],
  identity_contrast: ['visible_contrast'],
  past_vs_now: ['visible_contrast'],
  result_first: ['outcome_mismatch'],
};

export function funGapOf(
  tensions: readonly HomefeedTension[],
  samples: readonly HomefeedSample[],
  signals: Pick<HomefeedSignals, 'visualCandidateCount'>,
  tellability: HomefeedTellability,
): HomefeedFunGapReason[] {
  const out = new Map<HomefeedFunGapFlag, HomefeedFunGapReason>();
  const add = (flag: HomefeedFunGapFlag, evidence: HomefeedFunGapReason['evidence'], note = FLAG_NOTE[flag]) => {
    if (!out.has(flag)) out.set(flag, { flag, note, evidence });
  };
  for (const tension of tensions) {
    for (const flag of TENSION_FLAGS[tension.type] ?? []) add(flag, tension.evidence, `${FLAG_NOTE[flag]} — "${tension.matched}"`);
    if (tension.type === 'past_vs_now' && (/(달라진|변신)/u.test(tension.matched) || numberTokens(tension.evidence.title).length > 0)) {
      add('before_after', tension.evidence, `${FLAG_NOTE.before_after} — "${tension.matched}"`);
    }
  }
  const quoted = samples.find((sample) => quoteSpans(sample.title).some((quote) => quote.length >= 4));
  if (quoted) add('strong_quote', evidenceOf(quoted), `${FLAG_NOTE.strong_quote} — "${quoteSpans(quoted.title).find((quote) => quote.length >= 4)}"`);
  if (tellability.passed && tellability.evidence) add('socially_tellable', tellability.evidence);
  if (signals.visualCandidateCount >= 1) {
    const scene = samples.find((sample) => sample.image && VISUAL_CUE_RE.test(sample.title));
    if (scene) add('visual_curiosity', evidenceOf(scene), `${FLAG_NOTE.visual_curiosity} — "${scene.title.match(VISUAL_CUE_RE)?.[0] ?? ''}"`);
  }
  return [...out.values()];
}

export function tellabilityOf(
  anchor: { text: string },
  delta: HomefeedDelta | null,
  tensions: readonly HomefeedTension[],
): HomefeedTellability {
  if (!anchor.text) return { passed: false, sentence: null, evidence: null, reason: 'NO_ANCHOR' };
  const hook = delta
    ? { words: delta.newTokens.slice(0, 3).join(' '), evidence: delta.evidence }
    : tensions[0] ? { words: tensions[0].matched, evidence: tensions[0].evidence } : null;
  if (!hook) return { passed: false, sentence: null, evidence: null, reason: 'NO_DELTA_OR_TENSION' };
  const tension = tensions.find((row) => row.evidence.url === hook.evidence.url) ?? null;
  const parts = [anchor.text, hook.words];
  if (tension && !hook.words.includes(tension.matched) && !anchor.text.includes(tension.matched)) parts.push(tension.matched);
  const sentence = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (sentence.length > 60) return { passed: false, sentence: clip(sentence, 60), evidence: hook.evidence, reason: 'TOO_LONG' };
  return { passed: true, sentence, evidence: hook.evidence, reason: 'ANCHOR_DELTA_TENSION' };
}

const ANSWER_TENSIONS: readonly HomefeedTensionType[] = ['hidden_reason', 'expectation_break', 'result_first', 'number_conflict', 'relationship_shift', 'action_reversal', 'scale_mismatch'];
const REAL_SCENE_CATEGORIES: readonly HomefeedCategory[] = ['entertainment', 'sports', 'car', 'tech', 'food', 'travel', 'house', 'incident', 'weather'];

export function noSearchOf(
  anchor: { text: string; category: HomefeedCategory },
  tensions: readonly HomefeedTension[],
  funGap: readonly HomefeedFunGapReason[],
  payoffLayers: readonly HomefeedRevealLayer[],
  signals: Pick<HomefeedSignals, 'visualCandidateCount'>,
  settings: HomefeedSettings,
): HomefeedNoSearch {
  const situationIn1s = anchor.category !== 'unknown';
  const immediateWhy = tensions.length > 0 || funGap.length > 0;
  const answerWanted = payoffLayers.length >= 1 && tensions.some((tension) => ANSWER_TENSIONS.includes(tension.type));
  const imageIncreasesCuriosity = signals.visualCandidateCount >= 1
    && (funGap.some((reason) => reason.flag === 'visual_curiosity') || REAL_SCENE_CATEGORIES.includes(anchor.category));
  const payoffBeyondAnswer = payoffLayers.length >= settings.story.payoffMin;
  const checks: HomefeedCheck[] = [
    { id: 'situation_in_1s', passed: situationIn1s, reason: situationIn1s ? '어떤 분야 이야기인지 바로 안다' : '어떤 분야 이야기인지 흐리다(분류가 안 된다)' },
    { id: 'immediate_why', passed: immediateWhy, reason: immediateWhy ? `제목에 눈길 끄는 대목 ${tensions.length}개 · 재미 근거 ${funGap.length}개` : '제목이 사실만 전하고 눈길 끄는 대목이 없다' },
    { id: 'answer_wanted', passed: answerWanted, reason: answerWanted ? '제목이 답을 감추고, 본문에서 풀 이야기가 있다' : '본문에서 풀어 줄 이야기가 없어 한 줄로 끝난다' },
    { id: 'image_curiosity', passed: imageIncreasesCuriosity, reason: imageIncreasesCuriosity ? `쓸 만한 사진 후보 ${signals.visualCandidateCount}장 · 보여 줄 장면이 있는 주제` : '쓸 만한 사진이 없거나 보여 줄 장면이 아니다' },
    { id: 'payoff_beyond_answer', passed: payoffBeyondAnswer, reason: `본문에서 풀 이야기 ${payoffLayers.length}개(기준 ${settings.story.payoffMin}개)` },
  ];
  return { situationIn1s, immediateWhy, answerWanted, imageIncreasesCuriosity, payoffBeyondAnswer, passed: situationIn1s && immediateWhy && answerWanted, checks };
}

const CROP_GUIDE: Partial<Record<HomefeedCategory, string>> = {
  entertainment: '얼굴 · 표정이 1초에 보이게 상반신 위주로 자른다. 자막 · 로고가 박힌 사진은 쓰지 말고 다른 사진을 고른다.',
  sports: '선수 동작이나 표정이 가운데 오게 자른다. 중계 화면 캡처는 쓰지 않는다.',
  car: '차 전체 윤곽이 보이게 여백을 남긴다. 배경 글자가 많은 사진은 피한다.',
  tech: '제품 실물이 가운데 크게 오게 자른다.',
  food: '음식이 화면의 절반 이상을 차지하게 가깝게 자른다.',
  incident: '현장 전경 위주로 쓰고 피해자 얼굴 · 번호판 등 개인정보가 보이는 사진은 쓰지 않는다.',
  policy: '공식 브리핑 · 기관 장면을 쓰고, 표 · 문서 사진은 글자가 읽히게 자른다.',
};

export function firstCardOf(
  anchor: { text: string; category: HomefeedCategory },
  delta: HomefeedDelta | null,
  tensions: readonly HomefeedTension[],
  payoffLayers: readonly HomefeedRevealLayer[],
  samples: readonly HomefeedSample[],
  visual: HomefeedVisualDecision,
): HomefeedFirstCard {
  const deltaImage = delta ? samples.find((sample) => sample.url === delta.evidence.url && sample.image) : undefined;
  const imageSample = deltaImage ?? samples.find((sample) => sample.image) ?? null;
  const imageIndex = imageSample ? samples.indexOf(imageSample) : -1;
  const image: HomefeedImageRef = imageSample
    ? { kind: 'real', guideId: `real-${imageIndex}`, imageUrl: imageSample.image }
    : visual.strategy === 'REAL-FIRST' ? { kind: 'none', guideId: null, imageUrl: null } : { kind: 'ai', guideId: 'ai-hero', imageUrl: null };

  const hook = delta?.newTokens[0] ?? tensions[0]?.matched ?? null;
  const secondHook = tensions.find((tension) => tension.matched !== hook)?.matched ?? delta?.newTokens[1] ?? null;
  const headline1 = clip(`${anchor.text} ${hook ?? ''}`, 15);
  const headline2 = secondHook ? clip(secondHook, 15) : null;
  const headlineText = `${headline1} ${headline2 ?? ''}`;
  const headlineTokens = titleTokens(headlineText);
  // 카드 문구가 기사 제목 어절을 얼마나 옮겨 담았나 — 짧은 조각끼리 자카드는 부풀어서, 제목 쪽 어절 대비 비율로 본다.
  const coverage = samples.reduce((max, sample) => {
    const tokens = titleTokens(sample.title);
    if (tokens.size === 0) return max;
    let shared = 0;
    for (const token of headlineTokens) if (tokens.has(token)) shared += 1;
    return Math.max(max, shared / tokens.size);
  }, 0);
  const hidden = payoffLayers.length === 0 || payoffLayers.some((layer) => !headlineText.includes(layer.value));

  const checks: HomefeedCheck[] = [
    { id: 'anchor_visible', passed: Boolean(anchor.text) && headline1.includes(anchor.text.slice(0, 15)), reason: `기준어 "${anchor.text}"` },
    { id: 'hook_in_first_15', passed: Boolean(hook) && headline1.includes(clip(hook, 15 - Math.min(anchor.text.length + 1, 14))), reason: hook ? `걸림 말 "${hook}"(근거 제목에 있는 말)` : '걸림 말이 없다(새 사실 · 긴장 없음)' },
    { id: 'answer_hidden', passed: hidden, reason: hidden ? '풀 이야기 일부가 카드 밖에 남아 본문으로 이어진다' : '풀 이야기가 카드에 다 드러나 더 볼 것이 없다' },
    { id: 'image_ready', passed: image.kind !== 'none', reason: image.kind === 'real' ? '기사 대표이미지 후보가 있다(권리 확인 필요)' : image.kind === 'ai' ? 'AI 이미지로 만들 장면이다' : '실제 이미지가 필요한데 후보가 없다' },
    { id: 'not_article_copy', passed: coverage < 0.8, reason: `표본 제목 어절을 최대 ${Math.round(coverage * 100)}% 담음(80% 이상이면 기사 제목 옮기기)` },
  ];

  const numberHook = [delta?.newTokens.find((token) => /\d/.test(token)), tensions.find((tension) => tension.type === 'number_conflict')?.matched, payoffLayers.find((layer) => layer.kind === 'number')?.value]
    .find((value): value is string => Boolean(value));
  const quoteHook = payoffLayers.find((layer) => layer.kind === 'quote')?.value;
  const variants: HomefeedCardVariant[] = [
    { id: 'A', label: '실제 이미지형', image: image.kind === 'real' ? image : { kind: 'none', guideId: null, imageUrl: null }, line1: headline1, line2: headline2 },
    { id: 'B', label: '숫자 · 문구형', image, line1: clip(numberHook ?? quoteHook ?? hook ?? anchor.text, 12), line2: clip(anchor.text, 12) },
    { id: 'C', label: '미니멀형', image: visual.strategy === 'REAL-FIRST' ? image : { kind: 'ai', guideId: 'ai-hero', imageUrl: null }, line1: clip(anchor.text, 12), line2: null },
  ];

  return {
    possible: Boolean(anchor.text && hook) && image.kind !== 'none',
    imageStrategy: visual.strategy,
    image,
    cropGuidance: CROP_GUIDE[anchor.category] ?? '주제 물체 · 장면이 가운데 오게 자른다. 자막 · 워터마크가 있는 사진은 쓰지 말고 다른 사진을 고른다.',
    headline1,
    headline2,
    hook,
    secondHook,
    reason: `${visual.strategy} · ${hook ? `걸림 말 "${hook}"` : '걸림 말 없음'}`,
    checks,
    variants,
  };
}

/** 위험 사유 코드 — 판정(DROP)과 화면 경고에 쓴다. */
export function risksOf(samples: readonly HomefeedSample[], signals: Pick<HomefeedSignals, 'sampleN' | 'pressCountNow' | 'firstSeenCensored'>, category: HomefeedCategory): string[] {
  const risks: string[] = [];
  const titles = samples.map((sample) => normalizeTitle(sample.title));
  if (signals.sampleN === 0) risks.push('NO_EVIDENCE');
  if (titles.length > 0 && titles.every((title) => RUMOR_RE.test(title)) && !titles.some((title) => CONFIRM_RE.test(title))) risks.push('RUMOR_ONLY');
  if (signals.sampleN === 1 || (signals.sampleN > 1 && signals.pressCountNow === 1)) risks.push('SINGLE_SOURCE');
  if (titles.length > 0 && titles.filter((title) => FAN_ONLY_RE.test(title)).length > titles.length / 2) risks.push('FAN_ONLY');
  if (signals.firstSeenCensored) risks.push('AGE_CENSORED');
  if (category === 'incident') risks.push('SENSITIVE_INCIDENT');
  return risks;
}
