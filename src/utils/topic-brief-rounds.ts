import type { TopicBrief } from './topic-briefs';
import { kstToday } from './topic-brief-dates';
import { serpFitOf } from './topic-brief-evidence';

/* ───────────── 하루 3회차(아침·오후·저녁) — 사장님 2026-09-09: "오전 오후 저녁 나눠서" ───────────── */

export type RoundSlot = '아침' | '오후' | '저녁';

export interface BriefRound {
  /** 회차의 한국 날짜(YYYY-MM-DD). 7일 창고에서 어제 아침과 오늘 아침을 가른다. 옛 파일엔 없다 → builtAt 으로 읽는다. */
  day?: string;
  slot: RoundSlot;
  builtAt: string;
  counts: { briefs: number; now: number; next: number; always: number; star: number };
  briefs: TopicBrief[];
}

/** 회차 이름 — KST 시각으로. 04:23 아침 · 10:23 오후 · 16:23 저녁 크론에 맞춘 경계(9시·15시). */
export function roundSlotOf(kstNow: Date): RoundSlot {
  const hour = kstNow.getUTCHours(); // kstToday() 로 민 Date 라 UTC 자리가 KST 시각
  /*
   * 경계를 2시간 당겼다(2026-09-12, 11·17 → 9·15).
   *
   * 사장님: "애초에 일찍 돌려버리면 1~2시간늦게 안올라올꺼아냐".
   * 예약을 2시간 앞당겨 걸었으므로(아침 04:23 · 오후 10:23 · 저녁 16:23 KST)
   * 회차 이름을 가르는 경계도 같이 당겨야 한다. 안 그러면 10:23 예약이 '아침'으로
   * 기록되고, 그날 진짜 아침 회차가 "이미 실렸다"며 통째로 건너뛰어진다
   * (09-11 에 겪은 사고와 같은 모양이다).
   */
  if (hour < 9) return '아침';
  if (hour < 15) return '오후';
  return '저녁';
}

/**
 * 예약이 늦게 돌아도 **제 회차로** 기록한다.
 *
 * 왜 필요한가(실측 사고 2026-09-11, 사장님 "12시 오늘의 글감 안돌았네"):
 *   09-10 저녁 예약(UTC 11:23 = KST 20:23)이 4시간 늦어 09-11 00:36 KST 에 돌았다.
 *   roundSlotOf 는 **실행 시각**을 보므로 0시는 '아침'이고 kstToday() 도 09-11 이다.
 *   → 09-10 저녁 회차가 09-11 아침으로 등록됐고,
 *   → 그날 진짜 아침 틱 셋(08:13·09:16·10:11)이 skipIfSlotDone 에 걸려 전부 건너뛰었으며,
 *   → 낮 틱은 깃허브가 떨어뜨려 그날 회차가 하나로 끝났다.
 *
 * 3틱 + skipIfSlotDone 은 지연을 견디려고 넣은 것인데, 시각으로 회차를 정하는 한
 * 자정을 넘긴 지연은 오히려 **다음 날 회차를 잡아먹는다.**
 *
 * 깃허브는 github.event.schedule 로 어느 예약이 발동했는지 알려준다.
 * 그 예약이 **원래 돌았어야 할 시각**으로 회차를 정하면 늦어도 제자리를 찾는다.
 *
 * @param cron  github.event.schedule 이 준 식. 손으로 돌린 회차면 비어 있다.
 * @param ranAt 실제로 돈 시각.
 * @returns 그 예약의 한국 날짜·회차. 예약 정보가 없거나 모양이 이상하면 null —
 *          지어내지 않고 부르는 쪽이 시계로 가게 둔다.
 */
export function scheduledRound(cron: string | null | undefined, ranAt: Date): { day: string; slot: RoundSlot } | null {
  const match = /^\s*(\d{1,2})\s+(\d{1,2})\s/.exec(String(cron || ''));
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!(minute >= 0 && minute <= 59) || !(hour >= 0 && hour <= 23)) return null;

  /*
   * 그 예약이 마지막으로 돌았어야 할 UTC 시각을 찾는다.
   * 깃허브가 예약보다 조금 **빨리** 부르는 일도 있어(실측) 5분은 앞당겨 봐준다 —
   * 안 그러면 2분 빨리 불린 회차가 하루 전 것으로 밀린다.
   */
  const GRACE_MS = 5 * 60 * 1000;
  const due = new Date(Date.UTC(
    ranAt.getUTCFullYear(), ranAt.getUTCMonth(), ranAt.getUTCDate(), hour, minute, 0, 0,
  ));
  if (due.getTime() - GRACE_MS > ranAt.getTime()) due.setUTCDate(due.getUTCDate() - 1);

  // KST 는 UTC+9. kstToday() 와 같은 방식으로 민 Date 라 UTC 자리가 KST 시각이다.
  const kst = new Date(due.getTime() + 9 * 3600 * 1000);
  return { day: kst.toISOString().slice(0, 10), slot: roundSlotOf(kst) };
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 회차의 한국 날짜. day 가 적혀 있으면 그것(늦게 돈 예약도 제 날짜), 없으면 builtAt 의 KST 날짜(옛 파일). 못 읽으면 ''. */
export function roundDayOf(round: Pick<BriefRound, 'day' | 'builtAt'> | null | undefined): string {
  if (!round) return '';
  if (typeof round.day === 'string' && ISO_DAY.test(round.day)) return round.day;
  const at = Date.parse(String(round.builtAt || ''));
  return Number.isFinite(at) ? kstToday(new Date(at)).toISOString().slice(0, 10) : '';
}

