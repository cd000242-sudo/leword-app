import * as fs from 'fs';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWebBridge } from '../../main/web-bridge';

/**
 * 앱은 클로드 구독 토큰을 사이트로 넘기지 않는다(2026-09-16 사장님 결정 "브리지 전용으로 정리").
 *
 * 예전 /v1/bridge/claude-credentials 는 ~/.claude/.credentials.json 의 accessToken · refreshToken 을 사이트에 건넸고,
 * 사이트는 그 토큰을 워커로 보내 워커가 Anthropic 을 직접 불렀다. 구독 토큰을 제3자 서버가 쓰는 구조라 약관 위반 소지가 있다.
 * 사이트 AI 는 이제 앱 브리지 경로(지식인 답변 · 글감 · 레이더 · 글 진단 등)로만 돈다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

const server = createWebBridge({
  appVersion: 'test-1.0.0',
  getAgentStatuses: async () => [],
  forgeInsights: async (keyword: string) => ({ keyword, subs: [] }),
});
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('브리지는 구독 토큰을 넘기지 않는다', () => {
  it('예전 토큰 전달 경로는 허용 출처에서 불러도 404', async () => {
    const res = await fetch(`${base}/v1/bridge/claude-credentials`, {
      method: 'POST',
      headers: { Origin: 'https://leaderspro.kr', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('Origin 없는 로컬 요청에도 404', async () => {
    const res = await fetch(`${base}/v1/bridge/claude-credentials`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('앱 코드가 클로드 자격 파일을 읽어 넘기는 길을 다시 만들지 않는다', () => {
    const host = read('src/main/web-bridge-host.ts');
    const bridge = read('src/main/web-bridge.ts');
    expect(host).not.toContain('.credentials.json');
    expect(host).not.toContain('claudeAiOauth');
    expect(bridge).not.toContain('claude-credentials');
    expect(bridge).not.toContain('claudeCredentials');
  });
});
