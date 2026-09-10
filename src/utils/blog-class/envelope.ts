/**
 * 내가 이겨본 크기 — "봉투".
 *
 * 사장님 2026-09-10 "초보자들에게 엄청난 도움을 주는 게 목적이야".
 *
 * 왜 이게 제일 필요한가: 자리가 열렸다는 판정은 **누구 기준의 자리인지**를 말하지 않는다.
 * 문서 8,000개짜리 자리가 '열림'으로 나와도, 어제 블로그를 만든 사람과 1,000개 쓴 사람에게
 * 같은 뜻일 리가 없다. 초보자는 그걸 모르고 덤볐다가 안 되면 도구를 탓하거나 자기를 탓한다.
 *
 * 그래서 남의 기준이 아니라 **내가 실제로 이긴 기록**으로 거른다.
 * 봉투 = 1페이지에 든 검색어들에서 뽑은 한계선 몇 개. 점수가 아니라 사실의 최대·중앙값이다.
 *
 * 규칙(전부 세거나 뺀 값이다. 지어낸 계수는 없다):
 *   docMax     이겨본 문서수의 최대 — "여기까지는 이겨봤다"
 *   docP50     그 중앙값 — 한 번 요행으로 이긴 큰 자리를 구분한다
 *   facingMax  같은 걸 다룬 글이 몇 개 있어도 이겼나
 *   내 범위 안 = 문서수 ≤ docMax 이고 정면 글 ≤ facingMax
 * 이긴 기록이 없으면 봉투를 만들지 않는다(null). 기본값을 지어내지 않는다 —
 * 지어낸 기준으로 "네 크기다"라고 말하는 것이 아무 말 안 하는 것보다 나쁘다.
 */

/** 내 글 하나가 어떤 검색어에서 몇 위였나 — 실측만. */
export interface WonRow {
  keyword: string;
  /** 블로그 탭 순위(1부터). 못 쟀으면 null. */
  blogRank: number | null;
  /** 통합검색 순위. 못 쟀으면 null — '이겼다'의 기준은 블로그 탭이다. */
  allRank?: number | null;
  searchVolume: number | null;
  documentCount: number | null;
  /** 그 자리 상위 10에서 같은 걸 정면으로 다룬 글 수. 못 쟀으면 null. */
  facing: number | null;
  /** 이 검색어로 1페이지에 든 내 글. */
  postUrl?: string;
  topic?: string | null;
  publishedOn?: string | null;
}

export interface BlogEnvelope {
  /** 1페이지(블로그 탭 10위 안)에 든 (검색어, 글) 쌍의 수. */
  wonCount: number;
  /** 순위를 실제로 잰 검색어 수 — 승률의 분모다. */
  measuredCount: number;
  docMax: number;
  docP50: number;
  facingMax: number;
  volumeMin: number;
  volumeMax: number;
  /** 이긴 주제와 건수 — 많은 순. */
  topics: Array<{ topic: string; count: number }>;
}

/** 1페이지 = 블로그 탭 10위 안. 통합검색은 별도로 보여 주되 '이겼다'의 기준으로 쓰지 않는다. */
export const WON_RANK = 10;

