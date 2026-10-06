/**
 * 오늘 쓸 한 편 하이브리드 — 데이터 받기 · 각도 넓히기 · 홈판 제목(2026-10-06).
 *
 * 사장님: "내 블로그를 분석했으면 내 주제와 내 체급에 맞는 황금키워드를 오늘 쓸 한 편에 담아 추천 ·
 * 누가 김민 배우 프로필로 홈판 글을 쓰냐 · 홈판에 맞는 자극적이면서 클릭을 부르는 제목을 줘야 ·
 * 다른 사람들이 건들지 않거나 간과하는 영역을 건드리면 확률이 높다".
 *
 * 하는 일
 *   1. 후보를 더 모은다 — 홈판 벤치마크(내 주제 분야에서 여러 채널이 같이 다루는 소재) · 어드바이저 트렌드(내 주제 순위 상승)
 *   2. 머리말에서 사람들이 실제로 묻는 각도를 자동완성으로 찾고 검색량을 잰다(내 크기 안만)
 *   3. 고른 카드마다 홈판 제목 3개 — 내 구독 AI(클로드 → 코덱스 → agy). 막히면 빈 칸과 이유(템플릿으로 채우지 않는다)
 * 판정 · 순서는 daily-pick.ts 그대로(관문 → 문서수 → 자리 실측 → 고르기).
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { benchmarkCategoryOf, coverageGap, isNotWritable, pickAngles, whyNowLine, type CoverageGap } from '../../utils/today-hybrid';

const U = (...p: string[]) => path.join(app.getPath('userData'), ...p);
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** daily-pick.ts Candidate 와 같은 모양(순환 import 를 피하려 여기서 모양만 맞춘다). */
export interface HybridCandidate {
  keyword: string;
  source: any;
  topic: string;
  searchVolume: number | null;
  documentCount: number | null;
  facing: number | null;
  vacancy: number | null;
  titles: Array<{ label: string; text: string }>;
  related: Array<{ keyword: string; searchVolume: number | null; open: boolean }>;
  why: string;
  facts: Array<{ title: string; press: string; link: string }>;
  /** 하이브리드 — 각도(머리말 · 궁금증) · 왜 지금. */
  angle?: { head: string; question: string };
  whyNow?: string;
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

/** 벤치마크 소재의 머리말 — 제목 낱말 앞 2개(숫자 · 날짜 · 영문 해시 같은 잡음은 뺀다). */
function headOf(keyword: string): string {
  const parts = String(keyword || '').split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !/^[a-z0-9_]{6,}$/i.test(w));
  return parts.slice(0, 2).join(' ');
}

/**
 * 홈판 벤치마크 판에서 내 주제 분야 소재 — 채널 2곳 이상이 같이 다룬 것만(1곳은 '지금 뜬다'의 근거가 아니다).
 * 판은 pullPublished 가 사이트에서 받아 둔 daily-pick/homefeed-benchmarks.json.
 */
export function fromBenchmark(declaredTopic: string | null): HybridCandidate[] {
  const board = readJson<any>(U('daily-pick', 'homefeed-benchmarks.json'), null);
  const category = benchmarkCategoryOf(declaredTopic);
  const rows: any[] = board && Array.isArray(board.candidates) ? board.candidates : [];
  const out: HybridCandidate[] = [];
  for (const c of rows) {
    if (category && c.category !== category) continue;
    const channels = new Set((c.sources || []).map((s: any) => s && (s.id || s.name))).size;
    if (channels < 2) continue;
    const keyword = headOf(c.keyword || c.title);
    if (keyword.length < 2 || isNotWritable(keyword)) continue;
    out.push({
      keyword, source: '홈판 벤치마크', topic: declaredTopic || '', searchVolume: null, documentCount: null, facing: null, vacancy: null,
      titles: (Array.isArray(c.homeTitles) ? c.homeTitles : []).slice(0, 2).map((t: string) => ({ label: '벤치마크 초안', text: String(t) })),
      related: [], why: `홈판 벤치마크 블로그 ${channels}곳이 같이 다룬 소재 — "${String(c.title || '').slice(0, 60)}"`,
      facts: [], whyNow: whyNowLine({ channels }),
    });
  }
  return out.slice(0, 20);
}

