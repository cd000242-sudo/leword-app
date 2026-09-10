/**
 * 오늘 쓸 한 편 — 600개를 3개로 줄이는 판(앱 전용, 2026-09-11).
 *
 * 사장님 "지금 있는 기능들로 대박 기능 하나 만들 수 있을 것 같은데" · "탭 하나 만들어서".
 *
 * 왜 이게 필요한가(실측 2026-09-10): 하루에 나오는 후보가 글감 212 · 추천키워드 320 ·
 * 선점 43 · 유튜브 18 · 지식인 21 · 발굴 최대 1,000 — **600개가 넘는다.**
 * 초보자에게 600개는 0개와 같다. 모든 판이 "이 키워드가 좋다"고 말하지만
 * "**너에게** 좋다"고는 말하지 않았다.
 *
 * 여기서 새로 만드는 판정은 하나도 없다. 이미 있는 실측을 관문으로 세울 뿐이다:
 *   ① 내 봉투 안인가        blog-class 의 judgeRange (내가 이겨본 문서수·정면)
 *   ② 자리가 지금 열렸나     seat-measure (이 PC 크로미엄, 무제한)
 *   ③ 검색량이 실측됐나      각 판이 이미 검색광고로 잰 값
 *   ④ 글감이 붙어 있나       제목 후보·같이 넣을 말·근거
 *   ⑤ 내가 아직 안 썼나      노출 추적의 tracked 목록
 *
 * 그리고 닫힌 고리: 쓰고 나서 발행 주소를 넣으면 노출 추적이 받아 순위를 재고,
 * 이기면 봉투가 커진다 → 내일 추천이 달라진다. 지금 LEWORD 에 없던 화살표가 이것이다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { judgeRange, type BlogEnvelope } from '../../utils/blog-class/envelope';
import { measureKeywords } from './seat-measure';

export const DAILY_PICK_PROGRESS_CHANNEL = 'daily-pick-progress';

/** 자리를 잴 후보 상한. 건당 약 6초라 이 수가 곧 기다리는 시간이다. */
const MEASURE_CAP = 14;
/** 세워 보일 수. 셋을 넘기면 다시 "고르는 일"이 된다. */
const SHOW = 3;

const U = (...p: string[]) => path.join(app.getPath('userData'), ...p);

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

const flat = (v: unknown) => String(v || '').replace(/\s+/g, '').toLowerCase();

/** 어느 판에서 왔는가 — 카드에 그대로 적는다. 근거를 숨기지 않는다. */
export type PickSource = '오늘의 글감' | '선점 보드' | '추천키워드' | '유튜브' | '실시간 틈새';

export interface Candidate {
  keyword: string;
  source: PickSource;
  topic: string;
  searchVolume: number | null;
  documentCount: number | null;
  /** 판이 이미 잰 정면 글 수(낡았을 수 있다 — 여기서 다시 잰다). */
  facing: number | null;
  vacancy: number | null;
  /** 글감 — 제목 후보·같이 넣을 말·근거. 있는 것만 담는다. */
  titles: Array<{ label: string; text: string }>;
  related: Array<{ keyword: string; searchVolume: number | null; open: boolean }>;
  why: string;
  facts: Array<{ title: string; press: string; link: string }>;
}

export interface Picked extends Candidate {
  /** 여기서 다시 잰 자리. 이 값이 카드의 근거다. */
  seat: string;
  seatFacing: number | null;
  seatVacancy: number | null;
  seatReason: string;
  measuredAt: string;
  /** 봉투와 견준 한 줄 — "너는 890개까지 이겨봤다". */
  fitReason: string;
  myTopic: boolean;
}

/* ────────────────────────────── 후보 모으기 ────────────────────────────── */

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

