/**
 * SERP 선점 여지 판정 — "상위에 이 질문을 정면으로 다룬 글이 몇 건인가"
 *
 * 문서수 숫자 하나로 경쟁도를 재던 한계를 뚫기 위한 실물 판정기다. 문서 3,000개가
 * 전부 나무위키·언론사면 못 먹고, 8,000개라도 개인 블로그가 섞여 있으면 먹는다.
 *
 * 신호를 세 번 갈아엎은 기록(scripts/serp-gap-audit.js 에서 승격하며 옮김):
 *   1) 통합검색의 blog.naver.com 링크 수 → 미리보기·연관블로그까지 잡혀
 *      전 키워드 100% 통과. 변별력 0.
 *   2) 상위 글 발행일로 신선도 판정 → 네이버 블로그 탭이 최신 글을 우대해
 *      거의 모든 키워드가 "최근 30일 내 10건". 역시 변별력 0.
 *   3) 제목 커버리지 ← 현재. 키워드 어절이 상위 글 제목에 실제로 들어있는가.
 *
 * ⚠️ 임계값은 아직 실증 전이다. 원 저자 주석 그대로 옮긴다 —
 * 실제 작성·순위 결과가 쌓이면 보정해야 한다. 그래서 상수를 코드에 박지 않고
 * 인자로 뺐다. 배치가 돌기 시작한 뒤에 못 고치면 판정기가 굳어버린다.
 */

export interface SerpWinnabilityThresholds {
  /** 이보다 적게 읽히면 판정을 보류한다(파싱 실패와 진짜 공백을 구분). */
  minSampledTitles: number;
  /** 제목이 키워드를 '정확히' 담았다고 볼 커버리지. */
  exactCoverage: number;
  /** '부분적으로' 담았다고 볼 커버리지 하한. */
  partialCoverage: number;
  /** WINNABLE 로 볼 부분 일치 상한(정확 일치는 0건이어야 함). */
  winnableMaxPartial: number;
  /** CONTESTED 로 볼 정확 일치 상한. 넘으면 LOCKED. */
  contestedMaxExact: number;
  /** 상위 몇 건까지 볼 것인가. */
  topN: number;
}

export const DEFAULT_SERP_THRESHOLDS: SerpWinnabilityThresholds = {
  minSampledTitles: 3,
  exactCoverage: 0.999,
  partialCoverage: 0.6,
  winnableMaxPartial: 2,
  contestedMaxExact: 2,
  topN: 10,
};

export type SerpVerdictCode = 'WINNABLE' | 'CONTESTED' | 'LOCKED' | 'NO_DATA';

export interface SerpAnalysis {
  sampledTitles: number;
  exactTitleHits: number;
  partialTitleHits: number;
  medianDaysAgo: number | null;
  influencer: number;
  topTitles: string[];
}

export interface SerpVerdict {
  verdict: SerpVerdictCode;
  reason: string;
}

/** 조사·공백·기호 차이를 무시한 비교용 정규화. */
function normalizeForMatch(value: string): string {
  return String(value).replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
}

/** 덩어리로 인정할 최소 길이. 한 글자는 우연 일치가 너무 잦다. */
const MIN_CHUNK = 2;

/**
 * 어절 하나를 제목이 얼마나 덮는가(0~1).
 *
 * ## 왜 통짜 비교로는 안 되나 (2026-08-11 실측)
 *
 * 예전에는 어절이 제목에 **통째로 이어져** 있어야 인정했다. 그래서 붙여 쓴
 * 검색어가 전부 0 이 나왔다:
 *
 *   '에너지바우처조회'  ←  "에너지바우처 잔액조회 안됨 결과 없음과…"     0.00
 *   '사진인화4x6'      ←  "포토몬 4x6 사진인화 350장 내돈내산 후기"      0.00
 *   '무료상표등록조회'  ←  "상표등록 무료 조회 방법 총정리"              0.00
 *
 * 사람 눈에는 전부 정면으로 다룬 글인데 기계는 0 을 냈다. 사이에 다른 말이
 * 끼거나('잔액'), 순서가 바뀌면('상표등록 무료') 이어진 문자열이 깨지기 때문이다.
 *
 * 결과는 **보드가 없는 자리를 있다고 말하는 것**이었다. 정면 0건 → 빈자리 1위 →
 * '상위 3위권 빈자리' 최상단. 자동완성·연관어는 공백을 지운 형태를 많이 돌려주므로
 * 그런 검색어가 보드를 채웠다(실측 카드 6장 중 4장).
 *
 * ## 그래서 덩어리로 뗀다
 *
 * 제목에 있는 **가장 긴 앞덩어리**부터 떼어 내며 몇 글자가 덮이는지 센다.
 * '에너지바우처조회' 는 '에너지바우처'(6) + '조회'(2) 로 8/8 이 덮인다.
 * 못 떼는 글자는 그냥 안 덮인 것으로 둔다 — '오퍼레이터24' 는 '오퍼레이터'(5)만
 * 걸려 5/7 이고, 그건 정면이 아니다(실제로 '서모 오퍼레이터' 웹소설 글이었다).
 *
 * 띄어 쓴 검색어는 어절이 제목에 통째로 있으면 곧바로 1 이므로 예전과 같다.
 */
function tokenCoverage(haystack: string, token: string): number {
  if (token.length === 0) return 0;
  if (haystack.includes(token)) return 1;

  let covered = 0;
  let rest = token;
  while (rest.length >= MIN_CHUNK) {
    let matched = 0;
    for (let size = rest.length; size >= MIN_CHUNK; size -= 1) {
      if (haystack.includes(rest.slice(0, size))) { matched = size; break; }
    }
    if (matched > 0) {
      covered += matched;
      rest = rest.slice(matched);
    } else {
      // 이 글자로 시작하는 덩어리가 제목에 없다. 안 덮인 채로 넘어간다.
      rest = rest.slice(1);
    }
  }
  return covered / token.length;
}