/** 어드바이저 '오늘 쓸 글 10' 후보 중 글로 쓸 수 있는 말 — 트렌드 순위 상승을 '왜 지금'으로 붙인다. */
export function fromAdvisorTrend(readPlan: () => any | null): HybridCandidate[] {
  const plan = readPlan();
  const rows: any[] = plan && Array.isArray(plan.keywords) ? plan.keywords : [];
  return rows
    .filter((k) => k && k.keyword && !isNotWritable(String(k.keyword)))
    .map((k) => ({
      keyword: String(k.keyword), source: '어드바이저 트렌드', topic: String(k.topic || ''),
      searchVolume: num(k.searchVolume), documentCount: null, facing: null, vacancy: null, titles: [], related: [],
      why: `어제(${plan.day}) 내 주제 트렌드 검색어`, facts: [],
      whyNow: whyNowLine({ rankChange: num(k.rankChange) }),
    }));
}

export interface AngleDeps {
  autocomplete(head: string): Promise<string[]>;
  volumes(keywords: string[]): Promise<Map<string, number | null>>;
}

/**
 * 머리말마다 사람들이 실제로 묻는 각도를 찾는다(자동완성 → 검색량 → pickAngles). 머리말은 heads 앞에서 maxHeads 개.
 * 각도는 머리말 후보의 '왜 지금'을 물려받는다 — 소재가 뜬 근거는 머리말에 있다.
 */
export async function expandAngles(
  heads: readonly HybridCandidate[],
  band: { volumeMin: number; volumeMax: number } | null,
  deps: AngleDeps,
  say: (message: string) => void = () => {},
  maxHeads = 6,
): Promise<HybridCandidate[]> {
  const out: HybridCandidate[] = [];
  const seenHead = new Set<string>();
  for (const h of heads) {
    // 자동완성은 두 낱말 머리말에서 잘 나온다(실측 2026-10-06: '나나 탑' → 디스패치 · 뮤비 · 사주, '서강준 안은진 드라마' → 거의 없음).
    const head = h.keyword.trim().split(/\s+/).slice(0, 2).join(' ');
    if (head.length < 2 || seenHead.has(head) || seenHead.size >= maxHeads) continue;
    seenHead.add(head);
    say(`'${head}'에서 사람들이 묻는 말 찾는 중`);
    let suggestions: string[] = [];
    try { suggestions = (await deps.autocomplete(head)).filter((s) => s.replace(/\s+/g, '').includes(head.replace(/\s+/g, ''))).slice(0, 15); } catch { suggestions = []; }
    if (!suggestions.length) continue;
    let volumes = new Map<string, number | null>();
    try { volumes = await deps.volumes(suggestions); } catch { continue; }
    for (const a of pickAngles(head, suggestions, volumes, band, 4)) {
      out.push({
        ...h, keyword: a.keyword, searchVolume: a.searchVolume, documentCount: null, facing: null, vacancy: null,
        titles: [], related: [], facts: [],
        why: `'${head}'를 찾는 사람들이 이어서 묻는 말 — "${a.question || a.keyword}"`,
        angle: { head, question: a.question },
      });
    }
  }
  return out;
}

export interface TitleInput { keyword: string; question: string; uncovered: string[]; topTitles: string[]; whyNow: string; news?: string[] }

/**
 * 고른 카드마다 홈판 제목 3개 — 내 구독 AI 한 번에 묶어서. 실패하면 빈 Map 과 이유(템플릿으로 채우지 않는다).
 * 규칙은 홈판 제목 교리(homefeedTitleRuleLines) + 실제 홈판 본보기. 사실은 지어내지 않는다.
 */
