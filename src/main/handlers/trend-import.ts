/**
 * 크리에이터 어드바이저 트렌드 CSV 들이기 — 앱 전용.
 *
 * 사장님 2026-09-10: "CSV 를 주면 지금 상위노출 가능한 키워드들을 보여줄 수 있지 않니?",
 * "넣는 족족 검색량 문서량 바로 보여주고 상위노출 1페이지 빈자리 있는 걸 전부 나열해주면 돼".
 *
 * 왜 이 공급원이 좋은가: 지금 앱·사이트는 실시간 검색어와 뉴스에서 후보를 뽑는다. 그건
 * "지금 뜨는 말"이지 "블로그로 유입을 만드는 말"이 아니다. 이 CSV 는 네이버가 직접 알려주는
 * **주제별로 실제 유입을 일으키고 있는 검색어**다 — 추측이 아니라 원본이다. 주제도 네이버
 * 32주제 그대로라 앱 분류와 바로 맞물린다.
 *
 * CSV 가 주는 것: 카테고리 · 순위(1~20) · 키워드 · 순위변화.  ← 여기까지가 공급
 * 여기서 재는 것: 검색량(검색광고) · 문서수(오픈 API) · 자리(이 PC 크로미엄).  ← 판정
 *
 * 실측(2026-09-10 첨부 파일): 640행 · 32주제 × 20 · 고유 키워드 562.
 *
 * 자리는 문서수가 적은 것부터 잰다. 562개를 전부 재면 1.5초 간격으로 14분 넘게 회선을 쓰는데,
 * 그건 집 주소가 네이버에서 눈총을 받는 길이다. 상한을 두고 적은 것부터 훑는다.
 */
import { app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getNaverSearchAdKeywordVolume, exactSearchAdTotal } from '../../utils/naver-searchad-api';
import { getNaverBlogDocumentCount } from '../../utils/naver-blog-api';
import { analyzeSerp, verdictFor } from '../../utils/serp-winnability';
import { localSerpFetch, localSerpStats } from '../../utils/local-serp-fetch';
import { EnvironmentManager } from '../../utils/environment-manager';

export const TREND_IMPORT_PROGRESS_CHANNEL = 'trend-import-progress';

/** 자리를 잴 상한. 0 이면 안 잰다. 기본 120 — 약 4분. */
const DEFAULT_SEAT_MAX = 120;
/** 검색광고는 한 번에 5개씩만 받는다(도구 규격). */
const VOLUME_BATCH = 5;

export interface TrendRow {
  category: string;
  rank: number;
  keyword: string;
  /** 순위 변화. 빈 값이면 null(신규이거나 안 준 것). */
  change: number | null;
  searchVolume: number | null;
  documentCount: number | null;
  /** 열림 · 반열림 · 잠김 · 자료없음 · 안 잼 */
  seat: string;
  facing: number | null;
  /** 자리가 비어 있는 첫 순위. 못 세면 null. */
  vacancy: number | null;
}

export interface TrendImportResult {
  file: string;
  parsedAt: string;
  rows: TrendRow[];
  summary: { total: number; unique: number; categories: number; measuredVolume: number; measuredDocs: number; measuredSeat: number; open: number; blocked: number };
  message: string | null;
}

const DIR = () => path.join(app.getPath('userData'), 'trend-import');
const LATEST = () => path.join(DIR(), 'latest.json');

function writeLatest(value: unknown): void {
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(LATEST(), JSON.stringify(value, null, 1), 'utf8');
  } catch { /* 저장 실패가 회차를 죽이지는 않는다 */ }
}

function readLatest(): TrendImportResult | null {
  try { return JSON.parse(fs.readFileSync(LATEST(), 'utf8')) as TrendImportResult; } catch { return null; }
}

/**
 * CSV 한 줄 쪼개기 — 값이 따옴표로 감싸여 있고 안에 쉼표가 들어갈 수 있다.
 * 라이브러리를 새로 들이지 않는다(이 한 가지 모양만 읽으면 된다).
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const HEADER_ALIASES: Record<string, keyof Pick<TrendRow, 'category' | 'keyword'> | 'rank' | 'change'> = {
  '카테고리': 'category', '주제': 'category', '분야': 'category',
  '순위': 'rank',
  '키워드': 'keyword', '검색어': 'keyword',
  '순위변화': 'change', '변화': 'change',
};

/**
 * CSV 본문 → 행. 헤더 이름으로 열을 찾는다(열 순서가 바뀌어도 읽힌다).
 * 같은 키워드가 여러 주제에 겹치면 첫 번째(순위가 높은 쪽)만 남긴다 — 실측을 두 번 하지 않는다.
 */
