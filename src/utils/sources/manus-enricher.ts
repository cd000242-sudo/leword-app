/**
 * Manus AI 보강 모듈 — PRO 트래픽 헌터 비동기 후처리
 *
 * 책임:
 * - 비동기 task 시작 (즉시 requestId 반환) + 상태 폴링
 * - 기존 top 30 키워드에 trendScore·angle·riskFlags 부착 + 안정 재정렬
 * - Manus가 새로 발견한 키워드를 Naver 실측 + 기존 SSS 게이트로 검증해 추가
 * - MDP/SSS 점수·등급은 절대 변경하지 않음 (기존 파이프라인 100% 보존)
 *
 * 비동기 이원화 — 사용자가 4~15분 멈춰있지 않게:
 *   PRO 결과 즉시 반환 → 별도 IPC로 startEnrichment → UI 5초 폴링
 */

import { randomUUID } from 'crypto';
import { EnvironmentManager } from '../environment-manager';
import {
  fetchKeywordDataParallel,
  analyzeKeyword,
  ProTrafficKeyword,
} from '../pro-traffic-keyword-hunter';
import { callAI } from '../pro-hunter-v12/ai-client';

const MANUS_API_BASE = 'https://api.manus.ai/v1';
const MANUS_AGENT_PROFILE = 'manus-1.6';
const MAX_TOP_N = 30;
const MAX_DISCOVERED = 20;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MIN_MS = 5000;
const POLL_INTERVAL_MAX_MS = 30_000;
const POLL_INTERVAL_GROWTH = 1.5;
const CACHE_TTL_MS = 60 * 60 * 1000;
const TASK_RETENTION_MS = 30 * 60 * 1000; // 완료된 task는 30분 보관 후 자동 청소

export interface ManusInsight {
  trendScore: number;
  riskFlags: string[];
  angle: string;
}

interface CacheEntry {
  insight: ManusInsight;
  timestamp: number;
}

const insightCache = new Map<string, CacheEntry>();

function cacheKey(keyword: string, category?: string): string {
  return `${(category || 'all').toLowerCase()}::${keyword.toLowerCase()}`;
}

function getCachedInsight(keyword: string, category?: string): ManusInsight | null {
  const e = insightCache.get(cacheKey(keyword, category));
  if (!e) return null;
  if (Date.now() - e.timestamp > CACHE_TTL_MS) {
    insightCache.delete(cacheKey(keyword, category));
    return null;
  }
  return e.insight;
}

function setCachedInsight(keyword: string, insight: ManusInsight, category?: string): void {
  insightCache.set(cacheKey(keyword, category), { insight, timestamp: Date.now() });
}

function getApiKey(): string | null {
  try {
    const env = EnvironmentManager.getInstance().getConfig();
    const key = (env.manusApiKey || process.env['MANUS_API_KEY'] || '').trim();
    return key || null;
  } catch {
    return null;
  }
}

function getNaverEnv() {
  const env = EnvironmentManager.getInstance().getConfig();
  return {
    naverClientId: env.naverClientId,
    naverClientSecret: env.naverClientSecret,
    naverSearchAdAccessLicense: env.naverSearchAdAccessLicense,
    naverSearchAdSecretKey: env.naverSearchAdSecretKey,
    naverSearchAdCustomerId: env.naverSearchAdCustomerId,
  };
}

// ────────────────────────────────────────────────────────────────────
// 프롬프트 — 인사이트 + 신규 발굴 동시 요청
// ────────────────────────────────────────────────────────────────────

