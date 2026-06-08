import type {
  GoldenDiscoveryMobileParams,
  HomeBoardMobileParams,
  KeywordAnalysisMobileParams,
  KinHiddenHoneyMobileParams,
  MindmapExpansionMobileParams,
  MobileJobEnvelope,
  MobileJobEvent,
  MobileAuthSession,
  MobileApiStatusSnapshot,
  MobileDashboardSnapshot,
  MobileKeywordExportArtifact,
  MobileKeywordExportRequest,
  MobileKeywordGroupInput,
  MobileKeywordGroupItem,
  MobileKeywordGroupSnapshot,
  MobileKeywordProduct,
  MobileKeywordResult,
  MobileLiveGoldenRadarSnapshot,
  MobileKeywordScheduleCreateInput,
  MobileKeywordScheduleItem,
  MobileKeywordScheduleUpdateInput,
  MobileNotificationItem,
  MobileNotificationSnapshot,
  MobilePcFeatureCatalog,
  MobilePrewarmSnapshot,
  MobileProBlueprintActionResult,
  MobileProBlueprintInput,
  MobileProDraftInput,
  MobileProPortfolioRevenueInput,
  MobileProOutcomeActionResult,
  MobileProOutcomeDeleteInput,
  MobileProOutcomeRecordInput,
  MobileProOutcomeSnapshot,
  MobileProRevenueConfigInput,
  MobileProRevenueEstimateInput,
  MobileProTrackedPostInput,
  MobilePushSnapshot,
  MobilePushSubscription,
  MobilePushSubscriptionRequest,
  MobileRankTrackingActionResult,
  MobileRankTrackingManualInput,
  MobileRankTrackingPairInput,
  MobileRankTrackingRunInput,
  MobileRankTrackingSnapshot,
  MobileScheduleDashboardSnapshot,
  MobileSourceSignalLane,
  MobileSourceSignalSnapshot,
  MobileWordPressDraftInput,
  MobileWordPressDraftItem,
  MobileWordPressCategory,
  MobileWordPressPublishInput,
  MobileWordPressPublishResult,
  MobileWordPressSiteInput,
  MobileWordPressSiteItem,
  MobileWordPressSnapshot,
  ProTrafficMobileParams,
} from '../contracts';
import {
  MOBILE_AUTH_ROUTES,
  MOBILE_API_ENDPOINTS,
  MOBILE_EXPORT_ROUTES,
  MOBILE_KEYWORD_GROUP_ROUTES,
  MOBILE_LIVE_GOLDEN_ROUTES,
  MOBILE_NOTIFICATION_ROUTES,
  MOBILE_PREWARM_ROUTES,
  MOBILE_PRO_BLUEPRINT_ROUTES,
  MOBILE_PRO_OUTCOME_ROUTES,
  MOBILE_PUSH_ROUTES,
  MOBILE_RANK_TRACKING_ROUTES,
  MOBILE_SCHEDULE_ROUTES,
  MOBILE_SOURCE_ROUTES,
  MOBILE_STATUS_ROUTES,
  MOBILE_WORDPRESS_ROUTES,
} from '../contracts';

export interface LewordMobileClientOptions {
  baseUrl: string;
  accessToken?: string;
}

export class LewordMobileClient {
  private readonly baseUrl: string;
  private readonly accessToken?: string;

  constructor(options: LewordMobileClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
  }

  async getHealth(): Promise<any> {
    const response = await this.request('/health', { method: 'GET' });
    return response.json();
  }

