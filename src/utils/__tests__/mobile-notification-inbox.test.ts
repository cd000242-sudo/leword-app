import {
  MobileNotificationInbox,
} from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const result: MobileKeywordResult = {
  keywords: [
    {
      keyword: '고유가 지원금 2차 신청방법',
      grade: 'SSS',
      pcSearchVolume: 1200,
      mobileSearchVolume: 1800,
      totalSearchVolume: 3000,
      documentCount: 120,
      goldenRatio: 25,
      cpc: 120,
      category: 'policy',
      source: 'prewarm-fixture',
      intent: 'application-guide',
      evidence: ['fresh issue', 'low competition'],
      isMeasured: true,
    },
    {
      keyword: '아이돌 컴백 일정 2026',
      grade: 'S',
      pcSearchVolume: 900,
      mobileSearchVolume: 2100,
      totalSearchVolume: 3000,
      documentCount: 900,
      goldenRatio: 3.3,
      cpc: 90,
      category: 'celebrity',
      source: 'prewarm-fixture',
      intent: 'schedule',
      evidence: ['seasonal'],
      isMeasured: true,
    },
    {
      keyword: '문서만 많은 잡키워드',
      grade: 'B',
      pcSearchVolume: 100,
      mobileSearchVolume: 100,
      totalSearchVolume: 200,
      documentCount: 800000,
      goldenRatio: 0.01,
      cpc: 0,
      category: 'noise',
      source: 'fixture',
      intent: 'noise',
      evidence: [],
      isMeasured: false,
    },
  ],
  summary: {
    total: 3,
    sss: 1,
    measured: 2,
    elapsedMs: 10,
    fromCache: false,
    parityMode: 'pc-engine-plus',
  },
};

(async () => {
  const inbox = new MobileNotificationInbox({
    now: () => new Date('2026-06-05T09:00:00.000Z'),
    maxEntries: 10,
  });

  const published = inbox.publishFromResult({
    product: 'golden-discovery',
    title: '정책 지원금 예열 완료',
    targetLabel: '지원금/정책',
    result,
  });

  assert('publishes only valuable measured winners', published.length === 2, String(published.length));
  assert('first notification keeps SSS keyword first', published[0].keyword === '고유가 지원금 2차 신청방법');
  assert('snapshot exposes unread count', inbox.snapshot().unreadCount === 2);
  assert('snapshot sorts newest first', inbox.snapshot().items[0].grade === 'SSS');

  const updated = inbox.publishFromResult({
    product: 'golden-discovery',
    title: '정책 지원금 예열 갱신',
    targetLabel: '지원금/정책',
    result: {
      ...result,
      keywords: [result.keywords[0]],
    },
  });

  assert('duplicate keyword updates existing notification', updated.length === 1 && inbox.snapshot().total === 2);
  assert('updated duplicate remains unread', inbox.snapshot().items[0].read === false);

  const read = inbox.markRead(inbox.snapshot().items[0].id);
  assert('markRead returns item', !!read && read.read === true);
  assert('unread count decreases after markRead', inbox.snapshot().unreadCount === 1);

  console.log('[mobile-notification-inbox.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
