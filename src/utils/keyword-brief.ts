/**
 * 황금키워드 행의 글감 브리프 — 사장님 2026-09-09: "남겨놓은 키워드들에 대한 TMI가 상세해야 되지 않니?
 * 내 눈에는 이 황금키워드들은 오늘의 글감보다 약한데".
 *
 * 오늘의 글감(topic-briefs)과 같은 형식(Primary Intent · 작성가치 · 경험활용 · 차별화 · 추천 각도 · 시기)을
 * 키워드 행마다 붙인다. 재료는 두 가지뿐이고 둘 다 실측이다:
 *   1) 행의 실측 수치 — 검색량·문서수·빈자리·정면 글·광고 수·클릭률·SERP 구획·지식인 질문·추세·최초 관측
 *   2) 그 키워드로 뉴스 API 에서 실측한 사실 카드(제목·요약·발행일·날짜)
 * 검증기: 카드에 없는 날짜, 수치 목록에도 카드에도 없는 큰 숫자(100 이상)는 떨어뜨린다.
 */
import { cleanText, extractDates, kstToday, type BriefTiming, type FactCard } from './topic-briefs';

export interface KeywordBriefRow {
  keyword: string;
  topic?: string;
  searchVolume?: number | null;
  documentCount?: number | null;
  openSlot?: number | null;
  facingPosts?: number | null;
  serp?: { exactTitleHits?: number | null } | null;
  adDepth?: number | null;
  adCtrPc?: number | null;
  adCtrMobile?: number | null;
  serpSections?: string[] | null;
  kinCount?: number | null;
  kinTop?: Array<{ title?: string } | string> | null;
  evidence?: Array<{ code?: string; text?: string }> | null;
  whySearch?: { text?: string } | null;
  subKeywords?: Array<{ keyword?: string; searchVolume?: number | null }> | null;
  trend?: { label?: string } | null;
  timing?: string;
  peakMonth?: number | null;
  peakRecurring?: boolean | null;
}

export interface KeywordBrief {
  timing: BriefTiming;
  primaryIntent: string;
  value: string;
  experience: string;
  differentiation: string;
  angle: string;
  facts: Array<{ id: string; title: string; press: string; link: string; publishedAt: string }>;
  /** 어떤 재료로 썼나 — 화면 툴팁 */
  basis: string;
  builtAt: string;
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('ko-KR') : null);

/** 행의 실측 수치를 문장 목록으로 — 프롬프트 재료이자 검증기의 '허용 숫자' 출처. */
export function measuredLines(row: KeywordBriefRow): string[] {
  const lines: string[] = [];
  if (num(row.searchVolume)) lines.push(`월 검색량 ${num(row.searchVolume)}`);
  if (num(row.documentCount)) lines.push(`블로그 문서수 ${num(row.documentCount)}`);
  const facing = row.serp && typeof row.serp.exactTitleHits === 'number' ? row.serp.exactTitleHits : row.facingPosts;
  if (typeof row.openSlot === 'number') lines.push(`블로그탭 상위 10 중 ${row.openSlot}번째 자리가 비어 있음`);
  if (typeof facing === 'number') lines.push(`상위 10개 중 제목이 정면으로 같은 글 ${facing}건`);
  if (typeof row.adDepth === 'number') lines.push(`검색광고 광고 ${row.adDepth}개`);
  if (typeof row.adCtrPc === 'number') lines.push(`광고 클릭률 PC ${row.adCtrPc}%`);
  if (typeof row.adCtrMobile === 'number') lines.push(`광고 클릭률 모바일 ${row.adCtrMobile}%`);
  if (Array.isArray(row.serpSections) && row.serpSections.length) lines.push(`통합검색 구획 순서: ${row.serpSections.join(' → ')}`);
  if (typeof row.kinCount === 'number') lines.push(`지식인 질문 ${row.kinCount}건`);
  const kinTitles = (row.kinTop || []).map((k) => (typeof k === 'string' ? k : k.title || '')).filter(Boolean).slice(0, 3);
  if (kinTitles.length) lines.push(`지식인 질문 예: ${kinTitles.join(' / ')}`);
  if (row.trend && row.trend.label) lines.push(`30일 추세: ${row.trend.label}`);
  if (row.timing) lines.push(`시기 판정: ${row.timing}`);
  if (typeof row.peakMonth === 'number') lines.push(`검색 정점 달: ${row.peakMonth}월${row.peakRecurring ? '(해마다 반복)' : ''}`);
  for (const e of row.evidence || []) if (e && e.text && !lines.some((l) => l.includes(e.text as string))) lines.push(e.text);
  if (row.whySearch && row.whySearch.text) lines.push(`왜 지금 검색되나(앞선 추론): ${row.whySearch.text}`);
  const subs = (row.subKeywords || []).filter((s) => s && s.keyword).slice(0, 6).map((s) => `${s.keyword}${num(s.searchVolume) ? `(${num(s.searchVolume)})` : ''}`);
  if (subs.length) lines.push(`실측 파생 검색어: ${subs.join(', ')}`);
  return lines;
}