function fromBriefs(): Candidate[] {
  const j = readJson<any>(U('topic-briefs', 'latest.json'), null);
  const rows: any[] = (j && Array.isArray(j.briefs)) ? j.briefs : [];
  return rows.map((b) => ({
    keyword: String(b.coreKeyword || ''),
    source: '오늘의 글감' as PickSource,
    topic: String(b.field || ''),
    searchVolume: num(b.searchVolume),
    // 글감 판은 문서수를 안 잰다 — 없는 것을 0 으로 바꾸지 않는다(봉투가 정면으로 판단한다).
    documentCount: null,
    facing: num(b.serpFacing),
    vacancy: num(b.serpVacancy),
    titles: (b.titles || []).map((t: any) => ({ label: String(t.target || t.type || ''), text: String(t.text || '') })),
    related: (b.related || []).map((r: any) => ({ keyword: String(r.keyword), searchVolume: num(r.searchVolume), open: r.serpFit === '높음' })),
    why: String(b.value || b.primaryIntent || ''),
    facts: (b.facts || []).map((f: any) => ({ title: String(f.title || ''), press: String(f.press || ''), link: String(f.link || '') })),
  }));
}

function fromBoard(): Candidate[] {
  const j = readJson<any>(U('preemption-board', 'board.json'), null);
  const rows: any[] = (j && Array.isArray(j.rows)) ? j.rows : [];
  return rows.map((r) => ({
    keyword: String(r.keyword || ''),
    source: '선점 보드' as PickSource,
    topic: String(r.topic || ''),
    searchVolume: num(r.searchVolume),
    documentCount: num(r.documentCount),
    facing: num(r.serp?.exactTitleHits),
    vacancy: num(r.openSlot),
    titles: ['seo', 'home']
      .filter((k) => r.titles?.[k]?.text)
      .map((k) => ({ label: k === 'seo' ? '검색' : '끌리는', text: String(r.titles[k].text) })),
    related: (r.subKeywords || []).map((s: any) => ({ keyword: String(s.keyword), searchVolume: num(s.searchVolume), open: false })),
    why: String(r.brief?.value || r.tierLabel || ''),
    facts: (r.brief?.facts || []).map((f: any) => ({ title: String(f.title || ''), press: String(f.press || ''), link: String(f.link || '') })),
  }));
}

function fromPicks(): Candidate[] {
  const j = readJson<any>(U('daily-pick', 'today-picks.json'), null);
  const topics: any[] = (j && Array.isArray(j.topics)) ? j.topics : [];
  return topics.flatMap((t) => (t.rows || []).map((r: any) => ({
    keyword: String(r.keyword || ''),
    source: '추천키워드' as PickSource,
    topic: String(t.topic || ''),
    searchVolume: num(r.searchVolume),
    documentCount: num(r.documentCount),
    facing: null,
    vacancy: null,
    titles: [],
    related: [],
    why: typeof r.ratio === 'number' ? `검색량이 문서수의 ${r.ratio.toFixed(1)}배` : '',
    facts: [],
  })));
}

function fromYoutube(): Candidate[] {
  const j = readJson<any>(U('daily-pick', 'youtube-gap.json'), null);
  const rows: any[] = (j && Array.isArray(j.rows)) ? j.rows : [];
  return rows.map((r) => ({
    keyword: String(r.keyword || ''),
    source: '유튜브' as PickSource,
    topic: '',
    searchVolume: num(r.searchVolume),
    documentCount: num(r.documentCount),
    facing: null,
    vacancy: null,
    titles: [],
    related: (r.expansions || []).map((k: any) => ({ keyword: String(k), searchVolume: null, open: false })),
    why: '유튜브에서 뜨는데 네이버에 글이 적다',
    facts: [],
  }));
}

function fromNiche(): Candidate[] {
  const j = readJson<any>(U('realtime-niche', 'latest.json'), null);
  const rows: any[] = (j && Array.isArray(j.rows)) ? j.rows : [];
  return rows.map((r) => ({
    keyword: String(r.keyword || ''),
    source: '실시간 틈새' as PickSource,
    topic: String(r.baseKeyword || ''),
    searchVolume: num(r.searchVolume),
    documentCount: num(r.documentCount),
    facing: num(r.seatFacing),
    vacancy: null,
    titles: [],
    related: [],
    why: '실시간 이슈에서 나온 좁은 검색어',
    facts: [],
  }));
}

