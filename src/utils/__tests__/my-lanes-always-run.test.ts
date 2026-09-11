import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 앱을 켜 둬도 자동 회차가 하나도 안 돌던 것(2026-09-11).
 *
 * 사장님 "그래서 앱을 계속 켜놓고있는건데" → "아 내가 꺼놔서 그렇구나".
 * 끄신 게 아니었다. 두 겹이었다:
 *
 *   ① 실시간 틈새의 자동 간격이 메모리에만 있어 앱을 끄면 사라졌다(prefs.json 으로 고침).
 *   ② 고치고 껐다 켜도 여전히 0 이었다. 메인 로그를 잡아 보니 되살리기는 **돌았는데**
 *      직후 stopBackgroundWorkers() 가 껐다.
 *
 * 그 함수는 `enableBackgroundWorkers !== true` 면 불린다. 사장님 config.json 에는
 * **그 값이 아예 없다** → 기본값 false → 앱이 늘 '성능 우선 모드'로 켜졌고,
 * 예전 자동사냥·급등스캔과 **한 덩어리로 묶여** 사장님이 실제로 쓰는 세 판까지 같이 꺼졌다.
 *
 * 사장님 결정(2026-09-11): "내 판(자리·글감·틈새)만 돌게".
 * 성능 모드는 예전 워커를 다스리고, 이 세 판은 각자 화면에 on/off 스위치가 있으니
 * 거기서 끄면 된다. 한 덩어리로 묶지 않는다.
 */
const hub = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'keywordMasterIpcHandlers.ts'), 'utf8',
);
// 그 함수 본문만 — 바로 뒤에 오는 stopMyLaneSchedulers 까지 집으면 거꾸로 읽힌다.
const stopStart = hub.indexOf('function stopBackgroundWorkers');
const stopEnd = hub.indexOf('}', hub.indexOf('stopRefreshScheduler();', stopStart)) + 1;
const stopBlock = hub.slice(stopStart, stopEnd);

describe('성능 우선 모드가 내 판을 끄지 않는다', () => {
  it('자리 감시·글감·틈새를 성능 모드에서 멈추지 않는다', () => {
    expect(stopBlock, '자리 감시가 성능 모드에 묶여 있다').not.toContain('stopSeatWatchScheduler()');
    expect(stopBlock, '글감이 성능 모드에 묶여 있다').not.toContain('stopTopicBriefsScheduler()');
    expect(stopBlock, '틈새가 성능 모드에 묶여 있다').not.toContain('stopRealtimeNicheScheduler()');
  });

  it('예전 워커는 그대로 성능 모드가 다스린다 — 이건 안 건드린다', () => {
    for (const fn of ['stopAutoHuntingScheduler()', 'stopSurgeScanner()', 'stopPrecrawler()', 'stopRankTracker()', 'stopAutoHealthCheck()']) {
      expect(stopBlock, `예전 워커가 빠졌다: ${fn}`).toContain(fn);
    }
  });
});

describe('내 판은 각자 자기 스위치로 돈다', () => {
  it('셋 다 앱이 켜질 때 제 스케줄러를 건다', () => {
    expect(hub).toContain('startSeatWatchScheduler();');
    expect(hub).toContain('startTopicBriefsScheduler();');
    // 틈새는 저장된 간격을 읽어 스스로 되살린다(setupRealtimeNicheHandlers 안)
    const niche = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'handlers', 'realtime-niche.ts'), 'utf8');
    expect(niche).toContain('restoreRealtimeNicheAuto()');
  });

  it('끄는 길은 남아 있다 — 앱을 닫을 때 타이머를 정리한다', () => {
    expect(hub).toContain('export function stopMyLaneSchedulers');
    for (const fn of ['stopSeatWatchScheduler()', 'stopRealtimeNicheScheduler()', 'stopTopicBriefsScheduler()']) {
      expect(hub.slice(hub.indexOf('export function stopMyLaneSchedulers'))).toContain(fn);
    }
    // 그리고 실제로 종료 훅이 부른다 — 안 부르면 그냥 죽은 코드다.
    const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.ts'), 'utf8');
    expect(main).toContain('stopMyLaneSchedulers()');
    expect(main).toContain("app.on('before-quit'");
  });
});
