/**
 * 오늘의 글감 — 앱 전용, 기다리지 않는 판.
 *
 * 사장님 2026-09-10 "앱에서는 오늘의 글감이든 뭐든 실시간으로 볼 수 있지 않니?".
 *
 * 맞는 말이었다. 글감에 필요한 것이 이미 전부 이 PC 에 있었는데 깃허브 예약을 기다리고 있었다 —
 * 뉴스는 오픈 API(무료), 글감을 고르는 것은 사장님 구독 클로드/코덱스 CLI, 자리는 이 PC 크로미엄.
 * 그런데 사이트 쪽은 하루 세 번 예약에 매여 있고, 그 예약이 자주 늦거나 빠진다(실측: 09-09 아침
 * 예약이 4.4시간 늦었고 두 회차는 아예 안 돌았다). 그래서 앱은 예약을 기다리지 않는다.
 *
 * 두 레인의 역할은 실시간 틈새와 같은 방식으로 나눈다:
 *   사이트  PC 가 꺼져 있어도 도는 최소 보장선. 자리는 브라이트데이터라 회차당 상한이 있다(40 + 70).
 *   앱      누르면 돈다. 자리 상한 없음(내 크로미엄, 비용 0). 켜 두면 몇 시간마다 저절로 새로 만든다.
 *
 * 판정 규칙은 한 벌이다 — 같은 프롬프트(buildBriefPrompt)·같은 검증기(validateBriefs)·같은 자리
 * 판정(measureSeat/serpFitOf)을 쓴다. 다른 건 자리를 받아오는 창구와 상한뿐이다.
 *
 * 지어내지 않는 것: 카드에 없는 날짜·숫자는 검증기가 떨어뜨린다. 안 잰 자리는 '미측정'이다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  BRIEF_FIELDS, applyMeasuredVolumes, buildBriefPrompt, carrySeats, chooseAlternative, dropRepeats,
  excludeListOf, kstToday, markStars, pickFactsForPrompt, pickRelatedKeywords, roundCounts, roundSlotOf,
  serpFitOf, toFactCards, todaysRounds, validateBriefs,
  type BriefAlternative, type BriefRound, type TopicBrief,
} from '../../utils/topic-briefs';
import { naverApiFetch } from '../../utils/naver-api-hub';
import { EnvironmentManager } from '../../utils/environment-manager';
import { runWithAnyAgent } from '../../utils/agent-cli/runAny';
import { runClaude } from '../../utils/agent-cli/claudeRunner';
import { runCodex } from '../../utils/agent-cli/codexRunner';
import { tryExtractJson } from '../../utils/agent-cli/parse';
import { getNaverSearchAdKeywordVolume, getNaverSearchAdKeywordSuggestions } from '../../utils/naver-searchad-api';
import { measureSeat, seatBlogTabUrl } from '../../utils/seat-measure';
import { localSerpFetch, closeLocalSerpFetch, localSerpStats } from '../../utils/local-serp-fetch';

export const BRIEFS_PROGRESS_CHANNEL = 'topic-briefs-local-progress';

/** 분야당 몇 개를 청할까. 검증기에서 한둘 떨어지므로 한 개 더 청한다(스크립트와 같은 규칙). */
const PER_FIELD = 5;
/** 자리 실측 상한. 사이트는 BD 값 때문에 40 인데 여기는 내 브라우저라 넉넉히 둔다. */
const CORE_SEAT_CAP = 120;
/** 같이 넣을 말 자리 상한. 글감당 3개까지 재므로 실제로는 글감 수에 걸린다. */
const RELATED_SEAT_CAP = 200;
/** 자동 주기(시간). 사장님 PC 는 늘 켜져 있다 — 켜 두면 저절로 새로 만든다. */
const AUTO_HOURS = 3;
/** 사이트에 실린 판. 앱이 아직 한 번도 안 돌았을 때 곧바로 보여 줄 것. */
const PUBLISHED = 'https://leaderspro.kr/data/topic-briefs.json';

const AGENT_CHAIN = [
  { provider: 'claude', run: (p: string, o?: any) => runClaude(p, { ...(o || {}), model: 'opus' }) },
  { provider: 'codex', run: runCodex },
];

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const DIR = () => path.join(app.getPath('userData'), 'topic-briefs');
const LATEST = () => path.join(DIR(), 'latest.json');
const PREFS = () => path.join(DIR(), 'prefs.json');