function buildPrompt(keywords: string[], category?: string): string {
  return `당신은 한국 네이버 블로그 SEO 전문가다.
카테고리: ${category || '전체'}

【1단계】 다음 ${keywords.length}개 기존 후보의 인사이트 분석:
${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

각 키워드의 최근 7일 트렌드(네이버 데이터랩·구글 트렌드·뉴스·커뮤니티 종합),
트래픽 폭발 가능성, 위험 신호, 추천 콘텐츠 앵글을 분석하라.

【2단계】 위 키워드들과 같은 카테고리에서, 네가 직접 조사해 발견한 SSS급 신규 후보 키워드 10~20개:
- 검색량 1000+ 예상되며 문서 5000개 이하로 경쟁 약함
- 위 후보 목록에 없는 신선한 키워드
- 한국 네이버 블로그에서 실제 검색되는 자연스러운 한국어

응답 형식 (JSON 객체로만, 코드블록·설명 텍스트 절대 금지):

{
  "insights": [
    {
      "keyword": "원본 키워드 (1단계 목록에서 그대로)",
      "trendScore": 1-10 정수 (10=폭발 임박),
      "riskFlags": ["copyright"|"medical"|"financial"|"political"|"adult"] 중 해당,
      "angle": "추천 콘텐츠 각도 1줄 (한국어, 60자 이내)"
    }
  ],
  "discovered": [
    {
      "keyword": "신규 한국어 키워드",
      "reason": "왜 SSS급으로 보이는지 1줄"
    }
  ]
}`;
}

// ────────────────────────────────────────────────────────────────────
// Manus API 호출 (v1)
// ────────────────────────────────────────────────────────────────────

async function createTask(apiKey: string, prompt: string): Promise<string> {
  const resp = await fetch(`${MANUS_API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API_KEY': apiKey,
    },
    body: JSON.stringify({ prompt, agentProfile: MANUS_AGENT_PROFILE }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Manus POST /v1/tasks ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const taskId = data?.task_id || data?.taskId || data?.id || data?.data?.task_id;
  if (!taskId) {
    throw new Error(`Manus POST /v1/tasks: no task_id: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return String(taskId);
}

// 재귀적으로 객체 트리에서 의미 있는 텍스트 페이로드를 모두 추출
//  - string/number → 텍스트로 취급
//  - array → 모든 요소 재귀
//  - object → 알려진 텍스트 필드(content/text/message/output/body/answer/value) 우선,
//             또는 아예 모든 키를 재귀 (Anthropic-style content blocks 등 미지의 스키마 대응)
function collectTexts(node: any, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || node == null) return out; // 무한 재귀 방지
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
    // 텍스트일 가능성 높은 필드 우선
    const textKeys = ['content', 'text', 'message', 'output', 'body', 'answer', 'value', 'response'];
    for (const k of textKeys) {
      if (k in node) collectTexts(node[k], depth + 1, out);
    }
    // 메시지 리스트류
    const arrKeys = ['messages', 'outputs', 'events', 'assistant_messages', 'blocks', 'data', 'result'];
    for (const k of arrKeys) {
      if (k in node && !textKeys.includes(k)) collectTexts(node[k], depth + 1, out);
    }
  }
  return out;
}

function extractAssistantContent(data: any): string {
  const texts = collectTexts(data);
  if (texts.length === 0) return '';
  // 가장 긴 텍스트 = 최종 어시스턴트 응답일 가능성 높음
  return texts.reduce((a, b) => (b.length > a.length ? b : a), '');
}

