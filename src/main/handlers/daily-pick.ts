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
 * ── 내 블로그에서 찾는다 (2026-09-15) ──
 * 사장님 "내 블로그 주소랑 지금 현재 내 블로그가 얼마나 최적화되어있는지를 알아야지 오늘 것 고르기에서
 * 너가 키워드를 찾아줄 수 있지 않니". 전에는 여섯 판 후보를 봉투로 **거르기만** 했는데, 9-14 회차가
 * 인테리어·DIY 블로그에 'kaist 서울캠퍼스'·'kaist 입학처'를 세웠다(459개 중 450개가 봉투를 통과).
 * 이제 관문이 이렇다 — 새로 만드는 점수는 없고, 이미 있는 실측을 세울 뿐이다:
 *   ① 내 블로그 판      30위 안에 붙어 본 말을 씨앗으로 연관어·자동완성에서 새로 찾는다(my-blog-lane)
 *   ② 겹치는 말만       여섯 판 후보는 내 블로그 어휘와 낱말이 겹치거나 대표 주제가 같은 것만
 *   ③ 내 크기           검색량이 30위 안에 붙어 본 범위(100~최대) 안인가 — envelope 의 judgeRange
 *   ④ 이미 쓴 말 빼기    노출 추적 목록 + 내가 이미 순위를 잰 말(= 이미 쓴 글의 말)
 *   ⑤ 자리가 지금 열렸나  seat-measure (이 PC 크로미엄, 무제한)
 *
 * 그리고 닫힌 고리: 쓰고 나서 발행 주소를 넣으면 노출 추적이 받아 순위를 재고,
 * 붙어 본 말이 늘면 범위가 커진다 → 내일 추천이 달라진다.
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { buildNearBand, isWon, judgeRange, type BlogEnvelope, type NearBand, type WonRow } from '../../utils/blog-class/envelope';
import {
  buildProfile,
  coreWords,
  describeBlogState,
  interleave,
  nearRows,
  pickExpansions,
  sharesVocabulary,
  shortenSeed,
  type BlogStateLine,
  type Expansion,
  type MyBlogProfile,
} from '../../utils/blog-class/my-blog-lane';
import { measureKeywords } from './seat-measure';
import { normalizeBriefBoard } from '../topic-brief-pipeline';

export const DAILY_PICK_PROGRESS_CHANNEL = 'daily-pick-progress';

/** 자리를 잴 후보 상한. 건당 약 6초라 이 수가 곧 기다리는 시간이다. */
const MEASURE_CAP = 14;
/** 세워 보일 수. 셋을 넘기면 다시 "고르는 일"이 된다. */
const SHOW = 3;
/** 자리 잴 14칸 중 내 블로그 판이 먼저 쓰는 칸. 모자라면 다른 판이 채운다. */
export const MY_BLOG_FIRST = 10;
/** 씨앗 수 — 30위 안 기록에서 가까운 순. 씨앗마다 연관어 한 번(+ 짧게 줄여 한 번 더). */
const MAX_SEEDS = 12;
/** 씨앗 하나가 연관어로 남기는 새 말 상한 — 연관어 200개짜리 씨앗 하나가 판을 다 채우지 않게. */
const PER_SEED = 15;
/** 연관어가 이보다 적게 오면 씨앗을 짧게 줄여 한 번 더 묻는다(시험: '베란다 청소 방법' → 1개). */
const FEW_SUGGESTIONS = 5;
/** 자동완성으로도 넓힐 앞 씨앗 수 — 씨앗은 가까운 순이라 첫 페이지 씨앗이 먼저 들어온다. */
const AUTOCOMPLETE_SEEDS = 6;
/** 씨앗 하나에서 검색량을 재 볼 자동완성 말 상한 — 검색광고 호출(4개씩 한 번)을 묶어 둔다. */
const AUTOCOMPLETE_ASK = 20;
/** 씨앗 하나가 자동완성으로 남기는 말 상한. */
const AUTOCOMPLETE_PER_SEED = 10;

const U = (...p: string[]) => path.join(app.getPath('userData'), ...p);

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

const flat = (v: unknown) => String(v || '').replace(/\s+/g, '').toLowerCase();

