/**
 * 홈판 신호 중앙 설정 — 판정 임계값은 전부 여기 한 곳이다.
 *
 * 기본값은 보정 전 **가설값**이다. 성과학습이 쌓여도 코드가 스스로 바꾸지 않는다 — 사장님이 관리자 설정에서 고친다.
 * 수집은 기본 꺼짐: 켜면 10분마다 이 PC 사용자 본인 네이버 키 쿼터를 쓴다(뉴스 검색 · 블로그 문서수).
 */
import { HOMEFEED_ASPECT_RATIOS, HOMEFEED_SCHEMA, type HomefeedAspectRatio } from './types';

export type HomefeedImageProvider = 'none' | 'codex-builtin';

export interface HomefeedSettings {
  schemaVersion: typeof HOMEFEED_SCHEMA.settings;
  enabled: boolean;
  snapshotIntervalMinutes: number;
  issueLimit: number;
  newsSampleSize: number;
  ogImagesPerIssue: number;
  retentionDays: number;
  cloneThreshold: number;
  window: {
    openingMaxAgeMinutes: number;
    openMinSources: number;
    openMaxCloneRatio: number;
    narrowingCloneRise: number;
    narrowingDocVelocity: number;
    closedCloneRatio: number;
  };
  story: {
    payoffMin: number;
    minSamplesForNow: number;
    minPressForNow: number;
  };
  sources: {
    signalBz: boolean;
    hotLanes: boolean;
    naverNews: boolean;
    naverBlog: boolean;
    siteBoard: boolean;
    ogImage: boolean;
  };
  ai: {
    storyReview: boolean;
    title: boolean;
    visualPrompt: boolean;
    draft: boolean;
  };
  imageProvider: HomefeedImageProvider;
  defaultAspectRatio: HomefeedAspectRatio;
  thumbnailTextMaxChars: number;
  calibration: {
    sampleShortN: number;
    successRateMinN: number;
  };
  updatedAt: string | null;
}

export const DEFAULT_HOMEFEED_SETTINGS: HomefeedSettings = Object.freeze({
  schemaVersion: HOMEFEED_SCHEMA.settings,
  enabled: false,
  snapshotIntervalMinutes: 10,
  issueLimit: 12,
  newsSampleSize: 10,
  ogImagesPerIssue: 3,
  retentionDays: 7,
  cloneThreshold: 0.6,
  window: Object.freeze({
    openingMaxAgeMinutes: 90,
    openMinSources: 1,
    openMaxCloneRatio: 0.5,
    narrowingCloneRise: 0.1,
    narrowingDocVelocity: 3,
    closedCloneRatio: 0.8,
  }),
  story: Object.freeze({
    payoffMin: 2,
    minSamplesForNow: 3,
    minPressForNow: 2,
  }),
  sources: Object.freeze({
    signalBz: true,
    hotLanes: true,
    naverNews: true,
    naverBlog: true,
    siteBoard: true,
    ogImage: true,
  }),
  ai: Object.freeze({
    storyReview: true,
    title: true,
    visualPrompt: true,
    draft: true,
  }),
  imageProvider: 'none',
  defaultAspectRatio: '16:9',
  thumbnailTextMaxChars: 12,
  calibration: Object.freeze({
    sampleShortN: 5,
    successRateMinN: 20,
  }),
  updatedAt: null,
}) as HomefeedSettings;

/** 명령서 하한 — 설정으로도 못 내린다(5분 아래 수집 · 표본 5 미만 수치 · 20 미만 성공률 금지). */
export const HOMEFEED_FLOORS = Object.freeze({
  snapshotIntervalMinutes: 5,
  sampleShortN: 5,
  successRateMinN: 20,
});

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : Math.round(clamped * 1000) / 1000;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 저장본 · 화면에서 온 값을 설정으로 맞춘다. 모르는 칸은 버리고, 범위 밖 값은 경계로 자른다.
 * base 를 주면 거기에 덮는다(부분 수정).
 */
