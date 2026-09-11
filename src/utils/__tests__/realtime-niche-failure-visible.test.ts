import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 자리를 못 잰 이유가 아무 데도 안 남던 것(2026-09-11).
 *
 * 사장님 "자리나 수요 검색량을 못재는 실시간 틈새는 이유가뭐니?? 볼게 실측밖에없는데.."
 *
 * 저장된 회차(userData/realtime-niche/latest.json, 2026-09-11 01:05):
 *   summary: slotMeasured 0 · blocked 0 · message: null
 *   그런데 자리를 기다리는 pending 행이 5건 있었다. 즉 **5건을 시도했다가 5건 다 실패**했는데
 *   blocked 는 403/429 만 세므로 그 실패가 어디에도 안 남았다. 화면은 '못 잼' 세 글자만 보여 준다.
 *   (실제 원인은 같은 시각에 앱 인스턴스가 둘이라 브라우저를 다툰 것이었다.
 *    직접 받아 보니 창구는 멀쩡했다 — ok=200 · 478KB · 3.7초.)
 *
 * localSerpFetch 는 error·status 를 돌려주는데 받는 쪽이 둘 다 버리고 있었다.
 *
 * 그리고 '못 잼'이 두 가지를 한 단어로 덮고 있었다:
 *   ① 앞 관문(트래픽·수요)을 통과 못 해 **애초에 대상이 아니었던** 16건 → 이건 '안 잼'이다
 *   ② 대상이었는데 **재다 실패한** 5건 → 이게 '못 잼'이다
 * 둘은 사장님이 할 일이 다르다(①은 정상, ②는 다시 누르면 된다).
 */
const root = path.join(__dirname, '..', '..', '..');
const handler = fs.readFileSync(path.join(root, 'src', 'main', 'handlers', 'realtime-niche.ts'), 'utf8');
const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');

describe('실패한 이유를 버리지 않는다', () => {
  it('창구가 준 error·status 를 받아 든다', () => {
    const fn = handler.slice(handler.indexOf('async function measureSlotLocally'), handler.indexOf('const SEAT_LABEL'));
    expect(fn).toContain('res.error');
    expect(fn).toContain('res.status');
  });

  it('막힘이 아닌 실패도 센다 — blocked 는 403/429 만 센다', () => {
    expect(handler).toContain('let failed = 0;');
    expect(handler).toContain('failed += 1;');
    // 요약에 실려 화면까지 간다(객체 속기 표기)
    expect(handler).toContain('      failed,');
  });

  it('한 건도 못 쟀으면 화면에 이유를 말한다 — 조용히 0 으로 끝내지 않는다', () => {
    expect(handler).toMatch(/못 쟀/);
    // message 가 막힘만 보고 null 이 되면 안 된다
    expect(handler, "message 가 여전히 막힘만 본다").not.toContain("message: blocked > 0 ? `네이버가 ${blocked}건을 막았습니다 — 잠시 뒤 다시 재면 채워집니다.` : null,");
  });
});

describe("'안 잼'과 '못 잼'을 구분한다", () => {
  it('시도한 검색어만 못 잼이라 부른다', () => {
    expect(handler).toContain('attempted');
    expect(handler).toMatch(/'안 잼'/);
  });

  it('화면이 두 말을 다 안다', () => {
    const style = html.slice(html.indexOf('const NICHE_SEAT_STYLE'), html.indexOf('const NICHE_SEAT_STYLE') + 400);
    expect(style).toContain("'안 잼'");
    expect(style).toContain("'못 잼'");
  });
});

describe('원래 규칙은 그대로', () => {
  it('5연속 막히면 멈춘다', () => {
    expect(handler).toContain('localSerpStats().consecutiveBlocked >= 5');
  });

  it('앞 관문을 통과한 것만 잰다 — 여기서 게이트를 늘리지 않는다', () => {
    expect(handler).toContain('planSlotMeasurement({');
  });
});