export function isSameRound(round: Pick<BriefRound, 'day' | 'builtAt' | 'slot'>, target: { day: string; slot: RoundSlot }): boolean {
  return round.slot === target.slot && roundDayOf(round) === target.day;
}

const SLOT_ORDER: Record<RoundSlot, number> = { 아침: 0, 오후: 1, 저녁: 2 };

/**
 * 최근 N일(오늘 포함) 회차 — 7일 창고(사장님 2026-09-29 "분야마다 30개 이상").
 * 회차 하나가 17분야 × 30개를 담을 수 없어(CI 시간 한도에 30~50개) 추천키워드 보드처럼 회차를 누적한다.
 * 미래 날짜·날짜를 못 읽는 회차는 버리고, 날짜·회차 순으로 세운다.
 */
export function recentRounds(previous: ReadonlyArray<BriefRound> | undefined, kstNow: Date, days = 7): BriefRound[] {
  const todayIso = kstNow.toISOString().slice(0, 10);
  const first = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - Math.max(1, days) + 1)).toISOString().slice(0, 10);
  return (previous || [])
    .filter((r) => { const day = roundDayOf(r); return day !== '' && day >= first && day <= todayIso; })
    .sort((a, b) => roundDayOf(a).localeCompare(roundDayOf(b)) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
}

/** 오늘(KST) 앞 회차만 남긴다 — 회차 이름(아침·오후·저녁) 겹침 검사와 같은 회차 재실행 판정에 쓴다. */
export function todaysRounds(previous: ReadonlyArray<BriefRound> | undefined, kstNow: Date): BriefRound[] {
  const todayIso = kstNow.toISOString().slice(0, 10);
  return (previous || []).filter((r) => r && r.builtAt && roundDayOf(r) === todayIso);
}

/**
 * 창고 크기 상한 — 분야마다 새 회차부터 perFieldCap 개까지만 남긴다(파일 용량: 브리프 하나 ≈ 3천 자).
 * 원본 회차는 바꾸지 않고 새 배열을 만든다. 글감이 하나도 안 남은 회차는 지운다.
 */
export function pruneBriefShelf(rounds: ReadonlyArray<BriefRound>, perFieldCap: number): BriefRound[] {
  const cap = Math.max(1, Math.floor(perFieldCap));
  const kept = new Map<string, number>();
  const newestFirst = [...rounds].reverse();
  const pruned = newestFirst.map((round) => {
    // 회차 안에서도 뒤쪽(나중에 실린) 글감을 먼저 살린다 — 앞뒤 회차와 같은 방향.
    const briefs = [...round.briefs].reverse().filter((b) => {
      const count = kept.get(b.field) || 0;
      if (count >= cap) return false;
      kept.set(b.field, count + 1);
      return true;
    }).reverse();
    return { ...round, briefs, counts: roundCounts(briefs) };
  });
  return pruned.reverse().filter((round) => round.briefs.length > 0);
}

/**
 * 분야 순서를 회차마다 돌린다 — 발굴 시간 한도에 걸리면 뒤쪽 분야가 잘리는데, 늘 같은 분야가 잘리면 그 분야는 영영 안 찬다.
 * 날짜·회차로 정해지므로 같은 회차를 다시 돌려도 같은 순서다.
 */
export function rotateFieldsByRound<T>(fields: ReadonlyArray<T>, day: string, slot: RoundSlot): T[] {
  if (fields.length === 0) return [];
  const dayIndex = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const seed = Number.isFinite(dayIndex) ? dayIndex * 3 + SLOT_ORDER[slot] : SLOT_ORDER[slot];
  const offset = ((seed % fields.length) + fields.length) % fields.length;
  return [...fields.slice(offset), ...fields.slice(0, offset)];
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
