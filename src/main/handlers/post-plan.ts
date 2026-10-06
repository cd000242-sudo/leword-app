/**
 * 글 한 편 유입 설계실 — 앱 창구 · 실제 재료 · 저장(2026-10-06 사장님 승인 "진행", 1차: 쓰기 전 ①~④).
 *
 *   post-plan-run  { keyword }  → 설계 한 벌(진행 신호 post-plan-progress)
 *   post-plan-list               → 저장된 설계 목록(최근 50)
 *
 * 재료(비용):
 *   검색량 · 문서수 · 뉴스 — 비서 도구 묶음 그대로(검색광고 무료 한도 · 오픈 API)
 *   자리 · 검색용 제목 — golden-writing-kit(이 PC 브라우저, AI 없음)
 *   홈판용 제목 — daily-pick-hybrid homefeedTitlesFor(내 구독 AI)
 *   질문 — 워커 radar-search 의 지식인 · 카페(무료, 커뮤니티 구글은 안 부른다 — Bright Data 는 2차에서 버튼으로만)
 *   입찰가 — 검색광고 추정 입찰가(모바일 3위, 무료 한도) · 제휴 — 사이트 공개 스냅샷
 * 저장: userData/post-plan/plans.json
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { draftAnswer, runInflow, runPostPlan, type InflowDeps, type PostPlanDeps } from '../post-plan-service';
import { upsertPlan, type PostPlan } from '../../utils/post-plan/post-plan-model';

export const POST_PLAN_PROGRESS_CHANNEL = 'post-plan-progress';
const WORKER = 'https://leword-keyword-api.leword.workers.dev/';
const SITE_DATA = 'https://leaderspro.kr/data';
const PLAN_CAP = 50;

const FILE = () => path.join(app.getPath('userData'), 'post-plan', 'plans.json');

function readPlans(): PostPlan[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlans(plans: PostPlan[]): void {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(plans, null, 2), 'utf8');
  } catch (error: any) {
    console.warn('[설계실] 저장 실패:', error?.message);
  }
}

function say(message: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(POST_PLAN_PROGRESS_CHANNEL, { message });
  }
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readSearchAdConfig(): Promise<{ accessLicense: string; secretKey: string; customerId: string }> {
  const { EnvironmentManager } = await import('../../utils/environment-manager');
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig() || {};
  return {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
}

const compact = (value: string) => String(value || '').replace(/\s+/g, '');

export async function createPostPlanDeps(): Promise<PostPlanDeps> {
  const { createRealToolDeps } = await import('../assistant-tool-runner');
  const tools = await createRealToolDeps();
  return {
    volumes: (keywords) => tools.volumes(keywords),
    docs: (keywords) => tools.docs(keywords),
    news: async (keyword) => (await tools.news(keyword)).map((item) => item.title).filter(Boolean),
    writingKit: async (keyword) => {
      const { buildWritingKit } = await import('./golden-writing-kit');
      return buildWritingKit({ keyword, relatedSeats: 0 });
    },
    band: () => {
      const { readBlogRecord } = require('./daily-pick');
      const { buildNearBand } = require('../../utils/blog-class/envelope');
      const record = readBlogRecord();
      return buildNearBand(record && Array.isArray(record.wonRows) ? record.wonRows : []);
    },
    judgeRange: (size, band) => require('../../utils/blog-class/envelope').judgeRange(size, band),
    preemptionRow: async (keyword) => {
      const board = await fetchJson(`${SITE_DATA}/preemption-board.json`);
      const row = (Array.isArray(board?.rows) ? board.rows : []).find((r: any) => compact(r.keyword) === compact(keyword));
      return row ? { tierLabel: row.tierLabel, openSlot: row.openSlot ?? null, measuredAt: row.measuredAt } : null;
    },
    homefeedTitles: async (input) => {
      const { homefeedTitlesFor } = await import('./daily-pick-hybrid');
      const result = await homefeedTitlesFor([input]);
      return { titles: result.titles.get(input.keyword) || [], note: result.note };
    },
    questions: async (keyword) => {
      // 커뮤니티(구글 · Bright Data)는 부르지 않는다 — keys 를 비워 지식인 · 카페만(무료).
      const data = await fetchJson(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'radar-search',
          keys: {},
          queries: JSON.stringify([keyword, `${keyword} 질문`]),
          coreKeywords: JSON.stringify([{ keyword }]),
          shortQueries: JSON.stringify([keyword]),
        }),
      }, 90_000);
      if (!data?.ok) throw new Error(String(data?.message || '레이더 검색 실패'));
      return Array.isArray(data.items) ? data.items : [];
    },
    bid: async (keyword) => {
      const config = await readSearchAdConfig();
      const searchad = await import('../../utils/naver-searchad-api');
      const { bidKey } = await import('../../utils/money-keywords');
      const bids = await searchad.getNaverSearchAdAveragePositionBids(config as any, [keyword], { device: 'MOBILE', position: 3 });
      return bids.get(bidKey(compact(keyword))) ?? null;
    },
    affiliateSnapshot: () => fetchJson(`${SITE_DATA}/affiliate-campaigns.json`),
  };
}

/** 앱 설정 원문(키 이름은 EnvironmentManager 그대로). */
async function readAppConfig(): Promise<Record<string, any>> {
  const { EnvironmentManager } = await import('../../utils/environment-manager');
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  return manager.getConfig() || {};
}

