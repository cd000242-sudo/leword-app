import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 설정 저장 결함 회귀(2026-09-08 인벤토리): saveKeywordSettings 가 화면에 없는 칸 6개
 * (Anthropic·Manus·쿠팡 3종·AI 모드)를 빈 문자열로 보내 저장할 때마다 그 키를 지웠다.
 * 렌더러는 칸이 있을 때만 보내고, 핸들러는 undefined 를 건드리지 않아야 한다.
 */
const root = path.join(__dirname, '..', '..', '..');
const renderer = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'src', 'main', 'handlers', 'config-utility.ts'), 'utf8');

describe('키워드 설정 저장 — 없는 칸으로 키를 지우지 않는다', () => {
    const start = renderer.indexOf('window.saveKeywordSettings = async function');
    const fn = renderer.slice(start, renderer.indexOf('await window.electronAPI.invoke', start));

    it('렌더러: 화면에 없는 칸은 조건부로만 보낸다', () => {
        for (const id of ['anthropicApiKey', 'manusApiKey', 'coupangAccessKey', 'coupangSecretKey', 'coupangSubId', 'aiInferenceMode']) {
            expect(fn, id + ' 를 빈 값으로 보낸다').not.toMatch(new RegExp(id + ":\\s*\\w+\\?\\.value\\?\\.trim\\(\\) \\|\\| ''"));
            expect(fn, id + ' 조건부 전송이 없다').toMatch(new RegExp('\\.\\.\\.\\([A-Za-z]+ \\? \\{ ' + id + ':'));
        }
        expect(fn).not.toContain("aiInferenceMode: aiModeRadio?.value || 'auto'");
    });

    it('핸들러: undefined 인 칸은 저장 객체에 넣지 않는다', () => {
        for (const id of ['anthropicApiKey', 'manusApiKey', 'coupangAccessKey', 'coupangSecretKey', 'coupangSubId', 'aiInferenceMode']) {
            expect(handler).toContain('if (settings.' + id + ' !== undefined) envConfig.' + id);
        }
    });

    it('HUB 키 칸은 실제로 있어서 그대로 보낸다', () => {
        expect(renderer).toContain('id="keywordNaverApiHubKeyId"');
        expect(renderer).toContain('id="keywordNaverApiHubKey"');
        expect(fn).toContain('naverApiHubKeyId:');
    });
});
