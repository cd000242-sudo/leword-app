import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { SITE_BOARDS, fetchSiteBoard } from '../../main/handlers/site-board';

/**
 * 사이트 회차 그대로 보기 (2026-09-12).
 *
 * 사장님: "사이트랑 앱이랑 연동이제대로 안되어있는것같은데 모바일이랑 pc랑 연동해서
 * api가져와서 사용하듯이 앱도 똑같이 연동되어야죠"
 *
 * 실측하니 절반만 되어 있었다. 지식인·유튜브 화면은 사이트에 회차가 실려 있어도
 * 열면 "아직 찾은 것이 없습니다" 만 있었다. 두 화면이 발행본을 먼저 싣게 했다.
 *
 * 여기서 잠그는 것은 셋이다:
 *   ① 아무 주소나 열어 주지 않는다(허용 목록)
 *   ② 못 읽은 이유를 뭉뚱그리지 않는다 — 할 일이 다르다
 *   ③ 화면이 실제로 그 창구를 부르고, 출처를 밝힌다
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');

describe('허용한 발행본만 읽는다', () => {
  it('앱 화면이 쓰는 보드가 목록에 있다', () => {
    for (const key of ['kin', 'youtube', 'issueNiche', 'preemption', 'todayPicks', 'briefs']) {
      expect(SITE_BOARDS[key], `목록에 없다: ${key}`).toMatch(/^https:\/\/leaderspro\.kr\/data\/.+\.json$/);
    }
  });

  it('모르는 이름은 거절한다 — 아무 주소나 열어 주는 창구가 되면 안 된다', async () => {
    const got = await fetchSiteBoard('https://evil.example/x.json');
    expect(got.success).toBe(false);
    expect((got as { error: string }).error).toContain('모르는 보드');
  });
});

describe('못 읽은 이유를 구분해 말한다', () => {
  it('아직 안 올라온 것(404)과 사이트가 아픈 것(5xx)을 나눈다', async () => {
    const notFound = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    const broken = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    expect((await fetchSiteBoard('kin', notFound) as { error: string }).error).toContain('아직 이 회차가 올라오지 않았습니다');
    expect((await fetchSiteBoard('kin', broken) as { error: string }).error).toContain('503');
  });

  it('인터넷이 끊긴 것은 또 다른 말이다', async () => {
    const dead = (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    expect((await fetchSiteBoard('youtube', dead) as { error: string }).error).toContain('닿지 못했습니다');
  });

  it('읽히면 그대로 준다 — 여기서 모양을 바꾸지 않는다(화면마다 다르다)', async () => {
    const ok = (async () => ({ ok: true, json: async () => ({ rows: [1, 2, 3] }) })) as unknown as typeof fetch;
    const got = await fetchSiteBoard('youtube', ok);
    expect(got.success).toBe(true);
    expect((got as { board: { rows: number[] } }).board.rows).toEqual([1, 2, 3]);
  });
});

describe('화면이 실제로 사이트 회차를 싣는다', () => {
  /** 앵커가 뒤집혀 빈 문자열을 검사하면 무엇이든 통과한다 — 자를 때마다 확인한다. */
  const cut = (from: string, to: string): string => {
    const a = html.indexOf(from);
    const b = html.indexOf(to);
    expect(a, `앵커를 못 찾았다: ${from}`).toBeGreaterThan(-1);
    expect(b, `끝 앵커가 시작보다 앞이다: ${from} → ${to}`).toBeGreaterThan(a);
    return html.slice(a, b);
  };

  it('지식인 화면이 발행본을 부르고 사이트 행 모양을 옮긴다', () => {
    // 앵커 순서에 주의 — setKinTab 은 kinFromSite 보다 **앞**에 있다. 거꾸로 잡으면 빈 문자열이 되어
    // 검사가 조용히 통과한다(이 레포에서 여러 번 겪었다). 뒤에 오는 것으로 끊는다.
    const fn = cut('function kinFromSite', 'let rankView');
    expect(fn).toContain("invoke('site-board-get', { key: 'kin' })");
    // 사이트 행 이름(link/answers/views)을 화면이 아는 이름으로 옮긴다
    expect(fn).toContain('url: row.link');
    expect(fn).toContain('answerCount: Number(row.answers)');
    // 세 갈래를 다 싣는다 — 실시간·급상승·숨은
    expect(fn).toContain('board.realtime');
    expect(fn).toContain('board.rising');
  });

  it('유튜브 화면도 같다', () => {
    const fn = cut('function ytFromSite', 'let kinView');
    expect(fn).toContain("invoke('site-board-get', { key: 'youtube' })");
    expect(fn).toContain('totalSearchVolume: Number(row.searchVolume)');
    expect(fn).toContain('relatedKeywords: Array.isArray(row.expansions)');
  });

  it('이 PC 로 찾아 둔 것이 있으면 사이트 것으로 덮지 않는다', () => {
    // 실검 틈새는 저장된 회차가 있으면 곧장 나간다(hasLocal). 나머지 둘은 rows 로 본다.
    const niche = cut('window.loadRealtimeNiche =', 'function nicheNum');
    expect(niche, '실검 틈새가 이 PC 회차를 사이트 것으로 덮는다').toContain('if (hasLocal) return;');
    for (const fn of ['loadKinBoard', 'loadYoutubeBoard']) {
      const body = html.slice(html.indexOf(`window.${fn} =`), html.indexOf(`window.${fn} =`) + 1600);
      expect(body, `${fn} 이 이미 찾아 둔 것을 덮는다`).toMatch(/\.rows \|\| \[\]\)\.length > 0\) return;/);
    }
  });

  it('실검 틈새 화면도 같다 — 사이트 자리 판정(영문)을 앱 말로 옮긴다', () => {
    const fn = cut('const NICHE_SITE_SEAT', 'window.renderRealtimeNiche');
    expect(fn).toContain("invoke('site-board-get', { key: 'issueNiche' })");
    // 같은 판정기에서 나온 값이라 말만 바꾼다 — 모르는 값은 지어내지 않는다
    expect(fn).toContain("WINNABLE: '열림'");
    expect(fn).toContain("LOCKED: '잠김'");
    expect(fn).toMatch(/NICHE_SITE_SEAT\[serp\.verdict\] \|\| '안 잼'/);
  });

  it('출처를 밝힌다 — 사이트 회차인지 이 PC 로 잰 것인지', () => {
    expect(html).toContain('사이트 회차 ');
    expect(html).toContain('이 PC 로 찾음');
    expect(html).toContain('이 PC 로 잼');
  });

  it('사이트에 없는 값을 지어내지 않는다 — 시간당 조회수는 있을 때만 숫자다', () => {
    const fn = cut('function ytFromSite', 'let kinView');
    expect(fn).toContain('Number.isFinite(perHour) ? perHour : null');
  });
});