/** 어느 판에서 왔는가 — 카드에 그대로 적는다. 근거를 숨기지 않는다. */
export type PickSource = '내 블로그' | '오늘의 글감' | '선점 보드' | '추천키워드' | '유튜브' | '실시간 틈새';

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
  /** 내 크기와 견준 한 줄 — "30위 안에 붙어 본 말이 3,610까지 있다". */
  fitReason: string;
  myTopic: boolean;
}

/* ────────────────────────────── 후보 모으기 ────────────────────────────── */

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

function fromBriefs(): Candidate[] {
  const j = normalizeBriefBoard(readJson<any>(U('topic-briefs', 'latest.json'), null));
  const rows: any[] = (j && Array.isArray(j.briefs)) ? j.briefs : [];
  return rows.map((b) => ({
    keyword: String(b.coreKeyword || ''),
    source: '오늘의 글감' as PickSource,
    topic: String(b.field || ''),
    searchVolume: num(b.searchVolume),
    // 글감 판은 문서수를 안 잰다 — 없는 것을 0 으로 바꾸지 않는다.
    documentCount: null,
    facing: num(b.serpFacing),
    vacancy: num(b.serpVacancy),
    titles: b.editorial?.status === 'supported' ? (b.titles || []).map((t: any) => ({ label: String(t.target || t.type || ''), text: String(t.text || '') })) : [],
    related: (b.related || []).map((r: any) => ({ keyword: String(r.keyword), searchVolume: num(r.searchVolume), open: r.serpFit === '높음' })),
    why: b.editorial?.status === 'supported' ? String(b.value || b.primaryIntent || '')
      : `추가 확인이 필요한 조사 주제입니다. ${(b.editorial?.missing || []).slice(0, 2).join(' ')}`,
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
    /*
     * 이 레인에는 블로그 주제가 없다. 전에는 기준 검색어(baseKeyword)를 여기 넣어서
     * 카드에 '게임'·'교육·학문'이 뜨는 자리에 'KAIST'가 떴고, judgeRange 가 그걸 블로그 주제와 견줬다.
     * 주제 칸은 비우고, 기준 검색어는 '왜 나온 말인지'에 남긴다(버리지는 않는다).
     */
    topic: '',
    searchVolume: num(r.searchVolume),
    documentCount: num(r.documentCount),
    facing: num(r.seatFacing),
    vacancy: null,
    titles: [],
    related: [],
    why: r.baseKeyword ? `실시간에 뜬 '${String(r.baseKeyword)}'에서 갈라져 나온 좁은 검색어` : '실시간 이슈에서 나온 좁은 검색어',
    facts: [],
  }));
}

/**
 * 모든 판의 후보를 모은다. extra 는 내 블로그 판이 찾은 말 — 맨 앞에 둔다.
 * 같은 검색어가 여러 판에 있으면 글감이 붙은 쪽을 남기고, 같으면 먼저 온 쪽(내 블로그)을 남긴다.
 */
export function gatherCandidates(extra: readonly Candidate[] = []): Candidate[] {
  const all = [...extra, ...fromBriefs(), ...fromBoard(), ...fromPicks(), ...fromYoutube(), ...fromNiche()]
    .filter((c) => c.keyword.length >= 2);
  const best = new Map<string, Candidate>();
  for (const c of all) {
    const key = flat(c.keyword);
    const prev = best.get(key);
    if (!prev || (c.titles.length + c.related.length) > (prev.titles.length + prev.related.length)) best.set(key, c);
  }
  return [...best.values()];
}

/* ────────────────────────────── 관문 ────────────────────────────── */

