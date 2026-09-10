/**
 * 내 순위 실측 — 봉투("내가 이겨본 크기")의 원료.
 *
 * 사장님 2026-09-10 "초보자들에게 엄청난 도움을 주는 게 목적이야".
 *
 * 이 단계가 답하는 것: "내 글이 어느 검색어에서 실제로 몇 위인가."
 * 그걸 알아야 "이건 네가 이겨본 크기다"라고 말할 수 있다. 남의 기준이 아니라 내 성적표다.
 *
 * 흐름: 내 글 제목 → 검색어 후보 → 검색량 실측(검색광고) → 검색량이 잡힌 것만 순위 실측
 *       → 1페이지에 든 것만 문서수·정면 글까지 재서 봉투로.
 *
 * 왜 검색량이 잡힌 것만 재나: 검색광고가 모르는 말은 사람들이 안 치는 말이다. 그런 말에서 1위를
 * 해도 "이겼다"고 셀 수 없다. 그 판단을 우리가 규칙으로 하지 않고 실측에 맡긴다.
 *
 * 회선은 자리 실측기와 같은 규칙을 쓴다 — 직렬 · 요청 사이 1.2~1.8초 · 403/429 는 못 잼 · 5연속이면 멈춤.
 * 순위는 검색 화면을 직접 받아 data-url 로 센다(오픈 API 순서는 노출 순위가 아니다).
 */
import { getNaverSearchAdKeywordVolume, exactSearchAdTotal } from '../../utils/naver-searchad-api';
import { getNaverBlogDocumentCount } from '../../utils/naver-blog-api';
import { extractResultOrder, findRankInOrder, NAVER_TABS } from '../../utils/naver-serp-rank';
import { analyzeSerp } from '../../utils/serp-winnability';
import { localSerpFetch, localSerpStats } from '../../utils/local-serp-fetch';
import { collectCandidates, type TitleCandidate } from '../../utils/blog-class/title-candidates';
import { buildEnvelope, type BlogEnvelope, type WonRow } from '../../utils/blog-class/envelope';

/** 검색광고는 한 번에 5개씩 받는다(도구 규격). */
const VOLUME_BATCH = 5;
/** 검색광고가 이 아래로 답하면 사람들이 실제로 치는 말로 보지 않는다. */
const MIN_VOLUME = 10;

export interface RankStepOptions {
  /** 순위를 잴 검색어 상한. 건당 약 2초다. */
  maxRank?: number;
  onProgress?: (p: { phase: '검색어' | '순위' | '자리'; done: number; total: number; message: string }) => void;
  shouldAbort?: () => boolean;
  /**
   * 잰 줄이 생길 때마다 부른다 — 부르는 쪽이 그 자리에서 저장하라고.
   *
   * 왜(실측 사고 2026-09-10): 이 단계는 다 끝난 뒤에만 결과를 돌려줬다. 표본 200개면
   * 검색량 조회 120회 + 순위 80건(직렬·건당 약 2초)이라 한 회차가 몇 분이다.
   * 그 사이 앱을 닫으면 잰 것이 통째로 사라지고, 그래서 '내 크기'가 계속 빈칸이었다.
   */
  onRows?: (rows: readonly WonRow[]) => void;
}

export interface RankStepResult {
  rows: WonRow[];
  envelope: BlogEnvelope | null;
  summary: { candidates: number; withVolume: number; ranked: number; won: number; blocked: number; seconds: number };
}

