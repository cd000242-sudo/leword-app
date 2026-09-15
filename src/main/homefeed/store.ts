/**
 * 홈판 신호 저장소 — 앱 userData/homefeed 아래 JSON 파일들(명령서의 테이블 A~H 대응).
 *
 * 운영 DB 가 없다. 파일마다 스키마 버전 문자열을 싣고, 버전이 다르면 읽지 않고 새로 만든다(기존 캐시들과 같은 규칙).
 * 쓰기는 임시 파일 → 이름 바꾸기로 원자적으로 한다. electron 에 기대지 않는다 — 기준 폴더를 받아 테스트에서 그대로 쓴다.
 *
 *   snapshots/YYYY-MM-DD/HHmmssSSS.json   A 스냅샷(UTC 시각 이름 — 이름순 = 시간순)
 *   sources.json                          B 원천 상태
 *   signal-state.json                     C 처음 본 시각 장부
 *   stories.json                          D 스토리 후보(최신 계산본)
 *   assets/<이슈키 해시>.json             E·F 이미지 프롬프트 · 제목 · 제목-이미지 조합 · 원고 · 생성 이미지 기록
 *   posts.json                            G 발행 기록
 *   performance.json                      H 성과 스냅샷
 *   settings.json · og-cache.json · images/
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  HOMEFEED_SCHEMA,
  type HomefeedAssets,
  type HomefeedImageRecord,
  type HomefeedPerformanceFile,
  type HomefeedPostsFile,
  type HomefeedSignalState,
  type HomefeedSnapshot,
  type HomefeedSourcesLedger,
  type HomefeedStoriesFile,
} from '../../utils/homefeed/types';
import { DEFAULT_HOMEFEED_SETTINGS, normalizeHomefeedSettings, type HomefeedSettings } from '../../utils/homefeed/settings';
import { shortHash } from '../../utils/homefeed/text';

export interface OgCacheFile {
  schemaVersion: typeof HOMEFEED_SCHEMA.ogCache;
  entries: Record<string, { image: string | null; at: string }>;
}

export interface HomefeedStore {
  readonly dir: string;
  readSettings(): HomefeedSettings;
  writeSettings(settings: HomefeedSettings): void;
  appendSnapshot(snapshot: HomefeedSnapshot): string;
  listSnapshots(sinceMs?: number): HomefeedSnapshot[];
  /** 가장 최근 스냅샷 시각(파일 이름으로만 — 내용을 읽지 않는다). 없으면 null. */
  latestSnapshotAt(): string | null;
  countSnapshots(): number;
  readSignalState(): HomefeedSignalState;
  writeSignalState(state: HomefeedSignalState): void;
  readSources(): HomefeedSourcesLedger;
  writeSources(ledger: HomefeedSourcesLedger): void;
  readStories(): HomefeedStoriesFile;
  writeStories(file: HomefeedStoriesFile): void;
  readAssets(issueKey: string): HomefeedAssets;
  writeAssets(assets: HomefeedAssets): void;
  readPosts(): HomefeedPostsFile;
  writePosts(file: HomefeedPostsFile): void;
  readPerformance(): HomefeedPerformanceFile;
  writePerformance(file: HomefeedPerformanceFile): void;
  readOgCache(): OgCacheFile;
  writeOgCache(file: OgCacheFile): void;
  saveImage(record: HomefeedImageRecord, data: Buffer): void;
  readImage(id: string): { record: HomefeedImageRecord; data: Buffer } | null;
  pruneSnapshots(retentionDays: number, nowMs: number): number;
}

const IMAGE_ID_RE = /^[a-z0-9-]{6,64}$/;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 임시 파일에 쓰고 이름을 바꾼다. 윈도우에서 백신 등이 파일을 잡고 있으면 잠깐 기다려 다시 한다. */
export function writeFileAtomic(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (attempt === 3) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* 임시 파일 정리 실패는 무시 */ }
        throw error;
      }
      sleepSync(40 * (attempt + 1));
    }
  }
}

