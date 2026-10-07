/**
 * 글 한 편 유입 설계실 진행기(2026-10-06 사장님 승인 "진행") — 키워드 하나로 ①~④ 를 잇는다.
 *   ① 이길 수 있나: 검색량 · 문서수 · 1페이지 자리 실측 · 내 블로그 크기 판정 · 선점 보드에 있으면 그 행
 *   ② 제목: 검색용(1페이지 빈 틀, AI 없음) · 홈판용(내 구독 AI, 1페이지 제목 + 최근 뉴스 사실을 재료로)
 *   ③ 사람들이 궁금해하는 것: 검색 자동완성 · 연관 키워드(실측 검색량) + 최근 14일 지식인 · 카페(레이더 검색, 무료)
 *   ④ 돈: 모바일 파워링크 3위 입찰가(실측) · 관련 제휴 상품 후보
 * 재료는 주입받는다(post-plan.ts 가 실제 재료를 잇고, 테스트는 가짜를 끼운다).
 * 한 단계가 실패해도 나머지는 계속하고, 못 한 이유를 그 단계에 남긴다. 추정치(확률 · 예상 유입)는 만들지 않는다.
 */
import type { NearBand, RangeVerdict, CandidateSize } from '../utils/blog-class/envelope';
import { affiliateCandidates, filterByAnalysis, inflowSpots, questionChecklist, searchCuriosities, spaceOutKeyword, expansionRetryQueries, type PostPlan, type PostPlanStep } from '../utils/post-plan/post-plan-model';

/** 발행 후 유입에서 AI 가 한 번에 평가할 자리 수(실측: 147곳은 150초 안에 못 답함). */
const INFLOW_EVAL_LIMIT = 40;

export interface PlanSeat { verdict: string; facing: number | null; vacancy: number | null; topTitles: string[] }

export interface PostPlanDeps {
  volumes(keywords: string[]): Promise<Map<string, number | null>>;
  docs(keywords: string[]): Promise<Map<string, number | null>>;
  /** 자리 실측 + 검색용 제목(golden-writing-kit). */
  writingKit(keyword: string): Promise<{
    seed: { seat: string; facing: number | null; vacancy: number | null; topTitles: string[] } | null;
    titles: Array<{ text: string; kind: string; frameLabel: string; basis: string }>;
    message: string | null;
  }>;
  band(): NearBand | null;
  judgeRange(size: CandidateSize, band: NearBand | null): RangeVerdict;
  preemptionRow(keyword: string): Promise<{ tierLabel?: string; openSlot?: number | null; measuredAt?: string } | null>;
  news(keyword: string): Promise<string[]>;
  homefeedTitles(input: { keyword: string; question: string; uncovered: string[]; topTitles: string[]; whyNow: string; news?: string[] }): Promise<{ titles: string[]; note: string | null }>;
  /** 지식인 · 카페 최근 14일. extraQueries = 띄운 말 · 검색 궁금증 맨 위 말(함께 찾는다). */
  questions(keyword: string, extraQueries: string[]): Promise<Array<Record<string, any>>>;
  /** 자동완성 · 검색광고 연관어 + 실측 검색량(워커 keyword-expansions). */
  expansions(keyword: string): Promise<Array<{ keyword: string; searchVolume?: number | null; drifted?: boolean }>>;
  bid(keyword: string): Promise<number | null>;
  affiliateSnapshot(): Promise<any | null>;
}

const why = (error: unknown) => String((error as Error)?.message || error || '알 수 없는 오류').slice(0, 200);
/** 성공이면 value, 실패면 note(이유). 실패한 value 는 쓰지 않는다(ok 를 먼저 본다). */
interface Settled<T> { ok: boolean; value: T; note: string }
const settle = async <T>(work: () => Promise<T>): Promise<Settled<T>> => {
  try { return { ok: true, value: await work(), note: '' }; } catch (error) { return { ok: false, value: undefined as unknown as T, note: why(error) }; }
};

