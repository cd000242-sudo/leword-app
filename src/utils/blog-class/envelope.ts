/**
 * 내가 이겨본 크기 — "봉투".
 *
 * 사장님 2026-09-10 "초보자들에게 엄청난 도움을 주는 게 목적이야".
 *
 * 왜 이게 제일 필요한가: 자리가 열렸다는 판정은 **누구 기준의 자리인지**를 말하지 않는다.
 * 문서 8,000개짜리 자리가 '열림'으로 나와도, 어제 블로그를 만든 사람과 1,000개 쓴 사람에게
 * 같은 뜻일 리가 없다. 초보자는 그걸 모르고 덤볐다가 안 되면 도구를 탓하거나 자기를 탓한다.
 *
 * 그래서 남의 기준이 아니라 **내가 실제로 붙어 본 기록**으로 거른다.
 * 봉투 = 1페이지에 든 검색어들에서 뽑은 기록 몇 개. 점수가 아니라 사실의 최대·중앙값이다.
 *
 * 규칙(전부 세거나 뺀 값이다. 지어낸 계수는 없다):
 *   docMax     이겨본 문서수의 최대 — 기록으로 남긴다
 *   docP50     그 중앙값
 *   facingMax  같은 걸 다룬 글이 몇 개 있어도 이겼나
 * 이긴 기록이 없으면 봉투를 만들지 않는다(null). 기본값을 지어내지 않는다 —
 * 지어낸 기준으로 "네 크기다"라고 말하는 것이 아무 말 안 하는 것보다 나쁘다.
 *
 * ── 거르는 기준은 문서수가 아니라 '30위 안에 붙어 본 검색량'이다 (2026-09-15, 사장님 승인) ──
 * 문서수 최대치로 거르던 것을 버렸다. 실측(사장님 블로그 9-13): 이긴 2건 중 '타일 바닥 청소'가
 * 경쟁 글 1,690,874개짜리 넓은 말이라, 오늘 쓸 한 편 후보 459개 중 450개가 '내 크기 안'으로 통과했고
 * 인테리어·DIY 블로그에 'kaist 입학처'가 세워졌다. 오픈 API 문서수는 낱말이 들어간 글을 느슨하게 센 값이라
 * 순위를 이길 크기를 말해 주지 못한다.
 * 대신 **30위 안에 실제로 붙어 본 검색어의 검색량**을 쓴다(buildNearBand) — 첫 페이지는 못 들었어도
 * 11~30위까지 올라간 말은 그 블로그가 경쟁해 본 크기다. 자리(정면 글)는 오늘 쓸 한 편이 따로 실제로 잰다.
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

/** 가까웠던 자리 = 블로그 탭 30위 안. 내 순위 실측은 30위 안팎까지 읽으므로 그 안의 순위는 전부 실측이다. */
export const NEAR_RANK = 30;

/**
 * 찾는 검색량의 바닥 — CLAUDE.md 등급표 A 의 '검색량 100+' 그대로.
 * 30위 안에 붙어 봤어도 이보다 작은 말은 찾지 않는다. 화면(blogRangeOf)도 같은 값을 쓴다(blog-band-parity 테스트).
 */
export const BAND_FLOOR = 100;

export function isWon(row: WonRow): boolean {
  return typeof row.blogRank === 'number' && row.blogRank >= 1 && row.blogRank <= WON_RANK;
}

