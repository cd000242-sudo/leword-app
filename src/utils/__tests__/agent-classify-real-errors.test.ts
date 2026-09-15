import { describe, expect, it } from 'vitest';
import { classifyExit, parseRateLimitResetMs } from '../agent-cli/parse';

/**
 * 엔진별 실제 오류 문구로 실패를 분류한다(2026-09-15 이 PC 실측 · 공식 문서 교차 확인).
 *
 * 분류는 폴백 순서를 바꾸지 않는다(어떤 실패든 다음 엔진으로 간다). 대신 막힌 엔진을 얼마나 쉬게 할지와
 * 사용자 안내를 정한다. 예전 규칙은 클로드 문구 위주라, 코덱스 토큰 폐기 · agy 시간 초과가
 * '비정상 종료'로 뭉개져 쉬지도 않고 안내도 틀렸다.
 */
describe('클로드', () => {
  it.each([
    // 이 PC 실측: 빈 CLAUDE_CONFIG_DIR 로 `claude -p --output-format json`
    ['Not logged in · Please run /login', 'not_logged_in'],
    // 공식 errors 문서의 세션 한도 문구
    ["You've hit your session limit · resets 3pm (Asia/Seoul)", 'rate_limited'],
    // API 크레딧 경로 — 구독 로그인이 아니다
    ['Credit balance is too low', 'subscription_inactive'],
    // 이 PC 실측: --json-schema 호출에서 난 안전장치 오탐 — 인증 · 한도 문제가 아니다
    ["API Error: Opus 5 (1M context)'s safeguards flagged this message (https://www.anthropic.com/legal/aup). This sometimes happens with safe, normal conversations.", 'nonzero_exit'],
  ])('%s → %s', (text, code) => {
    expect(classifyExit('claude', text)).toBe(code);
  });
});

describe('코덱스', () => {
  it.each([
    // 이 PC 실측: 빈 CODEX_HOME 으로 `codex exec` — 5번 재접속 뒤 이 줄로 끝났다(22초)
    ['ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses', 'not_logged_in'],
    // 공식 커뮤니티 · 이슈에 올라온 사용 한도 문구
    ["You've hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at 3:05 PM.", 'rate_limited'],
    // 토큰 폐기(openai/codex #41973)
    ['Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.', 'not_logged_in'],
  ])('%s → %s', (text, code) => {
    expect(classifyExit('codex', text)).toBe(code);
  });
});

describe('제미나이(agy)', () => {
  it.each([
    // 이 PC 실측: 무료 한도 소진 계정의 JSON 봉투 error
    ['API error (attempt 6): RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 87h35m9s.', 'rate_limited'],
    // 이 PC 실측: print-timeout 에 걸린 표준에러
    ['[agy] print timeout after 2m0s with turn in progress; returning partial output', 'timeout'],
    // 기존 감지 테스트가 지키는 문구 — 일시 장애는 로그인 문제로 보지 않는다
    ['Eligibility check failed: UNAVAILABLE (code 503)', 'nonzero_exit'],
  ])('%s → %s', (text, code) => {
    expect(classifyExit('gemini', text)).toBe(code);
  });
});

describe('한도 초기화까지 남은 시간', () => {
  it.each([
    ['Individual quota reached. Resets in 87h35m9s.', (87 * 3600 + 35 * 60 + 9) * 1000],
    ['Rate limited — resets in 3h', 3 * 3600 * 1000],
    ['try again in 45 minutes', 45 * 60 * 1000],
    ['resets 3pm (Asia/Seoul)', null],
    ['', null],
  ])('%s', (text, ms) => {
    expect(parseRateLimitResetMs(text)).toBe(ms);
  });
});