export async function runPostPlan(keywordRaw: string, deps: PostPlanDeps, say: (message: string) => void, now = Date.now()): Promise<PostPlan> {
  const keyword = String(keywordRaw || '').trim();
  if (!keyword) throw new Error('키워드를 넣어 주세요');
  const at = new Date(now).toISOString();
  const id = `plan-${now.toString(36)}`;

  say('① 이 키워드, 내가 이길 수 있나 — 검색량 · 문서수 · 1페이지 자리를 잽니다');
  // ③ 검색에서 궁금해하는 것 — 띄어쓰기 없는 긴 키워드는 확장이 0개라(실측) 띄운 말로 다시 찾는다(2026-10-07)
  const spaced = spaceOutKeyword(keyword);
  const searchesRun = settle(async () => {
    say('③ 사람들이 궁금해하는 것 — 검색 자동완성 · 연관 키워드 검색량을 봅니다');
    let items = await deps.expansions(keyword);
    for (const retry of expansionRetryQueries(keyword)) { if (items.length) break; items = await deps.expansions(retry); }
    return searchCuriosities(keyword, items, 10);
  });
  // 지식인 · 카페는 띄운 말 · 검색 궁금증 맨 위 말로도 함께 찾는다(검색 궁금증이 실패해도 키워드로는 찾는다)
  const alsoRun = searchesRun.then((s) => [...new Set([spaced, s.ok ? s.value[0]?.keyword : null].filter((x): x is string => Boolean(x)))]);
  const questionsRun = alsoRun.then((also) => settle(() => { say('③ 사람들이 실제로 물은 것 — 최근 14일 지식인 · 카페를 찾습니다'); return deps.questions(keyword, also); }));

  // ①(자리 실측은 이 PC 브라우저) · ③ · ④(네트워크)는 서로 기다릴 필요가 없다.
  const [volumes, docs, kit, preemption, searches, questions, also, bid, snapshot] = await Promise.all([
    settle(() => deps.volumes([keyword])),
    settle(() => deps.docs([keyword])),
    settle(() => deps.writingKit(keyword)),
    settle(() => deps.preemptionRow(keyword)),
    searchesRun,
    questionsRun,
    alsoRun,
    settle(() => deps.bid(keyword)),
    settle(() => deps.affiliateSnapshot()),
  ]);

  const searchVolume = volumes.ok ? (volumes.value.get(keyword) ?? null) : null;
  const documentCount = docs.ok ? (docs.value.get(keyword) ?? null) : null;
  const seat: PlanSeat | null = kit.ok && kit.value.seed
    ? { verdict: kit.value.seed.seat, facing: kit.value.seed.facing, vacancy: kit.value.seed.vacancy, topTitles: kit.value.seed.topTitles.slice(0, 10) }
    : null;
  const judge: PostPlanStep<unknown> = {
    ok: true,
    data: {
      searchVolume,
      volumeNote: volumes.ok ? null : volumes.note,
      documentCount,
      docsNote: docs.ok ? null : docs.note,
      seat,
      seatNote: kit.ok ? (kit.value.seed ? null : kit.value.message) : kit.note,
      range: deps.judgeRange({ searchVolume }, deps.band()),
      preemption: preemption.ok ? preemption.value : null,
    },
  };

  say('② 제목 — 검색용(1페이지 빈 틀) · 홈판용(1페이지 제목 + 최근 뉴스 사실로)');
  const news = await settle(() => deps.news(keyword));
  const homefeed = await settle(() => deps.homefeedTitles({
    keyword,
    question: '',
    uncovered: [],
    topTitles: seat ? seat.topTitles : [],
    whyNow: '',
    news: news.ok ? news.value.slice(0, 5) : [],
  }));
  const titles: PostPlanStep<unknown> = {
    ok: true,
    data: {
      search: kit.ok ? kit.value.titles.filter((t) => t.text).slice(0, 3).map((t) => ({ text: t.text, frameLabel: t.frameLabel, basis: t.basis })) : [],
      searchNote: kit.ok ? null : kit.note,
      homefeed: homefeed.ok ? homefeed.value.titles.slice(0, 3) : [],
      homefeedNote: homefeed.ok ? homefeed.value.note : homefeed.note,
      news: news.ok ? news.value.slice(0, 3) : [],
    },
  };

  const questionStep: PostPlanStep<unknown> = questions.ok
    ? { ok: true, data: questionChecklist(questions.value, 10, keyword, also) }
    : { ok: false, note: questions.note };
  const searchStep: PostPlanStep<unknown> = searches.ok ? { ok: true, data: searches.value } : { ok: false, note: searches.note };

  say('④ 돈 — 파워링크 입찰가 · 관련 제휴 상품');
  const money: PostPlanStep<unknown> = {
    ok: true,
    data: {
      bid: bid.ok ? bid.value : null,
      bidNote: bid.ok ? null : bid.note,
      affiliate: snapshot.ok ? affiliateCandidates(keyword, snapshot.value, 3) : [],
      affiliateNote: snapshot.ok ? null : snapshot.note,
    },
  };

  return { id, keyword, createdAt: at, updatedAt: at, steps: { judge, titles, searches: searchStep, questions: questionStep, money } };
}