export function parseTrendCsv(text: string): { rows: TrendRow[]; total: number; categories: number } {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return { rows: [], total: 0, categories: 0 };

  const header = splitCsvLine(lines[0]);
  const at: Record<string, number> = {};
  header.forEach((name, index) => {
    const key = HEADER_ALIASES[name.replace(/\s+/g, '')];
    if (key && at[key] === undefined) at[key] = index;
  });
  if (at.keyword === undefined) return { rows: [], total: 0, categories: 0 };

  const seen = new Set<string>();
  const categories = new Set<string>();
  const rows: TrendRow[] = [];
  let total = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const keyword = String(cells[at.keyword] ?? '').trim();
    if (!keyword) continue;
    total += 1;
    const category = at.category !== undefined ? String(cells[at.category] ?? '').trim() : '';
    if (category) categories.add(category);
    const key = keyword.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const rankRaw = at.rank !== undefined ? Number(cells[at.rank]) : NaN;
    const changeRaw = at.change !== undefined ? String(cells[at.change] ?? '').trim() : '';
    rows.push({
      category,
      rank: Number.isFinite(rankRaw) ? rankRaw : 0,
      keyword,
      change: changeRaw === '' || !Number.isFinite(Number(changeRaw)) ? null : Number(changeRaw),
      searchVolume: null,
      documentCount: null,
      seat: '안 잼',
      facing: null,
      vacancy: null,
    });
  }
  return { rows, total, categories: categories.size };
}

export interface TrendImportProgress {
  phase: '읽기' | '검색량' | '문서수' | '자리' | '끝';
  done: number;
  total: number;
  message: string;
  /** 지금까지 잰 행 — 화면이 '넣는 족족' 채워 넣는다. */
  rows?: TrendRow[];
}

let running = false;
let abortRequested = false;

function blogTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

const SEAT_LABEL: Record<string, string> = { WINNABLE: '열림', CONTESTED: '반열림', LOCKED: '잠김', NO_DATA: '자료없음' };

/**
 * 한 번 들이기 — 검색량 → 문서수 → 자리 순.
 * 각 단계가 끝날 때마다 지금까지의 행을 통째로 올려 보낸다. 화면은 그걸 그대로 다시 그린다.
 */
