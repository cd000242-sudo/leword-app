import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';

// 설치된 Chromium으로 실제 DOM을 검증하는 선택 실행. AI와 네트워크는 호출하지 않는다.
it.skipIf(process.env.HOMEFEED_DOM_TEST !== '1')('앱 홈판 목록 → 상세 → 선택 수정/저장 → 원고 → 공개 지정 → 근거 변경', async () => {
  const root = path.join(__dirname, '../../..');
  const html = fs.readFileSync(path.join(root, 'ui/keyword-master.html'), 'utf8');
  const section = html.match(/<section class="leword-screen" data-screen="homefeed">[\s\S]*?<\/section>/)![0];
  const script = html.split('/* HOMEFEED_EDITORIAL_START */')[1].split('/* HOMEFEED_EDITORIAL_END */')[0];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1140, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<html lang="ko"><meta charset="utf-8"><body style="background:#020617;padding:24px;font-family:sans-serif;">' + section + '</body></html>');
    await page.evaluate(() => {
      const w = window as any;
      const angle = { id: 'angle-1', label: '판결 이후 개장 절차', readerQuestion: '항소심 패소로 개장 절차가 어떻게 달라질까?', difference: '수집 기사에서 확인한 판결 내용과 미확인 개장 일정을 구분한다.', sectionIds: ['section-1'], suggestedTitle: '남산 곤돌라 항소심 패소, 개장 전에 확인할 절차', firstCard: { line1: '남산 곤돌라 항소심 패소', line2: '개장 전 확인할 절차는?' } };
      w.__editorial = { state: 'ready', evidenceRevision: 'ev-1', summary: '남산 곤돌라 사업자가 항소심에서도 패소했다.', sourceTitle: '남산 곤돌라 2심 패소', sourceUrl: 'https://news.example/a', shared: false, brief: { revision: 'brief-1', evidenceRevision: 'ev-1', readiness: 'ready', review: { passed: true, issues: [] }, whyNow: '항소심 판결이 보도됐다.', audience: '남산 곤돌라 사업의 판결에 관심 있는 시민', recommendedAngleId: 'angle-1', angles: [angle], sections: [{ id: 'section-1', question: '이번 판결이 확정한 것은 무엇인가?', answer: '사업자가 항소심에서 패소했다.', factIds: ['fact-1'] }], facts: [{ id: 'fact-1', text: '사업자가 항소심에서 패소했다.', supports: [{ sourceId: 'source-1', excerpt: '사업자가 항소심에서도 패소했다.' }] }], sources: [{ id: 'source-1', title: '남산 곤돌라 사업자 항소심 패소', url: 'https://news.example/a', imageUrl: 'https://news.example/a.jpg', level: 'description', text: '사업자가 항소심에서도 패소했다.' }], unresolved: [], problems: [] }, selection: { revision: 2, briefRevision: 'brief-1', evidenceRevision: 'ev-1', angleId: 'angle-1', title: '저장했던 제목', card: { line1: '저장했던 첫 줄', line2: '저장했던 둘째 줄' }, imageId: 'source-1' } };
      w.__calls = [];
      const story = () => ({ id: 'story-1', issueKey: 'issue-1', keyword: '남산 곤돌라', category: '사회', status: { state: 'NOW' }, signals: { rankNow: 2, newsDelta30m: 3, docDelta30m: null, cloneRatio: 0.2 }, firstCard: { headline1: '남산 명동' }, editorial: w.__editorial });
      w.electronAPI = {
        homefeedStories: async () => ({ success: true, result: { stories: [story()], snapshotAt: '2026-09-17T08:00:00Z' } }),
        homefeedStory: async () => ({ success: true, result: { story: story(), editorial: w.__editorial, assets: {} } }),
        homefeedSelectEditorial: async (input: any) => { w.__calls.push(['save', input]); w.__editorial.selection = { ...input, revision: 3 }; return { success: true, result: { editorial: w.__editorial, selection: w.__editorial.selection } }; },
        homefeedDraft: async (input: any) => { w.__calls.push(['draft', input]); return { success: true, result: { draft: { text: '검증용 원고: ' + w.__editorial.selection.title } } }; },
        homefeedShareEditorial: async (input: any) => { w.__calls.push(['share', input]); w.__editorial.shared = input.share; return { success: true, result: { editorial: w.__editorial, shared: input.share, publishResult: { written: 'C:/site/public/data/homefeed-stories.json', reason: null } } }; },
      };
    });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => (window as any).loadHomefeedBoard());
    expect(await page.locator('#homefeedBody').innerText()).toContain('항소심에서도 패소');
    expect(await page.locator('#homefeedBody').innerText()).not.toContain('남산 명동');
    await page.getByRole('button', { name: '작성안과 근거 보기' }).click();
    await page.locator('#homefeedTitle').waitFor();
    expect(await page.locator('#homefeedTitle').inputValue()).toBe('저장했던 제목');
    expect(await page.locator('#homefeedImage').inputValue()).toBe('source-1');
    await page.locator('#homefeedTitle').fill('내가 수정한 제목');
    await page.locator('#homefeedCard1').fill('내가 수정한 첫 줄');
    await page.locator('#homefeedDraftBtn').click();
    await page.waitForFunction(() => document.getElementById('homefeedDraftOutput')?.textContent?.includes('내가 수정한 제목'));
    const calls = await page.evaluate(() => (window as any).__calls);
    expect(calls.map((item: any) => item[0])).toEqual(['save', 'draft']);
    expect(calls[0][1].card.line1).toBe('내가 수정한 첫 줄');
    expect(calls[1][1].selectionRevision).toBe(3);
    await page.locator('#homefeedShareBtn').click();
    await page.waitForFunction(() => document.getElementById('homefeedDetailStatus')?.textContent?.includes('배포 후'));
    expect(await page.locator('#homefeedTitle').inputValue()).toBe('내가 수정한 제목');
    fs.mkdirSync(path.join(root, '.codex-build-cache'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.codex-build-cache/homefeed-editorial-ready.png'), fullPage: true });
    await page.evaluate(() => { (window as any).__editorial = { ...(window as any).__editorial, state: 'stale', evidenceRevision: 'ev-2' }; return (window as any).loadHomefeedBoard(); });
    expect(await page.locator('#homefeedDraftBtn').isDisabled()).toBe(true);
    expect(await page.locator('#homefeedShareBtn').isDisabled()).toBe(false);
    expect(await page.locator('#homefeedDetail').innerText()).toContain('근거 변경');
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 30_000);