/*
 * ⑤ 발행 후 유입(2026-10-06 2차) — 발행한 글 주소로 링크 달 자리를 찾는다.
 *   글 분석(내 구독 AI, 워커가 근거 · 프롬프트) → 그 질의로 레이더 검색(지식인 · 카페 무료, 커뮤니티는 켰을 때만)
 *   → 판 평가(내 구독 AI) → 지금 답하면 유입 / 지켜볼 자리. 자리마다 답변 초안은 눌렀을 때만 만든다. 게시는 사람이 한다.
 */
export interface InflowAnalysis { title?: string; moneyAngle?: string; queries?: string[]; coreKeywords?: Array<{ keyword: string }>; shortQueries?: string[] }

export interface InflowDeps {
  analyze(postUrl: string): Promise<InflowAnalysis>;
  search(analysis: InflowAnalysis, withCommunity: boolean): Promise<{ items: Array<Record<string, any>>; communityNote: string | null }>;
  evaluate(items: Array<Record<string, any>>, analysis: InflowAnalysis): Promise<Array<Record<string, any>>>;
  questionBody(link: string): Promise<string>;
  answer(input: { title: string; body?: string; withLink: boolean; blogUrl?: string }): Promise<{ answer: string }>;
}

export async function runInflow(plan: PostPlan, postUrlRaw: string, deps: InflowDeps, say: (message: string) => void, options: { withCommunity: boolean }): Promise<PostPlan> {
  const postUrl = String(postUrlRaw || '').trim();
  if (!/^https?:\/\/\S+$/i.test(postUrl)) throw new Error('발행한 글 주소(https://…)를 넣어 주세요');
  say('⑤ 글을 읽고 무엇에 답하는 글인지 분석합니다(내 구독 AI)');
  const analysis = await deps.analyze(postUrl);
  say(options.withCommunity ? '⑤ 최근 14일 지식인 · 카페 · 커뮤니티에서 같은 문제를 가진 사람을 찾습니다' : '⑤ 최근 14일 지식인 · 카페에서 같은 문제를 가진 사람을 찾습니다');
  const found = await deps.search(analysis, options.withCommunity);
  /*
   * 관련 없는 글은 평가 전에 뺀다(실주행 '우리들의 발라드2' 글: 147곳 중 '신용대출' · '임신 중 퇴사'가 섞였다).
   * 평가는 최근 순 INFLOW_EVAL_LIMIT 곳만 — 147곳을 한 번에 물으면 AI 가 150초 안에 못 답했다(실측). 나머지는 '평가 밖'.
   */
  const when = (item: Record<string, any>) => Date.parse(item.postedAt || `${item.postdate}T00:00:00+09:00`) || 0;
  const relevant = filterByAnalysis(found.items, analysis).sort((a, b) => when(b) - when(a));
  const toEvaluate = relevant.slice(0, INFLOW_EVAL_LIMIT);
  say(`⑤ 찾은 ${found.items.length}곳 중 내 글과 관련된 ${relevant.length}곳 — ${toEvaluate.length}곳을 평가합니다(내 구독 AI)`);
  const evaluated = await settle(() => (toEvaluate.length ? deps.evaluate(toEvaluate, analysis) : Promise.resolve([])));
  const sorted = inflowSpots(toEvaluate, evaluated.ok ? evaluated.value : []);
  const beyond = inflowSpots(relevant.slice(INFLOW_EVAL_LIMIT), []).unrated;
  const inflow: PostPlanStep<unknown> = {
    ok: true,
    data: {
      postUrl,
      // 워커가 준 제목은 HTML 기호(&quot; 등)가 그대로라 화면에 '&quot;'가 찍혔다 — 풀고, '네이버 블로그' 꼬리를 뗀다.
      postTitle: String(analysis.title || '')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\s*:\s*네이버 블로그\s*$/, ''),
      searchedWith: (analysis.coreKeywords || []).map((k) => k.keyword).slice(0, 6),
      found: found.items.length,
      relevant: relevant.length,
      spots: sorted.spots,
      unrated: [...sorted.unrated, ...beyond],
      skipped: sorted.skipped,
      skippedSpots: sorted.skippedSpots,
      evaluateNote: evaluated.ok ? null : evaluated.note,
      communityNote: found.communityNote,
      answers: {},
    },
  };
  return { ...plan, updatedAt: new Date().toISOString(), steps: { ...plan.steps, inflow } };
}

