/**
 * 홈판 신호(STORY RADAR v2.0) 공용 타입 — 사장님 명령서 2026-09-16.
 *
 * 단위는 키워드가 아니라 스토리 후보다. 수치는 전부 실측 · 단순 산술이고, 못 잰 값은 null 이다(화면에서 '미측정').
 * 점수 · 확률 칸은 두지 않는다 — 판정은 사유 코드 배열로만 남긴다.
 * 저장은 앱 userData/homefeed 아래 JSON(스키마 버전 문자열)이다. 운영 DB 가 없어 파괴적 마이그레이션도 없다.
 */

export const HOMEFEED_SCHEMA = {
  snapshot: 'homefeed-snapshot-v1',
  sources: 'homefeed-sources-v1',
  signalState: 'homefeed-signal-state-v1',
  stories: 'homefeed-stories-v1',
  assets: 'homefeed-assets-v1',
  posts: 'homefeed-posts-v1',
  performance: 'homefeed-performance-v1',
  settings: 'homefeed-settings-v1',
  ogCache: 'homefeed-og-cache-v1',
  image: 'homefeed-image-v1',
} as const;

export const HOMEFEED_COLLECTOR_VERSION = 'homefeed-collector-1';

export type HomefeedCategory =
  | 'entertainment' | 'sports' | 'money' | 'house' | 'car' | 'tech' | 'food'
  | 'travel' | 'work' | 'family' | 'health' | 'policy' | 'incident' | 'weather' | 'unknown';

/** 순위를 주는 실시간 목록. 원천 확산(원천 수)은 이 네 곳만 센다. */
export type HomefeedRankSource = 'signal.bz' | 'nate' | 'google' | 'daum';
export const HOMEFEED_RANK_SOURCES: readonly HomefeedRankSource[] = ['signal.bz', 'nate', 'google', 'daum'];

export type HomefeedSourceName = HomefeedRankSource | 'naver-news' | 'naver-blog' | 'site-issue-board' | 'og-image';

export interface HomefeedSample {
  title: string;
  url: string;
  /** 원문 매체 도메인. 못 읽으면 null. */
  press: string | null;
  publishedAt: string | null;
  /** 기사 대표이미지(og:image) 주소 — 후보일 뿐 사용 허가가 아니다. 못 꺼냈거나 안 봤으면 null. */
  image: string | null;
  origin: 'naver-news' | 'site-issue-board';
}

export interface HomefeedIssueSnapshot {
  issueKey: string;
  keyword: string;
  category: HomefeedCategory;
  /** 원천별 순위. 목록에 없으면 null, 그 원천을 이번 회차에 못 받았으면 키 자체가 없다. */
  ranks: Partial<Record<HomefeedRankSource, number | null>>;
  /** 뉴스 검색 total. 못 받았으면 null. */
  newsTotal: number | null;
  /** 블로그 문서수(검색 total). 못 받았으면 null. */
  blogDocCount: number | null;
  samples: HomefeedSample[];
  /** 사이트 이슈 보드의 '왜 뜨나'(헤드라인 검증 통과분). 없으면 null. */
  boardWhy: string | null;
}

export interface HomefeedSourceRun {
  name: HomefeedSourceName;
  ok: boolean;
  count: number;
  error: string | null;
  /** 설정에서 껐거나 키가 없어 부르지 않았다. */
  skipped?: boolean;
}

export interface HomefeedSnapshot {
  schemaVersion: typeof HOMEFEED_SCHEMA.snapshot;
  capturedAt: string;
  collectorVersion: string;
  intervalMinutes: number;
  sources: HomefeedSourceRun[];
  issues: HomefeedIssueSnapshot[];
}

export interface HomefeedSignalStateEntry {
  issueKey: string;
  keyword: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 기록 시작 전(또는 앱이 꺼져 있던 구간)에 이미 떠 있었을 수 있다 — 나이는 '이상'으로만 말한다. */
  firstSeenCensored: boolean;
  appearances: number;
}

export interface HomefeedSignalState {
  schemaVersion: typeof HOMEFEED_SCHEMA.signalState;
  updatedAt: string | null;
  entries: Record<string, HomefeedSignalStateEntry>;
}

export interface HomefeedSourceStatus {
  name: HomefeedSourceName;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastCount: number;
  skipped: boolean;
}

export interface HomefeedSourcesLedger {
  schemaVersion: typeof HOMEFEED_SCHEMA.sources;
  updatedAt: string | null;
  sources: Partial<Record<HomefeedSourceName, HomefeedSourceStatus>>;
}

