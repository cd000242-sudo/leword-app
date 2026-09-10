import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 지식인 황금질문 화면(앱 전용, 2026-09-10) 배선.
 *
 * 사장님 "앱은 사이트 상위호환이어야지". 엔진(naver-kin-golden-hunter-v3 + search-kin-questions)은
 * 앱에 이미 있었고 화면만 없었다.
 *
 * 이 파일이 잠그는 핵심은 **잰 것과 안 잰 것을 가르는 일**이다.
 * 실측(2026-09-10, 21건): isExpertOnly·hasExternalLinks 가 전량 true 였다 — 엔진이 페이지 전체
 * 글자에 정규식을 걸어서다. 21건이 모두 같은 값이면 그건 잰 게 아니라 상수다.
 * 원인을 고친 뒤 전문가 전용 0/20 · 링크 허용 8/20 으로 갈렸다. 이 파일이 그 회귀를 잠근다.
 * isAdopted 는 실측상 오탐 근거가 없었지만(두 페이지 모두 정말 미채택) 표본이 얇아 아직 안 쓴다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const html = read('ui', 'keyword-master.html');
const engine = read('src', 'utils', 'naver-kin-golden-hunter-v3.ts');
const renderer = html.slice(html.indexOf('let kinView = {'), html.indexOf('let rankView = null;'));

/** 화면 코드에서 제목 청소기를 꺼내 실제로 돌린다. */
const cleanTitle = (() => {
  const from = html.indexOf('function kinCleanTitle(raw)');
  const to = html.indexOf('function kinAgeText(q)');
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return new Function(html.slice(from, to) + '; return kinCleanTitle;')() as (raw: string) => { head: string; rest: string };
})();

describe('지식인 화면 배선', () => {
  it('사이드바에서 열리고 화면 섹션·라우터 등록이 다 있다', () => {
    expect(html).toContain(`data-screen="kin" aria-selected="false" onclick="showScreen('kin')"`);
    expect(html).toContain('<section class="leword-screen" data-screen="kin">');
    expect(html).toContain("kin: { load: 'loadKinBoard' }");
    expect(html).toContain('window.loadKinBoard = function');
    expect(renderer).toContain("invoke('search-kin-questions'");
  });

  it('탭 4개가 핸들러가 아는 이름과 같다', () => {
    const handler = read('src', 'main', 'handlers', 'config-utility.ts');
    for (const tab of ['popular', 'latest', 'trending', 'hidden']) {
      expect(html, `탭 버튼 없음: ${tab}`).toContain(`setKinTab('${tab}')`);
    }
    expect(handler).toContain("tabType === 'trending'");
    expect(handler).toContain("tabType === 'hidden'");
    expect(handler).toContain("tabType === 'latest' || tabType === 'rising'");
  });

  it('오탐을 부르던 헐거운 정규식이 돌아오지 않았다', () => {
    /*
     * 2026-09-10 실측: '의사'·'expert' 를 아무 데서나 찾아 21건 전부 전문가 전용이 됐다.
     * '의사' 는 '의사소통'·분야 메뉴에도 있고 'expert' 는 클래스 이름에도 있다.
     * 고친 뒤 0/20. 이 정규식이 되살아나면 그 순간 다시 전량 true 가 된다.
     */
    expect(engine).not.toContain('전문가 답변|엑스퍼트|expert|의사|변호사|세무사|노무사');
    expect(engine).toContain(String.raw`/전문가\s*답변/.test`);
  });

  it('외부 링크는 답변 안에서만 세고 브라우저 안내 주소를 걷는다', () => {
    // 실측: 페이지 전체를 훑으면 support.microsoft.com·google.com/chrome·navercorp.com 까지 세어 전부 true 가 됐다.
    expect(engine).toContain('linkChrome');
    expect(engine).toContain(String.raw`support\.microsoft\.com`);
    expect(engine).not.toMatch(/const externalLinks = Array\.from\(document\.querySelectorAll\('a\[href\]'\)\)/);
  });

  it('채택 여부는 여전히 안 쓴다 — 답변 수만으로 자리를 판단한다', () => {
    const code = renderer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('isAdopted');
    expect(code).not.toContain('채택됨');
  });

  it('추정 점수·예상 트래픽을 화면에 올리지 않는다', () => {
    for (const field of ['goldenScore', 'goldenGrade', 'honeyPotScore', 'honeyPotGrade',
      'estimatedDailyTraffic', 'trafficPotential', 'externalTrafficPotential', 'priority']) {
      expect(renderer, `화면이 추정치를 씀: ${field}`).not.toContain(field);
    }
  });

  it('답변 자리는 답변 수 하나로만 판단한다', () => {
    expect(renderer).toContain('return (Number(q.answerCount) || 0) <= 2;');
  });

  it('규칙 제목이 상투구에 걸리면 안 보여 준다', () => {
    const clichés = (renderer.match(/const KIN_TITLE_CLICHES = (\/.+\/);/) || [])[1];
    expect(clichés).toBeTruthy();
    const re = new Function(`return ${clichés}`)() as RegExp;
    // 실측으로 나온 엔진 문구가 실제로 걸려야 한다
    expect(re.test('인스타 하이라이트 질문!ㅠ 핵심 답변과 자세한 정리')).toBe(true);
    expect(re.test('무릎에 물이 찼을 때 제가 먼저 한 것')).toBe(false);
    expect(renderer).toContain('!KIN_TITLE_CLICHES.test(bridgeRaw)');
  });
});

describe('지식인 제목 청소 — 질문의 말은 안 건드린다', () => {
  it('앞에 붙은 목록 순위 숫자를 뗀다', () => {
    expect(cleanTitle('9 수시 원서 환불은 어떻게 받나요').head).toBe('수시 원서 환불은 어떻게 받나요');
    expect(cleanTitle('19 더리슨 시즌6').head).toBe('더리슨 시즌6');
  });

  it('숫자로 시작하는 진짜 질문은 안 건드린다', () => {
    // 네 자리 이상은 순위가 아니다(2026 년 …)
    expect(cleanTitle('2026 수능 접수 언제인가요').head).toBe('2026 수능 접수 언제인가요');
  });

  it('뒤에 붙은 목록 화면 글자를 뗀다', () => {
    expect(cleanTitle('더리슨 시즌6 촬영시작했나요 조회수 581답변수 2 새 창').head).toBe('더리슨 시즌6 촬영시작했나요');
  });

  it('긴 것은 앞 문장을 세우고 나머지를 미리보기로 내린다 — 자르지 않는다', () => {
    const got = cleanTitle('수시 원서 환불은 어떻게 받나요? 가족이 본인 동의 없이 결제까지 해버렸습니다');
    expect(got.head).toBe('수시 원서 환불은 어떻게 받나요?');
    expect(got.rest).toBe('가족이 본인 동의 없이 결제까지 해버렸습니다');
    // 원문의 글자가 하나도 사라지지 않는다
    expect((got.head + ' ' + got.rest).replace(/\s/g, ''))
      .toBe('수시 원서 환불은 어떻게 받나요? 가족이 본인 동의 없이 결제까지 해버렸습니다'.replace(/\s/g, ''));
  });

  it('짧고 깨끗한 제목은 그대로 둔다', () => {
    expect(cleanTitle('인스타 하이라이트 질문!ㅠ')).toEqual({ head: '인스타 하이라이트 질문!ㅠ', rest: '' });
  });
});
