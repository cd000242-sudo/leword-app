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
  /** 제목 후보 — 모델이 같은 답에 함께 낸다. 다듬기 전 날것이라 검증기가 sanitizeTitles 로 거른다. */
  titles?: BriefTitle[];
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
  /**
   * 이 제목이 노리는 곳 — 글자로 확인한 값이다(모델이 적은 라벨을 그대로 믿지 않는다).
   * 셋 다 **검색어로 문장이 시작**한다는 점은 같고, 끝이 다르다:
   *   검색   = 네이버 검색 결과. 서술로 끝난다.
   *   AI답변 = 네이버 AI 브리핑·스마트블록. 답을 요구하는 물음으로 끝난다.
   *   인용   = 생성형 AI 인용. 카드의 숫자·날짜가 제목에 박혀 있다.
   * null 이면 옛 방식으로 만든 제목(부르는 쪽이 keywords 를 안 준 경우)이다.
   */
  target: '검색' | 'AI답변' | '인용' | null;
  /** 질문형 · 정리형 · 경험형 · 비교형 · 시기형 */
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
  // "2026-09-30"·"2026.9.30"·"9/30" 꼴 — 기사 요약과 모델 답 양쪽에 섞여 나온다(황금 브리프 첫 실주행).
  const isoRe = /(?:(20\d\d)[-./]\s?)?(\d{1,2})[-./](\d{1,2})(?![\d:])/g;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(src))) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (!m[1] && !src.slice(m.index, m.index + m[0].length).includes('/')) continue; // 연도 없는 "9.30"은 소수와 헷갈려 슬래시만 받는다
    let year = m[1] ? Number(m[1]) : baseYear;
    if (!m[1] && valid) {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getTime() < base.getTime() - 183 * 24 * 3600 * 1000) year += 1;
    }
    out.add(iso(year, month, day));
  }
  const re = /(?:(20\d\d)년\s*)?(\d{1,2})월\s*(\d{1,2})일/g;
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
  const rest = src.replace(re, ' ').replace(isoRe, ' '); // 달이 붙은 날짜는 위에서 읽었다 — 그 '일'을 또 세지 않는다
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

/**
 * 날 없이 달만 잡힌 예정 — "내년 1월 시행"·"10월 중 발표"·"다음 달부터"·"오는 11월". 발행일 달보다 뒤인 것만 그 달 1일로.
 * v3·CI 실주행에서 "NEXT 인데 미래 날짜 근거 없음"으로 떨어진 것의 대부분이 이 꼴이었다(청년 월세 결합보증 '내년 1월').
 */
export function extractFutureMonths(text: string, publishedAt: string): string[] {
  const base = new Date(publishedAt);
  if (Number.isNaN(base.getTime())) return [];
  const baseIdx = base.getUTCFullYear() * 12 + base.getUTCMonth(); // 0-based 달 지수
  const out = new Set<string>();
  const iso = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
  const src = String(text || '');
  const re = /(내년|올해|오는|지난|작년)?\s*(\d{1,2})월(?!\s*\d{1,2}\s*일)(?=\s*(?:중|부터|까지|초|말|께|경|안에|내|에|,|\.|\s|$))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    if (m[1] === '지난' || m[1] === '작년') continue; // 지난 달 이야기는 예정이 아니다
    let year = base.getUTCFullYear();
    if (m[1] === '내년') year += 1;
    else if (m[1] !== '올해' && month - 1 < base.getUTCMonth()) year += 1; // 지난 달 이름은 다음 해로(9월 기사의 "1월")
    const idx = year * 12 + (month - 1);
    if (idx > baseIdx) out.add(iso(idx));
  }
  if (/(다음\s*달|내달)\s*(부터|중|초|말|에|께|,|\s)/.test(src)) out.add(iso(baseIdx + 1));
  if (/내년\s*(부터|초|상반기|하반기|중|에|,|\s)/.test(src)) out.add(iso((base.getUTCFullYear() + 1) * 12));
  return [...out].sort();
}

