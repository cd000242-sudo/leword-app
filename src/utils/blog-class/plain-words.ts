/**
 * 사실 → 초보자가 읽는 말.
 *
 * 왜 따로 있나(사장님 2026-09-10 "결과는 초보자들도 쉽게 알 수 있게 해줘"):
 * 숫자만 보여주면 그게 큰지 작은지 초보자는 모른다. 그래서 **문장을 먼저 놓고 숫자는 그 문장 안에** 넣는다.
 * 문장은 전부 잰 값을 그대로 옮긴 것이다 — 판단·확률·점수는 한 줄도 만들지 않는다.
 *
 * 화면 규칙(하네스 5절):
 *   · '문서수'는 '경쟁 글', '정면 글'은 '같은 걸 다룬 글', '상위노출'은 '첫 페이지'로 부른다.
 *   · 못 잰 값은 그 문장을 아예 만들지 않는다. '0명'이라고 쓰지 않는다.
 *   · 모든 문장에 근거(언제·어디서 잰 값)가 따라붙어 화면이 그대로 물음표 도움말에 쓴다.
 */
import type { BlogActivity, BlogSnapshot } from './naver-blog-facts';

export interface PlainLine {
  /** 화면에 그대로 찍는 문장. */
  text: string;
  /** 물음표에 뜨는 근거 — "언제, 어디서 잰 값인가". */
  evidence: string;
}

export interface BlogFactsCard {
  /** 카드 맨 위 한 줄. 못 읽었으면 null. */
  headline: string | null;
  lines: PlainLine[];
  /** 지금 손봐야 하는 것. 없으면 빈 배열이고 화면은 그 칸을 숨긴다. */
  notices: PlainLine[];
}

export interface BlogFactsInput {
  snapshot: BlogSnapshot | null;
  activity: BlogActivity | null;
  /** sweepPosts 가 마지막 페이지에서 가져온 개설 시점. */
  oldestPostOn?: string | null;
  isInfluencer?: boolean | null;
  /** 이번에 실제로 훑은 글 수. activity.totalPosts 와 같지만 문장에서 '최근 N개'로 쓴다. */
  sampledPosts?: number;
  /**
   * 글 목록을 못 읽었나. 네이버 목록 창구는 가끔 장애 응답을 준다(실측 2026-09-10).
   * 이때 '글 0개'라고 말하면 거짓이다 — 글 관련 문장을 통째로 접고 다시 눌러 달라고만 한다.
   */
  postListUnavailable?: boolean;
  measuredAt?: string;
}

const KO = (value: number): string => value.toLocaleString('ko-KR');

/** '2010-03-24' → '2010년 3월'. 날짜가 없으면 null. */
export function monthLabel(isoDay: string | null | undefined): string | null {
  if (!isoDay) return null;
  const match = String(isoDay).match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}년 ${Number(match[2])}월`;
}

/** '2026-02-27' → '2월 27일'. 날짜가 없으면 null. */
export function dayLabel(isoDay: string | null | undefined): string | null {
  if (!isoDay) return null;
  const match = String(isoDay).match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${Number(match[1])}월 ${Number(match[2])}일`;
}

/** 발행 간격을 사람 말로. 0~1일은 '거의 매일', 그 위는 'N일에 한 편'. */
export function rhythmLabel(medianGapDays: number | null): string | null {
  if (medianGapDays == null) return null;
  if (medianGapDays <= 1) return '거의 매일 한 편씩 올려요';
  if (medianGapDays <= 14) return `보통 ${medianGapDays}일에 한 편씩 올려요`;
  if (medianGapDays <= 60) return `보통 ${Math.round(medianGapDays / 7)}주에 한 편씩 올려요`;
  return `보통 ${Math.round(medianGapDays / 30)}달에 한 편씩 올려요`;
}

/**
 * '로/으로' 고르기 — 받침이 없거나 ㄹ 받침이면 '로', 그 밖에는 '으로'.
 * 'IT·컴퓨터로'가 맞고 'IT·컴퓨터으로'는 틀리다. '음식으로'는 그 반대다.
 * 따옴표로 감싸기 **전의 말**로 골라야 한다 — 따옴표를 보고 고르면 전부 '로'가 된다.
 */
