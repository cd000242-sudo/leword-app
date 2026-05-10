/**
 * Manus API v2 통합 검증 스위트
 *
 * 목적: 실제 키워드 분석 prompt를 다양한 변량으로 N회 호출해서
 *      파서·완료 감지·응답 스키마 일관성을 검증.
 *
 * 사용법:
 *   set MANUS_API_KEY=sk-su_...
 *   npx ts-node scripts/manus-validation-suite.ts [runs] [concurrency]
 *
 * 예: npx ts-node scripts/manus-validation-suite.ts 30 3
 *      → 30회, 동시 3개씩 실행
 *
 * 비용 추정: lite agent 회당 ~$0.05~0.20. 30회 = $1.5~6
 */

const MANUS_API_BASE = 'https://api.manus.ai/v2';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const apiKey = process.env.MANUS_API_KEY || '';
if (!apiKey) {
  console.error('❌ MANUS_API_KEY 환경변수 미설정');
  process.exit(1);
}

// ── 테스트 케이스 (실제 LEWORD 사용 패턴 반영) ──
interface TestCase {
  name: string;
  buildPrompt(): string;
  expectInsights: number;   // 기대되는 insights 개수
  expectDiscovered: number; // 기대되는 discovered 개수 (LLM 자유도라 가변)
  agentProfile: 'manus-1.6' | 'manus-1.6-lite' | 'manus-1.6-max';
}

const KEYWORDS_5_IT = ['클라우드 호스팅', 'AI 코딩 도구', '리액트 18 마이그레이션', '도커 보안', '쿠버네티스 모니터링'];
const KEYWORDS_10_LIFE = ['홈트레이닝 루틴', '저탄고지 식단', '미니멀 라이프', '제로 웨이스트', '비건 레시피', '명상 앱', '독서 습관', '아침 루틴', '디지털 디톡스', '집중력 향상'];
const KEYWORDS_30_BEAUTY = Array.from({ length: 30 }, (_, i) => `뷰티 키워드${i + 1}`);

function buildKeywordPrompt(keywords: string[], category: string): string {
  return `당신은 한국 네이버 블로그 SEO 전문가다.
카테고리: ${category}

【1단계】 다음 ${keywords.length}개 후보의 인사이트:
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

각 키워드에 대해 트렌드, 위험, 콘텐츠 앵글을 분석.

【2단계】 같은 카테고리 신규 SSS 후보 5~10개 추가 추천.

JSON 객체로만 응답:
{
  "insights": [{"keyword":"원본","trendScore":1-10,"riskFlags":[],"angle":"앵글"}],
  "discovered": [{"keyword":"신규","reason":"이유"}]
}`;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'kw-5-it-lite',
    buildPrompt: () => buildKeywordPrompt(KEYWORDS_5_IT, 'IT'),
    expectInsights: 5,
    expectDiscovered: 5,
    agentProfile: 'manus-1.6-lite',
  },
  {
    name: 'kw-10-life-lite',
    buildPrompt: () => buildKeywordPrompt(KEYWORDS_10_LIFE, '생활'),
    expectInsights: 10,
    expectDiscovered: 5,
    agentProfile: 'manus-1.6-lite',
  },
  {
    name: 'kw-30-beauty-lite',
    buildPrompt: () => buildKeywordPrompt(KEYWORDS_30_BEAUTY, '뷰티'),
    expectInsights: 30,
    expectDiscovered: 5,
    agentProfile: 'manus-1.6-lite',
  },
  {
    name: 'kw-5-it-standard',
    buildPrompt: () => buildKeywordPrompt(KEYWORDS_5_IT, 'IT'),
    expectInsights: 5,
    expectDiscovered: 5,
    agentProfile: 'manus-1.6',
  },
];

// ── 동일 enricher 파서 로직 복제 (격리 테스트) ──
function collectTexts(node: any, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || node == null) return out;
  if (typeof node === 'string') {
    if (node.trim().length > 0) out.push(node);
    return out;
  }
  if (typeof node === 'number' || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectTexts(item, depth + 1, out);
    return out;
  }
  if (typeof node === 'object') {
    const textKeys = ['content', 'text', 'message', 'output', 'body', 'answer', 'value', 'response'];
    for (const k of textKeys) if (k in node) collectTexts(node[k], depth + 1, out);
    const arrKeys = ['messages', 'outputs', 'events', 'assistant_messages', 'blocks', 'data', 'result'];
    for (const k of arrKeys) if (k in node && !textKeys.includes(k)) collectTexts(node[k], depth + 1, out);
  }
  return out;
}

interface ManusAttachment { url: string; filename: string; contentType: string }

