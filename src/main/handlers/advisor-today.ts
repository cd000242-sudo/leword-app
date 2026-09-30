/**
 * '오늘 쓸 글 10' 판 핸들러(앱 전용, D 판, 2026-09-30 플랜).
 *
 * 어드바이저 하루 수집이 끝나면 바로 이어서 판을 만든다: 후보(내 주제 인기·트렌드 검색어) → 검색광고 검색량 실측 →
 * 자리 실측기(내 브라우저) → 순위 → 골라진 10개만 에이전트 CLI 제목(교리 검사, 미통과는 빈 칸).
 * 새 판정 규칙은 없다. 실측기 셋 다 기존 창구를 그대로 잇는다. 비용 0(검색광고 무료 쿼터·내 브라우저·구독 CLI).
 *
 * 저장: userData/advisor-daily/today-plan.json 한 장(날짜별 기록은 하루 수집기 것을 그대로 쓴다).
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { buildTodayPlan, type TodayPlan, type TodayPlanDeps } from '../../utils/advisor/today-build';
import type { AdvisorDailyRecord } from '../../utils/advisor/daily-summary';
import type { TodaySeat } from '../../utils/advisor/today-plan';
import { collectTodayTitles } from '../../utils/advisor/today-titles';
import { EnvironmentManager } from '../../utils/environment-manager';
import { exactSearchAdTotal, getNaverSearchAdKeywordVolume } from '../../utils/naver-searchad-api';
import { readAdvisorDailyView, setAdvisorDailyAfterCollect } from './advisor-daily';
import { measureKeywords } from './seat-measure';

const FILE = () => path.join(app.getPath('userData'), 'advisor-daily', 'today-plan.json');

function readPlan(): TodayPlan | null {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')) as TodayPlan; } catch { return null; }
}

function writePlan(plan: TodayPlan): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(plan, null, 2), 'utf8');
}

function searchAdConfig() {
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig() || {};
  return {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
}

const compact = (value: string) => String(value || '').toLowerCase().replace(/\s+/g, '');

/** 실측기 셋 — 검색광고(정확한 총검색량만) · 자리 실측기(기존 판정기) · 에이전트 CLI 제목. */
function realDeps(): TodayPlanDeps {
  return {
    searchVolume: async (keywords) => {
      const rows = await getNaverSearchAdKeywordVolume(searchAdConfig(), keywords);
      const byKey = new Map(rows.map((row: any) => [compact(row.relKeyword || row.keyword), row]));
      return new Map(keywords.map((keyword) => [keyword, exactSearchAdTotal(byKey.get(compact(keyword)))]));
    },
    measureSeats: async (keywords) => {
      const result = await measureKeywords(keywords, { withStructure: true });
      const out = new Map<string, TodaySeat | null>();
      for (const row of result.rows) {
        const seat: TodaySeat | null = row.status === 'ok' && row.verdict
          ? { verdict: row.verdict, facing: row.facing ?? 0, vacancy: row.vacancy ?? null, sampled: row.sampled ?? 0 }
          : null;
        out.set(row.keyword, seat);
      }
      return out;
    },
    titles: (cards) => collectTodayTitles(cards),
  };
}

let running = false;

export type AdvisorTodayRunResult =
  | { success: true; plan: TodayPlan }
  | { success: false; skipped: true; reason: string }
  | { success: false; skipped?: false; error: string };

/** 최신 하루 기록으로 판을 만든다. 기록이 없으면 건너뛴다(먼저 수집). */
export async function runAdvisorToday(record?: AdvisorDailyRecord): Promise<AdvisorTodayRunResult> {
  if (running) return { success: false, skipped: true, reason: '이미 만드는 중' };
  const view = readAdvisorDailyView();
  const base = record ?? view.latest;
  if (!base) return { success: false, skipped: true, reason: '하루 기록이 아직 없음 — 먼저 수집' };
  running = true;
  const t0 = Date.now();
  try {
    const plan = await buildTodayPlan(base, view.pattern, realDeps());
    writePlan(plan);
    const titleCount = plan.titles.status === 'ok' ? plan.titles.items.reduce((n, item) => n + item.titles.length, 0) : 0;
    console.log(`[ADVISOR-TODAY] 판 완성 — ${plan.day} 바탕 · 후보 ${plan.candidatesTotal} · 검색량 ${plan.measured.searchVolume} · 자리 ${plan.measured.seat} · 제목 ${titleCount} · ${Math.round((Date.now() - t0) / 1000)}초${plan.notes.length ? ` · ${plan.notes.join(' / ')}` : ''}`);
    return { success: true, plan };
  } catch (error: any) {
    console.warn('[ADVISOR-TODAY] 판 만들기 실패:', error?.message);
    return { success: false, error: error?.message || '오늘 쓸 글 판 실패' };
  } finally {
    running = false;
  }
}

export function setupAdvisorTodayHandlers(): void {
  setAdvisorDailyAfterCollect((record) => { void runAdvisorToday(record); });
  if (!ipcMain.listenerCount('advisor-today-view')) {
    ipcMain.handle('advisor-today-view', async () => ({ success: true, plan: readPlan(), running }));
  }
  if (!ipcMain.listenerCount('advisor-today-run-now')) {
    ipcMain.handle('advisor-today-run-now', async () => runAdvisorToday());
  }
  console.log('[ADVISOR-TODAY] ✅ 오늘 쓸 글 판 핸들러 등록 완료');
}