export function roParticle(word: string): '로' | '으로' {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글 음절이 아니면(영문·숫자·기호) 받침을 알 수 없으니 무난한 '로'로 둔다.
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '로';
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

function at(measuredAt: string | undefined, where: string): string {
  return measuredAt ? `${measuredAt} · ${where}` : where;
}

const WHERE_BLOG = '네이버 블로그 모바일 화면에서 읽음';
const WHERE_LIST = '네이버 블로그 글 목록에서 셈';
const WHERE_IN = 'in.naver.com 인플루언서 홈이 열리는지 확인';

/**
 * 블로그 사실 카드 — 체급(이긴 자리)이 붙기 전에도 혼자 쓸모 있는 첫 화면.
 * 문장을 못 만드는 값은 통째로 뺀다. 빈 자리를 '—'로 채우면 초보자는 그게 오류인 줄 안다.
 */
export function describeBlogFacts(input: BlogFactsInput): BlogFactsCard {
  const { snapshot, activity } = input;
  const measuredAt = input.measuredAt;
  const lines: PlainLine[] = [];
  const notices: PlainLine[] = [];

  if (input.postListUnavailable) {
    notices.push({
      text: '네이버 글 목록이 지금 열리지 않아요. 잠시 뒤에 다시 눌러 주세요.',
      evidence: at(measuredAt, `${WHERE_LIST} · 네이버가 장애 응답을 돌려줌`),
    });
  }

  const startedOn = monthLabel(input.oldestPostOn ?? activity?.oldestPostOn ?? null);
  const total = snapshot?.postCount ?? activity?.totalPosts ?? null;
  // 목록을 못 읽은 판에서 글 수 0 은 '없다'가 아니라 '모른다'다. 머리 문장을 만들지 않는다.
  const trustTotal = total != null && !(input.postListUnavailable && total === 0);
  const headline = trustTotal
    ? (startedOn
      ? `${startedOn}부터 글 ${KO(total!)}개를 썼어요.`
      : `지금까지 글 ${KO(total!)}개를 썼어요.`)
    : null;

  /*
   * 리듬 — 숫자마다 자기 창을 달고 나온다.
   *
   * 고치기 전 실측(2026-09-10 leadernam-): "최근 30일에 8개를 올렸어요. 거의 매일 한 편씩 올려요."
   * 30일에 8개는 거의 매일이 아니다. 앞 숫자는 최근 30일 창에서, 뒤 문장은 표본 전체 190일 창에서
   * 왔는데 한 문장으로 이어 붙어 서로를 반박했다. 반대 방향도 깨져 있었다
   * (30일에 30개인데 "보통 5일에 한 편"). 잰 값은 둘 다 진짜다 — 섞은 것이 거짓이었다.
   *
   * 그래서 최근 30일 리듬은 최근 30일 수에서만 뽑고, 표본 전체 리듬은 잰 기간을 밝혀 따로 적는다.
   * 둘이 같은 말이 되면 두 번째 줄은 만들지 않는다. 눈금은 rhythmLabel 하나만 쓴다.
   */
  if (activity && !input.postListUnavailable) {
    const recentRhythm = activity.recent30 > 0
      ? rhythmLabel(Math.max(1, Math.round(30 / activity.recent30)))
      : null;
    const recent = activity.recent30 > 0
      ? `최근 30일에 ${KO(activity.recent30)}개를 올렸어요.`
      : '최근 30일에 올린 글이 없어요.';
    lines.push({ text: recentRhythm ? `${recent} ${recentRhythm}.` : recent, evidence: at(measuredAt, WHERE_LIST) });

    const allRhythm = rhythmLabel(activity.medianGapDays);
    const from = dayLabel(activity.oldestPostOn);
    const to = dayLabel(activity.newestPostOn);
    if (allRhythm && allRhythm !== recentRhythm && from && to) {
      lines.push({
        text: `잰 글 ${KO(activity.totalPosts)}개 전체(${from}~${to})로는 ${allRhythm}.`,
        evidence: at(measuredAt, `${WHERE_LIST} · 글 사이 간격의 중간값`),
      });
    }
  }

  if (snapshot?.todayVisitors != null) {
    const neighbors = snapshot.subscribers != null ? `, 이웃 ${KO(snapshot.subscribers)}명` : '';
    lines.push({
      text: `오늘 방문자 ${KO(snapshot.todayVisitors)}명${neighbors}이에요.`,
      evidence: at(measuredAt, WHERE_BLOG),
    });
  }

  if (snapshot?.declaredTopic) {
    lines.push({
      text: `블로그 주제는 '${snapshot.declaredTopic}'${roParticle(snapshot.declaredTopic)} 되어 있어요.`,
      evidence: at(measuredAt, `${WHERE_BLOG} · 블로그 설정에서 고른 대표 주제`),
    });
  }

  if (input.isInfluencer === true) {
    lines.push({ text: '인플루언서로 등록돼 있어요.', evidence: at(measuredAt, WHERE_IN) });
  }

  // 검색 상태 — 여기부터는 '지금 손볼 수 있는 것'이라 알림 칸으로 간다.
  if (activity && activity.totalPosts > 0 && !input.postListUnavailable) {
    const sampled = input.sampledPosts ?? activity.totalPosts;
    const hidden = activity.totalPosts - activity.searchableCount;
    if (hidden > 0) {
      notices.push({
        text: `최근 ${KO(sampled)}개 중 ${KO(hidden)}개가 '검색 허용'이 꺼져 있어요. 그 글은 검색에 나오지 않아요.`,
        evidence: at(measuredAt, `${WHERE_LIST} · 글 설정의 검색 허용 값`),
      });
    } else {
      lines.push({
        text: `최근 ${KO(sampled)}개 글 모두 검색에 나올 수 있는 상태예요.`,
        evidence: at(measuredAt, `${WHERE_LIST} · 글 설정의 검색 허용 값`),
      });
    }
    if (activity.blockedCount > 0) {
      notices.push({
        text: `네이버가 막은 글이 ${KO(activity.blockedCount)}개 있어요.`,
        evidence: at(measuredAt, WHERE_LIST),
      });
    }
  }

  return { headline, lines, notices };
}
