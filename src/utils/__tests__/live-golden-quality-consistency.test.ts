import * as fs from 'fs';
import * as path from 'path';
import { MobileLiveGoldenRadar, __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';
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
  extraEvidence: string[] = [],
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
    evidence: ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count', ...extraEvidence],
    isMeasured: true,
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    searchVolumeBindingVersion: 'keyword-keyed-v2',
    searchVolumeMeasuredAt: '2026-07-11T16:10:00.000Z',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    documentCountQueryMode: 'exact-phrase',
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
    row('제주 렌터카 예약', 'SSS', 94, 240, 590, 16, 'travel_domestic'),
    row('청년미래적금지급일', 'SSS', 98, 5000, 28800, 599, 'policy'),
    row('갤럭시 S27 출시일 스펙', 'SSS', 98, 1400, 8200, 470, 'electronics', ['autocomplete-exact-measured']),
    row('근로장려금신청tistory', 'SSS', 98, 1200, 7200, 450, 'policy'),
    row('제습기순위최저가조회', 'SSS', 98, 1100, 6100, 430, 'shopping'),
    row('공기청정기 순위 구매처', 'SSS', 98, 900, 5200, 380, 'shopping'),
    row('무선 청소기 출시일 스펙', 'SSS', 98, 850, 4900, 360, 'shopping'),
    row('쿠쿠제습기렌탈구매처비용', 'SSS', 98, 820, 4700, 350, 'shopping'),
    row('문화누리카드사용처후기', 'SSS', 98, 1300, 7800, 460, 'policy'),
    row('농식품바우처신청하는곳은', 'SSS', 98, 900, 5400, 390, 'policy'),
    row('문화누리카드사용처킥보드', 'S', 95, 250, 600, 141, 'policy'),
    row('SK하이닉스 나스닥 상장일', 'S', 0, 2400, 15460, 2594, 'finance'),
    row('내일도 출근 웹툰', 'A', 0, 6500, 67300, 3169, 'persistent-cache'),
  ],
}, null, 2), 'utf8');

try {
  const intentCorrections: Array<[string, string, string]> = [
    ['삼성창문형에어컨 후기', 'Informational', 'Commercial'],
    ['제습기순위', 'Transactional', 'Commercial'],
    ['세탁세제순위', 'Transactional', 'Commercial'],
    ['개인사업자 부가세 신고 방법', 'Transactional', 'Informational'],
    ['제주렌터카후기', 'Informational', 'Commercial'],
    ['로봇청소기순위', 'Transactional', 'Commercial'],
    ['무선청소기 순위', 'Transactional', 'Commercial'],
    ['창문형에어컨소음비교', 'Transactional', 'Commercial'],
  ];
  assert(
    'public golden intents normalize reviews, rankings, comparisons, and filing how-to queries',
    intentCorrections.every(([keyword, incoming, expected]) => (
      __liveGoldenRadarTestInternals.publicLiveGoldenIntent(keyword, incoming) === expected
    )),
  );
  assert(
    'public intent normalization preserves direct application actions',
    __liveGoldenRadarTestInternals.publicLiveGoldenIntent('임신바우처신청방법', 'Transactional') === 'Transactional',
  );
  const informationalMarkerCases = ['프로야구 순위', '임신 후기 증상', '조선 후기'];
  assert(
    'public intent normalization does not treat every ranking or historical-period keyword as commercial',
    informationalMarkerCases.every((keyword) => (
      __liveGoldenRadarTestInternals.publicLiveGoldenIntent(keyword, 'Informational') === 'Informational'
    )),
  );
  assert(
    'sentence-fragment candidates are rejected before SearchAd measurement spend',
    !__liveGoldenRadarTestInternals.isSearchAdMeasurableLiveCandidate('농식품바우처신청하는곳은', 'policy', now),
  );
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
  const required = ['송지호바다하늘길입장료', '제주 렌트카 예약', '갤럭시 S27 출시일 스펙'];
  const blocked = [
    '청년미래적금지급일',
    '근로장려금신청tistory',
    '제습기순위최저가조회',
    '공기청정기 순위 구매처',
    '무선 청소기 출시일 스펙',
    '쿠쿠제습기렌탈구매처비용',
    '문화누리카드사용처후기',
    '농식품바우처신청하는곳은',
    '문화누리카드사용처킥보드',
    'SK하이닉스 나스닥 상장일',
    '내일도 출근 웹툰',
  ];

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
    'orthographic variants collapse to one semantic keyword family',
    snapshot.board.filter((item) => /\uC81C\uC8FC\s*\uB80C(?:\uD2B8|\uD130)\uCE74\s*\uC608\uC57D/u.test(item.keyword)).length === 1,
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
