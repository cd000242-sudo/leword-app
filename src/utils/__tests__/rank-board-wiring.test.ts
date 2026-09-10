import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 노출 추적 화면(앱 전용, 2026-09-10) 배선.
 *
 * 사장님 "앱은 사이트 상위호환이어야지". 실측해 보니 엔진(exposure-* IPC 11개)은 앱에 이미 다 있었고
 * 화면만 없어서 '사이트에서 보기' 로 브라우저를 열고 있었다. 이 파일은 그 창구가 다시 막히지 않게 잠근다.
 *
 * 실제로 이 PC 에 319쌍·199회 측정이 이미 쌓여 있었다 — 볼 방법이 없었을 뿐이다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const html = read('ui', 'keyword-master.html');
const handler = read('src', 'main', 'handlers', 'exposure-tracking.ts');
const renderer = html.slice(html.indexOf('let rankView = null;'), html.indexOf('window.setBriefsAuto'));

describe('노출 추적 화면 배선', () => {
  it('사이드바에서 열리고 화면 섹션·라우터 등록이 다 있다', () => {
    expect(html).toContain(`data-screen="rank" aria-selected="false" onclick="showScreen('rank')"`);
    expect(html).toContain('<section class="leword-screen" data-screen="rank">');
    expect(html).toContain("rank: { load: 'loadRankBoard' }");
    expect(html).toContain('window.loadRankBoard = async function');
  });

  it('화면이 부르는 창구가 전부 핸들러에 있다', () => {
    for (const ch of ['exposure-get-stats', 'exposure-set-blog-rss', 'exposure-auto-match', 'exposure-run-serp-check', 'exposure-remove-pair']) {
      expect(renderer, `화면에서 안 부름: ${ch}`).toContain(`invoke('${ch}'`);
      expect(handler, `핸들러 없음: ${ch}`).toContain(`ipcMain.handle('${ch}'`);
    }
    // 진행 채널 이름이 세 곳에서 같아야 한다
    expect(renderer).toContain("on('exposure-progress'");
    expect(handler).toContain("send('exposure-progress'");
    expect(read('preload.ts')).toContain("'exposure-progress'");
  });

  it('안 잰 쌍을 0위로 적지 않는다 — 모르는 것과 없는 것을 가른다', () => {
    expect(renderer).toContain("item.totalChecks === 0 ? '아직 안 잼' : (rank == null ? '없음' : rank + '위')");
  });

  it('적중률 분모가 잰 쌍이라고 화면이 밝힌다', () => {
    // 엔진이 분모를 checkedPairs 로 쓴다(v2.42.84). 화면이 그 사실을 적어야 30% 를 오해하지 않는다.
    expect(handler).toContain('hitRate10: checkedPairs ?');
    expect(renderer).toContain('잰 쌍 기준');
  });

  it('성장 씨앗의 비율을 두 번 곱하지 않는다 — 10000% 사고 재발 방지', () => {
    // top10Rate 는 엔진에서 Math.round(... * 100) 로 이미 퍼센트다.
    expect(read('src', 'utils', 'exposure-growth-loop.ts')).toContain('const top10Rate = Math.round((item.top10Count / item.totalChecks) * 100);');
    expect(renderer).toContain("Math.round(seed.top10Rate || 0) + '%");
    expect(renderer).not.toContain('(seed.top10Rate || 0) * 100');
  });

  it('점수·등급을 화면에 쓰지 않는다 — 잰 숫자만 보인다', () => {
    expect(renderer).not.toContain('growthGrade');
    expect(renderer).not.toContain('seed.score');
    expect(renderer).not.toMatch(/예상|추정/);
  });

  it('브라이트데이터를 쓰지 않는다 — 이 PC 의 RSS·HTTP 로만 잰다', () => {
    expect(handler).not.toContain('brightdata');
    expect(renderer).not.toContain('brightdata');
  });
});
