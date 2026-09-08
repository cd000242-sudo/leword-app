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
  /** 기사 발행 시각(ISO) */
  publishedAt: string;
  /** 본문·제목에서 읽은 날짜(ISO, 연도는 발행일 기준으로 보정) */
  dates: string[];
}

export interface BriefDraft {
  title: string;
  timing: BriefTiming;
  types: string[];
  primaryIntent: string;
  value: string;
  experience: string;
  differentiation: string;
  coreKeyword: string;
  /** 실제로 치는 검색어 후보(넓은 것부터) — 검색량을 재서 가장 큰 것이 coreKeyword 가 된다 */
  keywords: string[];
  factIds: string[];
}

export interface TopicBrief extends BriefDraft {
  field: string;
  facts: Array<{ id: string; title: string; press: string; link: string; publishedAt: string }>;
  searchVolume: number | null;
  /** 검색광고가 '< 10' 으로 답한 검색어 — 잰 것이지 안 잰 게 아니다 */
  searchVolumeUnder10?: boolean;
  serpFacing: number | null;
  serpVacancy: number | null;
  serpFit: '높음' | '보통' | '낮음' | '미측정';
  star: boolean;
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

/**
 * "9월 11일" · "10월 7일" · "2026년 9월 21일" 을 ISO 로. 연도가 없으면 발행일 연도로 두되,
 * 발행일보다 6개월 이상 과거로 떨어지면 다음 해로 본다(12월 기사의 '1월 3일').
 */
export function extractDates(text: string, publishedAt: string): string[] {
  const base = new Date(publishedAt);
  const valid = !Number.isNaN(base.getTime());
  const baseYear = valid ? base.getUTCFullYear() : new Date().getUTCFullYear();
  const baseMonth = valid ? base.getUTCMonth() + 1 : new Date().getUTCMonth() + 1;
  const baseDay = valid ? base.getUTCDate() : 1;
  const out = new Set<string>();
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const src = String(text || '');
  const re = /(?:(20\d\d)년\s*)?(\d{1,2})월\s*(\d{1,2})일/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    let year = m[1] ? Number(m[1]) : baseYear;
    if (!m[1] && valid) {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getTime() < base.getTime() - 183 * 24 * 3600 * 1000) year += 1;
    }
    out.add(iso(year, month, day));
  }
  /*
   * 기사는 "오는 11일부터"·"지난 3일"·"내달 1일" 처럼 달 없이 날만 쓰는 게 더 흔하다(2026-09-09 첫 실주행에서
   * 모델이 옮긴 9월 11일이 카드에 '11일'로만 있어 검증기가 떨어뜨렸다). 발행일 기준으로 달을 정한다:
   * 내달/다음달 → 다음 달, 지난 → 발행일 이전(같은 달이거나 지난 달), 오는·맨 날 → 발행일 이후(같은 달이거나 다음 달).
   */
  const rest = src.replace(re, ' '); // 달이 붙은 날짜는 위에서 읽었다 — 그 '일'을 또 세지 않는다
  const bare = /(내달|다음\s*달|지난|오는)?\s*(?<![0-9])(\d{1,2})일(?!\s*(?:간|째|만|분|차|정|후|전|이내|이상|이하|[0-9]))/g;
  while ((m = bare.exec(rest))) {
    const day = Number(m[2]);
    if (day < 1 || day > 31) continue;
    const hint = (m[1] || '').replace(/\s+/g, '');
    let year = baseYear;
    let month = baseMonth;
    const shift = (delta: number) => { month += delta; if (month > 12) { month = 1; year += 1; } if (month < 1) { month = 12; year -= 1; } };
    if (hint === '내달' || hint === '다음달') shift(1);
    else if (hint === '지난') { if (day > baseDay) shift(-1); }
    else if (day < baseDay) shift(1);
    out.add(iso(year, month, day));
  }
  return [...out].sort();
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
    const publishedAt = new Date(String(item.pubDate || '')).toISOString();
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
      publishedAt,
      dates: extractDates(`${title} ${snippet}`, publishedAt),
    });
  }
  return out;
}

/** 오늘(KST) — ISO 날짜 자리가 한국 날짜가 되도록 9시간 민 Date. 표기·시기 판정에만 쓴다. */
export function kstToday(now = new Date()): Date {
  return new Date(now.getTime() + 9 * 3600 * 1000);
}

