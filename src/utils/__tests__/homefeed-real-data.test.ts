import { describe, expect, it } from 'vitest';
import fixture from './fixtures/homefeed-real-snapshots.json';
import { buildStories } from '../homefeed/engine';
import { normalizeHomefeedSettings } from '../homefeed/settings';
import { numberCore, numberTokens } from '../homefeed/text';
import type { HomefeedSignalState, HomefeedSnapshot, HomefeedStory } from '../homefeed/types';

/**
 * 실측 통합 — 이 PC 가 실제로 쌓은 스냅샷(실시간 이슈 · 뉴스 표본 · 블로그 문서수 · 대표이미지)으로 스토리를 조립한다.
 * mock 으로만 통과하지 않게 두는 관문이다. 시각은 픽스처 안 값만 쓴다(벽시계 의존 금지).
 *
 * 지키는 것: 모든 근거는 실제 기사 제목 · 주소에서 나오고, 화면에 나갈 말에는 근거에 없는 숫자가 없다. 같은 이력이면 같은 답이 나온다.
 */
const snapshots = fixture.snapshots as unknown as HomefeedSnapshot[];
const state = fixture.state as unknown as HomefeedSignalState;
const settings = normalizeHomefeedSettings({});
const computedAt = snapshots[snapshots.length - 1].capturedAt;
const built = buildStories({ history: snapshots, state, settings, computedAt });
const stories = built.stories;

const spanMinutes = (Date.parse(snapshots[snapshots.length - 1].capturedAt) - Date.parse(snapshots[0].capturedAt)) / 60_000;
const titlesOf = (story: HomefeedStory) => story.evidence.map((item) => item.title).join(' | ');

describe('실측 스냅샷으로 조립한 스토리', () => {
  it('실제 회차가 충분히 쌓인 이력이다', () => {
    expect(snapshots.length).toBeGreaterThanOrEqual(4);
    expect(spanMinutes).toBeGreaterThanOrEqual(50);
    expect(stories.length).toBeGreaterThan(0);
    expect(built.snapshotAt).toBe(computedAt);
  });

  it('모든 스토리가 실제 기사 표본과 창 · 상태 사유를 가진다', () => {
    for (const story of stories) {
      expect(story.evidence.length, story.keyword).toBeGreaterThan(0);
      expect(story.evidence.every((item) => /^https?:\/\//.test(item.url)), story.keyword).toBe(true);
      expect(['OPENING', 'OPEN', 'NARROWING', 'CLOSED', 'UNKNOWN']).toContain(story.window.state);
      expect(['NOW', 'EARLY', 'WATCH', 'LATE', 'DROP']).toContain(story.status.state);
      expect(story.window.reasons.length, story.keyword).toBeGreaterThan(0);
      expect(story.status.reasons.length, story.keyword).toBeGreaterThan(0);
    }
  });

  it('두 시점을 다 잰 이슈는 증가량이 숫자로, 한쪽이라도 못 쟀으면 null 로 남는다', () => {
    const measured = stories.filter((story) => story.signals.docDelta30m !== null || story.signals.docDelta60m !== null);
    expect(measured.length).toBeGreaterThan(0);
    for (const story of stories) {
      const { docDelta30m, docVelocity30m, blogDocNow } = story.signals;
      if (docDelta30m === null) expect(docVelocity30m, story.keyword).toBeNull();
      else expect(typeof docVelocity30m).toBe('number');
      expect(blogDocNow === null || typeof blogDocNow === 'number').toBe(true);
      expect(story.signals.presence60m.total).toBeGreaterThan(0);
    }
  });

  it('긴장 · 재미 근거 · 정보층은 실제 제목에서 나온 말이고 근거 주소가 붙는다', () => {
    for (const story of stories) {
      for (const tension of story.tensions) {
        expect(tension.evidence.url, story.keyword).toMatch(/^https?:\/\//);
        expect(story.evidence.some((item) => item.url === tension.evidence.url), tension.matched).toBe(true);
      }
      for (const reason of story.funGap) {
        expect(story.evidence.some((item) => item.url === reason.evidence.url), reason.flag).toBe(true);
      }
      for (const layer of story.payoffLayers) {
        expect(layer.evidence.title.includes(layer.value) || titlesOf(story).includes(layer.value), `${story.keyword} ${layer.value}`).toBe(true);
      }
    }
  });

  it('화면에 나갈 말에는 근거에 없는 숫자가 없다', () => {
    for (const story of stories) {
      const allowed = new Set([...numberTokens(titlesOf(story)), ...numberTokens(story.keyword)].map(numberCore));
      const shown = [story.firstCard.headline1, story.firstCard.headline2 ?? '', ...story.thumbnail.textOverlay, ...story.thumbnail.copyVariants, story.delta?.text ?? ''].join(' ');
      for (const token of numberTokens(shown)) {
        expect(allowed.has(numberCore(token)), `${story.keyword}: ${token}`).toBe(true);
      }
    }
  });

  it('기사 사진은 권리 확인 필요 · 워터마크 모름으로만 싣고, 실제 표본 이미지 주소만 쓴다', () => {
    const images = stories.flatMap((story) => story.realImages);
    for (const item of images) {
      expect(item.rightsStatus).toBe('rights_check_required');
      expect(item.watermark).toBe('unknown');
      const story = stories.find((row) => row.realImages.includes(item)) as HomefeedStory;
      expect(story.evidence.some((sample) => sample.image === item.imageUrl)).toBe(true);
    }
    expect(JSON.stringify(images)).not.toMatch(/사용\s?가능/);
  });

  it('같은 이력이면 같은 답 — id · 근거 해시까지 같다', () => {
    const again = buildStories({ history: snapshots, state, settings, computedAt });
    expect(JSON.stringify(again)).toBe(JSON.stringify(built));
    expect(new Set(stories.map((story) => story.id)).size).toBe(stories.length);
  });

  it('AI 없이도 제목 · 이미지 계획을 세운다 — 프롬프트는 AI 생성 표기를 달고 나간다', () => {
    for (const story of stories) {
      expect(story.aiPrompts.length).toBeGreaterThan(0);
      for (const plan of story.aiPrompts) {
        expect(plan.label).toContain('AI 생성 이미지');
        expect(plan.negativePrompt).toContain('워터마크');
        expect(plan.finalPromptEn.length).toBeGreaterThan(40);
      }
      expect(['READY', 'NEEDS_REAL_IMAGE', 'NEEDS_AI', 'WEAK']).toContain(story.thumbnail.readiness);
    }
  });
});