export function gatherCandidates(): Candidate[] {
  const all = [...fromBriefs(), ...fromBoard(), ...fromPicks(), ...fromYoutube(), ...fromNiche()]
    .filter((c) => c.keyword.length >= 2);
  // 같은 검색어가 여러 판에 있으면 글감이 붙은 쪽을 남긴다 — 바로 쓸 수 있는 것이 낫다.
  const best = new Map<string, Candidate>();
  for (const c of all) {
    const key = flat(c.keyword);
    const prev = best.get(key);
    if (!prev || (c.titles.length + c.related.length) > (prev.titles.length + prev.related.length)) best.set(key, c);
  }
  return [...best.values()];
}

/* ────────────────────────────── 관문 ────────────────────────────── */

export function readEnvelope(): BlogEnvelope | null {
  const record = readJson<any>(U('blog-class', 'latest.json'), null);
  return (record && record.envelope) || null;
}

/** 내가 이미 쓴 검색어. 노출 추적이 들고 있는 목록 그대로. */
export function readWritten(): Set<string> {
  const tracked = readJson<any[]>(U('exposure-tracking', 'tracked.json'), []);
  return new Set(tracked.map((t) => flat(t?.keyword)).filter(Boolean));
}

export interface Gated {
  candidate: Candidate;
  fitReason: string;
  myTopic: boolean;
}

/**
 * 봉투·중복으로 먼저 거른다. 자리는 비싸므로 여기를 통과한 것만 잰다.
 * 봉투가 없으면(첫 페이지에 든 글이 아직 없으면) 봉투 관문을 건너뛴다 —
 * 견줄 게 없는 것을 탈락으로 바꾸지 않는다.
 */
export function gate(candidates: readonly Candidate[], envelope: BlogEnvelope | null, written: ReadonlySet<string>): Gated[] {
  const out: Gated[] = [];
  for (const c of candidates) {
    if (written.has(flat(c.keyword))) continue;
    const verdict = judgeRange({ documentCount: c.documentCount, facing: c.facing, topic: c.topic }, envelope);
    if (verdict.verdict === 'out') continue;
    out.push({
      candidate: c,
      // judgeRange 의 값은 'in' | 'out' | 'unknown' 이다. 'in' 이면 그 이유를 그대로 쓴다.
      fitReason: envelope
        ? (verdict.verdict === 'in' ? verdict.reason : verdict.reason)
        : '아직 이겨본 기록이 없어서 견줄 게 없어요',
      myTopic: verdict.myTopic,
    });
  }
  // 내가 이겨본 주제 먼저, 그다음 검색량 큰 순. 글감이 붙은 것을 앞세운다.
  return out.sort((a, b) =>
    (Number(b.myTopic) - Number(a.myTopic))
    || ((b.candidate.titles.length > 0 ? 1 : 0) - (a.candidate.titles.length > 0 ? 1 : 0))
    || ((b.candidate.searchVolume || 0) - (a.candidate.searchVolume || 0)));
}

/* ────────────────────────────── 한 회차 ────────────────────────────── */

export interface DailyPickResult {
  builtAt: string;
  envelope: BlogEnvelope | null;
  gathered: number;
  afterGate: number;
  measured: number;
  picks: Picked[];
  /** 자리가 닫혀 있던 것 — 왜 안 세웠는지 보이게 남긴다. */
  rejected: Array<{ keyword: string; source: string; seat: string }>;
  seconds: number;
  message: string | null;
}

let running = false;