  async login(request: {
    userId: string;
    password: string;
    licenseCode?: string;
    panelServerUrl?: string;
  }): Promise<MobileAuthSession> {
    const response = await this.request(MOBILE_AUTH_ROUTES.login, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    return payload.session;
  }

  async getDashboard(): Promise<MobileDashboardSnapshot> {
    const response = await this.request(MOBILE_AUTH_ROUTES.dashboard, { method: 'GET' });
    const payload = await response.json();
    return payload.dashboard;
  }

  async getPcFeatureCatalog(): Promise<MobilePcFeatureCatalog> {
    const response = await this.request(MOBILE_AUTH_ROUTES.pcFeatures, { method: 'GET' });
    const payload = await response.json();
    return payload.catalog;
  }

  async getSourceSignals(
    lane: MobileSourceSignalLane = 'all',
    limit = 6,
  ): Promise<MobileSourceSignalSnapshot> {
    const search = new URLSearchParams({
      lane,
      limit: String(limit),
    });
    const response = await this.request(`${MOBILE_SOURCE_ROUTES.signals}?${search.toString()}`, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getApiStatus(): Promise<MobileApiStatusSnapshot> {
    const response = await this.request(MOBILE_STATUS_ROUTES.apiStatus, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async exportKeywords(
    request: MobileKeywordExportRequest,
  ): Promise<MobileKeywordExportArtifact> {
    const response = await this.request(MOBILE_EXPORT_ROUTES.keywords, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    return payload.artifact;
  }

  async getKeywordGroups(): Promise<MobileKeywordGroupSnapshot> {
    const response = await this.request(MOBILE_KEYWORD_GROUP_ROUTES.list, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getWordPressPublishing(): Promise<MobileWordPressSnapshot> {
    const response = await this.request(MOBILE_WORDPRESS_ROUTES.snapshot, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async saveWordPressSite(
    input: MobileWordPressSiteInput,
  ): Promise<{ site: MobileWordPressSiteItem; snapshot: MobileWordPressSnapshot }> {
    const response = await this.request(MOBILE_WORDPRESS_ROUTES.site, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      site: payload.site,
      snapshot: payload.snapshot,
    };
  }

  async createWordPressDraft(
    input: MobileWordPressDraftInput,
  ): Promise<{ draft: MobileWordPressDraftItem; snapshot: MobileWordPressSnapshot }> {
    const response = await this.request(MOBILE_WORDPRESS_ROUTES.drafts, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      draft: payload.draft,
      snapshot: payload.snapshot,
    };
  }

  async refreshWordPressCategories(
    siteId?: string,
  ): Promise<{
    site: MobileWordPressSiteItem;
    categories: MobileWordPressCategory[];
    snapshot: MobileWordPressSnapshot;
  }> {
    const search = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const response = await this.request(`${MOBILE_WORDPRESS_ROUTES.categories}${search}`, { method: 'GET' });
    const payload = await response.json();
    return {
      site: payload.site,
      categories: payload.categories,
      snapshot: payload.snapshot,
    };
  }

  async publishWordPressDraft(
    input: MobileWordPressPublishInput,
  ): Promise<{
    result: MobileWordPressPublishResult;
    draft: MobileWordPressDraftItem;
    snapshot: MobileWordPressSnapshot;
  }> {
    const response = await this.request(MOBILE_WORDPRESS_ROUTES.publish, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      result: payload.result,
      draft: payload.draft,
      snapshot: payload.snapshot,
    };
  }

  async getScheduleDashboard(): Promise<MobileScheduleDashboardSnapshot> {
    const response = await this.request(MOBILE_SCHEDULE_ROUTES.dashboard, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getRankTrackingSnapshot(): Promise<MobileRankTrackingSnapshot> {
    const response = await this.request(MOBILE_RANK_TRACKING_ROUTES.snapshot, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getProOutcomeSnapshot(): Promise<MobileProOutcomeSnapshot> {
    const response = await this.request(MOBILE_PRO_OUTCOME_ROUTES.snapshot, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async generateProBlueprint(
    input: MobileProBlueprintInput,
  ): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.blueprint, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async generateProDraft(
    input: MobileProDraftInput,
  ): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.draft, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async estimateProRevenue(
    input: MobileProRevenueEstimateInput,
  ): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.revenue, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async getProRevenueConfig(): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig, { method: 'GET' });
    const payload = await response.json();
    return payload.result;
  }

  async saveProRevenueConfig(
    input: MobileProRevenueConfigInput,
  ): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.revenueConfig, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async getProCategoryRpmTable(): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.categoryRpm, { method: 'GET' });
    const payload = await response.json();
    return payload.result;
  }

  async estimateProPortfolioRevenue(
    input: MobileProPortfolioRevenueInput,
  ): Promise<MobileProBlueprintActionResult> {
    const response = await this.request(MOBILE_PRO_BLUEPRINT_ROUTES.portfolioRevenue, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async recordProOutcome(
    input: MobileProOutcomeRecordInput,
  ): Promise<MobileProOutcomeActionResult> {
    const response = await this.request(MOBILE_PRO_OUTCOME_ROUTES.record, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async deleteProOutcome(
    input: MobileProOutcomeDeleteInput,
  ): Promise<MobileProOutcomeActionResult> {
    const response = await this.request(MOBILE_PRO_OUTCOME_ROUTES.item, {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async syncProOutcomes(): Promise<MobileProOutcomeActionResult> {
    const response = await this.request(MOBILE_PRO_OUTCOME_ROUTES.sync, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    return payload.result;
  }

  async addRankTrackingPair(
    input: MobileRankTrackingManualInput,
  ): Promise<MobileRankTrackingActionResult> {
    const response = await this.request(MOBILE_RANK_TRACKING_ROUTES.manual, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async addProTrackedPost(
    input: MobileProTrackedPostInput,
  ): Promise<MobileRankTrackingActionResult> {
    const response = await this.request(MOBILE_RANK_TRACKING_ROUTES.proPost, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async runRankTrackingCheck(
    input: MobileRankTrackingRunInput = { maxItems: 5 },
  ): Promise<MobileRankTrackingActionResult> {
    const response = await this.request(MOBILE_RANK_TRACKING_ROUTES.run, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async removeRankTrackingPair(
    input: MobileRankTrackingPairInput,
  ): Promise<MobileRankTrackingActionResult> {
    const response = await this.request(MOBILE_RANK_TRACKING_ROUTES.pair, {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return payload.result;
  }

  async createKeywordSchedule(
    input: MobileKeywordScheduleCreateInput,
  ): Promise<{ schedule: MobileKeywordScheduleItem; snapshot: MobileScheduleDashboardSnapshot }> {
    const response = await this.request(MOBILE_SCHEDULE_ROUTES.list, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      schedule: payload.schedule,
      snapshot: payload.snapshot,
    };
  }

  async toggleKeywordSchedule(
    id: string,
    enabled: boolean,
  ): Promise<{ schedule: MobileKeywordScheduleItem; snapshot: MobileScheduleDashboardSnapshot }> {
    const response = await this.request(MOBILE_SCHEDULE_ROUTES.item.replace(':id', encodeURIComponent(id)), {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    const payload = await response.json();
    return {
      schedule: payload.schedule,
      snapshot: payload.snapshot,
    };
  }

  async updateKeywordSchedule(
    id: string,
    updates: MobileKeywordScheduleUpdateInput,
  ): Promise<{ schedule: MobileKeywordScheduleItem; snapshot: MobileScheduleDashboardSnapshot }> {
    const response = await this.request(MOBILE_SCHEDULE_ROUTES.item.replace(':id', encodeURIComponent(id)), {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    return {
      schedule: payload.schedule,
      snapshot: payload.snapshot,
    };
  }

  async deleteKeywordSchedule(id: string): Promise<{
    schedule: MobileKeywordScheduleItem;
    snapshot: MobileScheduleDashboardSnapshot;
  }> {
    const response = await this.request(
      MOBILE_SCHEDULE_ROUTES.item.replace(':id', encodeURIComponent(id)),
      { method: 'DELETE' },
    );
    const payload = await response.json();
    return {
      schedule: payload.schedule,
      snapshot: payload.snapshot,
    };
  }

  async createKeywordGroup(
    input: MobileKeywordGroupInput,
  ): Promise<{ group: MobileKeywordGroupItem; snapshot: MobileKeywordGroupSnapshot }> {
    const response = await this.request(MOBILE_KEYWORD_GROUP_ROUTES.list, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      group: payload.group,
      snapshot: payload.snapshot,
    };
  }

  async updateKeywordGroup(
    id: string,
    input: MobileKeywordGroupInput,
  ): Promise<{ group: MobileKeywordGroupItem; snapshot: MobileKeywordGroupSnapshot }> {
    const response = await this.request(MOBILE_KEYWORD_GROUP_ROUTES.item.replace(':id', encodeURIComponent(id)), {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    return {
      group: payload.group,
      snapshot: payload.snapshot,
    };
  }

  async deleteKeywordGroup(id: string): Promise<MobileKeywordGroupSnapshot> {
    const response = await this.request(
      MOBILE_KEYWORD_GROUP_ROUTES.item.replace(':id', encodeURIComponent(id)),
      { method: 'DELETE' },
    );
    const payload = await response.json();
    return payload.snapshot;
  }

  async createGoldenDiscoveryJob(
    params: GoldenDiscoveryMobileParams,
  ): Promise<MobileJobEnvelope<GoldenDiscoveryMobileParams, MobileKeywordResult>> {
    return this.postJob('golden-discovery', params);
  }

  async createProTrafficJob(
    params: ProTrafficMobileParams,
  ): Promise<MobileJobEnvelope<ProTrafficMobileParams, MobileKeywordResult>> {
    return this.postJob('pro-traffic-hunter', params);
  }

  async createKeywordAnalysisJob(
    params: KeywordAnalysisMobileParams,
  ): Promise<MobileJobEnvelope<KeywordAnalysisMobileParams, MobileKeywordResult>> {
    return this.postJob('keyword-analysis', params);
  }

  async createMindmapExpansionJob(
    params: MindmapExpansionMobileParams,
  ): Promise<MobileJobEnvelope<MindmapExpansionMobileParams, MobileKeywordResult>> {
    return this.postJob('mindmap-expansion', params);
  }

  async createHomeBoardJob(
    params: HomeBoardMobileParams,
  ): Promise<MobileJobEnvelope<HomeBoardMobileParams, MobileKeywordResult>> {
    return this.postJob('home-board-hunter', params);
  }

  async createKinHiddenHoneyJob(
    params: KinHiddenHoneyMobileParams,
  ): Promise<MobileJobEnvelope<KinHiddenHoneyMobileParams, MobileKeywordResult>> {
    return this.postJob('kin-hidden-honey', params);
  }

  async getJob<TParams = unknown>(jobId: string): Promise<MobileJobEnvelope<TParams, MobileKeywordResult>> {
    const response = await this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
    const payload = await response.json();
    return payload.job;
  }

  async cancelJob<TParams = unknown>(jobId: string): Promise<MobileJobEnvelope<TParams, MobileKeywordResult>> {
    const response = await this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
    const payload = await response.json();
    return payload.job;
  }

  async getPrewarmSnapshot(): Promise<MobilePrewarmSnapshot> {
    const response = await this.request(MOBILE_PREWARM_ROUTES.snapshot, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async runPrewarm(limit?: number): Promise<MobilePrewarmSnapshot> {
    const response = await this.request(MOBILE_PREWARM_ROUTES.run, {
      method: 'POST',
      body: JSON.stringify(typeof limit === 'number' ? { limit } : {}),
    });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getLiveGoldenSnapshot(): Promise<MobileLiveGoldenRadarSnapshot> {
    const response = await this.request(MOBILE_LIVE_GOLDEN_ROUTES.snapshot, { method: 'GET' });
    const payload = await response.json();
    return payload.snapshot;
  }

  async runLiveGoldenOnce(): Promise<MobileLiveGoldenRadarSnapshot> {
    const response = await this.request(MOBILE_LIVE_GOLDEN_ROUTES.run, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    return payload.snapshot;
  }

  async getNotifications(limit = 10): Promise<MobileNotificationSnapshot> {
    const response = await this.request(`${MOBILE_NOTIFICATION_ROUTES.inbox}?limit=${encodeURIComponent(String(limit))}`, {
      method: 'GET',
    });
    const payload = await response.json();
    return payload.snapshot;
  }

  async markNotificationRead(id: string): Promise<MobileNotificationItem> {
    const response = await this.request(
      MOBILE_NOTIFICATION_ROUTES.read.replace(':id', encodeURIComponent(id)),
      { method: 'PATCH' },
    );
    const payload = await response.json();
    return payload.item;
  }

  async registerPushSubscription(
    request: MobilePushSubscriptionRequest,
  ): Promise<{ subscription: MobilePushSubscription; snapshot: MobilePushSnapshot }> {
    const response = await this.request(MOBILE_PUSH_ROUTES.register, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    return {
      subscription: payload.subscription,
      snapshot: payload.snapshot,
    };
  }

  async unregisterPushSubscription(
    id: string,
  ): Promise<{ subscription: MobilePushSubscription; snapshot: MobilePushSnapshot }> {
    const response = await this.request(
      MOBILE_PUSH_ROUTES.unregister.replace(':id', encodeURIComponent(id)),
      { method: 'DELETE' },
    );
    const payload = await response.json();
    return {
      subscription: payload.subscription,
      snapshot: payload.snapshot,
    };
  }

  createJobEventsUrl(jobId: string): string {
    return `${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/events`;
  }

  async pollJobUntilTerminal<TParams = unknown>(
    jobId: string,
    onUpdate?: (job: MobileJobEnvelope<TParams, MobileKeywordResult>) => void,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<MobileJobEnvelope<TParams, MobileKeywordResult>> {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 120000;
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const job = await this.getJob<TParams>(jobId);
      onUpdate?.(job);
      if (['completed', 'failed', 'cancelled'].includes(job.state)) {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`LEWORD job timed out: ${jobId}`);
  }

  parseJobEvent(raw: string): MobileJobEvent {
    return JSON.parse(raw);
  }

  private async postJob<TParams>(
    product: MobileKeywordProduct,
    params: TParams,
  ): Promise<MobileJobEnvelope<TParams, MobileKeywordResult>> {
    const endpoint = MOBILE_API_ENDPOINTS.find((item) => item.product === product);
    if (!endpoint) {
      throw new Error(`No endpoint registered for ${product}`);
    }

    const response = await this.request(endpoint.path, {
      method: endpoint.method,
      body: JSON.stringify(params),
    });

    return (await response.json()).job;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      let message = `LEWORD API failed: ${response.status}`;
      try {
        const payload = await response.clone().json();
        message = payload?.message || payload?.error || message;
      } catch {
        // Keep the status message when the server does not return JSON.
      }
      throw new Error(message);
    }

    return response;
  }
}
