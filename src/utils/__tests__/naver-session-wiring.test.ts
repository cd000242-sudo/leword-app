import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 네이버 로그인 창 배선(C 0단계, 2026-09-30).
 *
 * 핸들러가 등록되고, 화면 버튼이 같은 채널을 부르고, 세션이 영속 파티션에 남는지.
 * 인벤토리(2026-09-08)의 "정의만 있고 어디서도 안 열리는" 길로 가지 않게 여기서 잠근다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('네이버 로그인 창 배선', () => {
  it('핸들러가 등록 목록에 있다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("import { setupNaverSessionHandlers } from './handlers/naver-session';");
    expect(hub).toContain('setupNaverSessionHandlers();');
  });

  it('세션은 persist 파티션에 남고, 채널 셋이 핸들러·화면 양쪽에 있다', () => {
    const handler = read('src', 'main', 'handlers', 'naver-session.ts');
    const html = read('ui', 'keyword-master.html');
    expect(handler).toContain("NAVER_SESSION_PARTITION = 'persist:naver-login'");
    for (const ch of ['naver-session-status', 'naver-session-open', 'naver-session-clear']) {
      expect(handler).toContain("ipcMain.handle('" + ch + "'");
      expect(html).toContain("invoke('" + ch + "'");
    }
    expect(html).toContain('id="naverSessionState"');
    expect(html).toContain('refreshNaverSession();');
  });

  it('사이트 내 블로그 탭 브리지가 호스트에 실려 있고, 기록 파일 경로는 넘기지 않는다', () => {
    const host = read('src', 'main', 'web-bridge-host.ts');
    const bridge = read('src', 'main', 'web-bridge.ts');
    const deps = read('src', 'main', 'my-blog-bridge-host.ts');
    expect(host).toContain("import { createMyBlogBridgeDeps } from './my-blog-bridge-host';");
    expect(host).toContain('myBlog: createMyBlogBridgeDeps(),');
    expect(bridge).toContain('handleMyBlogRoute(req, res, deps.myBlog');
    expect(deps).toContain("from './handlers/naver-session'");
    expect(deps).toContain("from './handlers/blog-class'");
    expect(deps).not.toContain('probeFile');
    expect(deps).not.toMatch(/endpoints:\s*status\.endpoints/);
  });

  it('창구 판정은 순수 모듈 하나를 쓴다 — 로그인 페이지 요청은 기록하지 않는다', () => {
    const handler = read('src', 'main', 'handlers', 'naver-session.ts');
    expect(handler).toContain("from '../../utils/naver-advisor-probe'");
    expect(handler).toContain('shouldCaptureAdvisorCall(');
    expect(handler).not.toMatch(/brightdata|brightDataFetch/i);
  });
});
