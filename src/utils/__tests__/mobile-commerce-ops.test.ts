import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildCommerceDashboard,
  buildCommerceCatalog,
  createCommerceOrder,
  confirmTossPayment,
  recordAnalyticsEvent,
  recordTossWebhookEvent,
  readCommerceStore,
} from '../../mobile/commerce-ops';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-commerce-ops] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function tempFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-commerce-ops-'));
  return path.join(dir, name);
}

async function main(): Promise<void> {
  const now = new Date('2026-06-21T04:30:00.000Z'); // 2026-06-21 13:30 KST
  const storeFile = tempFile('store.json');

  const catalog = buildCommerceCatalog({
    products: [
      {
        id: 'leword',
        name: 'LEWORD',
        status: 'published',
        plans: [
          { id: 'monthly', name: '월간', price: 30000, currency: 'KRW', status: 'published' },
          { id: 'hidden', name: '숨김', price: 999999, currency: 'KRW', status: 'draft' },
        ],
      },
    ],
  });

  assert('catalog exposes only published sellable plans',
    catalog.products.length === 1
      && catalog.products[0].plans.length === 1
      && catalog.products[0].plans[0].id === 'monthly');

  const order = createCommerceOrder({
    storeFile,
    catalog,
    now: () => now,
    input: {
      items: [{ productId: 'leword', planId: 'monthly', quantity: 2 }],
      buyer: { name: '홍길동', email: 'buyer@example.com', phone: '01012345678' },
      visitorId: 'visitor-a',
      sessionId: 'session-a',
    },
  });

  assert('order total is calculated from catalog price and quantity',
    order.order.amount === 60000
      && order.order.orderName === 'LEWORD 월간 x2'
      && order.order.status === 'READY',
    JSON.stringify(order.order));

  const mismatch = await confirmTossPayment({
    storeFile,
    now: () => now,
    input: {
      orderId: order.order.orderId,
      paymentKey: 'pay_mismatch',
      amount: 59000,
    },
    fetchPayment: async () => {
      throw new Error('remote fetch should not run for amount mismatch');
    },
  });

  assert('payment confirmation rejects amount mismatch before remote call',
    mismatch.ok === false && /amount-mismatch/.test(mismatch.reason || ''),
    JSON.stringify(mismatch));

  const confirmed = await confirmTossPayment({
    storeFile,
    now: () => now,
    input: {
      orderId: order.order.orderId,
      paymentKey: 'pay_done',
      amount: 60000,
    },
    fetchPayment: async () => ({
      paymentKey: 'pay_done',
      orderId: order.order.orderId,
      orderName: order.order.orderName,
      status: 'DONE',
      method: '카드',
      totalAmount: 60000,
      balanceAmount: 60000,
      requestedAt: '2026-06-21T13:29:00+09:00',
      approvedAt: '2026-06-21T13:30:00+09:00',
      receipt: { url: 'https://receipt.example.test' },
    }),
  });

  assert('payment confirmation stores DONE payment and marks order paid',
    confirmed.ok === true
      && confirmed.payment?.status === 'DONE'
      && confirmed.order?.status === 'PAID',
    JSON.stringify(confirmed));

  const webhook = recordTossWebhookEvent({
    storeFile,
    now: () => now,
    event: {
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: '2026-06-21T13:31:00.000000',
      data: {
        paymentKey: 'pay_done',
        orderId: order.order.orderId,
        orderName: order.order.orderName,
        status: 'PARTIAL_CANCELED',
        method: '카드',
        totalAmount: 60000,
        balanceAmount: 30000,
        approvedAt: '2026-06-21T13:30:00+09:00',
      },
    },
  });

  assert('webhook updates existing payment status idempotently',
    webhook.ok === true
      && webhook.payment?.status === 'PARTIAL_CANCELED'
      && webhook.order?.status === 'PARTIAL_CANCELED');

  recordAnalyticsEvent({
    storeFile,
    now: () => now,
    input: {
      type: 'pageview',
      path: '/leword',
      visitorId: 'visitor-a',
      sessionId: 'session-a',
      referrer: 'https://naver.com',
    },
    request: { ip: '203.0.113.10', userAgent: 'test-agent' },
  });
  recordAnalyticsEvent({
    storeFile,
    now: () => now,
    input: {
      type: 'pageview',
      path: '/leword',
      visitorId: 'admin-visitor',
      sessionId: 'admin-session',
      internal: true,
    },
    request: { ip: '127.0.0.1', userAgent: 'admin-agent' },
  });

  const dashboard = buildCommerceDashboard({
    storeFile,
    now: () => now,
    period: 'today',
  });

  assert('dashboard reports KST today revenue, sold quantity, and excludes internal visits',
    dashboard.revenue.today.netAmount === 30000
      && dashboard.revenue.today.orderCount === 1
      && dashboard.products[0].quantity === 2
      && dashboard.analytics.today.uniqueVisitors === 1
      && dashboard.analytics.today.internalEvents === 1,
    JSON.stringify(dashboard));

  const stored = readCommerceStore(storeFile);
  assert('buyer details are stored for order operations but admin summaries mask them',
    stored.orders[0].buyer.email === 'buyer@example.com'
      && dashboard.recentOrders[0].buyer.email === 'b***@example.com');

  console.log('[mobile-commerce-ops] passed');
}

main().catch((err) => {
  console.error('[mobile-commerce-ops] failed:', err);
  process.exit(1);
});
