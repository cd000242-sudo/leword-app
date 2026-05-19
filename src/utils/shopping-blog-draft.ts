/**
 * v2.43.56 (Phase 1, 100점화): 쇼핑 커넥트 블로그 초안 생성기
 *
 * 9팀 비평 반영:
 *   "도입부 1문장 + 비교표만으론 글이 안 써진다. 블로거가 원하는 건
 *    '상품 후기 본문 3~5문단'인데 LEWORD는 입구만 깔고 빠진다."
 *
 * 동작:
 *   1. 선택된 상품 2~5개 + 키워드 + insight 받음
 *   2. Manus 1순위 (메모리 룰), 키 없으면 Claude fallback (callAI auto)
 *   3. 4문단 마크다운 초안 생성 (도입 / 비교 / 추천 / 마무리)
 *   4. UI 모달에 표시 + 복사 버튼
 *
 * 비동기 패턴 (manus-enricher 와 동일):
 *   - startBlogDraft → requestId 즉시 반환
 *   - getBlogDraftStatus(requestId) 폴링
 */

import { randomUUID } from 'crypto';
import { EnvironmentManager } from './environment-manager';
import { callAI, RuleFallbackRequired } from './pro-hunter-v12/ai-client';

const MANUS_API_BASE = 'https://api.manus.ai/v2';
const MANUS_AGENT_PROFILE = 'manus-1.6';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;  // 8분 (블로그 초안은 인사이트보다 짧음)
const TASK_RETENTION_MS = 30 * 60 * 1000;

export interface BlogDraftProductInput {
    title: string;
    price: number;
    mallName: string;
    brand?: string;
    category?: string;
}

export interface BlogDraftPayload {
    keyword: string;
    products: BlogDraftProductInput[];      // 선택된 상품 2~5개
    intentLabel?: string;                    // "🛒 구매성" 등
    priceMedian?: number;
    competeVerdict?: string;                 // "진입 쉬움" 등
    summary?: string;                        // insight.summary
}

export type BlogDraftStatus = 'pending' | 'running' | 'completed' | 'error';

export interface BlogDraftTaskState {
    status: BlogDraftStatus;
    startedAt: number;
    finishedAt?: number;
    elapsedMs?: number;
    provider?: 'manus' | 'claude' | 'rule';
    draft?: string;
    error?: string;
}

const taskRegistry = new Map<string, BlogDraftTaskState>();

function pruneOldTasks(): void {
    const now = Date.now();
    for (const [id, t] of taskRegistry.entries()) {
        if (t.finishedAt && now - t.finishedAt > TASK_RETENTION_MS) {
            taskRegistry.delete(id);
        }
    }
}

function getManusKey(): string | null {
    try {
        const env = EnvironmentManager.getInstance().getConfig();
        const key = ((env as any).manusApiKey || process.env['MANUS_API_KEY'] || '').trim();
        return key || null;
    } catch {
        return null;
    }
}

function buildPrompt(p: BlogDraftPayload): string {
    const productLines = p.products
        .map((it, i) => `${i + 1}. ${it.title} — ${it.price.toLocaleString()}원 (${it.mallName}${it.brand ? `, ${it.brand}` : ''})`)
        .join('\n');
    return `당신은 한국 네이버 블로그 어필리에이트 콘텐츠 전문가다.

【키워드】 ${p.keyword}
【검색 의도】 ${p.intentLabel || '구매성'}
${p.priceMedian ? `【가격 중간값】 ${p.priceMedian.toLocaleString()}원\n` : ''}${p.competeVerdict ? `【경쟁도】 ${p.competeVerdict}\n` : ''}${p.summary ? `【인사이트】 ${p.summary}\n` : ''}
【추천 상품 ${p.products.length}개】
${productLines}

위 정보를 바탕으로 한국 블로거가 그대로 복사해서 쓸 수 있는 어필리에이트 블로그 본문 초안을 작성하라.

요구사항:
- 마크다운 형식
- 4문단 구조: ## 도입 / ## 비교 / ## 추천 / ## 마무리
- 각 문단 3~6줄
- 자연스러운 한국어 (광고티 최소화, 후기 톤)
- 상품 비교 시 가격·판매처·특징 명시
- 마무리에 CTA (구매 유도) 한 줄
- 광고 표기 문장 1줄 (마무리 끝에 "이 글은 쿠팡 파트너스 활동으로 일정액의 수수료를 제공받을 수 있습니다")

본문만 출력 (설명·주석 금지).`;
}