export function normalizeHomefeedSettings(raw: unknown, base: HomefeedSettings = DEFAULT_HOMEFEED_SETTINGS): HomefeedSettings {
  const input = isPlain(raw) ? raw : {};
  const window = isPlain(input.window) ? input.window : {};
  const story = isPlain(input.story) ? input.story : {};
  const sources = isPlain(input.sources) ? input.sources : {};
  const ai = isPlain(input.ai) ? input.ai : {};
  const calibration = isPlain(input.calibration) ? input.calibration : {};
  const aspect = HOMEFEED_ASPECT_RATIOS.find((ratio) => ratio === input.defaultAspectRatio);
  const provider = input.imageProvider === 'codex-builtin' || input.imageProvider === 'none' ? input.imageProvider : base.imageProvider;

  return {
    schemaVersion: HOMEFEED_SCHEMA.settings,
    enabled: bool(input.enabled, base.enabled),
    snapshotIntervalMinutes: num(input.snapshotIntervalMinutes, base.snapshotIntervalMinutes, HOMEFEED_FLOORS.snapshotIntervalMinutes, 180, true),
    issueLimit: num(input.issueLimit, base.issueLimit, 1, 20, true),
    newsSampleSize: num(input.newsSampleSize, base.newsSampleSize, 5, 20, true),
    ogImagesPerIssue: num(input.ogImagesPerIssue, base.ogImagesPerIssue, 0, 5, true),
    retentionDays: num(input.retentionDays, base.retentionDays, 1, 30, true),
    cloneThreshold: num(input.cloneThreshold, base.cloneThreshold, 0.3, 0.9),
    window: {
      openingMaxAgeMinutes: num(window.openingMaxAgeMinutes, base.window.openingMaxAgeMinutes, 10, 720, true),
      openMinSources: num(window.openMinSources, base.window.openMinSources, 1, 4, true),
      openMaxCloneRatio: num(window.openMaxCloneRatio, base.window.openMaxCloneRatio, 0.1, 0.95),
      narrowingCloneRise: num(window.narrowingCloneRise, base.window.narrowingCloneRise, 0.01, 0.9),
      narrowingDocVelocity: num(window.narrowingDocVelocity, base.window.narrowingDocVelocity, 0.1, 1000),
      closedCloneRatio: num(window.closedCloneRatio, base.window.closedCloneRatio, 0.2, 1),
    },
    story: {
      payoffMin: num(story.payoffMin, base.story.payoffMin, 1, 6, true),
      minSamplesForNow: num(story.minSamplesForNow, base.story.minSamplesForNow, 1, 20, true),
      minPressForNow: num(story.minPressForNow, base.story.minPressForNow, 1, 10, true),
    },
    sources: {
      signalBz: bool(sources.signalBz, base.sources.signalBz),
      hotLanes: bool(sources.hotLanes, base.sources.hotLanes),
      naverNews: bool(sources.naverNews, base.sources.naverNews),
      naverBlog: bool(sources.naverBlog, base.sources.naverBlog),
      siteBoard: bool(sources.siteBoard, base.sources.siteBoard),
      ogImage: bool(sources.ogImage, base.sources.ogImage),
    },
    ai: {
      storyReview: bool(ai.storyReview, base.ai.storyReview),
      title: bool(ai.title, base.ai.title),
      visualPrompt: bool(ai.visualPrompt, base.ai.visualPrompt),
      draft: bool(ai.draft, base.ai.draft),
    },
    imageProvider: provider,
    defaultAspectRatio: aspect ?? base.defaultAspectRatio,
    thumbnailTextMaxChars: num(input.thumbnailTextMaxChars, base.thumbnailTextMaxChars, 7, 16, true),
    calibration: {
      sampleShortN: num(calibration.sampleShortN, base.calibration.sampleShortN, HOMEFEED_FLOORS.sampleShortN, 50, true),
      successRateMinN: num(calibration.successRateMinN, base.calibration.successRateMinN, HOMEFEED_FLOORS.successRateMinN, 500, true),
    },
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : base.updatedAt,
  };
}
