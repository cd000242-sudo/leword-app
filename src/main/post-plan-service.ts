/**
 * 글 한 편 유입 설계실 진행기(2026-10-06 사장님 승인 "진행") — 키워드 하나로 ①~④ 를 잇는다.
 *   ① 이길 수 있나: 검색량 · 문서수 · 1페이지 자리 실측 · 내 블로그 크기 판정 · 선점 보드에 있으면 그 행
 *   ② 제목: 검색용(1페이지 빈 틀, AI 없음) · 홈판용(내 구독 AI, 1페이지 제목 + 최근 뉴스 사실을 재료로)
 *   ③ 사람들이 실제로 물은 것: 최근 14일 지식인 · 카페(레이더 검색, 무료)
 *   ④ 돈: 모바일 파워링크 3위 입찰가(실측) · 관련 제휴 상품 후보
 * 재료는 주입받는다(post-plan.ts 가 실제 재료를 잇고, 테스트는 가짜를 끼운다).
 * 한 단계가 실패해도 나머지는 계속하고, 못 한 이유를 그 단계에 남긴다. 추정치(확률 · 예상 유입)는 만들지 않는다.
 */
import type { NearBand, RangeVerdict, CandidateSize } from '../utils/blog-class/envelope';
import { affiliateCandidates, questionChecklist, type PostPlan, type PostPlanStep } from '../utils/post-plan/post-plan-model';

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
  questions(keyword: string): Promise<Array<Record<string, any>>>;
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
  // ①(자리 실측은 이 PC 브라우저) · ③ · ④(네트워크)는 서로 기다릴 필요가 없다.
  const [volumes, docs, kit, preemption, questions, bid, snapshot] = await Promise.all([
    settle(() => deps.volumes([keyword])),
    settle(() => deps.docs([keyword])),
    settle(() => deps.writingKit(keyword)),
    settle(() => deps.preemptionRow(keyword)),
    settle(() => { say('③ 사람들이 실제로 물은 것 — 최근 14일 지식인 · 카페를 찾습니다'); return deps.questions(keyword); }),
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
    ? { ok: true, data: questionChecklist(questions.value, 10, keyword) }
    : { ok: false, note: questions.note };

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

  return { id, keyword, createdAt: at, updatedAt: at, steps: { judge, titles, questions: questionStep, money } };
}
