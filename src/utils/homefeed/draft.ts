/**
 * 원고 생성 규칙 — 이 탭 한정 예외(사장님 결정 2026-09-16 "명령서대로 본문까지"). 사용자가 누를 때만, 내 구독 에이전트로.
 *
 * 재료는 스토리의 근거(기사 제목 · 주소 · 매체 · 시각)와 고른 제목 · 이미지 · 썸네일 전략뿐이다. 프롬프트는 앱이 만든다.
 * 결정론 검사: 첫 줄 최종 제목 · ### 금지 · 해시태그 5~10 · 이미지 배치 가이드 · 기사체 시작 · 카드 약속 초반 상환 · 워터마크 제거 문구.
 * 어기면 사유를 붙여 한 번 다시 쓴다(부르는 쪽).
 */
import { CATEGORY_LABEL } from './category';
import type { HomefeedStory, HomefeedTitleVisualPair } from './types';
import { AI_IMAGE_LABEL } from './visual';

export interface DraftMaterials {
  title: string;
  keyword: string;
  anchor: string;
  categoryLabel: string;
  delta: string | null;
  tensions: string[];
  alternativeAngles: string[];
  funGap: string[];
  payoff: string[];
  evidence: Array<{ title: string; url: string; press: string | null; publishedAt: string | null }>;
  visualStrategy: string;
  heroImage: { kind: string; source: string | null; url: string | null };
  thumbnail: { type: string; copy: string[] };
  cardPromise: string | null;
}

export function draftMaterialsOf(story: HomefeedStory, title: string, pair: HomefeedTitleVisualPair | null): DraftMaterials {
  const heroGuide = story.realImages.find((item) => item.id === (pair?.heroImage.guideId ?? story.thumbnail.heroImage.guideId)) ?? null;
  return {
    title,
    keyword: story.keyword,
    anchor: story.anchor.text,
    categoryLabel: CATEGORY_LABEL[story.category],
    delta: story.delta?.text ?? null,
    tensions: story.tensions.map((tension) => `${tension.type}: "${tension.matched}"`),
    alternativeAngles: story.alternativeAngles.map((angle) => angle.label),
    funGap: story.funGap.map((reason) => reason.note),
    payoff: story.payoffLayers.map((layer) => layer.value),
    evidence: story.evidence.slice(0, 10).map((item) => ({ title: item.title, url: item.url, press: item.press, publishedAt: item.publishedAt })),
    visualStrategy: pair?.visualStrategy ?? story.visual.strategy,
    heroImage: {
      kind: pair?.heroImage.kind ?? story.thumbnail.heroImage.kind,
      source: heroGuide?.sourceName ?? null,
      url: heroGuide?.sourceUrl ?? null,
    },
    thumbnail: { type: story.thumbnail.type, copy: pair?.thumbnailCopy ?? story.thumbnail.textOverlay },
    cardPromise: story.firstCard.hook,
  };
}

const bullets = (rows: readonly string[]) => (rows.length > 0 ? rows.map((row) => `- ${row}`).join('\n') : '- (없음)');

