import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 데스크톱 앱은 AI 를 구독 에이전트로만 부른다 — 배선 확인(2026-09-15, 사장님 "에이전트만 사용하도록 할 건데").
 * 동작은 ai-client-desktop-agent-only 테스트가 보고, 여기서는 API 키 경로가 코드에 다시 생기지 않게 막는다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('데스크톱 AI 호출은 에이전트 전용', () => {
  it('gemini-chat 은 구독 에이전트 체인으로만 답한다 — SDK · 키 검증 IPC 없음', () => {
    const handler = read('src/main/handlers/config-utility.ts');
    const start = handler.indexOf("ipcMain.handle('gemini-chat'");
    expect(start).toBeGreaterThan(0);
    expect(handler.slice(start, start + 2500)).toContain('runWithAnyAgent');
    expect(handler).not.toContain('@anthropic-ai/sdk');
    expect(handler).not.toContain('@google/generative-ai');
    // 핸들러 등록(따옴표 채널 이름)만 본다 — 지운 이유를 적은 주석은 남겨도 된다.
    expect(handler).not.toContain("'verify-anthropic-key'");
  });

  it('callAI 는 에이전트 모듈을 호출 시점에 불러온다 — 모바일 서버가 이 파일을 읽어도 electron 을 끌어오지 않게', () => {
    const client = read('src/utils/pro-hunter-v12/ai-client.ts');
    expect(client).not.toMatch(/^import .*agent-cli/m);
    expect(client).toContain("await import('../agent-cli/runAny')");
    expect(client).not.toContain('export async function verifyClaudeKey');
  });

  it('보강 모듈은 claude 제공자에 Anthropic API 키를 요구하지 않는다', () => {
    expect(read('src/utils/sources/manus-enricher.ts')).not.toContain('anthropicApiKey');
  });

  it('화면에 Anthropic 키 검증 · "Claude 키 없음" 확인창이 없다', () => {
    const ui = read('ui/keyword-master.html');
    expect(ui).not.toContain('verifyAnthropicKey');
    expect(ui).not.toContain('toggleAnthropicKeyVisibility');
    expect(ui).not.toContain("invoke('verify-anthropic-key'");
    expect(ui).not.toContain('Anthropic API 키가 없습니다');
  });
});