async function callManusBlog(apiKey: string, prompt: string): Promise<string> {
    // task.create
    const createResp = await fetch(`${MANUS_API_BASE}/task.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manus-api-key': apiKey },
        body: JSON.stringify({
            message: { content: [{ type: 'text', text: prompt }] },
            agent_profile: MANUS_AGENT_PROFILE,
        }),
    });
    if (!createResp.ok) {
        const txt = await createResp.text().catch(() => '');
        throw new Error(`Manus task.create ${createResp.status}: ${txt.slice(0, 200)}`);
    }
    const created: any = await createResp.json();
    const taskId = String(created?.task_id || created?.taskId || created?.id || '');
    if (!taskId) throw new Error('Manus task.create: no task_id in response');

    // poll
    const startedAt = Date.now();
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const url = `${MANUS_API_BASE}/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=20`;
        const resp = await fetch(url, { headers: { 'x-manus-api-key': apiKey } });
        if (!resp.ok) continue;
        const data: any = await resp.json();
        const status = String(data?.agent_status || data?.status || '').toLowerCase();
        if (status === 'completed' || status === 'finished') {
            // 가장 긴 텍스트 메시지를 본문으로 간주
            const messages: any[] = Array.isArray(data?.messages) ? data.messages : [];
            let best = '';
            for (const m of messages) {
                const contents: any[] = Array.isArray(m?.content) ? m.content : [];
                for (const c of contents) {
                    const text = String(c?.text || c?.content || '');
                    if (text.length > best.length) best = text;
                }
            }
            if (best.trim()) return best.trim();
            throw new Error('Manus 응답에서 본문 추출 실패');
        }
        if (status === 'failed' || status === 'error') {
            throw new Error(`Manus task ${status}`);
        }
    }
    throw new Error(`Manus task timeout ${POLL_TIMEOUT_MS}ms`);
}

async function runDraft(requestId: string, p: BlogDraftPayload): Promise<void> {
    const state = taskRegistry.get(requestId);
    if (!state) return;
    state.status = 'running';

    const prompt = buildPrompt(p);
    const manusKey = getManusKey();

    try {
        if (manusKey) {
            // 1순위: Manus
            const draft = await callManusBlog(manusKey, prompt);
            state.provider = 'manus';
            state.draft = draft;
        } else {
            // 폴백: Claude (callAI auto 모드)
            const { text, source } = await callAI(prompt, {
                maxTokens: 2048,
                temperature: 0.8,
            });
            state.provider = source === 'claude' ? 'claude' : 'rule';
            state.draft = text;
        }
        state.status = 'completed';
    } catch (e: any) {
        if (e instanceof RuleFallbackRequired) {
            state.error = `AI 키 미설정 — 환경설정에서 Manus 또는 Anthropic 키 등록 필요`;
        } else {
            state.error = e?.message || '본문 초안 생성 실패';
        }
        state.status = 'error';
    } finally {
        state.finishedAt = Date.now();
        state.elapsedMs = state.finishedAt - state.startedAt;
    }
}

/**
 * 블로그 초안 생성 시작 — requestId 즉시 반환
 */
export function startBlogDraft(payload: BlogDraftPayload): { requestId: string; immediate?: 'invalid_payload' } {
    pruneOldTasks();

    // 입력 검증
    if (!payload?.keyword?.trim() || !Array.isArray(payload.products) || payload.products.length === 0) {
        const requestId = randomUUID();
        taskRegistry.set(requestId, {
            status: 'error',
            startedAt: Date.now(),
            finishedAt: Date.now(),
            elapsedMs: 0,
            error: '키워드와 상품 1개 이상이 필요합니다',
        });
        return { requestId, immediate: 'invalid_payload' };
    }

    // 상품 5개로 제한
    const trimmed: BlogDraftPayload = {
        ...payload,
        products: payload.products.slice(0, 5),
    };

    const requestId = randomUUID();
    taskRegistry.set(requestId, {
        status: 'pending',
        startedAt: Date.now(),
    });

    // 비동기 실행 (await 안 함)
    void runDraft(requestId, trimmed);

    return { requestId };
}

export function getBlogDraftStatus(requestId: string): BlogDraftTaskState | null {
    return taskRegistry.get(requestId) || null;
}