// 디버그 정보까지 함께 반환 (0/0 응답 시 원본 분석용)
async function pollTaskWithDebug(
  apiKey: string,
  taskId: string,
  onProgress?: (elapsedMs: number, status: string) => void
): Promise<{ content: string; rawSample: string; rawKeys: string[] }> {
  const start = Date.now();
  let interval = POLL_INTERVAL_MIN_MS;
  let lastContent = '';
  let lastData: any = null;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const url = `${MANUS_API_BASE}/tasks/${encodeURIComponent(taskId)}`;
    const resp = await fetch(url, { headers: { 'API_KEY': apiKey } });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Manus GET /v1/tasks/${taskId} ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const data: any = await resp.json();
    lastData = data;

    const status = String(
      data?.status || data?.task_status || data?.data?.status || ''
    ).toLowerCase();

    const content = extractAssistantContent(data);
    if (content) lastContent = content;

    if (onProgress) onProgress(Date.now() - start, status);

    if (status === 'completed' || status === 'done' || status === 'finished' || status === 'success') {
      return {
        content: lastContent,
        rawSample: JSON.stringify(data).slice(0, 800),
        rawKeys: Object.keys(data || {}),
      };
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
      throw new Error(`Manus task ${status}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * POLL_INTERVAL_GROWTH), POLL_INTERVAL_MAX_MS);
  }
  throw new Error(`Manus task ${taskId} polling timeout (${POLL_TIMEOUT_MS / 60000}min) — last keys: ${JSON.stringify(Object.keys(lastData || {}))}`);
}

async function pollTask(
  apiKey: string,
  taskId: string,
  onProgress?: (elapsedMs: number, status: string) => void
): Promise<string> {
  const start = Date.now();
  let interval = POLL_INTERVAL_MIN_MS;
  let lastContent = '';

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const url = `${MANUS_API_BASE}/tasks/${encodeURIComponent(taskId)}`;
    const resp = await fetch(url, { headers: { 'API_KEY': apiKey } });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Manus GET /v1/tasks/${taskId} ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const data: any = await resp.json();

    const status = String(
      data?.status || data?.task_status || data?.data?.status || ''
    ).toLowerCase();

    const content = extractAssistantContent(data);
    if (content) lastContent = content;

    if (onProgress) onProgress(Date.now() - start, status);

    if (status === 'completed' || status === 'done' || status === 'finished' || status === 'success') {
      return lastContent;
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
      throw new Error(`Manus task ${status}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * POLL_INTERVAL_GROWTH), POLL_INTERVAL_MAX_MS);
  }
  throw new Error(`Manus task ${taskId} polling timeout (${POLL_TIMEOUT_MS / 60000}min)`);
}

// ────────────────────────────────────────────────────────────────────
// 응답 파싱
// ────────────────────────────────────────────────────────────────────

interface ParsedManusResponse {
  insights: Map<string, ManusInsight>;
  discoveredRaw: { keyword: string; reason: string }[];
}

