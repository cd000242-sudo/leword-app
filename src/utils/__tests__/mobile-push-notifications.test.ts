import type { MobileNotificationItem } from '../../mobile/contracts';
import {
  createHttpMobilePushSender,
  EXPO_PUSH_SEND_ENDPOINT,
  MobilePushDispatcher,
  MobilePushRegistry,
} from '../../mobile/push-notifications';
import http from 'http';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const notification: MobileNotificationItem = {
  id: 'notice-policy-sss',
  kind: 'prewarm-winner',
  product: 'golden-discovery',
  title: 'policy golden prewarm complete',
  keyword: 'policy support application guide',
  grade: 'SSS',
  category: 'policy',
  intent: 'application-guide',
  source: 'fixture',
  evidence: ['measured volume', 'low documents'],
  totalSearchVolume: 2400,
  documentCount: 120,
  goldenRatio: 20,
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  read: false,
};

(async () => {
  const sentMessages: any[] = [];
  const registry = new MobilePushRegistry({
    now: () => new Date('2026-06-05T00:00:00.000Z'),
  });
  const dispatcher = new MobilePushDispatcher({
    registry,
    now: () => new Date('2026-06-05T00:01:00.000Z'),
    sender: async (message) => {
      sentMessages.push(message);
    },
  });

  const subscription = registry.upsert({
    pushToken: 'ExponentPushToken[fixture-token]',
    platform: 'expo',
    deviceId: 'device-1',
    appVersion: '0.1.0',
    locale: 'ko-KR',
  });

  assert('push subscription is enabled after upsert', subscription.enabled === true);
  assert('push registry counts enabled subscription', registry.counts().enabled === 1);

  const records = await dispatcher.publish([notification]);
  assert('push dispatcher records delivery', records.length === 1);
  assert('push dispatcher sends to token', sentMessages[0]?.to === 'ExponentPushToken[fixture-token]');
  assert('push message carries keyword payload', sentMessages[0]?.data?.keyword === notification.keyword);
  assert('push snapshot exposes recent sent delivery', dispatcher.snapshot().recentDeliveries[0]?.state === 'sent');

  const disabled = registry.disable(subscription.id);
  assert('push subscription can be disabled', disabled?.enabled === false);
  await dispatcher.publish([notification]);
  assert('disabled subscription does not receive more pushes', sentMessages.length === 1);

  const skippedRegistry = new MobilePushRegistry();
  skippedRegistry.upsert({
    pushToken: 'ExponentPushToken[no-sender]',
    platform: 'expo',
  });
  const skippedDispatcher = new MobilePushDispatcher({ registry: skippedRegistry });
  const skipped = await skippedDispatcher.publish([notification]);
  assert('missing push sender is skipped rather than throwing', skipped[0]?.state === 'skipped');

  let receivedRequest = '';
  const pushGateway = http.createServer((req, res) => {
    req.on('data', (chunk) => {
      receivedRequest += chunk;
    });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { status: 'ok', id: 'ticket-1' } }));
    });
  });
  const gatewayPort = await new Promise<number>((resolve) => {
    pushGateway.listen(0, '127.0.0.1', () => {
      const address = pushGateway.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
  try {
    const sender = createHttpMobilePushSender({
      url: `http://127.0.0.1:${gatewayPort}/push`,
    });
    await sender({
      to: 'ExponentPushToken[fixture-token]',
      title: 'SSS keyword',
      body: 'policy | volume 2,400',
      data: {
        notificationId: notification.id,
        product: notification.product,
        keyword: notification.keyword,
        grade: notification.grade,
        category: notification.category,
      },
    });
    assert('http push sender posts message payload', JSON.parse(receivedRequest).to === 'ExponentPushToken[fixture-token]');
    assert('expo push endpoint constant is official send path', EXPO_PUSH_SEND_ENDPOINT.includes('/--/api/v2/push/send'));
  } finally {
    await new Promise<void>((resolve, reject) => {
      pushGateway.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  console.log('[mobile-push-notifications.test] passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
