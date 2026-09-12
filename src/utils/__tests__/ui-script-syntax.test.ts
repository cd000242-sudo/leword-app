import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 렌더러 스크립트가 문법적으로 성립하는가 (2026-09-12).
 *
 * 왜 생겼나 — 실사고. '지금 갱신' 버튼을 넣으면서 확인 문구에 줄바꿈 이스케이프(\\n)를
 * 썼는데, 패치 도구가 역슬래시를 먹어 문자열 한가운데에 **진짜 줄바꿈**이 들어갔다.
 * 그러면 그 <script> 블록이 통째로 파싱에 실패한다. 그 블록에 있던 함수 수백 개가
 * 전부 없는 것이 되는데 — **아무 데서도 안 잡혔다**:
 *   · 타입 검사는 .html 을 안 본다
 *   · sanity 게이트는 문자열 유무만 본다
 *   · 화면 순회 스모크도 pageerror 0건으로 통과했다(블록 파싱 오류는 창을 띄운 뒤
 *     리스너를 붙이기 전에 이미 지나가 있었다)
 * 화면이 빈 것을 스크린샷으로 보고서야 알았다.
 *
 * 그래서 여기서 파일을 직접 읽어 <script> 블록마다 파싱해 본다. 실행은 안 한다 —
 * 문법만 본다(new Function 은 본문을 파싱하되 돌리지는 않는다).
 */
const UI_DIR = path.join(__dirname, '..', '..', '..', 'ui');

/** 화면이 실제로 쓰는 HTML — 여기가 깨지면 앱이 빈 화면이 된다. */
const SHIPPED = ['keyword-master.html'];

function inlineScripts(html: string): { index: number; body: string; line: number }[] {
  const out: { index: number; body: string; line: number }[] = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(html)) !== null) {
    n += 1;
    out.push({ index: n, body: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('렌더러 인라인 스크립트가 파싱된다', () => {
  for (const file of SHIPPED) {
    it(`${file} 의 <script> 블록이 전부 문법에 맞다`, () => {
      const html = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
      const blocks = inlineScripts(html);
      expect(blocks.length, '인라인 스크립트를 하나도 못 찾았다 — 검사가 헛돌고 있다').toBeGreaterThan(0);
      const broken: string[] = [];
      for (const b of blocks) {
        try {
          // eslint-disable-next-line no-new-func
          new Function(b.body);
        } catch (error) {
          broken.push(`블록 ${b.index}(줄 ${b.line}): ${(error as Error).message}`);
        }
      }
      expect(broken.join(' / '), '문법이 깨진 블록이 있다 — 그 블록의 함수가 전부 사라진다').toBe('');
    });
  }
});

describe('문자열 한가운데 진짜 줄바꿈이 없다 — 패치 도구가 역슬래시를 먹은 자국', () => {
  for (const file of SHIPPED) {
    it(`${file} 의 따옴표 문자열이 한 줄 안에서 닫힌다`, () => {
      const html = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
      // 파싱이 통과했다면 이 사고는 이미 없다. 이 검사는 같은 사고를 이름으로 남기기 위한 것이다.
      for (const b of inlineScripts(html)) {
        expect(() => {
          // eslint-disable-next-line no-new-func
          new Function(b.body);
        }, `블록 ${b.index}(줄 ${b.line})`).not.toThrow();
      }
    });
  }
});
