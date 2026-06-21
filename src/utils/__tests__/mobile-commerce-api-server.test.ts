import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createLewordApiServer } from '../../../apps/api/src/server';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-commerce-api-server] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function postJson(url: string, body: unknown): Promise<{ response: Response; json: any }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-commerce-api-'));
  const oldContentFile = process.env.LEADERS_PRO_SITE_CONTENT_FILE;
  const oldStoreFile = process.env.LEWORD_COMMERCE_STORE_FILE;
  const oldClientKey = process.env.TOSS_PAYMENTS_CLIENT_KEY;
  const oldSecretKey = process.env.TOSS_PAYMENTS_SECRET_KEY;
  process.env.LEADERS_PRO_SITE_CONTENT_FILE = path.join(tmp, 'site-content.json');
  process.env.LEWORD_COMMERCE_STORE_FILE = path.join(tmp, 'commerce-store.json');
  process.env.TOSS_PAYMENTS_CLIENT_KEY = 'test_ck_client';
  delete process.env.TOSS_PAYMENTS_SECRET_KEY;

  fs.writeFileSync(process.env.LEADERS_PRO_SITE_CONTENT_FILE, `${JSON.stringify({
    section: 'products',
    products: [{
      id: 'leword',
      name: 'LEWORD',
      status: 'published',
      href: '/leword',
      plans: [
        { id: 'monthly', name: '월간', price: 45000, currency: 'KRW', status: 'published' },
        { id: 'draft', name: '숨김', price: 1, currency: 'KRW', status: 'draft' },
      ],
    }],
    chatbots: [],
    purchase: {},
  }, null, 2)}\n`, 'utf8');

  const server = createLewordApiServer({ entitlementVerifier: null });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const adminHtml = await fetch(`${baseUrl}/admin/`);
    const adminText = await adminHtml.text();
    assert('admin route renders commerce-capable Pro Web shell',
      adminHtml.status === 200
        && adminText.includes('id="commerce"')
        && adminText.includes('function initialViewId'),
      adminText.slice(0, 200));

    const catalog = await fetch(`${baseUrl}/v1/public/commerce/catalog`);
    const catalogJson: any = await catalog.json();
    assert('public commerce catalog exposes published admin-edited plan',
      catalog.status === 200
        && catalogJson.catalog.products[0].plans.length === 1
        && catalogJson.catalog.products[0].plans[0].price === 45000
        && catalogJson.catalog.toss.clientKey === 'test_ck_client',
      JSON.stringify(catalogJson));

    await postJson(`${baseUrl}/v1/analytics/collect`, {
      type: 'pageview',
      path: '/leword',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
    });
    await postJson(`${baseUrl}/v1/analytics/collect`, {
      type: 'pageview',
      path: '/admin',
      visitorId: 'admin',
      sessionId: 'admin-session',
      internal: true,
    });

    const order = await postJson(`${baseUrl}/v1/checkout/orders`, {
      items: [{ productId: 'leword', planId: 'monthly', quantity: 1 }],
      buyer: { name: 'Buyer', email: 'buyer@example.com', phone: '01012345678' },
      visitorId: 'visitor-1',
      sessionId: 'session-1',
    });
    assert('checkout order route calculates amount from public catalog',
      order.response.status === 201
        && order.json.order.amount === 45000
        && order.json.toss.clientKeyConfigured === true,
      JSON.stringify(order.json));

    const mismatch = await postJson(`${baseUrl}/v1/payments/toss/confirm`, {
      orderId: order.json.order.orderId,
      paymentKey: 'pay_wrong_amount',
      amount: 44000,
    });
    assert('toss confirm route rejects amount mismatch before remote secret call',
      mismatch.response.status === 400 && /amount-mismatch/.test(mismatch.json.reason || ''),
      JSON.stringify(mismatch.json));

    const webhook = await postJson(`${baseUrl}/v1/payments/toss/webhook`, {
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: new Date().toISOString(),
      data: {
        paymentKey: 'pay_done',
        orderId: order.json.order.orderId,
        orderName: order.json.order.orderName,
        status: 'DONE',
        method: 'CARD',
        totalAmount: 45000,
        balanceAmount: 45000,
        approvedAt: new Date().toISOString(),
      },
    });
    assert('toss webhook route records paid order', webhook.response.status === 202 && webhook.json.order.status === 'PAID');

    const dashboard = await fetch(`${baseUrl}/v1/admin/commerce/dashboard?period=today`);
    const dashboardJson: any = await dashboard.json();
    assert('admin commerce dashboard reports revenue and excludes internal visitor',
      dashboard.status === 200
        && dashboardJson.dashboard.revenue.selected.netAmount === 45000
        && dashboardJson.dashboard.analytics.selected.uniqueVisitors === 1
        && dashboardJson.dashboard.analytics.selected.internalEvents === 1
        && dashboardJson.dashboard.recentOrders[0].buyer.email === 'b***@example.com',
      JSON.stringify(dashboardJson));
  } finally {
    await close(server);
    if (oldContentFile === undefined) delete process.env.LEADERS_PRO_SITE_CONTENT_FILE;
    else process.env.LEADERS_PRO_SITE_CONTENT_FILE = oldContentFile;
    if (oldStoreFile === undefined) delete process.env.LEWORD_COMMERCE_STORE_FILE;
    else process.env.LEWORD_COMMERCE_STORE_FILE = oldStoreFile;
    if (oldClientKey === undefined) delete process.env.TOSS_PAYMENTS_CLIENT_KEY;
    else process.env.TOSS_PAYMENTS_CLIENT_KEY = oldClientKey;
    if (oldSecretKey === undefined) delete process.env.TOSS_PAYMENTS_SECRET_KEY;
    else process.env.TOSS_PAYMENTS_SECRET_KEY = oldSecretKey;
  }

  console.log('[mobile-commerce-api-server] passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('[mobile-commerce-api-server] failed:', err);
  process.exit(1);
});
