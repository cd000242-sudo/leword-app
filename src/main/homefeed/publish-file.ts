/**
 * 홈판 신호 공개본 쓰기 — 사이트가 앱 없이도 읽는 정적 JSON(2026-09-17).
 *
 * 사장님: "사이트는 굳이 앱을 안 켜도 보이도록 해 줄래."
 *
 * 변환 규칙은 src/utils/homefeed/publish.ts 가 전부 가진다(순수 함수, 테스트 대상).
 * 이 파일은 경로를 정하고 파일을 쓰는 껍데기다 — 기존 보드 발행기와 같은 나눔이다.
 *
 * 깃에 올리지는 않는다(사장님 선택 2026-09-17). 사이트 작업트리에 변경이 쌓여 있어
 * 앱이 자동으로 커밋하면 남의 작업이 딸려 갈 수 있다.
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EnvironmentManager } from '../../utils/environment-manager';
import { buildHomefeedPublicPayload, resolveSiteDataDir, HOMEFEED_PUBLIC_FILE } from '../../utils/homefeed/publish';
import { storySummary } from './service';
import type { HomefeedStore } from './store';

function homeDir(): string {
  try {
    return app.getPath('home');
  } catch {
    return os.homedir();
  }
}

function configuredSiteDir(): string {
  try {
    return String(EnvironmentManager.getInstance().getConfig().siteRepoDir || '').trim();
  } catch {
    return '';
  }
}

function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

/**
 * 이번 회차 계산본을 사이트 폴더에 써 둔다. 못 쓰면 조용히 넘어가되 이유는 남긴다.
 *
 * 수집 회차가 우선이다 — 발행이 실패해도 회차는 살아야 한다(부르는 쪽이 이 함수를 기다리지 않는다).
 */
export function publishHomefeedPublicFile(store: HomefeedStore): { written: string | null; reason: string | null } {
  try {
    const dir = resolveSiteDataDir({ configured: configuredSiteDir(), home: homeDir(), exists: (target) => fs.existsSync(target) });
    if (!dir) {
      console.log('[HOMEFEED] 사이트 폴더를 찾지 못해 공개본을 쓰지 않았다 — 설정 · 키에서 사이트 폴더를 지정하면 된다.');
      return { written: null, reason: 'NO_SITE_DIR' };
    }

    const file = store.readStories();
    const payload = buildHomefeedPublicPayload({
      computedAt: file.computedAt,
      snapshotAt: file.snapshotAt,
      historySnapshots: file.snapshotCount,
      storedSnapshots: store.countSnapshots(),
      sources: Object.values(store.readSources().sources),
      counts: {
        status: tally(file.stories.map((story) => story.status.state)),
        window: tally(file.stories.map((story) => story.window.state)),
      },
      stories: file.stories.map((story) => storySummary(story, store.readAssets(story.issueKey))),
    }, null, { nowMs: Date.now() });

    if (!payload) {
      console.log('[HOMEFEED] 실을 스토리가 없어 공개본을 덮지 않았다 — 기존 파일을 그대로 둔다.');
      return { written: null, reason: 'NO_STORIES' };
    }

    const dest = path.join(dir, HOMEFEED_PUBLIC_FILE);
    const tmp = `${dest}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 1), 'utf8');
    fs.renameSync(tmp, dest);
    console.log(`[HOMEFEED] 공개본 ${payload.stories.length}건 → ${dest}`);
    return { written: dest, reason: null };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 200);
    console.warn(`[HOMEFEED] 공개본 쓰기 실패(회차는 계속) — ${message}`);
    return { written: null, reason: message };
  }
}