function extractAgentStatusAndMessages(data: any): { agentStatus: string; assistantTexts: string[]; jsonAttachments: ManusAttachment[] } {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  let agentStatus = '';
  for (const m of messages) {
    if (m?.type === 'status_update') {
      agentStatus = String(m.status_update?.agent_status || '').toLowerCase();
      if (agentStatus) break;
    }
  }
  const assistantTexts: string[] = [];
  const jsonAttachments: ManusAttachment[] = [];
  for (const m of messages) {
    if (m?.type !== 'assistant_message') continue;
    const payload = m.assistant_message ?? m;
    // 1. content 텍스트 수집
    const texts = collectTexts(payload.content ?? payload);
    if (texts.length > 0) assistantTexts.push(texts.join('\n'));
    // 2. 텍스트류 첨부 모두 시도 (Manus가 .txt로 JSON 보내는 케이스 발견)
    const atts = payload?.attachments;
    if (Array.isArray(atts)) {
      for (const a of atts) {
        const ct = String(a?.content_type || '').toLowerCase();
        const fn = String(a?.filename || '');
        const url = String(a?.url || '');
        if (url && (ct.startsWith('application/json') || ct.startsWith('text/') || /\.(json|txt|md)$/i.test(fn))) {
          jsonAttachments.push({ url, filename: fn, contentType: ct });
        }
      }
    }
  }
  return { agentStatus, assistantTexts, jsonAttachments };
}

async function fetchAttachmentText(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`attachment ${resp.status}`);
  return await resp.text();
}

function tryParseJsonObject(text: string): { insights: any[]; discovered: any[]; parseOk: boolean; parseError?: string } {
  if (!text) return { insights: [], discovered: [], parseOk: false, parseError: 'empty' };
  let jsonText = text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();
  const startIdx = jsonText.indexOf('{');
  const endIdx = jsonText.lastIndexOf('}');
  if (startIdx < 0 || endIdx <= startIdx) return { insights: [], discovered: [], parseOk: false, parseError: 'no JSON braces' };
  jsonText = jsonText.slice(startIdx, endIdx + 1);
  try {
    const parsed = JSON.parse(jsonText);
    return {
      insights: Array.isArray(parsed?.insights) ? parsed.insights : [],
      discovered: Array.isArray(parsed?.discovered) ? parsed.discovered : [],
      parseOk: true,
    };
  } catch (e: any) {
    return { insights: [], discovered: [], parseOk: false, parseError: e.message };
  }
}

function parseManusMessages(assistantTexts: string[]): { insights: any[]; discovered: any[]; parseOk: boolean; parseError?: string; usedMessageIdx?: number } {
  // 각 assistant_message에 대해 JSON 파싱 시도 → insights 배열 가진 것 우선 선택
  for (let i = 0; i < assistantTexts.length; i++) {
    const r = tryParseJsonObject(assistantTexts[i]);
    if (r.parseOk && r.insights.length > 0) {
      return { ...r, usedMessageIdx: i };
    }
  }
  // fallback: 가장 긴 것
  if (assistantTexts.length > 0) {
    const longest = assistantTexts.reduce((a, b) => (b.length > a.length ? b : a));
    const r = tryParseJsonObject(longest);
    return { ...r, usedMessageIdx: -1 };
  }
  return { insights: [], discovered: [], parseOk: false, parseError: 'no assistant messages' };
}

// ── API 호출 ──
async function createTask(prompt: string, profile: string): Promise<string> {
  const resp = await fetch(`${MANUS_API_BASE}/task.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-manus-api-key': apiKey },
    body: JSON.stringify({
      message: { content: [{ type: 'text', text: prompt }] },
      agent_profile: profile,
    }),
  });
  if (!resp.ok) throw new Error(`task.create ${resp.status}: ${await resp.text()}`);
  const data: any = await resp.json();
  if (!data?.task_id) throw new Error(`no task_id: ${JSON.stringify(data)}`);
  return data.task_id;
}

const INITIAL_GRACE_MS = 3000;
const RETRY_404_WINDOW_MS = 30_000;

async function pollUntilDone(taskId: string): Promise<{ assistantTexts: string[]; jsonAttachments: ManusAttachment[]; rawSample: string; statusHistory: string[]; pollCount: number; retries404: number }> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, INITIAL_GRACE_MS));
  const statusHistory: string[] = [];
  let lastTexts: string[] = [];
  let lastAttachments: ManusAttachment[] = [];
  let lastSample = '';
  let pollCount = 0;
  let retries404 = 0;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    pollCount++;
    const resp = await fetch(`${MANUS_API_BASE}/task.listMessages?task_id=${taskId}&order=desc&limit=20`, {
      headers: { 'x-manus-api-key': apiKey },
    });
    if (resp.status === 404 && Date.now() - start < RETRY_404_WINDOW_MS) {
      retries404++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    if (!resp.ok) throw new Error(`listMessages ${resp.status}`);
    const data: any = await resp.json();
    lastSample = JSON.stringify(data).slice(0, 1500);
    const { agentStatus, assistantTexts, jsonAttachments } = extractAgentStatusAndMessages(data);
    if (assistantTexts.length > 0) lastTexts = assistantTexts;
    if (jsonAttachments.length > 0) lastAttachments = jsonAttachments;
    if (statusHistory[statusHistory.length - 1] !== agentStatus) statusHistory.push(agentStatus);
    if (agentStatus === 'stopped') return { assistantTexts: lastTexts, jsonAttachments: lastAttachments, rawSample: lastSample, statusHistory, pollCount, retries404 };
    if (agentStatus === 'error' || agentStatus === 'failed') throw new Error(`agent_status=${agentStatus}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`polling timeout`);
}