/** 카드의 시기 — 미래 날짜가 있으면 NEXT, 최근 5일 안이면 NOW, 그 밖은 null(브리프 근거로만). */
export function timingOfFact(fact: FactCard, today: Date): BriefTiming | null {
  const todayIso = today.toISOString().slice(0, 10);
  if (fact.dates.some((d) => d > todayIso)) return 'NEXT';
  const age = today.getTime() - new Date(fact.publishedAt).getTime();
  if (age >= 0 && age <= 5 * 24 * 3600 * 1000) return 'NOW';
  return null;
}

/** 모델에게 주는 사실 묶음 — 분야당 상한, 최신순. */
export function pickFactsForPrompt(facts: FactCard[], today: Date, limit = 18): FactCard[] {
  return [...facts]
    .filter((f) => timingOfFact(f, today) !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

export function buildBriefPrompt(field: string, facts: FactCard[], today: Date, maxBriefs = 3): string {
  const todayText = today.toISOString().slice(0, 10);
  const factLines = facts.map((f) => `[${f.id}] (${f.publishedAt.slice(0, 10)} · ${f.press}) ${f.title} — ${f.snippet.slice(0, 160)}${f.dates.length ? ` · 날짜: ${f.dates.join(', ')}` : ''}`);
  return [
    `오늘은 ${todayText}(KST)다. 너는 네이버 블로그 글감 편집자다. 아래는 뉴스 API 로 실측한 사실 카드다(분야: ${field}).`,
    '카드에 없는 사실·날짜·숫자는 절대 쓰지 마라. 모르면 그 브리프를 만들지 마라.',
    '',
    ...factLines,
    '',
    `이 분야에서 블로그 글로 쓸 만한 글감을 최대 ${maxBriefs}개 골라라. 뉴스 요약이 아니라 "검색하는 사람이 원하는 답"이 글감이다.`,
    '각 글감은 JSON 객체다:',
    '{"title": "글 제목(구체적·날짜/조건 포함, 30자 안팎, 낚시 금지)",',
    ' "timing": "NOW|NEXT|ALWAYS",  // NOW=이번 주 안에 찾는 것, NEXT=날짜가 정해진 예정, ALWAYS=철 안 타는 기준·제도',
    ' "types": ["해설형","가이드형","비교형","문제해결형","정보형","팩트체크형","큐레이션형" 중 1~2개],',
    ' "primaryIntent": "검색자가 손에 넣고 싶은 것 한 문장",',
    ' "value": "왜 지금 쓸 가치가 있나 — 카드의 사실만으로 2문장, 날짜·숫자는 카드 그대로. 날짜는 \'9월 21일\' 꼴로(2026-09-21 같은 표기 금지)",',
    ' "experience": "직접 경험이 있으면 어디에 쓰나 / 없으면 무엇을 쓰면 안 되나(후기 날조 금지)",',
    ' "differentiation": "이미 있는 글과 다르게 만드는 구조 한 문장",',
    ' "keywords": ["사람들이 네이버에 실제로 치는 검색어 2~3개, 넓은 것부터. 1~3어절, 조사·설명 없이. 예: \'독감 무료접종\', \'독감 무료접종 대상\'. \'가을 진드기 물림 예방 수칙\' 같은 문장형 금지"],',
    ' "factIds": ["근거 카드 id 1개 이상"]}',
    '',
    '최종 출력은 JSON 배열 하나만. 설명·머리말 없이.',
  ].join('\n');
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
    const ids = Array.isArray(d.factIds) ? d.factIds.map(String).filter((id) => byId.has(id)) : [];
    if (ids.length === 0) { dropped.push({ title, reason: '근거 카드 없음' }); continue; }
    const cited = ids.map((id) => byId.get(id) as FactCard);
    const timing = (['NOW', 'NEXT', 'ALWAYS'] as const).find((t) => t === d.timing);
    if (!timing) { dropped.push({ title, reason: '시기 없음' }); continue; }
    const value = cleanText(String(d.value || ''));
    // value 안의 날짜는 인용 카드 어딘가에 있어야 한다 — 날조 차단
    /*
     * 날짜 근거 비교는 '날'이 같고 '달'이 한 달 안이면 같은 날짜로 본다 — 브리프는 오늘 기준, 카드는 발행일 기준으로
     * 달·해를 붙이므로 달 없는 "8일"이 양쪽에서 다른 달로 풀릴 수 있다(테스트 실증). 카드의 발행일(KST)도 근거다:
     * "8일 복지부가 발표했다"는 기사 본문이 아니라 발행일에서 온다(v2 실주행에서 3건 오탈락).
     */
    const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
    const sameDate = (a: string, b: string) => a.slice(8) === b.slice(8) && Math.abs(monthIndex(a) - monthIndex(b)) <= 1;
    const valueDates = extractDates(value, today.toISOString());
    const citedDates = cited.flatMap((f) => [...f.dates, kstToday(new Date(f.publishedAt)).toISOString().slice(0, 10)]);
    const foreign = valueDates.filter((x) => !citedDates.some((c) => sameDate(x, c)));
    if (foreign.length > 0) { dropped.push({ title, reason: `근거에 없는 날짜 ${foreign.join(',')}` }); continue; }
    // 시기 검증: NEXT 는 인용 카드에 미래 날짜가 있어야, NOW 는 최근 카드가 있어야
    const factTimings = cited.map((f) => timingOfFact(f, today));
    if (timing === 'NEXT' && !factTimings.includes('NEXT')) { dropped.push({ title, reason: 'NEXT 인데 미래 날짜 근거 없음' }); continue; }
    if (timing === 'NOW' && !factTimings.includes('NOW') && !factTimings.includes('NEXT')) { dropped.push({ title, reason: 'NOW 인데 최근 근거 없음' }); continue; }
    const keywords = [...new Set(
      [...(Array.isArray(d.keywords) ? d.keywords : []), d.coreKeyword]
        .map((k) => cleanText(String(k || '')).slice(0, 40))
        .filter((k) => k.length >= 2 && k.split(/\s+/).length <= 4),
    )].slice(0, 3);
    const coreKeyword = keywords[0] || '';
    if (!coreKeyword) { dropped.push({ title, reason: '핵심 검색어 없음' }); continue; }
    ok.push({
      title,
      timing,
      types: (Array.isArray(d.types) ? d.types : []).map(String).filter(Boolean).slice(0, 2),
      primaryIntent: cleanText(String(d.primaryIntent || '')),
      value,
      experience: cleanText(String(d.experience || '')),
      differentiation: cleanText(String(d.differentiation || '')),
      coreKeyword,
      keywords,
      factIds: ids,
      field,
      facts: cited.map((f) => ({ id: f.id, title: f.title, press: f.press, link: f.link, publishedAt: f.publishedAt })),
      searchVolume: null,
      serpFacing: null,
      serpVacancy: null,
      serpFit: '미측정',
      star: false,
    });
  }
  return { ok, dropped };
}

/**
 * 검색량 실측 반영 — 후보 검색어 중 검색량이 가장 큰 것을 핵심 검색어로 올린다. null 은 검색광고가 '< 10' 으로 답한 것.
 * 첫 실주행(2026-09-09)에서 모델이 '가을 진드기 물림 예방 수칙' 같은 문장형을 내 25건 중 22건이 <10 이었다.
 */
export function applyMeasuredVolumes(brief: TopicBrief, volumes: ReadonlyMap<string, number | null>): TopicBrief {
  const norm = (k: string) => k.replace(/\s+/g, '');
  const measured = brief.keywords.filter((k) => volumes.has(norm(k)));
  if (measured.length === 0) return brief;
  const best = measured.reduce((a, b) => ((volumes.get(norm(b)) ?? -1) > (volumes.get(norm(a)) ?? -1) ? b : a));
  const volume = volumes.get(norm(best)) ?? null;
  return { ...brief, coreKeyword: best, searchVolume: volume, searchVolumeUnder10: volume == null };
}

/** SERP 경쟁 적합성 — 실측 정면 글 수로만. 높음은 상위노출 보장이 아니다. */
export function serpFitOf(facing: number | null, vacancy: number | null): TopicBrief['serpFit'] {
  if (facing == null) return '미측정';
  if (facing <= 2 || (vacancy != null && vacancy <= 3)) return '높음';
  if (facing <= 5) return '보통';
  return '낮음';
}

/** ★ — 실측이 뒷받침하는 것만: 적합성 높음이면서 검색량이 있거나(≥500) NOW/NEXT 로 날짜가 박힌 것. */
export function markStars(briefs: TopicBrief[]): TopicBrief[] {
  return briefs.map((b) => ({
    ...b,
    star: b.serpFit === '높음' && ((b.searchVolume != null && b.searchVolume >= 500) || b.timing !== 'ALWAYS'),
  }));
}
