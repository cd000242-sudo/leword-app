/**
 * 선점 게이트 — "지금 쓰면 자리가 있는" 키워드를, 확실한 것부터 층층이 골라낸다.
 *
 * 두 가지를 동시에 지켜야 한다:
 *   ① **자리가 확실한 것부터.** 막연히 "황금키워드"가 아니라, 검색결과를 실제로
 *      열어 보고 상위에 빈 자리가 있는 것을 먼저 올린다.
 *   ② **빈손으로 끝내지 않는다.** 조건을 전부 걸어 0건이 나오면 사용자에게는
 *      기능이 없는 것과 같다. 그래서 껍질을 까듯 층을 벗겨 개수를 채운다.
 *
 * 다만 벗기는 것은 **근거의 강도**이지 "자리가 있다"는 사실 자체가 아니다.
 * 1~3층은 정면으로 다룬 글이 0건인 것만 들어온다. 이미 누가 정확히 그 주제로
 * 쓴 키워드를 개수 맞추려고 끼워 넣으면, 그건 사용자를 속이는 것이다.
 * 마지막 4층만 정면 대응 1건까지 허용하고, 화면에 '경합'이라고 그대로 적는다.
 *
 * 점수는 만들지 않는다. 층 구분과 정렬은 전부 실측값 비교이고, 화면에는
 * evidence 의 사실 문장과 층 이름만 나간다. (추정치 UI 노출 금지 규칙)
 */
import { titleCoverage, DEFAULT_SERP_THRESHOLDS } from './serp-winnability';

/** 껍질을 까는 순서. 앞일수록 자리가 확실하다. */
export type PreemptionTier = 'top3' | 'page1' | 'golden-ratio' | 'page1-weak' | 'contested';

export const TIER_LABEL: Record<PreemptionTier, string> = {
  top3: '상위 3위권에 빈자리',
  page1: '1페이지에 빈자리',
  /*
   * 황금 비율 — 검색량이 문서수보다 많다. 사장님 최종 기준(2026-08-12):
   * "순수하게 마지막으로 통과하는 건 황금키워드, 한마디로 검색량이 문서수보다
   *  높은 키워드들이야. 다 통과시켜서 보여줘."
   * 문서수는 10년치 누적인데도 한 달 검색량이 그걸 넘는다는 것은 수요가 공급을
   * 압도한다는 뜻이다. 자리 판정과 무관하게 전부 통과한다.
   */
  'golden-ratio': '황금 비율 — 검색량 > 문서수',
  'page1-weak': '1페이지에 빈자리 (실시간 노출 중)',
  contested: '경합 — 정면 대응 있음',
};

/** 층 순서. 이 배열 순서대로 채운다. */
export const TIER_ORDER: readonly PreemptionTier[] = ['top3', 'page1', 'golden-ratio', 'page1-weak', 'contested'];

