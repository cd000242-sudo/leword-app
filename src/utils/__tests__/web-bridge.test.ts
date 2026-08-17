import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import { createWebBridge } from '../../main/web-bridge';

/**
 * 웹 브리지 — 사이트가 사용자 PC 의 클로드코드를 쓰는 통로.
 *
 * 보안 계약을 고정한다: 허용 출처만 통과, PNA 프리플라이트 응답,
 * 키워드 고정 템플릿만(임의 프롬프트 통로 아님), 본문 한도.
 */

const deps = {
  appVersion: 'test-1.0.0',
  getAgentStatuses: async () => [{ provider: 'claude', installed: true, loggedIn: true, available: true, detail: '' }],
  forgeInsights: async (keyword: string) => ({ keyword, subs: [{ keyword: keyword + ' 안됨', searchVolume: 120 }] }),
  adminWorker: {
    status: async () => ({ status: 'completed', conclusion: 'success' }),
    dispatchTest: async () => ({ dispatched: true }),
  },
};

let base = '';
const server = createWebBridge(deps);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('출처 통제 — 남의 사이트가 방문자 브라우저로 부리지 못한다', () => {
    it('허용 출처는 CORS 헤더와 함께 통과한다', async () => {
        const res = await fetch(`${base}/v1/bridge/status`, { headers: { Origin: 'https://leaderspro.kr' } });
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('https://leaderspro.kr');
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.app).toBe('leword');
    });

    it('허용 밖 출처는 403 — CORS 헤더도 주지 않는다', async () => {
        const res = await fetch(`${base}/v1/bridge/status`, { headers: { Origin: 'https://evil.example' } });
        expect(res.status).toBe(403);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('PNA 프리플라이트에 Allow-Private-Network 로 응답한다', async () => {
        const res = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://leaderspro.kr',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Private-Network': 'true',
            },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-private-network')).toBe('true');
    });
});

describe('추론 경로 — 키워드 하나, 고정 템플릿만', () => {
    it('키워드를 받아 인사이트를 돌려준다', async () => {
        const res = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'POST',
            headers: { Origin: 'https://leaderspro.kr', 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: '민증사진 규칙' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.result.keyword).toBe('민증사진 규칙');
    });

    it('빈 키워드·60자 초과는 400', async () => {
        const bad = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: '' }),
        });
        expect(bad.status).toBe(400);
        const long = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: '가'.repeat(61) }),
        });
        expect(long.status).toBe(400);
    });
});

describe('어드민 작업자 — 사장님 PC 의 gh 인증 대행', () => {
    it('상태·디스패치 경로가 배선돼 있다', async () => {
        const status = await fetch(`${base}/v1/bridge/admin/worker-status`, { headers: { Origin: 'https://leaderspro.kr' } });
        expect(status.status).toBe(200);
        expect((await status.json()).result.conclusion).toBe('success');
        const dispatch = await fetch(`${base}/v1/bridge/admin/worker-test`, { method: 'POST', headers: { Origin: 'https://leaderspro.kr' } });
        expect((await dispatch.json()).result.dispatched).toBe(true);
    });
});