/**
 * 검색어를 제목이 얼마나 덮는지(0~1).
 * 2글자 미만 어절은 우연 일치가 너무 잦아 제외한다.
 */
export function titleCoverage(title: string, keyword: string): number {
  const haystack = normalizeForMatch(title);
  const tokens = String(keyword)
    .split(/\s+/)
    .map(normalizeForMatch)
    .filter((token) => token.length >= MIN_CHUNK);
  if (tokens.length === 0) return 0;
  const total = tokens.reduce((sum, token) => sum + tokenCoverage(haystack, token), 0);
  return total / tokens.length;
}

/** "2주 전" / "2026.08.07" 을 경과 일수로. 못 읽으면 null. */
export function parseDaysAgo(token: string, nowMs: number): number | null {
  const relative = token.match(/^(\d+)\s*(시간|일|주|개월)\s*전$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unitDays: Record<string, number> = { 시간: 1 / 24, 일: 1, 주: 7, 개월: 30 };
    const unit = unitDays[relative[2] as string];
    return unit === undefined ? null : Math.round(amount * unit);
  }
  const absolute = token.match(/^(20\d\d)\.(\d\d)\.(\d\d)$/);
  if (absolute) {
    const time = Date.UTC(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]));
    return Math.round((nowMs - time) / 86_400_000);
  }
  return null;
}

/**
 * 네이버 신 마크업(sds-comps-*)에서 **글 제목만** 뽑는다.
 *
 * 함정 (2026-08-10 실측): 작성자 이름과 글 제목이 둘 다 headline 계열이다.
 *   headline3 + weight-lg → 작성자·채널 ('홀니스랩', '인천성모병원')
 *   headline1 + weight-sm → 글 제목
 * headline 만 보고 앞에서부터 집으면 작성자가 먼저 잡힌다. '멜라토닌 복용량'
 * 실측에서 열 개가 전부 작성자 이름이었고, 그래서 "정면으로 다룬 글이 없다"는
 * 판정이 나왔다 — 정작 1위가 '멜라토닌 복용량 정확히 어떻게 드시나요?' 였다.
 * 이 게이트의 값어치가 통째로 이 선택자에 걸려 있다.
 */
function extractTitles(html: string, topN: number): string[] {
  // 검색어 일치부는 <mark> 로 감싸여 오므로 태그를 걷어낸 뒤 비교한다.
  return [...html.matchAll(/sds-comps-text-type-headline1[^"]*sds-comps-text-weight-sm[^"]*"[^>]*>([\s\S]{2,200}?)<\/span>/g)]
    .map((match) => String(match[1])
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((title) => title.length >= 4)
    .slice(0, topN);
}

export function analyzeSerp(
  html: string,
  keyword: string,
  opts: { nowMs?: number; thresholds?: SerpWinnabilityThresholds } = {},
): SerpAnalysis {
  const thresholds = opts.thresholds ?? DEFAULT_SERP_THRESHOLDS;
  const nowMs = opts.nowMs ?? Date.now();

  const titles = extractTitles(html, thresholds.topN);
  const coverages = titles.map((title) => titleCoverage(title, keyword));

  const dateTokens = [...html.matchAll(/>(\d+\s*(?:시간|일|주|개월)\s*전|20\d\d\.\d\d\.\d\d)</g)]
    .map((match) => String(match[1]).trim());
  const daysAgo = dateTokens
    .map((token) => parseDaysAgo(token, nowMs))
    .filter((days): days is number => days !== null)
    .slice(0, thresholds.topN);
  const sorted = [...daysAgo].sort((a, b) => a - b);
  const medianDaysAgo = sorted.length > 0 ? (sorted[Math.floor(sorted.length / 2)] as number) : null;

  return {
    sampledTitles: titles.length,
    exactTitleHits: coverages.filter((c) => c >= thresholds.exactCoverage).length,
    partialTitleHits: coverages.filter((c) => c >= thresholds.partialCoverage && c < thresholds.exactCoverage).length,
    medianDaysAgo,
    influencer: (html.match(/인플루언서/g) || []).length,
    topTitles: titles.slice(0, 3),
  };
}

/**
 * 판정 — 상위에 그 질문을 제목으로 정면으로 다룬 글이 적을수록 선점 여지가 크다.
 */
export function verdictFor(
  serp: SerpAnalysis,
  thresholds: SerpWinnabilityThresholds = DEFAULT_SERP_THRESHOLDS,
): SerpVerdict {
  if (serp.sampledTitles < thresholds.minSampledTitles) {
    return { verdict: 'NO_DATA', reason: '상위 글 제목을 읽지 못함 — 판정 보류' };
  }
  const { exactTitleHits: exact, partialTitleHits: partial, sampledTitles: n } = serp;
  if (exact === 0 && partial <= thresholds.winnableMaxPartial) {
    return {
      verdict: 'WINNABLE',
      reason: `상위 ${n}개 중 제목 정면 대응 0건(부분 ${partial}건) — 정면으로 답한 글 없음`,
    };
  }
  if (exact <= thresholds.contestedMaxExact) {
    return {
      verdict: 'CONTESTED',
      reason: `제목 정확 일치 ${exact}건 / 부분 ${partial}건 — 경쟁 있으나 여지 있음`,
    };
  }
  return { verdict: 'LOCKED', reason: `제목 정확 일치 ${exact}건 — 이미 정면으로 다뤄짐` };
}
