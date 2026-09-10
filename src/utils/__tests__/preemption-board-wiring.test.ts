import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 선점 보드(앱 전용, 2026-09-10) 배선.
 *
 * 사장님 "앱은 사이트 상위호환이어야지". 판정은 사이트 회차가 정한 것을 그대로 읽고,
 * 앱이 더하는 것은 **자리를 지금 다시 재는 것** 하나다.
 *
 * 왜 그게 값인가(실측): 발행본의 자리는 낡는다. 스모크에서 보드가 '열림 · 정면 7 · 3일 전'이라 한 줄을
 * 그 자리에서 다시 쟀더니 '잠김 · 정면 8'이었다. 사흘 사이에 닫혔다. 사이트는 회차 밖에서 못 다시 잰다(BD 쿼터).
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const html = read('ui', 'keyword-master.html');
const handler = read('src', 'main', 'handlers', 'preemption-board.ts');
const renderer = html.slice(html.indexOf('let pbView = {'), html.indexOf('const BRIEF_TIMING_STYLE'));

describe('선점 보드 배선', () => {
  it('핸들러가 등록 목록에 있고 창구 셋이 다 있다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("import { setupPreemptionBoardHandlers } from './handlers/preemption-board';");
    expect(hub).toContain('setupPreemptionBoardHandlers();');
    for (const ch of ['preemption-board-get', 'preemption-board-remeasure', 'preemption-board-clear-reseats']) {
      expect(handler, `핸들러 없음: ${ch}`).toContain(`ipcMain.handle('${ch}'`);
    }
    expect(renderer).toContain("invoke('preemption-board-get')");
    expect(renderer).toContain("invoke('preemption-board-remeasure'");
  });

  it('진행 채널 이름이 핸들러·preload·화면에서 같다', () => {
    expect(handler).toContain("PREEMPTION_PROGRESS_CHANNEL = 'preemption-board-progress'");
    expect(read('preload.ts')).toContain("'preemption-board-progress'");
    expect(renderer).toContain("on('preemption-board-progress'");
  });

  it('사이드바에서 열리고 화면 섹션·라우터 등록이 다 있다', () => {
    expect(html).toContain(`data-screen="board" aria-selected="false" onclick="showScreen('board')"`);
    expect(html).toContain('<section class="leword-screen" data-screen="board">');
    expect(html).toContain("board: { load: 'loadPreemptionBoard' }");
    expect(html).toContain('window.loadPreemptionBoard = async function');
  });

  it('판정을 새로 만들지 않는다 — 발행본을 읽기만 한다', () => {
    // 보드를 만드는 코드가 앱에 들어오면 사이트와 다른 답이 나오기 시작한다.
    expect(handler).toContain('leaderspro.kr/data/preemption-board.json');
    expect(handler).not.toContain('analyzeSerp');
    expect(handler).not.toContain('verdictFor');
  });

  it('자리 다시 재기는 자리 실측기와 같은 함수를 쓴다', () => {
    expect(handler).toContain("import { measureKeywords } from './seat-measure';");
    // 통합검색까지 읽어야 카드답을 열림으로 안 적는다
    expect(handler).toContain('withStructure: true');
  });

  it('다시 잰 것은 저장되고 언제 쟀는지 남는다', () => {
    expect(handler).toContain('measuredAt: row.measuredAt || new Date().toISOString()');
    expect(handler).toContain('writeReseats(map)');
    // 못 잰 행은 저장하지 않는다 — 안 잰 것을 잰 것처럼 남기지 않는다
    expect(handler).toContain("if (row.status !== 'ok' || !row.verdict) continue;");
  });

  it('내가 잰 것이 회차가 잰 것을 이긴다 — 그리고 구분해 보인다', () => {
    expect(renderer).toContain('const mine = pbView.reseats[pbFlat(row.keyword)];');
    expect(renderer).toContain('if (mine) return { verdict: mine.verdict');
    expect(renderer).toContain('방금 잼');
  });

  it('오래 안 잰 것부터 다시 잰다 — 같은 것을 또 재지 않는다', () => {
    expect(renderer).toContain('.sort((a, b) => (pbDays(pbSeatOf(b).at) ?? 0) - (pbDays(pbSeatOf(a).at) ?? 0))');
  });

  it('한 번에 다시 잴 수 있는 수에 상한이 있다 — 건당 6초라 그 수가 곧 기다림이다', () => {
    const cap = Number((handler.match(/const REMEASURE_CAP = (\d+)/) || [])[1]);
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(60);
  });

  it('계절 환산 추정치를 화면에 올리지 않는다', () => {
    for (const field of ['effectiveVolume', 'peakMultiplier', 'peakVolume']) {
      expect(renderer, `화면이 추정치를 씀: ${field}`).not.toContain(field);
    }
  });

  it('인터넷이 끊겨도 화면이 비지 않는다 — 지난번 받아 둔 판을 준다', () => {
    expect(handler).toContain('return { board: readJson<any>(CACHE(), null), fromCache: true };');
    expect(renderer).toContain('지난번에 받아 둔 판');
  });
});