/** 내 크기 재기 기록(userData/blog-class/latest.json) — 글 목록·순위 기록·사실 카드가 들어 있다. */
export function readBlogRecord(): any | null {
  return readJson<any>(U('blog-class', 'latest.json'), null);
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

export interface GateStats {
  gated: Gated[];
  /** 여섯 판 후보 중 내 블로그 어휘와 낱말이 안 겹치고 대표 주제도 달라 뺀 수. */
  offTopic: number;
  /** 검색량이 30위 안에 붙어 본 범위 밖이라 뺀 수. */
  outOfBand: number;
  /** 내가 이미 순위를 잰 말(= 이미 쓴 글의 말)이라 뺀 수. */
  alreadyMine: number;
}

/**
 * 자리는 비싸므로 여기를 통과한 것만 잰다.
 *
 * 블로그를 안 쟀으면(profile 없음) 예전처럼 거르지 않고 판마다 나눠 쓴다 — 견줄 게 없는 것을 탈락으로 바꾸지 않는다.
 * 블로그를 쟀으면:
 *   - 여섯 판 후보는 내 블로그 어휘와 낱말이 겹치거나 대표 주제가 같은 것만(9-14 'kaist 입학처'를 막는 자리)
 *   - 검색량이 30위 안에 붙어 본 범위 밖이면 뺀다
 *   - 내가 이미 순위를 잰 말은 이미 쓴 글의 말이라 뺀다
 * 내 블로그 판이 앞 칸(MY_BLOG_FIRST)을 먼저 쓴다 — 이 판만 '너에게' 맞춰 찾은 말이다.
 */
export function gateWithStats(candidates: readonly Candidate[], profile: MyBlogProfile | null, written: ReadonlySet<string>): GateStats {
  let offTopic = 0;
  let outOfBand = 0;
  let alreadyMine = 0;
  const mine: Gated[] = [];
  const others: Gated[] = [];
  for (const c of candidates) {
    const key = flat(c.keyword);
    if (written.has(key)) continue;
    if (profile && profile.ownKeywords.has(key)) {
      alreadyMine += 1;
      continue;
    }
    const fromMyBlog = c.source === '내 블로그';
    const sameTopic = Boolean(profile && profile.declaredTopic && c.topic === profile.declaredTopic);
    if (profile && !fromMyBlog && !sameTopic && !sharesVocabulary(c.keyword, profile.vocabulary)) {
      offTopic += 1;
      continue;
    }
    const verdict = judgeRange({ searchVolume: c.searchVolume, topic: c.topic }, profile ? profile.band : null);
    if (verdict.verdict === 'out') {
      outOfBand += 1;
      continue;
    }
    const gated: Gated = {
      candidate: c,
      fitReason: profile ? verdict.reason : '아직 내 블로그를 안 재서 견줄 게 없어요',
      myTopic: verdict.myTopic || sameTopic,
    };
    (fromMyBlog ? mine : others).push(gated);
  }
  // 다른 판 안에서는 좋은 것 먼저 — 붙어 본 주제, 글감이 붙은 것, 검색량 큰 순.
  // 내 블로그 판은 찾은 순서(씨앗마다 번갈아)를 그대로 둔다 — 한 씨앗이 앞자리를 다 먹지 않게 이미 줄세웠다.
  others.sort((a, b) =>
    (Number(b.myTopic) - Number(a.myTopic))
    || ((b.candidate.titles.length > 0 ? 1 : 0) - (a.candidate.titles.length > 0 ? 1 : 0))
    || ((b.candidate.searchVolume || 0) - (a.candidate.searchVolume || 0)));
  const gated = [...mine.slice(0, MY_BLOG_FIRST), ...spread(others), ...mine.slice(MY_BLOG_FIRST)];
  return { gated, offTopic, outOfBand, alreadyMine };
}

export function gate(candidates: readonly Candidate[], profile: MyBlogProfile | null, written: ReadonlySet<string>): Gated[] {
  return gateWithStats(candidates, profile, written).gated;
}

/**
 * 판마다 돌아가며 한 줄씩 뽑는다.
 *
 * 왜(실측 2026-09-10 회차): 잰 14개가 **전부 선점 보드**였다. 글감 212·추천키워드 320·
 * 유튜브 18·틈새 21 에서 잰 것이 0개다. 위 줄세우기의 '글감이 붙었나'가 원인인데,
 * 제목 후보를 들고 오는 판이 보드뿐이라 보드 행 전부가 다른 판 전부를 앞선다.
 * "여섯 판이 내놓은 것"이라 적어 놓고 한 판만 재고 있었다.
 *
 * 판 안 순서는 그대로 둔다 — 나눠 쓰느라 품질을 버리지 않는다.
 * 어느 판이 먼저 바닥나면 남은 판이 그 자리를 이어받는다(판 하나뿐이면 그대로 다 쓴다).
 */
function spread(rows: readonly Gated[]): Gated[] {
  const lanes = new Map<PickSource, Gated[]>();
  for (const g of rows) {
    const lane = lanes.get(g.candidate.source);
    if (lane) lane.push(g);
    else lanes.set(g.candidate.source, [g]);
  }
  return interleave([...lanes.values()]);
}

/* ────────────────────────── 내 블로그 판 ────────────────────────── */

/** 내 블로그 판이 쓰는 바깥 창구 — 테스트는 가짜를 넣는다. */
export interface MyBlogDeps {
  /** 검색광고 연관어 — 검색량이 같이 온다. */
  suggest(seed: string): Promise<Array<{ keyword: string; searchVolume: number | null }>>;
  /** 자동완성 — 사람이 띄어 치는 모양. 검색량은 안 온다. */
  autocomplete(seed: string): Promise<string[]>;
  /** 검색광고 검색량 — 키는 공백 뺀 소문자. */
  volumes(keywords: string[]): Promise<Map<string, number | null>>;
}

/**
 * 30위 안에 붙어 본 말을 씨앗으로 새 말을 찾는다. 범위가 없으면 찾지 않는다 — 기준 없이 넓히지 않는다.
 * 창구가 실패해도 판 전체를 죽이지 않는다(그 씨앗만 빈손).
 *
 * 줄세우기 — 첫 페이지 씨앗 먼저, 같은 씨앗 안에서는 자동완성 먼저.
 * 근거(2026-09-15 사장님 블로그 실측, 자리 36건):
 *   첫 페이지(1~10위) 씨앗에서 넓힌 말 21건 중 반열림 7 · 11~30위 씨앗에서 넓힌 말 15건 중 0.
 *   첫 페이지 씨앗 안에서도 자동완성(띄어 쓴 긴 말) 8건 중 5 · 붙여 쓴 연관어 13건 중 2.
 *   처음에는 씨앗마다 연관어를 검색량 큰 순으로 세웠더니 '부산청소업체'·'준공청소' 같은 업체 말이
 *   자리 잴 칸을 먹어 12건이 전부 잠김이었다.
 * 같은 말이 자동완성과 연관어로 둘 다 오면 띄어 쓴 자동완성 쪽을 남긴다 — 제목에 그대로 쓰인다.
 */
export async function findFromMyBlog(
  rows: readonly WonRow[],
  profile: MyBlogProfile,
  deps: MyBlogDeps,
  onMessage?: (message: string) => void,
): Promise<{ candidates: Candidate[]; seeds: number }> {
  const band = profile.band;
  if (!band) return { candidates: [], seeds: 0 };
  const say = (message: string) => { if (onMessage) { try { onMessage(message); } catch { /* 듣는 쪽 사정 */ } } };
  const seeds = nearRows(rows).slice(0, MAX_SEEDS);
  const seen = new Set(profile.ownKeywords);

  // ① 자동완성 — 사람이 띄어 치는 긴 말. 검색량이 안 오니 모아서 한 번에 잰다.
  const phrases: Array<{ seedIndex: number; phrase: string }> = [];
  const autoSeeds = Math.min(AUTOCOMPLETE_SEEDS, seeds.length);
  for (let i = 0; i < autoSeeds; i += 1) {
    const seed = seeds[i];
    say(`내 블로그 말에서 찾는 중 — 자동완성 ${i + 1}/${autoSeeds} · ${seed.keyword}`);
    let found: string[] = [];
    try { found = await deps.autocomplete(shortenSeed(seed.keyword) || seed.keyword); } catch { found = []; }
    const words = coreWords(seed.keyword);
    let asked = 0;
    for (const phrase of found) {
      if (asked >= AUTOCOMPLETE_ASK) break;
      const key = flat(phrase);
      if (!key || seen.has(key) || !words.some((word) => key.includes(word))) continue;
      if (phrases.some((p) => flat(p.phrase) === key)) continue;
      phrases.push({ seedIndex: i, phrase });
      asked += 1;
    }
  }
  const autoLists: Expansion[][] = seeds.map(() => []);
  if (phrases.length > 0) {
    say(`자동완성 말 ${phrases.length}개의 검색량을 재는 중`);
    let volumes = new Map<string, number | null>();
    try { volumes = await deps.volumes(phrases.map((p) => p.phrase)); } catch { /* 못 재면 안 쓴다 */ }
    for (let i = 0; i < autoSeeds; i += 1) {
      const measured = phrases
        .filter((p) => p.seedIndex === i)
        .map((p) => ({ keyword: p.phrase, searchVolume: volumes.get(flat(p.phrase)) ?? null }));
      if (measured.length === 0) continue;
      autoLists[i] = pickExpansions(seeds[i], measured, band, seen, AUTOCOMPLETE_PER_SEED, '자동완성');
    }
  }

  // ② 연관어 — 검색량이 같이 온다. 자동완성이 이미 남긴 말은 건너뛴다.
  const lists: Expansion[][] = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    say(`내 블로그 말에서 찾는 중 — 연관어 ${i + 1}/${seeds.length} · ${seed.keyword}`);
    let items: Array<{ keyword: string; searchVolume: number | null }> = [];
    try { items = await deps.suggest(seed.keyword); } catch { items = []; }
    if (items.length < FEW_SUGGESTIONS) {
      const short = shortenSeed(seed.keyword);
      if (short) {
        try { items = items.concat(await deps.suggest(short)); } catch { /* 이 씨앗은 여기까지 */ }
      }
    }
    lists.push([...autoLists[i], ...pickExpansions(seed, items, band, seen, PER_SEED, '연관어')]);
  }

  // ③ 첫 페이지 씨앗에서 넓힌 말을 다 세운 뒤에 11~30위 씨앗의 말. 각 층 안에서는 씨앗마다 번갈아.
  const firstPage = lists.filter((_, i) => isWon(seeds[i]));
  const further = lists.filter((_, i) => !isWon(seeds[i]));
  const ordered = [...interleave(firstPage), ...interleave(further)];

  const candidates = ordered.map((e): Candidate => ({
    keyword: e.keyword,
    source: '내 블로그',
    topic: profile.declaredTopic || '',
    searchVolume: e.searchVolume,
    documentCount: null,
    facing: null,
    vacancy: null,
    titles: [],
    related: [],
    why: `내 글이 ${e.seedRank}위였던 '${e.seed}'에서 ${e.via === '연관어' ? '연관어로' : '자동완성으로'} 찾은 말`,
    facts: [],
  }));
  return { candidates, seeds: seeds.length };
}

