import {
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobileNotificationKind,
  type MobileNotificationItem,
  type MobileNotificationSnapshot,
} from './contracts';

export interface MobileNotificationInboxOptions {
  now?: () => Date;
  maxEntries?: number;
  onPublish?: (items: MobileNotificationItem[]) => void;
}

export interface PublishMobileResultNotificationOptions {
  product: MobileKeywordProduct;
  kind?: MobileNotificationKind;
  title: string;
  targetLabel?: string;
  result: MobileKeywordResult;
  limit?: number;
}

const VALUABLE_GRADES = new Set(['SSS', 'SS', 'S']);

function makeNotificationId(product: MobileKeywordProduct, keyword: string): string {
  const slug = keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .slice(0, 80);
  return `mobile_notice_${product}_${slug}`;
}

function scoreNotification(item: MobileKeywordResult['keywords'][number]): number {
  const gradeScore = item.grade === 'SSS' ? 100 : item.grade === 'SS' ? 80 : item.grade === 'S' ? 60 : 0;
  const measuredScore = item.isMeasured ? 20 : 0;
  const ratioScore = Math.min(50, Math.max(0, item.goldenRatio || 0));
  const volumeScore = Math.min(30, Math.log10(Math.max(1, item.totalSearchVolume || 0)) * 6);
  return gradeScore + measuredScore + ratioScore + volumeScore;
}

export class MobileNotificationInbox {
  private readonly now: () => Date;
  private readonly maxEntries: number;
  private publishListener: ((items: MobileNotificationItem[]) => void) | null;
  private readonly items = new Map<string, MobileNotificationItem>();
  private updatedAt: string;

  constructor(options: MobileNotificationInboxOptions = {}) {
    this.now = options.now || (() => new Date());
    this.maxEntries = Math.max(10, options.maxEntries || 100);
    this.publishListener = options.onPublish || null;
    this.updatedAt = this.now().toISOString();
  }

  setPublishListener(listener: ((items: MobileNotificationItem[]) => void) | null): void {
    this.publishListener = listener;
  }

  publishFromResult(options: PublishMobileResultNotificationOptions): MobileNotificationItem[] {
    const stamp = this.now().toISOString();
    const keywords = Array.isArray(options.result?.keywords) ? options.result.keywords : [];
    const winners = keywords
      .filter((item) => VALUABLE_GRADES.has(item.grade) && item.isMeasured)
      .sort((a, b) => scoreNotification(b) - scoreNotification(a))
      .slice(0, Math.max(1, options.limit || 3));

    const published: MobileNotificationItem[] = [];
    for (const winner of winners) {
      const id = makeNotificationId(options.product, winner.keyword);
      const existing = this.items.get(id);
      const next: MobileNotificationItem = {
        id,
        kind: options.kind || 'prewarm-winner',
        product: options.product,
        title: options.title,
        keyword: winner.keyword,
        grade: winner.grade,
        category: options.targetLabel || winner.category,
        intent: winner.intent,
        source: winner.source,
        evidence: [...winner.evidence],
        totalSearchVolume: winner.totalSearchVolume,
        documentCount: winner.documentCount,
        goldenRatio: winner.goldenRatio,
        createdAt: existing?.createdAt || stamp,
        updatedAt: stamp,
        read: false,
      };
      this.items.set(id, next);
      published.push(next);
    }

    this.trim();
    this.touch();
    this.publishListener?.(published.map((item) => ({
      ...item,
      evidence: [...item.evidence],
    })));
    return published;
  }

  markRead(id: string): MobileNotificationItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;
    const next = {
      ...item,
      read: true,
      updatedAt: this.now().toISOString(),
    };
    this.items.set(id, next);
    this.touch();
    return { ...next, evidence: [...next.evidence] };
  }

  snapshot(limit = 30): MobileNotificationSnapshot {
    const items = this.sortedItems().slice(0, Math.max(1, limit)).map((item) => ({
      ...item,
      evidence: [...item.evidence],
    }));
    return {
      total: this.items.size,
      unreadCount: [...this.items.values()].filter((item) => !item.read).length,
      updatedAt: this.updatedAt,
      items,
    };
  }

  private sortedItems(): MobileNotificationItem[] {
    return [...this.items.values()].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }

  private trim(): void {
    const overflow = this.items.size - this.maxEntries;
    if (overflow <= 0) return;
    for (const item of this.sortedItems().reverse().slice(0, overflow)) {
      this.items.delete(item.id);
    }
  }

  private touch(): void {
    this.updatedAt = this.now().toISOString();
  }
}
