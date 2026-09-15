/**
 * VISUAL ENGINE — 이미지 전략(REAL-FIRST · AI-FIRST · HYBRID) · 실제 이미지 가이드 · AI 이미지 프롬프트(KO/EN) · 썸네일 계획.
 *
 * 지키는 선:
 *   - 기사 사진은 '후보'다. 권리는 기본 rights_check_required, 워터마크는 감지하지 않으니 unknown. '사용 가능'이라 쓰지 않는다.
 *   - 워터마크 · 자막이 있는 사진은 잘라 쓰라고 하지 않는다 — 다른 사진을 고르라고 한다.
 *   - AI 이미지는 실제 사건 사진이 아니라고 표기한다. 실존 인물 기사는 식별 가능한 얼굴 대신 상징 장면으로 짠다.
 */
import { CATEGORY_LABEL } from './category';
import type {
  HomefeedAiPromptPlan,
  HomefeedAngle,
  HomefeedAspectRatio,
  HomefeedCategory,
  HomefeedCheck,
  HomefeedDelta,
  HomefeedFirstCard,
  HomefeedFunGapReason,
  HomefeedImageRef,
  HomefeedRealImageGuideItem,
  HomefeedRevealLayer,
  HomefeedSample,
  HomefeedSignals,
  HomefeedTension,
  HomefeedThumbnailPlan,
  HomefeedThumbnailType,
  HomefeedVisualDecision,
} from './types';
import type { HomefeedSettings } from './settings';
import { VISUAL_CUE_RE } from './lexicon';
import { clip, compactKey } from './text';

export const AI_IMAGE_LABEL = 'AI 생성 이미지 — 실제 사건 사진이 아닙니다';

const REAL_FIRST_CATEGORIES: readonly HomefeedCategory[] = ['entertainment', 'sports', 'car', 'tech', 'food', 'travel', 'incident', 'weather'];
const EVIDENCE_REQUIRED: readonly HomefeedCategory[] = ['entertainment', 'sports', 'incident', 'policy'];
const REAL_PERSON_CATEGORIES: readonly HomefeedCategory[] = ['entertainment', 'sports', 'incident', 'policy'];

const WHY_REAL: Partial<Record<HomefeedCategory, string>> = {
  entertainment: '사람들이 궁금한 건 그 사람의 실제 모습 · 장면이다',
  sports: '경기 장면 · 표정이 사실을 증명한다',
  car: '신차 · 실물 디자인이 핵심이라 실제 사진이 1초에 설득한다',
  tech: '제품 실물을 보여 줘야 무엇인지 안다',
  food: '실제 음식 사진이 없으면 신뢰가 떨어진다',
  travel: '실제 장소 사진이 가고 싶은 마음을 만든다',
  incident: '사건 현장 사진이 사실 전달의 근거다(개인정보 가림 필수)',
  weather: '실제 하늘 · 거리 사진이 체감을 전한다',
  policy: '공식 발표 사진 · 자료가 제도의 출처를 보여 준다',
};

export function decideVisualStrategy(
  category: HomefeedCategory,
  samples: readonly HomefeedSample[],
  signals: Pick<HomefeedSignals, 'visualCandidateCount'>,
  payoffLayers: readonly HomefeedRevealLayer[],
): HomefeedVisualDecision {
  const scene = samples.some((sample) => VISUAL_CUE_RE.test(sample.title));
  const evidenceImageRequired = EVIDENCE_REQUIRED.includes(category);
  if (REAL_FIRST_CATEGORIES.includes(category) || scene) {
    const hybrid = payoffLayers.length >= 3;
    return {
      strategy: hybrid ? 'HYBRID' : 'REAL-FIRST',
      reason: hybrid
        ? `${CATEGORY_LABEL[category]} · 실제 사진을 대표로, 정보층 ${payoffLayers.length}개는 소제목 설명 그림으로`
        : `${CATEGORY_LABEL[category]}${scene ? ' · 제목에 장면 말(공개 · 포착 등)' : ''} — 실제 사진이 사실을 보여 준다`,
      whyReal: WHY_REAL[category] ?? '제목의 장면을 실제로 보여 줘야 궁금증이 풀린다',
      whyAi: hybrid ? '절차 · 비교 같은 설명 소제목은 AI 그림이 더 또렷하다' : 'AI 그림은 실제 사건 사진으로 오해될 수 있어 대표이미지로 쓰지 않는다',
      evidenceImageRequired,
    };
  }
  if (category === 'policy' && signals.visualCandidateCount > 0) {
    return {
      strategy: 'HYBRID',
      reason: '정책 · 사회 — 공식 사진을 대표로, 제도 설명은 AI 그림으로',
      whyReal: WHY_REAL.policy as string,
      whyAi: '제도 · 절차는 개념 그림이 한눈에 이해된다',
      evidenceImageRequired,
    };
  }
  return {
    strategy: 'AI-FIRST',
    reason: `${CATEGORY_LABEL[category]} — 실물보다 생활 장면 · 개념 설명이 핵심`,
    whyReal: '기사 사진은 대개 자료 사진이라 이야기와 직접 닿지 않는다',
    whyAi: '한국 생활 맥락의 장면으로 재현하면 1초에 이해된다',
    evidenceImageRequired,
  };
}

