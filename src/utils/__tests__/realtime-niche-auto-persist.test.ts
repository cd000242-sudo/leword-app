import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 자동 회차 설정이 앱을 끄면 사라지던 것(2026-09-11).
 *
 * 사장님 "그래서 앱을 계속 켜놓고있는건데" → "아 내가 꺼놔서 그렇구나".
 * 끄신 게 아니었다. 실측: userData 에 저장된 자동 설정 파일이 **하나도 없었다**.
 *   topic-briefs/prefs.json (없음) · realtime-niche/prefs.json (없음)
 *   seat-watch/prefs.json (없음) · daily-pick/prefs.json (없음)
 *
 * 실시간 틈새의 자동은 `let autoMinutes = 0` — **메모리에만 있었다.**
 * 켜 두어도 앱을 끄면 사라지고, 다시 켜면 0(꺼짐)으로 돌아간다.
 * 앱을 계속 켜 두는 이유가 "알아서 돌아라"인데 재시작 한 번이면 그 뜻이 지워졌다.
 *
 * 오늘의 글감(topic-briefs-local)은 이미 prefs.json 으로 기억한다 — 같은 방식으로 맞춘다.
 */
const handler = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'realtime-niche.ts'), 'utf8',
);

describe('자동 설정을 파일로 기억한다', () => {
  it('저장할 자리가 있다 — 오늘의 글감과 같은 prefs.json 방식', () => {
    expect(handler).toContain("PREFS = () => path.join(DIR(), 'prefs.json')");
    expect(handler).toContain('function readAutoMinutes');
    expect(handler).toContain('function writeAutoMinutes');
  });

  it('앱이 켜질 때 저장된 값으로 되살린다', () => {
    expect(handler).toContain('restoreRealtimeNicheAuto');
    // 등록 시점에 불려야 한다 — 화면을 열어야 살아나면 앱만 켜 둔 사람에게는 안 도는 것과 같다.
    const setup = handler.slice(handler.indexOf('export function setupRealtimeNicheHandlers'));
    expect(setup).toContain('restoreRealtimeNicheAuto()');
  });

  it('끄면 끈 채로 기억한다 — 0 도 값이다', () => {
    expect(handler).toContain('writeAutoMinutes(0)');
  });

  it('기억한 값이 이상해도 앱이 안 죽는다 — 못 읽으면 꺼짐으로 본다', () => {
    const fn = handler.slice(handler.indexOf('function readAutoMinutes'), handler.indexOf('function writeAutoMinutes'));
    expect(fn).toContain('catch');
  });

  it('최소 간격 규칙은 그대로 — 되살릴 때도 같은 잣대를 쓴다', () => {
    // 한 회차가 브라우저를 몇 분씩 쓴다. 30분 미만으로는 못 돌린다.
    expect((handler.match(/Math\.max\(30, /g) || []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('메인 프로세스가 실제로 배선한다', () => {
  it('핸들러 등록 목록에 있다', () => {
    const hub = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'keywordMasterIpcHandlers.ts'), 'utf8',
    );
    expect(hub).toContain('setupRealtimeNicheHandlers();');
  });
});