/** 앱 설정의 키로 창구를 만든다. 키가 없으면 그 창구는 빈손을 준다(판을 죽이지 않는다). */
async function realMyBlogDeps(): Promise<MyBlogDeps> {
  const { EnvironmentManager } = await import('../../utils/environment-manager');
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig() || {};
  const ad = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
  const openApi = {
    clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '',
    clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '',
  };
  const searchad = await import('../../utils/naver-searchad-api');
  const autocomplete = await import('../../utils/naver-autocomplete');
  const hasAd = Boolean(ad.accessLicense && ad.secretKey);
  return {
    suggest: async (seed) => {
      if (!hasAd) return [];
      const items = await searchad.getNaverSearchAdKeywordSuggestions(ad, seed);
      return (items || []).map((it: any) => ({ keyword: String(it.keyword || ''), searchVolume: searchad.exactSearchAdTotal(it) }));
    },
    autocomplete: async (seed) => {
      if (!openApi.clientId || !openApi.clientSecret) return [];
      return autocomplete.getNaverAutocompleteKeywords(seed, { ...openApi, skipSearchAdRelated: true });
    },
    volumes: async (keywords) => {
      const out = new Map<string, number | null>();
      if (!hasAd || keywords.length === 0) return out;
      const rows = await searchad.getNaverSearchAdKeywordVolume(ad, keywords);
      for (const row of rows || []) out.set(flat((row as any).keyword), searchad.exactSearchAdTotal(row as any));
      return out;
    },
  };
}

