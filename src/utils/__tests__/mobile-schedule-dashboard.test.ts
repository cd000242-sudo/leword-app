import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  addMobileKeywordSchedule,
  buildMobileScheduleDashboardSnapshot,
  deleteMobileKeywordSchedule,
  toggleMobileKeywordSchedule,
  updateMobileKeywordSchedule,
} from '../../mobile/schedule-dashboard';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-schedule-dashboard] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-mobile-schedule-'));
const schedulesFile = path.join(tmpDir, 'schedules.json');
const notificationsFile = path.join(tmpDir, 'keyword-notifications.json');
const historyFile = path.join(tmpDir, 'keyword-history.json');
const groupsFile = path.join(tmpDir, 'keyword-groups.json');

try {
  const empty = buildMobileScheduleDashboardSnapshot({
    schedulesFile,
    notificationsFile,
    historyFile,
    keywordGroupsFile: groupsFile,
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });
  assert('empty snapshot has zero schedules', empty.schedules.total === 0);
  assert('empty snapshot keeps PC storage labels',
    empty.storage.schedules === 'pc-schedules-json'
      && empty.storage.notifications === 'pc-keyword-notifications-json'
      && empty.storage.history === 'pc-keyword-history-json');

  writeJson(schedulesFile, [
    {
      id: 's1',
      topic: '여름 원피스 추천',
      keywords: ['여름 원피스 추천', '린넨 원피스'],
      scheduleDateTime: '2026-06-06T10:00:00.000Z',
      status: 'pending',
      platform: 'blogger',
      createdAt: '2026-06-05T12:00:00.000Z',
    },
    {
      id: 's2',
      topic: '정책 브리핑',
      keywords: ['청년 지원금'],
      scheduleDateTime: '2026-06-05T10:00:00.000Z',
      status: 'completed',
      platform: 'wordpress',
      createdAt: '2026-06-04T12:00:00.000Z',
    },
    {
      id: 'ignored-no-keywords',
      topic: '메모',
      keywords: [],
      scheduleDateTime: '2026-06-08T10:00:00.000Z',
      status: 'pending',
      platform: 'blogger',
    },
    {
      id: 's3',
      topic: '취소 후보',
      keywords: ['취소 후보'],
      scheduleDateTime: '2026-06-07T10:00:00.000Z',
      status: 'cancelled',
      platform: 'blogger',
    },
  ]);
  writeJson(notificationsFile, {
    enabled: true,
    keywords: ['여름 원피스', '지원금'],
    settings: {
      desktop: true,
      mobilePush: true,
    },
  });
  writeJson(historyFile, [
    { type: 'trend', keyword: '실시간 이슈', date: '2026-06-01' },
    { type: 'golden', keyword: '황금 후보', date: '2026-06-02' },
    { type: 'analysis', keyword: '분석 후보', date: '2026-06-03' },
  ]);
  writeJson(groupsFile, [
    {
      id: 'g1',
      name: '여름 원피스 그룹',
      keywords: ['여름 원피스', '린넨 원피스'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
  ]);

  const snapshot = buildMobileScheduleDashboardSnapshot({
    schedulesFile,
    notificationsFile,
    historyFile,
    keywordGroupsFile: groupsFile,
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });

  assert('keyword schedules filter non-keyword rows', snapshot.schedules.total === 3, String(snapshot.schedules.total));
  assert('schedule status counts pending', snapshot.schedules.pending === 1, String(snapshot.schedules.pending));
  assert('schedule status counts completed', snapshot.schedules.completed === 1, String(snapshot.schedules.completed));
  assert('schedule status counts cancelled', snapshot.schedules.cancelled === 1, String(snapshot.schedules.cancelled));
  assert('schedule next run uses earliest active pending schedule',
    snapshot.schedules.nextRunAt === '2026-06-06T10:00:00.000Z',
    String(snapshot.schedules.nextRunAt));
  assert('schedule item mirrors PC keyword field',
    snapshot.schedules.items[0]?.keyword === '여름 원피스 추천'
      && snapshot.schedules.items[0]?.enabled === true);
  assert('notifications summarize PC notification settings',
    snapshot.notifications.enabled === true
      && snapshot.notifications.keywordCount === 2
      && snapshot.notifications.settingsCount === 2);
  assert('history summarizes trend and golden activity',
    snapshot.keywords.totalAnalyzed === 3
      && snapshot.keywords.recentTrendQueries === 1
      && snapshot.keywords.recentGoldenQueries === 1);
  assert('groups are included from the same PC keyword-group storage',
    snapshot.groups.total === 1
      && snapshot.groups.top[0]?.name === '여름 원피스 그룹');

  const created = addMobileKeywordSchedule({
    schedulesFile,
    input: {
      keyword: '모바일 예약 키워드',
      scheduleDateTime: '2026-06-09T09:30:00.000Z',
      platform: 'blogger',
      keywords: ['모바일 예약 키워드', '예약 확장'],
    },
    now: () => new Date('2026-06-06T01:00:00.000Z'),
  });
  assert('mobile can create PC-compatible keyword schedule',
    created.schedule.id.startsWith('mobile_schedule_')
      && created.schedule.status === 'pending'
      && created.schedule.publishType === 'schedule'
      && created.snapshot.schedules.pending === 2);

  const disabled = toggleMobileKeywordSchedule({
    schedulesFile,
    id: created.schedule.id,
    enabled: false,
    now: () => new Date('2026-06-06T01:01:00.000Z'),
  });
  assert('mobile can disable a keyword schedule',
    disabled.schedule?.status === 'cancelled'
      && disabled.snapshot.schedules.cancelled === 2);

  const enabled = toggleMobileKeywordSchedule({
    schedulesFile,
    id: created.schedule.id,
    enabled: true,
    now: () => new Date('2026-06-06T01:02:00.000Z'),
  });
  assert('mobile can re-enable a keyword schedule',
    enabled.schedule?.status === 'pending'
      && enabled.snapshot.schedules.pending === 2);

  const updated = updateMobileKeywordSchedule({
    schedulesFile,
    id: created.schedule.id,
    updates: {
      keyword: '모바일 예약 키워드 수정',
      topic: '모바일 예약 키워드 수정',
      keywords: ['모바일 예약 키워드 수정', '예약 상세 편집'],
      scheduleDateTime: '2026-06-10T10:15:00.000Z',
      platform: 'wordpress',
      publishType: 'schedule',
      enabled: true,
    },
    now: () => new Date('2026-06-06T01:03:00.000Z'),
  });
  assert('mobile can edit keyword schedule details',
    updated.schedule?.keyword === '모바일 예약 키워드 수정'
      && updated.schedule.scheduleDateTime === '2026-06-10T10:15:00.000Z'
      && updated.schedule.platform === 'wordpress'
      && updated.schedule.keywords.includes('예약 상세 편집')
      && updated.snapshot.schedules.pending === 2);

  const deleted = deleteMobileKeywordSchedule({
    schedulesFile,
    id: created.schedule.id,
    now: () => new Date('2026-06-06T01:04:00.000Z'),
  });
  assert('mobile can delete a keyword schedule',
    deleted.removed === true
      && deleted.schedule?.id === created.schedule.id
      && deleted.snapshot.schedules.total === 3);

  const missingDelete = deleteMobileKeywordSchedule({
    schedulesFile,
    id: 'missing-schedule',
    now: () => new Date('2026-06-06T01:05:00.000Z'),
  });
  assert('missing schedule delete reports not removed',
    missingDelete.removed === false
      && missingDelete.schedule === null
      && missingDelete.snapshot.schedules.total === 3);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('[mobile-schedule-dashboard] passed');
