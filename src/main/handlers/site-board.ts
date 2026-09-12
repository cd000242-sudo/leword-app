/**
 * 사이트 회차 그대로 보기 — 앱이 leaderspro.kr 의 발행본을 읽어 온다.
 *
 * 사장님 2026-09-12: "사이트랑 앱이랑 연동이제대로 안되어있는것같은데
 * 모바일이랑 pc랑 연동해서 api가져와서 사용하듯이 앱도 똑같이 연동되어야죠"
 *
 * 맞는 지적이었다. 실측하니 절반만 되어 있었다 —
 *   읽고 있던 것: 오늘의 글감 · 오늘 쓸 한 편 · 선점 보드 · 유튜브(글감 고를 때만)
 *   안 읽던 것:   지식인 황금질문 · 유튜브 급상승(화면) · 실검 틈새
 * 안 읽는 화면들은 열면 빈 채로 있다가 사장님이 [지금 찾기] 를 눌러야 뭔가 나왔다.
 * 사이트에는 이미 회차가 실려 있는데도.
 *
 * 두 판을 겹쳐 놓는 방식은 다른 화면(오늘의 글감·선점 보드)에서 쓰던 것과 같다:
 *   · 사이트 회차 = 보장선. PC 가 꺼져 있어도 도는 판이라 열면 바로 보인다.
 *   · 이 PC 판  = 상한 없는 판. 누르면 지금 다시 잰다.
 *
 * 여기서는 받아 오기만 한다. 그리는 것은 화면이 하던 대로 한다 —
 * 사이트 행을 화면이 아는 모양으로 바꾸는 일도 화면 쪽에서 한다(모양이 화면마다 다르다).
 */
import { ipcMain } from 'electron';

const BASE = 'https://leaderspro.kr/data';

/** 앱 화면이 읽을 수 있는 발행본. 여기 없는 주소는 못 받는다 — 아무 주소나 열어 주지 않는다. */
export const SITE_BOARDS: Readonly<Record<string, string>> = {
  kin: `${BASE}/kin-golden.json`,
  youtube: `${BASE}/youtube-gap.json`,
  issueNiche: `${BASE}/issue-niche-board.json`,
  preemption: `${BASE}/preemption-board.json`,
  todayPicks: `${BASE}/today-picks.json`,
  briefs: `${BASE}/topic-briefs.json`,
};

export type SiteBoardResult =
  | { success: true; board: unknown }
  | { success: false; error: string };

/**
 * 발행본 하나를 받아 온다.
 *
 * 못 받는 이유를 뭉뚱그리지 않는다 — 인터넷이 끊긴 것과 파일이 아직 안 올라온 것은
 * 사장님이 할 일이 다르다.
 */
export async function fetchSiteBoard(key: string, fetchImpl: typeof fetch = fetch): Promise<SiteBoardResult> {
  const url = SITE_BOARDS[key];
  if (!url) return { success: false, error: `모르는 보드입니다: ${key}` };
  try {
    const res = await fetchImpl(`${url}?t=${Date.now()}`, { cache: 'no-store' } as RequestInit);
    if (!res.ok) {
      return {
        success: false,
        error: res.status === 404
          ? '사이트에 아직 이 회차가 올라오지 않았습니다.'
          : `사이트를 읽지 못했습니다 (HTTP ${res.status})`,
      };
    }
    return { success: true, board: await res.json() };
  } catch (error) {
    return { success: false, error: `사이트에 닿지 못했습니다 — ${String((error as Error)?.message || error).slice(0, 120)}` };
  }
}

export function setupSiteBoardHandlers(): void {
  if (ipcMain.listenerCount('site-board-get')) return;
  ipcMain.handle('site-board-get', async (_event, payload?: { key?: string }) =>
    fetchSiteBoard(String(payload?.key || '')));
}
