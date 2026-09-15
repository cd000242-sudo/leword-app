/**
 * 스토리 재계산 — 저장소에서 최근 7시간 이력을 읽어 stories.json(D)을 다시 쓴다.
 * 기준은 최신 스냅샷 시각이다(앱이 몇 시간 꺼져 있다 켜져도 마지막 이력으로 계산한다).
 */
import { buildStories } from '../../utils/homefeed/engine';
import type { HomefeedStoriesFile } from '../../utils/homefeed/types';
import type { HomefeedStore } from './store';

const HISTORY_WINDOW_MS = 7 * 3_600_000;

export function recomputeHomefeedStories(store: HomefeedStore, computedAtMs: number = Date.now()): HomefeedStoriesFile {
  const settings = store.readSettings();
  const latestAt = store.latestSnapshotAt();
  const history = latestAt ? store.listSnapshots(Date.parse(latestAt) - HISTORY_WINDOW_MS) : [];
  const file = buildStories({
    history,
    state: store.readSignalState(),
    settings,
    computedAt: new Date(computedAtMs).toISOString(),
    hasGeneratedImage: (issueKey) => store.readAssets(issueKey).images.length > 0,
  });
  store.writeStories(file);
  return file;
}
