import { describe, expect, it } from 'vitest';
import type { IssueContext } from '../issue-context';
import {
  analyzeIssuesWith,
  buildIssueAnalysisPrompt,
  parseIssueAnalysisReply,
  verifyWhy,
} from '../issue-next-wave';

/**
 * 이슈 추론 — 에이전트가 "왜 뜨나·다음 물결"을 말하되, 헤드라인 밖의 사실은
 * 화면에 못 나간다. 환각 가드가 이 파일의 존재 이유다.
 */

function ctx(over: Partial<IssueContext> = {}): IssueContext {
  return {
    issue: '박재홍',
    headlines: [
      { title: '박재홍, 뇌경색 진단…"회복 중"', press: 'press-a.co.kr', publishedAt: '2026-09-03T01:12:00.000Z', link: 'https://n.news.naver.com/1' },
      { title: '해설위원 박재홍 3주 입원 후 복귀 예정', press: 'press-b.com', publishedAt: '2026-09-03T00:50:00.000Z', link: 'https://n.news.naver.com/2' },
    ],
    autocomplete: ['박재홍 뇌경색', '박재홍 근황'],
    related: [{ keyword: '박재홍 해설', monthlyVolume: 700 }],
    ...over,
  };
}

describe('verifyWhy — "왜 뜨나"는 헤드라인 밖으로 못 나간다', () => {
  it('헤드라인 어절로 뒷받침되면 통과한다(조사가 붙어도 어간으로 맞춘다)', () => {
    expect(verifyWhy('뇌경색으로 입원했다는 소식에 근황 검색이 몰린다', ctx())).toBe('뇌경색으로 입원했다는 소식에 근황 검색이 몰린다');
  });

  it('헤드라인에 없는 숫자는 지어낸 것이다 — 버린다', () => {
    expect(verifyWhy('뇌경색 진단 후 5주 입원 소식', ctx())).toBeNull();
    // 있는 숫자는 통과
    expect(verifyWhy('뇌경색 진단으로 3주 입원 소식', ctx())).not.toBeNull();
  });

  it('이슈어만 되풀이하는 내용 없는 문장은 버린다', () => {
    expect(verifyWhy('박재홍 실검 상위 진입으로 검색 급증', ctx())).toBeNull();
  });

  it('헤드라인이 없으면 검증할 수 없다 — 버린다', () => {
    expect(verifyWhy('뇌경색 진단 소식', ctx({ headlines: [] }))).toBeNull();
  });

  it('너무 길면 버린다(140자) — 화면 한 줄 설명이다', () => {
    expect(verifyWhy('뇌경색 진단 입원 '.repeat(20), ctx())).toBeNull();
  });

  it('빈 문자열은 null', () => {
    expect(verifyWhy('', ctx())).toBeNull();
    expect(verifyWhy(undefined, ctx())).toBeNull();
  });
});

describe('buildIssueAnalysisPrompt', () => {
  it('이슈마다 헤드라인·자동완성·연관어를 싣고 JSON 형식과 개수를 지시한다', () => {
    const prompt = buildIssueAnalysisPrompt([ctx(), ctx({ issue: '마운자로', headlines: [], autocomplete: [], related: [] })], 8);
    expect(prompt).toContain('1. 박재홍');
    expect(prompt).toContain('박재홍, 뇌경색 진단…"회복 중"');
    expect(prompt).toContain('박재홍 뇌경색');
    expect(prompt).toContain('박재홍 해설(700)');
    expect(prompt).toContain('2. 마운자로');
    expect(prompt).toContain('8개');
    expect(prompt).toContain('"next"');
    expect(prompt).toMatch(/3어절/);
    // 헤드라인 밖 사실 금지를 프롬프트에서도 말한다 — 가드는 그 뒤의 안전망이다.
    expect(prompt).toMatch(/헤드라인/);
  });
});