/** 카드의 시기 — 미래 날짜(달만이라도)가 있으면 NEXT, 최근 5일 안이면 NOW, 그 밖은 null(브리프 근거로만). */
export function timingOfFact(fact: FactCard, today: Date): BriefTiming | null {
  const todayIso = today.toISOString().slice(0, 10);
  if (fact.dates.some((d) => d > todayIso)) return 'NEXT';
  if (extractFutureMonths(`${fact.title} ${fact.snippet}`, fact.publishedAt).some((d) => d.slice(0, 7) > todayIso.slice(0, 7))) return 'NEXT';
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

export function buildBriefPrompt(field: string, facts: FactCard[], today: Date, maxBriefs = 3, exclude: ReadonlyArray<string> = []): string {
  const todayText = today.toISOString().slice(0, 10);
  const factLines = facts.map((f) => `[${f.id}] (${f.publishedAt.slice(0, 10)} · ${f.press}) ${f.title} — ${f.snippet.slice(0, 160)}${f.dates.length ? ` · 날짜: ${f.dates.join(', ')}` : ''}`);
  const excludeLines = exclude.length
    ? ['', `오늘 앞 회차에 이미 실은 글감(같은 사실·같은 검색어는 다시 내지 마라. 새 사실이나 새 각도만): ${exclude.slice(0, 40).join(' / ')}`]
    : [];
  return [
    `오늘은 ${todayText}(KST)다. 너는 네이버 블로그 글감 편집자다. 아래는 뉴스 API 로 실측한 사실 카드다(분야: ${field}).`,
    '카드에 없는 사실·날짜·숫자는 절대 쓰지 마라. 모르면 그 브리프를 만들지 마라.',
    '',
    ...factLines,
    ...excludeLines,
    '',
    `이 분야에서 블로그 글로 쓸 만한 글감을 ${Math.max(1, maxBriefs - 1)}~${maxBriefs}개 골라라(카드가 정말 모자라면 되는 만큼). 뉴스 요약이 아니라 "검색하는 사람이 원하는 답"이 글감이다.`,
    '각 글감은 JSON 객체다:',
    '{"title": "글 제목(구체적·날짜/조건 포함, 30자 안팎, 낚시 금지)",',
    ' "titles": [{"target": "검색|AI답변|인용", "type": "질문형|정리형|경험형|비교형|시기형 중 하나", "text": "제목 30자 안팎"}],  // 아래 제목 규칙대로 세 갈래를 각각 1~2개. title 과 겹치지 마라',
    ' "timing": "NOW|NEXT|ALWAYS",  // NOW=이번 주 안에 찾는 것, NEXT=날짜가 정해진 예정, ALWAYS=철 안 타는 기준·제도',
    ' "types": ["해설형","가이드형","비교형","문제해결형","정보형","팩트체크형","큐레이션형" 중 1~2개],',
    ' "primaryIntent": "검색자가 손에 넣고 싶은 것 한 문장",',
    ' "value": "왜 지금 쓸 가치가 있나 — 카드의 사실만으로 2문장, 날짜·숫자는 카드 그대로. 날짜는 \'9월 21일\' 꼴로(2026-09-21 같은 표기 금지)",',
    ' "experience": "직접 경험이 있으면 어디에 쓰나 / 없으면 무엇을 쓰면 안 되나(후기 날조 금지)",',
    ' "differentiation": "이미 있는 글과 다르게 만드는 구조 한 문장",',
    ' "keywords": ["사람들이 네이버에 실제로 치는 검색어 2~3개, 넓은 것부터. 1~3어절, 조사·설명 없이. 예: \'독감 무료접종\', \'독감 무료접종 대상\'. \'가을 진드기 물림 예방 수칙\' 같은 문장형 금지"],',
    ' "factIds": ["근거 카드 id 1개 이상 — 위 목록의 대괄호 안 id 그대로(예: \\"f3\\"). 제목이나 번호로 대신 쓰지 마라"]}',
    '',
    '제목 규칙(네이버 블로그) — 제목은 세 군데를 노린다. target 마다 노리는 곳이 다르니 규칙도 다르다.',
    '',
    '  [target: "검색"] 네이버 검색 결과에 걸리는 제목',
    '    · keywords 중 하나로 **문장을 시작**하라. 그 말을 토씨 하나 바꾸지 말고 그대로 앞에 놓아라.',
    '      (틀림: "왜 반도체 계약학과로 지원이 쏠렸을까" / 맞음: "반도체 계약학과 지원이 몰린 이유")',
    '    · 그 뒤에 무엇을 좁히는 글인지 붙여라. 30자 안팎.',
    '',
    '  [target: "AI답변"] 네이버 AI 브리핑·스마트블록이 답으로 물어 가는 제목',
    '    · 여기도 keywords 중 하나로 **문장을 시작**한다. 그 뒤에 물음을 붙인다.',
    '    · 물음표로 끝내거나 "언제·얼마·어디·되는지·인가요"처럼 답을 요구하는 꼴로 끝내라.',
    '      (틀림: "왜 계약학과로 지원이 쏠렸을까" / 맞음: "계약학과 지원 자격은 어떻게 되는지")',
    '    · 사람이 검색창에 실제로 치는 말이어야 한다. 혼잣말 같은 수사의문문 금지.',
    '',
    '  [target: "인용"] 생성형 AI 가 근거로 인용하기 좋은 제목',
    '    · 여기도 keywords 중 하나로 **문장을 시작**한다.',
    '    · 카드에 있는 **숫자나 날짜**를 제목 안에 넣어라(없으면 이 갈래는 만들지 마라).',
    '    · 무엇에 대한 몇 년/몇 건/몇 원인지가 제목에서 보여야 한다.',
    '',
    '  세 갈래 공통 — 셋 다 keywords 중 하나로 문장이 시작해야 한다. 검색어가 가운데 묻히면 어디에도 안 걸린다.',
    '  그리고 AI 가 쓴 티가 나면 노출이 죽는다.',
    '    · 금지어: 총정리 · 완벽정리 · 한눈에 · 알아보자 · 정리해봤습니다 · 충격 · 실화 · TOP N · N가지',
    '    · 쉼표로 두 동강 내지 마라("A, B는?" 꼴 금지). 한 호흡으로 읽히게.',
    '    · 답을 제목에 다 적지 마라. 궁금해서 눌러야 한다.',
    '    · 말하듯이 써라. 보고서 말투 금지.',
    '    · 같은 문장을 어미만 바꾼 것은 한 개로 친다.',
    '',
    '규칙: value 에 쓰는 날짜는 인용한 카드(factIds)에 있는 날짜여야 한다. "8일 발표했다"처럼 발행일을 쓰려면 그 날 발행된 카드를 인용하라.',
    'timing 을 NEXT 로 두려면 인용 카드에 앞으로의 날짜(또는 "내년 1월"·"다음 달" 같은 예정 달)가 있어야 한다. 없으면 NOW 나 ALWAYS 로 두라.',
    '',
    '최종 출력은 JSON 배열 하나만. 설명·머리말 없이.',
  ].join('\n');
}

/**
 * 제목 교리(feedback_home_title_doctrine) — 여기 걸리는 제목은 버린다.
 * AI 가 쓴 티가 나면 네이버가 제목에서 잡아내 노출이 죽는다. 모델은 시켜도 자꾸 이 말을 쓴다.
 */
const TITLE_BANNED = ['총정리', '완벽정리', '완벽 정리', '한눈에', '알아보자', '알아봅시다', '정리해봤', '정리해 봤', '충격', '실화', '레전드', '~하는 방법'];

/**
 * 답을 요구하는 끝맺음 — 진짜 물음만 받는다.
 * '기준·조건·자격·방법' 같은 맨 명사는 뺐다. 그건 물음이 아니라 서술의 끝이라
 * "반도체 계약학과 뽑는 기업과 조건" 같은 검색용 제목까지 물음으로 잘못 잡는다(실측).
 */
const ASK_TAIL = /(\?|나요|인가요|인가|일까요|일까|될까요|될까|할까요|할까|었을까|되는지|하는지|받는지|있는지|언제|얼마|어디|누가|몇)\s*$/;

/**
 * 제목이 어느 갈래의 요건을 실제로 갖췄는가. 모델이 target 을 뭐라고 적었든 **글자로 확인**한다.
 * 라벨만 믿으면 "검색용"이라 적힌 제목이 검색어를 앞에 안 둔 채 화면까지 간다.
 *
 * 세 갈래 모두 **검색어로 문장이 시작**해야 한다. 그게 사장님이 말한 "네이버에 최적화"의 뿌리다 —
 * 검색어가 문장 한가운데 묻히면 세 군데(검색·AI 브리핑·생성형 인용) 어디에도 제대로 안 걸린다.
 * 실사고: 핵심 검색어가 '계약학과'인데 제목이 "왜 반도체 계약학과로 지원이 쏠렸을까"였다.
 */
export function titleTargetOf(text: string, keywords: readonly string[]): BriefTitle['target'] {
  const flat = (s: string) => s.replace(/\s+/g, '');
  const body = flat(text);
  const leads = keywords.map(flat).some((k) => k.length >= 2 && body.startsWith(k));
  if (!leads) return null;
  if (ASK_TAIL.test(text.trim())) return 'AI답변';
  if (/\d/.test(text)) return '인용';
  return '검색';
}

/**
 * 제목 후보 다듬기 — 교리에 걸리는 것, 너무 길거나 짧은 것, 겹치는 것을 뺀다.
 *
 * 사장님 2026-09-10 "제목후보는 네이버에 최적화해서 SEO·AEO·GEO 에 최적화된 제목을 나열해줘야 됩니다".
 * 그래서 세 갈래(검색·AI답변·인용)를 **글자로 확인해서** 붙인다. 어느 갈래도 못 갖춘 제목은 버린다 —
 * 검색어가 어디에도 없는 제목은 세 군데 중 어디에도 안 걸리므로 후보가 아니다.
 * keywords 를 안 주면 옛 방식대로 다 받는다(부르는 쪽이 아직 안 고쳐졌을 때).
 */
export function sanitizeTitles(raw: unknown, mainTitle: string, limit = 4, keywords: readonly string[] = []): BriefTitle[] {
  if (!Array.isArray(raw)) return [];
  const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();
  const seen = new Set<string>([norm(mainTitle)]);
  const kept: BriefTitle[] = [];
  for (const item of raw) {
    const text = cleanText(String((item as any)?.text ?? ''));
    const type = cleanText(String((item as any)?.type ?? ''));
    if (!text || text.length < 8 || text.length > 45) continue;
    if (TITLE_BANNED.some((word) => text.includes(word))) continue;
    // 쉼표로 두 동강 낸 제목 — "A, B는?" 꼴. 사장님이 금지한 이분법이다.
    if ((text.match(/,/g) || []).length >= 1 && /[,][^,]{0,14}[?]\s*$/.test(text)) continue;
    if (/\bTOP\s*\d|\d+\s*가지/i.test(text)) continue;
    if (seen.has(norm(text))) continue;
    const target = keywords.length > 0 ? titleTargetOf(text, keywords) : null;
    if (keywords.length > 0 && !target) continue;
    seen.add(norm(text));
    kept.push({ target, type: type || '기타', text });
  }
  // 갈래가 고루 섞이게 — 검색 → AI답변 → 인용 순으로 한 바퀴씩 돌며 담는다.
  if (keywords.length === 0) return kept.slice(0, limit);
  const order: Array<BriefTitle['target']> = ['검색', 'AI답변', '인용'];
  const out: BriefTitle[] = [];
  const pools = order.map((t) => kept.filter((k) => k.target === t));
  for (let round = 0; out.length < limit; round += 1) {
    let addedThisRound = false;
    for (const pool of pools) {
      if (pool[round] && out.length < limit) { out.push(pool[round]); addedThisRound = true; }
    }
    if (!addedThisRound) break;
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
      // 제목 후보 — 교리에 걸리는 것은 여기서 버린다. 빈 배열이면 화면이 그 줄을 안 그린다.
      titles: sanitizeTitles(d.titles, title, 4, keywords),
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
  return briefs.map((b) => {
    // 핵심 검색어가 열렸거나, 대안 검색어가 열렸으면 — 그 열린 검색어의 검색량으로 판단한다.
    const viaCore = b.serpFit === '높음';
    const viaAlt = !viaCore && b.alternative?.serpFit === '높음';
    const volume = viaCore ? b.searchVolume : viaAlt ? (b.alternative?.searchVolume ?? null) : null;
    return { ...b, star: (viaCore || viaAlt) && ((volume != null && volume >= 500) || b.timing !== 'ALWAYS') };
  });
}

const tokensOf = (s: string) => s.toLowerCase().split(/[\s·,/()\-]+/).map((t) => t.replace(/[^0-9a-z가-힣]/g, '')).filter((t) => t.length >= 2);

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
  const coreTokens = new Set(brief.keywords.flatMap(tokensOf));
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
      if (!tokensOf(k).some((t) => coreTokens.has(t))) return false;
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
  const coreTokens = new Set(brief.keywords.flatMap(tokensOf));
  const pool = new Map<string, number>();
  for (const k of brief.keywords) {
    // 검색량 지도는 스크립트가 공백만 걷은 키로 둔다(applyMeasuredVolumes 와 같은 키).
    const v = volumesOfOwn.get(k.replace(/\s+/g, ''));
    if (typeof v === 'number') pool.set(k, v);
  }
  for (const s of suggestions) if (typeof s.totalSearchVolume === 'number') pool.set(s.keyword, s.totalSearchVolume);
  return [...pool.entries()]
    .filter(([k, v]) => v >= 100 && norm(k) !== core && k.trim().split(/\s+/).length <= 5 && tokensOf(k).some((t) => coreTokens.has(t)))
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

/* ───────────── 하루 3회차(아침·오후·저녁) — 사장님 2026-09-09: "오전 오후 저녁 나눠서" ───────────── */

export type RoundSlot = '아침' | '오후' | '저녁';

export interface BriefRound {
  slot: RoundSlot;
  builtAt: string;
  counts: { briefs: number; now: number; next: number; always: number; star: number };
  briefs: TopicBrief[];
}

/** 회차 이름 — KST 시각으로. 07:00 아침 · 13:00 오후 · 19:00 저녁 크론에 맞춘 경계(11시·17시). */
export function roundSlotOf(kstNow: Date): RoundSlot {
  const hour = kstNow.getUTCHours(); // kstToday() 로 민 Date 라 UTC 자리가 KST 시각
  if (hour < 11) return '아침';
  if (hour < 17) return '오후';
  return '저녁';
}

export function roundCounts(briefs: ReadonlyArray<TopicBrief>): BriefRound['counts'] {
  return {
    briefs: briefs.length,
    now: briefs.filter((b) => b.timing === 'NOW').length,
    next: briefs.filter((b) => b.timing === 'NEXT').length,
    always: briefs.filter((b) => b.timing === 'ALWAYS').length,
    star: briefs.filter((b) => b.star).length,
  };
}

const briefKey = (b: Pick<TopicBrief, 'coreKeyword'>) => b.coreKeyword.replace(/\s+/g, '').toLowerCase();

/** 오늘(KST) 앞 회차만 남긴다 — 어제 회차는 표에서 빠진다. */
export function todaysRounds(previous: ReadonlyArray<BriefRound> | undefined, kstNow: Date): BriefRound[] {
  const todayIso = kstNow.toISOString().slice(0, 10);
  return (previous || []).filter((r) => r && r.builtAt && kstToday(new Date(r.builtAt)).toISOString().slice(0, 10) === todayIso);
}

/** 앞 회차에 이미 실은 글감의 제목·검색어 — 프롬프트 제외 목록. */
export function excludeListOf(rounds: ReadonlyArray<BriefRound>, field: string): string[] {
  return rounds.flatMap((r) => r.briefs.filter((b) => b.field === field).map((b) => `${b.title}(${b.coreKeyword})`));
}

/** 앞 회차와 핵심 검색어가 같은 글감은 뺀다(모델이 제외 목록을 어겼을 때의 마지막 방어). */
export function dropRepeats(briefs: ReadonlyArray<TopicBrief>, rounds: ReadonlyArray<BriefRound>): { kept: TopicBrief[]; repeated: TopicBrief[] } {
  const seen = new Set(rounds.flatMap((r) => r.briefs.map(briefKey)));
  const kept: TopicBrief[] = [];
  const repeated: TopicBrief[] = [];
  for (const b of briefs) {
    const key = briefKey(b);
    if (seen.has(key)) { repeated.push(b); continue; }
    seen.add(key);
    kept.push(b);
  }
  return { kept, repeated };
}

/** 앞 회차에서 같은 검색어의 자리를 이미 쟀으면 그대로 쓴다 — BD 를 다시 안 태운다. */
export function carrySeats(briefs: ReadonlyArray<TopicBrief>, rounds: ReadonlyArray<BriefRound>): TopicBrief[] {
  const measured = new Map<string, Pick<TopicBrief, 'serpFacing' | 'serpVacancy'>>();
  for (const r of rounds) for (const b of r.briefs) if (b.serpFacing != null) measured.set(briefKey(b), { serpFacing: b.serpFacing, serpVacancy: b.serpVacancy });
  return briefs.map((b) => {
    if (b.serpFacing != null) return b;
    const prior = measured.get(briefKey(b));
    return prior ? { ...b, ...prior } : b;
  });
}
