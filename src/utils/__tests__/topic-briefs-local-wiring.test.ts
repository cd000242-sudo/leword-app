import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 오늘의 글감(앱 전용, 2026-09-10) 배선.
 *
 * 사장님 "앱에서는 오늘의 글감이든 뭐든 실시간으로 볼 수 있지 않니?" — 그래서 앱이 직접 만든다.
 * 여기서 잠그는 것은 **두 판이 같은 규칙을 쓰는가**다. 사이트(깃허브 예약·브라이트데이터)와
 * 앱(누르면 즉시·내 크로미엄)이 서로 다른 답을 내면 어느 쪽도 못 믿는다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const handler = read('src', 'main', 'handlers', 'topic-briefs-local.ts');
const script = read('scripts', 'topic-briefs.js');
const html = read('ui', 'keyword-master.html');

describe('글감 앱 레인 — 사이트와 같은 규칙', () => {
  it('사이트 스크립트와 같은 함수를 쓴다 — 프롬프트·검증기·판정을 새로 만들지 않는다', () => {
    for (const fn of ['buildBriefPrompt', 'validateBriefs', 'toFactCards', 'pickFactsForPrompt',
      'applyMeasuredVolumes', 'serpFitOf', 'markStars', 'carrySeats', 'dropRepeats',
      'pickRelatedKeywords', 'chooseAlternative', 'roundSlotOf', 'roundCounts', 'todaysRounds', 'excludeListOf']) {
      expect(handler, `앱 레인에 없음: ${fn}`).toContain(fn);
      expect(script, `사이트 스크립트에 없음: ${fn}`).toContain(fn);
    }
  });

  it('자리 판정은 같은 measureSeat 을 쓰고, 창구만 이 PC 크로미엄이다', () => {
    expect(handler).toContain("from '../../utils/seat-measure'");
    expect(handler).toContain('measureSeat(');
    expect(handler).toContain('localSerpFetch');
    // 브라이트데이터는 앱 레인에서 쓰지 않는다 — 사장님 BD 를 사용자들이 쓰면 안 된다.
    expect(handler).not.toContain('brightdata');
    expect(handler).not.toContain('brightDataFetch');
  });

  it('표본이 모자란 자리는 안 쓴다 — 못 잰 것을 0 으로 바꾸지 않는다', () => {
    expect(handler).toContain('if (seat.sampled < 3) return null;');
    expect(script).toContain('seat.sampled >= 3');
  });

  it('자리 상한이 사이트보다 넉넉하다 — 그게 앱 레인의 값이다', () => {
    const core = Number((handler.match(/const CORE_SEAT_CAP = (\d+)/) || [])[1]);
    const related = Number((handler.match(/const RELATED_SEAT_CAP = (\d+)/) || [])[1]);
    const siteCore = Number((script.match(/arg\('maxSerp'\)\) \|\| (\d+)/) || [])[1]);
    const siteRelated = Number((script.match(/arg\('maxAltSerp'\)\) \|\| (\d+)/) || [])[1]);
    expect(core).toBeGreaterThan(siteCore);
    expect(related).toBeGreaterThan(siteRelated);
  });

  it('대안 검색어 하한 100 을 사이트와 똑같이 지킨다', () => {
    expect(handler).toContain('(m.searchVolume ?? 0) >= 100');
    expect(script).toContain('(m.searchVolume ?? 0) >= 100');
  });

  it('네이버 오픈 API 키가 없으면 지어내지 않고 멈춘다', () => {
    expect(handler).toContain('네이버 오픈 API 키가 필요합니다');
  });
});

describe('글감 앱 레인 배선', () => {
  it('핸들러가 등록 목록에 있고, 자동 회차가 성능 우선 모드에서 멈춘다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("import { setupTopicBriefsLocalHandlers, startTopicBriefsScheduler, stopTopicBriefsScheduler } from './handlers/topic-briefs-local';");
    expect(hub).toContain('setupTopicBriefsLocalHandlers();');
    expect(hub).toContain('startTopicBriefsScheduler();');
    // 한 회차가 몇 분씩 브라우저를 쓴다 — 백그라운드 워커를 끄면 같이 멈춰야 한다
    const stop = hub.slice(hub.indexOf('function stopBackgroundWorkers'), hub.indexOf('async function applyBackgroundWorkerPreference'));
    expect(stop).toContain('stopTopicBriefsScheduler();');
  });

  it('세 창구와 진행 채널이 핸들러·preload·화면에서 같다', () => {
    const preload = read('preload.ts');
    expect(handler).toContain("BRIEFS_PROGRESS_CHANNEL = 'topic-briefs-local-progress'");
    for (const ch of ['topic-briefs-local-get', 'topic-briefs-local-run', 'topic-briefs-local-abort', 'topic-briefs-local-auto']) {
      expect(handler, `핸들러 없음: ${ch}`).toContain(`ipcMain.handle('${ch}'`);
      expect(html, `화면에서 안 부름: ${ch}`).toContain(`invoke('${ch}'`);
    }
    expect(preload).toContain("'topic-briefs-local-progress'");
    expect(html).toContain("on('topic-briefs-local-progress'");
  });

  it('사이드바에서 열리고, 열 때 저장된 판을 불러온다', () => {
    expect(html).toContain(`data-screen="briefs" aria-selected="false" onclick="showScreen('briefs')"`);
    expect(html).toContain('<section class="leword-screen" data-screen="briefs">');
    expect(html).toContain("briefs: { load: 'loadBriefs' }");
    expect(html).toContain('window.loadBriefs = async function');
    // 라우터가 load 를 실제로 부른다
    expect(html).toContain("if (spec.load && typeof window[spec.load] === 'function')");
  });

  it('앱 판인지 사이트 판인지 화면이 늘 밝힌다 — 두 판은 자리 상한이 다르다', () => {
    expect(html).toContain('이 PC 에서 만든 판');
    expect(html).toContain('사이트에 실린 판 — 이 PC 는 아직 안 만들었습니다');
  });

  it('자리를 안 잰 같이 넣을 말에는 초록 점을 찍지 않는다', () => {
    const card = html.slice(html.indexOf('function briefCard(b)'), html.indexOf('window.lewordOpenExternal'));
    // 열림일 때만 초록. 잰 적 없으면(serpFit 없음) 회색.
    expect(card).toContain("const open = r.serpFit === '높음';");
    expect(card).toContain("(open ? '#22c55e' : r.serpFit ? '#ef4444' : '#334155')");
  });

  it('추정치를 만들어 붙이지 않는다 — 검색량이 없으면 실측 표기 그대로', () => {
    // 검색광고가 10 미만이면 null 로 온다. 0 으로 바꾸지 않고 '< 10' 이라고 적는다.
    expect(html).toContain("if (value === null || value === undefined) return '< 10';");
    const screen = html.slice(
      html.indexOf('<section class="leword-screen" data-screen="briefs">'),
      html.indexOf('<section class="leword-screen" data-screen="seat">'),
    );
    const renderer = html.slice(html.indexOf('const BRIEF_TIMING_STYLE'), html.indexOf('window.setBriefsAuto'));
    for (const part of [screen, renderer]) {
      expect(part).not.toMatch(/예상\s*(월)?수익/);
      expect(part).not.toMatch(/CPC|RPM|수익가치/);
    }
  });
});