/**
 * 자동 회차를 켜 둘까. 기본은 켬 — 사장님이 겪은 문제가 "안 바뀐다" 였다.
 * 다만 한 회차가 몇 분씩 브라우저를 쓰므로 화면에 스위치를 두고, 성능 우선 모드면 같이 멈춘다.
 */
export function autoEnabled(): boolean {
  try { return JSON.parse(fs.readFileSync(PREFS(), 'utf8')).auto !== false; } catch { return true; }
}

export function setAutoEnabled(on: boolean): void {
  ensureDir();
  fs.writeFileSync(PREFS(), JSON.stringify({ auto: !!on }, null, 1), 'utf8');
  if (on) startTopicBriefsScheduler(); else stopTopicBriefsScheduler();
}

export interface BriefsProgress {
  step: '뉴스' | '글감' | '검색량' | '자리' | '같이 넣을 말' | '정리';
  done: number;
  total: number;
  message: string;
}

export interface LocalBriefsResult {
  builtAt: string;
  slot: string;
  source: 'app';
  rounds: BriefRound[];
  counts: Record<string, number>;
  method: Record<string, string>;
  briefs: TopicBrief[];
  dropped: Array<{ field: string; title: string; reason: string }>;
  /** 이 회차에서 실제로 잰 자리 수. 사이트 회차와 견주는 값이다. */
  seatsMeasured: number;
  seconds: number;
}

let running = false;
let abortRequested = false;
let autoTimer: NodeJS.Timeout | null = null;

