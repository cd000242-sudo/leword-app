import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type CommerceCurrency = 'KRW';
export type CommerceOrderStatus = 'READY' | 'PAID' | 'PARTIAL_CANCELED' | 'CANCELED' | 'FAILED';
export type CommercePaymentStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_DEPOSIT'
  | 'DONE'
  | 'CANCELED'
  | 'PARTIAL_CANCELED'
  | 'ABORTED'
  | 'EXPIRED'
  | string;

export interface CommercePlan {
  id: string;
  name: string;
  price: number;
  currency: CommerceCurrency;
  status: 'published' | 'draft' | 'archived';
  billingPeriod?: string | null;
  description?: string | null;
}

export interface CommerceProduct {
  id: string;
  name: string;
  status: 'published' | 'draft' | 'archived';
  href?: string | null;
  description?: string | null;
  plans: CommercePlan[];
}

export interface CommerceCatalog {
  updatedAt: string;
  products: CommerceProduct[];
  toss: {
    clientKeyConfigured: boolean;
    clientKey: string | null;
  };
}

export interface CommerceOrderItem {
  productId: string;
  productName: string;
  planId: string;
  planName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  currency: CommerceCurrency;
}

export interface CommerceBuyer {
  name: string;
  email: string;
  phone: string;
}

export interface CommerceOrder {
  orderId: string;
  orderName: string;
  amount: number;
  currency: CommerceCurrency;
  status: CommerceOrderStatus;
  items: CommerceOrderItem[];
  buyer: CommerceBuyer;
  visitorId: string | null;
  sessionId: string | null;
  customerKey: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  paymentKey?: string | null;
}

export interface CommercePayment {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: CommercePaymentStatus;
  method: string | null;
  totalAmount: number;
  balanceAmount: number;
  requestedAt: string | null;
  approvedAt: string | null;
  receiptUrl: string | null;
  raw?: Record<string, unknown>;
  updatedAt: string;
}

export interface CommercePaymentEvent {
  id: string;
  eventType: string;
  paymentKey: string | null;
  orderId: string | null;
  status: string | null;
  createdAt: string;
  receivedAt: string;
  raw?: Record<string, unknown>;
}

export interface AnalyticsEventInput {
  type: 'pageview' | 'event' | string;
  eventName?: string;
  path?: string;
  title?: string;
  visitorId?: string;
  sessionId?: string;
  productId?: string;
  planId?: string;
  orderId?: string;
  referrer?: string;
  internal?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
}

export interface AnalyticsEvent extends Required<Pick<AnalyticsEventInput, 'type'>> {
  id: string;
  eventName: string | null;
  path: string;
  title: string | null;
  visitorId: string;
  sessionId: string;
  productId: string | null;
  planId: string | null;
  orderId: string | null;
  referrer: string | null;
  internal: boolean;
  ipHash: string | null;
  userAgentHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CommerceStore {
  version: 1;
  orders: CommerceOrder[];
  payments: CommercePayment[];
  paymentEvents: CommercePaymentEvent[];
  analyticsEvents: AnalyticsEvent[];
}

export interface CreateCommerceOrderInput {
  items: Array<{
    productId?: string;
    planId?: string;
    quantity?: number;
  }>;
  buyer?: Partial<CommerceBuyer>;
  visitorId?: string;
  sessionId?: string;
}

export interface ConfirmTossPaymentInput {
  orderId: string;
  paymentKey: string;
  amount: number;
}

export interface ConfirmTossPaymentResult {
  ok: boolean;
  reason?: string;
  order?: CommerceOrder;
  payment?: CommercePayment;
  toss?: unknown;
}

export type TossPaymentFetcher = (input: ConfirmTossPaymentInput) => Promise<Record<string, unknown>>;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function nowIso(now?: () => Date): string {
  return (now?.() || new Date()).toISOString();
}

function compactText(value: unknown, max = 200): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function compactPhone(value: unknown): string {
  return String(value || '').replace(/[^\d]/g, '').slice(0, 15);
}

function finiteMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeStatus(value: unknown): 'published' | 'draft' | 'archived' {
  return value === 'published' || value === 'draft' || value === 'archived' ? value : 'published';
}

function defaultProducts(): CommerceProduct[] {
  return [
    {
      id: 'leword',
      name: 'LEWORD Pro',
      status: 'published',
      href: '/leword',
      description: 'PC-grade keyword discovery and Pro web access.',
      plans: [
        {
          id: 'monthly',
          name: '월간 이용권',
          price: 30000,
          currency: 'KRW',
          status: 'published',
          billingPeriod: '1개월',
        },
      ],
    },
  ];
}

function normalizePlan(value: unknown): CommercePlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = compactText(raw.id || raw.planId, 64);
  const name = compactText(raw.name || raw.title || id, 100);
  const price = finiteMoney(raw.salePrice ?? raw.price ?? raw.amount);
  if (!id || !name || price <= 0) return null;
  return {
    id,
    name,
    price,
    currency: 'KRW',
    status: normalizeStatus(raw.status),
    billingPeriod: compactText(raw.billingPeriod || raw.period, 40) || null,
    description: compactText(raw.description || raw.note, 300) || null,
  };
}

