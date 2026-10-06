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
import { runPostPlan, type PostPlanDeps } from '../post-plan-service';
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
}
