import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 기본 화면의 불러오기 훅이 부팅 때 돌아야 한다(2026-09-11).
 *
 * 실측: 앱을 띄우면 '오늘 쓸 한 편'이 첫 화면인데 #dpEnvelope 가 빈칸이고 주소 칸도 안 채워졌다.
 * 원인은 기본 화면이 HTML 에 data-active 로 **박혀 있어서** showScreen('today') 가 한 번도 안 불린 것이다.
 * SCREENS 의 load 훅은 showScreen 안에서만 도니까, 기본 화면만 영원히 안 불러온다.
 * (다른 화면으로 갔다가 돌아오면 그때 채워진다 — 그래서 눈에 잘 안 띄었다.)
 */
const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ui', 'keyword-master.html'), 'utf8');

describe('부팅 때 기본 화면을 실제로 연다', () => {
  it('HTML 에 박힌 기본 화면과 부팅 때 여는 화면이 같다', () => {
    const marked = (html.match(/<section class="leword-screen" data-screen="([a-z-]+)" data-active>/) || [])[1];
    expect(marked, '기본 화면 표시가 없다').toBeTruthy();
    expect(html).toContain('window.bootDefaultScreen');
    expect(html).toContain(`DEFAULT_SCREEN = '${marked}'`);
  });

  it('부팅 훅이 걸려 있다', () => {
    const boot = html.slice(html.indexOf('window.bootDefaultScreen'));
    expect(boot.slice(0, 900)).toContain('showScreen');
    expect(html).toContain('bootDefaultScreen()');
  });

  it('그 화면에 불러오기 훅이 실제로 있다 — 없으면 이 배선이 헛돈다', () => {
    const marked = (html.match(/<section class="leword-screen" data-screen="([a-z-]+)" data-active>/) || [])[1];
    expect(html).toMatch(new RegExp(`${marked}: \{ load: '`));
  });
});