const blogTabUrl = (keyword: string) =>
  `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;

/**
 * 내 글이 이 검색어의 블로그 탭에서 몇 위인가.
 * 순위와 자리(상위 10 정면 글)를 **한 장의 HTML** 에서 같이 읽는다 — 두 번 받지 않는다.
 */
async function measureOne(keyword: string, postUrl: string): Promise<{
  rank: number | null; sampled: number; facing: number | null; blocked: boolean;
}> {
  const res = await localSerpFetch(blogTabUrl(keyword));
  if (!res.ok || !res.body) return { rank: null, sampled: 0, facing: null, blocked: Boolean(res.rateLimited) };
  const { order } = extractResultOrder(res.body);
  const rank = order.length > 0 ? findRankInOrder(order, postUrl) : null;
  const analysis = analyzeSerp(res.body, keyword);
  return {
    rank,
    sampled: order.length,
    facing: analysis.sampledTitles >= 3 ? analysis.exactTitleHits : null,
    blocked: false,
  };
}

/**
 * 한 번 재고 봉투까지 만든다.
 * 글 목록은 blog-class 의 1단계가 이미 받아 둔 것을 그대로 물려받는다 — 다시 받지 않는다.
 */
export async function measureMyRanks(
  posts: ReadonlyArray<{ title: string; url: string; publishedOn: string | null; searchable?: boolean }>,
  adConfig: { accessLicense: string; secretKey: string; customerId: string },
  options: RankStepOptions = {},
): Promise<RankStepResult> {
  const started = Date.now();
  const report = options.onProgress ?? (() => {});
  const abort = options.shouldAbort ?? (() => false);
  const maxRank = Math.max(0, options.maxRank ?? 80);

  const candidates: TitleCandidate[] = collectCandidates(posts, 3);
  report({ phase: '검색어', done: 0, total: candidates.length, message: `제목에서 검색어 후보 ${candidates.length}개를 골랐어요` });

  // ── 검색량 — 사람들이 실제로 치는 말만 남긴다
  const withVolume: Array<TitleCandidate & { searchVolume: number }> = [];
  if (adConfig.accessLicense && adConfig.secretKey) {
    for (let i = 0; i < candidates.length && !abort(); i += VOLUME_BATCH) {
      const batch = candidates.slice(i, i + VOLUME_BATCH);
      try {
        const vols = await getNaverSearchAdKeywordVolume(adConfig as any, batch.map((c) => c.keyword));
        const byKey = new Map((vols || []).map((v: any) => [String(v.keyword || v.relKeyword || '').replace(/\s+/g, ''), v]));
        for (const c of batch) {
          const total = exactSearchAdTotal(byKey.get(c.keyword.replace(/\s+/g, '')) as any);
          if (typeof total === 'number' && total >= MIN_VOLUME) withVolume.push({ ...c, searchVolume: total });
        }
      } catch { /* 이 묶음만 건너뛴다 */ }
      report({
        phase: '검색어', done: Math.min(i + VOLUME_BATCH, candidates.length), total: candidates.length,
        message: `검색량 확인 ${Math.min(i + VOLUME_BATCH, candidates.length)}/${candidates.length} · 실제로 쓰이는 말 ${withVolume.length}개`,
      });
    }
  }

  // 검색량 큰 것부터 잰다 — 상한에서 끊겨도 값이 큰 자리부터 남는다.
  const targets = withVolume.sort((a, b) => b.searchVolume - a.searchVolume).slice(0, maxRank);

  // ── 순위 + 자리
  const rows: WonRow[] = [];
  let blocked = 0;
  for (let i = 0; i < targets.length && !abort(); i += 1) {
    const target = targets[i];
    report({
      phase: '순위', done: i + 1, total: targets.length,
      message: `내 순위 확인 ${i + 1}/${targets.length} · ${target.keyword}`,
    });
    const measured = await measureOne(target.keyword, target.postUrl);
    if (measured.blocked) {
      blocked += 1;
      if (localSerpStats().consecutiveBlocked >= 5) break;
      continue;
    }
    if (measured.sampled === 0) continue;
    rows.push({
      keyword: target.keyword,
      blogRank: measured.rank,
      searchVolume: target.searchVolume,
      documentCount: null,
      facing: measured.facing,
      postUrl: target.postUrl,
      publishedOn: target.publishedOn,
    });
    // 이 시점의 봉투는 문서수가 아직 비어 있어 buildEnvelope 가 스스로 null 을 준다 — 안전하다.
    options.onRows?.(rows);
  }

  // ── 이긴 것만 문서수 — 봉투의 한계선이 문서수라서 이긴 행에만 필요하다(오픈 API 도 아낀다)
  const won = rows.filter((row) => typeof row.blogRank === 'number' && row.blogRank <= 10);
  for (let i = 0; i < won.length && !abort(); i += 1) {
    report({ phase: '자리', done: i + 1, total: won.length, message: `이긴 자리 크기 확인 ${i + 1}/${won.length}` });
    try {
      const count = await getNaverBlogDocumentCount(won[i].keyword);
      if (typeof count === 'number') won[i].documentCount = count;
    } catch { /* 한 건 실패는 넘어간다 */ }
    // 문서수가 하나라도 채워지면 그때부터 봉투가 실제로 만들어진다. 바로 저장하게 알린다.
    options.onRows?.(rows);
  }

  return {
    rows,
    envelope: buildEnvelope(rows),
    summary: {
      candidates: candidates.length,
      withVolume: withVolume.length,
      ranked: rows.length,
      won: won.length,
      blocked,
      seconds: Math.round((Date.now() - started) / 1000),
    },
  };
}

export { NAVER_TABS };