function readVersioned<T>(file: string, schema: string, fallback: () => T): T {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && parsed.schemaVersion === schema) return parsed as T;
  } catch { /* 없거나 깨졌으면 새로 만든다 */ }
  return fallback();
}

function snapshotPath(dir: string, capturedAt: string): string {
  const iso = new Date(capturedAt).toISOString();
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 23).replace(/[:.]/g, '');
  return path.join(dir, 'snapshots', day, `${time}.json`);
}

function snapshotMsFromPath(day: string, file: string): number {
  const match = /^(\d{2})(\d{2})(\d{2})(\d{3})\.json$/.exec(file);
  if (!match) return NaN;
  return Date.parse(`${day}T${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`);
}

export function emptyAssets(issueKey: string): HomefeedAssets {
  return {
    schemaVersion: HOMEFEED_SCHEMA.assets,
    issueKey,
    updatedAt: null,
    review: null,
    titles: null,
    visual: null,
    selection: null,
    drafts: [],
    images: [],
  };
}

export function createHomefeedStore(baseDir: string): HomefeedStore {
  const dir = baseDir;
  const file = (name: string) => path.join(dir, name);
  const assetsFile = (issueKey: string) => path.join(dir, 'assets', `${shortHash(issueKey, 16)}.json`);
  const writeJson = (target: string, value: unknown) => writeFileAtomic(target, JSON.stringify(value));

  return {
    dir,
    readSettings() {
      try {
        const parsed = JSON.parse(fs.readFileSync(file('settings.json'), 'utf8'));
        if (parsed && parsed.schemaVersion === HOMEFEED_SCHEMA.settings) return normalizeHomefeedSettings(parsed);
      } catch { /* 기본값 */ }
      return normalizeHomefeedSettings({}, DEFAULT_HOMEFEED_SETTINGS);
    },
    writeSettings(settings) {
      writeJson(file('settings.json'), normalizeHomefeedSettings(settings));
    },
    appendSnapshot(snapshot) {
      const target = snapshotPath(dir, snapshot.capturedAt);
      writeJson(target, snapshot);
      return target;
    },
    listSnapshots(sinceMs = 0) {
      const root = path.join(dir, 'snapshots');
      let days: string[] = [];
      try { days = fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort(); } catch { return []; }
      const sinceDay = Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs).toISOString().slice(0, 10) : '';
      const out: HomefeedSnapshot[] = [];
      for (const day of days) {
        if (sinceDay && day < sinceDay) continue;
        let files: string[] = [];
        try { files = fs.readdirSync(path.join(root, day)).filter((name) => name.endsWith('.json')).sort(); } catch { continue; }
        for (const name of files) {
          const at = snapshotMsFromPath(day, name);
          if (!Number.isFinite(at) || at < sinceMs) continue;
          const snapshot = readVersioned<HomefeedSnapshot | null>(path.join(root, day, name), HOMEFEED_SCHEMA.snapshot, () => null);
          if (snapshot && Array.isArray(snapshot.issues)) out.push(snapshot);
        }
      }
      return out.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    },
    latestSnapshotAt() {
      const root = path.join(dir, 'snapshots');
      let days: string[] = [];
      try { days = fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse(); } catch { return null; }
      for (const day of days) {
        let files: string[] = [];
        try { files = fs.readdirSync(path.join(root, day)).filter((name) => name.endsWith('.json')).sort().reverse(); } catch { continue; }
        for (const name of files) {
          const at = snapshotMsFromPath(day, name);
          if (Number.isFinite(at)) return new Date(at).toISOString();
        }
      }
      return null;
    },
    countSnapshots() {
      const root = path.join(dir, 'snapshots');
      try {
        return fs.readdirSync(root).reduce((sum, day) => {
          try { return sum + fs.readdirSync(path.join(root, day)).filter((name) => name.endsWith('.json')).length; } catch { return sum; }
        }, 0);
      } catch {
        return 0;
      }
    },
    readSignalState() {
      return readVersioned<HomefeedSignalState>(file('signal-state.json'), HOMEFEED_SCHEMA.signalState, () => ({
        schemaVersion: HOMEFEED_SCHEMA.signalState, updatedAt: null, entries: {},
      }));
    },
    writeSignalState(state) { writeJson(file('signal-state.json'), state); },
    readSources() {
      return readVersioned<HomefeedSourcesLedger>(file('sources.json'), HOMEFEED_SCHEMA.sources, () => ({
        schemaVersion: HOMEFEED_SCHEMA.sources, updatedAt: null, sources: {},
      }));
    },
    writeSources(ledger) { writeJson(file('sources.json'), ledger); },
    readStories() {
      return readVersioned<HomefeedStoriesFile>(file('stories.json'), HOMEFEED_SCHEMA.stories, () => ({
        schemaVersion: HOMEFEED_SCHEMA.stories, computedAt: null, snapshotAt: null, snapshotCount: 0, stories: [],
      }));
    },
    writeStories(stories) { writeJson(file('stories.json'), stories); },
    readAssets(issueKey) {
      const assets = readVersioned<HomefeedAssets>(assetsFile(issueKey), HOMEFEED_SCHEMA.assets, () => emptyAssets(issueKey));
      return assets.issueKey === issueKey ? assets : emptyAssets(issueKey);
    },
    writeAssets(assets) { writeJson(assetsFile(assets.issueKey), assets); },
    readPosts() {
      return readVersioned<HomefeedPostsFile>(file('posts.json'), HOMEFEED_SCHEMA.posts, () => ({ schemaVersion: HOMEFEED_SCHEMA.posts, posts: [] }));
    },
    writePosts(posts) { writeJson(file('posts.json'), posts); },
    readPerformance() {
      return readVersioned<HomefeedPerformanceFile>(file('performance.json'), HOMEFEED_SCHEMA.performance, () => ({
        schemaVersion: HOMEFEED_SCHEMA.performance, entries: [],
      }));
    },
    writePerformance(performance) { writeJson(file('performance.json'), performance); },
    readOgCache() {
      return readVersioned<OgCacheFile>(file('og-cache.json'), HOMEFEED_SCHEMA.ogCache, () => ({ schemaVersion: HOMEFEED_SCHEMA.ogCache, entries: {} }));
    },
    writeOgCache(cache) { writeJson(file('og-cache.json'), cache); },
    saveImage(record, data) {
      if (!IMAGE_ID_RE.test(record.id)) throw new Error('이미지 id 형식이 올바르지 않습니다.');
      writeFileAtomic(path.join(dir, 'images', `${record.id}.bin`), data);
      writeJson(path.join(dir, 'images', `${record.id}.json`), { schemaVersion: HOMEFEED_SCHEMA.image, record });
    },
    readImage(id) {
      if (!IMAGE_ID_RE.test(id)) return null;
      const meta = readVersioned<{ schemaVersion: string; record: HomefeedImageRecord } | null>(
        path.join(dir, 'images', `${id}.json`), HOMEFEED_SCHEMA.image, () => null,
      );
      if (!meta?.record) return null;
      try {
        return { record: meta.record, data: fs.readFileSync(path.join(dir, 'images', `${id}.bin`)) };
      } catch {
        return null;
      }
    },
    pruneSnapshots(retentionDays, nowMs) {
      const root = path.join(dir, 'snapshots');
      const cutoff = nowMs - Math.max(1, retentionDays) * 86_400_000;
      let removed = 0;
      let days: string[] = [];
      try { days = fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)); } catch { return 0; }
      for (const day of days) {
        const dayDir = path.join(root, day);
        let files: string[] = [];
        try { files = fs.readdirSync(dayDir); } catch { continue; }
        for (const name of files) {
          const at = snapshotMsFromPath(day, name);
          if (Number.isFinite(at) && at < cutoff) {
            try { fs.rmSync(path.join(dayDir, name), { force: true }); removed += 1; } catch { /* 다음 회차에 다시 */ }
          }
        }
        try { if (fs.readdirSync(dayDir).length === 0) fs.rmdirSync(dayDir); } catch { /* 비어 있지 않으면 둔다 */ }
      }
      return removed;
    },
  };
}
