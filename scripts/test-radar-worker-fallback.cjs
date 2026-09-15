const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(process.argv[2] || 'tmp/cf-worker/worker.js'), 'utf8');
function harness() {
  let llmCalls = 0;
  const reply = JSON.stringify({ coreKeywords: ['지원금 신청'], queries: ['지원금 신청 방법'], answers: [{ q: '신청 방법', a: '온라인 신청' }] });
  const context = vm.createContext({
    URL, Set, Promise, setTimeout, str: v => String(v || ''),
    RADAR_CONFIG: { maxQueries: 6 }, hasAnyEngine: keys => !!keys.claudeToken,
    fetch: async () => ({ ok: true, text: async () => '<h1>지원금</h1>' }),
    radarExtractPage: () => ({ title: '지원금', text: '온라인 신청', metaDescription: '신청 안내', h2: [] }),
    llmText: async () => { llmCalls++; return { ok: true, text: reply }; },
    radarParseJson: text => { try { return JSON.parse(text); } catch { return null; } },
    credentials: () => ({}), searchAdRequest: async () => ({ ok: true, json: async () => ({ keywordList: [{ relKeyword: '지원금신청', monthlyPcQcCnt: 30, monthlyMobileQcCnt: 70 }] }) }),
  });
  vm.runInContext(source.slice(source.indexOf('async function radarAnalyzeUrl('), source.indexOf('/** 프로바이더 하나 —', source.indexOf('async function radarAnalyzeUrl('))), context);
  return { context, reply, calls: () => llmCalls };
}
test('앱 분석은 서버 AI 자격 없이 같은 근거와 프롬프트를 받고 추론하지 않는다', async () => {
  const h = harness();
  const result = await h.context.radarAnalyzeUrl({}, {}, { url: 'https://example.com/post', aiVia: 'app' });
  assert.equal(result.ok, true);
  assert.match(result.prompt, /온라인 신청/);
  assert.equal(result.page.title, '지원금');
  assert.equal(h.calls(), 0);
});
test('앱 응답과 서버 응답은 같은 파서와 검색량 측정을 쓴다', async () => {
  const h = harness();
  const prepared = await h.context.radarAnalyzeUrl({}, {}, { url: 'https://example.com/post', aiVia: 'app' });
  const app = await h.context.radarParseAnalysis({}, {}, { aiText: h.reply, page: prepared.page, url: prepared.url });
  const server = await h.context.radarAnalyzeUrl({ claudeToken: 'test' }, {}, { url: prepared.url });
  assert.equal(JSON.stringify(app.analysis), JSON.stringify(server.analysis));
  assert.equal(app.analysis.coreKeywords[0].searchVolume, 100);
  assert.equal(app.analysis.coreKeywords[0].documentCount, null);
});
test('해석 실패 또는 빈 질의는 성공 분석으로 내보내지 않는다', async () => {
  const h = harness();
  for (const aiText of ['bad-json', '{"queries":[]}']) {
    const result = await h.context.radarParseAnalysis({}, {}, { aiText, page: {}, url: 'https://example.com/post' });
    assert.equal(result.ok, false);
  }
});
