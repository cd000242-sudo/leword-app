/**
 * 오늘 쓸 한 편 하이브리드 — 순수 계산(2026-10-06).
 *
 * 사장님: "내 블로그를 분석했으면 내 주제와 내 체급에 맞는 황금키워드를 오늘 쓸 한 편에 담아 추천해야 정상 ·
 * 누가 김민 배우 프로필로 홈판 글을 쓰냐 · 다른 사람들이 건들지 않거나 간과하는 영역을 건드리면 확률이 높다".
 *
 * 여기서 하는 일은 잰 값의 견주기뿐이다 — 확률 · 점수를 만들지 않는다.
 *   - 블로그 글이 설 자리가 없는 말(카드 답 · 인물 사실) 거르기
 *   - 머리말에서 사람들이 실제로 묻는 각도(자동완성) 고르기 — 내 크기 안, 질문형 먼저
 *   - 그 각도를 상위 10개 글 제목이 다뤘는지 세기(안 다룬 낱말 = 빈 각도)
 *   - 내 블로그 주제(네이버 32주제) → 홈판 벤치마크 분야
 */
import { judgeAnswerCardKeyword } from './preemption-supply-guards';

const flat = (s: string) => String(s || '').replace(/\s+/g, '').toLowerCase();
const words = (s: string) => String(s || '').trim().split(/\s+/).filter(Boolean);

/*
 * 인물 사실 — 정보 카드 · 프로필 카드가 한 줄로 답해서 블로그로 오지 않는 말(2026-10-06 화면 실측:
 * 오늘 쓸 글 10 에 '김민 배우 프로필 · 필모그래피 · 작품활동'이 세 칸을 차지했다). 끝맺음으로만 잡는다 —
 * '김민 나혼산 집 위치'처럼 뒤에 궁금증이 붙으면 글감이다.
 */
const PERSON_FACT = /(?:필모그래피|작품활동|출연작|프로필|나이|학력|본명|키|몸무게|혈액형|고향|데뷔)$/;

/** 블로그 글이 설 자리가 없는 말이면 그 이유, 아니면 null. */
export function isNotWritable(keyword: string): string | null {
  const card = judgeAnswerCardKeyword(keyword);
  if (card.answerCard) return card.reason || '카드가 답한다';
  if (PERSON_FACT.test(String(keyword || '').replace(/\s+/g, ''))) return '인물 정보 카드가 답한다 — 한 줄 사실 검색이다';
  return null;
}

/*
 * 궁금증 말 — 사람들이 블로그 글을 열어서라도 알고 싶어 하는 것. 홈판 제목의 후킹 재료가 된다.
 * 순서가 우선순위다(손해 · 불안 → 비용 → 비교 → 시기 · 방법 → 후기).
 */
const QUESTION_WORDS = ['단점', '주의', '부작용', '후회', '실연비', '연비', '유지비', '가격', '비용', '실구매가', '할인',
  '차이', '비교', '이유', '왜', '언제', '출시일', '방법', '조건', '대상', '신청', '후기', '실물', '반응'];
const BAND_FLOOR = 100;

export interface Angle {
  keyword: string;
  head: string;
  /** 각도를 정한 궁금증 말(없으면 머리말 뒤에 붙은 첫 낱말). */
  question: string;
  searchVolume: number;
}

/**
 * 머리말(head)에서 자동완성 말 중 각도를 고른다.
 * - 머리말 전체를 품고 낱말이 더 붙은 말만(다른 소재로 새지 않게)
 * - 검색량 100 이상, 내 크기(band)가 있으면 그 상한 이하
 * - 카드 답 · 인물 사실 제외
 * - 궁금증 말이 든 것 먼저, 같으면 검색량이 작은 것 먼저(작은 말일수록 자리가 비어 있었다 — 9-15 실측 36건)
 */
export function pickAngles(
  head: string,
  suggestions: readonly string[],
  volumes: ReadonlyMap<string, number | null>,
  band: { volumeMin: number; volumeMax: number } | null,
  perHead: number = 2,
): Angle[] {
  const h = flat(head);
  const seen = new Set<string>();
  const out: Array<Angle & { qi: number }> = [];
  for (const raw of suggestions) {
    const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
    const k = flat(keyword);
    if (!keyword || seen.has(k) || k === h || !k.includes(h)) continue;
    seen.add(k);
    const volume = volumes.get(keyword) ?? volumes.get(k) ?? null;
    if (volume === null || volume < BAND_FLOOR) continue;
    if (band && volume > band.volumeMax) continue;
    if (isNotWritable(keyword)) continue;
    const qi = QUESTION_WORDS.findIndex((q) => k.includes(flat(q)));
    const extra = words(keyword).filter((w) => !h.includes(flat(w)));
    out.push({ keyword, head, question: qi >= 0 ? QUESTION_WORDS[qi] : (extra[0] || ''), searchVolume: volume, qi: qi < 0 ? 99 : qi });
  }
  return out
    .sort((a, b) => a.qi - b.qi || a.searchVolume - b.searchVolume)
    .slice(0, Math.max(0, perHead))
    .map(({ qi, ...angle }) => angle);
}