export interface HomefeedSignals {
  ageMinutes: number | null;
  firstSeenAt: string | null;
  firstSeenCensored: boolean;
  sourceCountNow: number | null;
  sourceNames: HomefeedRankSource[];
  sourceDelta30m: number | null;
  sourceDelta60m: number | null;
  pressCountNow: number;
  /** signal.bz 순위가 있으면 그것, 없으면 가장 높은 순위. */
  rankNow: number | null;
  rankSource: HomefeedRankSource | null;
  /** 지금 순위 − 과거 순위. 음수 = 상승. */
  rankDelta30m: number | null;
  rankDelta60m: number | null;
  newsTotalNow: number | null;
  newsDelta30m: number | null;
  blogDocNow: number | null;
  docDelta10m: number | null;
  docDelta30m: number | null;
  docDelta60m: number | null;
  /** 최근 30분 블로그 문서 증가 ÷ 30(분당). */
  docVelocity30m: number | null;
  /** (최근 0~30분 증가) − (30~60분 증가). */
  docAcceleration: number | null;
  /** 최신 회차부터 연속으로 목록에 있던 회차 수(원천을 못 받은 회차는 건너뛴다). */
  persistenceStreak: number;
  /** 최근 60분에 실제로 찍힌 회차(total) 중 목록에 있던 회차(seen). */
  presence60m: { seen: number; total: number };
  sampleN: number;
  cloneN: number | null;
  cloneRatio: number | null;
  cloneRatioPrev30m: number | null;
  visualCandidateCount: number;
}

export interface HomefeedEvidenceRef {
  title: string;
  url: string;
  press: string | null;
  publishedAt: string | null;
}

export type HomefeedTensionType =
  | 'number_conflict' | 'relationship_shift' | 'expectation_break' | 'action_reversal'
  | 'identity_contrast' | 'past_vs_now' | 'result_first' | 'scale_mismatch' | 'hidden_reason';

export interface HomefeedTension {
  type: HomefeedTensionType;
  /** 제목에서 실제로 걸린 말. */
  matched: string;
  evidence: HomefeedEvidenceRef;
}

export type HomefeedFunGapFlag =
  | 'unexpected_fact' | 'surprising_number' | 'relationship_change' | 'strong_quote' | 'visible_contrast'
  | 'before_after' | 'unusual_object_price' | 'outcome_mismatch' | 'socially_tellable' | 'visual_curiosity';

export interface HomefeedFunGapReason {
  flag: HomefeedFunGapFlag;
  note: string;
  evidence: HomefeedEvidenceRef;
}

export interface HomefeedAngle {
  label: string;
  tokens: string[];
  evidence: HomefeedEvidenceRef[];
}

export interface HomefeedRevealLayer {
  kind: 'number' | 'quote' | 'event';
  value: string;
  evidence: HomefeedEvidenceRef;
}

export interface HomefeedDelta {
  text: string;
  newTokens: string[];
  evidence: HomefeedEvidenceRef;
  /** 비교한 이전 회차 시각. */
  comparedWith: string;
}

export interface HomefeedCheck {
  id: string;
  passed: boolean;
  reason: string;
}

export interface HomefeedNoSearch {
  situationIn1s: boolean;
  immediateWhy: boolean;
  answerWanted: boolean;
  imageIncreasesCuriosity: boolean;
  payoffBeyondAnswer: boolean;
  /** 앞 세 항목이 모두 참일 때만 통과 — 하나라도 거짓이면 NOW 가 될 수 없다. */
  passed: boolean;
  checks: HomefeedCheck[];
}

export interface HomefeedTellability {
  passed: boolean;
  sentence: string | null;
  evidence: HomefeedEvidenceRef | null;
  reason: string;
}

export type HomefeedWindowState = 'OPENING' | 'OPEN' | 'NARROWING' | 'CLOSED' | 'UNKNOWN';
export type HomefeedStoryStatus = 'NOW' | 'EARLY' | 'WATCH' | 'LATE' | 'DROP';

export interface HomefeedDecision<T extends string> {
  state: T;
  reasons: string[];
}

export type HomefeedVisualStrategy = 'REAL-FIRST' | 'AI-FIRST' | 'HYBRID';
export type HomefeedAspectRatio = '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
export const HOMEFEED_ASPECT_RATIOS: readonly HomefeedAspectRatio[] = ['16:9', '1:1', '4:3', '3:4', '9:16'];

export interface HomefeedVisualDecision {
  strategy: HomefeedVisualStrategy;
  reason: string;
  whyReal: string;
  whyAi: string;
  evidenceImageRequired: boolean;
}

export type HomefeedRightsStatus = 'user_owned' | 'official_source' | 'attribution_needed' | 'rights_check_required';