// ── 단일 실행 ──
interface RunResult {
  caseName: string;
  runIdx: number;
  agentProfile: string;
  taskId?: string;
  elapsedMs: number;
  agentStatusHistory: string[];
  parseOk: boolean;
  parseError?: string;
  insightCount: number;
  discoveredCount: number;
  expectInsights: number;
  insightCoverage: number;
  rawSample?: string;
  contentLength: number;
  apiError?: string;
  pollCount?: number;
  retries404?: number;
  assistantMessageCount?: number;
  jsonAttachmentCount?: number;
  usedSource?: 'inline' | 'attachment' | 'fallback';
  usedMessageIdx?: number;
}

async function runOne(tc: TestCase, runIdx: number): Promise<RunResult> {
  const start = Date.now();
  const result: RunResult = {
    caseName: tc.name,
    runIdx,
    agentProfile: tc.agentProfile,
    elapsedMs: 0,
    agentStatusHistory: [],
    parseOk: false,
    insightCount: 0,
    discoveredCount: 0,
    expectInsights: tc.expectInsights,
    insightCoverage: 0,
    contentLength: 0,
  };
  try {
    const prompt = tc.buildPrompt();
    result.taskId = await createTask(prompt, tc.agentProfile);
    const { assistantTexts, jsonAttachments, rawSample, statusHistory, pollCount, retries404 } = await pollUntilDone(result.taskId);
    result.agentStatusHistory = statusHistory;
    result.rawSample = rawSample;
    result.pollCount = pollCount;
    result.retries404 = retries404;
    result.assistantMessageCount = assistantTexts.length;
    result.jsonAttachmentCount = jsonAttachments.length;
    result.contentLength = assistantTexts.reduce((s, t) => s + t.length, 0);

    // 1차: 인라인 메시지 파싱
    const inlineParsed = parseManusMessages(assistantTexts);
    if (inlineParsed.parseOk && inlineParsed.insights.length > 0) {
      result.parseOk = true;
      result.insightCount = inlineParsed.insights.length;
      result.discoveredCount = inlineParsed.discovered.length;
      result.usedSource = 'inline';
      result.usedMessageIdx = inlineParsed.usedMessageIdx;
    } else if (jsonAttachments.length > 0) {
      // 2차: 첨부 파일 다운로드 후 파싱
      let lastErr = '';
      for (const att of jsonAttachments) {
        try {
          const fileText = await fetchAttachmentText(att.url);
          const fileParsed = tryParseJsonObject(fileText);
          if (fileParsed.parseOk && fileParsed.insights.length > 0) {
            result.parseOk = true;
            result.insightCount = fileParsed.insights.length;
            result.discoveredCount = fileParsed.discovered.length;
            result.usedSource = 'attachment';
            break;
          }
          lastErr = fileParsed.parseError || 'attachment had no insights';
        } catch (e: any) {
          lastErr = e.message || String(e);
        }
      }
      if (!result.parseOk) result.parseError = `attachment failed: ${lastErr}`;
    } else {
      // 3차: fallback (인라인 + 첨부 모두 실패)
      result.parseOk = inlineParsed.parseOk;
      result.parseError = inlineParsed.parseError || 'no inline JSON, no attachments';
      result.insightCount = inlineParsed.insights.length;
      result.discoveredCount = inlineParsed.discovered.length;
      result.usedSource = 'fallback';
      result.usedMessageIdx = inlineParsed.usedMessageIdx;
    }
    result.insightCoverage = tc.expectInsights > 0 ? result.insightCount / tc.expectInsights : 0;
  } catch (err: any) {
    result.apiError = err?.message || String(err);
  }
  result.elapsedMs = Date.now() - start;
  return result;
}

