import { describe, expect, it } from 'vitest';
import { AllAgentsFailedError } from '../agent-cli/runAny';
import { describeAssistantFailure } from '../assistant/assistant-failure';

/**
 * 비서 실패 안내(2026-10-06) — 사장님 "안티그래비티 연동돼도 자꾸 할당량이 없다고 뜨네".
 * 예전엔 원인과 상관없이 "AI 엔진이 답하지 못했습니다" 한 줄이라 한도 소진인지 로그인 문제인지 알 수 없었다.
 */
describe('describeAssistantFailure', () => {
  it('엔진마다 진짜 원인을 한 줄씩 — 한도는 쉬는 시간까지', () => {
    const error = new AllAgentsFailedError(['claude', 'codex', 'gemini'], {
      claude: 'Claude Code 생성 실패 (원인 코드: not_logged_in). 로그인이 확인되지 않았습니다. 설정에서 로그인해주세요.',
      codex: 'Codex 생성 실패 (원인 코드: not_installed). CLI를 찾지 못했습니다.',
      gemini: '제미나이(Antigravity) 생성 실패 (원인 코드: rate_limited). 현재 구독 사용 한도가 소진되었습니다.',
      grok: '건너뜀: 설치 안 됨 — 2분 뒤 다시 시도',
    });
    const text = describeAssistantFailure(error, (provider) => (provider === 'gemini' ? '사용 한도 초과 — 87시간 35분 뒤 다시 시도' : null));
    expect(text).toContain('Claude: 로그인 필요');
    expect(text).toContain('ChatGPT(Codex): 설치 안 됨');
    expect(text).toContain('구글(Antigravity): 사용 한도 소진 — 87시간 35분 뒤 다시 시도');
    // 구글 무료 · AI Plus 는 주 1회 초기화라는 사실을 같이 알려 준다(웹 교차 확인 2026-10-06).
    expect(text).toContain('주 1회');
    expect(text).toContain('Grok: 설치 안 됨');
    expect(text).toContain('처음 설정 마법사');
  });

  it('쉬는 중이라 건너뛴 엔진도 사유를 그대로 옮긴다', () => {
    const error = new AllAgentsFailedError([], { gemini: '건너뜀: 사용 한도 초과 — 3일 4시간 뒤 다시 시도' }, ['gemini']);
    expect(describeAssistantFailure(error, () => null)).toContain('구글(Antigravity): 사용 한도 소진 — 3일 4시간 뒤 다시 시도');
  });

  it('경로 · 토큰 같은 원문은 화면에 안 넘긴다', () => {
    const error = new AllAgentsFailedError(['claude'], { claude: 'C:\\Users\\me\\.claude 토큰 만료 token=abc123' });
    const text = describeAssistantFailure(error, () => null);
    expect(text).not.toContain('C:\\Users');
    expect(text).not.toContain('abc123');
    expect(text).toContain('Claude: 응답 실패');
  });

  it('엔진 체인 밖 오류는 고칠 방법만', () => {
    expect(describeAssistantFailure(new Error('C:\\Users\\me 경로'), () => null)).toBe(
      'AI 엔진이 답하지 못했습니다 — 설정의 AI 연결(처음 설정 마법사)을 확인해 주세요.',
    );
  });
});