function normalizeProduct(value: unknown): CommerceProduct | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = compactText(raw.id || raw.productId, 64);
  const name = compactText(raw.name || raw.title || id, 100);
  if (!id || !name) return null;

  const explicitPlans = Array.isArray(raw.plans) ? raw.plans.map(normalizePlan).filter(Boolean) as CommercePlan[] : [];
  const implicitPlan = normalizePlan({
    id: raw.defaultPlanId || 'default',
    name: raw.planName || raw.priceLabel || '기본 이용권',
    price: raw.salePrice ?? raw.price ?? raw.amount,
    status: raw.status,
    billingPeriod: raw.billingPeriod || raw.period,
    description: raw.planDescription || raw.note,
  });
  const plans = explicitPlans.length ? explicitPlans : (implicitPlan ? [implicitPlan] : []);

  return {
    id,
    name,
    status: normalizeStatus(raw.status),
    href: compactText(raw.href, 300) || null,
    description: compactText(raw.description || raw.note, 500) || null,
    plans,
  };
}

export function tossClientKey(): string {
  return compactText(
    process.env['TOSS_PAYMENTS_CLIENT_KEY']
      || process.env['TOSS_CLIENT_KEY']
      || process.env['LEWORD_TOSS_CLIENT_KEY']
      || '',
    300,
  );
}

export function tossSecretKey(): string {
  return compactText(
    process.env['TOSS_PAYMENTS_SECRET_KEY']
      || process.env['TOSS_SECRET_KEY']
      || process.env['LEWORD_TOSS_SECRET_KEY']
      || '',
    300,
  );
}

export function buildCommerceCatalog(siteContent?: { products?: unknown }): CommerceCatalog {
  const rawProducts = Array.isArray(siteContent?.products) ? siteContent?.products || [] : [];
  const products = rawProducts
    .map(normalizeProduct)
    .filter((product): product is CommerceProduct => !!product)
    .map((product) => ({
      ...product,
      plans: product.plans.filter((plan) => plan.status === 'published'),
    }))
    .filter((product) => product.status === 'published' && product.plans.length > 0);
  const sellable = products.length ? products : defaultProducts();
  const clientKey = tossClientKey();
  return {
    updatedAt: new Date().toISOString(),
    products: sellable,
    toss: {
      clientKeyConfigured: !!clientKey,
      clientKey: clientKey || null,
    },
  };
}

function dataRoot(): string {
  if (process.env['LEWORD_API_DATA_DIR']) return process.env['LEWORD_API_DATA_DIR'];
  if (fs.existsSync('/data')) return '/data';
  return path.resolve(process.cwd(), 'data');
}

export function resolveCommerceStoreFile(explicit?: string): string {
  return explicit
    || process.env['LEWORD_COMMERCE_STORE_FILE']
    || path.join(dataRoot(), 'leword-commerce-store.json');
}

function emptyStore(): CommerceStore {
  return {
    version: 1,
    orders: [],
    payments: [],
    paymentEvents: [],
    analyticsEvents: [],
  };
}