function parseManusResponse(rawContent: string, requestedKeywords: string[]): ParsedManusResponse {
  const result: ParsedManusResponse = { insights: new Map(), discoveredRaw: [] };
  if (!rawContent) return result;

  let jsonText = rawContent.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();

  // 객체 추출 ({ ... })
  const startIdx = jsonText.indexOf('{');
  const endIdx = jsonText.lastIndexOf('}');
  if (startIdx >= 0 && endIdx > startIdx) {
    jsonText = jsonText.slice(startIdx, endIdx + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error('[MANUS] JSON 파싱 실패:', String(e), '원본 일부:', rawContent.slice(0, 300));
    return result;
  }

  const normalizedRequested = new Map<string, string>();
  for (const kw of requestedKeywords) {
    normalizedRequested.set(kw.toLowerCase().replace(/\s+/g, ''), kw);
  }

  // insights
  const insightsArr = Array.isArray(parsed?.insights) ? parsed.insights : [];
  for (const item of insightsArr) {
    if (!item || typeof item !== 'object') continue;
    const rawKw = String(item.keyword || '').trim();
    if (!rawKw) continue;

    let matchedKw: string | null = requestedKeywords.includes(rawKw) ? rawKw : null;
    if (!matchedKw) {
      const norm = rawKw.toLowerCase().replace(/\s+/g, '');
      matchedKw = normalizedRequested.get(norm) || null;
    }
    if (!matchedKw) continue;

    const trendScore = Number(item.trendScore);
    const riskFlags = Array.isArray(item.riskFlags) ? item.riskFlags.map(String).slice(0, 5) : [];
    const angle = String(item.angle || '').trim();

    result.insights.set(matchedKw, {
      trendScore: Number.isFinite(trendScore) ? Math.max(1, Math.min(10, Math.round(trendScore))) : 5,
      riskFlags,
      angle: angle || '컨텍스트 정보 없음',
    });
  }

  // discovered
  const discArr = Array.isArray(parsed?.discovered) ? parsed.discovered : [];
  const seen = new Set(requestedKeywords.map(k => k.toLowerCase().replace(/\s+/g, '')));
  for (const item of discArr.slice(0, MAX_DISCOVERED)) {
    if (!item || typeof item !== 'object') continue;
    const kw = String(item.keyword || '').trim();
    if (!kw) continue;
    const norm = kw.toLowerCase().replace(/\s+/g, '');
    if (seen.has(norm)) continue; // 중복 제외
    seen.add(norm);
    result.discoveredRaw.push({
      keyword: kw,
      reason: String(item.reason || '').slice(0, 200),
    });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// 발굴 키워드 검증 — 기존 SSS 게이트 100% 적용
// ────────────────────────────────────────────────────────────────────

async function validateDiscoveredKeywords(
  discovered: { keyword: string; reason: string }[],
  category: string | undefined,
  targetRookie: boolean
): Promise<ProTrafficKeyword[]> {
  if (discovered.length === 0) return [];

  const env = getNaverEnv();
  if (!env.naverClientId || !env.naverSearchAdAccessLicense) {
    console.warn('[MANUS] 발굴 검증 스킵 — Naver API 키 없음');
    return [];
  }

  const keywords = discovered.map(d => d.keyword);
  console.log(`[MANUS] 발굴 검증 시작 — Naver 실측 ${keywords.length}개`);

  // 1. Naver 실측 (검색량 + 문서수) — apiCache에 저장됨
  await fetchKeywordDataParallel(keywords, env, { allowBlogScrapeFallback: true, blogScrapeMaxPerCall: 10 });

  // 2. 각 키워드를 기존 analyzeKeyword 파이프라인으로 분석 (MDP·SSS 게이트 동일 적용)
  const now = new Date();
  const month = now.getMonth() + 1;
  const hour = now.getHours();
  const reasonByKw = new Map(discovered.map(d => [d.keyword, d.reason]));

  const validated: ProTrafficKeyword[] = [];
  for (const kw of keywords) {
    try {
      const analyzed = analyzeKeyword(kw, 'manus-discovered', month, hour, targetRookie);

      // SSS 게이트만 통과시킴 (CLAUDE.md 정의: SSS = 점수 85+ AND 검색량 1000+ AND 문서수 5000↓ AND 비율 5+)
      const sv = typeof analyzed.searchVolume === 'number' ? analyzed.searchVolume : 0;
      const dc = typeof analyzed.documentCount === 'number' ? analyzed.documentCount : Number.POSITIVE_INFINITY;
      const score = typeof analyzed.totalScore === 'number' ? analyzed.totalScore : 0;
      const ratio = typeof analyzed.goldenRatio === 'number' ? analyzed.goldenRatio : 0;

      const isSSS = score >= 85 && sv >= 1000 && dc <= 5000 && ratio >= 5;
      if (!isSSS) continue;

      // discovered 마커 + Manus reason 저장
      (analyzed as any).discoveredByManus = true;
      (analyzed as any).manusDiscoveryReason = reasonByKw.get(kw) || '';
      validated.push(analyzed);
    } catch (err: any) {
      console.warn(`[MANUS] 발굴 키워드 분석 실패: "${kw}" — ${err?.message || err}`);
    }
  }

  console.log(`[MANUS] 발굴 검증 완료 — ${validated.length}/${keywords.length} SSS 게이트 통과`);
  return validated;
}

// ────────────────────────────────────────────────────────────────────
// 비동기 task 레지스트리 + 백그라운드 실행
// ────────────────────────────────────────────────────────────────────

export type EnrichmentStatus = 'pending' | 'running' | 'completed' | 'error';

export interface EnrichmentTaskState<T = any> {
  status: EnrichmentStatus;
  manusTaskId?: string;
  startedAt: number;
  finishedAt?: number;
  elapsedMs: number;
  manusStatus?: string; // Manus 측 raw status
  enriched: T[];
  insightCount: number;
  discoveredKeywords: ProTrafficKeyword[];
  discoveredSuggestedTotal: number; // Manus 추천 총 개수 (SSS 게이트 통과 전)
  error?: string;
  // 디버그: 0/0일 때 사용자에게 보여줄 원본 응답 일부
  rawContentSample?: string;
  rawDataKeys?: string[]; // top-level keys of raw response
}

const taskRegistry = new Map<string, EnrichmentTaskState>();

function pruneOldTasks(): void {
  const now = Date.now();
  for (const [id, t] of taskRegistry) {
    if (t.finishedAt && now - t.finishedAt > TASK_RETENTION_MS) {
      taskRegistry.delete(id);
    }
  }
}

export type EnrichmentProvider = 'manus' | 'claude';

export interface StartEnrichmentOptions {
  category?: string;
  topN?: number;
  targetRookie?: boolean;
  provider?: EnrichmentProvider; // 기본 'manus'
}

export function startEnrichment<T extends { keyword: string; manusInsight?: ManusInsight }>(
  keywords: T[],
  options: StartEnrichmentOptions = {}
): { requestId: string; immediate?: 'no_api_key' | 'empty_input' } {
  pruneOldTasks();

  const requestId = randomUUID();
  const provider: EnrichmentProvider = options.provider || 'manus';
  const now = Date.now();

  // 키 검증 — provider별
  let keyMissing = false;
  let keyMissingMsg = '';
  if (provider === 'manus') {
    if (!getApiKey()) {
      keyMissing = true;
      keyMissingMsg = 'Manus API 키 미설정 — 환경설정에서 Manus 키 입력 필요';
    }
  } else if (provider === 'claude') {
    const env = EnvironmentManager.getInstance().getConfig();
    if (!env.anthropicApiKey) {
      keyMissing = true;
      keyMissingMsg = 'Claude (Anthropic) API 키 미설정 — 환경설정에서 키 입력 필요';
    }
  }

  if (keyMissing) {
    taskRegistry.set(requestId, {
      status: 'error',
      startedAt: now,
      finishedAt: now,
      elapsedMs: 0,
      enriched: [...keywords],
      insightCount: 0,
      discoveredKeywords: [],
      discoveredSuggestedTotal: 0,
      error: keyMissingMsg,
    });
    return { requestId, immediate: 'no_api_key' };
  }

  if (keywords.length === 0) {
    taskRegistry.set(requestId, {
      status: 'completed',
      startedAt: now,
      finishedAt: now,
      elapsedMs: 0,
      enriched: [],
      insightCount: 0,
      discoveredKeywords: [],
      discoveredSuggestedTotal: 0,
    });
    return { requestId, immediate: 'empty_input' };
  }

  taskRegistry.set(requestId, {
    status: 'pending',
    startedAt: now,
    elapsedMs: 0,
    enriched: [...keywords],
    insightCount: 0,
    discoveredKeywords: [],
    discoveredSuggestedTotal: 0,
  });

  // Fire and forget
  runEnrichmentBackground(requestId, keywords, options).catch((err) => {
    const t = taskRegistry.get(requestId);
    if (t) {
      t.status = 'error';
      t.error = err?.message || String(err);
      t.finishedAt = Date.now();
      t.elapsedMs = t.finishedAt - t.startedAt;
    }
    console.error(`[MANUS] [${requestId}] 백그라운드 실행 실패:`, err?.message || err);
  });

  return { requestId };
}

async function runEnrichmentBackground<T extends { keyword: string; manusInsight?: ManusInsight }>(
  requestId: string,
  keywords: T[],
  options: StartEnrichmentOptions
): Promise<void> {
  const task = taskRegistry.get(requestId);
  if (!task) return;
  task.status = 'running';

  const provider: EnrichmentProvider = options.provider || 'manus';
  const topN = Math.min(options.topN || MAX_TOP_N, MAX_TOP_N);
  const targets = keywords.slice(0, topN);
  const tag = `${provider.toUpperCase()}`;

  // 캐시 우선 (provider별 분리)
  const categoryWithProvider = `${provider}:${options.category || 'all'}`;
  const cached = new Map<string, ManusInsight>();
  const uncached: string[] = [];
  for (const k of targets) {
    const c = getCachedInsight(k.keyword, categoryWithProvider);
    if (c) cached.set(k.keyword, c);
    else uncached.push(k.keyword);
  }

  console.log(
    `[${tag}] [${requestId}] enrich 시작 — top ${targets.length}개 (캐시 ${cached.size} / API ${uncached.length}) · 카테고리=${options.category || 'all'}`
  );

  let discoveredRaw: { keyword: string; reason: string }[] = [];

  if (uncached.length > 0) {
    const prompt = buildPrompt(uncached, options.category);
    let content = '';

    if (provider === 'manus') {
      const apiKey = getApiKey()!;
      const manusTaskId = await createTask(apiKey, prompt);
      task.manusTaskId = manusTaskId;
      console.log(`[MANUS] [${requestId}] task 생성: ${manusTaskId} — 폴링 시작`);
      const pollResult = await pollTaskWithDebug(apiKey, manusTaskId, (ms, status) => {
        const t = taskRegistry.get(requestId);
        if (t) {
          t.elapsedMs = ms;
          t.manusStatus = status || undefined;
        }
      });
      content = pollResult.content;
      task.rawContentSample = pollResult.rawSample;
      task.rawDataKeys = pollResult.rawKeys;
      console.log(`[MANUS] [${requestId}] 응답 raw keys=${JSON.stringify(pollResult.rawKeys)}, content 길이=${content.length}`);
    } else {
      // Claude 단발 호출 — Manus 대비 50~100배 저렴, 단 실시간 웹 데이터 X (학습 cutoff 기준 추론)
      console.log(`[CLAUDE] [${requestId}] callAI 호출 — 단발 (5~15초 예상)`);
      const t = taskRegistry.get(requestId);
      if (t) t.manusStatus = 'calling Claude';
      const result = await callAI(prompt, {
        maxTokens: 4096,
        temperature: 0.4, // JSON 안정성 우선
      });
      content = result.text;
      if (t) t.manusStatus = 'parsing';
    }

    const parsed = parseManusResponse(content, uncached);
    for (const [kw, insight] of parsed.insights) {
      cached.set(kw, insight);
      setCachedInsight(kw, insight, categoryWithProvider);
    }
    discoveredRaw = parsed.discoveredRaw;
    console.log(
      `[${tag}] [${requestId}] 응답 수신 — 인사이트 ${parsed.insights.size}/${uncached.length}, 발굴 ${discoveredRaw.length}개`
    );
  }

  // 1. 인사이트 부착 + top 30 내부 안정 재정렬
  const withInsight = keywords.map((k) =>
    cached.has(k.keyword) ? { ...k, manusInsight: cached.get(k.keyword)! } : k
  );
  const head = withInsight.slice(0, topN);
  const tail = withInsight.slice(topN);
  const headWithIdx = head.map((k, i) => ({ k, i }));
  headWithIdx.sort((a, b) => {
    const ta = a.k.manusInsight?.trendScore ?? 0;
    const tb = b.k.manusInsight?.trendScore ?? 0;
    if (tb !== ta) return tb - ta;
    return a.i - b.i;
  });
  const reordered = [...headWithIdx.map((x) => x.k), ...tail];

  // 2. 발굴 키워드 검증 (Naver 실측 + analyzeKeyword + SSS 게이트)
  const validatedDiscovered = await validateDiscoveredKeywords(
    discoveredRaw,
    options.category,
    options.targetRookie !== false
  );

  // 3. 결과 저장
  task.enriched = reordered as any;
  task.insightCount = cached.size;
  task.discoveredKeywords = validatedDiscovered;
  task.discoveredSuggestedTotal = discoveredRaw.length;
  task.status = 'completed';
  task.finishedAt = Date.now();
  task.elapsedMs = task.finishedAt - task.startedAt;

  console.log(
    `[${tag}] [${requestId}] ✅ 완료 — ${task.elapsedMs / 1000}초, 인사이트 ${task.insightCount}, 발굴 ${validatedDiscovered.length}/${discoveredRaw.length} SSS 통과`
  );
}

export function getEnrichmentStatus(requestId: string): EnrichmentTaskState | null {
  pruneOldTasks();
  return taskRegistry.get(requestId) || null;
}

export function clearManusCache(): void {
  insightCache.clear();
}
