import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { chromium } from 'playwright';
import { describe, expect, it, vi } from 'vitest';

const root = path.join(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'ui/keyword-master.html'), 'utf8');
const script = html.split('/* TOPIC_BRIEFS_EDITORIAL_START */')[1]?.split('/* TOPIC_BRIEFS_EDITORIAL_END */')[0] || 'throw new Error("editorial renderer missing")';
const brief = (key = '청년 지원금', status = 'supported'): any => ({
  field: '생활', title: '검증되지 않은 과거 제목 999만원 보장', coreKeyword: key, primaryIntent: '신청 전에 대상과 일정을 확인하려는 독자', differentiation: '대상 조건과 신청 절차를 나누어 설명', timing: 'NOW', searchVolume: 200, serpFit: '높음', serpFacing: 2, star: true,
  recommendation: { keyword: key, reason: '질문에 답할 근거와 검색어의 측정값을 함께 확인했습니다.' },
  titles: [{ text: key + ' 신청 대상은 누구인가?', target: '질문', type: 'FAQ-X9' }, { text: key + ' 신청 대상과 확인할 절차', target: '설명', type: 'GUIDE-X9' }],
  facts: [{ id: 'f1', title: '청년 지원금 신청 안내', snippet: '신청은 온라인으로 접수한다.', press: '공식 안내', link: 'https://example.com/source', publishedAt: '2026-09-17' }],
  editorial: { version: 2, status, review: { passed: status === 'supported', issues: [] }, summary: '신청은 온라인으로 접수한다.', audience: '지원금 신청을 준비하는 청년', answers: [{ question: '어떻게 신청하나?', answer: '신청은 온라인으로 접수한다.', factIds: ['f1'], excerpts: [{ factId: 'f1', text: '신청은 온라인으로 접수한다.' }] }], missing: status === 'supported' ? [] : ['제출 서류 확인이 필요합니다.'], outline: ['신청 대상 확인', '온라인 접수 방법'], angle: '신청 조건과 절차를 구분해서 설명' },
});

function harness(briefs: any[]) {
  const elements = new Map<string, any>();
  const element = (id: string) => { if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, addEventListener: vi.fn(), querySelectorAll: () => [] }); return elements.get(id); };
  const window: any = { electronAPI: { invoke: vi.fn(async () => ({ success: true, local: { briefs, builtAt: '2026-09-17' }, auto: false })) } };
  const ctx = vm.createContext({ window, document: { getElementById: element }, URL, Set, Map, console });
  new vm.Script(script).runInContext(ctx);
  return { window, element, ctx };
}