export async function runDailyPick(
  onProgress?: (p: { done: number; total: number; keyword: string; message: string }) => void,
): Promise<DailyPickResult> {
  const started = Date.now();
  const envelope = readEnvelope();
  const written = readWritten();
  const candidates = gatherCandidates();
  const gated = gate(candidates, envelope, written);
  const targets = gated.slice(0, MEASURE_CAP);

  const picks: Picked[] = [];
  const rejected: DailyPickResult['rejected'] = [];
  let message: string | null = null;
  let measured = 0;

  if (targets.length > 0) {
    const batch = await measureKeywords(targets.map((g) => g.candidate.keyword), {
      // 통합검색까지 읽는다 — 안 읽으면 카드답을 열림으로 적는다.
      withStructure: true,
      onProgress: (p) => {
        if (!onProgress) return;
        try {
          onProgress({
            done: p.done, total: p.total, keyword: p.keyword,
            message: `자리 확인 ${p.done}/${p.total} · ${p.keyword}` + (p.verdict ? ` → ${p.verdict}` : ''),
          });
        } catch { /* 듣는 쪽 사정 */ }
      },
    });
    message = batch.message;
    const byKw = new Map(batch.rows.map((r) => [flat(r.keyword), r]));
    for (const g of targets) {
      const row = byKw.get(flat(g.candidate.keyword));
      if (!row || row.status !== 'ok' || !row.verdict) continue;
      measured += 1;
      if (row.verdict !== '열림') {
        rejected.push({ keyword: g.candidate.keyword, source: g.candidate.source, seat: String(row.verdict) });
        continue;
      }
      // 자리를 재고 나서야 정면 수를 안다 — 봉투를 그 값으로 다시 본다.
      const again = judgeRange(
        { documentCount: g.candidate.documentCount, facing: typeof row.facing === 'number' ? row.facing : null, topic: g.candidate.topic },
        envelope,
      );
      if (again.verdict === 'out') {
        rejected.push({ keyword: g.candidate.keyword, source: g.candidate.source, seat: '내 범위 밖' });
        continue;
      }
      picks.push({
        ...g.candidate,
        seat: String(row.verdict),
        seatFacing: typeof row.facing === 'number' ? row.facing : null,
        seatVacancy: typeof row.vacancy === 'number' ? row.vacancy : null,
        seatReason: row.reason || '',
        measuredAt: row.measuredAt || new Date().toISOString(),
        fitReason: envelope ? again.reason : g.fitReason,
        myTopic: again.myTopic,
      });
      if (picks.length >= SHOW) break;
    }
  }

  const result: DailyPickResult = {
    builtAt: new Date().toISOString(),
    envelope,
    gathered: candidates.length,
    afterGate: gated.length,
    measured,
    picks,
    rejected,
    seconds: Math.round((Date.now() - started) / 1000),
    message,
  };
  try {
    fs.mkdirSync(U('daily-pick'), { recursive: true });
    fs.writeFileSync(U('daily-pick', 'latest.json'), JSON.stringify(result, null, 1), 'utf8');
  } catch { /* 저장 못 해도 이번 결과는 준다 */ }
  return result;
}

/** 사이트가 발행한 판 두 개를 받아 둔다 — 앱이 아직 안 만든 판의 후보도 쓴다. */
async function pullPublished(): Promise<void> {
  const targets: Array<[string, string]> = [
    ['today-picks.json', 'https://leaderspro.kr/data/today-picks.json'],
    ['youtube-gap.json', 'https://leaderspro.kr/data/youtube-gap.json'],
  ];
  fs.mkdirSync(U('daily-pick'), { recursive: true });
  for (const [name, url] of targets) {
    try {
      const res = await (globalThis as any).fetch(`${url}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      fs.writeFileSync(U('daily-pick', name), JSON.stringify(await res.json()), 'utf8');
    } catch { /* 못 받으면 지난번 것으로 간다 */ }
  }
}

export function setupDailyPickHandlers(): void {
  if (!ipcMain.listenerCount('daily-pick-get')) {
    ipcMain.handle('daily-pick-get', async () => ({
      success: true,
      running,
      result: readJson<DailyPickResult | null>(U('daily-pick', 'latest.json'), null),
      envelope: readEnvelope(),
    }));
  }

  if (!ipcMain.listenerCount('daily-pick-run')) {
    ipcMain.handle('daily-pick-run', async (event) => {
      if (running) return { success: false, error: '이미 고르는 중입니다.' };
      running = true;
      try {
        await pullPublished();
        const result = await runDailyPick((p) => {
          try { event.sender.send(DAILY_PICK_PROGRESS_CHANNEL, p); } catch { /* 창이 닫혔을 수 있다 */ }
        });
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: error?.message || '고르지 못했습니다' };
      } finally {
        running = false;
      }
    });
  }

  console.log('[DAILY-PICK] ✅ 오늘 쓸 한 편 핸들러 등록 완료');
}