/* ────────────────────────── 잰 것 중에서 고르기 ────────────────────────── */

/** 자리 실측기가 돌려준 한 줄. 모양만 받는다 — 판정은 거기서 이미 난 것을 쓴다. */
export interface MeasuredRow {
  keyword: string;
  status: string;
  verdict?: string | null;
  facing?: number | null;
  vacancy?: number | null;
  reason?: string;
  measuredAt?: string;
}

/**
 * 자리 판정을 순위로. 0 은 안 쓴다.
 *
 * 왜 반열림을 쓰는가(실측 2026-09-10 회차): 잰 14개의 판정이 잠김 7 · **반열림 7** · 열림 0 이었는데
 * 화면은 0개를 내놓았다. 반열림은 serp-winnability 가 "경쟁 있으나 여지 있음"이라 부르는 값이다
 * (제목 정확 일치 2건 이하). 잰 사실을 버리고 빈 판을 내는 것보다,
 * **열림을 먼저 쓰고 모자랄 때만 반열림으로 채우되** 카드에는 잰 판정을 그대로 적는다.
 * 잠김·카드답·자료없음은 그대로 탈락이다.
 */
export function seatRank(verdict: string): number {
  if (verdict === '열림') return 2;
  if (verdict === '반열림') return 1;
  return 0;
}

