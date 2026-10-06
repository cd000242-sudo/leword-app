import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_TOOL_NAMES,
  createToolBudget,
  formatToolResults,
  parseToolRequest,
  toolGuideLines,
} from '../assistant/assistant-tools';

/**
 * 비서 도구 루프(2026-10-06) — 사장님 "AI비서는 에이전트로 움직이니까 … 내 블로그 주제로는 어떤 키워드가 있고
 * 현재 정면 빈자리나 검색량 문서량 등등 참고해서 … 너는 볼 수 있을 거 아냐".
 * 모델이 [도구] 블록을 내면 앱이 실측 함수를 돌려 결과를 붙여 다시 묻는다. 엔진 넷(클로드 · 코덱스 · agy · 그록) 공용.
 */
describe('parseToolRequest', () => {
  it('[도구] 블록의 JSON 을 읽는다', () => {
    const reply = '자료를 보겠습니다.\n[도구]\n{"calls":[{"tool":"volume","args":{"keywords":["타이어 공기압","엔진오일 교체주기"]}},{"tool":"my_blog","args":{}}]}';
    expect(parseToolRequest(reply)).toEqual([
      { tool: 'volume', args: { keywords: ['타이어 공기압', '엔진오일 교체주기'] } },
      { tool: 'my_blog', args: {} },
    ]);
  });

  it('코드 울타리(```json)로 감싸도 읽는다', () => {
    const reply = '[도구]\n```json\n{"calls":[{"tool":"seat","args":{"keywords":["타이어 펑크"]}}]}\n```';
    expect(parseToolRequest(reply)).toEqual([{ tool: 'seat', args: { keywords: ['타이어 펑크'] } }]);
  });

  it('[도구] 가 없으면 최종 답(null)', () => {
    expect(parseToolRequest('타이어 공기압은 월 1,200회 검색됩니다.')).toBeNull();
  });

  it('모르는 도구 · 틀린 인자는 버리고, 키워드는 다듬어 상한까지만', () => {
    const many = Array.from({ length: 40 }, (_, i) => `키워드${i}`);
    const reply = `[도구]\n{"calls":[{"tool":"rm_rf","args":{}},{"tool":"docs","args":{"keywords":[" 공백 ","",123,${many.map((k) => `"${k}"`).join(',')}]}},{"tool":"expand","args":{"seed":""}}]}`;
    const calls = parseToolRequest(reply)!;
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('docs');
    expect(calls[0].args.keywords![0]).toBe('공백');
    expect(calls[0].args.keywords!.length).toBeLessThanOrEqual(20);
  });

  it('JSON 이 깨졌으면 빈 요청([]) — 다음 차례에 고쳐 내게 한다', () => {
    expect(parseToolRequest('[도구]\n{"calls":[{"tool":"volume"')).toEqual([]);
  });

  it('한 번에 4개까지만', () => {
    const calls = Array.from({ length: 7 }, () => '{"tool":"my_blog","args":{}}').join(',');
    expect(parseToolRequest(`[도구]\n{"calls":[${calls}]}`)).toHaveLength(4);
  });
});

describe('createToolBudget', () => {
  it('자리 실측은 질문 하나에 15개까지 — 넘치면 잘라서 알린다', () => {
    const budget = createToolBudget();
    const first = budget.take('seat', ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(first.allowed).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const second = budget.take('seat', ['g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v']);
    expect(second.allowed).toHaveLength(9);
    expect(second.dropped).toHaveLength(7);
  });
  it('같은 키워드를 다시 재지 않는다', () => {
    const budget = createToolBudget();
    budget.take('volume', ['타이어']);
    expect(budget.take('volume', ['타이어', '엔진']).allowed).toEqual(['엔진']);
  });
});

describe('formatToolResults', () => {
  it('도구별 결과를 머리말과 함께, 길면 자른다', () => {
    const text = formatToolResults([
      { tool: 'volume', ok: true, text: '타이어 공기압: 월 1,230' },
      { tool: 'seat', ok: false, text: '네이버 검색이 막혔습니다' },
      { tool: 'docs', ok: true, text: 'x'.repeat(10_000) },
    ]);
    expect(text).toContain('[volume 결과]');
    expect(text).toContain('[seat 실패] 네이버 검색이 막혔습니다');
    expect(text.length).toBeLessThan(9_000);
  });
});

describe('toolGuideLines', () => {
  it('도구 이름을 전부 알려 주고, 마지막 차례엔 도구를 막는다', () => {
    const guide = toolGuideLines(2).join('\n');
    for (const name of ASSISTANT_TOOL_NAMES) expect(guide).toContain(name);
    expect(toolGuideLines(0).join('\n')).toContain('더는 도구를 부를 수 없다');
  });
});
