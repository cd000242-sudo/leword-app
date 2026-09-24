import { extractDates, timingOfFact } from './topic-brief-dates';
import { sanitizeTitles } from './topic-brief-titles';
import { validateEditorial, claimIssue, isNarrowerKeyword, finalizeBriefRecommendations, serpFitOf } from './topic-brief-evidence';
export * from './topic-brief-dates';
export * from './topic-brief-prompt';
export * from './topic-brief-titles';
export * from './topic-brief-rounds';
export { normalizeBriefForDisplay, normalizeLegacyBrief, finalizeBriefRecommendations, serpFitOf } from './topic-brief-evidence';

/**
 * 오늘의 글감 브리프 — NOW / NEXT / ALWAYS (2026-09-09, 사장님 예시 형식).
 *
 * 황금키워드 보드는 검색광고 키워드에서 출발해 황금비로 거른다. 사장님이 원하는 것은 그게 아니라
 * **날짜가 박힌 공식 사실(시행·접수·출시·개봉·접종·축제·예매·발표)에서 나온 글감**이다:
 *   제목 · 시기(NOW 지금/NEXT 예정/ALWAYS 지속) · 유형 · Primary Intent · 작성가치 · 경험활용 · 차별화 · SERP 경쟁 적합성.
 *
 * 이 파일은 순수 함수만 둔다(네트워크·LLM 은 scripts/topic-briefs.js). 원칙:
 *   1) 사실 카드는 뉴스 API 실측 기사다. 카드에 없는 날짜·숫자는 브리프에 못 들어간다(검증기가 떨어뜨린다).
 *   2) 시기는 카드의 날짜로 정한다 — 모델이 정하지 않는다.
 *   3) SERP 경쟁 적합성은 실측 정면 글 수로만 매긴다. 안 쟀으면 '미측정'이다.
 */

export type BriefTiming = 'NOW' | 'NEXT' | 'ALWAYS';

export interface FactCard {
  id: string;
  field: string;
  title: string;
  snippet: string;
  press: string;
  link: string;
  newsUrl?: string;
  body?: string;
  sourceLevel?: 'description' | 'body';
  /** 기사 발행 시각(ISO) */
  publishedAt: string;
  /** 본문·제목에서 읽은 날짜(ISO, 연도는 발행일 기준으로 보정) */
  dates: string[];
}

export interface BriefDraft {
  title: string;
  /** 제목 후보 — 모델이 같은 답에 함께 낸다. 다듬기 전 날것이라 검증기가 sanitizeTitles 로 거른다. */
  titles?: BriefTitle[];
  timing: BriefTiming;
  types: string[];
  primaryIntent: string;
  value: string;
  experience: string;
  differentiation: string;
  coreKeyword: string;
  /** 글감 주제를 대표하는 검색어를 먼저, 이어서 의미를 보존하는 좁은 검색어. */
  keywords: string[];
  factIds: string[];
  editorial?: BriefEditorial;
}

export interface BriefEditorial {
  version: 2;
  status: 'supported' | 'needs_research';
  summary: string;
  audience: string;
  answers: Array<{ question: string; answer: string; factIds: string[]; excerpts: Array<{ factId: string; text: string }> }>;
  missing: string[];
  outline: string[];
  angle: string;
  review?: { passed: boolean; issues: string[] };
}