/**
 * 잰 줄들을 카드 셋과 탈락 목록으로 줄인다.
 * 내 크기는 자리를 재기 전에 이미 걸렀다(검색량 기준이라 자리를 재도 안 바뀐다). 여기서는 잰 판정만 본다.
 */
export function selectPicks(
  targets: readonly Gated[],
  rows: readonly MeasuredRow[],
  show: number = SHOW,
): { picks: Picked[]; rejected: Array<{ keyword: string; source: string; seat: string }>; measured: number } {
  const byKw = new Map(rows.map((r) => [flat(r.keyword), r]));
  const kept: Array<{ rank: number; i: number; pick: Picked }> = [];
  const closed: Array<{ keyword: string; source: string; seat: string }> = [];
  let measured = 0;

  for (const g of targets) {
    const row = byKw.get(flat(g.candidate.keyword));
    // 못 잰 것(막힘·오류)은 잰 수에도, 탈락 목록에도 안 넣는다.
    if (!row || row.status !== 'ok' || !row.verdict) continue;
    measured += 1;
    const rank = seatRank(String(row.verdict));
    if (rank === 0) {
      closed.push({ keyword: g.candidate.keyword, source: g.candidate.source, seat: String(row.verdict) });
      continue;
    }
    kept.push({
      rank,
      i: kept.length,
      pick: {
        ...g.candidate,
        seat: String(row.verdict),
        seatFacing: typeof row.facing === 'number' ? row.facing : null,
        seatVacancy: typeof row.vacancy === 'number' ? row.vacancy : null,
        seatReason: row.reason || '',
        measuredAt: row.measuredAt || new Date().toISOString(),
        fitReason: g.fitReason,
        myTopic: g.myTopic,
      },
    });
  }

  // 열림이 먼저. 같은 등급 안에서는 관문이 줄세운 순서를 그대로 둔다.
  const ordered = kept.slice().sort((a, b) => (b.rank - a.rank) || (a.i - b.i));
  const cut = Math.max(0, show);
  const picks = ordered.slice(0, cut).map((k) => k.pick);
  // 자리는 있었지만 셋이 차서 안 세운 것도 왜 안 세웠는지 남긴다.
  const spare = ordered.slice(cut).map((k) => ({ keyword: k.pick.keyword, source: k.pick.source, seat: k.pick.seat }));
  return { picks, rejected: closed.concat(spare), measured };
}

/** 자리를 잴 후보 중 경쟁 글 수를 모르는 것만 센다 — 카드에 적는 실측(오픈 API, 무료). 새 배열을 준다. */
async function withDocumentCounts(targets: readonly Gated[], say: (message: string) => void): Promise<Gated[]> {
  const missing = targets.filter((g) => g.candidate.documentCount === null).length;
  if (missing === 0) return [...targets];
  let count: ((keyword: string) => Promise<number | null>) | null = null;
  try {
    count = (await import('../../utils/naver-blog-api')).getNaverBlogDocumentCount;
  } catch {
    return [...targets];
  }
  const out: Gated[] = [];
  let done = 0;
  for (const g of targets) {
    if (g.candidate.documentCount !== null) {
      out.push(g);
      continue;
    }
    done += 1;
    say(`경쟁 글 수 세는 중 ${done}/${missing} · ${g.candidate.keyword}`);
    let measured: number | null = null;
    try { measured = await count(g.candidate.keyword); } catch { measured = null; }
    out.push({ ...g, candidate: { ...g.candidate, documentCount: typeof measured === 'number' ? measured : null } });
  }
  return out;
}

