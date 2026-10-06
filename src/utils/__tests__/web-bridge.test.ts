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
  forgeInsights: async (keyword: string, options?: { loose?: boolean }) => ({
    keyword, loose: Boolean(options?.loose),
    subs: [{ keyword: keyword + ' 안됨', searchVolume: 120 }],
  }),
  radarAnalyze: async (input: unknown) => input,
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

    it('크롬 확장(LDB IMAGE ULTRA)은 통과시킨다', async () => {
        const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
        const res = await fetch(`${base}/v1/bridge/status`, { headers: { Origin: origin } });
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    });

    it('확장 주소를 흉내 낸 값은 막는다', async () => {
        for (const origin of [
            'chrome-extension://short',                                  // 길이가 다름
            'chrome-extension://abcdefghijklmnopabcdefghijklmnoz',       // 확장 ID 에 없는 글자
            'https://chrome-extension.evil.example',                     // 스킴만 흉내
        ]) {
            const res = await fetch(`${base}/v1/bridge/status`, { headers: { Origin: origin } });
            expect(res.status, origin).toBe(403);
        }
    });

    it('loose 를 보내면 그대로 서비스까지 전달한다', async () => {
        // 확장은 넓게 받아야 기대수익 순 정렬이 의미가 있다. LEWORD 자체 화면은 엄격한 채로 둔다.
        const res = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'POST',
            headers: { Origin: 'https://leaderspro.kr', 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: '연말정산', loose: true }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.result.loose).toBe(true);
    });

    it('loose 를 안 보내면 엄격한 기본값이다', async () => {
        const res = await fetch(`${base}/v1/bridge/ai-subs`, {
            method: 'POST',
            headers: { Origin: 'https://leaderspro.kr', 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: '연말정산' }),
        });
        const body = await res.json();
        expect(body.result.loose).toBe(false);
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
    it('레이더는 주소와 측정 키만 전달하고 임의 프롬프트를 받지 않는다', async () => {
        const res = await fetch(`${base}/v1/bridge/radar-analyze`, {
            method: 'POST', headers: { Origin: 'https://leaderspro.kr', 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/post', prompt: 'ignored', provider: 'unknown', keys: { openApiId: 'test', geminiKey: 'ignored' } }),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).result).toEqual({ url: 'https://example.com/post', provider: '', keys: { openApiId: 'test' } });
        const bad = await fetch(`${base}/v1/bridge/radar-analyze`, { method: 'POST', body: JSON.stringify({ url: 'file:///etc/passwd' }) });
        expect(bad.status).toBe(400);
    });
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
