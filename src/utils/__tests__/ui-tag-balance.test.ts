import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 렌더러 HTML 의 태그 균형 (2026-09-12).
 *
 * 실사고 — 여분의 `</div>` 두 개가 셸(div.leword-shell)과 main 을 일찍 닫아서,
 * 화면 14개 중 **11개가 셸 바깥에 그려지고 있었다**(브라우저 파서가 알아서 수습한 결과
 * body 의 직계 자식이 됐다). 사이드바 아래로 밀려나 화면이 통째로 비어 보였다.
 * '사이트에서 보기'를 눌렀을 때 빈 화면만 나온 것이 그 때문이다.
 *
 * 왜 아무 데도 안 걸렸나 — 아무도 안 봤다. 타입 검사는 .html 을 안 보고,
 * sanity 게이트는 문자열 유무만 보고, 화면 순회 스모크는 '오류 0건'만 봤다
 * (그 스모크도 y 좌표를 안 봐서 화면이 밖에 있는 줄 몰랐다).
 *
 * 여기서 여는 태그와 닫는 태그를 이름까지 맞춰 센다. script/style 안쪽과 주석은 건너뛴다 —
 * 그 안의 '<div>' 는 글자일 뿐 태그가 아니다.
 */
const UI_DIR = path.join(__dirname, '..', '..', '..', 'ui');
const SHIPPED = ['keyword-master.html'];

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);
/** 짝이 반드시 맞아야 하는 태그들. 레이아웃을 지탱하는 것만 본다. */
const CONTAINERS = new Set([
  'div', 'main', 'section', 'nav', 'aside', 'header', 'footer', 'span', 'button', 'label',
  'select', 'table', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'form', 'textarea', 'a',
]);

function unbalanced(html: string): string[] {
  const ranges: [number, number][] = [];
  for (const m of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi)) ranges.push([m.index!, m.index! + m[0].length]);
  for (const m of html.matchAll(/<!--[\s\S]*?-->/g)) ranges.push([m.index!, m.index! + m[0].length]);
  const skip = (i: number) => ranges.some(([a, b]) => i >= a && i < b);
  const lineOf = (i: number) => html.slice(0, i).split('\n').length;

  const stack: { name: string; line: number }[] = [];
  const problems: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g)) {
    const i = m.index!;
    if (skip(i)) continue;
    const name = m[2].toLowerCase();
    if (!CONTAINERS.has(name) || m[4] === '/' || VOID.has(name)) continue;
    if (m[1] !== '/') { stack.push({ name, line: lineOf(i) }); continue; }
    if (!stack.length) { problems.push(`줄 ${lineOf(i)}: </${name}> 인데 열린 것이 없다`); continue; }
    const top = stack[stack.length - 1];
    if (top.name === name) { stack.pop(); continue; }
    const back = [...stack].reverse().findIndex((x) => x.name === name);
    if (back === -1) {
      problems.push(`줄 ${lineOf(i)}: </${name}> 짝이 없다 (지금 열린 것은 <${top.name}> 줄 ${top.line})`);
    } else {
      const dropped = stack.splice(stack.length - 1 - back).slice(0, -1);
      problems.push(`줄 ${lineOf(i)}: </${name}> 를 만나며 <${dropped.map((d) => `${d.name}>(줄 ${d.line})`).join(', <')} 가 강제로 닫혔다`);
    }
    if (problems.length >= 8) break;
  }
  for (const left of stack) problems.push(`줄 ${left.line}: <${left.name}> 가 끝까지 안 닫혔다`);
  return problems;
}

describe('화면을 지탱하는 태그의 짝이 맞는다', () => {
  for (const file of SHIPPED) {
    it(`${file} 에 여분·누락 태그가 없다`, () => {
      const html = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
      expect(unbalanced(html).join('\n'), '태그가 어긋나면 화면이 셸 밖으로 튕겨 나가 빈 화면이 된다').toBe('');
    });
  }

  it('검사기 자체가 어긋난 태그를 잡는다 — 통과만 하는 검사는 검사가 아니다', () => {
    expect(unbalanced('<div><span>x</span></div>')).toEqual([]);
    expect(unbalanced('<div><span>x</span></div></div>').join(' ')).toContain('열린 것이 없다');
    expect(unbalanced('<main><div>x</main>').join(' ')).toContain('강제로 닫혔다');
    expect(unbalanced('<div><span>x</span>').join(' ')).toContain('끝까지 안 닫혔다');
    // script 안쪽의 '<div>' 는 글자다 — 태그로 세면 멀쩡한 파일이 빨개진다
    expect(unbalanced("<div><script>var s='<div>';</script></div>")).toEqual([]);
  });
});