/* ────────────────────────────── 한 회차 ────────────────────────────── */

export interface DailyPickResult {
  builtAt: string;
  /** 봉투 기록(화면의 봉투 상자가 쓴다). 거르는 기준은 band 다. */
  envelope: BlogEnvelope | null;
  /** 30위 안에 붙어 본 검색량 범위 — 이번 회차가 거른 기준. */
  band: NearBand | null;
  /** 지금 내 블로그 — 잰 사실만 문장으로. 블로그를 안 쟀으면 빈 배열. */
  blogState: BlogStateLine[];
  /** 내 블로그 판 — 씨앗 수·찾은 말 수. */
  myBlog: { seeds: number; found: number };
  /** 관문에서 뺀 수 — 왜 줄었는지 화면이 말할 수 있게. */
  dropped: { offTopic: number; outOfBand: number; alreadyMine: number };
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
  const say = (message: string, done = 0, total = 0, keyword = '') => {
    if (!onProgress) return;
    try { onProgress({ done, total, keyword, message }); } catch { /* 듣는 쪽 사정 */ }
  };
  const record = readBlogRecord();
  const rows: WonRow[] = record && Array.isArray(record.wonRows) ? record.wonRows : [];
  const profile = buildProfile(record);
  const band = profile ? profile.band : null;
  const written = readWritten();

  let myBlog: { candidates: Candidate[]; seeds: number } = { candidates: [], seeds: 0 };
  let myBlogNote: string | null = null;
  if (profile && band) {
    try {
      myBlog = await findFromMyBlog(rows, profile, await realMyBlogDeps(), (message) => say(message));
    } catch (error: any) {
      myBlogNote = `내 블로그 말에서 찾지 못했어요: ${String((error && error.message) || error)}`;
    }
  } else if (profile) {
    myBlogNote = '30위 안에 든 검색어가 아직 없어 내 블로그 말에서는 못 찾았어요 — 표본을 늘려 다시 재 보세요';
  }

  const candidates = gatherCandidates(myBlog.candidates);
  const stats = gateWithStats(candidates, profile, written);
  const targets = await withDocumentCounts(stats.gated.slice(0, MEASURE_CAP), (message) => say(message));

  const picks: Picked[] = [];
  const rejected: DailyPickResult['rejected'] = [];
  let message: string | null = null;
  let measured = 0;

  if (targets.length > 0) {
    const batch = await measureKeywords(targets.map((g) => g.candidate.keyword), {
      // 통합검색까지 읽는다 — 안 읽으면 카드답을 열림으로 적는다.
      withStructure: true,
      onProgress: (p) => say(
        `자리 확인 ${p.done}/${p.total} · ${p.keyword}` + (p.verdict ? ` → ${p.verdict}` : ''),
        p.done, p.total, p.keyword,
      ),
    });
    message = batch.message;
    const chosen = selectPicks(targets, batch.rows as MeasuredRow[], SHOW);
    picks.push(...chosen.picks);
    rejected.push(...chosen.rejected);
    measured = chosen.measured;
  }

  const result: DailyPickResult = {
    builtAt: new Date().toISOString(),
    envelope: (record && record.envelope) || null,
    band,
    blogState: describeBlogState(record, band),
    myBlog: { seeds: myBlog.seeds, found: myBlog.candidates.length },
    dropped: { offTopic: stats.offTopic, outOfBand: stats.outOfBand, alreadyMine: stats.alreadyMine },
    gathered: candidates.length,
    afterGate: stats.gated.length,
    measured,
    picks,
    rejected,
    seconds: Math.round((Date.now() - started) / 1000),
    message: [myBlogNote, message].filter(Boolean).join(' · ') || null,
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
    ipcMain.handle('daily-pick-get', async () => {
      const record = readBlogRecord();
      const band = buildNearBand(record && Array.isArray(record.wonRows) ? record.wonRows : []);
      return {
        success: true,
        running,
        result: readJson<DailyPickResult | null>(U('daily-pick', 'latest.json'), null),
        envelope: (record && record.envelope) || null,
        band,
        blogState: describeBlogState(record, band),
      };
    });
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
