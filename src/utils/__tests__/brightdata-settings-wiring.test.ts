/**
 * Bright Data 토큰 칸 배선(2026-10-06 설계실 3차). 칸만 만들고 저장 · 복원에서 빠뜨리는 게 단골 사고라
 * 화면 저장 · 앱 저장 · 불러오기 · 복원 네 곳이 이어져 있는지 잠근다. 칸이 없으면 보내지 않는다(다른 칸을 빈 값으로 덮지 않게).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('Bright Data 토큰 설정 배선', () => {
  it('화면에 칸이 있고, 칸이 있을 때만 저장에 담고, 불러온 값을 칸에 채운다', () => {
    const html = read('ui', 'keyword-master.html');
    expect(html).toMatch(/id="keywordBrightDataToken"[^>]*autocomplete="new-password"/);
    expect(html).toContain("...(document.getElementById('keywordBrightDataToken') ? { brightDataToken:");
    expect(html).toContain("if (bdToken) bdToken.value = apiKeys.brightDataToken || '';");
  });
  it('앱이 저장하고 돌려준다', () => {
    const config = read('src', 'main', 'handlers', 'config-utility.ts');
    expect(config).toContain('if (settings.brightDataToken !== undefined) envConfig.brightDataToken = settings.brightDataToken;');
    expect(config).toContain("brightDataToken: env.brightDataToken || '',");
  });
  it('설계실 커뮤니티 검색이 그 값을 읽는다', () => {
    expect(read('src', 'main', 'handlers', 'post-plan.ts')).toContain('cfg.brightDataToken');
  });
});