describe('오늘의 글감 작성안 UI', () => {
  it('구버전 제목을 다시 추천하지 않고 핵심 검색어와 확인 전 상태를 보여준다', async () => {
    const old = brief(); delete old.editorial;
    const h = harness([old]); await h.window.loadBriefs();
    const rendered = h.element('briefsBody').innerHTML;
    expect(rendered).not.toContain('999만원'); expect(rendered).not.toContain('FAQ-X9');
    expect(rendered).toContain('청년 지원금 · 확인할 내용'); expect(rendered).toContain('확인 전');
    expect(h.element('briefsPriority').innerHTML).toContain('지금 우선 추천할 글감이 없습니다');
  });
  it('답과 추천 검색어가 확인된 최대 5건만 먼저 보여주고 전체 목록은 접어 둔다', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => brief('청년 지원금 ' + i));
    rows.push({ ...brief('잘못 연결'), recommendation: { keyword: '다른 주제', reason: '잘못된 연결' } });
    const h = harness(rows); await h.window.loadBriefs();
    const rendered = h.element('briefsBody').innerHTML;
    expect((h.element('briefsPriority').innerHTML.match(/data-brief-priority="1"/g) || []).length).toBe(5);
    expect(rendered).toContain('id="briefsAllList"'); expect(rendered).not.toContain('id="briefsAllList" open');
    expect(rendered).toContain('추천 접근법'); expect(rendered).toContain('신청 전에 대상과 일정을 확인');
  });
  it('확인 답·근거 발췌·추가 조사·목차를 한 카드에 연결하며 사실 없는 단락은 보완 항목으로 남긴다', async () => {
    const h = harness([brief('청년 지원금', 'needs_research')]); await h.window.loadBriefs();
    const rendered = h.element('briefsBody').innerHTML;
    for (const text of ['어떻게 신청하나?', '온라인으로 접수한다.', '신청은 온라인으로 접수한다.', '제출 서류 확인이 필요합니다.', '온라인 접수 방법']) expect(rendered).toContain(text);
  });
  it('독립 검토가 없거나 실패한 후보는 별표가 있어도 우선 추천하지 않는다', async () => {
    const missing = brief('검토 안 된 글감'); delete missing.editorial.review;
    const failed = brief('검토 실패 글감'); failed.editorial.review = { passed: false, issues: ['신청 대상이 출처와 다릅니다.'] };
    const h = harness([missing, failed]); await h.window.loadBriefs();
    expect(h.element('briefsPriority').innerHTML).not.toContain('data-brief-priority="1"');
    expect(h.element('briefsBody').innerHTML).toContain('독립 내용 검토가 완료되지 않았습니다.');
    expect(h.element('briefsBody').innerHTML).toContain('신청 대상이 출처와 다릅니다.');
  });
  it('추천 키워드와 맞는 제목을 기본 선택하며 다른 핵심 검색어 측정값과 구분한다', async () => {
    const row = brief(); row.alternative = { keyword: '청년 지원금 서류', searchVolume: 120, serpFit: '높음', serpFacing: 1 };
    row.recommendation = { keyword: '청년 지원금 서류', reason: '서류를 확인하려는 독자에게 맞는 검색어' };
    row.titles.push({ text: '청년 지원금 서류 확인할 목록은?', target: '질문' });
    const h = harness([row]); await h.window.loadBriefs();
    expect(h.element('briefsPriority').innerHTML).toContain('>청년 지원금 서류 확인할 목록은?</h4>');
  });
  it.each(['issues 누락', 'issues 문자열', 'missing 문자열', '답 불일치', '근거 불일치', '출처 연결 누락', '요약 불일치'])('%s 응답을 우선 추천하거나 확인한 답으로 표시하지 않는다', async (reason) => {
    const row = brief();
    if (reason === 'issues 누락') delete row.editorial.review.issues;
    if (reason === 'issues 문자열') row.editorial.review.issues = '등록 방식 확인 필요';
    if (reason === 'missing 문자열') row.editorial.missing = '서류 확인 필요';
    if (reason === '답 불일치') row.editorial.answers[0].answer = '방문 접수만 가능하다.';
    if (reason === '근거 불일치') row.editorial.answers[0].excerpts[0].text = row.editorial.answers[0].answer = '방문 접수만 가능하다.';
    if (reason === '출처 연결 누락') row.editorial.answers[0].factIds.push('없는 출처');
    if (reason === '요약 불일치') row.editorial.summary = '현장 신청만 가능하다.';
    const h = harness([row]); await h.window.loadBriefs();
    expect(h.element('briefsPriority').innerHTML).not.toContain('data-brief-priority="1"');
    expect(h.element('briefsBody').innerHTML).not.toContain('확인한 답과 근거 있음');
    expect(h.element('briefsBody').innerHTML).toContain('추가 조사 필요');
  });
  it('출처에서 부정문을 잘라낸 발췌로 추천하지 않는다', async () => {
    const row = brief(); row.facts[0].snippet = '다만 신청은 온라인으로 접수한다. 현장에서는 접수할 수 없다.';
    const h = harness([row]); await h.window.loadBriefs();
    expect(h.element('briefsPriority').innerHTML).not.toContain('data-brief-priority="1"');
  });
  it('검색 요약 대신 저장된 기사 본문 발췌를 근거로 쓰는 작성안도 표시한다', async () => {
    const row = brief(); row.facts[0].snippet = ''; row.facts[0].evidenceExcerpts = ['신청은 온라인으로 접수한다.'];
    const h = harness([row]); await h.window.loadBriefs();
    expect(h.element('briefsPriority').innerHTML).toContain('data-brief-priority="1"');
    expect(h.element('briefsPriority').innerHTML).toContain('신청은 온라인으로 접수한다.');
  });
  it('출처·분야·제목에 HTML과 따옴표가 있어도 동적 onclick 코드로 만들지 않는다', async () => {
    const row = brief(); row.field = '\" onclick=\"alert(1)'; row.facts[0].link = 'javascript:alert(1)'; row.titles[0].text = '청년 지원금 <img src=x onerror=alert(1)> 안내';
    const h = harness([row]); await h.window.loadBriefs();
    expect(h.element('briefsBody').innerHTML).not.toMatch(/<[^>]+\sonclick\s*=/);
    expect(h.element('briefsBody').innerHTML).not.toContain('href="javascript:');
    expect(h.element('briefsFilters').innerHTML).not.toContain('<button onclick=');
  });
});

