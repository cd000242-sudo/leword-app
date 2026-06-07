import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  addMobileProTrackedPost,
  addMobileRankTrackingManualPair,
  readMobileRankTrackingSnapshot,
  removeMobileRankTrackingPair,
  runMobileRankTrackingSerpCheck,
} from '../../mobile/rank-tracking';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-rank-tracking] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-rank-'));
const exposureDir = path.join(tempDir, 'exposure-tracking');
const proDir = path.join(tempDir, 'pro-hunter-v12');
const exposureTrackedFile = path.join(exposureDir, 'tracked.json');
const exposureKeywordHistoryFile = path.join(exposureDir, 'keyword-history.json');
const exposureConfigFile = path.join(exposureDir, 'config.json');
const proTrackingFile = path.join(proDir, 'tracking-store.json');

async function main(): Promise<void> {
try {
  writeJson(exposureConfigFile, {
    rssUrl: 'https://rss.blog.naver.com/leword.xml',
  });
  writeJson(exposureKeywordHistoryFile, [
    {
      keyword: '여름 원피스 추천',
      category: 'fashion',
      source: 'golden-discovery',
      recordedAt: '2026-06-01T09:00:00.000Z',
    },
  ]);
  writeJson(exposureTrackedFile, [
    {
      keyword: '여름 원피스 추천',
      postUrl: 'https://blog.naver.com/leword/223000000001',
      postTitle: '여름 원피스 추천 상위노출 실험',
      category: 'fashion',
      registeredAt: '2026-06-01T10:00:00.000Z',
      lastCheckedAt: '2026-06-06T09:00:00.000Z',
      history: [
        {
          checkedAt: '2026-06-05T09:00:00.000Z',
          inTop10: false,
          inTop30: true,
          rank: 18,
        },
        {
          checkedAt: '2026-06-06T09:00:00.000Z',
          inTop10: true,
          inTop30: true,
          rank: 7,
        },
      ],
    },
  ]);

  writeJson(proTrackingFile, {
    version: 1,
    keywords: {
      '여름 원피스 추천': {
        keyword: '여름 원피스 추천',
        registeredAt: Date.parse('2026-06-01T00:00:00.000Z'),
        lastCheckedAt: Date.parse('2026-06-06T00:00:00.000Z'),
        initialDocCount: 1200,
        history: [
          {
            ts: Date.parse('2026-06-01T00:00:00.000Z'),
            docCount: 1200,
            searchVolume: 360,
          },
          {
            ts: Date.parse('2026-06-06T00:00:00.000Z'),
            docCount: 1610,
            searchVolume: 540,
          },
        ],
        alerts: [
          {
            ts: Date.parse('2026-06-06T00:00:00.000Z'),
            type: 'opportunity',
            message: '상승 기회',
          },
        ],
      },
    },
    posts: {
      'https://blog.naver.com/leword/223000000001': {
        postUrl: 'https://blog.naver.com/leword/223000000001',
        keyword: '여름 원피스 추천',
        keywords: ['여름 원피스 추천', '원피스 코디'],
        registeredAt: Date.parse('2026-06-01T00:00:00.000Z'),
        lastCheckedAt: Date.parse('2026-06-06T00:00:00.000Z'),
        predictedRank: 9,
        history: [
          {
            ts: Date.parse('2026-06-05T00:00:00.000Z'),
            rank: 12,
            checked: true,
          },
          {
            ts: Date.parse('2026-06-06T00:00:00.000Z'),
            rank: 5,
            checked: true,
            perKeyword: {
              '여름 원피스 추천': 5,
              '원피스 코디': 14,
            },
          },
        ],
      },
    },
  });

  const snapshot = readMobileRankTrackingSnapshot({
    exposureTrackedFile,
    exposureKeywordHistoryFile,
    exposureConfigFile,
    proTrackingFile,
    now: () => new Date('2026-06-06T12:00:00.000Z'),
  });

  assert('snapshot is configured when RSS or tracked data exists',
    snapshot.configured === true && snapshot.rssUrl === 'https://rss.blog.naver.com/leword.xml');
  assert('snapshot merges exposure and PRO tracked posts',
    snapshot.posts.total === 2
      && snapshot.totals.exposureTrackedPairs === 1
      && snapshot.totals.proTrackedPosts === 1
      && snapshot.totals.checkedPairs === 2);
  assert('exposure post preserves current rank and improvement delta',
    snapshot.posts.items.some((item) => item.source === 'exposure-tracking'
      && item.keyword === '여름 원피스 추천'
      && item.currentRank === 7
      && item.previousRank === 18
      && item.rankChange === -11
      && item.currentInTop10 === true));
  assert('PRO post preserves per-keyword rank history',
    snapshot.posts.items.some((item) => item.source === 'pro-hunter-v12'
      && item.currentRank === 5
      && item.previousRank === 12
      && item.rankChange === -7
      && item.predictedRank === 9
      && item.keywords.includes('원피스 코디')
      && item.history[0].perKeyword?.['원피스 코디'] === 14));
  assert('keyword lifecycle summary exposes document growth and alerts',
    snapshot.keywords.total === 1
      && snapshot.keywords.items[0].latestDocCount === 1610
      && snapshot.keywords.items[0].docDelta === 410
      && snapshot.keywords.items[0].latestSearchVolume === 540
      && snapshot.keywords.items[0].alertCount === 1);
  assert('category and hit-rate totals are mobile-ready',
    snapshot.byCategory[0].category === 'fashion'
      && snapshot.byCategory[0].hitRate10 === 100
      && snapshot.totals.currentlyInTop10 === 2
      && snapshot.totals.hitRate30 === 100);

  const added = addMobileRankTrackingManualPair({
    input: {
      keyword: 'rank action keyword',
      postUrl: 'https://blog.naver.com/leword/223000000002',
      postTitle: 'rank action post',
      category: 'manual',
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
      now: () => new Date('2026-06-06T13:00:00.000Z'),
    },
  });
  assert('manual action adds a pair to the same PC exposure tracking file',
    added.success === true
      && added.totalTracked === 2
      && added.snapshot.posts.items.some((item) => item.keyword === 'rank action keyword'
        && item.source === 'exposure-tracking'
        && item.category === 'manual'));

  const duplicate = addMobileRankTrackingManualPair({
    input: {
      keyword: 'rank action keyword',
      postUrl: 'https://blog.naver.com/leword/223000000002',
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
    },
  });
  assert('manual action rejects duplicate keyword/post pairs',
    duplicate.success === false
      && duplicate.error === 'already-tracked'
      && duplicate.snapshot.totals.exposureTrackedPairs === 2);

  const proTracked = addMobileProTrackedPost({
    input: {
      keyword: 'pro tracked keyword',
      postUrl: 'https://blog.naver.com/leword/223000000003',
      predictedRank: 6,
      keywords: ['pro tracked keyword', 'secondary pro keyword'],
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
      now: () => new Date('2026-06-06T13:30:00.000Z'),
    },
  });
  assert('PRO tracked post action writes PC pro-hunter-v12 tracking store',
    proTracked.success === true
      && proTracked.action === 'pro-post-add'
      && proTracked.snapshot.totals.proTrackedPosts === 2
      && proTracked.snapshot.posts.items.some((item) => item.keyword === 'pro tracked keyword'
        && item.source === 'pro-hunter-v12'
        && item.predictedRank === 6
        && item.keywords.includes('secondary pro keyword')));

  const proTrackedMerged = addMobileProTrackedPost({
    input: {
      keyword: 'pro tracked keyword',
      postUrl: 'https://blog.naver.com/leword/223000000003',
      predictedRank: 4,
      keywords: ['third pro keyword'],
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
    },
  });
  assert('PRO tracked post action merges additional keywords without duplicate posts',
    proTrackedMerged.success === true
      && proTrackedMerged.snapshot.totals.proTrackedPosts === 2
      && proTrackedMerged.snapshot.posts.items.some((item) => item.keyword === 'pro tracked keyword'
        && item.keywords.includes('third pro keyword')));

  const removedProTracked = removeMobileRankTrackingPair({
    input: {
      keyword: 'pro tracked keyword',
      postUrl: 'https://blog.naver.com/leword/223000000003',
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
    },
  });
  assert('remove action deletes PRO tracked posts from the PC pro-hunter-v12 store',
    removedProTracked.success === true
      && removedProTracked.removed === 1
      && removedProTracked.snapshot.totals.proTrackedPosts === 1
      && !removedProTracked.snapshot.posts.items.some((item) => item.keyword === 'pro tracked keyword'));

  const run = await runMobileRankTrackingSerpCheck({
    input: { maxItems: 1 },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
      now: () => new Date('2026-06-06T14:00:00.000Z'),
      checker: async (keyword) => ({
        rank: keyword === 'rank action keyword' ? 3 : null,
        status: keyword === 'rank action keyword' ? 'found' : 'not-in-top30',
        method: 'test',
      }),
      delayMs: 0,
    },
  });
  assert('run action records a SERP check in PC exposure tracking history',
    run.success === true
      && run.checked === 1
      && run.exposed === 1
      && run.snapshot.posts.items.some((item) => item.keyword === 'rank action keyword'
        && item.currentRank === 3
        && item.currentInTop10 === true
        && item.totalChecks === 1));

  const removed = removeMobileRankTrackingPair({
    input: {
      keyword: 'rank action keyword',
      postUrl: 'https://blog.naver.com/leword/223000000002',
    },
    options: {
      exposureTrackedFile,
      exposureKeywordHistoryFile,
      exposureConfigFile,
      proTrackingFile,
    },
  });
  assert('remove action deletes the pair from the PC exposure tracking file',
    removed.success === true
      && removed.removed === 1
      && !removed.snapshot.posts.items.some((item) => item.keyword === 'rank action keyword'));

  console.log('[mobile-rank-tracking] passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
}

main().catch((err) => {
  console.error('[mobile-rank-tracking] unexpected error:', err);
  process.exit(1);
});
