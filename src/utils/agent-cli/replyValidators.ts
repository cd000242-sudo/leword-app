/**
 * 폴백 체인의 답 검사 함수(2026-09-15, 사장님 "코덱스나 제미나이도 폴백이 완벽히 되게").
 *
 * 예전에는 체인이 공백만 아니면 성공으로 끝내고, 호출한 쪽이 체인 밖에서 JSON 을 파싱했다. 그래서 클로드가
 * 설명문을 내면 파싱이 실패해 빈 결과로 끝났고, JSON 을 줄 수 있던 코덱스 · 제미나이는 시도조차 되지 않았다.
 * 이 검사를 runWithAnyAgent 의 validate 로 넘기면 형식이 틀린 답은 다음 엔진으로 넘어간다.
 *
 * 필수 칸은 호출한 쪽이 없으면 못 쓰는 최소한만 적는다 — 선택 칸까지 요구하면 쓸 만한 답을 버린다.
 * 파싱은 호출한 쪽과 같은 tryExtractJson 이다(코드 울타리 · 앞뒤 설명문이 붙은 JSON 도 받는다).
 */
import { tryExtractJson } from './parse';

export type ReplyValidator = (reply: string) => void;

/** JSON(객체든 배열이든)이 아니면 던진다 — 옛 배열 응답도 받아 주는 호출한 쪽에 쓴다. */
export function requireJson(): ReplyValidator {
  return (reply: string) => {
    const parsed = tryExtractJson(reply);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON 이 아닙니다');
  };
}

/** JSON 객체가 아니거나 필수 칸이 없으면 던진다. */
export function requireJsonObject(...requiredKeys: string[]): ReplyValidator {
  return (reply: string) => {
    const parsed = tryExtractJson(reply);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON 객체가 아닙니다');
    }
    const record = parsed as Record<string, unknown>;
    const missing = requiredKeys.filter((key) => !(key in record));
    if (missing.length > 0) throw new Error(`필수 칸 없음: ${missing.join(', ')}`);
  };
}

/** JSON 배열이 아니면 던진다. */
export function requireJsonArray(): ReplyValidator {
  return (reply: string) => {
    if (!Array.isArray(tryExtractJson(reply))) throw new Error('JSON 배열이 아닙니다');
  };
}

/** `{"<key>": [...]}` 이거나 배열 그 자체가 아니면 던진다 — 두 모양을 다 받는 호출한 쪽(실검 틈새)에 쓴다. */
export function requireJsonList(key: string): ReplyValidator {
  return (reply: string) => {
    const parsed = tryExtractJson(reply);
    if (Array.isArray(parsed)) return;
    const list = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[key] : undefined;
    if (!Array.isArray(list)) throw new Error(`"${key}" 목록이 없습니다`);
  };
}