const CROP_FOCUS: Partial<Record<HomefeedCategory, string>> = {
  entertainment: '얼굴 · 표정(상반신)',
  sports: '동작 · 표정',
  car: '차 전체 윤곽',
  tech: '제품 실물',
  food: '음식 클로즈업',
  incident: '현장 전경(사람 얼굴 · 번호판 제외)',
  policy: '발표 장면 · 기관 표지',
};

export function realImageGuide(
  samples: readonly HomefeedSample[],
  delta: HomefeedDelta | null,
  alternativeAngles: readonly HomefeedAngle[],
  category: HomefeedCategory,
  max = 4,
): HomefeedRealImageGuideItem[] {
  const withImage = samples.map((sample, index) => ({ sample, index })).filter((row) => row.sample.image);
  const altUrls = new Map<string, string>();
  for (const angle of alternativeAngles) for (const ref of angle.evidence) if (!altUrls.has(ref.url)) altUrls.set(ref.url, angle.label);
  const ordered = [
    ...withImage.filter((row) => delta && row.sample.url === delta.evidence.url),
    ...withImage.filter((row) => !(delta && row.sample.url === delta.evidence.url) && altUrls.has(row.sample.url)),
    ...withImage.filter((row) => !(delta && row.sample.url === delta.evidence.url) && !altUrls.has(row.sample.url)),
  ];
  const seenImages = new Set<string>();
  const out: HomefeedRealImageGuideItem[] = [];
  for (const { sample, index } of ordered) {
    const imageKey = compactKey(String(sample.image).replace(/[?#].*$/, ''));
    if (seenImages.has(imageKey)) continue;
    seenImages.add(imageKey);
    const isDelta = Boolean(delta && sample.url === delta.evidence.url);
    const altLabel = altUrls.get(sample.url);
    const role: HomefeedRealImageGuideItem['role'] = out.length === 0 ? 'hero' : altLabel ? 'proof' : out.length === 1 ? 'secondary' : 'context';
    out.push({
      id: `real-${index}`,
      role,
      sourceName: sample.press,
      sourceUrl: sample.url,
      imageUrl: sample.image,
      pageLocation: '기사 대표이미지(og:image)',
      caption: null,
      watermark: 'unknown',
      rightsStatus: 'rights_check_required',
      whyThisImage: isDelta ? '새로 나온 사실을 보도한 기사의 사진' : altLabel ? `다른 각도("${altLabel}")를 보도한 기사의 사진` : '같은 이슈를 보도한 기사의 사진',
      cropFocus: CROP_FOCUS[category] ?? '주제 물체 · 장면',
      avoidCrop: '자막 · 방송사 로고 · 워터마크가 보이면 잘라 쓰지 말고 다른 사진을 고른다',
      mobileReadability: '원본 해상도 미측정 — 모바일 목록 크기에서 주제가 보이는지 직접 확인',
      thumbnailSuitability: role === 'hero'
        ? { label: 'check', basis: '대표 기사 사진 — 권리 · 워터마크 확인 뒤 판단' }
        : { label: 'weak', basis: '보조 근거용 사진' },
    });
    if (out.length >= max) break;
  }
  return out;
}

const SCENE: Record<HomefeedCategory, { ko: string; en: string }> = {
  entertainment: { ko: '방송 스튜디오 · 무대 뒤 소품이 보이는 장면(사람 얼굴 없음)', en: 'a broadcast studio or backstage scene with props, no identifiable faces' },
  sports: { ko: '빈 경기장과 장비가 보이는 장면(선수 얼굴 없음)', en: 'an empty stadium with sports equipment, no identifiable athletes' },
  money: { ko: '한국 지폐 · 계산기 · 가계부가 놓인 책상', en: 'a desk with Korean won banknotes, a calculator and a household budget notebook' },
  house: { ko: '한국 아파트 거실 · 부엌 실내', en: 'a Korean apartment living room and kitchen interior' },
  car: { ko: '한국 도로 위 차량 실루엣(브랜드 로고 없음)', en: 'a car silhouette on a Korean road, no brand logos' },
  tech: { ko: '책상 위 스마트폰 · 노트북(로고 없음)', en: 'a smartphone and a laptop on a desk, no logos' },
  food: { ko: '한국 식탁 위 음식 클로즈업', en: 'a close-up of food on a Korean dining table' },
  travel: { ko: '공항 · 여행 가방 · 지도가 보이는 장면', en: 'an airport scene with a suitcase and a map' },
  work: { ko: '한국 사무실 책상과 서류', en: 'a Korean office desk with documents' },
  family: { ko: '한국 가정 거실의 생활 소품', en: 'everyday family items in a Korean home living room' },
  health: { ko: '병원 복도와 진료 도구(환자 얼굴 없음)', en: 'a hospital hallway with medical tools, no patient faces' },
  policy: { ko: '관공서 건물 · 서류 · 도장', en: 'a government office building with official documents and a stamp' },
  incident: { ko: '폴리스라인이 쳐진 현장 전경(사람 얼굴 · 번호판 없음)', en: 'a wide shot of a scene with police tape, no faces or license plates' },
  weather: { ko: '하늘과 거리 풍경으로 날씨가 드러나는 장면', en: 'a street and sky scene that shows the weather' },
  unknown: { ko: '주제를 상징하는 사물 정물', en: 'a still life of objects that symbolize the topic' },
};

const NEGATIVE_KO = '글자, 워터마크, 로고, 실존 인물 얼굴, 왜곡된 손, 저해상도, 과장된 표정';
const NEGATIVE_EN = 'text, watermark, logo, real person face, distorted hands, low resolution, exaggerated expression';

function promptPlan(
  id: string,
  purpose: string,
  placement: string,
  topic: string,
  category: HomefeedCategory,
  aspectRatio: HomefeedAspectRatio,
  withTextSpace: boolean,
): HomefeedAiPromptPlan {
  const realPersonSafe = REAL_PERSON_CATEGORIES.includes(category);
  const scene = SCENE[category];
  const subject = `${topic}을(를) 떠올리게 하는 ${scene.ko}`;
  const composition = withTextSpace ? '주제를 화면 한쪽 2/3에 두고 반대쪽 1/3을 비운 구도' : '주제를 가운데 두고 여백을 넉넉히 둔 구도';
  const background = '단순하고 정돈된 배경, 글자가 있는 간판 · 화면 없음';
  const lighting = '자연광에 가까운 부드러운 조명';
  const camera = '눈높이, 35mm 렌즈 느낌, 얕은 심도';
  const realism = '사진처럼 사실적이되 실제 사건 사진처럼 보이게 꾸미지 않는다';
  const koreanContext = '한국의 생활 공간 · 사물 맥락';
  const textSpace = withTextSpace ? '썸네일 문구가 들어갈 여백을 한쪽에 남긴다' : '문구 여백 없음';
  const finalPromptKo = [subject, composition, background, lighting, camera, realism, koreanContext, textSpace].join('. ') + `. 제외: ${NEGATIVE_KO}.`;
  const finalPromptEn = [
    `Photorealistic image, aspect ratio ${aspectRatio}`,
    `Subject: ${scene.en}, evoking the topic "${topic}"`,
    withTextSpace ? 'Composition: subject on two thirds of the frame, leave one third empty for a caption' : 'Composition: centered subject with generous margins',
    'Background: simple and tidy, no signs or screens with text',
    'Lighting: soft natural light',
    'Camera: eye level, 35mm lens look, shallow depth of field',
    'Korean everyday context',
    'Do not make it look like a real news photo of an actual event',
    `Avoid: ${NEGATIVE_EN}`,
  ].join('. ') + '.';
  return {
    id, purpose, placement, aspectRatio, composition, subject, background, lighting, camera, realism, koreanContext, textSpace,
    negativePrompt: NEGATIVE_KO, finalPromptKo, finalPromptEn, realPersonSafe, label: AI_IMAGE_LABEL, refinedBy: null,
  };
}

export function aiPromptPlans(
  anchorText: string,
  category: HomefeedCategory,
  strategy: HomefeedVisualDecision['strategy'],
  payoffLayers: readonly HomefeedRevealLayer[],
  settings: Pick<HomefeedSettings, 'defaultAspectRatio'>,
): HomefeedAiPromptPlan[] {
  const topic = clip(anchorText, 30);
  const plans: HomefeedAiPromptPlan[] = [];
  plans.push(promptPlan(
    'ai-hero',
    strategy === 'REAL-FIRST' ? '실제 사진을 못 구했을 때만 쓰는 대체 대표이미지(실제 사진 우선)' : '대표이미지 · 썸네일 바탕',
    '글 맨 위 대표이미지',
    topic,
    category,
    settings.defaultAspectRatio,
    true,
  ));
  if (strategy !== 'REAL-FIRST') {
    payoffLayers.filter((layer) => layer.kind !== 'quote').slice(0, 2).forEach((layer, index) => {
      plans.push(promptPlan(
        `ai-section-${index + 1}`,
        `소제목 설명 그림 — "${clip(layer.value, 20)}"`,
        `본문 ${index + 1}번째 소제목 아래`,
        `${topic} ${clip(layer.value, 12)}`,
        category,
        settings.defaultAspectRatio,
        false,
      ));
    });
  }
  return plans;
}

const TYPE_GOAL: Record<HomefeedThumbnailType, string> = {
  'FACE+NUMBER': '인물 반응과 숫자 하나로 멈추게 한다',
  'OBJECT+PRICE': '물건과 가격 대비로 멈추게 한다',
  'BEFORE/AFTER': '전후 차이를 한눈에 보여 준다',
  'QUOTE+SCENE': '장면 위 짧은 인용으로 궁금하게 한다',
  'CONTRAST SPLIT': '둘로 나눈 화면으로 대비를 보여 준다',
  'RESULT FIRST': '결과 한 마디를 먼저 보여 주고 과정은 본문으로',
  'CLEAN INFO': '핵심 숫자 · 조건 하나를 깔끔하게',
  'NO-TEXT VISUAL': '문구 없이 장면만으로 궁금하게 한다',
};

export function thumbnailTypeOf(category: HomefeedCategory, tensions: readonly HomefeedTension[], funGap: readonly HomefeedFunGapReason[]): HomefeedThumbnailType {
  const has = (type: HomefeedTension['type']) => tensions.some((tension) => tension.type === type);
  const flag = (name: HomefeedFunGapReason['flag']) => funGap.some((reason) => reason.flag === name);
  if (has('scale_mismatch')) return 'OBJECT+PRICE';
  if (flag('before_after')) return 'BEFORE/AFTER';
  if (flag('strong_quote')) return 'QUOTE+SCENE';
  if (has('identity_contrast') || has('expectation_break')) return 'CONTRAST SPLIT';
  if (has('result_first')) return 'RESULT FIRST';
  if (has('number_conflict')) return category === 'entertainment' || category === 'sports' ? 'FACE+NUMBER' : 'CLEAN INFO';
  if (['money', 'policy', 'work', 'health'].includes(category)) return 'CLEAN INFO';
  return 'NO-TEXT VISUAL';
}

export function thumbnailPlanOf(input: {
  category: HomefeedCategory;
  anchorText: string;
  strategy: HomefeedVisualDecision['strategy'];
  tensions: readonly HomefeedTension[];
  funGap: readonly HomefeedFunGapReason[];
  payoffLayers: readonly HomefeedRevealLayer[];
  delta: HomefeedDelta | null;
  realImages: readonly HomefeedRealImageGuideItem[];
  firstCard: Pick<HomefeedFirstCard, 'hook'>;
  hasGeneratedImage?: boolean;
}, settings: Pick<HomefeedSettings, 'thumbnailTextMaxChars'>): HomefeedThumbnailPlan {
  const max = settings.thumbnailTextMaxChars;
  const type = thumbnailTypeOf(input.category, input.tensions, input.funGap);
  const hero = input.realImages.find((item) => item.role === 'hero') ?? null;
  const heroImage: HomefeedImageRef = hero
    ? { kind: 'real', guideId: hero.id, imageUrl: hero.imageUrl }
    : input.strategy !== 'REAL-FIRST' ? { kind: 'ai', guideId: 'ai-hero', imageUrl: null } : { kind: 'none', guideId: null, imageUrl: null };

  const numberHook = input.payoffLayers.find((layer) => layer.kind === 'number')?.value
    ?? input.tensions.find((tension) => tension.type === 'number_conflict')?.matched.split(' · ')[0];
  const quote = input.payoffLayers.find((layer) => layer.kind === 'quote')?.value;
  const tensionWord = input.tensions.find((tension) => tension.type !== 'number_conflict')?.matched;
  const lineFor: Record<HomefeedThumbnailType, Array<string | undefined>> = {
    'FACE+NUMBER': [numberHook],
    'OBJECT+PRICE': [input.tensions.find((tension) => tension.type === 'scale_mismatch')?.matched ?? numberHook],
    'BEFORE/AFTER': [tensionWord],
    'QUOTE+SCENE': [quote],
    'CONTRAST SPLIT': [tensionWord],
    'RESULT FIRST': [tensionWord, input.delta?.newTokens[0]],
    'CLEAN INFO': [numberHook ?? input.delta?.newTokens[0]],
    'NO-TEXT VISUAL': [],
  };
  const textOverlay = lineFor[type]
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => clip(line, max))
    .filter((line, index, all) => line.length >= 2 && all.indexOf(line) === index)
    .slice(0, 2);
  const copyVariants = [numberHook, quote, tensionWord, input.delta?.newTokens[0], input.firstCard.hook ?? undefined, input.anchorText]
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => clip(line, max))
    .filter((line, index, all) => line.length >= 2 && all.indexOf(line) === index)
    .slice(0, 3);

  const evaluation: HomefeedCheck[] = [
    { id: 'hero_exists', passed: heroImage.kind !== 'none', reason: heroImage.kind === 'real' ? '기사 대표이미지 후보' : heroImage.kind === 'ai' ? 'AI 이미지로 만들 대표 장면' : '실제 사진이 필요한데 후보가 없다' },
    { id: 'subject_in_1s', passed: input.category !== 'unknown' || heroImage.kind === 'real', reason: input.category !== 'unknown' ? `${CATEGORY_LABEL[input.category]} 장면` : '주제가 미분류라 장면이 흐리다' },
    { id: 'text_lines_ok', passed: textOverlay.length <= 2 && textOverlay.every((line) => line.length <= max), reason: `문구 ${textOverlay.length}줄 · 줄당 ${max}자 이하` },
    { id: 'no_title_copy', passed: true, reason: '제목이 정해지면 제목-이미지 조합에서 다시 검사한다' },
    { id: 'face_object_clear', passed: true, reason: type === 'NO-TEXT VISUAL' ? '문구 없음' : '문구는 인물 · 물체 반대편 여백에 둔다' },
    { id: 'rights_noted', passed: true, reason: heroImage.kind === 'real' ? '기사 사진 — 권리 확인 필요로 표기' : heroImage.kind === 'ai' ? AI_IMAGE_LABEL : '사진 없음' },
    { id: 'mobile_text_short', passed: textOverlay.every((line) => line.length <= 12), reason: '모바일 목록에서 읽히는 12자 이하' },
  ];

  let readiness: HomefeedThumbnailPlan['readiness'] = 'READY';
  const readinessReasons: string[] = [];
  if (input.strategy === 'REAL-FIRST' && heroImage.kind !== 'real') {
    readiness = 'NEEDS_REAL_IMAGE';
    readinessReasons.push('실제 사진 우선 주제인데 기사 대표이미지 후보가 없다');
  } else if (heroImage.kind === 'ai' && !input.hasGeneratedImage) {
    readiness = 'NEEDS_AI';
    readinessReasons.push('AI 대표이미지를 아직 만들지 않았다');
  }
  const failed = evaluation.filter((check) => !check.passed);
  if (failed.length >= 3) {
    readiness = 'WEAK';
    readinessReasons.push(...failed.map((check) => check.id));
  }

  return {
    type,
    goal: TYPE_GOAL[type],
    heroImage,
    crop: {
      position: CROP_FOCUS[input.category] ?? '주제 물체 · 장면',
      margin: '가장자리에 10% 여백',
      gaze: input.category === 'entertainment' || input.category === 'sports' ? '시선이 문구 쪽을 향하는 사진을 먼저 고른다' : '해당 없음',
      removeBackground: type === 'OBJECT+PRICE',
      identifiableIn1s: '모바일 목록 크기에서 무엇인지 알아보이는지 확인',
    },
    textOverlay,
    textPosition: type === 'NO-TEXT VISUAL' ? '문구 없음' : type === 'CLEAN INFO' ? '가운데 위, 여백 충분히' : '인물 · 물체 반대편 위쪽 1/3',
    copyVariants,
    visualHierarchy: '장면(주제) → 문구 1줄 → (있으면) 2줄',
    doNotUse: [
      '워터마크 · 자막 · 방송사 로고가 있는 사진',
      '권리를 확인하지 않은 사진을 써도 된다고 표시하기',
      'AI 이미지를 실제 사건 사진처럼 쓰기',
      '제목 문장을 그대로 옮긴 문구',
      '실존 인물 얼굴을 AI 로 재현하기',
    ],
    evaluation,
    readiness,
    readinessReasons,
  };
}