/*
 * ⑤ 발행 후 유입의 실제 재료(2026-10-06 2차). 글 분석 · 평가 · 답변 초안은 사이트 브리지와 같은 함수(radar-analysis-service ·
 * inflow-agents)라 같은 결과가 난다. 커뮤니티(구글)는 켰을 때만 — Bright Data 토큰이 앱 설정 · 환경에 없으면 건너뛰고 이유를 남긴다.
 */
export async function createInflowDeps(): Promise<InflowDeps> {
  const cfg = await readAppConfig();
  const post = (payload: Record<string, unknown>, timeoutMs: number) => fetchJson(WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, timeoutMs);
  return {
    analyze: async (postUrl) => {
      const { analyzeRadarViaAgent } = await import('../radar-analysis-service');
      const result: any = await analyzeRadarViaAgent({
        url: postUrl,
        keys: {
          openApiId: cfg.naverClientId || '', openApiSecret: cfg.naverClientSecret || '',
          searchAdLicense: cfg.naverSearchAdAccessLicense || '', searchAdSecret: cfg.naverSearchAdSecretKey || '', searchAdCustomer: cfg.naverSearchAdCustomerId || '',
        },
      });
      if (!result?.analysis) throw new Error(String(result?.error || '글을 분석하지 못했습니다'));
      return result.analysis;
    },
    search: async (analysis, withCommunity) => {
      const token = String(cfg.brightDataToken || process.env.BRIGHTDATA_TOKEN || '').trim();
      const useCommunity = withCommunity && Boolean(token);
      const data = await post({
        action: 'radar-search',
        keys: useCommunity ? { brightDataToken: token, brightDataZone: String(cfg.brightDataZone || process.env.BRIGHTDATA_ZONE || '') } : {},
        queries: JSON.stringify(analysis.queries || []),
        coreKeywords: JSON.stringify(analysis.coreKeywords || []),
        shortQueries: JSON.stringify(analysis.shortQueries || []),
      }, 150_000);
      if (!data?.ok) throw new Error(String(data?.message || '레이더 검색 실패'));
      return {
        items: Array.isArray(data.items) ? data.items : [],
        communityNote: withCommunity && !token ? 'Bright Data 토큰이 앱에 없어 커뮤니티(구글)는 건너뛰었습니다 — 지식인 · 카페만 찾았습니다' : null,
      };
    },
    evaluate: async (items, analysis) => {
      const { radarEvaluateViaAgent } = await import('../inflow-agents');
      const result = await radarEvaluateViaAgent({
        items: items.map((i) => ({ title: String(i.title || ''), source: String(i.source || ''), link: String(i.link || '') })),
        myTitle: String(analysis.title || ''),
        mySummary: String(analysis.moneyAngle || ''),
      });
      return result.evaluations;
    },
    questionBody: async (link) => {
      const data = await post({ action: 'kin-question', link }, 30_000);
      return String(data?.body || '');
    },
    answer: async (input) => {
      const { kinAnswerViaAgent } = await import('../inflow-agents');
      return kinAnswerViaAgent(input);
    },
  };
}