export interface PreemptionThresholds {
  /**
   * 상위 문서 중앙값이 이 일수 이상이면 "낡았다"고 본다.
   * 층을 가르지는 않는다 — 근거 한 줄로만 쓴다(실주행에서 0/15 통과).
   */
  minMedianDaysAgo: number;
  /** 처음 관측된 지 이 시간 이내여야 "막 올라왔다"고 본다. */
  maxHoursSinceFirstSeen: number;
  /**
   * 이 검색량 미만이면 수요가 붙었다고 보지 않는다. 어느 층에서도 안 푼다.
   * **후보를 뽑는 쪽도 이 값을 그대로 써야 한다** — 두 곳에 따로 적었다가
   * 후보 30건이 전부 이 조건에서 탈락했고, 그걸 알아내는 데 BD 크레딧 30건을 썼다.
   */
  minSearchVolume: number;
  /** SERP 표본이 이 개수 미만이면 판정하지 않는다. 어느 층에서도 안 푼다. */
  minSampledTitles: number;
  /** '상위'를 몇 위까지로 볼 것인가. */
  topSlots: number;
  /**
   * 검색량 ÷ 문서수 하한. **소음 키워드를 걷어내는 용도다.**
   *
   * ## 왜 1 이 아닌가 (2026-08-11 실측 45건)
   *
   * 사장님 기준은 "검색량이 높고 문서수가 적어야 황금키워드다" 이고 그 말이 맞다.
   * 그런데 우리가 가진 '문서수' 로는 그 기준을 그대로 잴 수가 없다:
   *
   *   검색량 = 지난 **한 달** 동안 그 검색어를 친 횟수
   *   문서수 = **10년치 누적** 블로그 글 중 그 단어들이 어딘가 들어간 글 수
   *            (정확구문도 아니다 — 오픈 API 가 따옴표를 무시하는 것을 실측 확인)
   *
   * 단위가 다르므로 비율 1 은 원리적으로 통과할 수 없다. 실측 45건에서 최대가
   * 0.476 이고 1 을 넘은 것은 **0건**이었다. 여기를 1 로 두면 보드가 통째로 빈다.
   *
   * 사장님이 말한 "문서수" 에 해당하는 진짜 숫자는 **정면 대응 건수**다.
   * '크레마 이북리더기 미피' 는 문서수 525건이지만 상위 10개 중 정면은 3건이고
   * 나머지는 팔레트 일반 후기였다. 월 250회 검색에 경쟁 글 3건 — 그게 기준에 맞다.
   * 그 판정은 checkInvariants 의 exactTitleHits 가 한다.
   *
   * ## 그럼 이 값은 무엇을 하나
   *
   * 정면 대응만으로는 **블로그 주제가 아예 아닌 검색어**를 못 거른다.
   * '오퍼레이터24'(검색량 730 · 문서수 15,654)는 상위 10개가 전부 웹소설·공장등록
   * 현황이라 정면 0건이 나오는데, 그건 자리가 빈 게 아니라 그 말로 쓸 글이 없는 것이다.
   * 소음이 검색량의 10배를 넘으면 그런 밭으로 본다 — 실측 45건 중 5건이 통과한다.
   */
  minVolumeToDocumentRatio: number;
}

/**
 * 임계값은 아직 실증 전이다 — 실제로 써서 순위가 나온 결과로 보정해야 한다.
 * 그래서 상수로 박지 않고 인자로 뺐다. serp-winnability 와 같은 이유.
 */
export const DEFAULT_PREEMPTION_THRESHOLDS: PreemptionThresholds = {
  minMedianDaysAgo: 30,
  maxHoursSinceFirstSeen: 48,
  // 롱테일은 원래 검색량이 낮다. 실측 30건 분포가 중앙 50 · 300 이상은 4건뿐이었다.
  minSearchVolume: 100,
  minSampledTitles: 5,
  topSlots: 3,
  /*
   * 소음이 검색량의 10배를 넘으면 뺀다. 1 은 원리적으로 통과 불가다(위 주석 — 실측
   * 45건 최대 0.476). 지적받은 4건이 전부 여기서 걸린다:
   *   오퍼레이터24 0.047 · 에너지바우처조회 0.013 · 사진인화4X6 0.013 · 무료상표등록조회 0.022
   * 사람이 봐도 납득되는 것은 남는다: 헬리오스 식물등 0.187 · jyp 채용 후기 0.383
   */
  minVolumeToDocumentRatio: 0.1,
};

export interface PreemptionSerp {
  sampledTitles: number;
  exactTitleHits: number;
  partialTitleHits: number;
  medianDaysAgo: number | null;
  /** SERP 순서 그대로의 상위 제목들. 상위 몇 위에 자리가 있는지 세는 데 쓴다. */
  topTitles?: string[];
  /**
   * 통합검색 화면에 AI 브리핑이 실제로 떠 있는가(실측).
   * undefined 는 '안 봤다'이지 '없다'가 아니다 — 셋을 구분한다.
   */
  hasAiBriefing?: boolean;
  /** AI 브리핑이 인용한 글 수. 인용되면 노출돼도 클릭은 AI 가 가져간다. */
  aiBriefingSourceCount?: number;
  /**
   * 상단 파워링크 광고 건수(실측). undefined 는 '안 봤다'이지 '없다'가 아니다.
   * 광고가 많다는 것은 광고주들이 그 검색어에 돈을 넣고 있다는 뜻이다 —
   * 우리가 만든 수익 추정이 아니라 남이 이미 낸 판단이라 그대로 싣는다.
   */
  adCount?: number;
}

