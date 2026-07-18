import * as fs from 'fs';
import * as path from 'path';
import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const now = new Date('2026-07-17T02:30:00.000Z');
const measuredAt = now.toISOString();
const baseKeyword = '\uAE40\uBD80\uC7A5';
const canonicalKeyword = `${baseKeyword} \uAE30\uBCF8\uC815\uBCF4`;
const cacheKeyword = `${baseKeyword} \uBC29\uC1A1\uC77C\uC815`;
const runtimeDir = path.join(process.cwd(), 'tmp');
const surgeBoardFile = path.join(runtimeDir, 'live-golden-document-provenance-surge.json');
const ingestBoardFile = path.join(runtimeDir, 'live-golden-document-provenance-ingest.json');

function cleanupBoardFiles(boardFile: string): void {
  const base = boardFile.replace(/\.json$/, '');
  for (const file of [
    boardFile,
    `${base}-ingest.json`,
    `${base}-realdemand.json`,
    `${base}-surge-seen.json`,
  ]) {
    fs.rmSync(file, { force: true });
  }
}

async function run(): Promise<void> {
  fs.mkdirSync(runtimeDir, { recursive: true });
  cleanupBoardFiles(surgeBoardFile);
  cleanupBoardFiles(ingestBoardFile);
  const inbox = new MobileNotificationInbox({ now: () => now });

  const surgeRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    now: () => now,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: surgeBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [baseKeyword],
    enableBackfill: false,
    discover: async () => [],
    realDemandProbe: async (query: string) => ({
      ok: true,
      suggestions: query === baseKeyword ? [canonicalKeyword, cacheKeyword] : [query],
    }),
    measureLiveSearchVolumeSeparate: (async (_config: unknown, keywords: string[]) => (
      keywords.map((keyword) => ({
        keyword,
        pcSearchVolume: 4_000,
        mobileSearchVolume: 16_000,
        documentCount: 100,
        competition: null,
        monthlyAveCpc: null,
        searchVolumeBindingVersion: 'keyword-keyed-v2',
        searchVolumeMeasuredAt: measuredAt,
        documentCountSource: keyword === cacheKeyword ? 'cache' : 'naver-api',
        documentCountConfidence: keyword === cacheKeyword ? 'medium' : 'high',
        documentCountQueryMode: 'broad',
        documentCountMeasuredAt: measuredAt,
        isDocumentCountEstimated: false,
      }))
    )) as never,
  });

  const surgeSnapshot = await surgeRadar.runOnce();
  const surgeRows = surgeSnapshot.board.filter((item) => item.lane === 'traffic-surge');
  const canonicalSurge = surgeRows.find((item) => item.keyword === canonicalKeyword);
  assert(
    'traffic surge preserves canonical Blog measurement provenance',
    !!canonicalSurge
      && canonicalSurge.documentCountSource === 'naver-api'
      && canonicalSurge.documentCountConfidence === 'high'
      && canonicalSurge.documentCountQueryMode === 'broad'
      && canonicalSurge.documentCountMeasuredAt === measuredAt
      && canonicalSurge.isDocumentCountEstimated === false,
    JSON.stringify(surgeRows),
  );
  assert(
    'traffic surge rejects a numeric cache row instead of relabeling it',
    !surgeRows.some((item) => item.keyword === cacheKeyword),
    JSON.stringify(surgeRows),
  );

  const ingestRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    now: () => now,
    runOnStart: false,
    cycleLimit: 1,
    boardTarget: 10,
    maxCandidates: 60,
    boardFile: ingestBoardFile,
    categories: ['policy'],
    getEnvConfig: () => ({ naverClientId: 'client', naverClientSecret: 'secret' }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [],
  });
  const ingestResult = ingestRadar.ingestBoard([
    {
      keyword: '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD \uB300\uC0C1',
      grade: 'S',
      score: 70,
      pcSearchVolume: 320,
      mobileSearchVolume: 1_080,
      totalSearchVolume: 1_400,
      documentCount: 700,
      goldenRatio: 2,
      category: 'policy',
      intent: 'live-golden',
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: measuredAt,
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountMeasuredAt: measuredAt,
      isDocumentCountEstimated: false,
    },
    {
      keyword: '\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uC2E0\uCCAD \uC11C\uB958',
      grade: 'S',
      score: 70,
      pcSearchVolume: 320,
      mobileSearchVolume: 1_080,
      totalSearchVolume: 1_400,
      documentCount: 700,
      goldenRatio: 2,
      category: 'policy',
      intent: 'live-golden',
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: measuredAt,
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'exact-phrase',
      documentCountMeasuredAt: measuredAt,
      isDocumentCountEstimated: false,
    },
  ]);
  assert(
    'verified ingest accepts only fresh canonical broad document measurements',
    ingestResult.received === 2 && ingestResult.accepted === 1 && ingestResult.persisted === true,
    JSON.stringify({ ingestResult, snapshot: ingestRadar.snapshot() }),
  );
  const ingestFile = ingestBoardFile.replace(/\.json$/, '') + '-ingest.json';
  const ingestedRows = JSON.parse(fs.readFileSync(ingestFile, 'utf8')).items as Array<{
    documentCountQueryMode?: string;
    documentCountMeasuredAt?: string;
  }>;
  assert(
    'verified ingest preserves document scope and measurement time',
    ingestedRows.length === 1
      && ingestedRows[0]?.documentCountQueryMode === 'broad'
      && ingestedRows[0]?.documentCountMeasuredAt === measuredAt,
    JSON.stringify(ingestedRows),
  );
}

run()
  .then(() => console.log('[live-golden-document-provenance-policy.test] passed'))
  .finally(() => {
    cleanupBoardFiles(surgeBoardFile);
    cleanupBoardFiles(ingestBoardFile);
  })
  .then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );

export {};