function ensureDir(): void {
  try { fs.mkdirSync(DIR(), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
}

export function readLocalBriefs(): LocalBriefsResult | null {
  try { return JSON.parse(fs.readFileSync(LATEST(), 'utf8')) as LocalBriefsResult; } catch { return null; }
}

function writeLocalBriefs(result: LocalBriefsResult): void {
  ensureDir();
  fs.writeFileSync(LATEST(), JSON.stringify(result, null, 1), 'utf8');
}

function configOf() {
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig();
  return {
    openApi: {
      clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '',
      clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '',
    },
    ad: {
      accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
      secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
      customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
    },
  };
}

/** 한 자리를 잰다. 못 읽으면 null — 안 잰 것을 0 으로 바꾸지 않는다. */
async function seatOf(keyword: string): Promise<{ facing: number; vacancy: number | null } | null> {
  const res = await localSerpFetch(seatBlogTabUrl(keyword));
  if (!res.ok || !res.body) return null;
  const seat = measureSeat({ keyword, blogTabHtml: res.body, allTabHtml: null });
  if (seat.sampled < 3) return null;
  return { facing: seat.facing, vacancy: seat.vacancy };
}

export interface RunOptions {
  perField?: number;
  /** 자리를 아예 재지 않고 빨리 보고 싶을 때. 기본은 잰다. */
  measureSeats?: boolean;
  onProgress?: (p: BriefsProgress) => void;
}

/**
 * 한 회차를 이 PC 에서 만든다. 스크립트(scripts/topic-briefs.js)와 같은 순서·같은 함수를 쓴다.
 * 다른 점은 셋뿐이다: 자리 창구가 localSerpFetch 라는 것, 상한이 넉넉하다는 것, 회차를 아무 때나 돌린다는 것.
 */
export async function runLocalBriefs(options: RunOptions = {}): Promise<LocalBriefsResult> {
  const started = Date.now();
  const report = options.onProgress ?? (() => {});
  const perField = Math.max(1, options.perField ?? PER_FIELD);
  const wantSeats = options.measureSeats !== false;
  const { openApi, ad } = configOf();
  if (!openApi.clientId || !openApi.clientSecret) {
    throw new Error('네이버 오픈 API 키가 필요합니다 — 설정 · 키 화면에서 넣어 주세요(뉴스 실측에 씁니다).');
  }

  const today = kstToday();
  const slot = roundSlotOf(today);
  const prior = todaysRounds(readLocalBriefs()?.rounds || [], today);

  // ── 1) 사실 카드 — 분야별 뉴스 실측
  const fieldFacts = new Map<string, ReturnType<typeof toFactCards>>();
  let newsCalls = 0;
  for (let i = 0; i < BRIEF_FIELDS.length; i += 1) {
    if (abortRequested) break;
    const { field, queries } = BRIEF_FIELDS[i];
    const seen = new Set<string>();
    const cards: ReturnType<typeof toFactCards> = [];
    for (const query of queries) {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=50&sort=date`;
      try {
        const res = await naverApiFetch(url, {
          headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret },
        } as any);
        newsCalls += 1;
        if (res.ok) {
          const data: any = await res.json().catch(() => null);
          cards.push(...toFactCards((data && data.items) || [], field, seen));
        }
      } catch { /* 이 질의만 건너뛴다 */ }
      await sleep(120);
    }
    const picked = pickFactsForPrompt(cards, today, 24);
    fieldFacts.set(field, picked);
    report({ step: '뉴스', done: i + 1, total: BRIEF_FIELDS.length, message: `${field} — 기사 ${cards.length}건에서 근거 카드 ${picked.length}장` });
  }

  // ── 2) 글감 — 사장님 구독 CLI 가 카드 **안에서만** 고른다
  const all: TopicBrief[] = [];
  const droppedAll: Array<{ field: string; title: string; reason: string }> = [];
  let agentCalls = 0;
  for (let i = 0; i < BRIEF_FIELDS.length; i += 1) {
    if (abortRequested) break;
    const { field } = BRIEF_FIELDS[i];
    const facts = fieldFacts.get(field) || [];
    if (facts.length < 2) {
      report({ step: '글감', done: i + 1, total: BRIEF_FIELDS.length, message: `${field} — 근거 카드 ${facts.length}장뿐이라 건너뜀` });
      continue;
    }
    const prompt = buildBriefPrompt(field, facts, today, perField + 1, excludeListOf(prior, field));
    let reply = '';
    let provider = '';
    try {
      const run = await runWithAnyAgent(prompt, AGENT_CHAIN as any, { timeoutMs: 240_000 });
      reply = run.reply; provider = run.provider; agentCalls += 1;
    } catch (error: any) {
      report({ step: '글감', done: i + 1, total: BRIEF_FIELDS.length, message: `${field} — 에이전트 실패: ${String(error?.message || error).slice(0, 60)}` });
      continue;
    }
    const { ok, dropped } = validateBriefs(tryExtractJson(reply), facts, field, today);
    const { kept, repeated } = dropRepeats(ok, prior);
    all.push(...kept);
    droppedAll.push(
      ...dropped.map((d) => ({ field, ...d })),
      ...repeated.map((b) => ({ field, title: b.title, reason: '앞 회차와 같은 검색어' })),
    );
    report({ step: '글감', done: i + 1, total: BRIEF_FIELDS.length, message: `${field} — ${provider} 로 글감 ${kept.length}개 (떨어짐 ${dropped.length + repeated.length})` });
  }

  // ── 3) 검색량 실측
  const volumes = new Map<string, number | null>();
  let briefs = all;
  if (ad.accessLicense && ad.secretKey && all.length > 0) {
    const wanted = [...new Set(all.flatMap((b) => b.keywords))];
    for (let i = 0; i < wanted.length && !abortRequested; i += 5) {
      const chunk = wanted.slice(i, i + 5);
      try {
        const vols: any[] = await getNaverSearchAdKeywordVolume(ad as any, chunk);
        const byKey = new Map((vols || []).map((v: any) => [String(v.keyword || '').replace(/\s+/g, ''), v]));
        for (const k of chunk) {
          const v: any = byKey.get(k.replace(/\s+/g, ''));
          if (v) volumes.set(k.replace(/\s+/g, ''), typeof v.totalSearchVolume === 'number' ? v.totalSearchVolume : null);
        }
      } catch { /* 이 묶음만 건너뛴다 */ }
      report({ step: '검색량', done: Math.min(i + 5, wanted.length), total: wanted.length, message: `검색어 ${Math.min(i + 5, wanted.length)}/${wanted.length} · 잰 것 ${volumes.size}` });
      await sleep(300);
    }
    briefs = all.map((b) => applyMeasuredVolumes(b, volumes));
  }
  briefs = carrySeats(briefs, prior);

  // ── 4) 자리 실측 — 상한이 넉넉하다. 이게 앱 레인의 값이다.
  let seatsMeasured = 0;
  if (wantSeats && briefs.length > 0) {
    const targets = briefs
      .filter((b) => b.serpFacing == null)
      .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
      .slice(0, CORE_SEAT_CAP);
    for (let i = 0; i < targets.length && !abortRequested; i += 1) {
      const seat = await seatOf(targets[i].coreKeyword);
      if (seat) { targets[i].serpFacing = seat.facing; targets[i].serpVacancy = seat.vacancy; seatsMeasured += 1; }
      report({ step: '자리', done: i + 1, total: targets.length, message: `${targets[i].coreKeyword} — 잰 것 ${seatsMeasured}` });
      if (localSerpStats().consecutiveBlocked >= 5) break;
    }
    for (const b of briefs) b.serpFit = serpFitOf(b.serpFacing, b.serpVacancy);

    // ── 5) 같이 넣을 말 + 대안 검색어
    if (ad.accessLicense && ad.secretKey) {
      const ordered = [...briefs].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
      const needAlt = new Set(briefs.filter((b) => (b.serpFit === '낮음' || b.serpFit === '보통') && b.alternative === undefined));
      let fetched = 0;
      for (let i = 0; i < ordered.length && !abortRequested; i += 1) {
        const b = ordered[i];
        let suggestions: any[] = [];
        try { suggestions = await getNaverSearchAdKeywordSuggestions(ad as any, b.coreKeyword, 60); } catch { suggestions = []; }
        await sleep(300);
        b.related = pickRelatedKeywords(b, suggestions as any, volumes, 6);

        const wantAlt = needAlt.has(b);
        const measured: BriefAlternative[] = [];
        for (const c of b.related.slice(0, 3)) {
          if (fetched >= RELATED_SEAT_CAP) break;
          fetched += 1;
          const seat = await seatOf(c.keyword);
          if (!seat) continue;
          c.serpFacing = seat.facing;
          c.serpVacancy = seat.vacancy;
          c.serpFit = serpFitOf(seat.facing, seat.vacancy);
          measured.push({ keyword: c.keyword, searchVolume: c.searchVolume, serpFacing: seat.facing, serpVacancy: seat.vacancy, serpFit: c.serpFit });
          if (wantAlt && c.serpFit === '높음') break;
        }
        // 열린 것이 앞에 오게. 안 잰 것은 뒤에 그대로 둔다(0 이 아니라 모름).
        const rank = (f?: string) => (f === '높음' ? 0 : f === '보통' ? 1 : f === '낮음' ? 2 : 3);
        b.related.sort((x, y) => rank(x.serpFit) - rank(y.serpFit) || ((y.searchVolume || 0) - (x.searchVolume || 0)));
        report({ step: '같이 넣을 말', done: i + 1, total: ordered.length, message: `${b.coreKeyword} — 말 ${b.related.length}개 · 자리 ${fetched}회` });

        if (!wantAlt) continue;
        // 대안은 핵심 검색어를 대신하는 자리라 트래픽 하한 100 을 지킨다(사이트와 같은 규칙).
        const pool = measured.filter((m) => (m.searchVolume ?? 0) >= 100);
        b.alternative = pool.length === 0 ? null : chooseAlternative(pool);
      }
      seatsMeasured += fetched;
    }
    try { await closeLocalSerpFetch(); } catch { /* 이미 닫혔을 수 있다 */ }
  }

  for (const b of briefs) b.serpFit = serpFitOf(b.serpFacing, b.serpVacancy);
  const starred = markStars(briefs);
  const order: Record<string, number> = { NOW: 0, NEXT: 1, ALWAYS: 2 };
  starred.sort((a, b) => (order[a.timing] - order[b.timing])
    || (Number(b.star) - Number(a.star))
    || ((b.searchVolume || 0) - (a.searchVolume || 0)));

  const builtAt = new Date().toISOString();
  const thisRound: BriefRound = { slot, builtAt, counts: roundCounts(starred), briefs: starred };
  const result: LocalBriefsResult = {
    builtAt,
    slot,
    source: 'app',
    // 같은 회차 이름이 오늘 이미 있으면 그 자리를 갈아끼운다(수동 재실행).
    rounds: [...prior.filter((r) => r.slot !== slot), thisRound],
    counts: {
      briefs: starred.length,
      now: starred.filter((b) => b.timing === 'NOW').length,
      next: starred.filter((b) => b.timing === 'NEXT').length,
      always: starred.filter((b) => b.timing === 'ALWAYS').length,
      star: starred.filter((b) => b.star).length,
      dropped: droppedAll.length,
      newsCalls,
      agentCalls,
    },
    method: {
      facts: '네이버 뉴스 API 실측 기사(분야별 질의, 최신순). 카드에 없는 날짜·숫자는 검증기가 떨어뜨린다',
      timing: 'NOW=최근 5일 안 기사 · NEXT=기사에 미래 날짜 · ALWAYS=철 안 타는 제도(카드 근거 필수)',
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(핵심 검색어) · 없으면 null',
      serpFit: '정면 글 수 실측(이 PC 크로미엄) — 높음 ≤2(또는 빈자리 ≤3) · 보통 ≤5 · 낮음 · 안 쟀으면 미측정. 높음은 상위노출 보장이 아니다',
      star: '적합성 높음 + (검색량 500+ 또는 날짜 박힌 NOW/NEXT)',
    },
    briefs: starred,
    dropped: droppedAll.slice(0, 50),
    seatsMeasured,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeLocalBriefs(result);
  report({ step: '정리', done: starred.length, total: starred.length, message: `끝 — 글감 ${starred.length}개 · 자리 ${seatsMeasured}건 · ${result.seconds}초` });
  return result;
}

/** 사이트에 실린 판. 앱이 아직 한 번도 안 돌았을 때 빈 화면을 보이지 않기 위한 것뿐이다. */
async function fetchPublished(): Promise<any | null> {
  try {
    const res = await (globalThis as any).fetch(`${PUBLISHED}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export function setupTopicBriefsLocalHandlers(): void {
  if (!ipcMain.listenerCount('topic-briefs-local-get')) {
    ipcMain.handle('topic-briefs-local-get', async (_e, payload?: { includePublished?: boolean }) => {
      const local = readLocalBriefs();
      const published = (!local || payload?.includePublished) ? await fetchPublished() : null;
      return { success: true, running, auto: autoEnabled(), autoHours: AUTO_HOURS, local, published };
    });
  }

  if (!ipcMain.listenerCount('topic-briefs-local-auto')) {
    ipcMain.handle('topic-briefs-local-auto', async (_e, payload?: { on?: boolean }) => {
      setAutoEnabled(payload?.on !== false);
      return { success: true, auto: autoEnabled() };
    });
  }

  if (!ipcMain.listenerCount('topic-briefs-local-run')) {
    ipcMain.handle('topic-briefs-local-run', async (event, payload?: { perField?: number; measureSeats?: boolean }) => {
      if (running) return { success: false, error: '이미 만드는 중입니다.' };
      running = true;
      abortRequested = false;
      try {
        const result = await runLocalBriefs({
          perField: payload?.perField,
          measureSeats: payload?.measureSeats,
          onProgress: (p) => { try { event.sender.send(BRIEFS_PROGRESS_CHANNEL, p); } catch { /* 창이 닫혔을 수 있다 */ } },
        });
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: error?.message || '글감을 만들지 못했습니다' };
      } finally {
        running = false;
        abortRequested = false;
      }
    });
  }

  if (!ipcMain.listenerCount('topic-briefs-local-abort')) {
    ipcMain.handle('topic-briefs-local-abort', async () => {
      abortRequested = true;
      return { success: true, message: '지금 단계까지만 하고 멈춥니다.' };
    });
  }

  console.log('[BRIEFS-LOCAL] ✅ 오늘의 글감(앱 전용) 핸들러 등록 완료');
}

/**
 * 자동 주기 — 켜 두면 저절로 새로 만든다.
 * 앱을 켠 직후에는 안 돈다(사장님이 뭘 하려는지 모르는 채로 브라우저를 몇 분씩 쓰면 방해가 된다).
 */
export function startTopicBriefsScheduler(): void {
  if (autoTimer) return;
  if (!autoEnabled()) { console.log('[BRIEFS-LOCAL] 자동 회차 꺼짐(설정)'); return; }
  const everyMs = AUTO_HOURS * 60 * 60 * 1000;
  autoTimer = setInterval(() => {
    if (running) return;
    running = true;
    abortRequested = false;
    runLocalBriefs({})
      .then((r) => console.log(`[BRIEFS-LOCAL] 자동 회차 — 글감 ${r.briefs.length} · 자리 ${r.seatsMeasured} · ${r.seconds}초`))
      .catch((e) => console.warn('[BRIEFS-LOCAL] 자동 회차 실패:', e?.message))
      .finally(() => { running = false; });
  }, everyMs);
  console.log(`[BRIEFS-LOCAL] ⏰ 자동 회차 ${AUTO_HOURS}시간 간격`);
}

export function stopTopicBriefsScheduler(): void {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}
