import * as fs from 'fs';
import * as path from 'path';
import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const boardFile = path.join(process.cwd(), 'tmp', 'live-golden-readonly-snapshot-cache.json');
fs.mkdirSync(path.dirname(boardFile), { recursive: true });

function row(keyword: string, category: string): Record<string, unknown> {
  return {
    keyword,
    grade: 'SSS',
    score: 98,
    pcSearchVolume: 500,
    mobileSearchVolume: 4500,
    totalSearchVolume: 5000,
    documentCount: 250,
    goldenRatio: 20,
    category,
    source: 'live-golden-worker',
    intent: 'worker-measured-need',
    evidence: ['worker-board-file', 'measured-search-volume', 'measured-document-count'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: '2026-07-12T00:00:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'broad',
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };
}

function writeBoard(items: Record<string, unknown>[]): void {
  fs.writeFileSync(boardFile, JSON.stringify({
    version: 1,
    boardUpdatedAt: '2026-07-12T00:00:00.000Z',
    items,
  }), 'utf8');
}

const mutableFs = require('fs') as typeof fs;
const originalReadFileSync = mutableFs.readFileSync;
const originalDateNow = Date.now;
let wallClockMs = Date.parse('2026-07-12T00:00:00.000Z');
let boardReads = 0;

try {
  writeBoard([row('송지호바다하늘길입장료', 'travel_domestic')]);
  (Date as any).now = () => wallClockMs;
  (mutableFs as any).readFileSync = ((filePath: fs.PathOrFileDescriptor, ...args: any[]) => {
    if (String(filePath) === boardFile) boardReads += 1;
    return (originalReadFileSync as any)(filePath, ...args);
  }) as typeof fs.readFileSync;

  const radar = new MobileLiveGoldenRadar({
    notificationInbox: new MobileNotificationInbox(),
    runOnStart: false,
    refreshBoardFileOnSnapshot: true,
    boardFile,
    boardTarget: 120,
    now: () => new Date('2026-07-12T00:01:00.000Z'),
  });
  const initialReads = boardReads;
  radar.snapshot();
  wallClockMs += 31_000;
  radar.snapshot();
  assert('unchanged read-only board file is not reparsed every refresh interval',
    boardReads === initialReads,
    `${initialReads}:${boardReads}`);

  writeBoard([
    row('송지호바다하늘길입장료', 'travel_domestic'),
    row('에너지바우처잔액조회', 'policy'),
  ]);
  const future = new Date(wallClockMs + 60_000);
  fs.utimesSync(boardFile, future, future);
  wallClockMs += 31_000;
  const refreshed = radar.snapshot();
  assert('changed worker board file is reloaded on the next read-only snapshot',
    boardReads === initialReads + 1
      && refreshed.board.some((item) => item.keyword === '에너지바우처잔액조회'),
    `${initialReads}:${boardReads}:${refreshed.board.map((item) => item.keyword).join('|')}`);
} finally {
  (mutableFs as any).readFileSync = originalReadFileSync;
  (Date as any).now = originalDateNow;
  fs.rmSync(boardFile, { force: true });
}

console.log('[live-golden-readonly-snapshot-cache.test] passed');
process.exit(0);
