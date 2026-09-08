import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it } from 'vitest';

/**
 * 렌더러 인라인 스크립트 문법 안전망 (2026-09-09 앱 리뉴얼).
 *
 * ui/keyword-master.html 은 2만 줄짜리 한 파일이라, 기능을 덜어낼 때 괄호 하나만 어긋나도
 * 앱 화면 전체가 조용히 죽는다(브라우저는 그 <script> 블록을 통째로 버린다).
 * 여기서는 src 없는 <script> 본문을 전부 뽑아 vm.Script 로 컴파일만 한다 — 실행은 하지 않는다.
 * 실패하면 몇 번째 블록·HTML 몇 번째 줄인지 바로 보인다.
 */
const root = path.join(__dirname, '..', '..', '..');
const htmlPath = path.join(root, 'ui', 'keyword-master.html');

interface InlineScript {
    index: number;
    htmlLine: number;
    body: string;
}

function extractInlineScripts(html: string): InlineScript[] {
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
    const out: InlineScript[] = [];
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = re.exec(html)) !== null) {
        index += 1;
        const attrs = match[1] || '';
        if (/\bsrc\s*=/.test(attrs)) continue;
        const htmlLine = html.slice(0, match.index).split('\n').length;
        out.push({ index, htmlLine, body: match[2] });
    }
    return out;
}

describe('렌더러 인라인 스크립트 문법', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const scripts = extractInlineScripts(html);

    it('인라인 스크립트가 최소 5개는 있다 (추출기 자체가 죽지 않았는지)', () => {
        expect(scripts.length).toBeGreaterThanOrEqual(5);
    });

    it('모든 인라인 스크립트가 문법 오류 없이 컴파일된다', () => {
        const failures: string[] = [];
        for (const s of scripts) {
            try {
                // eslint-disable-next-line no-new
                new vm.Script(s.body, { filename: `keyword-master.html#script-${s.index}` });
            } catch (error) {
                const err = error as Error & { stack?: string };
                // vm 은 스택 첫 줄에 "filename:line" 을 준다 — 블록 안 줄 번호를 HTML 줄 번호로 환산한다.
                const stackLine = String(err.stack || '').split('\n')[0] || '';
                const inBlock = Number((stackLine.match(/#script-\d+:(\d+)/) || [])[1] || 0);
                const htmlLine = inBlock > 0 ? s.htmlLine + inBlock - 1 : s.htmlLine;
                failures.push(`script #${s.index} (HTML ${htmlLine}줄 부근): ${err.message}`);
            }
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