let running = false;

export function setupPostPlanHandlers(): void {
  if (!ipcMain.listenerCount('post-plan-run')) {
    ipcMain.handle('post-plan-run', async (_event, payload?: { keyword?: string }) => {
      const keyword = String(payload?.keyword || '').trim().slice(0, 60);
      if (!keyword) return { success: false, error: '키워드를 넣어 주세요' };
      if (running) return { success: false, error: '다른 설계가 돌고 있습니다 — 끝난 뒤 다시 눌러 주세요' };
      running = true;
      try {
        const plan = await runPostPlan(keyword, await createPostPlanDeps(), say);
        writePlans(upsertPlan(readPlans(), plan, PLAN_CAP));
        return { success: true, plan };
      } catch (error: any) {
        return { success: false, error: String(error?.message || error).slice(0, 200) };
      } finally {
        running = false;
      }
    });
  }
  if (!ipcMain.listenerCount('post-plan-list')) {
    ipcMain.handle('post-plan-list', async () => ({ success: true, plans: readPlans(), running }));
  }
  // ⑤ 발행 후 유입 — 글 주소로 링크 달 자리 찾기(2026-10-06 2차).
  if (!ipcMain.listenerCount('post-plan-inflow')) {
    ipcMain.handle('post-plan-inflow', async (_event, payload?: { id?: string; postUrl?: string; withCommunity?: boolean }) => {
      const plan = readPlans().find((p) => p.id === payload?.id);
      if (!plan) return { success: false, error: '설계를 찾지 못했습니다 — 먼저 설계를 만들어 주세요' };
      if (running) return { success: false, error: '다른 설계가 돌고 있습니다 — 끝난 뒤 다시 눌러 주세요' };
      running = true;
      try {
        const next = await runInflow(plan, String(payload?.postUrl || ''), await createInflowDeps(), say, { withCommunity: payload?.withCommunity === true });
        writePlans(readPlans().map((p) => (p.id === next.id ? next : p)));
        return { success: true, plan: next };
      } catch (error: any) {
        return { success: false, error: String(error?.message || error).slice(0, 200) };
      } finally {
        running = false;
      }
    });
  }
  // 자리 하나의 답변 초안(내 구독 AI) — 게시는 사람이 한다. 만든 초안은 설계에 남긴다.
  if (!ipcMain.listenerCount('post-plan-answer')) {
    ipcMain.handle('post-plan-answer', async (_event, payload?: { id?: string; link?: string }) => {
      const plan = readPlans().find((p) => p.id === payload?.id);
      const inflow: any = plan?.steps.inflow?.data;
      const spot = inflow && [...(inflow.spots || []), ...(inflow.unrated || []), ...(inflow.skippedSpots || [])].find((s: any) => s.link === payload?.link);
      if (!plan || !spot) return { success: false, error: '이 자리를 찾지 못했습니다 — 링크 달 자리를 다시 찾아 주세요' };
      try {
        const answer = await draftAnswer(spot, inflow.postUrl, await createInflowDeps());
        if (!answer) return { success: false, error: 'AI 가 초안을 돌려주지 않았습니다 — 연결된 엔진을 확인해 주세요' };
        const nextInflow = { ...inflow, answers: { ...(inflow.answers || {}), [spot.link]: answer } };
        const next: PostPlan = { ...plan, updatedAt: new Date().toISOString(), steps: { ...plan.steps, inflow: { ...plan.steps.inflow!, data: nextInflow } } };
        writePlans(readPlans().map((p) => (p.id === next.id ? next : p)));
        return { success: true, answer, plan: next };
      } catch (error: any) {
        return { success: false, error: String(error?.message || error).slice(0, 200) };
      }
    });
  }
}