it.skipIf(process.env.TOPIC_BRIEFS_DOM_TEST !== '1')('실제 DOM에서 카드 펼치기·제목 선택·작성안 복사·필터·레거시 표시를 검증한다', async () => {
  const section = html.match(/<section class="leword-screen" data-screen="briefs">[\s\S]*?<\/section>/)![0];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<body style="background:#020617;padding:24px;font-family:sans-serif;">' + section + '</body>');
    const old = brief('구버전 글감'); delete old.editorial; old.field = '과학';
    await page.evaluate((rows) => {
      const w = window as any; w.__copied = ''; w.__open = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { w.__copied = text; } } });
      w.electronAPI = { invoke: async () => ({ success: true, local: { briefs: rows, builtAt: '2026-09-17' }, auto: false }), openExternal: async (url: string) => w.__open.push(url) };
    }, [brief(), brief('추가 조사 글감', 'needs_research'), old]);
    await page.addScriptTag({ content: script }); await page.evaluate(() => (window as any).loadBriefs());
    const priority = page.locator('[data-brief-priority="1"]');
    expect(await priority.count()).toBe(1);
    await priority.locator('summary[data-brief-expand]').click();
    expect(await priority.getByText('근거 발췌: “신청은 온라인으로 접수한다.”', { exact: false }).isVisible()).toBe(true);
    expect(await priority.innerText()).not.toContain('FAQ-X9'); expect(await priority.innerText()).not.toContain('AI답변');
    await priority.locator('[data-brief-title]').selectOption('1');
    await priority.locator('[data-brief-copy="full"]').click();
    await page.waitForFunction(() => (window as any).__copied.includes('신청 대상과 확인할 절차'));
    const copied = await page.evaluate(() => (window as any).__copied);
    for (const text of ['청년 지원금 신청 대상과 확인할 절차', '지원금 신청을 준비하는 청년', '어떻게 신청하나?', '온라인으로 접수한다.', 'https://example.com/source', '추가 조사', '목차', '작성 관점: 신청 조건과 절차를 구분해서 설명']) expect(copied).toContain(text);
    expect(await priority.locator('[data-brief-feedback]').innerText()).toContain('복사했습니다');
    await priority.locator('[data-brief-link]').first().click();
    expect(await page.evaluate(() => (window as any).__open)).toEqual(['https://example.com/source']);
    await page.evaluate(() => { (navigator.clipboard as any).writeText = async () => { throw new Error('복사 권한이 없습니다.'); }; });
    await priority.locator('[data-brief-copy="title"]').click();
    await page.waitForFunction(() => document.querySelector('[data-brief-priority="1"] [data-brief-feedback]')?.textContent?.includes('복사 실패'));
    expect(await priority.locator('[data-brief-copy="title"]').isEnabled()).toBe(true);
    await page.locator('#briefsAllList > summary').click();
    await page.getByRole('button', { name: /과학/ }).click();
    const all = page.locator('#briefsAllList');
    expect(await all.innerText()).toContain('구버전 글감 · 확인할 내용'); expect(await all.innerText()).not.toContain('999만원');
    expect(errors).toEqual([]);
    fs.mkdirSync(path.join(root, '.codex-build-cache'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.codex-build-cache/topic-briefs-editorial.png'), fullPage: true });
  } finally { await browser.close(); }
}, 30_000);