export function isWon(row: WonRow): boolean {
  return typeof row.blogRank === 'number' && row.blogRank >= 1 && row.blogRank <= WON_RANK;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 봉투 만들기. 이긴 기록이 없으면 null — 그때는 화면이 "아직 이긴 기록이 없어요"라고만 말한다.
 * 문서수를 못 잰 이긴 행은 한계선 계산에서 빠진다(그 행이 얼마짜리였는지 모르니까).
 */
export function buildEnvelope(rows: readonly WonRow[]): BlogEnvelope | null {
  const measured = rows.filter((row) => typeof row.blogRank === 'number');
  const won = rows.filter(isWon);
  if (won.length === 0) return null;

  const docs = won.map((row) => row.documentCount).filter((v): v is number => typeof v === 'number');
  /*
   * 크기를 말할 근거가 없으면 봉투를 만들지 않는다.
   *
   * 전에는 docs 가 비면 docMax 를 0 으로 뒀다. 그러면 judgeRange 의 `documentCount > docMax` 가
   * **문서수 1개짜리 후보까지 전부 '범위 밖'** 으로 떨군다. 화면에는 초록 봉투 상자가 멀쩡히 떠 있고
   * 결과만 통째로 비어서 원인이 안 보인다. 0 은 기본값이지 실측이 아니다 —
   * 이 파일이 이긴 기록 없을 때 null 을 주는 것과 같은 이유로 여기서도 null 을 준다.
   * (이긴 행의 문서수는 순위 실측의 마지막 단계에서 채워진다. 그 단계 전에 저장된 중간 결과도 여기로 온다.)
   */
  if (docs.length === 0) return null;
  const facings = won.map((row) => row.facing).filter((v): v is number => typeof v === 'number');
  const volumes = won.map((row) => row.searchVolume).filter((v): v is number => typeof v === 'number');

  const topicCount = new Map<string, number>();
  for (const row of won) {
    const topic = (row.topic || '').trim();
    if (!topic) continue;
    topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
  }

  return {
    wonCount: won.length,
    measuredCount: measured.length,
    docMax: docs.length > 0 ? Math.max(...docs) : 0,
    docP50: docs.length > 0 ? median(docs) : 0,
    facingMax: facings.length > 0 ? Math.max(...facings) : 0,
    volumeMin: volumes.length > 0 ? Math.min(...volumes) : 0,
    volumeMax: volumes.length > 0 ? Math.max(...volumes) : 0,
    topics: [...topicCount.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 3),
  };
}

/** 발굴 결과 한 줄이 내 범위 안인지 볼 때 필요한 값. 못 잰 칸은 null. */
export interface CandidateSize {
  documentCount: number | null;
  facing?: number | null;
  topic?: string | null;
}

export interface RangeVerdict {
  /** 'in' 내가 이겨본 크기 · 'out' 이겨본 적 없는 크기 · 'unknown' 견줄 수 없음 */
  verdict: 'in' | 'out' | 'unknown';
  /** 화면에 그대로 찍는 한 줄. 숫자를 근거로 담는다. */
  reason: string;
  /** 이긴 적 있는 주제인가. 봉투에 주제가 없거나 후보 주제를 모르면 false. */
  myTopic: boolean;
}

const KO = (value: number) => value.toLocaleString('ko-KR');

/**
 * 후보 하나를 내 봉투와 견준다.
 *
 * 판단이 아니라 **대조**다 — "추천"·"쉬움" 같은 말을 만들지 않는다(약속으로 읽힌다).
 * 봉투가 없거나 후보의 문서수를 못 쟀으면 'unknown'이고, 화면은 배지를 안 붙인다.
 */
export function judgeRange(candidate: CandidateSize, envelope: BlogEnvelope | null): RangeVerdict {
  const topic = (candidate.topic || '').trim();
  const myTopic = Boolean(envelope && topic && envelope.topics.some((t) => t.topic === topic));

  if (!envelope) return { verdict: 'unknown', reason: '아직 첫 페이지에 든 글이 없어서 견줄 게 없어요', myTopic: false };
  if (candidate.documentCount === null || candidate.documentCount === undefined) {
    return { verdict: 'unknown', reason: '경쟁 글 수를 아직 안 셌어요', myTopic };
  }

  if (candidate.documentCount > envelope.docMax) {
    return {
      verdict: 'out',
      reason: `경쟁 글 ${KO(candidate.documentCount)}개 — 지금까지 이긴 가장 큰 것은 ${KO(envelope.docMax)}개예요`,
      myTopic,
    };
  }
  if (typeof candidate.facing === 'number' && candidate.facing > envelope.facingMax) {
    return {
      verdict: 'out',
      reason: `같은 걸 다룬 글 ${candidate.facing}개 — 지금까지는 ${envelope.facingMax}개까지 이겼어요`,
      myTopic,
    };
  }
  return {
    verdict: 'in',
    reason: `경쟁 글 ${KO(candidate.documentCount)}개 — ${KO(envelope.docMax)}개까지 이겨본 적 있어요`,
    myTopic,
  };
}