export interface TopicBrief extends BriefDraft {
  field: string;
  facts: Array<{ id: string; title: string; snippet?: string; evidenceExcerpts?: string[]; press: string; link: string; publishedAt: string }>;
  recommendation?: { keyword: string; reason: string };
  searchVolume: number | null;
  /** 검색광고가 '< 10' 으로 답한 검색어 — 잰 것이지 안 잰 게 아니다 */
  searchVolumeUnder10?: boolean;
  serpFacing: number | null;
  serpVacancy: number | null;
  serpFit: '높음' | '보통' | '낮음' | '미측정';
  star: boolean;
  /**
   * 대안 검색어 — 핵심 검색어가 '낮음/보통'일 때, 같은 주제의 더 좁은 검색어 중 자리를 실측해 열린 것
   * (사장님 2026-09-09 "SERP 적합성이 낮으면 그 글을 쓰면 별로 안 좋은 거 아니야"). 없으면 null = 재 봤는데 없음, 미정의 = 안 잼.
   */
  alternative?: BriefAlternative | null;
  /**
   * 같이 넣을 말 — 이 글감으로 글을 쓸 때 본문에 함께 담을 좁은 검색어들
   * (사장님 2026-09-10 "확장키워드나 연관키워드도 같이 보여주면 그걸로 글 쓸 수 있게").
   * 전부 검색광고 실측 연관어이고 검색량은 실측이다. 지어낸 말은 넣지 않는다.
   * 미정의 = 안 골랐음(검색광고 키가 없거나 회차가 잘림), 빈 배열 = 골랐는데 쓸 게 없었음.
   */
  related?: BriefRelated[];
  /**
   * 제목 후보 — 유형이 서로 다른 3~4개(사장님 2026-09-10 "제목도 같이 보여주면 더 좋잖아, 여러 가지 유형으로").
   * 글감을 쓰는 에이전트가 같은 호출에서 함께 낸다 — 호출이 안 는다.
   * 교리(feedback_home_title_doctrine): AI 티가 나면 네이버에서 노출이 죽는다. 금지어·쉼표 이분법은 검증기가 떨어뜨린다.
   */
  titles?: BriefTitle[];
}

export interface BriefTitle {
  /** 제목의 문장 형태. 검색 노출·AI 인용 성과를 뜻하지 않는다. */
  target: '설명' | '질문' | '수치' | null;
  /** 질문형 · 설명형 · 비교형 · 시기형 */
  type: string;
  text: string;
}

export interface BriefRelated {
  keyword: string;
  /** 월간 검색량 실측. */
  searchVolume: number;
  /**
   * 자리 실측 — 이 말로 지금 쓰면 들어갈 수 있나(사장님 2026-09-10
   * "특히 지금 쓰면 노출될 확률이 높은 키워드를 보여줘야 돼").
   * 안 잰 것은 미정의다. '정면 0'과 '안 쟀다'는 다르다.
   */
  serpFacing?: number | null;
  serpVacancy?: number | null;
  serpFit?: TopicBrief['serpFit'];
}

export interface BriefAlternative {
  keyword: string;
  searchVolume: number | null;
  serpFacing: number | null;
  serpVacancy: number | null;
  serpFit: '높음' | '보통' | '낮음' | '미측정';
}

/** 분야와 뉴스 질의 — 공식 신호어(시행·접수·출시·개봉·접종·축제·예매·발표)를 섞는다. */
export const BRIEF_FIELDS: ReadonlyArray<{ field: string; queries: string[] }> = Object.freeze([
  { field: '정책·사회·법률·복지', queries: ['개정 시행 법령 달라지는', '지원금 신청 접수 시작', '복지 급여 기준 발표'] },
  { field: '생활경제·금융·부동산·명절', queries: ['상품권 할인 발행 일정', '금리 발표 대출', '추석 할인 지원 농축산물'] },
  { field: '취업·교육', queries: ['원서접수 일정 대학', '장려금 신청 청년 채용', '수능 일정 발표'] },
  { field: 'AI·IT·전자기기·앱', queries: ['출시 사전예약 신제품', '업데이트 새 기능 공개', 'AI 모델 발표 출시'] },
  { field: '게임', queries: ['게임 출시 예정 발매일', '게임 사전예약 시작'] },
  { field: '스포츠', queries: ['KBO 순위 경쟁 남은 경기', '대표팀 경기 일정 발표'] },
  { field: '연예·OTT·영화·문화', queries: ['공개 시즌 넷플릭스 디즈니', '개봉 예정 영화 확정', '전시 개막 공연 티켓'] },
  { field: '건강', queries: ['예방접종 무료 시작 일정', '질병관리청 주의 당부 증가'] },
  { field: '과학·우주', queries: ['발사 예정 위성 누리호', '연구 발표 국내 첫'] },
  { field: '국내여행·로컬·시즌', queries: ['축제 개최 일정 9월', '예매 시작 연휴 열차', '가을 여행지 추천 공개'] },
  { field: '쇼핑·뷰티·환절기', queries: ['기획전 세일 일정 올리브영', '환절기 신제품 출시'] },
  { field: '육아·가족', queries: ['아동수당 부모급여 지급', '육아 지원 신청 시작'] },
  { field: '반려동물', queries: ['동물등록 자진신고 기간', '반려동물 지원 시행'] },
]);

