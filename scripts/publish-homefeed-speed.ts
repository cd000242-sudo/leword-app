import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectHomefeedSnapshot } from '../src/main/homefeed/collector';
import { createHomefeedSourceDeps } from '../src/main/homefeed/sources';
import { createHomefeedStore, writeFileAtomic } from '../src/main/homefeed/store';
import { normalizeHomefeedSettings } from '../src/utils/homefeed/settings';
import { computeSpeedScoreboard } from '../src/utils/homefeed/speed';
import { shortHash } from '../src/utils/homefeed/text';
import { HOMEFEED_COLLECTOR_VERSION, HOMEFEED_SCHEMA, type HomefeedSignalState } from '../src/utils/homefeed/types';

const INTERVAL_MINUTES = 15;

function priorState(file: string): HomefeedSignalState | null {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as HomefeedSignalState;
    return state?.schemaVersion === HOMEFEED_SCHEMA.signalState && state.entries
      && Number.isFinite(Date.parse(state.updatedAt)) && Date.parse(state.updatedAt) < Date.now() ? state : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

async function run(boardFile: string, stateFile: string): Promise<void> {
  const tempRoot = path.resolve(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(tempRoot, 'leword-homefeed-speed-'));
  try {
    const store = createHomefeedStore(temp);
    const prior = priorState(stateFile);
    if (prior) {
      store.writeSignalState(prior);
      store.appendSnapshot({
        schemaVersion: HOMEFEED_SCHEMA.snapshot, collectorVersion: HOMEFEED_COLLECTOR_VERSION,
        capturedAt: prior.updatedAt, intervalMinutes: INTERVAL_MINUTES, issues: [], sources: [],
      });
    }
    const settings = normalizeHomefeedSettings({
      snapshotIntervalMinutes: INTERVAL_MINUTES, ogImagesPerIssue: 0,
      sources: { naverBlog: false, siteBoard: false, ogImage: false },
    });
    const { snapshot } = await collectHomefeedSnapshot(store, settings, createHomefeedSourceDeps(store, { log: console.log }));
    if (!snapshot.issues.length) throw new Error('실시간 순위에서 측정할 이슈를 받지 못했습니다.');
    const state = store.readSignalState();
    writeFileAtomic(stateFile, JSON.stringify(state) + '\n');
    const stories = snapshot.issues.map(({ issueKey, keyword, category, newsBuckets, lead }) => ({
      id: shortHash(issueKey), keyword, category, newsBuckets, lead,
    }));
    const measured = stories.filter((story) => story.newsBuckets).length;
    if (!measured) {
      const news = snapshot.sources.find((source) => source.name === 'naver-news');
      console.warn('::warning::뉴스를 측정하지 못해 이전 공개본을 유지합니다. ' + (news?.error ?? '네이버 뉴스 연결 확인 필요'));
      return;
    }
    const repeatCheck = fs.existsSync(boardFile) ? JSON.parse(fs.readFileSync(boardFile, 'utf8')) : null;
    if (repeatCheck?.snapshotAt && Date.parse(repeatCheck.snapshotAt) >= Date.parse(snapshot.capturedAt)) {
      console.log('공개본에 이미 더 최신 측정값이 있습니다.');
      return;
    }
    const nowMs = Date.now();
    writeFileAtomic(boardFile, JSON.stringify({
      schemaVersion: 'homefeed-speed-v1',
      publishedAt: new Date(nowMs).toISOString(),
      snapshotAt: snapshot.capturedAt,
      computedAt: new Date(nowMs).toISOString(),
      resolutionMinutes: INTERVAL_MINUTES,
      speedScoreboard: computeSpeedScoreboard(state.entries, nowMs, { resolutionMinutes: INTERVAL_MINUTES }),
      stories,
    }, null, 1) + '\n');
    console.log('스피드 체크 공개본 저장 · 실제 뉴스 측정 ' + measured + '건');
  } finally {
    if (path.dirname(temp) === tempRoot && path.basename(temp).startsWith('leword-homefeed-speed-')) {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}

const [boardFile, stateFile] = process.argv.slice(2);
if (!boardFile || !stateFile || path.resolve(boardFile) === path.resolve(stateFile)) {
  console.error('Usage: publish-homefeed-speed.ts <public board> <observation ledger>');
  process.exitCode = 1;
} else {
  void run(boardFile, stateFile).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