export function buildDraftPrompt(m: DraftMaterials, feedback: readonly string[] = []): string {
  return [
    '너는 네이버 블로그를 오래 해 온 사람이다. 아래 재료만으로 홈판용 글 한 편을 써라.',
    '',
    `선택한 제목: ${m.title}`,
    `이슈 검색어: ${m.keyword} · 기준어: ${m.anchor} · 카테고리: ${m.categoryLabel}`,
    `새로 나온 사실: ${m.delta ?? '(없음)'}`,
    '긴장:', bullets(m.tensions),
    '다른 각도:', bullets(m.alternativeAngles),
    '재미 근거:', bullets(m.funGap),
    '본문에서 이 순서로 풀 정보:', m.payoff.length > 0 ? m.payoff.map((value, index) => `${index + 1}) ${value}`).join('\n') : '(없음)',
    '근거 기사(이 밖의 사실은 쓰지 마라):',
    m.evidence.map((item, index) => `${index + 1}. ${item.title} — ${item.press ?? '매체 미상'} · ${item.publishedAt ?? '시각 미상'} · ${item.url}`).join('\n') || '(없음)',
    `대표이미지: ${m.visualStrategy} · ${m.heroImage.kind === 'real' ? `실제 사진(${m.heroImage.source ?? '매체 미상'} · ${m.heroImage.url ?? ''})` : m.heroImage.kind === 'ai' ? 'AI 이미지' : '미정'}`,
    `썸네일: ${m.thumbnail.type} · 문구 ${m.thumbnail.copy.join(' / ') || '없음'}`,
    '',
    '규칙 — 하나라도 어기면 실패다:',
    `- 맨 첫 줄은 "최종 제목: ${m.title}" 그대로.`,
    '- 기사체 금지. 네이버 블로그 대화체(~요 · ~더라고요 · ~네요). 첫 세 문장이 포털 기사처럼 읽히면 실패다.',
    '- 연예 · 이슈 글은 블로거의 시선 80 · 사실 전달 20.',
    '- 소제목은 "## " 만 쓴다("###" 금지). 한 문단은 1~3문장.',
    '- 긴 프로필 소개로 시작하지 마라. 겪지 않은 일을 겪은 것처럼 쓰지 마라.',
    m.cardPromise ? `- 카드에서 걸었던 말 "${m.cardPromise}"은 초반 세 문단 안에서 풀어라.` : '- 첫 문단에서 무슨 이야기인지 바로 풀어라.',
    '- 재료에 없는 사실 · 숫자 · 인용을 지어내지 마라. 과장하지 마라.',
    '- 본문 끝에 해시태그 5~10개를 한 줄로(#태그).',
    `- 마지막에 "## 이미지 배치 가이드" 구획: 이미지마다 위치 · 실제/AI · 장면 · 출처(매체) · 기사 주소 · 페이지 위치 · 워터마크 여부(모르면 "모름") · 권리 상태(기사 사진은 "권리 확인 필요") · 크롭 · 이유 · AI 대체 프롬프트 한 줄. AI 이미지는 "${AI_IMAGE_LABEL}"라고 적어라. 워터마크를 지우라는 말은 쓰지 마라.`,
    ...(feedback.length > 0 ? ['', `지난 원고의 문제: ${feedback.join(' · ')} — 이것을 고쳐 처음부터 다시 써라.`] : []),
    '',
    '글만 출력해라(설명 · 코드블록 없이).',
  ].join('\n');
}

export const DRAFT_PROBLEM_LABEL: Record<string, string> = {
  EMPTY: '원고가 비었다',
  FIRST_LINE_NOT_TITLE: '첫 줄이 "최종 제목:"이 아니다',
  H3_USED: '### 소제목을 썼다',
  NO_IMAGE_GUIDE: '이미지 배치 가이드가 없다',
  HASHTAG_COUNT: '해시태그가 5~10개가 아니다',
  ARTICLE_TONE_OPENING: '첫 세 문장이 기사체다',
  CARD_PROMISE_LATE: '카드에서 건 말을 초반에 풀지 않았다',
  WATERMARK_REMOVAL: '금지 문장(워터마크 삭제 권유)이 들어갔다',
};

export function validateDraft(text: string, m: Pick<DraftMaterials, 'cardPromise'>): string[] {
  const draft = String(text || '').trim();
  if (!draft) return ['EMPTY'];
  const problems: string[] = [];
  const firstLine = draft.split(/\r?\n/).find((line) => line.trim()) ?? '';
  if (!/^최종\s?제목\s*[:：]/u.test(firstLine.trim())) problems.push('FIRST_LINE_NOT_TITLE');
  if (/^\s*###/mu.test(draft)) problems.push('H3_USED');
  const guideIndex = draft.search(/^##\s*이미지\s?배치\s?가이드/mu);
  if (guideIndex < 0) problems.push('NO_IMAGE_GUIDE');
  const body = (guideIndex >= 0 ? draft.slice(0, guideIndex) : draft).replace(firstLine, '');
  const tags = new Set(body.match(/#[가-힣A-Za-z0-9_]+/gu) || []);
  if (tags.size < 5 || tags.size > 10) problems.push('HASHTAG_COUNT');
  const prose = body.replace(/^##.*$/gmu, '').replace(/#[가-힣A-Za-z0-9_]+/gu, '');
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/u).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 5).slice(0, 3);
  const newsLike = sentences.filter((sentence) => /(했다|밝혔다|전했다|알려졌다|나타났다|전해졌다|드러났다)\.?$/u.test(sentence)).length;
  if (sentences.length >= 3 && newsLike >= 2) problems.push('ARTICLE_TONE_OPENING');
  if (m.cardPromise) {
    const index = prose.indexOf(m.cardPromise);
    if (index < 0 || index > prose.length * 0.4) problems.push('CARD_PROMISE_LATE');
  }
  if (/워터마크\S{0,3}\s?(?:지우|제거|없애|잘라)/u.test(draft)) problems.push('WATERMARK_REMOVAL');
  return problems;
}
