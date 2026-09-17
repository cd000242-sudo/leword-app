import type { HomefeedAssets, HomefeedStory } from '../../utils/homefeed/types';
import { editorialView } from './editorial-state';

export function publicStoryDetail(story: HomefeedStory, assets: HomefeedAssets) {
  const editorial = editorialView(story, assets, true);
  // 본문 전체와 개인 작업 상태는 발행하지 않는다. 명시적으로 공개한 작성안도 출처 링크와 짧은 근거만 제공한다.
  if (editorial.brief) {
    editorial.brief = { ...editorial.brief, sources: editorial.brief.sources.map((source) => ({ ...source, text: '' })) };
  }
  return {
    story: {
      id: story.id, issueKey: story.issueKey, keyword: story.keyword, category: story.category, capturedAt: story.capturedAt,
      evidenceHash: story.evidenceHash, signals: story.signals, anchor: story.anchor, delta: story.delta, deltaReason: story.deltaReason,
      tensions: story.tensions, dominantAngle: story.dominantAngle, alternativeAngles: story.alternativeAngles,
      angleConfidence: story.angleConfidence, funGap: story.funGap, payoffLayers: story.payoffLayers,
      noSearch: story.noSearch, tellability: story.tellability, firstCard: story.firstCard, visual: story.visual,
      realImages: story.realImages, aiPrompts: [], thumbnail: story.thumbnail, window: story.window, status: story.status,
      risks: story.risks, boardWhy: story.boardWhy,
      evidence: story.evidence.map((row) => ({ title: row.title, url: row.url, press: row.press, publishedAt: row.publishedAt, image: row.image, origin: row.origin, description: row.description?.slice(0, 400) })),
    },
    editorial, readOnly: true, timeline: [],
    assets: { review: null, titles: null, prompts: [], promptsRefinedBy: null, selection: null, drafts: [], images: [] },
  };
}