export interface HomefeedRealImageGuideItem {
  id: string;
  role: 'hero' | 'proof' | 'secondary' | 'context';
  sourceName: string | null;
  /** 기사 페이지 주소. */
  sourceUrl: string;
  /** og:image 후보 주소. 검증된 직링크가 아니다. */
  imageUrl: string | null;
  pageLocation: string;
  caption: string | null;
  watermark: 'yes' | 'no' | 'unknown';
  rightsStatus: HomefeedRightsStatus;
  whyThisImage: string;
  cropFocus: string;
  avoidCrop: string;
  mobileReadability: string;
  thumbnailSuitability: { label: 'good' | 'check' | 'weak'; basis: string };
}

export interface HomefeedAiPromptPlan {
  id: string;
  purpose: string;
  placement: string;
  aspectRatio: HomefeedAspectRatio;
  composition: string;
  subject: string;
  background: string;
  lighting: string;
  camera: string;
  realism: string;
  koreanContext: string;
  textSpace: string;
  negativePrompt: string;
  finalPromptKo: string;
  finalPromptEn: string;
  /** 실제 인물 기사라 식별 가능한 얼굴 대신 상징 장면으로 짰다. */
  realPersonSafe: boolean;
  /** 화면 · 원고에 붙일 표기. */
  label: string;
  refinedBy: string | null;
}

export type HomefeedThumbnailType =
  | 'FACE+NUMBER' | 'OBJECT+PRICE' | 'BEFORE/AFTER' | 'QUOTE+SCENE'
  | 'CONTRAST SPLIT' | 'RESULT FIRST' | 'CLEAN INFO' | 'NO-TEXT VISUAL';

export type HomefeedThumbnailReadiness = 'READY' | 'NEEDS_REAL_IMAGE' | 'NEEDS_AI' | 'WEAK';

export interface HomefeedImageRef {
  kind: 'real' | 'ai' | 'none';
  guideId: string | null;
  imageUrl: string | null;
}

export interface HomefeedThumbnailPlan {
  type: HomefeedThumbnailType;
  goal: string;
  heroImage: HomefeedImageRef;
  crop: { position: string; margin: string; gaze: string; removeBackground: boolean; identifiableIn1s: string };
  /** 0~2줄. 줄마다 설정 상한 글자 수 안. */
  textOverlay: string[];
  textPosition: string;
  copyVariants: string[];
  visualHierarchy: string;
  doNotUse: string[];
  evaluation: HomefeedCheck[];
  readiness: HomefeedThumbnailReadiness;
  readinessReasons: string[];
}

export interface HomefeedCardVariant {
  id: 'A' | 'B' | 'C';
  label: string;
  image: HomefeedImageRef;
  line1: string;
  line2: string | null;
}

export interface HomefeedFirstCard {
  possible: boolean;
  imageStrategy: HomefeedVisualStrategy;
  image: HomefeedImageRef;
  cropGuidance: string;
  headline1: string;
  headline2: string | null;
  /** 첫 10~15자 안에 들어갈 걸림 말(근거 제목에 있는 말). */
  hook: string | null;
  secondHook: string | null;
  reason: string;
  checks: HomefeedCheck[];
  variants: HomefeedCardVariant[];
}

export interface HomefeedEvidenceItem extends HomefeedEvidenceRef {
  image: string | null;
  origin: HomefeedSample['origin'];
}

export interface HomefeedStory {
  id: string;
  issueKey: string;
  keyword: string;
  category: HomefeedCategory;
  capturedAt: string;
  /** 근거(표본 주소 · 델타 · 긴장 유형) 해시. 바뀌면 AI 캐시를 버린다. */
  evidenceHash: string;
  signals: HomefeedSignals;
  anchor: { text: string; category: HomefeedCategory };
  delta: HomefeedDelta | null;
  deltaReason: string | null;
  tensions: HomefeedTension[];
  dominantAngle: HomefeedAngle | null;
  alternativeAngles: HomefeedAngle[];
  angleConfidence: 'high' | 'medium' | 'low';
  funGap: HomefeedFunGapReason[];
  payoffLayers: HomefeedRevealLayer[];
  noSearch: HomefeedNoSearch;
  tellability: HomefeedTellability;
  firstCard: HomefeedFirstCard;
  visual: HomefeedVisualDecision;
  realImages: HomefeedRealImageGuideItem[];
  aiPrompts: HomefeedAiPromptPlan[];
  thumbnail: HomefeedThumbnailPlan;
  window: HomefeedDecision<HomefeedWindowState>;
  status: HomefeedDecision<HomefeedStoryStatus>;
  risks: string[];
  boardWhy: string | null;
  evidence: HomefeedEvidenceItem[];
}