// ── 동시 실행 풀 ──
async function runPool(tasks: (() => Promise<RunResult>)[], concurrency: number): Promise<RunResult[]> {
  const results: RunResult[] = [];
  let idx = 0;
  let completed = 0;
  const total = tasks.length;
  async function worker() {
    while (idx < tasks.length) {
      const my = idx++;
      const r = await tasks[my]();
      completed++;
      const tag = r.parseOk ? '✅' : r.apiError ? '🔴' : '⚠️';
      const sourceTag = r.usedSource ? `[${r.usedSource}]` : '';
      const msgInfo = r.assistantMessageCount ? ` · ${r.assistantMessageCount}msgs+${r.jsonAttachmentCount || 0}files` : '';
      const retryInfo = r.retries404 ? ` · 404retry×${r.retries404}` : '';
      console.log(`[${completed}/${total}] ${tag}${sourceTag} ${r.caseName} #${r.runIdx} — ${(r.elapsedMs / 1000).toFixed(1)}s · insights ${r.insightCount}/${r.expectInsights} · discovered ${r.discoveredCount}${msgInfo}${retryInfo}${r.apiError ? ' · ' + r.apiError.slice(0, 60) : ''}${r.parseError ? ' · parse:' + r.parseError.slice(0, 60) : ''}`);
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ── 메인 ──
async function main() {
  const totalRuns = parseInt(process.argv[2] || '12', 10);
  const concurrency = parseInt(process.argv[3] || '3', 10);

  console.log(`🧪 Manus 검증 스위트 시작 — ${totalRuns}회 실행, 동시 ${concurrency}개`);
  console.log(`테스트 케이스: ${TEST_CASES.map((t) => t.name).join(', ')}`);
  console.log('');

  const tasks: (() => Promise<RunResult>)[] = [];
  for (let i = 0; i < totalRuns; i++) {
    const tc = TEST_CASES[i % TEST_CASES.length];
    tasks.push(() => runOne(tc, Math.floor(i / TEST_CASES.length) + 1));
  }

  const start = Date.now();
  const results = await runPool(tasks, concurrency);
  const totalElapsed = Date.now() - start;

  // 집계
  console.log('\n' + '='.repeat(60));
  console.log('📊 집계 결과');
  console.log('='.repeat(60));
  console.log(`전체: ${results.length}회 · ${(totalElapsed / 1000).toFixed(1)}s`);
  const apiErrors = results.filter((r) => r.apiError);
  const parseFailed = results.filter((r) => !r.apiError && !r.parseOk);
  const parseSuccess = results.filter((r) => r.parseOk);
  console.log(`✅ 파싱 성공: ${parseSuccess.length} (${((parseSuccess.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`⚠️  파싱 실패: ${parseFailed.length}`);
  console.log(`🔴 API 오류: ${apiErrors.length}`);

  // 케이스별
  console.log('\n케이스별:');
  for (const tc of TEST_CASES) {
    const rs = results.filter((r) => r.caseName === tc.name);
    if (rs.length === 0) continue;
    const ok = rs.filter((r) => r.parseOk);
    const avgTime = rs.reduce((s, r) => s + r.elapsedMs, 0) / rs.length / 1000;
    const avgCoverage = ok.reduce((s, r) => s + r.insightCoverage, 0) / Math.max(ok.length, 1);
    console.log(`  ${tc.name}: ${ok.length}/${rs.length} 성공 · 평균 ${avgTime.toFixed(1)}s · 인사이트 커버리지 ${(avgCoverage * 100).toFixed(0)}%`);
  }

  // 실패 샘플
  if (parseFailed.length > 0) {
    console.log('\n❌ 파싱 실패 샘플 (최대 3개):');
    for (const r of parseFailed.slice(0, 3)) {
      console.log(`  - ${r.caseName}#${r.runIdx}: ${r.parseError}`);
      console.log(`    raw 샘플: ${(r.rawSample || '').slice(0, 200)}...`);
    }
  }
  if (apiErrors.length > 0) {
    console.log('\n🔴 API 오류 샘플:');
    for (const r of apiErrors.slice(0, 3)) {
      console.log(`  - ${r.caseName}#${r.runIdx}: ${r.apiError}`);
    }
  }

  // JSON 리포트 저장
  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(process.cwd(), `manus-validation-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    runs: results.length,
    totalElapsedMs: totalElapsed,
    parseSuccessRate: parseSuccess.length / results.length,
    apiErrorRate: apiErrors.length / results.length,
    results,
  }, null, 2));
  console.log(`\n📄 상세 리포트: ${reportPath}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