export interface PreemptionInput {
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  serp: PreemptionSerp | null;
  firstSeenAt: string | null;
  /**
   * 실시간 검색어에 지금 올라와 있는가. null 은 '못 쟀다'.
   *
   * 층 결정에서 null 은 **강등하지 않는다**(true 일 때만 내린다). 강등은 "이미
   * 퍼졌으니 선점이 아니다" 라는 적극적 사실이 있을 때 하는 일이고, 못 잰 것을
   * 그 사실로 대신 쓸 수는 없다. 대신 근거 줄(not-realtime)에는 안 싣는다 —
   * 안 잰 것을 근거라고 말하지 않는다.
   */
  inRealtimeNow: boolean | null;
  nowMs?: number;
}

export interface PreemptionEvidence {
  code: 'open-slot' | 'empty-field' | 'stale-top' | 'fresh' | 'not-realtime' | 'demand' | 'contested' | 'ai-briefing' | 'ads' | 'golden-ratio';
  text: string;
}

export interface PreemptionResult {
  keyword: string;
  /** 통과한 층. null 이면 어느 층에도 못 들어간 것이다. */
  tier: PreemptionTier | null;
  tierLabel: string;
  passed: boolean;
  evidence: PreemptionEvidence[];
  /** 못 넘긴 조건(운영자용, 화면 비노출). */
  failed: string[];
  /** 자료 부족으로 판정 자체가 불가. 통과도 탈락도 아니다. */
  undetermined: boolean;
  /** 상위 몇 번째 자리가 비어 있는가. 1이면 1위 자리가 비었다는 뜻이다. */
  openSlot: number | null;
  /**
   * AI 브리핑이 떠 있었는가. undefined 는 '안 봤다'이지 '없다'가 아니다.
   * 정렬이 이 값을 쓴다 — 화면 문구로 가르면 카피 수정에 조용히 깨진다.
   */
  hasAiBriefing?: boolean;
  /**
   * 줄 세우기에 쓰는 실측값. 화면이 아니라 **여기서** 순서를 정하려고 싣는다.
   * 화면이 제 나름대로 정렬하면 같은 보드가 기기마다 다른 순서로 보인다.
   */
  adCount?: number;
  searchVolume: number | null;
  documentCount: number | null;
}

function hoursSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return (nowMs - time) / 3600000;
}