const HTML_TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = { '&quot;': '"', '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

export function cleanText(text: string): string {
  return String(text || '').replace(HTML_TAG, '').replace(/&(?:quot|#39|amp|lt|gt|nbsp);/g, (m) => ENTITY[m] || m).replace(/\s+/g, ' ').trim();
}

/** 뉴스 API 항목 → 사실 카드. 같은 제목은 한 번만. */
export function toFactCards(items: Array<Record<string, unknown>>, field: string, seen = new Set<string>()): FactCard[] {
  const out: FactCard[] = [];
  for (const item of items || []) {
    const title = cleanText(String(item.title || ''));
    if (title.length < 8) continue;
    const key = title.replace(/\s+/g, '').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = cleanText(String(item.description || ''));
    const published = new Date(String(item.pubDate || ''));
    if (Number.isNaN(published.getTime())) continue;
    const publishedAt = published.toISOString();
    const link = String(item.originallink || item.link || '');
    let press = '';
    try { press = new URL(link).hostname.replace(/^www\./, ''); } catch { press = ''; }
    out.push({
      id: `f${seen.size}`,
      field,
      title,
      snippet,
      press,
      link,
      newsUrl: String(item.link || '').replace(/^http:\/\/((?:n\.|m\.|www\.)?news\.naver\.com)\//i, 'https://$1/'),
      sourceLevel: 'description',
      publishedAt,
      dates: extractDates(`${title} ${snippet}`, publishedAt),
    });
  }
  return out;
}

export interface ValidationResult { ok: TopicBrief[]; dropped: Array<{ title: string; reason: string }> }

/** 모델 출력 검증 — 카드 인용·날짜 근거·시기 일치. 통과한 것만 브리프다. */
export function validateBriefs(raw: unknown, facts: FactCard[], field: string, today: Date): ValidationResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ok: TopicBrief[] = [];
  const dropped: Array<{ title: string; reason: string }> = [];
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const d = item as Partial<BriefDraft>;
    const title = cleanText(String(d?.title || ''));
    if (title.length < 8) { dropped.push({ title: title || '(제목 없음)', reason: '제목 없음' }); continue; }
    // "[f3]"·"f3 "·"F3" 처럼 적어도 받는다 — 게임 분야 회차가 표기 차이로 통째로 떨어졌다(2026-09-09 v3).
    const ids = [...new Set((Array.isArray(d.factIds) ? d.factIds : []).map((id) => String(id).toLowerCase().replace(/[^a-z0-9]/g, '')).filter((id) => byId.has(id)))];
    if (ids.length === 0) { dropped.push({ title, reason: '근거 카드 없음' }); continue; }
    const cited = ids.map((id) => byId.get(id) as FactCard);
    const timing = (['NOW', 'NEXT', 'ALWAYS'] as const).find((t) => t === d.timing);
    if (!timing) { dropped.push({ title, reason: '시기 없음' }); continue; }
    const value = cleanText(String(d.value || ''));
    // 시기 검증: NEXT 는 인용 카드에 미래 날짜가 있어야, NOW 는 최근 카드가 있어야
    const factTimings = cited.map((f) => timingOfFact(f, today));
    if (timing === 'NEXT' && !factTimings.includes('NEXT')) { dropped.push({ title, reason: 'NEXT 인데 미래 날짜 근거 없음' }); continue; }
    if (timing === 'NOW' && !factTimings.includes('NOW') && !factTimings.includes('NEXT')) { dropped.push({ title, reason: 'NOW 인데 최근 근거 없음' }); continue; }
    const keywords = [...new Set(
      [d.coreKeyword, ...(Array.isArray(d.keywords) ? d.keywords : [])]
        .map((k) => cleanText(String(k || '')).slice(0, 40))
        .filter((k) => k.length >= 2 && k.split(/\s+/).length <= 4),
    )].slice(0, 3);
    const coreKeyword = keywords[0] || '';
    if (!coreKeyword) { dropped.push({ title, reason: '핵심 검색어 없음' }); continue; }
    const issue = [title, value, d.primaryIntent, d.experience, d.differentiation, coreKeyword, ...(Array.isArray(d.types) ? d.types : [])]
      .map(content => claimIssue(content, cited, today)).find(Boolean);
    if (issue) { dropped.push({ title, reason: issue }); continue; }
    const narrowKeywords = keywords.filter(k => k === coreKeyword || isNarrowerKeyword(coreKeyword, k));
    const editorial = validateEditorial(d.editorial, cited, today);
    // 생성 모델이 review를 출력해도 검토 완료로 취급하지 않는다. 독립 검토가 나중에 붙인다.
    delete editorial.review;
    ok.push({
      title,
      timing,
      types: (Array.isArray(d.types) ? d.types : []).map(String).filter(Boolean).slice(0, 2),
      primaryIntent: cleanText(String(d.primaryIntent || '')),
      value,
      experience: cleanText(String(d.experience || '')),
      differentiation: cleanText(String(d.differentiation || '')),
      coreKeyword,
      keywords: narrowKeywords,
      factIds: ids,
      field,
      facts: cited.map((f) => ({ id: f.id, title: f.title, snippet: f.snippet.slice(0, 500), evidenceExcerpts: [...new Set([
        ...(editorial.summary && `${f.title}\n${f.snippet}\n${f.body || ''}`.includes(editorial.summary) ? [editorial.summary] : []),
        ...editorial.answers.flatMap(a => a.excerpts.filter(e => e.factId === f.id).map(e => e.text)),
      ])].slice(0, 16), press: f.press, link: f.link, publishedAt: f.publishedAt })),
      editorial,
      searchVolume: null,
      serpFacing: null,
      serpVacancy: null,
      serpFit: '미측정',
      star: false,
      // 제목 후보 — 교리에 걸리는 것은 여기서 버린다. 빈 배열이면 화면이 그 줄을 안 그린다.
      titles: sanitizeTitles(d.titles, title, 4, narrowKeywords).filter(t => !claimIssue(t.text, cited, today)),
    });
  }
  return { ok, dropped };
}

/**
 * 대상 검색어는 고정하고 그 검색어의 실측값만 반영한다. 인기 있는 넓은 말로 주제를 바꾸지 않는다.
 */
export function applyMeasuredVolumes(brief: TopicBrief, volumes: ReadonlyMap<string, number | null>): TopicBrief {
  const norm = (k: string) => k.replace(/\s+/g, '');
  if (!volumes.has(norm(brief.coreKeyword))) return brief;
  const volume = volumes.get(norm(brief.coreKeyword)) ?? null;
  return { ...brief, searchVolume: volume, searchVolumeUnder10: volume == null };
}

/** 기존 호출 계약을 유지하되 최종 추천은 근거 검토와 실제 대상 검색어의 측정값을 함께 요구한다. */
export function markStars(briefs: TopicBrief[]): TopicBrief[] {
  return finalizeBriefRecommendations(briefs);
}

/**
 * 대안 검색어 후보 — 브리프의 다른 후보 검색어 + 검색광고 연관어 중 같은 주제(핵심 검색어와 토큰 하나 이상 공유),
 * 검색량 100+, 5어절 이하, 핵심과 다른 것. 검색량 큰 순 limit 개. 자리는 호출 쪽이 잰다.
 */
/**
 * 같이 넣을 말 고르기 — 본문에 함께 담을 좁은 검색어.
 *
 * 대안 검색어(pickAltCandidates)와 무엇이 다른가: 고르는 규칙은 거의 같고 **검색량 하한**이 다르다.
 * 대안은 핵심 검색어를 **대신할** 하나라 트래픽이 있어야 한다(하한 100).
 * 이것은 그 글 안에 **같이 담을** 여럿이라 작아도 쓸모 있다(하한 10).
 * 그리고 같은 말이 두 곳(글감 자신의 후보 · 검색광고 연관어)에서 와도 한 번만 담는다.
 *
 * 규칙: 검색량 실측이 있는 것만 · 핵심 검색어 자신은 빼고 · 어절 5개 이하 ·
 * 핵심 검색어의 낱말을 하나라도 물고 있는 것 · 중복 제거 · 검색량 큰 순.
 */
export function pickRelatedKeywords(
  brief: Pick<TopicBrief, 'coreKeyword' | 'keywords'>,
  suggestions: ReadonlyArray<{ keyword: string; totalSearchVolume: number | null }>,
  volumesOfOwn: ReadonlyMap<string, number | null>,
  limit = 6,
): BriefRelated[] {
  const norm = (k: string) => k.replace(/\s+/g, '').toLowerCase();
  const core = norm(brief.coreKeyword);
  const pool = new Map<string, number>();
  for (const k of brief.keywords) {
    const v = volumesOfOwn.get(k.replace(/\s+/g, ''));
    if (typeof v === 'number') pool.set(k, v);
  }
  for (const s of suggestions) if (typeof s.totalSearchVolume === 'number') pool.set(s.keyword, s.totalSearchVolume);
  const seen = new Set<string>();
  return [...pool.entries()]
    .filter(([k, v]) => {
      if (v < 10 || norm(k) === core) return false;
      if (k.trim().split(/\s+/).length > 5) return false;
      if (!isNarrowerKeyword(brief.coreKeyword, k)) return false;
      if (seen.has(norm(k))) return false;
      seen.add(norm(k));
      return true;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, searchVolume]) => ({ keyword, searchVolume }));
}

export function pickAltCandidates(
  brief: Pick<TopicBrief, 'coreKeyword' | 'keywords'>,
  suggestions: ReadonlyArray<{ keyword: string; totalSearchVolume: number | null }>,
  volumesOfOwn: ReadonlyMap<string, number | null>,
  limit = 3,
): Array<{ keyword: string; searchVolume: number }> {
  const norm = (k: string) => k.replace(/\s+/g, '').toLowerCase();
  const core = norm(brief.coreKeyword);
  const pool = new Map<string, number>();
  for (const k of brief.keywords) {
    // 검색량 지도는 스크립트가 공백만 걷은 키로 둔다(applyMeasuredVolumes 와 같은 키).
    const v = volumesOfOwn.get(k.replace(/\s+/g, ''));
    if (typeof v === 'number') pool.set(k, v);
  }
  for (const s of suggestions) if (typeof s.totalSearchVolume === 'number') pool.set(s.keyword, s.totalSearchVolume);
  return [...pool.entries()]
    .filter(([k, v]) => v >= 100 && norm(k) !== core && isNarrowerKeyword(brief.coreKeyword, k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, searchVolume]) => ({ keyword, searchVolume }));
}

/** 잰 대안 중 고르기 — 열린 것(높음) 우선, 없으면 정면 글이 가장 적은 것. 하나도 못 쟀으면 null. */
export function chooseAlternative(measured: ReadonlyArray<BriefAlternative>): BriefAlternative | null {
  const rank = (f: BriefAlternative['serpFit']) => (f === '높음' ? 0 : f === '보통' ? 1 : f === '낮음' ? 2 : 3);
  const sorted = [...measured].filter((m) => m.serpFit !== '미측정').sort((a, b) => rank(a.serpFit) - rank(b.serpFit) || ((a.serpFacing ?? 99) - (b.serpFacing ?? 99)) || ((b.searchVolume ?? 0) - (a.searchVolume ?? 0)));
  return sorted[0] ?? null;
}