export async function homefeedTitlesFor(items: readonly TitleInput[]): Promise<{ titles: Map<string, string[]>; note: string | null }> {
  if (!items.length) return { titles: new Map(), note: null };
  const { homefeedTitleRuleLines, feedTitleSamples, homefeedTitleSurfaceReasons } = await import('../../utils/benchmark-title-engine');
  const { runWithAnyAgent } = await import('../../utils/agent-cli/runAny');
  const { createDefaultAgentChain } = await import('../../utils/agent-cli/defaultChain');
  const prompt = [
    '너는 네이버 홈판(홈피드) 제목을 쓰는 편집자다. 키워드마다 홈판 제목 3개를 쓴다.',
    ...homefeedTitleRuleLines(),
    '- 독자의 걱정 · 손해 · 궁금증을 세게 찌른다. 감정 과장은 되지만, 아래 재료에 없는 수치 · 사실 · 사건은 지어내지 마라.',
    '- "남들이 안 다룬 낱말"이 있으면 그 궁금증을 제목의 후킹으로 쓴다(답은 숨긴다).',
    '- 죽음 · 병 · 사고 · 범죄 · 논란은 "최근 뉴스 제목"에 있는 사실로만 쓴다. "~설"로 꾸미거나 뉴스에 없는 상태(사망 · 투병 등)를 지어내지 마라. 뉴스가 없으면 그 키워드 제목은 빈 배열로 둔다.',
    '실제 홈판에 뜬 제목 본보기:',
    ...feedTitleSamples(12).map((s) => `- ${s}`),
    '',
    '재료(키워드별):',
    ...items.map((it) => `- 키워드: ${it.keyword} | 사람들이 궁금한 것: ${it.question || '—'} | 상위 글이 안 다룬 낱말: ${it.uncovered.join(', ') || '없음'} | 지금 상위 제목: ${it.topTitles.slice(0, 3).join(' / ') || '못 읽음'} | 최근 뉴스 제목: ${(it.news || []).slice(0, 3).join(' / ') || '없음'} | 왜 지금: ${it.whyNow || '—'}`),
    '',
    '출력은 JSON 한 줄만: {"titles":{"키워드":["제목1","제목2","제목3"]}}',
  ].join('\n');
  let parsed: Record<string, string[]> | null = null;
  try {
    await runWithAnyAgent(prompt, createDefaultAgentChain({ claudeModel: 'sonnet' }), {
      timeoutMs: 120_000,
      deadlineMs: 150_000,
      validate: (reply) => {
        const m = reply.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[0]) : null;
        if (!obj || typeof obj.titles !== 'object') throw new Error('제목 JSON 형식이 아니다');
        parsed = obj.titles;
      },
    });
  } catch (error: any) {
    const reason = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 200);
    return { titles: new Map(), note: `AI 엔진이 제목을 못 만들었어요 — ${reason}` };
  }
  const titles = new Map<string, string[]>();
  for (const it of items) {
    const list = ((parsed as Record<string, string[]> | null)?.[it.keyword] || []).map((t) => String(t).trim())
      .filter((t) => t && homefeedTitleSurfaceReasons(t).length === 0).slice(0, 3);
    if (list.length) titles.set(it.keyword, list);
  }
  return { titles, note: null };
}

const flatKw = (s: string) => String(s || '').replace(/\s+/g, '').toLowerCase();

/*
 * 홈판용 카드(2026-10-06 실주행: 연예 블로그의 각도 14개가 전부 검색 자리 '잠김'이라 0장이었다).
 * 홈판은 검색 1페이지와 다른 길이다 — 지금 뜨는 소재(벤치마크 · 트렌드)에서 남들이 안 다룬 각도를 고른다.
 * 카드답은 빼고, 빈 각도가 있는 것 → 지금 뜬 근거가 있는 것 순. 검색 자리는 참고로 적는다.
 * targets 는 daily-pick 의 Gated(candidate · fitReason · myTopic), rows 는 자리 실측 행.
 */
/** 각도 낱말을 담은 상위 글 비율의 최솟값(0 = 아무도 안 다룸, 1 = 전부 다룸). 제목을 못 읽었으면 1. */
function coverageRatio(gap: CoverageGap): number {
  if (!gap.sampled || !gap.terms.length) return 1;
  return Math.min(...gap.terms.map((t) => (gap.covered[t] || 0) / gap.sampled));
}

