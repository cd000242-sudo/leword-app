/**
 * 글감 한 벌 — 발굴 결과 한 줄을 펼쳤을 때 나오는 것.
 *
 * 사장님 2026-09-10 "목업대로 작업 진행해" · 앞선 지시 "같이 넣을말도 중요한대 특히
 * 지금 쓰면 노출될 확률이 높은 키워드를 보여줘야되" · "제목도 같이 보여주면 더좋자나 여러가지 유형으로".
 *
 * 이 핸들러가 답하는 것 두 가지:
 *   ① 같이 넣을 말 — 연관 키워드 중 **지금 자리가 열린 것**이 어느 것인가
 *   ② 제목 후보 — 1페이지에 없는 유형(프레임)으로, 근거를 달아서
 *
 * 재는 방법은 자리 실측기와 같은 것 한 벌을 쓴다(measureKeywords) — 직렬 · 1.2~1.8초 간격 ·
 * 403/429 는 '못 잼' · 5연속이면 중단. 브라우저 하나를 빌려 끝까지 쓴다. 비용 0.
 *
 * 지어내지 않는 것:
 *   - 못 잰 키워드는 열렸다고도 닫혔다고도 하지 않는다(seat 가 없으면 점을 안 찍는다)
 *   - 1페이지 제목을 못 읽었으면 "1페이지에 없는 유형"이라고 말하지 않는다(basis 가 그렇게 말한다)
 *   - 근거 프레임 밖의 제목은 만들지 않는다 — forgeTitles 의 낚시 가드를 그대로 탄다
 */
import { ipcMain } from 'electron';
import { forgeTitles, supportedFrames, type DerivedKeyword } from '../../utils/title-forge/forge';
import { findEmptyFrames, type TitleFrame } from '../../utils/title-forge/frame-analysis';
import { measureKeywords, type SeatRow } from './seat-measure';

export const WRITING_KIT_PROGRESS_CHANNEL = 'golden-writing-kit-progress';

/** 같이 넣을 말 중 자리를 재는 수. 건당 약 4초라 여기서 늘리면 기다림이 그대로 늘어난다. */
export const RELATED_SEAT_CAP = 3;
/** 제목 유형 수. 유형마다 검색용·끌리는 두 개가 나온다. */
export const FRAME_CAP = 3;

/** 화면에 보일 유형 이름. frame-analysis 의 코드명을 초보자 말로 바꾼 것뿐이다. */
export const FRAME_LABEL: Record<TitleFrame, string> = {
  recipe: '순서',
  review: '후기',
  compare: '비교',
  price: '비용',
  schedule: '시기',
  mistake: '실수',
  recommend: '추천',
  howto: '방법',
  checklist: '체크',
  generic: '일반',
};

export interface WritingKitRelated {
  keyword: string;
  searchVolume: number | null;
  documentCount?: number | null;
  /** 잰 경우에만 채운다. 안 쟀으면 없음 — 화면은 점을 안 찍는다. */
  seat?: string;
  seatReason?: string;
}

export interface WritingKitTitle {
  text: string;
  /** '검색용' | '끌리는' */
  kind: string;
  frame: TitleFrame;
  frameLabel: string;
  basis: string;
}

export interface WritingKitResult {
  keyword: string;
  titles: WritingKitTitle[];
  related: WritingKitRelated[];
  /** 본 키워드 자리 — 표의 자리 칸도 이걸로 채운다(두 번 재지 않는다). */
  seed: { seat: string; facing: number | null; vacancy: number | null; topTitles: string[] } | null;
  measured: number;
  blocked: number;
  /** 1페이지 제목을 실제로 읽었나. 못 읽었으면 제목 근거가 약하다는 뜻이다. */
  serpRead: boolean;
  seconds: number;
  message: string | null;
}

const norm = (value: string) => String(value || '').replace(/\s+/g, '');

/**
 * 유형이 다른 제목을 뽑는다. 1페이지에 없는 유형을 먼저 쓰고, 모자라면 덜 포화된 유형으로 채운다.
 * 유형은 반드시 파생 키워드 실측에서 나온 것만 쓴다 — 근거 없는 각도는 본문이 약속을 못 지킨다.
 */
