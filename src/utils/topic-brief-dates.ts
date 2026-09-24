import type { BriefTiming, FactCard } from './topic-briefs';

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
  const rangeRe = /(?:(20\d\d)년\s*)?(\d{1,2})월\s*(\d{1,2})(?:일)?\s*[-~∼]\s*(\d{1,2})일/g;
  while ((m = rangeRe.exec(src))) {
    const month = Number(m[2]);
    const first = Number(m[3]);
    const last = Number(m[4]);
    if (month < 1 || month > 12 || first < 1 || first > 31 || last < first || last > 31) continue;
    let year = m[1] ? Number(m[1]) : baseYear;
    if (!m[1] && valid && Date.UTC(year, month - 1, first) < base.getTime() - 183 * 86400000) year++;
    out.add(iso(year, month, first));
    out.add(iso(year, month, last));
  }
  /*
   * 기사는 "오는 11일부터"·"지난 3일"·"내달 1일" 처럼 달 없이 날만 쓰는 게 더 흔하다(2026-09-09 첫 실주행에서
   * 모델이 옮긴 9월 11일이 카드에 '11일'로만 있어 검증기가 떨어뜨렸다). 발행일 기준으로 달을 정한다:
   * 내달/다음달 → 다음 달, 지난 → 발행일 이전, 오는 → 발행일 이후.
   * 아무 수식 없는 날은 발행 월이다. "17일 기사에서 16일 공개"를 다음 달로 만들지 않는다.
   */
  const rest = src.replace(rangeRe, match => ' '.repeat(match.length)).replace(re, match => ' '.repeat(match.length)).replace(isoRe, match => ' '.repeat(match.length));
  const bare = /(내달|다음\s*달|지난|오는)?\s*(?<![0-9])(\d{1,2})일(?!\s*(?:간|째|만|분|차|정|후|전|이내|이상|이하|[0-9]))/g;
  while ((m = bare.exec(rest))) {
    const day = Number(m[2]);
    if (day < 1 || day > 31) continue;
    if (/\d+박\s*$/.test(src.slice(0, m.index))) continue;
    const hint = (m[1] || '').replace(/\s+/g, '');
    let year = baseYear;
    let month = baseMonth;
    const shift = (delta: number) => { month += delta; if (month > 12) { month = 1; year += 1; } if (month < 1) { month = 12; year -= 1; } };
    if (hint === '내달' || hint === '다음달') shift(1);
    else if (hint === '지난') { if (day > baseDay) shift(-1); }
    else if (hint === '오는' && day < baseDay) shift(1);
    // "10월 3일부터 18일까지"의 끝 날짜는 같은 명시적 월을 따른다.
    const range = /(?:(20\d\d)년\s*)?(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|에서|[-~∼])\s*$/.exec(src.slice(0, m.index));
    if (range) {
      year = range[1] ? Number(range[1]) : baseYear;
      month = Number(range[2]);
      if (!range[1] && valid && Date.UTC(year, month - 1, Number(range[3])) < base.getTime() - 183 * 86400000) year++;
    }
    out.add(iso(year, month, day));
  }
  return [...out].sort();
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
  const re = /(?:(20\d\d)년\s*)?(내년|올해|오는|지난|작년)?\s*(\d{1,2})월(?!\s*\d{1,2}\s*일)(?=\s*(?:중|부터|까지|초|말|께|경|안에|내|에|,|\.|\s|$))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const month = Number(m[3]);
    if (month < 1 || month > 12) continue;
    if (m[2] === '지난' || m[2] === '작년') continue;
    let year = m[1] ? Number(m[1]) : base.getUTCFullYear();
    if (m[2] === '내년') year += 1;
    else if (m[2] === '오는' && month - 1 < base.getUTCMonth()) year += 1;
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