export function selectHomefeedPicks(targets: readonly any[], rows: readonly any[], already: ReadonlySet<string>, cap = 3): any[] {
  const rowByKw = new Map(rows.map((r) => [flatKw(r.keyword), r]));
  return targets
    .filter((g) => g.candidate.angle && !already.has(flatKw(g.candidate.keyword)))
    .map((g) => ({ g, row: rowByKw.get(flatKw(g.candidate.keyword)) }))
    .filter(({ row }) => row && row.status === 'ok' && row.verdict && row.verdict !== '카드답')
    .map(({ g, row }) => ({ g, row, gap: coverageGap(g.candidate.keyword, g.candidate.angle.head, Array.isArray(row.topTitles) ? row.topTitles : []) }))
    // 아무도 안 다룬 각도 → 덜 다룬 각도(각도 낱말을 담은 상위 글 비율이 낮은 것) → 지금 뜬 근거가 있는 것.
    .sort((a, b) => (b.gap.uncovered.length > 0 ? 1 : 0) - (a.gap.uncovered.length > 0 ? 1 : 0)
      || coverageRatio(a.gap) - coverageRatio(b.gap)
      || (b.g.candidate.whyNow ? 1 : 0) - (a.g.candidate.whyNow ? 1 : 0))
    // 머리말마다 1장 — 한 인물 · 소재가 칸을 다 먹지 않게(실주행: 3장 모두 '김민').
    .filter((x, i, arr) => arr.findIndex((y) => flatKw(y.g.candidate.angle.head.split(/\s+/)[0]) === flatKw(x.g.candidate.angle.head.split(/\s+/)[0])) === i)
    .slice(0, cap)
    .map(({ g, row, gap }) => ({
      ...g.candidate,
      seat: String(row.verdict),
      seatFacing: typeof row.facing === 'number' ? row.facing : null,
      seatVacancy: typeof row.vacancy === 'number' ? row.vacancy : null,
      seatReason: row.reason || '',
      measuredAt: row.measuredAt || new Date().toISOString(),
      fitReason: g.fitReason,
      myTopic: g.myTopic,
      gap,
      lane: '홈판',
    }));
}

/** 네이버 오픈 API(사용자 키, 무료) 검색 결과 제목 — 종류(news · blog)별. 키가 없거나 실패하면 빈 Map. */
async function openApiTitles(kind: 'news' | 'blog', keywords: readonly string[], display: number, sort: 'date' | 'sim'): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const { EnvironmentManager } = await import('../../utils/environment-manager');
    const manager: any = typeof (EnvironmentManager as any).getInstance === 'function' ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
    const cfg = manager.getConfig() || {};
    const id = cfg.naverClientId || process.env.NAVER_CLIENT_ID || '';
    const secret = cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '';
    if (!id || !secret) return out;
    const { naverApiFetch } = await import('../../utils/naver-api-hub');
    for (const keyword of keywords) {
      try {
        const res = await naverApiFetch(`https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=${sort}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
        if (!res.ok) continue;
        const body = (await res.json()) as { items?: Array<{ title?: string }> };
        out.set(keyword, (body.items || []).map((i) => String(i.title || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()).filter(Boolean));
      } catch { /* 한 키워드 실패는 넘긴다 */ }
    }
  } catch { /* 설정을 못 읽으면 빈손 */ }
  return out;
}

/** 카드마다 최근 뉴스 제목 3개 — 제목의 사실 재료. */
export async function newsTitlesFor(keywords: readonly string[]): Promise<Map<string, string[]>> {
  const map = await openApiTitles('news', keywords, 5, 'date');
  return new Map([...map].map(([k, v]) => [k, v.slice(0, 3)]));
}

/*
 * 자리 실측 전에 각도를 '덜 다룬 순'으로 줄 세운다(2026-10-06 — 자리를 14개만 재서 빈 각도를 못 찾았다).
 * 블로그 검색 상위 10개 제목(오픈 API, 무료 · 빠름)으로 각도 낱말을 담은 글 수를 세고,
 * 아무도 안 다룬 것 → 덜 다룬 것 순. 오픈 API 순서는 실제 노출 순위와 다를 수 있어 '미리 거르기'에만 쓴다 —
 * 카드의 빈 각도는 자리 실측이 읽은 제목으로 다시 센다.
 */
export async function rankAnglesByCoverage(angles: readonly HybridCandidate[]): Promise<HybridCandidate[]> {
  if (!angles.length) return [];
  const titles = await openApiTitles('blog', angles.map((a) => a.keyword), 10, 'sim');
  const scored = angles.map((a, i) => {
    const gap = coverageGap(a.keyword, a.angle ? a.angle.head : '', titles.get(a.keyword) || []);
    return { a, i, open: gap.uncovered.length > 0 ? 1 : 0, ratio: coverageRatio(gap) };
  });
  return scored.sort((x, y) => y.open - x.open || x.ratio - y.ratio || x.i - y.i).map((x) => x.a);
}

export type { CoverageGap };
