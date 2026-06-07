import crypto from 'crypto';
import type {
  MobileNotificationItem,
  MobilePushDeliveryRecord,
  MobilePushSnapshot,
  MobilePushSubscription,
  MobilePushSubscriptionRequest,
} from './contracts';

export type MobilePushSender = (message: MobilePushMessage) => Promise<void>;

export interface MobilePushMessage {
  to: string;
  title: string;
  body: string;
  data: {
    notificationId: string;
    product: MobileNotificationItem['product'];
    keyword: string;
    grade: MobileNotificationItem['grade'];
    category: string;
  };
}

export interface MobilePushRegistryOptions {
  now?: () => Date;
  maxSubscriptions?: number;
}

export interface MobilePushDispatcherOptions {
  registry: MobilePushRegistry;
  sender?: MobilePushSender | null;
  now?: () => Date;
  maxDeliveryRecords?: number;
}

export interface HttpMobilePushSenderOptions {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

export const EXPO_PUSH_SEND_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function stableSubscriptionId(token: string): string {
  const digest = crypto.createHash('sha1').update(token.trim()).digest('hex').slice(0, 16);
  return `mobile_push_${digest}`;
}

function trimText(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function titleForNotification(item: MobileNotificationItem): string {
  return item.grade === 'SSS'
    ? `SSS keyword: ${item.keyword}`
    : `${item.grade} keyword: ${item.keyword}`;
}

function bodyForNotification(item: MobileNotificationItem): string {
  const volume = typeof item.totalSearchVolume === 'number'
    ? `volume ${item.totalSearchVolume.toLocaleString('ko-KR')}`
    : 'measured keyword';
  const ratio = typeof item.goldenRatio === 'number'
    ? `ratio ${item.goldenRatio.toFixed(2)}`
    : item.source;
  return `${item.category} | ${volume} | ${ratio}`;
}

export class MobilePushRegistry {
  private readonly now: () => Date;
  private readonly maxSubscriptions: number;
  private readonly subscriptions = new Map<string, MobilePushSubscription>();
  private updatedAt: string;

  constructor(options: MobilePushRegistryOptions = {}) {
    this.now = options.now || (() => new Date());
    this.maxSubscriptions = Math.max(10, options.maxSubscriptions || 5000);
    this.updatedAt = this.now().toISOString();
  }

  upsert(request: MobilePushSubscriptionRequest): MobilePushSubscription {
    const pushToken = trimText(request.pushToken, 512);
    if (!pushToken) {
      throw new Error('mobile push token is required');
    }

    const stamp = this.now().toISOString();
    const id = stableSubscriptionId(pushToken);
    const existing = this.subscriptions.get(id);
    const subscription: MobilePushSubscription = {
      id,
      pushToken,
      platform: request.platform,
      deviceId: trimText(request.deviceId, 120) || null,
      appVersion: trimText(request.appVersion, 60) || null,
      locale: trimText(request.locale, 30) || null,
      enabled: true,
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    };

    this.subscriptions.set(id, subscription);
    this.trim();
    this.touch();
    return { ...subscription };
  }

  disable(id: string): MobilePushSubscription | undefined {
    const existing = this.subscriptions.get(id);
    if (!existing) return undefined;
    const next = {
      ...existing,
      enabled: false,
      updatedAt: this.now().toISOString(),
    };
    this.subscriptions.set(id, next);
    this.touch();
    return { ...next };
  }

  enabled(): MobilePushSubscription[] {
    return [...this.subscriptions.values()]
      .filter((item) => item.enabled)
      .map((item) => ({ ...item }));
  }

  counts(): { enabled: number; disabled: number; updatedAt: string } {
    const values = [...this.subscriptions.values()];
    return {
      enabled: values.filter((item) => item.enabled).length,
      disabled: values.filter((item) => !item.enabled).length,
      updatedAt: this.updatedAt,
    };
  }

  private trim(): void {
    const overflow = this.subscriptions.size - this.maxSubscriptions;
    if (overflow <= 0) return;
    const oldest = [...this.subscriptions.values()]
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .slice(0, overflow);
    for (const item of oldest) {
      this.subscriptions.delete(item.id);
    }
  }

  private touch(): void {
    this.updatedAt = this.now().toISOString();
  }
}

export class MobilePushDispatcher {
  private readonly registry: MobilePushRegistry;
  private readonly sender: MobilePushSender | null;
  private readonly now: () => Date;
  private readonly maxDeliveryRecords: number;
  private readonly deliveries: MobilePushDeliveryRecord[] = [];
  private updatedAt: string;

  constructor(options: MobilePushDispatcherOptions) {
    this.registry = options.registry;
    this.sender = options.sender || null;
    this.now = options.now || (() => new Date());
    this.maxDeliveryRecords = Math.max(10, options.maxDeliveryRecords || 300);
    this.updatedAt = this.now().toISOString();
  }

  async publish(items: MobileNotificationItem[]): Promise<MobilePushDeliveryRecord[]> {
    const subscriptions = this.registry.enabled();
    const records: MobilePushDeliveryRecord[] = [];
    for (const item of items) {
      for (const subscription of subscriptions) {
        records.push(await this.sendOne(item, subscription));
      }
    }
    this.trim();
    this.touch();
    return records.map((record) => ({ ...record }));
  }

  snapshot(limit = 20): MobilePushSnapshot {
    const counts = this.registry.counts();
    return {
      enabledSubscriptions: counts.enabled,
      disabledSubscriptions: counts.disabled,
      updatedAt: this.updatedAt,
      recentDeliveries: this.deliveries.slice(-Math.max(1, limit)).reverse().map((item) => ({ ...item })),
    };
  }

  private async sendOne(
    item: MobileNotificationItem,
    subscription: MobilePushSubscription,
  ): Promise<MobilePushDeliveryRecord> {
    const stamp = this.now().toISOString();
    const baseRecord = {
      id: `mobile_push_delivery_${this.deliveries.length + 1}_${Date.now().toString(36)}`,
      notificationId: item.id,
      subscriptionId: subscription.id,
      pushToken: subscription.pushToken,
      createdAt: stamp,
    };

    if (!this.sender) {
      const skipped: MobilePushDeliveryRecord = {
        ...baseRecord,
        state: 'skipped',
        error: 'mobile push sender is not configured',
      };
      this.deliveries.push(skipped);
      return skipped;
    }

    try {
      await this.sender({
        to: subscription.pushToken,
        title: titleForNotification(item),
        body: bodyForNotification(item),
        data: {
          notificationId: item.id,
          product: item.product,
          keyword: item.keyword,
          grade: item.grade,
          category: item.category,
        },
      });
      const sent: MobilePushDeliveryRecord = {
        ...baseRecord,
        state: 'sent',
      };
      this.deliveries.push(sent);
      return sent;
    } catch (err) {
      const failed: MobilePushDeliveryRecord = {
        ...baseRecord,
        state: 'failed',
        error: (err as Error).message || String(err),
      };
      this.deliveries.push(failed);
      return failed;
    }
  }

  private trim(): void {
    const overflow = this.deliveries.length - this.maxDeliveryRecords;
    if (overflow > 0) {
      this.deliveries.splice(0, overflow);
    }
  }

  private touch(): void {
    this.updatedAt = this.now().toISOString();
  }
}

export function createHttpMobilePushSender(options: HttpMobilePushSenderOptions): MobilePushSender {
  const endpoint = options.url.trim();
  const timeoutMs = Math.max(1000, options.timeoutMs || 5000);
  return async (message) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`mobile push gateway failed: ${response.status}`);
      }
      const payload = await response.json().catch(() => null) as any;
      const tickets = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
      const failedTicket = tickets.find((ticket: any) => ticket?.status === 'error');
      if (failedTicket) {
        throw new Error(failedTicket.message || failedTicket.details?.error || 'mobile push gateway returned an error ticket');
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createEnvironmentMobilePushSender(): MobilePushSender | null {
  const provider = (process.env['LEWORD_MOBILE_PUSH_PROVIDER'] || '').trim().toLowerCase();
  const url = (process.env['LEWORD_MOBILE_PUSH_ENDPOINT'] || (provider === 'expo' ? EXPO_PUSH_SEND_ENDPOINT : '')).trim();
  if (!url) return null;
  return createHttpMobilePushSender({
    url,
    bearerToken: (process.env['LEWORD_MOBILE_PUSH_TOKEN'] || '').trim() || undefined,
    timeoutMs: Number(process.env['LEWORD_MOBILE_PUSH_TIMEOUT_MS'] || 5000),
  });
}
