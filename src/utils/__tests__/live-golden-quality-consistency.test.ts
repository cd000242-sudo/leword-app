import * as fs from 'fs';
import * as path from 'path';
import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

const now = new Date('2026-07-11T16:30:00.000Z');
const boardFile = path.join(process.cwd(), 'tmp', 'live-golden-quality-consistency.json');
fs.mkdirSync(path.dirname(boardFile), { recursive: true });

function row(
  keyword: string,
  grade: string,
  score: number,
  pcSearchVolume: number,
  mobileSearchVolume: number,
  documentCount: number,
  category: string,
): Record<string, unknown> {
  const totalSearchVolume = pcSearchVolume + mobileSearchVolume;
  return {
    keyword,
    grade,
    score,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount,
    goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    cpc: 0,
    category,
    source: 'persistent-keyword-cache',
    intent: 'persistent-measured-golden-cache',
    evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'cache',
    documentCountConfidence: 'medium',
    isDocumentCountEstimated: false,
    discoveredAt: '2026-07-11T16:10:00.000Z',
    updatedAt: '2026-07-11T16:10:00.000Z',
  };
}

fs.writeFileSync(boardFile, JSON.stringify({
  version: 1,
  boardUpdatedAt: '2026-07-11T16:10:00.000Z',
  savedAt: '2026-07-11T16:10:00.000Z',
  items: [
    row('송지호바다하늘길입장료', 'SSS', 98, 240, 2270, 157, 'travel_domestic'),
    row('제주 렌트카 예약', 'SSS', 95, 250, 600, 15, 'travel_domestic'),
    row('청년미래적금지급일', 'SSS', 98, 5000, 28800, 599, 'policy'),
    row('문화누리카드사용처킥보드', 'S', 95, 250, 600, 141, 'policy'),
    row('SK하이닉스 나스닥 상장일', 'S', 0, 2400, 15460, 2594, 'finance'),
    row('내일도 출근 웹툰', 'A', 0, 6500, 67300, 3169, 'persistent-cache'),
  ],
}, null, 2), 'utf8');

try {
  const radar = new MobileLiveGoldenRadar({
    notificationInbox: new MobileNotificationInbox(),
    boardFile,
    boardTarget: 120,
    publicPreviewCount: 5,
    runOnStart: false,
    now: () => now,
  });
  const snapshot = radar.snapshot();
  const keywords = new Set(snapshot.board.map((item) => item.keyword));
  const required = ['송지호바다하늘길입장료', '제주 렌트카 예약', '청년미래적금지급일'];
  const blocked = ['문화누리카드사용처킥보드', 'SK하이닉스 나스닥 상장일', '내일도 출근 웹툰'];

  assert(
    'compact Korean action-intent keywords survive the strict value gate',
    required.every((keyword) => keywords.has(keyword)),
    snapshot.board.map((item) => item.keyword).join('|'),
  );
  assert(
    'ambiguous, brand-news, and entertainment lookup rows stay off the golden board',
    blocked.every((keyword) => !keywords.has(keyword)),
    snapshot.board.map((item) => item.keyword).join('|'),
  );
  assert(
    'every visible golden row has A-or-better value grade and a positive score',
    snapshot.board.length > 0
      && snapshot.board.every((item) => ['S+', 'S', 'A'].includes(String(item.valueGrade)))
      && snapshot.board.every((item) => Number(item.score) > 0),
    snapshot.board.map((item) => `${item.keyword}:${item.valueGrade}:${item.score}`).join('|'),
  );
  assert(
    'no value-C row can simultaneously claim publish recommendation',
    snapshot.board.every((item) => !(item.valueGrade === 'C' && item.publishDecision?.verdict === 'publish')),
  );
} finally {
  fs.rmSync(boardFile, { force: true });
}

console.log(`\n[live-golden-quality-consistency.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}
process.exit(0);