function formatAge(hours: number): string {
  if (hours < 1) return '1시간 이내';
  if (hours < 24) return `${Math.round(hours)}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

/**
 * 상위 몇 번째 자리가 비어 있는지 센다.
 *
 * **점유 판정은 '정확 일치'가 아니라 '부분 일치'로 한다.** 이유가 있다:
 * 정확 일치로 세면 정면 대응이 0건인 키워드는 빈자리가 언제나 1위로 나와서,
 * "상위에 자리가 있다"는 구분 자체가 무의미해진다(전부 1위). 실제로는 제목이
 * 검색어를 절반쯤 담은 글도 그 자리를 차지하고 있고, 독자 눈에도 그렇게 보인다.
 * 그래서 절반 이상 담은 글을 '찬 자리'로 본다.
 *
 * 제목 목록이 없으면 셀 수 없으므로 null 이다 — 0 이나 1 로 때우지 않는다.
 * 없는 자리를 있다고 말하는 순간 이 보드의 값어치가 사라진다.
 */
export function findOpenSlot(serp: PreemptionSerp, keyword: string): number | null {
  const titles = serp.topTitles;
  if (!Array.isArray(titles) || titles.length === 0) return null;
  for (let index = 0; index < titles.length; index += 1) {
    if (titleCoverage(titles[index], keyword) < DEFAULT_SERP_THRESHOLDS.partialCoverage) {
      return index + 1;
    }
  }
  // 훑은 자리가 전부 차 있다. 그 아래는 안 봤으므로 "없다"가 아니라 null 이다.
  return null;
}

/** 어느 층에서도 절대 풀지 않는 조건. 여기서 걸리면 자료 부족이거나 수요가 없다. */
function checkInvariants(
  input: PreemptionInput,
  thresholds: PreemptionThresholds,
): { undetermined: boolean; reason: string } | null {
  if (!input.serp || input.serp.sampledTitles < thresholds.minSampledTitles) {
    return { undetermined: true, reason: 'SERP 표본 부족' };
  }
  if (input.searchVolume === null) {
    return { undetermined: true, reason: '검색량 미측정' };
  }
  if (input.searchVolume < thresholds.minSearchVolume) {
    return { undetermined: false, reason: `검색량 ${input.searchVolume} < ${thresholds.minSearchVolume}` };
  }
  /*
   * 문서수 0 은 "경쟁이 없다"가 아니라 대개 측정 실패다. 실측 '야설사이트'는
   * 검색량 130 인데 문서수 0 으로 왔다 — 네이버가 그 질의에 결과를 안 준 것이다.
   * 문서수를 못 쟀으면(null) 판단하지 않는다 — 못 본 것과 나쁜 것을 섞지 않는다.
   */
  if (input.documentCount === 0) {
    return { undetermined: false, reason: '문서수 0 — 측정 실패로 본다' };
  }
  /*
   * 소음이 검색량에 견줘 지나치게 두꺼우면 뺀다.
   *
   * 문서 22,035개에 검색이 280번인 것을 "빈자리"라고 부를 수 없다 — 사장님 지적이고
   * 맞다. 다만 문서수는 10년치 누적 broad 매치라 한 달 치 검색량과 단위가 다르다.
   * 그래서 1 이 아니라 실측 분포에서 고른 값을 쓴다(minVolumeToDocumentRatio 주석).
   *
   * 이 컷이 실제로 잡는 것은 **블로그 주제가 아닌 검색어**다 — 상위 글이 전부
   * 남의 이야기라 정면 대응이 0으로 나오는 것들. 밭이 찼는지는 정면 대응이 잰다.
   *
   * 못 쟀으면(null) 자르지 않는다 — 못 본 것과 나쁜 것을 섞지 않는다.
   */
  if (input.documentCount !== null
    && thresholds.minVolumeToDocumentRatio > 0
    && (input.searchVolume / input.documentCount) < thresholds.minVolumeToDocumentRatio) {
    return {
      undetermined: false,
      reason: `문서수 ${input.documentCount.toLocaleString('ko-KR')} — 검색량 ${input.searchVolume.toLocaleString('ko-KR')}의 `
        + `${Math.round(input.documentCount / input.searchVolume)}배라 소음이 너무 두껍다`,
    };
  }
  /*
   * 정면 대응이 2건 이상이면 자리가 없다 — 단, **황금 비율(검색량 > 문서수)은
   * 예외로 전부 통과한다**(사장님 최종 기준). 경쟁 글이 있어도 수요가 공급을
   * 압도하는 밭이라 노출 기회가 있고, 층 라벨('황금 비율')과 정면 건수 근거로
   * 그 사실을 숨기지 않고 내보낸다.
   */
  if (input.serp.exactTitleHits > 1) {
    const golden = input.documentCount !== null && input.searchVolume > input.documentCount;
    if (!golden) {
      return { undetermined: false, reason: `정면 대응 ${input.serp.exactTitleHits}건 — 자리 없음` };
    }
  }
  return null;
}

/**
 * 한 키워드가 어느 층에 속하는지 판정한다.
 * 위 층부터 시도해 처음 맞는 층에서 멈춘다.
 */
export function judgePreemption(
  input: PreemptionInput,
  thresholds: PreemptionThresholds = DEFAULT_PREEMPTION_THRESHOLDS,
): PreemptionResult {
  const nowMs = input.nowMs ?? Date.now();
  const blocked = checkInvariants(input, thresholds);
  if (blocked) {
    return {
      keyword: input.keyword,
      tier: null,
      tierLabel: '',
      passed: false,
      evidence: [],
      failed: [blocked.reason],
      undetermined: blocked.undetermined,
      openSlot: null,
      adCount: input.serp?.adCount,
      searchVolume: input.searchVolume,
      documentCount: input.documentCount,
    };
  }

  const serp = input.serp as PreemptionSerp;
  const openSlot = findOpenSlot(serp, input.keyword);
  const age = hoursSince(input.firstSeenAt, nowMs);
  const stale = serp.medianDaysAgo !== null && serp.medianDaysAgo >= thresholds.minMedianDaysAgo;
  const fresh = age !== null && age <= thresholds.maxHoursSinceFirstSeen;
  const emptyField = serp.exactTitleHits === 0;
  const topOpen = emptyField && openSlot !== null && openSlot <= thresholds.topSlots;

  /*
   * 층 결정. 위에서부터 처음 맞는 곳에서 멈춘다.
   *
   * 상위 문서 나이(stale)는 **필수 조건에서 뺐다.** 실주행 15건 중 0건이 30일
   * 기준을 넘겼는데(실측 최소 1일·중앙 14일), 정작 그 15건은 정면 대응이 0건이라
   * 자리가 실제로 비어 있었다. 상위 글이 최근이라는 건 그 키워드가 지금 뜨고
   * 있다는 뜻이지 자리가 없다는 뜻이 아니다 — 오히려 선점 대상에 가깝다.
   * 이제 stale 은 근거 한 줄로만 남고 층을 가르지 않는다.
   */
  /*
   * AI 브리핑이 떠 있으면 한 층 내린다.
   *
   * 자리가 비어 있어도 사용자가 블로그를 클릭하기 전에 답이 끝난다.
   * 실측(2026-08-10, BD 3건): 정의형·정보형에는 떠 있고 상거래형에는 없었다.
   * **버리지는 않는다** — 인용되면 노출 자체는 되고, 판단은 사람이 한다.
   */
  const aiTakesAnswer = input.serp?.hasAiBriefing === true;

  const goldenRatio = input.documentCount !== null && input.searchVolume! > input.documentCount;

  let tier: PreemptionTier;
  if (topOpen && !input.inRealtimeNow && !aiTakesAnswer) tier = 'top3';
  else if (emptyField && !input.inRealtimeNow && !aiTakesAnswer) tier = 'page1';
  // 자리 층에 못 들어도 황금 비율이면 전용 층으로 통과한다(위 불변조건 예외와 짝).
  else if (goldenRatio && !emptyField) tier = 'golden-ratio';
  else if (emptyField) tier = 'page1-weak';
  else tier = 'contested';

  // ── 근거. 사실인 것만 담는다 ─────────────────────────────────────────
  const evidence: PreemptionEvidence[] = [];
  /*
   * 수요와 밭 크기. 둘 다 실측 그대로 적는다.
   *
   * 주의: 이 둘은 잰 대상이 다르다 — 검색량은 지난 **한 달**의 횟수이고, 문서수는
   * **10년치 누적**에서 그 단어들이 어딘가 들어간 글 수다(정확구문도 아니다.
   * 오픈 API 가 따옴표를 무시하는 것을 실측 확인했다). 그래서 문서수가 검색량보다
   * 큰 것이 정상이며, 실제로 겨루는 상대 수는 아래 '정면으로 다룬 글' 줄이 말한다.
   */
  const docs = input.documentCount;
  evidence.push({
    code: 'demand',
    text: docs === null
      ? `월 검색량 ${input.searchVolume!.toLocaleString('ko-KR')}`
      : `월 검색량 ${input.searchVolume!.toLocaleString('ko-KR')} · 문서수 ${docs.toLocaleString('ko-KR')}`,
  });

  /*
   * 광고는 **광고주들이 이미 낸 판단**이다. 우리가 수익을 추정하지 않고 그 사실만 적는다.
   * 못 쟀으면 적지 않는다 — 0건이라고 쓰면 안 본 것이 '광고 없음'이 된다.
   */
  if (typeof serp.adCount === 'number' && serp.adCount > 0) {
    evidence.push({ code: 'ads', text: `상단 광고 ${serp.adCount}건 — 광고주가 돈을 넣는 검색어다` });
  }

  if (openSlot !== null) {
    evidence.push({ code: 'open-slot', text: `상위 ${openSlot}번째 자리가 비어 있음` });
  }
  if (emptyField) {
    evidence.push({ code: 'empty-field', text: `상위 ${serp.sampledTitles}개 중 정면으로 다룬 글 0건` });
  } else {
    evidence.push({ code: 'contested', text: `상위 ${serp.sampledTitles}개 중 정면으로 다룬 글 ${serp.exactTitleHits}건` });
  }
  if (stale) {
    evidence.push({ code: 'stale-top', text: `상위 문서 중앙값 ${Math.round(serp.medianDaysAgo!)}일 전` });
  }
  if (fresh) {
    evidence.push({ code: 'fresh', text: `${formatAge(age!)} 처음 관측` });
  }
  if (goldenRatio) {
    evidence.push({
      code: 'golden-ratio',
      text: `월 검색량 ${input.searchVolume!.toLocaleString('ko-KR')} > 문서수 ${input.documentCount!.toLocaleString('ko-KR')} — 수요가 공급을 넘는 황금 비율`,
    });
  }

  // 못 쟀으면(null) 근거로 싣지 않는다. 안 잰 것은 사실이 아니다.
  if (input.inRealtimeNow === false) {
    evidence.push({ code: 'not-realtime', text: '실시간 검색어에는 아직 없음' });
  }
  if (input.serp?.hasAiBriefing === true) {
    const cited = Number(input.serp.aiBriefingSourceCount || 0);
    evidence.push({
      code: 'ai-briefing',
      text: cited > 0
        ? `AI 브리핑이 떠 있고 ${cited}개 글을 인용 중`
        : 'AI 브리핑이 떠 있음',
    });
  } else if (input.serp?.hasAiBriefing === false) {
    evidence.push({ code: 'ai-briefing', text: 'AI 브리핑 없음 — 클릭이 글로 온다' });
  }

  // 못 채운 조건은 운영자용으로만 남긴다. 층이 곧 그 요약이다.
  const failed: string[] = [];
  if (!topOpen) failed.push(openSlot === null ? '빈자리 위치 미확인' : `빈자리 ${openSlot}위 (기준 ${thresholds.topSlots}위)`);
  if (!stale) failed.push(serp.medianDaysAgo === null ? '상위 문서 날짜 미확인' : `상위 중앙값 ${Math.round(serp.medianDaysAgo)}일`);
  if (!fresh) failed.push(age === null ? '최초 관측 시각 없음' : `최초 관측 ${Math.round(age)}시간 전`);
  if (input.inRealtimeNow) failed.push('이미 실시간 검색어에 노출됨');
  if (aiTakesAnswer) failed.push('AI 브리핑이 답을 대신한다');

  return {
    keyword: input.keyword,
    tier,
    tierLabel: TIER_LABEL[tier],
    passed: true,
    evidence,
    failed,
    undetermined: false,
    openSlot,
    hasAiBriefing: input.serp?.hasAiBriefing,
    adCount: input.serp?.adCount,
    searchVolume: input.searchVolume,
    documentCount: input.documentCount,
  };
}

export interface FillOptions {
  /** 채우고 싶은 개수. 위 층부터 채우고 모자라면 다음 층을 깐다. */
  target: number;
  thresholds?: PreemptionThresholds;
}

export interface FillOutcome {
  /** 목표 개수만큼(또는 가능한 만큼) 채운 결과. 층 순서대로 정렬돼 있다. */
  rows: PreemptionResult[];
  /** 층별 통과 건수. 몇 층까지 깠는지 운영자가 본다. */
  byTier: Record<PreemptionTier, number>;
  /** 어느 층까지 내려갔는가. null 이면 한 건도 못 채웠다. */
  deepestTier: PreemptionTier | null;
  rejected: PreemptionResult[];
  undetermined: PreemptionResult[];
  /** 목표를 못 채웠는가. 후보 풀을 넓혀야 한다는 신호다. */
  short: boolean;
}

/**
 * 같은 층 안에서의 줄 세우기.
 *
 * 사장님 기준(2026-08-11): "상위에 광고가 많이 떠 있다면 그 키워드는 돈이 되는
 * 키워드다 — 광고주가 많으니까. 특히 광고가 많고 검색량은 높으면서 문서수는
 * 낮은 그런 키워드들을 위에 먼저 배치해서 순위별로 나열해 달라."
 *
 * 그대로 옮긴다: 광고 많은 순 → 검색량 많은 순 → 문서수 적은 순 → 빈자리 위인 순.
 * 넷 다 실측값이다. 점수로 합치지 않는다 — 합치면 가중치가 곧 지어낸 값이 된다.
 *
 * 광고를 **못 쟀으면**(undefined) 그 축은 건너뛴다. 0으로 눌러 담으면 안 본 것이
 * '광고 없음'이 되어 뒤로 밀린다 — 안 본 것을 벌주지 않는다.
 */
function compareWithinTier(left: PreemptionResult, right: PreemptionResult): number {
  if (typeof left.adCount === 'number' && typeof right.adCount === 'number') {
    const adDiff = right.adCount - left.adCount;
    if (adDiff !== 0) return adDiff;
  }
  const volumeDiff = (right.searchVolume ?? 0) - (left.searchVolume ?? 0);
  if (volumeDiff !== 0) return volumeDiff;
  const docsDiff = (left.documentCount ?? Number.MAX_SAFE_INTEGER)
    - (right.documentCount ?? Number.MAX_SAFE_INTEGER);
  if (docsDiff !== 0) return docsDiff;
  return (left.openSlot ?? 99) - (right.openSlot ?? 99);
}

/**
 * 껍질 까기 — 확실한 층부터 채우고, 모자라면 다음 층을 연다.
 *
 * 목표 개수를 못 채우면 억지로 만들지 않고 short=true 로 알린다.
 * 없는 걸 지어내는 것보다 "이번엔 이만큼"이 정직하다.
 */
export function selectWithFill(
  inputs: PreemptionInput[],
  options: FillOptions,
): FillOutcome {
  const thresholds = options.thresholds ?? DEFAULT_PREEMPTION_THRESHOLDS;
  const judged = inputs.map((input) => judgePreemption(input, thresholds));

  const byTier = { top3: 0, page1: 0, 'page1-weak': 0, contested: 0 } as Record<PreemptionTier, number>;
  for (const result of judged) {
    if (result.tier) byTier[result.tier] += 1;
  }

  const rows: PreemptionResult[] = [];
  let deepestTier: PreemptionTier | null = null;

  /*
   * 껍질을 두 겹으로 깐다. 바깥 겹이 **AI 브리핑 유무**, 안쪽 겹이 층이다.
   *
   * 왜 브리핑이 층보다 먼저인가: 브리핑에서 답을 얻은 사람은 굳이 글을 안 본다.
   * 자리가 아무리 좋아도 클릭이 안 오면 값이 없고, 경합이어도 클릭이 오는 편이
   * 낫다. 그래서 브리핑 있는 1페이지보다 브리핑 없는 경합을 먼저 낸다.
   *
   * 못 잰 것(undefined)은 "있다"로 치지 않는다 — 안 본 것을 벌주면 멀쩡한
   * 키워드가 손해를 본다.
   */
  /*
   * 황금 비율은 **목표 개수와 무관하게 전부** 싣는다 — "다 통과시켜서 보여줘".
   * 자리 층(top3 등)으로 이미 들어간 황금 비율 행도 있으므로, 목표 채우기가
   * 끝난 뒤 아직 안 실린 황금 비율 행을 전부 덧붙인다.
   */
  const briefingPhases = [false, true] as const;
  for (const allowBriefing of briefingPhases) {
    for (const tier of TIER_ORDER) {
      if (rows.length >= options.target) break;
      const layer = judged
        .filter((result) => result.tier === tier)
        // 화면 문구가 아니라 측정값을 본다. 문구로 가르면 카피를 고칠 때 조용히 깨진다.
        .filter((result) => (result.hasAiBriefing === true) === allowBriefing)
        .sort(compareWithinTier);
      for (const result of layer) {
        if (rows.length >= options.target) break;
        rows.push(result);
        deepestTier = tier;
      }
    }
  }

  for (const result of judged) {
    if (result.tier === 'golden-ratio' && !rows.includes(result)) {
      rows.push(result);
      deepestTier = deepestTier ?? 'golden-ratio';
    }
  }

  return {
    rows,
    byTier,
    deepestTier,
    rejected: judged.filter((result) => !result.passed && !result.undetermined),
    undetermined: judged.filter((result) => result.undetermined),
    short: rows.length < options.target,
  };
}
