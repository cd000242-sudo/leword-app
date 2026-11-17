import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Wiring for the extra HUB keys: the screen sends the pool only when its container exists
 * (same guard as the other optional fields), the handler stores it through the sanitizer
 * (masked display values are dropped), and every workflow that receives the main HUB key
 * also receives the pool secret.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const renderer = read('ui', 'keyword-master.html');
const handler = read('src', 'main', 'handlers', 'config-utility.ts');
const preload = read('preload.ts');

describe('화면: [다른 계정 키 추가]', () => {
  it('기존 허브 칸 아래에 행 목록과 추가 단추가 있다', () => {
    expect(renderer).toContain('id="naverApiHubPoolRows"');
    expect(renderer).toContain('다른 계정 키 추가');
    expect(renderer.indexOf('id="naverApiHubPoolRows"')).toBeGreaterThan(renderer.indexOf('id="keywordNaverApiHubKey"'));
  });

  it('행마다 Key 칸은 password 로 가리고, 연결 확인·지우기·상태 글자가 있다', () => {
    expect(renderer).toMatch(/hubKeyInput\.type = 'password'/);
    for (const label of ['사용 가능', '오늘 한도 끝', '확인 필요', '지우기']) {
      expect(renderer, label).toContain(label);
    }
  });

  it('저장: 목록이 화면에 있을 때만 보낸다 (없는 칸으로 지우지 않는다)', () => {
    const start = renderer.indexOf('window.saveKeywordSettings = async function');
    const fn = renderer.slice(start, renderer.indexOf('await window.electronAPI.invoke', start));
    expect(fn).toMatch(/\.\.\.\(document\.getElementById\('naverApiHubPoolRows'\) \? \{ naverApiHubKeyPool:/);
    expect(fn).not.toMatch(/naverApiHubKeyPool:\s*document/);
  });

  it('불러오기: 저장된 풀을 행으로 복원한다', () => {
    expect(renderer).toContain('renderNaverApiHubPoolRows(apiKeys.naverApiHubKeyPool)');
  });
});

describe('처리기 · 프리로드', () => {
  it('저장은 sanitizer 를 거치고 undefined 면 건드리지 않는다', () => {
    expect(handler).toContain('if (settings.naverApiHubKeyPool !== undefined) envConfig.naverApiHubKeyPool = sanitizeApiHubKeyPool(settings.naverApiHubKeyPool)');
  });

  it('행 연결 확인은 기존 probe 채널을 쓰고, 상태 조회 채널이 있다', () => {
    expect(handler).toContain("ipcMain.handle('get-naver-api-hub-pool-status'");
    expect(handler).toContain('payload?.poolEntry');
    expect(preload).toMatch(/probeNaverApiHub\(payload: \{[^}]*poolEntry\?: boolean/);
  });
});

describe('GitHub Actions: 허브 키를 받는 워크플로는 풀도 받는다', () => {
  const dir = path.join(root, '.github', 'workflows');
  const files = fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  const withHub = files.filter((name) => /NAVER_APIHUB_KEY:/.test(fs.readFileSync(path.join(dir, name), 'utf8')));

  it('허브 키를 쓰는 워크플로가 있다', () => {
    expect(withHub.length).toBeGreaterThan(0);
  });

  it.each(withHub)('%s — NAVER_APIHUB_KEY 줄마다 NAVER_APIHUB_KEY_POOL 줄이 있다', (name) => {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const keyLines = text.match(/^\s*NAVER_APIHUB_KEY:/gm) || [];
    const poolLines = text.match(/^\s*NAVER_APIHUB_KEY_POOL: \$\{\{ secrets\.NAVER_APIHUB_KEY_POOL \}\}/gm) || [];
    expect(poolLines.length).toBe(keyLines.length);
  });
});
