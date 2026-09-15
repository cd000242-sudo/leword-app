import { describe, expect, it } from 'vitest';
import { buildGapTopicsPrompt, chunkGapTopicKeywords, parseGapTopics } from '../gap-topics-prompt';

/**
 * 글감 주제 판정을 워커에서 앱 브리지로 옮겼다(2026-09-16 사장님 결정 "앱 브리지로 옮기기").
 * 묶음 크기 · 번호 매핑 · 결과 모양이 워커(gapTopicClassify)와 같아야 사이트가 캐시와 화면을 그대로 쓴다.
 */
describe('글감 주제 판정 프롬프트', () => {
  it('20개씩 묶는다', () => {
    const keywords = Array.from({ length: 45 }, (_, index) => `검색어${index}`);
    expect(chunkGapTopicKeywords(keywords).map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    expect(chunkGapTopicKeywords([])).toEqual([]);
  });

  it('번호를 매긴 검색어와 개수, JSON 형식을 싣는다', () => {
    const prompt = buildGapTopicsPrompt(['혀클리너', '청년 월세 지원', '챗GPT 요금']);
    expect(prompt).toContain('1. 혀클리너');
    expect(prompt).toContain('3. 챗GPT 요금');
    expect(prompt).toContain('검색어는 3개다');
    expect(prompt).toContain('{"topics":[{"index":1,"shopping":false,"policy":false,"ai":false}]}');
  });

  it('번호로 검색어를 찾아 붙이고, true 가 아닌 값은 false 로 본다', () => {
    const chunk = ['혀클리너', '청년 월세 지원', '챗GPT 요금'];
    const reply = '판정입니다.\n{"topics":[{"index":1,"shopping":true,"policy":false,"ai":false},{"index":2,"shopping":"true","policy":true},{"index":3,"ai":true}]}';
    expect(parseGapTopics(reply, chunk)).toEqual([
      { keyword: '혀클리너', shopping: true, policy: false, ai: false },
      { keyword: '청년 월세 지원', shopping: false, policy: true, ai: false },
      { keyword: '챗GPT 요금', shopping: false, policy: false, ai: true },
    ]);
  });

  it('묶음 밖 번호 · 겹친 번호 · 깨진 답은 버린다', () => {
    const chunk = ['혀클리너', '청년 월세 지원'];
    const reply = '{"topics":[{"index":0,"shopping":true},{"index":3,"ai":true},{"index":"x"},null,{"index":1,"shopping":true},{"index":1,"policy":true}]}';
    expect(parseGapTopics(reply, chunk)).toEqual([{ keyword: '혀클리너', shopping: true, policy: false, ai: false }]);
    expect(parseGapTopics('JSON 이 아닙니다', chunk)).toEqual([]);
    expect(parseGapTopics('{"topics":"아님"}', chunk)).toEqual([]);
  });
});