export interface CoverageGap {
  /** 각도에서 머리말을 뺀 낱말. */
  terms: string[];
  /** 낱말마다 그 낱말을 제목에 담은 상위 글 수. */
  covered: Record<string, number>;
  /** 상위 글 어디에도 없는 낱말 — 남들이 안 다룬 각도. */
  uncovered: string[];
  sampled: number;
}

/** 상위 제목(topTitles)이 각도 낱말을 다뤘는지 센다. 제목을 못 읽었으면 판정하지 않는다(빈 uncovered). */
export function coverageGap(angle: string, head: string, topTitles: readonly string[]): CoverageGap {
  const h = flat(head);
  let terms = words(angle).filter((w) => !h.includes(flat(w)) && flat(w).length >= 2);
  // 띄어쓰기 없는 말('가수주현미별세이유')은 낱말로 못 나눈다 — 머리말을 떼고 남은 말을 각도로 본다(실주행).
  if (terms.length === 1 && flat(terms[0]).includes(h) && flat(terms[0]) !== h) terms = [flat(terms[0]).replace(h, '')].filter((t) => t.length >= 2);
  const covered: Record<string, number> = {};
  for (const t of terms) covered[t] = topTitles.filter((title) => flat(title).includes(flat(t))).length;
  const uncovered = topTitles.length ? terms.filter((t) => covered[t] === 0) : [];
  return { terms, covered, uncovered, sampled: topTitles.length };
}

/*
 * 네이버 블로그 주제 32종 → 홈판 벤치마크 분야 8개(scripts/homefeed-benchmarks-core.cjs category()).
 * 벤치마크 분야는 제목 단서 → 출처 주제 다수결로 정해지므로, 내 주제가 속할 분야를 하나로 맞춘다.
 */
const BENCHMARK_CATEGORY: Readonly<Record<string, string>> = {
  자동차: '자동차·IT', 'IT·컴퓨터': '자동차·IT',
  스포츠: '스포츠·게임', 게임: '스포츠·게임',
  영화: '문화·연예', 드라마: '문화·연예', '스타·연예인': '문화·연예', 방송: '문화·연예', 음악: '문화·연예',
  '공연·전시': '문화·연예', '만화·애니': '문화·연예', '문학·책': '문화·연예', '미술·디자인': '문화·연예',
  '패션·미용': '패션·뷰티',
  '건강·의학': '건강',
  '비즈니스·경제': '생활경제·주거',
  국내여행: '여행·생활', 세계여행: '여행·생활', 맛집: '여행·생활', '요리·레시피': '여행·생활', '인테리어·DIY': '여행·생활',
  '육아·결혼': '여행·생활', 반려동물: '여행·생활', '원예·재배': '여행·생활', 취미: '여행·생활', 사진: '여행·생활',
  '일상·생각': '여행·생활', 상품리뷰: '여행·생활',
  '사회·정치': '사회·이슈', '교육·학문': '사회·이슈', '어학·외국어': '사회·이슈', '좋은글·이미지': '사회·이슈',
};

export function benchmarkCategoryOf(naverTopic: string | null | undefined): string | null {
  return naverTopic ? BENCHMARK_CATEGORY[naverTopic] ?? null : null;
}

export interface WhyNowEvidence {
  /** 홈판 벤치마크에서 이 소재를 같이 다룬 채널 수. */
  channels?: number;
  /** 어드바이저 실측 — 실제 홈판 상위 순위와 그 날짜. */
  homefeedRank?: number;
  homefeedDay?: string;
  /** 어드바이저 트렌드 순위 변동(양수 = 오름). */
  rankChange?: number | null;
}

/** 왜 지금인지 — 잰 사실만 이어 붙인다. 근거가 없으면 빈 줄(지어내지 않는다). */
export function whyNowLine(e: WhyNowEvidence): string {
  const parts: string[] = [];
  if (e.channels && e.channels >= 2) parts.push(`벤치마크 블로그 ${e.channels}곳이 같이 다루는 소재`);
  if (e.homefeedRank && e.homefeedDay) {
    const [, m, d] = e.homefeedDay.split('-');
    parts.push(`${Number(m)}/${Number(d)} 실제 홈판 ${e.homefeedRank}위`);
  }
  if (typeof e.rankChange === 'number' && e.rankChange > 0) parts.push(`트렌드 순위 ↑${e.rankChange}`);
  return parts.join(' · ');
}
