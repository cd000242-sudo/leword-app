import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  deleteMobileProOutcome,
  readMobileProOutcomeSnapshot,
  recordMobileProOutcome,
  syncMobileProOutcomesFromRankTracker,
} from '../../mobile/pro-outcomes';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-pro-outcomes] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-pro-outcomes-'));
const outcomesFile = path.join(tempDir, 'pro-hunter-v12', 'outcome-records.json');
const proTrackingFile = path.join(tempDir, 'pro-hunter-v12', 'tracking-store.json');

try {
  writeJson(outcomesFile, {
    version: 1,
    records: {
      'https://blog.naver.com/leword/1': {
        postUrl: 'https://blog.naver.com/leword/1',
        keyword: 'summer dress conversion',
        category: 'fashion',
        predictedRank: 5,
        predictedTraffic: 1200,
        actualRank: 6,
        actualMonthlyViews: 1800,
        actualMonthlyRevenue: 54000,
        firstExposureDays: 2,
        recordedAt: Date.parse('2026-06-05T00:00:00.000Z'),
        notes: 'matched closely',
      },
      'https://blog.naver.com/leword/2': {
        postUrl: 'https://blog.naver.com/leword/2',
        keyword: 'policy support checklist',
        category: 'policy',
        predictedRank: 9,
        predictedTraffic: 700,
        actualRank: 14,
        actualMonthlyViews: 900,
        actualMonthlyRevenue: 18000,
        firstExposureDays: 5,
        recordedAt: Date.parse('2026-06-06T00:00:00.000Z'),
      },
      'https://blog.naver.com/leword/3': {
        postUrl: 'https://blog.naver.com/leword/3',
        keyword: 'pending rank outcome',
        category: 'fashion',
        predictedRank: 3,
        predictedTraffic: 500,
        actualRank: null,
        actualMonthlyViews: null,
        actualMonthlyRevenue: null,
        firstExposureDays: null,
        recordedAt: Date.parse('2026-06-04T00:00:00.000Z'),
      },
    },
  });

  const snapshot = readMobileProOutcomeSnapshot({
    outcomeFile: outcomesFile,
    now: () => new Date('2026-06-06T12:00:00.000Z'),
  });

  assert('snapshot reads PC PRO outcome records',
    snapshot.storage === 'pc-pro-hunter-v12-outcome-json'
      && snapshot.totalRecords === 3
      && snapshot.measuredPosts === 2
      && snapshot.items[0].keyword === 'policy support checklist');
  assert('benchmark computes prediction accuracy and rank error',
    snapshot.benchmark.avgPredictionAccuracy === 50
      && snapshot.benchmark.avgRankError === 3
      && snapshot.benchmark.avgFirstExposureDays === 4);
  assert('benchmark computes traffic and revenue totals',
    snapshot.benchmark.totalMonthlyViews === 2700
      && snapshot.benchmark.totalMonthlyRevenue === 72000
      && snapshot.benchmark.avgRevenuePerPost === 36000
      && snapshot.benchmark.avgRevenuePerView === 26667);
  assert('category breakdown and top performers are mobile-ready',
    snapshot.benchmark.categoryBreakdown.fashion.posts === 1
      && snapshot.benchmark.categoryBreakdown.policy.avgRank === 14
      && snapshot.benchmark.topPerformingKeywords[0].keyword === 'summer dress conversion');
  assert('items expose prediction deltas and notes',
    snapshot.items.some((item) => item.keyword === 'summer dress conversion'
      && item.rankError === 1
      && item.revenuePerView === 30
      && item.notes === 'matched closely'));

  const recorded = recordMobileProOutcome({
    input: {
      postUrl: 'https://blog.naver.com/leword/4',
      keyword: 'mobile outcome action',
      category: 'it',
      predictedRank: 4,
      predictedTraffic: 1300,
      actualRank: 3,
      actualMonthlyViews: 2100,
      actualMonthlyRevenue: 84000,
      firstExposureDays: 1,
      notes: 'recorded from phone',
    },
    options: {
      outcomeFile: outcomesFile,
      now: () => new Date('2026-06-06T13:00:00.000Z'),
    },
  });

  assert('record action writes PC PRO outcome store and returns refreshed snapshot',
    recorded.success === true
      && recorded.action === 'record-outcome'
      && recorded.record?.keyword === 'mobile outcome action'
      && recorded.snapshot.totalRecords === 4
      && recorded.snapshot.items[0].keyword === 'mobile outcome action');

  const updated = recordMobileProOutcome({
    input: {
      postUrl: 'https://blog.naver.com/leword/4',
      keyword: 'mobile outcome action',
      actualRank: 2,
      actualMonthlyViews: 2400,
    },
    options: {
      outcomeFile: outcomesFile,
      now: () => new Date('2026-06-06T14:00:00.000Z'),
    },
  });

  assert('record action merges partial updates like PC outcome recorder',
    updated.record?.predictedRank === 4
      && updated.record?.actualRank === 2
      && updated.record?.actualMonthlyViews === 2400
      && updated.record?.actualMonthlyRevenue === 84000);

  const removed = deleteMobileProOutcome({
    input: { postUrl: 'https://blog.naver.com/leword/4' },
    options: { outcomeFile: outcomesFile },
  });

  assert('delete action removes one PC PRO outcome record',
    removed.success === true
      && removed.action === 'delete-outcome'
      && removed.removed === 1
      && !removed.snapshot.items.some((item) => item.postUrl === 'https://blog.naver.com/leword/4'));

  const registeredAt = Date.parse('2026-06-01T00:00:00.000Z');
  writeJson(proTrackingFile, {
    version: 1,
    keywords: {},
    posts: {
      'https://blog.naver.com/leword/5': {
        postUrl: 'https://blog.naver.com/leword/5',
        keyword: 'synced tracked post',
        keywords: ['synced tracked post', 'secondary keyword'],
        registeredAt,
        lastCheckedAt: Date.parse('2026-06-04T00:00:00.000Z'),
        predictedRank: 7,
        history: [
          { ts: Date.parse('2026-06-02T00:00:00.000Z'), rank: null, checked: true },
          { ts: Date.parse('2026-06-03T00:00:00.000Z'), rank: 8, checked: true },
          { ts: Date.parse('2026-06-04T00:00:00.000Z'), rank: 5, checked: true },
        ],
      },
      'https://blog.naver.com/leword/6': {
        postUrl: 'https://blog.naver.com/leword/6',
        keyword: 'unranked tracked post',
        registeredAt,
        lastCheckedAt: Date.parse('2026-06-04T00:00:00.000Z'),
        predictedRank: 11,
        history: [
          { ts: Date.parse('2026-06-04T00:00:00.000Z'), rank: null, checked: true },
        ],
      },
    },
  });

  const synced = syncMobileProOutcomesFromRankTracker({
    options: {
      outcomeFile: outcomesFile,
      proTrackingFile,
      now: () => new Date('2026-06-06T15:00:00.000Z'),
    },
  });

  assert('sync action absorbs latest ranked PRO tracked posts into outcome records',
    synced.success === true
      && synced.action === 'sync-outcomes'
      && synced.synced === 1
      && synced.snapshot.items.some((item) => item.keyword === 'synced tracked post'
        && item.actualRank === 5
        && item.predictedRank === 7
        && item.firstExposureDays === 2));

  console.log('[mobile-pro-outcomes] passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
