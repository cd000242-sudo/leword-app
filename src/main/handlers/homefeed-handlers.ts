/**
 * 홈판 신호 IPC — 앱 화면이 쓰는 창구(2026-09-17).
 *
 * 사장님: "사이트랑 앱에서도 잘 나오도록 해 줘."
 *
 * 홈판 신호는 이 PC 앱이 10분마다 수집 · 판정하는데, 정작 앱에는 화면이 없어 사이트로 가야 했다.
 * 계산 · 판정은 이미 브리지(웹)가 쓰는 서비스가 전부 갖고 있다 — 여기서는 그 서비스를 IPC 로도 잇는다.
 * 목록·상세 열람과 작성안·선택·원고 동작은 웹과 같은 서비스를 호출한다.
 */
import { ipcMain } from 'electron';
import { createHomefeedHostDeps } from '../homefeed/host';
import type { HomefeedBridgeDeps } from '../homefeed/bridge-routes';

let deps: HomefeedBridgeDeps | null = null;
const registered = new Set<string>();

function homefeedDeps(): HomefeedBridgeDeps {
  if (!deps) deps = createHomefeedHostDeps();
  return deps;
}

export function registerHomefeedHandlers(): void {
  // listenerCount()는 ipcMain.handle 등록을 세지 않는다. 이 모듈의 등록을 별도로 기억한다.
  const routes: Record<string, (input: any) => Promise<unknown>> = {
    'homefeed-stories': () => homefeedDeps().stories(),
    'homefeed-collect': () => homefeedDeps().collect(),
    'homefeed-story': (input) => homefeedDeps().story(input ?? {}),
    'homefeed-brief': (input) => homefeedDeps().brief(input ?? {}),
    'homefeed-select-editorial': (input) => homefeedDeps().selectEditorial(input ?? {}),
    'homefeed-share-editorial': (input) => homefeedDeps().shareEditorial(input ?? {}),
    'homefeed-draft': (input) => homefeedDeps().draft(input ?? {}),
  };
  for (const [channel, run] of Object.entries(routes)) {
    if (registered.has(channel)) continue;
    ipcMain.handle(channel, async (_event, input) => {
      try {
        // 입력 길이, 소속, 근거/선택 버전 검사는 브리지와 공유하는 서비스가 담당한다.
        return { success: true, result: await run(input) };
      } catch (error: any) {
        const message = String(error?.message || error).slice(0, 200);
        console.error('[HOMEFEED-IPC]', channel, message);
        return { success: false, error: message };
      }
    });
    registered.add(channel);
  }
}
