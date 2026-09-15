import { describe, expect, it } from 'vitest';
import { requireJson, requireJsonArray, requireJsonList, requireJsonObject } from '../agent-cli/replyValidators';

/**
 * 폴백 체인 답 검사 함수(2026-09-15). 호출한 쪽과 같은 파싱(tryExtractJson)을 쓴다 —
 * 체인에서는 통과했는데 호출한 쪽 파싱에서 떨어지는 어긋남이 없어야 한다.
 */
describe('JSON 객체', () => {
  it('필수 칸이 있으면 통과한다', () => {
    expect(() => requireJsonObject('reasons')('{"reasons":[],"verdict":"good"}')).not.toThrow();
  });

  it('코드 울타리 · 앞 설명문이 붙어도 호출한 쪽처럼 꺼내 통과시킨다', () => {
    expect(() => requireJsonObject('reasons')('결과입니다\n```json\n{"reasons":[]}\n```')).not.toThrow();
  });

  it('설명문뿐이면 던진다 — 다음 엔진이 기회를 얻는다', () => {
    expect(() => requireJsonObject('reasons')('요청하신 분석 결과는 다음과 같습니다.')).toThrow('JSON 객체가 아닙니다');
  });

  it('필수 칸이 빠지면 무엇이 빠졌는지 적어 던진다', () => {
    expect(() => requireJsonObject('reasons', 'expansions')('{"reasons":[]}')).toThrow('필수 칸 없음: expansions');
  });

  it('배열은 객체로 치지 않는다', () => {
    expect(() => requireJsonObject()('["a"]')).toThrow('JSON 객체가 아닙니다');
  });
});

describe('JSON 배열', () => {
  it('배열이면 통과한다', () => {
    expect(() => requireJsonArray()('["여권사진 반려 사유"]')).not.toThrow();
  });

  it('객체 · 설명문이면 던진다', () => {
    expect(() => requireJsonArray()('{"items":[]}')).toThrow('JSON 배열이 아닙니다');
    expect(() => requireJsonArray()('제안할 검색어가 없습니다')).toThrow('JSON 배열이 아닙니다');
  });
});

describe('JSON 이기만 하면 — 옛 배열 응답도 받는 CI 보강', () => {
  it('객체 · 배열 모두 통과, 설명문은 던진다', () => {
    expect(() => requireJson()('{"new":[],"seo":"제목"}')).not.toThrow();
    expect(() => requireJson()('["검색어"]')).not.toThrow();
    expect(() => requireJson()('제목을 만들 수 없습니다')).toThrow('JSON 이 아닙니다');
  });
});

describe('목록 칸이나 배열 — 실검 틈새', () => {
  it('{"items":[...]} 와 배열 그 자체를 모두 받는다', () => {
    expect(() => requireJsonList('items')('{"items":[{"issue":"a","cands":["b"]}]}')).not.toThrow();
    expect(() => requireJsonList('items')('[{"issue":"a"}]')).not.toThrow();
  });

  it('목록 칸이 없거나 배열이 아니면 던진다', () => {
    expect(() => requireJsonList('items')('{"result":[]}')).toThrow('"items" 목록이 없습니다');
    expect(() => requireJsonList('items')('{"items":"없음"}')).toThrow('"items" 목록이 없습니다');
    expect(() => requireJsonList('items')('분석할 이슈가 없습니다')).toThrow('"items" 목록이 없습니다');
  });
});