describe('parseIssueAnalysisReply', () => {
  const contexts = [ctx(), ctx({ issue: '마운자로 국내 출시', headlines: [{ title: '마운자로 국내 출시 가격 공개', press: null, publishedAt: null, link: '' }], autocomplete: [], related: [] })];

  it('이슈별 why·cands·next 를 정제해 돌려준다', () => {
    const reply = '```json\n' + JSON.stringify({
      items: [
        {
          issue: '박재홍',
          why: '뇌경색 진단 후 입원 소식',
          cands: ['박재홍 뇌경색', '박재홍 아내', '박재홍 뇌경색 진단 이유 영상', '박재홍 굿즈 최저가', '박재홍', '박재홍  아내'],
          next: [
            { k: '박재홍 복귀', why: '3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다' },
            { k: '박재홍 최저가', why: '쇼핑' },
            { k: '박재홍 복귀', why: '중복' },
            { k: '박재홍 후임 해설위원 누구 예상', why: '너무 김' },
          ],
        },
        { issue: '마운자로 국내 출시', why: '국내 출시 가격 공개', cands: ['마운자로 가격'], next: [] },
      ],
    }) + '\n```';
    const out = parseIssueAnalysisReply(reply, contexts, 3);
    const a = out.get('박재홍')!;
    expect(a.why).toBe('뇌경색 진단 후 입원 소식');
    expect(a.cands).toEqual(['박재홍 뇌경색', '박재홍 아내']);
    expect(a.nextWave).toEqual([{ keyword: '박재홍 복귀', reason: '3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다' }]);
    // '가격' 은 상업 노이즈라 후보에서 빠진다 — why 는 헤드라인이 뒷받침하니 남는다.
    const b = out.get('마운자로 국내 출시')!;
    expect(b.cands).toEqual([]);
    expect(b.why).toBe('국내 출시 가격 공개');
  });

  it('검증에 실패한 why 는 null 로 남기되 후보는 살린다', () => {
    const reply = JSON.stringify({ items: [{ issue: '박재홍', why: '재산 300억 논란', cands: ['박재홍 근황'], next: [] }] });
    const a = parseIssueAnalysisReply(reply, contexts, 5).get('박재홍')!;
    expect(a.why).toBeNull();
    expect(a.cands).toEqual(['박재홍 근황']);
  });

  it('이슈 이름이 살짝 달라도(포함) 맞춘다', () => {
    const reply = JSON.stringify({ items: [{ issue: '마운자로', why: '', cands: ['마운자로 출시일'], next: [] }] });
    expect(parseIssueAnalysisReply(reply, contexts, 5).get('마운자로 국내 출시')?.cands).toEqual(['마운자로 출시일']);
  });

  it('JSON 이 아니면 빈 맵', () => {
    expect(parseIssueAnalysisReply('죄송합니다, 도와드릴 수 없습니다.', contexts, 5).size).toBe(0);
  });
});

describe('analyzeIssuesWith — 에이전트 한 번', () => {
  it('첫 러너의 답을 파싱하고, 실패하면 빈 맵으로 물러선다', async () => {
    const reply = JSON.stringify({ items: [{ issue: '박재홍', why: '뇌경색 진단 소식', cands: ['박재홍 근황'], next: [{ k: '박재홍 복귀', why: '복귀 예정' }] }] });
    const ok = await analyzeIssuesWith(
      [{ provider: 'claude', run: async () => reply }],
      [ctx()],
      5,
    );
    expect(ok.get('박재홍')?.nextWave).toEqual([{ keyword: '박재홍 복귀', reason: '복귀 예정' }]);

    const failed = await analyzeIssuesWith(
      [{ provider: 'claude', run: async () => { throw new Error('login'); } }],
      [ctx()],
      5,
    );
    expect(failed.size).toBe(0);
  });

  it('이슈가 없으면 러너를 부르지 않는다', async () => {
    let calls = 0;
    const out = await analyzeIssuesWith([{ provider: 'claude', run: async () => { calls += 1; return '{}'; } }], [], 5);
    expect(out.size).toBe(0);
    expect(calls).toBe(0);
  });
});