export function readCommerceStore(filePath?: string): CommerceStore {
  const resolved = resolveCommerceStoreFile(filePath);
  if (!fs.existsSync(resolved)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Partial<CommerceStore>;
    return {
      version: 1,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      paymentEvents: Array.isArray(parsed.paymentEvents) ? parsed.paymentEvents : [],
      analyticsEvents: Array.isArray(parsed.analyticsEvents) ? parsed.analyticsEvents : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeCommerceStore(filePath: string | undefined, store: CommerceStore): void {
  const resolved = resolveCommerceStoreFile(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, resolved);
}

function makeOrderId(now: Date): string {
  const ymd = new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
  return `LW-${ymd}-${crypto.randomBytes(8).toString('hex')}`;
}

function makeCustomerKey(seed: string): string {
  return `cust_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function findPlan(catalog: CommerceCatalog, productId: string, planId: string): {
  product: CommerceProduct;
  plan: CommercePlan;
} | null {
  const product = catalog.products.find((item) => item.id === productId && item.status === 'published');
  const plan = product?.plans.find((item) => item.id === planId && item.status === 'published');
  return product && plan ? { product, plan } : null;
}

function orderNameFromItems(items: CommerceOrderItem[]): string {
  if (items.length === 1) {
    const item = items[0];
    return `${item.productName} ${item.planName}${item.quantity > 1 ? ` x${item.quantity}` : ''}`.slice(0, 100);
  }
  return `${items[0].productName} ${items[0].planName} 외 ${items.length - 1}건`.slice(0, 100);
}

export function createCommerceOrder(params: {
  storeFile?: string;
  catalog: CommerceCatalog;
  input: CreateCommerceOrderInput;
  now?: () => Date;
}): { order: CommerceOrder; store: CommerceStore } {
  const now = params.now?.() || new Date();
  const createdAt = now.toISOString();
  const orderItems: CommerceOrderItem[] = [];
  for (const inputItem of params.input.items || []) {
    const productId = compactText(inputItem.productId, 64);
    const planId = compactText(inputItem.planId, 64);
    const found = findPlan(params.catalog, productId, planId);
    if (!found) throw new Error('sellable-plan-not-found');
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(inputItem.quantity || 1) || 1)));
    orderItems.push({
      productId: found.product.id,
      productName: found.product.name,
      planId: found.plan.id,
      planName: found.plan.name,
      unitPrice: found.plan.price,
      quantity,
      amount: found.plan.price * quantity,
      currency: 'KRW',
    });
  }
  if (!orderItems.length) throw new Error('order-items-required');

  const amount = orderItems.reduce((sum, item) => sum + item.amount, 0);
  const orderId = makeOrderId(now);
  const buyer: CommerceBuyer = {
    name: compactText(params.input.buyer?.name, 80),
    email: compactText(params.input.buyer?.email, 100),
    phone: compactPhone(params.input.buyer?.phone),
  };
  const order: CommerceOrder = {
    orderId,
    orderName: orderNameFromItems(orderItems),
    amount,
    currency: 'KRW',
    status: 'READY',
    items: orderItems,
    buyer,
    visitorId: compactText(params.input.visitorId, 120) || null,
    sessionId: compactText(params.input.sessionId, 120) || null,
    customerKey: makeCustomerKey(`${params.input.visitorId || ''}:${orderId}:${createdAt}`),
    createdAt,
    updatedAt: createdAt,
    paidAt: null,
    paymentKey: null,
  };

  const store = readCommerceStore(params.storeFile);
  store.orders.push(order);
  writeCommerceStore(params.storeFile, store);
  return { order, store };
}

function numberFromPayment(value: unknown): number {
  return finiteMoney(value);
}

function normalizeTossPayment(value: Record<string, unknown>, receivedAt: string): CommercePayment {
  return {
    paymentKey: compactText(value.paymentKey, 220),
    orderId: compactText(value.orderId, 80),
    orderName: compactText(value.orderName, 100),
    status: compactText(value.status, 40),
    method: compactText(value.method, 40) || null,
    totalAmount: numberFromPayment(value.totalAmount),
    balanceAmount: numberFromPayment(value.balanceAmount ?? value.totalAmount),
    requestedAt: compactText(value.requestedAt, 80) || null,
    approvedAt: compactText(value.approvedAt, 80) || null,
    receiptUrl: value.receipt && typeof value.receipt === 'object'
      ? compactText((value.receipt as Record<string, unknown>).url, 500) || null
      : null,
    raw: value,
    updatedAt: receivedAt,
  };
}

function orderStatusFromPayment(status: string): CommerceOrderStatus {
  if (status === 'DONE') return 'PAID';
  if (status === 'PARTIAL_CANCELED') return 'PARTIAL_CANCELED';
  if (status === 'CANCELED') return 'CANCELED';
  if (status === 'ABORTED' || status === 'EXPIRED') return 'FAILED';
  return 'READY';
}

function upsertPayment(store: CommerceStore, payment: CommercePayment): void {
  const index = store.payments.findIndex((item) => item.paymentKey === payment.paymentKey);
  if (index >= 0) store.payments[index] = { ...store.payments[index], ...payment };
  else store.payments.push(payment);

  const order = store.orders.find((item) => item.orderId === payment.orderId);
  if (order) {
    order.paymentKey = payment.paymentKey;
    order.status = orderStatusFromPayment(payment.status);
    order.updatedAt = payment.updatedAt;
    order.paidAt = payment.approvedAt || order.paidAt || null;
  }
}

async function fetchTossConfirm(input: ConfirmTossPaymentInput): Promise<Record<string, unknown>> {
  const secret = tossSecretKey();
  if (!secret) throw new Error('toss-secret-key-not-configured');
  const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`, 'utf8').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = compactText((payload as Record<string, unknown>).message || response.statusText, 300);
    throw new Error(message || `toss-confirm-http-${response.status}`);
  }
  return payload as Record<string, unknown>;
}

export async function confirmTossPayment(params: {
  storeFile?: string;
  input: ConfirmTossPaymentInput;
  fetchPayment?: TossPaymentFetcher;
  now?: () => Date;
}): Promise<ConfirmTossPaymentResult> {
  const store = readCommerceStore(params.storeFile);
  const order = store.orders.find((item) => item.orderId === compactText(params.input.orderId, 80));
  if (!order) return { ok: false, reason: 'order-not-found' };
  const amount = finiteMoney(params.input.amount);
  if (order.amount !== amount) {
    return { ok: false, reason: `amount-mismatch:${order.amount}:${amount}`, order };
  }

  try {
    const toss = await (params.fetchPayment || fetchTossConfirm)(params.input);
    const payment = normalizeTossPayment(toss, nowIso(params.now));
    if (!payment.paymentKey || !payment.orderId) return { ok: false, reason: 'invalid-toss-payment', toss };
    if (payment.orderId !== order.orderId || payment.totalAmount !== order.amount) {
      return { ok: false, reason: 'toss-payment-order-mismatch', order, payment, toss };
    }
    upsertPayment(store, payment);
    writeCommerceStore(params.storeFile, store);
    return {
      ok: true,
      order: store.orders.find((item) => item.orderId === order.orderId),
      payment,
      toss,
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'toss-confirm-failed', order };
  }
}

function eventId(event: Record<string, unknown>, payment: Record<string, unknown>, receivedAt: string): string {
  return crypto.createHash('sha1').update(JSON.stringify({
    eventType: event.eventType,
    createdAt: event.createdAt,
    paymentKey: payment.paymentKey,
    orderId: payment.orderId,
    status: payment.status,
    lastTransactionKey: payment.lastTransactionKey,
    receivedAt: event.createdAt ? undefined : receivedAt,
  })).digest('hex');
}

export function recordTossWebhookEvent(params: {
  storeFile?: string;
  event: Record<string, unknown>;
  now?: () => Date;
}): { ok: boolean; event: CommercePaymentEvent; order?: CommerceOrder; payment?: CommercePayment } {
  const store = readCommerceStore(params.storeFile);
  const receivedAt = nowIso(params.now);
  const rawData = params.event.data && typeof params.event.data === 'object'
    ? params.event.data as Record<string, unknown>
    : {};
  const paymentData = rawData.payment && typeof rawData.payment === 'object'
    ? rawData.payment as Record<string, unknown>
    : rawData;
  const payment = normalizeTossPayment(paymentData, receivedAt);
  const item: CommercePaymentEvent = {
    id: eventId(params.event, paymentData, receivedAt),
    eventType: compactText(params.event.eventType, 80) || 'UNKNOWN',
    paymentKey: payment.paymentKey || null,
    orderId: payment.orderId || null,
    status: payment.status || null,
    createdAt: compactText(params.event.createdAt, 80) || receivedAt,
    receivedAt,
    raw: params.event,
  };
  if (!store.paymentEvents.some((event) => event.id === item.id)) {
    store.paymentEvents.push(item);
  }
  if (payment.paymentKey && payment.orderId) upsertPayment(store, payment);
  writeCommerceStore(params.storeFile, store);
  return {
    ok: true,
    event: item,
    payment: payment.paymentKey ? store.payments.find((entry) => entry.paymentKey === payment.paymentKey) : undefined,
    order: payment.orderId ? store.orders.find((entry) => entry.orderId === payment.orderId) : undefined,
  };
}

function hashOptional(value: string | null | undefined): string | null {
  const clean = compactText(value, 500);
  return clean ? crypto.createHash('sha256').update(clean).digest('hex').slice(0, 32) : null;
}

function excludedIpSet(): Set<string> {
  return new Set(String(process.env['LEWORD_ANALYTICS_EXCLUDED_IPS'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
}

function makeEventId(input: AnalyticsEventInput, createdAt: string): string {
  return crypto.createHash('sha1').update(JSON.stringify({
    createdAt,
    visitorId: input.visitorId,
    sessionId: input.sessionId,
    type: input.type,
    path: input.path,
    eventName: input.eventName,
    random: crypto.randomBytes(6).toString('hex'),
  })).digest('hex');
}

export function recordAnalyticsEvent(params: {
  storeFile?: string;
  input: AnalyticsEventInput;
  request?: AnalyticsRequestMeta;
  now?: () => Date;
}): { ok: boolean; event: AnalyticsEvent } {
  const createdAt = nowIso(params.now);
  const ip = compactText(params.request?.ip, 120);
  const event: AnalyticsEvent = {
    id: makeEventId(params.input, createdAt),
    type: compactText(params.input.type || 'event', 40),
    eventName: compactText(params.input.eventName, 80) || null,
    path: compactText(params.input.path || '/', 500) || '/',
    title: compactText(params.input.title, 200) || null,
    visitorId: compactText(params.input.visitorId, 120) || 'anonymous',
    sessionId: compactText(params.input.sessionId, 120) || 'anonymous-session',
    productId: compactText(params.input.productId, 80) || null,
    planId: compactText(params.input.planId, 80) || null,
    orderId: compactText(params.input.orderId, 80) || null,
    referrer: compactText(params.input.referrer || params.request?.referrer, 500) || null,
    internal: params.input.internal === true || (!!ip && excludedIpSet().has(ip)),
    ipHash: hashOptional(ip),
    userAgentHash: hashOptional(params.request?.userAgent),
    metadata: params.input.metadata && typeof params.input.metadata === 'object' ? params.input.metadata : {},
    createdAt,
  };
  const store = readCommerceStore(params.storeFile);
  store.analyticsEvents.push(event);
  if (store.analyticsEvents.length > 20000) {
    store.analyticsEvents = store.analyticsEvents.slice(-20000);
  }
  writeCommerceStore(params.storeFile, store);
  return { ok: true, event };
}

function kstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function utcFromKstDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function periodRange(now: Date, period: 'today' | 'month'): { start: Date; end: Date } {
  const todayKey = kstDateKey(now);
  if (period === 'today') {
    const start = utcFromKstDate(todayKey);
    return { start, end: addUtcDays(start, 1) };
  }
  const monthKey = `${todayKey.slice(0, 7)}-01`;
  const start = utcFromKstDate(monthKey);
  const nextMonth = new Date(start.getTime());
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { start, end: nextMonth };
}

function inRange(iso: string | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= range.start.getTime() && time < range.end.getTime();
}

function paymentNetAmount(payment: CommercePayment): number {
  if (payment.status === 'DONE') return payment.totalAmount;
  if (payment.status === 'PARTIAL_CANCELED') return payment.balanceAmount;
  return 0;
}

function paymentCanceledAmount(payment: CommercePayment): number {
  if (payment.status === 'CANCELED') return payment.totalAmount;
  if (payment.status === 'PARTIAL_CANCELED') return Math.max(0, payment.totalAmount - payment.balanceAmount);
  return 0;
}

function revenueSummary(store: CommerceStore, range: { start: Date; end: Date }) {
  const payments = store.payments.filter((payment) => (
    payment.status === 'DONE' || payment.status === 'PARTIAL_CANCELED' || payment.status === 'CANCELED'
  ) && inRange(payment.approvedAt || payment.updatedAt, range));
  const grossAmount = payments.reduce((sum, payment) => sum + payment.totalAmount, 0);
  const netAmount = payments.reduce((sum, payment) => sum + paymentNetAmount(payment), 0);
  const canceledAmount = payments.reduce((sum, payment) => sum + paymentCanceledAmount(payment), 0);
  const orderIds = new Set(payments.map((payment) => payment.orderId));
  return {
    grossAmount,
    netAmount,
    canceledAmount,
    orderCount: orderIds.size,
    paymentCount: payments.length,
    averageOrderValue: orderIds.size ? Math.round(netAmount / orderIds.size) : 0,
  };
}

function maskEmail(value: string): string {
  const email = compactText(value, 100);
  const [name, domain] = email.split('@');
  if (!name || !domain) return email ? '***' : '';
  return `${name[0]}***@${domain}`;
}

function maskPhone(value: string): string {
  const phone = compactPhone(value);
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

function maskBuyer(buyer: CommerceBuyer): CommerceBuyer {
  return {
    name: buyer.name ? `${buyer.name.slice(0, 1)}**` : '',
    email: maskEmail(buyer.email),
    phone: maskPhone(buyer.phone),
  };
}

function paidPaymentsInRange(store: CommerceStore, range: { start: Date; end: Date }): CommercePayment[] {
  return store.payments.filter((payment) => (
    payment.status === 'DONE' || payment.status === 'PARTIAL_CANCELED'
  ) && inRange(payment.approvedAt || payment.updatedAt, range));
}

function productSummary(store: CommerceStore, range: { start: Date; end: Date }) {
  const paidOrderIds = new Set(paidPaymentsInRange(store, range).map((payment) => payment.orderId));
  const rows = new Map<string, {
    productId: string;
    productName: string;
    quantity: number;
    grossAmount: number;
    orderCount: number;
  }>();
  for (const order of store.orders) {
    if (!paidOrderIds.has(order.orderId)) continue;
    for (const item of order.items) {
      const key = item.productId;
      const current = rows.get(key) || {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        grossAmount: 0,
        orderCount: 0,
      };
      current.quantity += item.quantity;
      current.grossAmount += item.amount;
      current.orderCount += 1;
      rows.set(key, current);
    }
  }
  return [...rows.values()].sort((a, b) => b.grossAmount - a.grossAmount);
}

function analyticsSummary(store: CommerceStore, range: { start: Date; end: Date }) {
  const events = store.analyticsEvents.filter((event) => inRange(event.createdAt, range));
  const external = events.filter((event) => !event.internal);
  const pageviews = external.filter((event) => event.type === 'pageview').length;
  const uniqueVisitors = new Set(external.map((event) => event.visitorId).filter(Boolean)).size;
  const sessions = new Set(external.map((event) => event.sessionId).filter(Boolean)).size;
  return {
    events: external.length,
    pageviews,
    uniqueVisitors,
    sessions,
    internalEvents: events.length - external.length,
  };
}

export function buildCommerceDashboard(params: {
  storeFile?: string;
  now?: () => Date;
  period?: 'today' | 'month';
}) {
  const now = params.now?.() || new Date();
  const store = readCommerceStore(params.storeFile);
  const todayRange = periodRange(now, 'today');
  const monthRange = periodRange(now, 'month');
  const selectedRange = periodRange(now, params.period || 'today');
  const paidOrderIds = new Set(paidPaymentsInRange(store, selectedRange).map((payment) => payment.orderId));
  const recentOrders = store.orders
    .filter((order) => paidOrderIds.has(order.orderId) || inRange(order.createdAt, selectedRange))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map((order) => ({
      ...order,
      buyer: maskBuyer(order.buyer),
    }));
  return {
    updatedAt: now.toISOString(),
    timezone: 'Asia/Seoul',
    revenue: {
      today: revenueSummary(store, todayRange),
      month: revenueSummary(store, monthRange),
      selected: revenueSummary(store, selectedRange),
    },
    analytics: {
      today: analyticsSummary(store, todayRange),
      month: analyticsSummary(store, monthRange),
      selected: analyticsSummary(store, selectedRange),
    },
    products: productSummary(store, selectedRange),
    recentOrders,
    paymentEvents: store.paymentEvents.slice(-20).reverse(),
    storage: resolveCommerceStoreFile(params.storeFile),
  };
}