export function buildKeywordBriefPrompt(row: KeywordBriefRow, facts: FactCard[], today: Date): string {
  const todayText = today.toISOString().slice(0, 10);
  const factLines = facts.map((f) => `[${f.id}] (${f.publishedAt.slice(0, 10)} · ${f.press}) ${f.title} — ${f.snippet.slice(0, 160)}${f.dates.length ? ` · 날짜: ${f.dates.join(', ')}` : ''}`);
  return [
    `오늘은 ${todayText}(KST)다. 너는 네이버 블로그 글감 편집자다. 키워드 "${row.keyword}"${row.topic ? `(주제: ${row.topic})` : ''} 에 대해 아래 두 가지 실측 재료만으로 글감 브리프를 쓴다.`,
    '',
    '[실측 수치]',
    ...measuredLines(row).map((l) => `- ${l}`),
    '',
    facts.length ? '[이 키워드 관련 뉴스 사실 카드]' : '[뉴스 사실 카드 없음 — 날짜·사건을 지어내지 마라. 수치와 검색 의도로만 써라]',
    ...factLines,
    '',
    '재료에 없는 사실·날짜·숫자는 절대 쓰지 마라. 후기·경험을 지어내지 마라.',
    'JSON 객체 하나만 출력한다:',
    '{"timing": "NOW|NEXT|ALWAYS",  // NOW=이번 주 안에 찾는 것(카드에 최근 사건), NEXT=카드에 앞으로의 날짜, ALWAYS=철 안 타는 정보형',
    ' "primaryIntent": "검색하는 사람이 손에 넣고 싶은 것 한 문장",',
    ' "value": "왜 이 키워드로 지금 쓸 가치가 있나 — 실측 수치와 카드 사실만으로 2문장. 날짜는 \'9월 21일\' 꼴",',
    ' "experience": "직접 경험이 있으면 어디에 쓰나 / 없으면 무엇을 쓰면 안 되나",',
    ' "differentiation": "상위 정면 글과 다르게 만드는 구조 한 문장",',
    ' "angle": "추천 각도 — 글 하나를 어떤 질문에 답하는 글로 잡을지 한 문장",',
    ' "factIds": ["인용한 카드 id — 위 목록의 대괄호 안 id 그대로. 카드가 없으면 빈 배열"]}',
  ].join('\n');
}

/** 본문에서 100 이상 숫자를 뽑는다(쉼표·소수점 허용). 검증기가 '허용 숫자'와 대조한다. */
export function bigNumbersOf(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[0].replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 100) out.add(raw);
  }
  return [...out];
}

/**
 * 이 카드가 정말 그 키워드 얘기인가 — 대상 일치(2026-09-10).
 *
 * 왜 필요한가: 뉴스 API 가 그 검색어로 돌려줬다는 사실만으로는 같은 대상이라는 근거가 안 된다.
 * '아카메' 로 물으면 게임 캐릭터 기사도, 동명의 사람 기사도 온다. 대상이 어긋난 카드로 쓴 브리프는
 * 날짜·숫자가 다 맞아도 딴 얘기가 된다 — 날짜·숫자 검증만으로는 안 걸린다.
 *
 * 판정은 느슨하게 한다. 키워드의 **어절 중 하나라도** 카드 제목·요약에 있으면 통과다:
 *   · 띄어쓰기 변형('무릎 물찬' vs '무릎물찬')을 잡으려고 공백을 걷고 견준다
 *   · 두 글자 미만 어절은 아무 데나 걸리므로 근거로 안 센다
 * 좁게 잡으면 정상 별칭·표기 변형까지 떨어진다. 여기서 막으려는 것은 '한 어절도 안 겹치는' 카드다.
 */
export function factMatchesKeyword(fact: { title: string; snippet: string }, keyword: string): boolean {
  // 대소문자를 맞춘다 — 'CrazyGames' 기사와 'crazygames' 검색어가 안 겹치면 정상 카드가 떨어진다.
  const flat = (t: string) => String(t || '').replace(/\s+/g, '').toLowerCase();
  const hay = flat(`${fact.title} ${fact.snippet}`);
  const parts = String(keyword || '').split(/\s+/).map(flat).filter((w) => w.length >= 2);
  if (parts.length === 0) return true; // 견줄 말이 없으면 막지 않는다
  return parts.some((w) => hay.includes(w));
}

export interface KeywordBriefValidation { ok: KeywordBrief | null; reason?: string }