export interface HomefeedStoriesFile {
  schemaVersion: typeof HOMEFEED_SCHEMA.stories;
  computedAt: string | null;
  snapshotAt: string | null;
  snapshotCount: number;
  stories: HomefeedStory[];
}

export type HomefeedTriggerType =
  | 'direct_quote' | 'number_conflict' | 'relation_shift' | 'expectation_break'
  | 'result_first' | 'identity_hide' | 'object_price' | 'before_after';

export type HomefeedTitleVerdict = 'STOP' | 'FLAT' | 'OVER';

export interface HomefeedTitleCandidate {
  id: string;
  title: string;
  firstHook: string;
  secondHook: string;
  triggerType: HomefeedTriggerType | null;
  verdict: HomefeedTitleVerdict;
  reasons: string[];
  aiVerdict: HomefeedTitleVerdict | null;
  /** 표본 기사 제목과의 최대 어절 겹침(자카드). 표본이 없으면 null. */
  overlapWithSample: number | null;
  overclaim: { unsupportedNumbers: string[]; hypeWords: string[] };
  bestVisualPair: 'real' | 'ai' | 'hybrid' | null;
  thumbCopy: string | null;
}

export interface HomefeedTitleVisualPair {
  id: string;
  titleId: string;
  title: string;
  visualStrategy: HomefeedVisualStrategy;
  heroImage: HomefeedImageRef;
  thumbnailCopy: string[];
  why: string;
}

export interface HomefeedDraftResult {
  id: string;
  createdAt: string;
  provider: string;
  titleId: string | null;
  text: string;
  problems: string[];
  retried: boolean;
  evidenceHash: string;
}

export interface HomefeedImageRecord {
  id: string;
  storyId: string;
  promptId: string;
  createdAt: string;
  provider: 'codex-builtin';
  aspectRatio: HomefeedAspectRatio;
  promptKo: string;
  promptEn: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  aiGenerated: true;
  label: string;
}

export interface HomefeedAiStoryReview {
  provider: string;
  createdAt: string;
  evidenceHash: string;
  tensions: Array<{ type: HomefeedTensionType; evidenceIndex: number; note: string }>;
  funGap: Array<{ flag: HomefeedFunGapFlag; evidenceIndex: number; note: string }>;
  risks: string[];
}

export interface HomefeedAssets {
  schemaVersion: typeof HOMEFEED_SCHEMA.assets;
  issueKey: string;
  updatedAt: string | null;
  review: HomefeedAiStoryReview | null;
  titles: {
    evidenceHash: string;
    provider: string;
    createdAt: string;
    candidates: HomefeedTitleCandidate[];
    top: string[];
    pairs: HomefeedTitleVisualPair[];
  } | null;
  visual: { evidenceHash: string; createdAt: string; refinedBy: string | null; prompts: HomefeedAiPromptPlan[] } | null;
  selection: { storyId: string; titleId: string; pairId: string | null; selectedAt: string } | null;
  drafts: HomefeedDraftResult[];
  images: HomefeedImageRecord[];
}

export type HomefeedCheckpoint = '30m' | '2h' | '6h' | '24h';
export const HOMEFEED_CHECKPOINTS: readonly HomefeedCheckpoint[] = ['30m', '2h', '6h', '24h'];

export interface HomefeedPost {
  id: string;
  storyId: string;
  issueKey: string;
  keyword: string;
  title: string;
  titleId: string | null;
  triggerType: string | null;
  storyPattern: string | null;
  visualStrategy: string | null;
  thumbnailType: string | null;
  thumbnailHasText: boolean | null;
  postUrl: string;
  publishedAt: string;
  recordedAt: string;
  atPublish: {
    window: HomefeedWindowState;
    status: HomefeedStoryStatus;
    ageMinutes: number | null;
    sourceCountNow: number | null;
    cloneRatio: number | null;
  };
}

export interface HomefeedPostsFile {
  schemaVersion: typeof HOMEFEED_SCHEMA.posts;
  posts: HomefeedPost[];
}

export interface HomefeedPerformanceEntry {
  postId: string;
  checkpoint: HomefeedCheckpoint;
  recordedAt: string;
  totalViews: number | null;
  searchViews: number | null;
  recommendViews: number | null;
  /** 홈판(피드)에서 직접 확인했는가. 모르면 null. */
  feedSeen: boolean | null;
  referrerNote: string;
}

export interface HomefeedPerformanceFile {
  schemaVersion: typeof HOMEFEED_SCHEMA.performance;
  entries: HomefeedPerformanceEntry[];
}