export function forgeVariedTitles(
  keyword: string,
  derived: readonly DerivedKeyword[],
  serpTitles: readonly string[],
  frameCap: number = FRAME_CAP,
): WritingKitTitle[] {
  const base = { keyword, derivedKeywords: derived, serpTitles };
  const supported = supportedFrames(base);
  if (supported.length === 0) {
    const forged = forgeTitles(base);
    return [
      { text: forged.seo.text, kind: '검색용', frame: forged.seo.frame, frameLabel: FRAME_LABEL[forged.seo.frame], basis: forged.seo.basis },
      { text: forged.home.text, kind: '끌리는', frame: forged.home.frame, frameLabel: FRAME_LABEL[forged.home.frame], basis: forged.home.basis },
    ];
  }
  const empty = findEmptyFrames(serpTitles, supported);
  const rest = supported.filter((frame) => !empty.includes(frame));
  const frames = empty.concat(rest).slice(0, Math.max(1, frameCap));

  const titles: WritingKitTitle[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    const forged = forgeTitles({ ...base, frame });
    for (const [kind, one] of [['끌리는', forged.home], ['검색용', forged.seo]] as const) {
      const key = norm(one.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      titles.push({ text: one.text, kind, frame: one.frame, frameLabel: FRAME_LABEL[one.frame], basis: one.basis });
    }
  }
  return titles;
}

export interface WritingKitPayload {
  keyword: string;
  related?: Array<{ keyword: string; searchVolume?: number | null; documentCount?: number | null }>;
  /** 이미 잰 1페이지 제목이 있으면 준다 — 있으면 본 키워드를 다시 재지 않는다. */
  serpTitles?: string[];
  /** 자리를 잴 같이 넣을 말 수. 0 이면 안 잰다. */
  relatedSeats?: number;
}

export async function buildWritingKit(
  payload: WritingKitPayload,
  onProgress?: (p: { done: number; total: number; keyword: string; message: string }) => void,
): Promise<WritingKitResult> {
  const started = Date.now();
  const keyword = String(payload.keyword || '').trim();
  if (!keyword) throw new Error('키워드가 없습니다');

  const relatedIn = (payload.related || [])
    .map((r) => ({
      keyword: String(r.keyword || '').trim(),
      searchVolume: typeof r.searchVolume === 'number' ? r.searchVolume : null,
      documentCount: typeof r.documentCount === 'number' ? r.documentCount : null,
    }))
    .filter((r) => r.keyword && norm(r.keyword) !== norm(keyword));

  const givenTitles = Array.isArray(payload.serpTitles) ? payload.serpTitles.filter(Boolean) : [];
  const seatCap = Math.max(0, Math.min(RELATED_SEAT_CAP, payload.relatedSeats ?? RELATED_SEAT_CAP));
  // 검색량 큰 것부터 잰다 — 상한에서 끊겨도 값이 큰 말부터 남는다.
  const toMeasureRelated = [...relatedIn]
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
    .slice(0, seatCap)
    .map((r) => r.keyword);

  const needSeed = givenTitles.length === 0;
  const targets = (needSeed ? [keyword] : []).concat(toMeasureRelated);

  let rows: SeatRow[] = [];
  let blocked = 0;
  let message: string | null = null;
  if (targets.length > 0) {
    const batch = await measureKeywords(targets, {
      /*
       * 통합검색까지 읽는다. 건당 두 배로 걸리지만 안 읽으면 '카드답'을 '열림'으로 적게 된다 —
       * 카드 구획은 블로그탭에 안 뜬다. 초록 점 하나가 "지금 쓰면 된다"는 말인데,
       * 그게 사실은 지식백과 카드가 답을 물고 있는 자리면 초보자가 그대로 헛수고를 한다.
       */
      withStructure: true,
      onProgress: (p) => {
        if (!onProgress) return;
        try {
          onProgress({
            done: p.done, total: p.total, keyword: p.keyword,
            message: `자리 확인 ${p.done}/${p.total} · ${p.keyword}` + (p.verdict ? ` → ${p.verdict}` : ''),
          });
        } catch { /* 듣는 쪽 사정 */ }
      },
    });
    rows = batch.rows;
    blocked = batch.summary.blocked;
    message = batch.message;
  }

  const byKw = new Map(rows.map((row) => [norm(row.keyword), row]));
  const seedRow = needSeed ? byKw.get(norm(keyword)) : undefined;
  const serpTitles = givenTitles.length > 0 ? givenTitles : (seedRow?.topTitles || []);

  const related: WritingKitRelated[] = relatedIn.map((r) => {
    const row = byKw.get(norm(r.keyword));
    const measured = row && row.status === 'ok' && row.verdict;
    return {
      keyword: r.keyword,
      searchVolume: r.searchVolume,
      documentCount: r.documentCount,
      ...(measured ? { seat: String(row!.verdict), seatReason: row!.reason || undefined } : {}),
    };
  });

  const derived: DerivedKeyword[] = relatedIn.map((r) => ({ keyword: r.keyword, searchVolume: r.searchVolume }));

  return {
    keyword,
    titles: forgeVariedTitles(keyword, derived, serpTitles),
    related,
    seed: seedRow && seedRow.status === 'ok' && seedRow.verdict
      ? {
        seat: String(seedRow.verdict),
        facing: typeof seedRow.facing === 'number' ? seedRow.facing : null,
        vacancy: typeof seedRow.vacancy === 'number' ? seedRow.vacancy : null,
        topTitles: seedRow.topTitles || [],
      }
      : null,
    measured: rows.filter((r) => r.status === 'ok').length,
    blocked,
    serpRead: serpTitles.length > 0,
    seconds: Math.round((Date.now() - started) / 1000),
    message,
  };
}

export function setupGoldenWritingKitHandlers(): void {
  if (!ipcMain.listenerCount('golden-writing-kit')) {
    ipcMain.handle('golden-writing-kit', async (event, payload?: WritingKitPayload) => {
      try {
        const result = await buildWritingKit(payload || ({} as WritingKitPayload), (p) => {
          try { event.sender.send(WRITING_KIT_PROGRESS_CHANNEL, { ...p, keyword: payload?.keyword }); } catch { /* 창이 닫혔을 수 있다 */ }
        });
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message || '글감을 만들지 못했습니다' };
      }
    });
  }
  console.log('[WRITING-KIT] ✅ 글감 한 벌 핸들러 등록 완료');
}