/** 자리 하나의 답변 초안 — 지식인은 질문 본문까지 읽는다. 링크 금지 판은 링크 없이 쓴다(내 구독 AI). */
export async function draftAnswer(spot: { title: string; link: string; source: string; linkPolicy: string }, postUrl: string, deps: InflowDeps): Promise<string> {
  const body = spot.source === 'kin' ? await deps.questionBody(spot.link).catch(() => '') : '';
  const result = await deps.answer({ title: spot.title, body, withLink: spot.linkPolicy !== 'banned', blogUrl: postUrl });
  return String(result.answer || '').trim();
}

/*
 * ⑥ 결과 확인(2026-10-06 3차) — 글 주소를 넣은 순간을 발행 시점으로 보고, 3일 · 7일 뒤 실제 순위(블로그탭 data-url)와
 * 어드바이저 홈판 유입을 '고를 때 판정' 옆에 남긴다. 잴 차례가 아니면 순위는 재지 않는다(홈판 유입만 갱신).
 */
export interface ResultDeps {
  rank(keyword: string, postUrl: string): Promise<{ status: string; rank: number | null; sampled: number }>;
  advisorLatest(): any;
}

/** 결과 칸 시작 — 이미 있으면 등록 시각은 그대로(같은 글 다시 찾기). */
export function startResult(plan: PostPlan, now = Date.now()): PostPlan {
  const inflow: any = plan.steps.inflow?.data;
  if (!inflow?.postUrl) return plan;
  const prev: any = plan.steps.result?.data;
  if (prev && prev.postUrl === inflow.postUrl) return plan;
  const judge: any = plan.steps.judge?.data || {};
  const data = {
    registeredAt: new Date(now).toISOString(),
    postUrl: inflow.postUrl,
    postTitle: inflow.postTitle || '',
    pick: { seat: judge.seat?.verdict ?? null, facing: judge.seat?.facing ?? null, searchVolume: judge.searchVolume ?? null, range: judge.range?.verdict ?? null },
    checks: [] as Array<Record<string, unknown>>,
    latest: null,
    homefeed: null,
  };
  return { ...plan, steps: { ...plan.steps, result: { ok: true, data } } };
}

export async function checkPlanResult(plan: PostPlan, deps: ResultDeps, now = Date.now(), options: { force?: boolean } = {}): Promise<PostPlan> {
  const result: any = plan.steps.result?.data;
  if (!result?.postUrl) return plan;
  const { dueResultChecks, homefeedForPost } = await import('../utils/post-plan/post-plan-result');
  const at = new Date(now).toISOString();
  const due = dueResultChecks(result, now);
  let checks = [...(result.checks || [])];
  let latest = result.latest || null;
  let lastError: string | null = result.lastError || null;
  if (due.length || options.force) {
    const measured = await settle(() => deps.rank(plan.keyword, result.postUrl));
    const row = measured.ok
      ? { at, rank: measured.value.rank, sampled: measured.value.sampled, status: measured.value.status }
      : { at, rank: null, sampled: 0, status: `error: ${measured.note}` };
    if (options.force) latest = row;
    // 차단 · 오류는 그날 확인으로 치지 않는다 — 기록하지 않고 다음 회차(1시간 뒤)에 다시 잰다.
    else if (row.status === 'ok') { checks = [...checks, ...due.map((day) => ({ day, ...row }))]; lastError = null; }
    else lastError = `${at} ${row.status}`;
  }
  const homefeed = homefeedForPost(deps.advisorLatest(), result.postUrl) || result.homefeed || null;
  return { ...plan, updatedAt: at, steps: { ...plan.steps, result: { ok: true, data: { ...result, checks, latest, homefeed, lastError } } } };
}