export function validateKeywordBrief(raw: unknown, row: KeywordBriefRow, facts: FactCard[], today: Date): KeywordBriefValidation {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const timing = (['NOW', 'NEXT', 'ALWAYS'] as const).find((t) => t === d.timing);
  if (!timing) return { ok: null, reason: '시기 없음' };
  // 본문 안의 "(f4)"·"[f2]" 카드 표기는 걷는다 — 근거는 factIds 로 따로 받는다(첫 실주행에서 문장에 섞여 나옴).
  const prose = (v: unknown) => cleanText(String(v || '').replace(/[\(\[]\s*f\d+(?:\s*,\s*f\d+)*\s*[\)\]]/gi, '')).replace(/\s+([,.])/g, '$1');
  const primaryIntent = prose(d.primaryIntent);
  const value = prose(d.value);
  const angle = prose(d.angle);
  if (primaryIntent.length < 5 || value.length < 10 || angle.length < 5) return { ok: null, reason: '내용 부족' };
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ids = [...new Set((Array.isArray(d.factIds) ? d.factIds : []).map((id) => String(id).toLowerCase().replace(/[^a-z0-9]/g, '')).filter((id) => byId.has(id)))];
  const cited = ids.map((id) => byId.get(id) as FactCard);
  /*
   * 대상 일치 — 인용한 카드가 그 키워드의 말을 한 어절도 안 담고 있으면 근거가 아니다.
   * 카드 자체를 못 믿는 게 아니라 **이 키워드의 근거로는 못 쓴다**는 뜻이라, 인용에서만 뺀다.
   * 다 빠지면 '실측 수치만' 으로 남는다 — 브리프를 버리지는 않는다(수치는 여전히 실측이다).
   */
  const onTarget = cited.filter((f) => factMatchesKeyword(f, row.keyword));
  const offTarget = cited.filter((f) => !factMatchesKeyword(f, row.keyword));
  // 날짜 — 인용 카드의 날짜·발행일에 있어야 한다(달·날 같고 달이 한 달 안).
  const monthIndex = (x: string) => Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7));
  const sameDate = (a: string, b: string) => a.slice(8) === b.slice(8) && Math.abs(monthIndex(a) - monthIndex(b)) <= 1;
  /*
   * 날짜·숫자의 허용 출처는 그 키워드의 카드 **전부**다(인용 여부와 무관). 카드는 모두 그 키워드로 실측한 기사라
   * 근거이고, 첫 실주행(2026-09-09)에서 6/19 가 "인용 안 한 카드의 날짜"로 떨어졌다. 화면의 근거 링크는 인용분만.
   */
  // 오늘 날짜("9월 9일 기준")는 언제나 근거다 — 제휴 첫 실주행에서 이걸로 떨어졌다.
  const evidenceDates = [today.toISOString().slice(0, 10), ...facts.flatMap((f) => [...f.dates, kstToday(new Date(f.publishedAt)).toISOString().slice(0, 10)])];
  const foreignDates = extractDates(value, today.toISOString()).filter((x) => !evidenceDates.some((c) => sameDate(x, c)));
  if (foreignDates.length) return { ok: null, reason: `근거에 없는 날짜 ${foreignDates.join(',')} — "${value.slice(0, 80)}"` };
  // 숫자 — 실측 수치 목록이나 카드 본문에 있어야 한다.
  const allowed = new Set([
    ...bigNumbersOf(measuredLines(row).join(' ')),
    ...facts.flatMap((f) => bigNumbersOf(`${f.title} ${f.snippet}`)),
    ...facts.flatMap((f) => f.dates.map((x) => String(Number(x.slice(0, 4))))),
    String(today.getUTCFullYear()), String(today.getUTCFullYear() + 1),
  ]);
  const foreignNumbers = bigNumbersOf(value).filter((n) => !allowed.has(n));
  if (foreignNumbers.length) return { ok: null, reason: `근거에 없는 숫자 ${foreignNumbers.join(',')}` };
  if (timing === 'NEXT' && !facts.some((f) => f.dates.some((x) => x > today.toISOString().slice(0, 10)))) return { ok: null, reason: 'NEXT 인데 미래 날짜 근거 없음' };
  return {
    ok: {
      timing,
      primaryIntent,
      value,
      experience: prose(d.experience),
      differentiation: prose(d.differentiation),
      angle,
      facts: onTarget.map((f) => ({ id: f.id, title: f.title, press: f.press, link: f.link, publishedAt: f.publishedAt })),
      basis: onTarget.length
        ? `실측 수치 + 뉴스 카드 ${onTarget.length}건`
        + (offTarget.length ? ` (대상이 다른 ${offTarget.length}건은 근거에서 뺌)` : '')
        : '실측 수치만(관련 뉴스 없음)',
      builtAt: new Date().toISOString(),
    },
  };
}