export async function runTrendImport(
  filePath: string,
  options: { seatMax?: number; onProgress?: (p: TrendImportProgress) => void } = {},
): Promise<TrendImportResult> {
  const report = options.onProgress ?? (() => {});
  const seatMax = Math.max(0, options.seatMax ?? DEFAULT_SEAT_MAX);

  report({ phase: '읽기', done: 0, total: 0, message: 'CSV 를 읽는 중…' });
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseTrendCsv(text);
  if (parsed.rows.length === 0) {
    throw new Error('CSV 에서 키워드를 찾지 못했습니다. 크리에이터 어드바이저 트렌드에서 내보낸 파일인지 확인해 주세요.');
  }
  let rows = parsed.rows;
  report({ phase: '읽기', done: rows.length, total: rows.length, rows, message: `${parsed.total}행에서 고유 키워드 ${rows.length}개를 골랐습니다.` });

  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig();
  const adConfig = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };

  // ── 검색량
  let measuredVolume = 0;
  if (adConfig.accessLicense && adConfig.secretKey) {
    for (let i = 0; i < rows.length && !abortRequested; i += VOLUME_BATCH) {
      const batch = rows.slice(i, i + VOLUME_BATCH);
      try {
        const volumes = await getNaverSearchAdKeywordVolume(adConfig as any, batch.map((r) => r.keyword));
        const byKey = new Map(volumes.map((v: any) => [String(v.relKeyword || v.keyword || '').replace(/\s+/g, ''), v]));
        rows = rows.map((row) => {
          const hit = byKey.get(row.keyword.replace(/\s+/g, ''));
          if (!hit) return row;
          const total = exactSearchAdTotal(hit);
          if (total === null) return row;
          measuredVolume += 1;
          return { ...row, searchVolume: total };
        });
      } catch { /* 이 묶음만 건너뛴다 — 회차는 산다 */ }
      report({
        phase: '검색량', done: Math.min(i + VOLUME_BATCH, rows.length), total: rows.length, rows,
        message: `검색량 ${Math.min(i + VOLUME_BATCH, rows.length)}/${rows.length}`,
      });
    }
  } else {
    report({ phase: '검색량', done: 0, total: rows.length, rows, message: '검색광고 키가 없어 검색량은 건너뜁니다.' });
  }

  // ── 문서수
  let measuredDocs = 0;
  for (let i = 0; i < rows.length && !abortRequested; i += 1) {
    try {
      const count = await getNaverBlogDocumentCount(rows[i].keyword);
      if (typeof count === 'number') {
        measuredDocs += 1;
        rows = rows.map((row, index) => (index === i ? { ...row, documentCount: count } : row));
      }
    } catch { /* 한 건 실패는 넘어간다 */ }
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      report({ phase: '문서수', done: i + 1, total: rows.length, rows, message: `문서수 ${i + 1}/${rows.length}` });
    }
  }

  // ── 자리 — 문서수가 적은 것부터. 빈자리는 그쪽에 있을 확률이 높고, 회선도 아낀다.
  const targets = [...rows]
    .filter((row) => row.documentCount !== null)
    .sort((a, b) => (a.documentCount as number) - (b.documentCount as number))
    .slice(0, seatMax);
  let measuredSeat = 0;
  let blocked = 0;
  for (let i = 0; i < targets.length && !abortRequested; i += 1) {
    const keyword = targets[i].keyword;
    const res = await localSerpFetch(blogTabUrl(keyword));
    if (res.ok && res.body) {
      const analysis = analyzeSerp(res.body, keyword);
      const verdict = verdictFor(analysis);
      measuredSeat += 1;
      rows = rows.map((row) => (row.keyword === keyword ? {
        ...row,
        seat: SEAT_LABEL[verdict.verdict] || '자료없음',
        facing: analysis.exactTitleHits,
        vacancy: typeof (analysis as any).openSlot === 'number' ? (analysis as any).openSlot : null,
      } : row));
    } else if (res.rateLimited) {
      blocked += 1;
      if (localSerpStats().consecutiveBlocked >= 5) break;
    }
    report({
      phase: '자리', done: i + 1, total: targets.length, rows,
      message: `자리 ${i + 1}/${targets.length} · ${keyword}` + (blocked ? ` · 막힘 ${blocked}` : ''),
    });
  }

  const result: TrendImportResult = {
    file: path.basename(filePath),
    parsedAt: new Date().toISOString(),
    rows,
    summary: {
      total: parsed.total,
      unique: rows.length,
      categories: parsed.categories,
      measuredVolume,
      measuredDocs,
      measuredSeat,
      open: rows.filter((r) => r.seat === '열림').length,
      blocked,
    },
    message: blocked > 0 ? `네이버가 ${blocked}건을 막았습니다 — 잠시 뒤 다시 재면 채워집니다.` : null,
  };
  writeLatest(result);
  report({ phase: '끝', done: rows.length, total: rows.length, rows, message: `끝 — 빈자리 ${result.summary.open}건` });
  return result;
}

export function setupTrendImportHandlers(): void {
  if (!ipcMain.listenerCount('trend-import-get')) {
    ipcMain.handle('trend-import-get', async () => ({ success: true, result: readLatest(), running }));
  }

  // 파일 고르기 — CSV 하나만 받는다. 범용 파일 대화상자를 열어 두지 않는다(렌더러가 아무 파일이나 읽을 길을 만들지 않는다).
  if (!ipcMain.listenerCount('trend-import-pick')) {
    ipcMain.handle('trend-import-pick', async () => {
      const picked = await dialog.showOpenDialog({
        title: '크리에이터 어드바이저 트렌드 CSV 고르기',
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (picked.canceled || picked.filePaths.length === 0) return { success: false, filePath: '' };
      return { success: true, filePath: picked.filePaths[0] };
    });
  }

  if (!ipcMain.listenerCount('trend-import-abort')) {
    ipcMain.handle('trend-import-abort', async () => { abortRequested = true; return { success: true }; });
  }

  if (!ipcMain.listenerCount('trend-import-run')) {
    ipcMain.handle('trend-import-run', async (event, payload?: { filePath?: string; seatMax?: number }) => {
      const filePath = String(payload?.filePath || '').trim();
      if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'CSV 파일을 찾지 못했습니다.' };
      if (running) return { success: false, error: '이미 재고 있습니다.' };
      running = true;
      abortRequested = false;
      try {
        const result = await runTrendImport(filePath, {
          seatMax: payload?.seatMax,
          onProgress: (p) => { try { event.sender.send(TREND_IMPORT_PROGRESS_CHANNEL, p); } catch { /* 창이 닫혔을 수 있다 */ } },
        });
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: error?.message || 'CSV 들이기 실패' };
      } finally {
        running = false;
      }
    });
  }

  console.log('[TREND-IMPORT] ✅ 트렌드 CSV 들이기 핸들러 등록 완료');
}