export function isNear(row: WonRow): boolean {
  return typeof row.blogRank === 'number' && row.blogRank >= 1 && row.blogRank <= NEAR_RANK;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** 주제별 건수 — 많은 순 3개. 봉투와 범위가 같은 방식으로 센다. */
function countTopics(rows: readonly WonRow[]): Array<{ topic: string; count: number }> {
  const topicCount = new Map<string, number>();
  for (const row of rows) {
    const topic = (row.topic || '').trim();
    if (!topic) continue;
    topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
  }
  return [...topicCount.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, 3);
}

/**
 * 봉투 만들기. 이긴 기록이 없으면 null — 그때는 화면이 "아직 이긴 기록이 없어요"라고만 말한다.
 * 문서수를 못 잰 이긴 행은 한계선 계산에서 빠진다(그 행이 얼마짜리였는지 모르니까).
 */
export function buildEnvelope(rows: readonly WonRow[]): BlogEnvelope | null {
  /*
   * 분모 — 잰 것은 다 센다.
   *
   * 전에는 `blogRank 가 숫자인 행`만 셌다. 그런데 순위가 null 인 행은 **못 잰 것이 아니라 진 것**이다:
   * measureMyRanks 는 검색 화면을 못 읽은 행(막힘·빈 목록)은 애초에 rows 에 안 넣는다.
   * rows 에 든 것은 전부 실제로 재 본 것이고, null 은 "상위 목록에 내 글이 없었다"는 결과다.
   *
   * 실측(2026-09-11 leadernam- 최근 100개): 26개를 쟀는데 봉투는 5개라 셌고 화면은 "5개 중 2개"라 썼다.
   * 승률이 40%로 읽히지만 실제는 2/26 = 8%다. 진 것을 분모에서 빼면 승률이 부풀고 그 문장이 거짓이 된다.
   */
  const measured = rows;
  const won = rows.filter(isWon);
  if (won.length === 0) return null;

  const docs = won.map((row) => row.documentCount).filter((v): v is number => typeof v === 'number');
  /*
   * 크기를 말할 근거가 없으면 봉투를 만들지 않는다.
   *
   * 전에는 docs 가 비면 docMax 를 0 으로 뒀다. 그러면 옛 판정(`documentCount > docMax`)이
   * **문서수 1개짜리 후보까지 전부 '범위 밖'** 으로 떨궜다. 0 은 기본값이지 실측이 아니다 —
   * 이 파일이 이긴 기록 없을 때 null 을 주는 것과 같은 이유로 여기서도 null 을 준다.
   * (이긴 행의 문서수는 순위 실측의 마지막 단계에서 채워진다. 그 단계 전에 저장된 중간 결과도 여기로 온다.)
   */
  if (docs.length === 0) return null;
  const facings = won.map((row) => row.facing).filter((v): v is number => typeof v === 'number');
  const volumes = won.map((row) => row.searchVolume).filter((v): v is number => typeof v === 'number');

  return {
    wonCount: won.length,
    measuredCount: measured.length,
    docMax: docs.length > 0 ? Math.max(...docs) : 0,
    docP50: docs.length > 0 ? median(docs) : 0,
    facingMax: facings.length > 0 ? Math.max(...facings) : 0,
    volumeMin: volumes.length > 0 ? Math.min(...volumes) : 0,
    volumeMax: volumes.length > 0 ? Math.max(...volumes) : 0,
    topics: countTopics(won),
  };
}

/** 30위 안에 붙어 본 기록 — 오늘 쓸 한 편과 발굴 화면의 '내 크기'가 같은 값으로 거른다. */
export interface NearBand {
  /** 순위를 실제로 잰 검색어 수(분모). */
  measuredCount: number;
  /** 1~10위(첫 페이지). */
  wonCount: number;
  /** 11~30위. */
  nearCount: number;
  /** 30위 안에 붙어 본 검색어의 검색량 최소·최대. */
  volumeMin: number;
  volumeMax: number;
  /** 30위 안 기록의 주제와 건수 — 많은 순 3개. */
  topics: Array<{ topic: string; count: number }>;
}

/**
 * 30위 안 기록으로 검색량 범위를 만든다. 그런 기록이 없거나 그 검색량을 하나도 못 쟀으면 null —
 * 견줄 근거가 없는데 범위를 지어내지 않는다(봉투와 같은 원칙).
 * 봉투와 달리 첫 페이지 기록이 없어도 11~30위 기록만 있으면 만든다 — 그것도 그 블로그가 경쟁해 본 크기다.
 */
export function buildNearBand(rows: readonly WonRow[]): NearBand | null {
  const near = rows.filter(isNear);
  const volumes = near
    .map((row) => row.searchVolume)
    .filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (volumes.length === 0) return null;
  const won = near.filter(isWon).length;
  return {
    measuredCount: rows.length,
    wonCount: won,
    nearCount: near.length - won,
    volumeMin: Math.min(...volumes),
    volumeMax: Math.max(...volumes),
    topics: countTopics(near),
  };
}

/** 후보 한 줄이 내 범위 안인지 볼 때 필요한 값. 못 잰 칸은 null. */
export interface CandidateSize {
  searchVolume: number | null;
  topic?: string | null;
}

export interface RangeVerdict {
  /** 'in' 붙어 본 크기 안 · 'out' 붙어 본 적 없는 크기 · 'unknown' 견줄 수 없음 */
  verdict: 'in' | 'out' | 'unknown';
  /** 화면에 그대로 찍는 한 줄. 숫자를 근거로 담는다. */
  reason: string;
  /** 붙어 본 적 있는 주제인가. 범위에 주제가 없거나 후보 주제를 모르면 false. */
  myTopic: boolean;
}

const KO = (value: number) => value.toLocaleString('ko-KR');

/**
 * 후보 하나를 내가 30위 안에 붙어 본 검색량과 견준다.
 *
 * 판단이 아니라 **대조**다 — "추천"·"쉬움" 같은 말을 만들지 않는다(약속으로 읽힌다).
 * 범위가 없거나 후보의 검색량을 못 쟀으면 'unknown'이고, 화면은 배지를 안 붙인다.
 * 문장은 숫자 끝소리에 따라 조사가 바뀌지 않게 '~까지'로 맺는다.
 */
export function judgeRange(candidate: CandidateSize, band: NearBand | null): RangeVerdict {
  const topic = (candidate.topic || '').trim();
  const myTopic = Boolean(band && topic && band.topics.some((t) => t.topic === topic));

  if (!band) return { verdict: 'unknown', reason: `아직 ${NEAR_RANK}위 안에 든 검색어가 없어서 견줄 게 없어요`, myTopic: false };
  const volume = candidate.searchVolume;
  if (volume === null || volume === undefined || !isFinite(volume)) {
    return { verdict: 'unknown', reason: '검색량을 아직 안 쟀어요', myTopic };
  }
  if (volume > band.volumeMax) {
    return {
      verdict: 'out',
      reason: `검색량 ${KO(volume)} — ${NEAR_RANK}위 안에 붙어 본 말은 ${KO(band.volumeMax)}까지였어요`,
      myTopic,
    };
  }
  if (volume < BAND_FLOOR) {
    return { verdict: 'out', reason: `검색량 ${KO(volume)} — ${KO(BAND_FLOOR)} 아래 말은 찾지 않아요`, myTopic };
  }
  return {
    verdict: 'in',
    reason: `검색량 ${KO(volume)} — ${NEAR_RANK}위 안에 붙어 본 말이 ${KO(band.volumeMax)}까지 있어요`,
    myTopic,
  };
}
